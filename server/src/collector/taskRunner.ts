// 异步采集任务执行器：前端点击后立即返回 taskId，任务在后台跑并更新进度
import { prisma } from "../db.js";
import { syncSource, backfillSubTypes, syncByKeyword, collectKeywordCandidates, type SyncOptions } from "./sync.js";
import { matchDouban, sleep, type DoubanCandidate, type DoubanMatchResult } from "./douban.js";
import { applyDoubanAssets } from "./metaAssets.js";
import { ensureHlsCleanConfig, runHlsCleanForEpisode } from "../hls/cleaner.js";

import { EventEmitter } from "node:events";

// 任务变更事件（供 SSE 推送）——任何任务创建/进度/完成/取消 都 emit 一下
export const taskEvents = new EventEmitter();
taskEvents.setMaxListeners(100);
export function emitTaskChange() {
  taskEvents.emit("changed");
}

function isMissingTaskError(e: any) {
  return e?.code === "P2025";
}

// 包一层：更新任务即推送事件
async function taskUpdate(args: Parameters<typeof prisma.task.update>[0]) {
  try {
    const r = await prisma.task.update(args);
    emitTaskChange();
    return r;
  } catch (e: any) {
    // 任务可能已被清理；不能让单条任务把整个队列泵打断。
    if (isMissingTaskError(e)) {
      emitTaskChange();
      return null;
    }
    throw e;
  }
}

const running = new Set<number>(); // 正在跑的 sourceId，防重复
let collectPumpRunning = false; // 采集任务队列泵：全局串行，避免多任务抢资源
let metaRunning = false; // 元数据任务全局串行(限速防封)
let hlsCleanRunning = false; // HLS 清洗任务全局串行，避免集中探测拖垮源站
const canceled = new Set<number>(); // 请求中止的 taskId

// 请求中止某任务（运行中的执行器会在下一页/下一条检查并停止）
export function requestCancel(taskId: number) {
  canceled.add(taskId);
}

export function wakeTaskQueues() {
  void pumpCollectQueue();
  void pumpHlsCleanQueue();
}

// 服务重启回收：将遗留的 running/pending 僵尸任务自动从断点续跑（采集）或标失败
const MAX_RESUME = 5; // 自动续跑上限，防死循环
export async function recoverOrphanTasks() {
  const orphans = await prisma.task.findMany({
    where: { status: { in: ["running", "pending", "canceling"] } },
  });
  let resumed = 0, failed = 0, canceledCount = 0;
  for (const t of orphans) {
    if (t.status === "canceling") {
      await taskUpdate({
        where: { id: t.id },
        data: { status: "canceled", message: (t.message || "已手动中止") + " [服务重启已确认]", finishedAt: new Date() },
      });
      canceledCount++;
      continue;
    }
    // 采集任务 + 有源 + 未超续跑上限 → 从断点续跑
    if (t.type === "collect" && t.sourceId && t.resumeCount < MAX_RESUME) {
      let opts: SyncOptions = {};
      try { opts = t.params ? JSON.parse(t.params) : {}; } catch {}
      let cur: any = null;
      try { cur = t.cursor ? JSON.parse(t.cursor) : null; } catch {}
      if (cur) opts.resume = cur;
      await taskUpdate({
        where: { id: t.id },
        data: { status: "pending", resumeCount: { increment: 1 }, message: (t.message || "") + " [重启续跑]", finishedAt: null },
      });
      void pumpCollectQueue();
      resumed++;
    } else if (t.type === "hls_clean" && t.resumeCount < MAX_RESUME) {
      await taskUpdate({
        where: { id: t.id },
        data: { status: "pending", resumeCount: { increment: 1 }, message: (t.message || "") + " [重启续跑]", finishedAt: null },
      });
      void pumpHlsCleanQueue();
      resumed++;
    } else {
      await taskUpdate({
        where: { id: t.id },
        data: { status: "failed", message: (t.message || "") + " [服务重启中断，请重试]", finishedAt: new Date() },
      });
      failed++;
    }
  }
  return { resumed, failed, canceled: canceledCount };
}

// 创建采集任务并异步执行，立即返回 task 记录
export async function createCollectTask(sourceId: number, opts: SyncOptions = {}) {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error("source not found");

  const task = await prisma.task.create({
    data: {
      type: "collect",
      sourceId,
      sourceName: source.name,
      mode: opts.mode || "incr",
      status: "pending",
      params: JSON.stringify(opts),
    },
  });

  // 入持久化队列，由队列泵串行执行
  emitTaskChange();
  void pumpCollectQueue();
  return task;
}

