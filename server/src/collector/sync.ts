// 采集编排：拉取某个源 → 详情解析 → 分类映射 → 去重合并入库
import { prisma } from "../db.js";
import { refreshSourcePlayDomains } from "../playDomains.js";
import { parsePlay, resolveApiUrls, withFailover, type RawVod, type ListResult } from "./maccms.js";
import { getDriver } from "./drivers/index.js";
import { makeFingerprint } from "./dedupe.js";
import { classifyType } from "./classify.js";
import { downloadImageToLocal, isLocalImageUrl } from "../localImages.js";
import { cleanText } from "../textClean.js";
import { invalidateAggregateCache } from "../aggregateCache.js";

export interface SyncOptions {
  mode?: "full" | "incr";
  maxPages?: number;
  hours?: number;
  typeId?: string | number; // 按分类采集(源内 type_id)
  typeIds?: (string | number)[]; // 按多个分类采集(源内 type_id)
  yearMode?: "" | "eq" | "gt" | "gte" | "lt" | "lte" | "range";
  year?: string | number;
  yearStart?: string | number;
  yearEnd?: string | number;
  autoRun?: boolean;
  metaAfterCollect?: boolean;
  cleanAfterCollect?: boolean;
  detailConcurrency?: number;
  localizeImages?: boolean;
  encryptLocalImages?: boolean;
  resume?: ResumeCursor;    // 断点续采游标
}

// 断点续采游标：已展开的分类列表 + 当前位置 + 累计计数
export interface ResumeCursor {
  typeIds: (string | null)[]; // 已解析(父类已展开)的分类；[null]=全部
  ti: number;   // 当前分类索引
  pg: number;   // 该分类内下一个要处理的页(1-based)
  added: number;
  updated: number;
  merged: number;
}

// 进度回调（供异步任务更新）
export type ProgressCb = (p: {
  pageNow: number;
  pageTotal: number;
  added: number;
  updated: number;
  merged: number;
  cursor?: ResumeCursor; // 当前断点（供持久化）
}) => void | Promise<void>;

function isDirectM3u8(url: string) {
  return /\.m3u8(\?|$)/i.test(url);
}

function parseYear(value: unknown) {
  const m = String(value || "").match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

function yearFilterEnabled(opts: SyncOptions) {
  return ["eq", "gt", "gte", "lt", "lte", "range"].includes(String(opts.yearMode || ""));
}

function matchYearFilter(year: unknown, opts: SyncOptions) {
  if (!yearFilterEnabled(opts)) return true;
  const y = parseYear(year);
  if (!y) return false;
  const mode = String(opts.yearMode || "");
  const target = parseYear(opts.year);
  const rangeStart = parseYear(opts.yearStart);
  const rangeEnd = parseYear(opts.yearEnd);
  if (mode === "eq") return target ? y === target : false;
  if (mode === "gt") return target ? y > target : false;
  if (mode === "gte") return target ? y >= target : false;
  if (mode === "lt") return target ? y < target : false;
  if (mode === "lte") return target ? y <= target : false;
  if (mode === "range") {
    const lo = rangeStart ?? 1900;
    const hi = rangeEnd ?? new Date().getFullYear() + 1;
    return y >= Math.min(lo, hi) && y <= Math.max(lo, hi);
  }
  return true;
}

function filterByYear<T extends RawVod>(rows: T[], opts: SyncOptions) {
  return yearFilterEnabled(opts) ? rows.filter((r) => matchYearFilter(r.vod_year, opts)) : rows;
}

function normalizeTypeIds(opts: SyncOptions) {
  const raw = Array.isArray(opts.typeIds) ? opts.typeIds : (opts.typeId ? [opts.typeId] : []);
  return [...new Set(raw.map((x) => String(x || "").trim()).filter(Boolean))];
}

function clampDetailConcurrency(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.floor(n)));
}

