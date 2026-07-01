// 采集编排：拉取某个源 → 详情解析 → 分类映射 → 去重合并入库
import { prisma } from "../db.js";
import { fetchList, fetchDetail, parsePlay, fetchClasses, searchByKeyword, type RawVod } from "./maccms.js";
import { makeFingerprint } from "./dedupe.js";
import { classifyType } from "./classify.js";

export interface SyncOptions {
  mode?: "full" | "incr";
  maxPages?: number;
  hours?: number;
  typeId?: string | number; // 按分类采集(源内 type_id)
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

const IMG_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";
// 图片可达性检测：能拉到且是图片/有实体内容才算 ok（带浏览器 UA + Referer 绕过部分防盗链）
async function imageOk(url: string, timeoutMs = 8000): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let origin = "";
    try { origin = new URL(url).origin; } catch {}
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": IMG_UA, Referer: origin, Accept: "image/*,*/*" },
    });
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.startsWith("image/")) return true;
    if (ct.includes("text/html") || ct.includes("json")) return false; // 防盗链占位页
    const buf = await res.arrayBuffer();
    return buf.byteLength > 512;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
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
  const bySource = new Map<number, { apiUrl: string; name: string; items: { vodId: number; svid: string }[] }>();
  for (const v of vods) {
    const p = v.plays[0];
    if (!p) continue;
    if (!bySource.has(p.sourceId)) bySource.set(p.sourceId, { apiUrl: p.source.apiUrl, name: p.source.name, items: [] });
    bySource.get(p.sourceId)!.items.push({ vodId: v.id, svid: p.sourceVodId });
  }
  let filled = 0, done = 0;
  const totalUnits = vods.length;
  for (const [, grp] of bySource) {
    for (let i = 0; i < grp.items.length; i += 20) {
      const batch = grp.items.slice(i, i + 20);
      try {
        const details = await fetchDetail(grp.apiUrl, batch.map((b) => b.svid));
        const byId = new Map(details.map((d) => [String(d.vod_id), d]));
        for (const b of batch) {
          const raw = byId.get(b.svid);
          const st = (raw?.type_name || "").trim();
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
  for (const p of vod.plays) {
    try {
      const details = await fetchDetail(p.source.apiUrl, [p.sourceVodId]);
      const raw = details.find((d) => String(d.vod_id) === p.sourceVodId) || details[0];
      if (!raw) { results.push({ source: p.source.name, ok: false, msg: "源无返回" }); continue; }
      if (raw.vod_remarks) latestRemarks = raw.vod_remarks;
      if (raw.vod_pic) sourcePics.push(raw.vod_pic);
      if (raw.type_name && !latestSubType) latestSubType = raw.type_name.trim();
      const lines = parsePlay(raw);
      const line = lines.find((l) => l.flag === p.flag) || lines[0];
      if (!line || !line.episodes.length) { results.push({ source: p.source.name, ok: false, msg: "无播放地址" }); continue; }
      const before = p.epCount;
      const kind = line.episodes.every((e) => isDirectM3u8(e.url)) ? "hls" : "iframe";
      await prisma.play.update({
        where: { id: p.id },
        data: {
          episodes: JSON.stringify(line.episodes),
          epCount: line.episodes.length,
          playKind: kind,
          syncedAt: new Date(),
        },
      });
      results.push({ source: p.source.name, ok: true, before, after: line.episodes.length });
      updated++;
    } catch (e: any) {
      results.push({ source: p.source.name, ok: false, msg: e?.message || String(e) });
    }
  }
  // 同步最新“更新状态”(remarks) + 回填小类
  const vodPatch: any = {};
  if (latestRemarks && latestRemarks !== vod.remarks) vodPatch.remarks = latestRemarks;
  if (latestSubType && latestSubType !== vod.subType) vodPatch.subType = latestSubType;
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
  catCache: Map<string, string>
) {
  const lines = parsePlay(raw);
  if (!lines.length) return { added: 0, updated: 0, merged: 0 };

  const fp = makeFingerprint(raw.vod_name, raw.vod_year);
  const typeName = await resolveCategory(
    catCache,
    sourceId,
    String(raw.type_id ?? ""),
    raw.type_name || ""
  );

  const existing = await prisma.vod.findUnique({ where: { fingerprint: fp } });
  const subType = (raw.type_name || "").trim(); // 原始小类
  const vodData = {
    name: raw.vod_name,
    year: raw.vod_year || "",
    typeName,
    subType,
    pic: raw.vod_pic || "",
    actor: raw.vod_actor || "",
    director: raw.vod_director || "",
    area: raw.vod_area || "",
    lang: raw.vod_lang || "",
    remarks: raw.vod_remarks || "",
    blurb: (raw.vod_content || "").replace(/<[^>]+>/g, "").slice(0, 2000),
  };
  let vod;
  let mergedFlag = 0;
  if (existing) {
    vod = await prisma.vod.update({
      where: { id: existing.id },
      data: {
        pic: existing.pic || vodData.pic,
        blurb: existing.blurb || vodData.blurb,
        remarks: vodData.remarks || existing.remarks,
        // 分类：已映射(非未分类)则始终应用，否则保留原有
        typeName: typeName !== "未分类" ? typeName : existing.typeName,
        subType: subType || existing.subType, // 小类：有新值则更新，否则保留
      },
    });
    mergedFlag = 1;
  } else {
    vod = await prisma.vod.create({ data: { fingerprint: fp, ...vodData } });
  }

  // 取该源第一条线路
  const line = lines[0];
  const kind = line.episodes.every((e) => isDirectM3u8(e.url)) ? "hls" : "iframe";
  const key = { sourceId_sourceVodId: { sourceId, sourceVodId: String(raw.vod_id) } };
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
  await prisma.play.upsert({ where: key, create: payload, update: payload });

  return { added: before ? 0 : 1, updated: before ? 1 : 0, merged: existing ? mergedFlag : 0 };
}

// 按片名采集：遍历所有启用源搜索关键词 → 拉详情 → 入库（复用 upsertVod，不影响现有分页/断点流程）
export async function syncByKeyword(
  keyword: string,
  onProgress?: (p: { sourceNow: number; sourceTotal: number; sourceName: string; added: number; updated: number; merged: number; hits: number }) => void | Promise<void>
) {
  const kw = keyword.trim();
  if (!kw) throw new Error("片名不能为空");
  const sources = await prisma.source.findMany({ where: { enabled: true }, orderBy: { priority: "asc" } });
  if (!sources.length) throw new Error("没有已启用的采集源");

  let added = 0, updated = 0, merged = 0, hits = 0;
  const perSource: { source: string; hits: number; added: number; updated: number; ok: boolean; msg?: string }[] = [];
  const catCache = new Map<string, string>();

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    let sAdded = 0, sUpdated = 0, sHits = 0;
    try {
      const list = await searchByKeyword(src.apiUrl, kw);
      // 名字包含关键词才算命中（部分源 wd 参数只是模糊提示，需二次过滤）
      const hitList = list.filter((v) => (v.vod_name || "").includes(kw));
      sHits = hitList.length;
      hits += sHits;
      if (hitList.length) {
        const ids = hitList.map((v) => v.vod_id);
        for (let j = 0; j < ids.length; j += 20) {
          const batch = ids.slice(j, j + 20);
          const details = await fetchDetail(src.apiUrl, batch);
          for (const raw of details) {
            try {
              const r = await upsertVod(src.id, raw, catCache);
              added += r.added; updated += r.updated; merged += r.merged;
              sAdded += r.added; sUpdated += r.updated;
            } catch {}
          }
        }
      }
      perSource.push({ source: src.name, hits: sHits, added: sAdded, updated: sUpdated, ok: true });
    } catch (e: any) {
      perSource.push({ source: src.name, hits: 0, added: 0, updated: 0, ok: false, msg: e?.message || String(e) });
    }
    if (onProgress) await onProgress({ sourceNow: i + 1, sourceTotal: sources.length, sourceName: src.name, added, updated, merged, hits });
  }

  return { ok: true, keyword: kw, hits, added, updated, merged, perSource };
}

export async function syncSource(sourceId: number, opts: SyncOptions = {}, onProgress?: ProgressCb) {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error("source not found");
  const mode = opts.mode || "incr";
  const hours = mode === "incr" ? opts.hours || source.syncHours || 24 : 0;
  const maxPages = opts.maxPages || (mode === "incr" ? 30 : 100);

  const start = Date.now();
  const resume = opts.resume;
  let added = resume?.added || 0, updated = resume?.updated || 0, merged = resume?.merged || 0;
  let ok = true, message = "";
  const catCache = new Map<string, string>();

  const rawTypeId = opts.typeId ? String(opts.typeId) : undefined;
  try {
    // 分类列表：续采直接用游标里已展开的；首次才去展开父类
    let typeIds: (string | null | undefined)[];
    if (resume?.typeIds) {
      typeIds = resume.typeIds;
    } else {
      typeIds = [rawTypeId ?? null];
      if (rawTypeId) {
        try {
          const classes = await fetchClasses(source.apiUrl);
          const children = classes.filter((c) => c.typePid === rawTypeId).map((c) => c.typeId);
          if (children.length) {
            typeIds = children;
            message += ` [展开父类${rawTypeId}→${children.length}个子类]`;
          }
        } catch { /* 拉分类失败则按原 typeId 直接采 */ }
      }
    }
    const norm = (t: string | null | undefined) => (t == null ? undefined : t);

    // 预算每类页数（跨子类累加）供进度/断点定位
    const firstResults: Awaited<ReturnType<typeof fetchList>>[] = [];
    const perTypePages: number[] = [];
    let pageTotal = 0;
    for (const tid of typeIds) {
      const first = await fetchList(source.apiUrl, 1, hours, 15000, norm(tid));
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
        const listRes = pg === 1 ? firstResults[i] : await fetchList(source.apiUrl, pg, hours, 15000, norm(tid));
        const ids = listRes.list.map((v) => v.vod_id);
        if (!ids.length) break;
        for (let j = 0; j < ids.length; j += 20) {
          const batch = ids.slice(j, j + 20);
          let details: RawVod[] = [];
          try {
            details = await fetchDetail(source.apiUrl, batch);
          } catch (e: any) {
            message += ` [detail err t${tid} p${pg}: ${e?.message}]`;
            continue;
          }
          for (const raw of details) {
            try {
              const r = await upsertVod(sourceId, raw, catCache);
              added += r.added; updated += r.updated; merged += r.merged;
            } catch {}
          }
        }
        // 断点：下一个要处理的位置是 (i, pg+1)
        const cursor: ResumeCursor = {
          typeIds: typeIds.map((t) => (t == null ? null : String(t))),
          ti: i, pg: pg + 1, added, updated, merged,
        };
        if (onProgress) await onProgress({ pageNow, pageTotal, added, updated, merged, cursor });
      }
    }
    message = `pages=${pageTotal} added=${added} updated=${updated} merged=${merged}` + message;
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
    },
  });
  await prisma.syncLog.create({
    data: { sourceId, mode, added, updated, merged, ok, message, ms },
  });

  return { ok, added, updated, merged, ms, message };
}