export async function createHlsCleanTask(opts: {
  sourceId?: number;
  categoryName?: string;
  vodId?: number;
  playId?: number;
  playIds?: number[];
  epIndex?: number;
  episodeMode?: "first" | "all";
  limit?: number;
  strategyId?: string;
  strategyIds?: string[];
  dryRun?: boolean;
} = {}) {
  const playIds = Array.isArray(opts.playIds) ? opts.playIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0) : [];
  const [source, vod] = await Promise.all([
    opts.sourceId ? prisma.source.findUnique({ where: { id: opts.sourceId }, select: { name: true } }) : null,
    opts.vodId ? prisma.vod.findUnique({ where: { id: opts.vodId }, select: { name: true } }) : null,
  ]);
  const sourceName = playIds.length
    ? opts.vodId
      ? `影片「${vod?.name || opts.vodId}」· ${playIds.length}条线路`
      : `指定线路 ${playIds.length} 条`
    : opts.playId
    ? `线路#${opts.playId}`
    : opts.vodId
      ? `影片「${vod?.name || opts.vodId}」`
      : opts.sourceId && opts.categoryName
        ? `${source?.name || `源#${opts.sourceId}`} / ${opts.categoryName}`
        : opts.sourceId
          ? `${source?.name || `源#${opts.sourceId}`}`
          : opts.categoryName
            ? opts.categoryName
            : "全部范围";
  const task = await prisma.task.create({
    data: {
      type: "hls_clean",
      sourceId: opts.sourceId || null,
      sourceName,
      mode: opts.dryRun ? "dry" : "full",
      status: "pending",
      params: JSON.stringify(opts),
    },
  });
  emitTaskChange();
  void pumpHlsCleanQueue();
  return task;
}

async function pumpHlsCleanQueue() {
  if (hlsCleanRunning) return;
  hlsCleanRunning = true;
  try {
    while (true) {
      const task = await prisma.task.findFirst({
        where: { type: "hls_clean", status: "pending" },
        orderBy: { createdAt: "asc" },
      });
      if (!task) return;
      let opts: any = {};
      try { opts = task.params ? JSON.parse(task.params) : {}; } catch {}
      try {
        await runHlsCleanTask(task.id, opts);
      } catch (e: any) {
        if (!isMissingTaskError(e)) {
          await taskUpdate({ where: { id: task.id }, data: { status: "failed", message: e?.message || String(e), finishedAt: new Date() } });
        }
      }
    }
  } finally {
    hlsCleanRunning = false;
  }
}