const IMG_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";
// 图片可达性检测：能拉到且是图片/有实体内容才算 ok（带浏览器 UA + Referer 绕过部分防盗链）
async function imageOk(url: string, timeoutMs = 8000): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  let origin = "";
  try { origin = new URL(url).origin; } catch {}
  const headers = { "User-Agent": IMG_UA, Referer: origin, Accept: "image/*,*/*" };
  async function probe(method: "HEAD" | "GET", range = false) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        signal: ctrl.signal,
        headers: range ? { ...headers, Range: "bytes=0-1023" } : headers,
      });
      return res;
    } finally {
      clearTimeout(t);
    }
  }
  function validByHeaders(res: Response) {
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.startsWith("image/")) return true;
    if (ct.includes("text/html") || ct.includes("json")) return false; // 防盗链占位页
    return null;
  }
  try {
    let res = await probe("HEAD");
    let ok = validByHeaders(res);
    if (ok !== null) return ok;

    res = await probe("GET", true);
    ok = validByHeaders(res);
    if (ok !== null) return ok;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 128;
  } catch {
    return false;
  }
}

// 补全小类：遍历缺 subType 的影片，按源分终批量 ac=detail 拉 type_name 回填（救回被回填抹掉的小类）
export async function backfillSubTypes(
  opts: { limit?: number } = {},
  onProgress?: (p: { done: number; totalUnits: number; filled: number }) => void | Promise<void>
) {
  const limit = opts.limit || 100000;
  // 取缺小类的影片及其任一源线路
  const vods = await prisma.vod.findMany({
    where: { subType: "" },
    take: limit,
    include: { plays: { include: { source: true }, take: 1 } },
  });
  // 按源分组：sourceId -> [{vodId, sourceVodId}]
  const bySource = new Map<number, { apiUrl: string; driver: string; name: string; items: { vodId: number; svid: string }[] }>();
  for (const v of vods) {
    const p = v.plays[0];
    if (!p) continue;
    if (!bySource.has(p.sourceId)) bySource.set(p.sourceId, { apiUrl: p.source.apiUrl, driver: p.source.driver, name: p.source.name, items: [] });
    bySource.get(p.sourceId)!.items.push({ vodId: v.id, svid: p.sourceVodId });
  }
  let filled = 0, done = 0;
  const totalUnits = vods.length;
  for (const [, grp] of bySource) {
    for (let i = 0; i < grp.items.length; i += 20) {
      const batch = grp.items.slice(i, i + 20);
      try {
        const details = await getDriver(grp.driver).fetchDetail(grp.apiUrl, batch.map((b) => b.svid));
        const byId = new Map(details.map((d) => [String(d.vod_id), d]));
        for (const b of batch) {
          const raw = byId.get(b.svid);
          const st = cleanText(raw?.type_name);
          if (st) {
            await prisma.vod.update({ where: { id: b.vodId }, data: { subType: st } });
            filled++;
          }
        }
      } catch { /* 该批失败跳过 */ }
      done += batch.length;
      if (onProgress) await onProgress({ done, totalUnits, filled });
    }
  }
  return { scanned: totalUnits, filled };
}

// 单片采集更新：按每条线路的源+sourceVodId 重拉详情，刷新剧集/状态（不走全量同步）
export async function refreshVod(vodId: number) {
  const vod = await prisma.vod.findUnique({
    where: { id: vodId },
    include: { plays: { include: { source: true } } },
  });
  if (!vod) throw new Error("vod not found");
  const results: { source: string; ok: boolean; before?: number; after?: number; msg?: string }[] = [];
  let updated = 0;
  let latestRemarks = "";
  const sourcePics: string[] = []; // 各源最新封面候选
  let latestSubType = "";
  let contentChanged = false;
  for (const p of vod.plays) {
    try {
      const details = await getDriver(p.source.driver).fetchDetail(p.source.apiUrl, [p.sourceVodId]);
      const raw = details.find((d) => String(d.vod_id) === p.sourceVodId) || details[0];
      if (!raw) { results.push({ source: p.source.name, ok: false, msg: "源无返回" }); continue; }
      if (raw.vod_remarks) latestRemarks = cleanText(raw.vod_remarks);
      if (raw.vod_pic) sourcePics.push(raw.vod_pic);
      if (raw.type_name && !latestSubType) latestSubType = cleanText(raw.type_name);
      const lines = parsePlay(raw);
      const line = lines.find((l) => l.flag === p.flag) || lines[0];
      if (!line || !line.episodes.length) { results.push({ source: p.source.name, ok: false, msg: "无播放地址" }); continue; }
      const before = p.epCount;
      const kind = line.episodes.every((e) => isDirectM3u8(e.url)) ? "hls" : "iframe";
      const nextEpisodes = JSON.stringify(line.episodes);
      const changed = p.episodes !== nextEpisodes || p.epCount !== line.episodes.length || p.playKind !== kind;
      await prisma.play.update({
        where: { id: p.id },
        data: {
          episodes: nextEpisodes,
          epCount: line.episodes.length,
          playKind: kind,
          hasCleanResult: changed ? false : p.hasCleanResult,
          syncedAt: new Date(),
        },
      });
      if (changed) contentChanged = true;
      results.push({ source: p.source.name, ok: true, before, after: line.episodes.length });
      updated++;
    } catch (e: any) {
      results.push({ source: p.source.name, ok: false, msg: e?.message || String(e) });
    }
  }
  // 同步最新“更新状态”(remarks) + 回填小类
  const vodPatch: any = {};
  if (latestRemarks && latestRemarks !== vod.remarks) {
    vodPatch.remarks = latestRemarks;
    contentChanged = true;
  }
  if (latestSubType && latestSubType !== vod.subType) vodPatch.subType = latestSubType;
  if (contentChanged) vodPatch.contentUpdatedAt = new Date();
  if (Object.keys(vodPatch).length) await prisma.vod.update({ where: { id: vodId }, data: vodPatch });

  // 封面修复：当前 pic 打不开则从候选(豆瓣高清图 / 各源最新封面)里挑一张能用的替换
  let picStatus: "kept" | "repaired" | "broken_no_alt" = "kept";
  let picUrl = vod.pic;
  const curOk = await imageOk(vod.pic);
  if (!curOk) {
    const candidates: string[] = [];
    if (vod.officialPic) candidates.push(vod.officialPic); // 豆瓣高清优先
    for (const sp of sourcePics) if (!candidates.includes(sp)) candidates.push(sp);
    let picked = "";
    for (const c of candidates) {
      if (c && c !== vod.pic && (await imageOk(c))) { picked = c; break; }
    }
    if (picked) {
      await prisma.vod.update({ where: { id: vodId }, data: { pic: picked } });
      picStatus = "repaired"; picUrl = picked;
    } else {
      picStatus = "broken_no_alt";
    }
  }

  return { vodId, updated, total: vod.plays.length, remarks: latestRemarks, pic: picStatus, picUrl, lines: results };
}

// 解析分类：查/建 SourceTypeMap，返回映射后的统一分类名（未映射则回退源分类名）
async function resolveCategory(
  cache: Map<string, string>,
  sourceId: number,
  typeId: string,
  typeName: string
): Promise<string> {
  const key = `${sourceId}:${typeId}`;
  if (cache.has(key)) return cache.get(key)!;
  // upsert 映射记录（首次发现该源type则登记，categoryId 留空待人工映射）
  const map = await prisma.sourceTypeMap.upsert({
    where: { sourceId_sourceTypeId: { sourceId, sourceTypeId: typeId } },
    create: { sourceId, sourceTypeId: typeId, sourceTypeName: typeName },
    update: { sourceTypeName: typeName || undefined },
    include: { category: true },
  });
  // 已人工映射→用大类；否则走分类器兵底（保证新采集也是干净大类）
  const name = map.category?.name || classifyType(typeName);
  cache.set(key, name);
  return name;
}