async function runHlsCleanTask(taskId: number, opts: {
  sourceId?: number;
  categoryName?: string;
  vodId?: number;
  playId?: number;
  playIds?: number[];
  epIndex?: number;
  episodeMode?: "first" | "all";
  limit?: number;
  strategyId?: string;
  strategyIds?: string[];
  dryRun?: boolean;
}) {
  if (canceled.has(taskId)) {
    await taskUpdate({ where: { id: taskId }, data: { status: "canceled", message: "已手动中止", finishedAt: new Date() } });
    canceled.delete(taskId);
    return;
  }
  const startState = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
  if (!startState || ["canceled", "canceling"].includes(startState.status)) {
    if (startState?.status === "canceling") {
      await taskUpdate({ where: { id: taskId }, data: { status: "canceled", message: "已手动中止", finishedAt: new Date() } });
    }
    canceled.delete(taskId);
    return;
  }
  await taskUpdate({ where: { id: taskId }, data: { status: "running", startedAt: new Date(), message: "正在准备清洗范围" } });
  try {
    const limit = Math.max(1, Math.min(2000, Number(opts.limit) || 100));
    const playIds = Array.isArray(opts.playIds) ? opts.playIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0) : [];
    const where: any = {};
    if (playIds.length) where.id = { in: playIds };
    else if (opts.playId) where.id = Number(opts.playId);
    if (opts.sourceId) where.sourceId = Number(opts.sourceId);
    if (!playIds.length && opts.vodId) where.vodId = Number(opts.vodId);
    if (opts.categoryName) where.vod = { typeName: String(opts.categoryName) };
    const plays = await prisma.play.findMany({
      where,
      include: { vod: { select: { id: true, name: true, typeName: true } }, source: { select: { id: true, name: true } } },
      orderBy: { id: "asc" },
      take: limit,
    });
    const units: Array<{ playId: number; epIndex: number; title: string }> = [];
    for (const p of plays) {
      let eps: Array<{ name?: string; url?: string }> = [];
      try { eps = JSON.parse(p.episodes || "[]"); } catch {}
      if (typeof opts.epIndex === "number" && Number.isFinite(opts.epIndex)) {
        if (eps[opts.epIndex]?.url) units.push({ playId: p.id, epIndex: opts.epIndex, title: `${p.vod.name} ${eps[opts.epIndex]?.name || ""}` });
      } else if (opts.episodeMode === "all") {
        eps.forEach((ep, i) => { if (ep?.url) units.push({ playId: p.id, epIndex: i, title: `${p.vod.name} ${ep.name || `第${i + 1}集`}` }); });
      } else if (eps[0]?.url) {
        units.push({ playId: p.id, epIndex: 0, title: `${p.vod.name} ${eps[0]?.name || "第1集"}` });
      }
    }
    if (!units.length) {
      await taskUpdate({ where: { id: taskId }, data: { status: "done", progress: 100, message: "没有可清洗的 HLS 集数", finishedAt: new Date() } });
      return;
    }

    let clean = 0, noAds = 0, uncertain = 0, failed = 0;
    await taskUpdate({ where: { id: taskId }, data: { pageTotal: units.length, message: `待清洗 ${units.length} 集` } });
    const cfg = await ensureHlsCleanConfig();
    for (let i = 0; i < units.length; i++) {
      if (canceled.has(taskId)) {
        await taskUpdate({
          where: { id: taskId },
          data: { status: "canceled", message: `已手动中止（已处理${i}/${units.length}）`, finishedAt: new Date() },
        });
        return;
      }
      const u = units[i];
      try {
        const r = await runHlsCleanForEpisode({
          playId: u.playId,
          epIndex: u.epIndex,
          strategyIds: opts.strategyIds,
          strategyId: opts.strategyId || cfg.defaultStrategy,
          dryRun: typeof opts.dryRun === "boolean" ? opts.dryRun : undefined,
          minConfidence: cfg.minConfidence,
        });
        if (r.status === "clean") clean++;
        else if (r.status === "no_ads") noAds++;
        else if (r.status === "dry_run" || r.status === "uncertain") uncertain++;
        else failed++;
      } catch {
        failed++;
      }
      const progress = Math.round(((i + 1) / units.length) * 100);
      await taskUpdate({
        where: { id: taskId },
        data: {
          progress,
          pageNow: i + 1,
          pageTotal: units.length,
          added: clean,
          updated: failed,
          merged: noAds,
          message: `正在清洗：${u.title} · clean ${clean} / no_ads ${noAds} / failed ${failed}`,
        },
      });
    }
    if (canceled.has(taskId)) {
      await taskUpdate({
        where: { id: taskId },
        data: { status: "canceled", message: `已手动中止（已处理${units.length}/${units.length}）`, finishedAt: new Date() },
      });
      return;
    }
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: "done",
        progress: 100,
        added: clean,
        updated: failed,
        merged: noAds,
        message: `清洗完成：可用${clean} 无广告${noAds} 低置信/演练${uncertain} 失败${failed}`,
        finishedAt: new Date(),
      },
    });
  } catch (e: any) {
    const isCancel = canceled.has(taskId) || String(e?.message).includes("__CANCELED__");
    await taskUpdate({ where: { id: taskId }, data: { status: isCancel ? "canceled" : "failed", message: isCancel ? "已手动中止" : (e?.message || String(e)), finishedAt: new Date() } });
  } finally {
    canceled.delete(taskId);
  }
}

async function pumpCollectQueue() {
  if (collectPumpRunning) return;
  collectPumpRunning = true;
  try {
    while (true) {
      const task = await prisma.task.findFirst({
        where: { type: "collect", status: "pending", sourceId: { not: null } },
        orderBy: { createdAt: "asc" },
      });
      if (!task?.sourceId) return;
      let opts: SyncOptions = {};
      try { opts = task.params ? JSON.parse(task.params) : {}; } catch {}
      let cur: any = null;
      try { cur = task.cursor ? JSON.parse(task.cursor) : null; } catch {}
      if (cur) opts.resume = cur;
      try {
        await runTask(task.id, task.sourceId, opts);
      } catch (e: any) {
        if (!isMissingTaskError(e)) {
          await taskUpdate({ where: { id: task.id }, data: { status: "failed", message: e?.message || String(e), finishedAt: new Date() } });
        }
      }
    }
  } finally {
    collectPumpRunning = false;
  }
}