async function upsertVod(
  sourceId: number,
  raw: RawVod,
  catCache: Map<string, string>,
  opts: SyncOptions = {}
) {
  const lines = parsePlay(raw);
  if (!lines.length) return { vodId: 0, added: 0, updated: 0, merged: 0 };

  const fp = makeFingerprint(raw.vod_name, raw.vod_year);
  const typeName = await resolveCategory(
    catCache,
    sourceId,
    String(raw.type_id ?? ""),
    raw.type_name || ""
  );

  const direct = await prisma.vod.findUnique({ where: { fingerprint: fp } });
  const alias = direct ? null : await prisma.vodAlias.findUnique({
    where: { fingerprint: fp },
    include: { vod: true },
  });
  const existing = direct || alias?.vod || null;
  const subType = cleanText(raw.type_name); // 原始小类
  const rawPic = raw.vod_pic || "";
  let localPic = "";
  if (opts.localizeImages && rawPic) {
    try {
      localPic = await downloadImageToLocal(rawPic, { encrypt: opts.encryptLocalImages !== false });
    } catch {
      localPic = "";
    }
  }
  const vodData = {
    name: cleanText(raw.vod_name),
    year: cleanText(raw.vod_year),
    typeName,
    subType,
    pic: rawPic,
    localPic,
    actor: cleanText(raw.vod_actor),
    director: cleanText(raw.vod_director),
    area: cleanText(raw.vod_area),
    lang: cleanText(raw.vod_lang),
    remarks: cleanText(raw.vod_remarks),
    blurb: cleanText(raw.vod_content, 2000),
  };
  let vod;
  let mergedFlag = 0;
  let contentChanged = false;
  const now = new Date();
  if (existing) {
    const nextPic = vodData.pic || (isLocalImageUrl(existing.pic) ? "" : existing.pic);
    const nextLocalPic = vodData.localPic || existing.localPic || (isLocalImageUrl(existing.pic) ? existing.pic : "");
    const vodPatch: any = {};
    if (nextPic !== existing.pic) vodPatch.pic = nextPic;
    if (nextLocalPic !== existing.localPic) vodPatch.localPic = nextLocalPic;
    if (!existing.blurb && vodData.blurb) vodPatch.blurb = vodData.blurb;
    if (vodData.remarks && vodData.remarks !== existing.remarks) {
      vodPatch.remarks = vodData.remarks;
      contentChanged = true;
    }
    const nextTypeName = typeName !== "未分类" ? typeName : existing.typeName;
    if (nextTypeName !== existing.typeName) vodPatch.typeName = nextTypeName;
    if (subType && subType !== existing.subType) vodPatch.subType = subType;
    vod = existing;
    mergedFlag = 1;
    (vod as any).__pendingPatch = vodPatch;
  } else {
    vod = await prisma.vod.create({ data: { fingerprint: fp, ...vodData, contentUpdatedAt: now } });
    contentChanged = true;
  }

  // 存全部 flag 线路（不再只取 lines[0]），同源多通道并存，供探活后择优
  let added = 0, updated = 0;
  for (const line of lines) {
    if (!line.flag) continue; // 无 flag 无法区分多条，跳过异常空标识
    const kind = line.episodes.every((e) => isDirectM3u8(e.url)) ? "hls" : "iframe";
    const key = { sourceId_sourceVodId_flag: { sourceId, sourceVodId: String(raw.vod_id), flag: line.flag } };
    const payload = {
      vodId: vod.id,
      sourceId,
      flag: line.flag,
      sourceVodId: String(raw.vod_id),
      episodes: JSON.stringify(line.episodes),
      epCount: line.episodes.length,
      playKind: kind,
      syncedAt: new Date(),
    };
    const before = await prisma.play.findUnique({ where: key });
    const updatePayload = before && (
      before.episodes !== payload.episodes
      || before.epCount !== payload.epCount
      || before.playKind !== payload.playKind
    )
      ? { ...payload, hasCleanResult: false }
      : payload;
    await prisma.play.upsert({ where: key, create: payload, update: updatePayload });
    if (before) {
      const changed = before.episodes !== payload.episodes
        || before.epCount !== payload.epCount
        || before.playKind !== payload.playKind;
      if (changed) {
        updated++;
        contentChanged = true;
      }
    } else {
      added++;
      contentChanged = true;
    }
  }

  if (existing) {
    const vodPatch = (vod as any).__pendingPatch || {};
    if (contentChanged) vodPatch.contentUpdatedAt = now;
    if (Object.keys(vodPatch).length) {
      vod = await prisma.vod.update({ where: { id: existing.id }, data: vodPatch });
    }
  }

  return { vodId: vod.id, added, updated, merged: existing ? mergedFlag : 0 };
}