// ============ 补全小类任务 ============
let subtypeRunning = false;
export async function createSubtypeTask() {
  const task = await prisma.task.create({
    data: { type: "subtype", sourceName: "补全小类", mode: "full", status: "pending", params: "{}" },
  });
  emitTaskChange();
  void runSubtypeTask(task.id);
  return task;
}
async function runSubtypeTask(taskId: number) {
  if (subtypeRunning) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: "已有补全小类任务进行中", finishedAt: new Date() } });
    return;
  }
  subtypeRunning = true;
  await taskUpdate({ where: { id: taskId }, data: { status: "running", startedAt: new Date() } });
  try {
    const r = await backfillSubTypes({}, async (p) => {
      const progress = p.totalUnits ? Math.round((p.done / p.totalUnits) * 100) : 100;
      await taskUpdate({ where: { id: taskId }, data: { progress, pageNow: p.done, pageTotal: p.totalUnits, added: p.filled } });
    });
    await taskUpdate({ where: { id: taskId }, data: { status: "done", progress: 100, added: r.filled, pageTotal: r.scanned, pageNow: r.scanned, message: `扫描${r.scanned} 回填小类${r.filled}`, finishedAt: new Date() } });
  } catch (e: any) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: e?.message || String(e), finishedAt: new Date() } });
  } finally {
    subtypeRunning = false;
  }
}

// ============ 按确认候选精准采集（两步式：先预览选择，再提交） ============
let keywordConfirmRunning = false;
export async function createKeywordConfirmTask(keyword: string, candidates: { sourceId: number; vodIds: (string|number)[] }[]) {
  const totalHits = candidates.reduce((s, c) => s + c.vodIds.length, 0);
  const task = await prisma.task.create({
    data: { type: "keyword", sourceName: `片名「${keyword}」(精选${totalHits}条)`, mode: "full", status: "pending", params: JSON.stringify({ keyword, candidates }) },
  });
  emitTaskChange();
  void runKeywordConfirmTask(task.id, candidates);
  return task;
}
async function runKeywordConfirmTask(taskId: number, candidates: { sourceId: number; vodIds: (string|number)[] }[]) {
  if (keywordConfirmRunning) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: "已有按片名采集任务进行中，请稍后重试", finishedAt: new Date() } });
    return;
  }
  keywordConfirmRunning = true;
  await taskUpdate({ where: { id: taskId }, data: { status: "running", startedAt: new Date() } });
  try {
    const r = await collectKeywordCandidates(candidates, async (p) => {
      const progress = p.sourceTotal ? Math.round((p.sourceNow / p.sourceTotal) * 100) : 0;
      await taskUpdate({
        where: { id: taskId },
        data: { progress, pageNow: p.sourceNow, pageTotal: p.sourceTotal, added: p.added, updated: p.updated, message: `正在采集「${p.sourceName}」…` },
      });
    });
    const detail = r.perSource.map((s) => `${s.source}:${s.ok ? `入库${s.added}` : "失败"}`).join(" | ");
    await taskUpdate({
      where: { id: taskId },
      data: { status: "done", progress: 100, added: r.added, updated: r.updated, merged: r.merged, message: `新增${r.added} 更新${r.updated} | ${detail}`, finishedAt: new Date() },
    });
  } catch (e: any) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: e?.message || String(e), finishedAt: new Date() } });
  } finally {
    keywordConfirmRunning = false;
  }
}