// 按片名预览：遍历所有启用源搜索关键词，仅搜索不拉详情不入库。按(标准化片名+年份)指纹分组，
// 返回每个候选命中了哪些源+每源命中数，供前端展示"龙珠GT 3个源 / 龙珠 2个源"这类列表让用户选。
export interface KeywordCandidate {
  fingerprint: string;
  name: string;
  year: string;
  totalHits: number;
  sources: { sourceId: number; sourceName: string; hits: number; vodIds: (string | number)[] }[];
}

export async function previewByKeyword(keyword: string): Promise<{ ok: boolean; keyword: string; candidates: KeywordCandidate[]; searched: { source: string; ok: boolean; error?: string }[] }> {
  const kw = keyword.trim();
  if (!kw) throw new Error("片名不能为空");
  const sources = await prisma.source.findMany({ where: { enabled: true }, orderBy: { priority: "asc" } });
  if (!sources.length) throw new Error("没有已启用的采集源");

  // fingerprint -> 候选聚合
  const byFp = new Map<string, KeywordCandidate>();
  const searched: { source: string; ok: boolean; error?: string }[] = [];

  for (const src of sources) {
    try {
      const list = await getDriver(src.driver).searchByKeyword(src.apiUrl, kw);
      const hitList = list.filter((v) => (v.vod_name || "").includes(kw));
      // 按fingerprint汇总该源内的命中
      const bySrcFp = new Map<string, { hits: number; vodIds: (string|number)[] }>();
      for (const v of hitList) {
        const fp = makeFingerprint(v.vod_name, v.vod_year);
        const cur = bySrcFp.get(fp) || { hits: 0, vodIds: [] };
        cur.hits++; cur.vodIds.push(v.vod_id);
        bySrcFp.set(fp, cur);
        if (!byFp.has(fp)) {
          byFp.set(fp, { fingerprint: fp, name: v.vod_name, year: v.vod_year || "", totalHits: 0, sources: [] });
        }
      }
      for (const [fp, agg] of bySrcFp) {
        const cand = byFp.get(fp)!;
        cand.sources.push({ sourceId: src.id, sourceName: src.name, hits: agg.hits, vodIds: agg.vodIds });
        cand.totalHits += agg.hits;
      }
      searched.push({ source: src.name, ok: true });
    } catch (e: any) {
      searched.push({ source: src.name, ok: false, error: e?.message || String(e) });
    }
  }

  const candidates = [...byFp.values()].sort((a, b) => b.sources.length - a.sources.length || b.totalHits - a.totalHits);
  return { ok: true, keyword: kw, candidates, searched };
}

// 按确认结果采集：仅对用户勾选的 fingerprint 对应的 (sourceId, vodId) 拉详情入库，不再全量扫所有命中结果
export async function collectKeywordCandidates(
  candidates: { sourceId: number; vodIds: (string | number)[] }[],
  opts: SyncOptions = {},
  onProgress?: (p: { sourceNow: number; sourceTotal: number; sourceName: string; added: number; updated: number; merged: number }) => void | Promise<void>
) {
  // 按 sourceId 合并去重 vodIds
  const bySource = new Map<number, Set<string>>();
  for (const c of candidates) {
    if (!bySource.has(c.sourceId)) bySource.set(c.sourceId, new Set());
    const set = bySource.get(c.sourceId)!;
    for (const id of c.vodIds) set.add(String(id));
  }
  const sourceIds = [...bySource.keys()];
  const sources = await prisma.source.findMany({ where: { id: { in: sourceIds } } });
  const srcById = new Map(sources.map((s) => [s.id, s]));

  let added = 0, updated = 0, merged = 0;
  const vodIds = new Set<number>();
  const catCache = new Map<string, string>();
  const perSource: { source: string; ok: boolean; added: number; updated: number; msg?: string }[] = [];

  for (let i = 0; i < sourceIds.length; i++) {
    const sourceId = sourceIds[i];
    const src = srcById.get(sourceId);
    if (!src) continue;
    const ids = [...bySource.get(sourceId)!];
    let sAdded = 0, sUpdated = 0;
    try {
      for (let j = 0; j < ids.length; j += 20) {
        const batch = ids.slice(j, j + 20);
        const details = filterByYear(await getDriver(src.driver).fetchDetail(src.apiUrl, batch), opts);
        for (const raw of details) {
          try {
            const r = await upsertVod(sourceId, raw, catCache, opts);
            added += r.added; updated += r.updated; merged += r.merged;
            if (r.vodId) vodIds.add(r.vodId);
            sAdded += r.added; sUpdated += r.updated;
          } catch {}
        }
      }
      perSource.push({ source: src.name, ok: true, added: sAdded, updated: sUpdated });
    } catch (e: any) {
      perSource.push({ source: src.name, ok: false, added: sAdded, updated: sUpdated, msg: e?.message || String(e) });
    }
    if (sAdded || sUpdated) {
      invalidateAggregateCache();
      await refreshSourcePlayDomains(sourceId).catch(() => {});
    }
    if (onProgress) await onProgress({ sourceNow: i + 1, sourceTotal: sourceIds.length, sourceName: src.name, added, updated, merged });
  }

  return { ok: true, added, updated, merged, vodIds: [...vodIds], perSource };
}

// 按片名采集（旧版一步到位，仍保留给向后兼容/其他调用地方）：遍历所有启用源搜索关键词 → 拉详情 → 入库（复用 upsertVod，不影响现有分页/断点流程）
export async function syncByKeyword(
  keyword: string,
  opts: SyncOptions = {},
  onProgress?: (p: { sourceNow: number; sourceTotal: number; sourceName: string; added: number; updated: number; merged: number; hits: number }) => void | Promise<void>
) {
  const kw = keyword.trim();
  if (!kw) throw new Error("片名不能为空");
  const sources = await prisma.source.findMany({ where: { enabled: true }, orderBy: { priority: "asc" } });
  if (!sources.length) throw new Error("没有已启用的采集源");

  let added = 0, updated = 0, merged = 0, hits = 0;
  const vodIds = new Set<number>();
  const perSource: { source: string; hits: number; added: number; updated: number; ok: boolean; msg?: string }[] = [];
  const catCache = new Map<string, string>();

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    let sAdded = 0, sUpdated = 0, sHits = 0;
    try {
      const list = await getDriver(src.driver).searchByKeyword(src.apiUrl, kw);
      // 名字包含关键词才算命中（部分源 wd 参数只是模糊提示，需二次过滤）
      const hitList = list.filter((v) => (v.vod_name || "").includes(kw));
      sHits = hitList.length;
      hits += sHits;
      if (hitList.length) {
        const ids = hitList.map((v) => v.vod_id);
        for (let j = 0; j < ids.length; j += 20) {
          const batch = ids.slice(j, j + 20);
          const details = filterByYear(await getDriver(src.driver).fetchDetail(src.apiUrl, batch), opts);
          for (const raw of details) {
            try {
              const r = await upsertVod(src.id, raw, catCache, opts);
              added += r.added; updated += r.updated; merged += r.merged;
              if (r.vodId) vodIds.add(r.vodId);
              sAdded += r.added; sUpdated += r.updated;
            } catch {}
          }
        }
      }
      perSource.push({ source: src.name, hits: sHits, added: sAdded, updated: sUpdated, ok: true });
    } catch (e: any) {
      perSource.push({ source: src.name, hits: 0, added: 0, updated: 0, ok: false, msg: e?.message || String(e) });
    }
    if (sAdded || sUpdated) {
      invalidateAggregateCache();
      await refreshSourcePlayDomains(src.id).catch(() => {});
    }
    if (onProgress) await onProgress({ sourceNow: i + 1, sourceTotal: sources.length, sourceName: src.name, added, updated, merged, hits });
  }

  return { ok: true, keyword: kw, hits, added, updated, merged, vodIds: [...vodIds], perSource };
}