// ============ 按片名单独采集（旧版一步到位，仍保留） ============
let keywordRunning = false;
export async function createKeywordTask(keyword: string) {
  const task = await prisma.task.create({
    data: { type: "keyword", sourceName: `片名「${keyword}」`, mode: "full", status: "pending", params: JSON.stringify({ keyword }) },
  });
  emitTaskChange();
  void runKeywordTask(task.id, keyword);
  return task;
}
async function runKeywordTask(taskId: number, keyword: string) {
  if (keywordRunning) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: "已有按片名采集任务进行中，请稍后重试", finishedAt: new Date() } });
    return;
  }
  keywordRunning = true;
  await taskUpdate({ where: { id: taskId }, data: { status: "running", startedAt: new Date() } });
  try {
    const r = await syncByKeyword(keyword, async (p) => {
      const progress = p.sourceTotal ? Math.round((p.sourceNow / p.sourceTotal) * 100) : 0;
      await taskUpdate({
        where: { id: taskId },
        data: { progress, pageNow: p.sourceNow, pageTotal: p.sourceTotal, added: p.added, updated: p.updated, message: `正在搜索「${p.sourceName}」… 命中${p.hits}` },
      });
    });
    const detail = r.perSource.map((s) => `${s.source}:${s.ok ? `命中${s.hits}/入库${s.added}` : "失败"}`).join(" | ");
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: "done", progress: 100, added: r.added, updated: r.updated, merged: r.merged,
        message: `共命中${r.hits}条 新增${r.added} 更新${r.updated} | ${detail}`,
        finishedAt: new Date(),
      },
    });
  } catch (e: any) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: e?.message || String(e), finishedAt: new Date() } });
  } finally {
    keywordRunning = false;
  }
}

// ============ 元数据任务（豆瓣，限速批处理） ============
function metaCandidateSnapshot(candidates: DoubanCandidate[]) {
  return candidates.slice(0, 5).map((c) => ({
    id: c.id,
    title: c.title,
    subTitle: c.subTitle,
    year: c.year,
    type: c.type,
    img: c.img,
    score: c.score,
    titleSim: c.titleSim,
    reasons: c.reasons,
    rating: c.meta?.rating ?? null,
    ratingCount: c.meta?.ratingCount ?? 0,
  }));
}

function metaReason(r: DoubanMatchResult) {
  return JSON.stringify({
    score: r.score,
    reasons: r.reasons,
    candidates: metaCandidateSnapshot(r.candidates),
  });
}

function matchedMetaData(r: DoubanMatchResult, status: "matched" | "pending") {
  const best = r.candidates[0];
  return {
    ...(status === "matched" && r.meta ? {
      doubanId: r.meta.doubanId,
      rating: r.meta.rating,
      ratingCount: r.meta.ratingCount,
      officialPic: r.meta.pic,
      officialIntro: r.meta.intro,
      genres: r.meta.genres.join(","),
    } : {}),
    metaMatched: status,
    metaScore: r.score,
    metaReason: metaReason(r),
    matchedTitle: r.meta?.title || best?.title || "",
    matchedYear: r.meta?.year || best?.year || "",
    metaAt: new Date(),
  };
}

export async function createMetaTask(opts: { limit?: number; intervalMs?: number; redo?: boolean } = {}) {
  const task = await prisma.task.create({
    data: {
      type: "meta",
      sourceName: "豆瓣元数据",
      mode: opts.redo ? "full" : "incr",
      status: "pending",
      params: JSON.stringify(opts),
    },
  });
  emitTaskChange();
  void runMetaTask(task.id, opts);
  return task;
}

async function runMetaTask(
  taskId: number,
  opts: { limit?: number; intervalMs?: number; redo?: boolean }
) {
  if (metaRunning) {
    await taskUpdate({
      where: { id: taskId },
      data: { status: "failed", message: "已有元数据任务进行中", finishedAt: new Date() },
    });
    return;
  }
  metaRunning = true;
  canceled.delete(taskId);
  const limit = Math.min(opts.limit || 50, 500);
  const interval = Math.max(opts.intervalMs || 2500, 1000); // 默认2.5s/条，防封
  await taskUpdate({
    where: { id: taskId },
    data: { status: "running", startedAt: new Date() },
  });

  try {
    // 待处理：未匹配过的（redo=true 则取最久的重刷）
    const where = opts.redo ? {} : { metaMatched: "none" };
    const vods = await prisma.vod.findMany({
      where,
      orderBy: opts.redo ? { metaAt: "asc" } : { id: "asc" },
      take: limit,
    });
    let matched = 0, failed = 0, pending = 0;
    for (let i = 0; i < vods.length; i++) {
      if (canceled.has(taskId)) {
        await taskUpdate({
          where: { id: taskId },
              data: { status: "canceled", message: `已手动中止（已处理${i}/${vods.length}）`, added: matched, updated: failed + pending, finishedAt: new Date() },
        });
        metaRunning = false;
        return;
      }
      const v = vods[i];
      try {
        const r = await matchDouban(v.name, v.year, { typeName: v.typeName, actor: v.actor, director: v.director });
        if (r.status === "matched" && r.meta) {
          await prisma.vod.update({
            where: { id: v.id },
            data: matchedMetaData(r, "matched"),
          });
          await applyDoubanAssets(v.id, r.meta);
          matched++;
        } else if (r.status === "pending") {
          await prisma.vod.update({
            where: { id: v.id },
            data: matchedMetaData(r, "pending"),
          });
          pending++;
        } else {
          await prisma.vod.update({
            where: { id: v.id },
            data: { metaMatched: "failed", metaScore: r.score, metaReason: metaReason(r), matchedTitle: "", matchedYear: "", metaAt: new Date() },
          });
          failed++;
        }
      } catch {
        failed++;
      }
      const progress = Math.round(((i + 1) / vods.length) * 100);
      await taskUpdate({
        where: { id: taskId },
        data: { progress, pageNow: i + 1, pageTotal: vods.length, added: matched, updated: failed + pending },
      });
      if (i < vods.length - 1) await sleep(interval);
    }
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: "done", progress: 100, added: matched, updated: failed,
        message: `匹配成功${matched} 待确认${pending} 失败${failed} / 共${vods.length}`,
        finishedAt: new Date(),
      },
    });
  } catch (e: any) {
    await taskUpdate({
      where: { id: taskId },
      data: { status: "failed", message: e?.message || String(e), finishedAt: new Date() },
    });
  } finally {
    metaRunning = false;
    canceled.delete(taskId);
  }
}

async function runTask(taskId: number, sourceId: number, opts: SyncOptions) {
  if (canceled.has(taskId)) {
    await taskUpdate({ where: { id: taskId }, data: { status: "canceled", message: "已手动中止", finishedAt: new Date() } });
    canceled.delete(taskId);
    return;
  }
  const startState = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
  if (!startState || ["canceled", "canceling"].includes(startState.status)) {
    if (startState?.status === "canceling") {
      await taskUpdate({ where: { id: taskId }, data: { status: "canceled", message: "已手动中止", finishedAt: new Date() } });
    }
    canceled.delete(taskId);
    return;
  }
  // 同源已有任务在跑则标记排队失败（简单串行保护）
  if (running.has(sourceId)) {
    await taskUpdate({
      where: { id: taskId },
      data: { status: "failed", message: "该源已有采集任务进行中", finishedAt: new Date() },
    });
    return;
  }
  running.add(sourceId);
  await taskUpdate({
    where: { id: taskId },
    data: { status: "running", startedAt: new Date() },
  });

  try {
    const r = await syncSource(sourceId, opts, async (p) => {
      if (canceled.has(taskId)) throw new Error("__CANCELED__");
      const progress = p.pageTotal ? Math.round((p.pageNow / p.pageTotal) * 100) : 0;
      await taskUpdate({
        where: { id: taskId },
        data: {
          progress,
          pageNow: p.pageNow,
          pageTotal: p.pageTotal,
          added: p.added,
          updated: p.updated,
          merged: p.merged,
          // 每页持久化断点，重启后可从此续跑
          cursor: p.cursor ? JSON.stringify(p.cursor) : undefined,
        },
      });
    });
    // 中止信号会被 syncSource 内部 catch 吞掉（返回 ok=false 且 message 含 __CANCELED__），这里补判
    const wasCanceled = canceled.has(taskId) || String(r.message).includes("__CANCELED__");
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: wasCanceled ? "canceled" : r.ok ? "done" : "failed",
        progress: 100,
        added: r.added,
        updated: r.updated,
        merged: r.merged,
        message: wasCanceled ? "已手动中止" : r.message,
        cursor: null, // 完成/取消 清空断点
        finishedAt: new Date(),
      },
    });
    if (!wasCanceled && r.ok) {
      try {
        const cfg = await ensureHlsCleanConfig();
        if (cfg.enabled && cfg.autoOnCollect) {
          await createHlsCleanTask({ sourceId, episodeMode: "first", limit: 500 });
        }
      } catch {
        // 采集任务已完成，自动清洗排队失败不反向影响采集结果
      }
    }
  } catch (e: any) {
    const isCancel = canceled.has(taskId) || String(e?.message).includes("__CANCELED__");
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: isCancel ? "canceled" : "failed",
        message: isCancel ? "已手动中止" : (e?.message || String(e)),
        finishedAt: new Date(),
      },
    });
  } finally {
    running.delete(sourceId);
    canceled.delete(taskId);
  }
}