export async function syncSource(sourceId: number, opts: SyncOptions = {}, onProgress?: ProgressCb) {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error("source not found");
  const driver = getDriver(source.driver);
  const mode = opts.mode || "incr";
  const hours = mode === "incr" ? opts.hours || source.syncHours || 24 : 0;
  const maxPages = opts.maxPages || (mode === "incr" ? 30 : 100);
  const detailWorkers = clampDetailConcurrency(opts.detailConcurrency);

  const start = Date.now();
  const resume = opts.resume;
  let added = resume?.added || 0, updated = resume?.updated || 0, merged = resume?.merged || 0;
  const vodIds = new Set<number>();
  let ok = true, message = "";
  const catCache = new Map<string, string>();

  // 多API入口failover：按顺序尝试，记录最终生效url（本次采集过程中内存缓存，避免每页都重新探）
  const candidateUrls = resolveApiUrls(source.apiUrl, source.apiUrls);
  let activeUrl = candidateUrls[0];
  async function withApi<T>(fn: (url: string) => Promise<T>): Promise<T> {
    if (candidateUrls.length === 1) return fn(candidateUrls[0]);
    const ordered = [activeUrl, ...candidateUrls.filter((u) => u !== activeUrl)];
    const r = await withFailover(ordered, fn);
    activeUrl = r.usedUrl;
    return r.result;
  }

  async function fetchDetailBatch(batch: (string | number)[], tid: string | null | undefined, pg: number) {
    try {
      return filterByYear(await withApi((u) => driver.fetchDetail(u, batch)), opts);
    } catch (e: any) {
      message += ` [detail err t${tid} p${pg}: ${e?.message}]`;
      return [];
    }
  }

  async function fetchDetailBatches(ids: (string | number)[], tid: string | null | undefined, pg: number) {
    const batches: (string | number)[][] = [];
    for (let j = 0; j < ids.length; j += 20) batches.push(ids.slice(j, j + 20));
    if (detailWorkers <= 1 || batches.length <= 1) {
      const rows: RawVod[] = [];
      for (const batch of batches) rows.push(...await fetchDetailBatch(batch, tid, pg));
      return rows;
    }
    let next = 0;
    const results: RawVod[][] = new Array(batches.length);
    const workerCount = Math.min(detailWorkers, batches.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (true) {
        const idx = next++;
        if (idx >= batches.length) return;
        results[idx] = await fetchDetailBatch(batches[idx], tid, pg);
      }
    }));
    return results.flat();
  }

  const rawTypeIds = normalizeTypeIds(opts);
  try {
    // 分类列表：续采直接用游标里已展开的；首次才去展开父类
    let typeIds: (string | null | undefined)[];
    if (resume?.typeIds) {
      typeIds = resume.typeIds;
    } else {
      typeIds = rawTypeIds.length ? rawTypeIds : [null];
      if (rawTypeIds.length) {
        try {
          const classes = await withApi((u) => driver.fetchClasses(u));
          const expanded: string[] = [];
          const expandedMessages: string[] = [];
          for (const rawTypeId of rawTypeIds) {
            const children = classes.filter((c) => c.typePid === rawTypeId).map((c) => c.typeId);
            if (children.length) {
              expanded.push(...children);
              expandedMessages.push(`${rawTypeId}→${children.length}`);
            } else {
              expanded.push(rawTypeId);
            }
          }
          typeIds = [...new Set(expanded)];
          if (expandedMessages.length) {
            message += ` [展开父类${expandedMessages.join(",")}]`;
          }
        } catch { /* 拉分类失败则按原 typeId 直接采 */ }
      }
    }
    const norm = (t: string | null | undefined) => (t == null ? undefined : t);

    // 预算每类页数（跨子类累加）供进度/断点定位
    const firstResults: ListResult[] = [];
    const perTypePages: number[] = [];
    let pageTotal = 0;
    for (const tid of typeIds) {
      const first = await withApi((u) => driver.fetchList(u, 1, hours, 15000, norm(tid)));
      firstResults.push(first);
      const pages = Math.min(first.pagecount, maxPages);
      perTypePages.push(pages);
      pageTotal += pages;
    }

    // 断点起点
    const startTi = resume?.ti ?? 0;
    const startPg = resume?.pg ?? 1;
    // 已完成页数（续采时进度不回退）
    let pageNow = 0;
    for (let i = 0; i < startTi; i++) pageNow += perTypePages[i];
    pageNow += Math.max(0, startPg - 1);

    for (let i = startTi; i < typeIds.length; i++) {
      const tid = typeIds[i];
      const pages = perTypePages[i];
      const from = i === startTi ? startPg : 1;
      for (let pg = from; pg <= pages; pg++) {
        pageNow++;
        const listRes = pg === 1 ? firstResults[i] : await withApi((u) => driver.fetchList(u, pg, hours, 15000, norm(tid)));
        const ids = listRes.list.map((v) => v.vod_id);
        if (!ids.length) break;
        const details = await fetchDetailBatches(ids, tid, pg);
        for (const raw of details) {
          try {
            const r = await upsertVod(sourceId, raw, catCache, opts);
            added += r.added; updated += r.updated; merged += r.merged;
            if (r.vodId) vodIds.add(r.vodId);
          } catch {}
        }
        // 断点：下一个要处理的位置是 (i, pg+1)
        const cursor: ResumeCursor = {
          typeIds: typeIds.map((t) => (t == null ? null : String(t))),
          ti: i, pg: pg + 1, added, updated, merged,
        };
        if (onProgress) await onProgress({ pageNow, pageTotal, added, updated, merged, cursor });
      }
    }
    message = `pages=${pageTotal} detailConcurrency=${detailWorkers} added=${added} updated=${updated} merged=${merged}` + message;
  } catch (e: any) {
    ok = false;
    message = e?.message || String(e);
  }

  const ms = Date.now() - start;
  await prisma.source.update({
    where: { id: sourceId },
    data: {
      status: ok ? "ok" : "fail",
      lastError: ok ? null : message,
      lastSyncAt: new Date(),
      cursor: ok ? new Date().toISOString() : source.cursor,
      syncCount: { increment: added + updated },
      activeApiUrl: activeUrl || source.activeApiUrl,
    },
  });
  await prisma.syncLog.create({
    data: { sourceId, mode, added, updated, merged, ok, message, ms },
  });
  if (added || updated) {
    invalidateAggregateCache();
    await refreshSourcePlayDomains(sourceId).catch(() => {});
  }

  return { ok, added, updated, merged, vodIds: [...vodIds], ms, message };
}
