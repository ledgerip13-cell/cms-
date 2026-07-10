// 异步采集任务执行器：前端点击后立即返回 taskId，任务在后台跑并更新进度
import { prisma } from "../db.js";
import { invalidateAggregateCache } from "../aggregateCache.js";
import { syncSource, backfillSubTypes, syncByKeyword, collectKeywordCandidates, type SyncOptions } from "./sync.js";
import { AUTO_MATCH_SCORE, PENDING_MATCH_SCORE, matchDouban, pickOfficialPoster, sleep, type DoubanCandidate, type DoubanMatchResult } from "./douban.js";
import { applyDoubanAssets } from "./metaAssets.js";
import { ensureHlsCleanConfig, runHlsCleanForEpisode } from "../hls/cleaner.js";
import { cleanText } from "../textClean.js";

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
let collectPumpRunning = false; // 采集任务队列泵：按源并发，避免多任务抢同源资源
let collectActive = 0;
let metaRunning = false; // 元数据任务全局串行(限速防封)
let metaPumpRunning = false;
let hlsCleanRunning = false; // HLS 清洗任务全局串行，避免集中探测拖垮源站
const canceled = new Set<number>(); // 请求中止的 taskId
const paused = new Set<number>(); // 请求暂停的 taskId

function clampPriority(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(999, Math.floor(n))) : 100;
}

function collectConcurrency() {
  const n = Number(process.env.COLLECT_WORKERS || process.env.COLLECT_CONCURRENCY || 3);
  return Number.isFinite(n) ? Math.max(1, Math.min(8, Math.floor(n))) : 3;
}

function uniqueVodIds(vodIds: unknown[] | undefined) {
  return [...new Set((Array.isArray(vodIds) ? vodIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0))];
}

function boolOpt(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

async function queueAutoMetaMatch(vodIds: unknown[] | undefined) {
  const ids = uniqueVodIds(vodIds);
  if (!ids.length) return 0;
  const rows = await prisma.vod.findMany({
    where: { id: { in: ids }, metaMatched: "none" },
    select: { id: true },
  });
  const pendingIds = rows.map((r) => r.id);
  for (let i = 0; i < pendingIds.length; i += 500) {
    const chunk = pendingIds.slice(i, i + 500);
    await createMetaTask({ vodIds: chunk, limit: chunk.length, priority: 60 });
  }
  return pendingIds.length;
}

async function queueHlsCleanForVods(vodIds: unknown[] | undefined, opts: { priority?: number } = {}) {
  const ids = uniqueVodIds(vodIds);
  if (!ids.length) return 0;
  const plays = await prisma.play.findMany({
    where: { vodId: { in: ids }, flag: { not: "icloudm3u8" } }, // 跳过 iCloud 客户端解析源，无需也无法服务端清洗
    select: { id: true },
    take: 500,
    orderBy: { id: "asc" },
  });
  const playIds = plays.map((p) => p.id);
  if (!playIds.length) return 0;
  await createHlsCleanTask({ playIds, episodeMode: "first", limit: playIds.length, priority: opts.priority ?? 80 });
  return playIds.length;
}

function isPauseSignal(e: any) {
  return String(e?.message || e || "").includes("__PAUSED__");
}

// 请求中止某任务（运行中的执行器会在下一页/下一条检查并停止）
export function requestCancel(taskId: number) {
  canceled.add(taskId);
}

export function requestPause(taskId: number) {
  paused.add(taskId);
}

export function clearPause(taskId: number) {
  paused.delete(taskId);
}

export function wakeTaskQueues() {
  void pumpCollectQueue();
  void pumpHlsCleanQueue();
  void pumpMetaQueue();
}

async function pauseIfRequested(taskId: number, message = "已暂停") {
  if (!paused.has(taskId)) return false;
  await taskUpdate({ where: { id: taskId }, data: { status: "paused", message, finishedAt: null } });
  paused.delete(taskId);
  return true;
}

// 服务重启回收：将遗留的 running/pending 僵尸任务自动从断点续跑（采集）或标失败
const MAX_RESUME = 5; // 自动续跑上限，防死循环

function cleanRestartMarks(message: unknown) {
  return String(message || "").replace(/\s*\[重启续跑\]/g, "").trim();
}

function restartResumeMessage(message: unknown) {
  const base = cleanRestartMarks(message);
  return base ? `${base} [重启续跑]` : "服务重启后自动恢复排队 [重启续跑]";
}

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
        data: { status: "pending", resumeCount: { increment: 1 }, message: restartResumeMessage(t.message), finishedAt: null },
      });
      void pumpCollectQueue();
      resumed++;
    } else if (t.type === "hls_clean" && t.resumeCount < MAX_RESUME) {
      await taskUpdate({
        where: { id: t.id },
        data: { status: "pending", resumeCount: { increment: 1 }, message: restartResumeMessage(t.message), finishedAt: null },
      });
      void pumpHlsCleanQueue();
      resumed++;
    } else if (t.type === "meta" && t.resumeCount < MAX_RESUME) {
      await taskUpdate({
        where: { id: t.id },
        data: { status: "pending", resumeCount: { increment: 1 }, message: restartResumeMessage(t.message), finishedAt: null },
      });
      void pumpMetaQueue();
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
export async function createCollectTask(sourceId: number, opts: SyncOptions & { priority?: number } = {}) {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error("source not found");

  const task = await prisma.task.create({
    data: {
      type: "collect",
      sourceId,
      sourceName: source.name,
      mode: opts.mode || "incr",
      status: "pending",
      priority: clampPriority((opts as any).priority),
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
  priority?: number;
} = {}) {
  const normalized = normalizeHlsCleanTaskOptions(opts);
  const duplicate = await findActiveHlsCleanTask(normalized.key);
  if (duplicate) return duplicate;
  const playIds = normalized.opts.playIds || [];
  const [source, vod] = await Promise.all([
    normalized.opts.sourceId ? prisma.source.findUnique({ where: { id: normalized.opts.sourceId }, select: { name: true } }) : null,
    normalized.opts.vodId ? prisma.vod.findUnique({ where: { id: normalized.opts.vodId }, select: { name: true } }) : null,
  ]);
  const sourceName = playIds.length
    ? normalized.opts.vodId
      ? `影片「${vod?.name || normalized.opts.vodId}」· ${playIds.length}条线路`
      : `指定线路 ${playIds.length} 条`
    : normalized.opts.playId
    ? `线路#${normalized.opts.playId}`
    : normalized.opts.vodId
      ? `影片「${vod?.name || normalized.opts.vodId}」`
      : normalized.opts.sourceId && normalized.opts.categoryName
        ? `${source?.name || `源#${normalized.opts.sourceId}`} / ${normalized.opts.categoryName}`
        : normalized.opts.sourceId
          ? `${source?.name || `源#${normalized.opts.sourceId}`}`
          : normalized.opts.categoryName
            ? normalized.opts.categoryName
            : "全部范围";
  const task = await prisma.task.create({
    data: {
      type: "hls_clean",
      sourceId: normalized.opts.sourceId || null,
      sourceName,
      mode: normalized.opts.dryRun ? "dry" : "full",
      status: "pending",
      priority: clampPriority(opts.priority),
      params: JSON.stringify(normalized.opts),
    },
  });
  emitTaskChange();
  void pumpHlsCleanQueue();
  return task;
}

function normalizeMaybeNumber(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function normalizeMaybeIndex(value: unknown) {
  if (value === "" || value === null || typeof value === "undefined") return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function normalizeHlsCleanTaskOptions(opts: any = {}) {
  const playIds = Array.isArray(opts.playIds)
    ? [...new Set<number>(opts.playIds.map((x: any) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
    : [];
  const strategyIds = Array.isArray(opts.strategyIds)
    ? [...new Set<string>(opts.strategyIds.map((x: any) => String(x || "").trim()).filter(Boolean))].sort()
    : undefined;
  const normalized: any = {
    sourceId: normalizeMaybeNumber(opts.sourceId),
    categoryName: String(opts.categoryName || "").trim() || undefined,
    vodId: normalizeMaybeNumber(opts.vodId),
    playId: normalizeMaybeNumber(opts.playId),
    playIds: playIds.length ? playIds : undefined,
    epIndex: normalizeMaybeIndex(opts.epIndex),
    episodeMode: opts.episodeMode === "all" ? "all" : "first",
    limit: Math.max(1, Math.min(2000, Number(opts.limit) || 100)),
    strategyId: String(opts.strategyId || "").trim() || undefined,
    strategyIds,
    dryRun: typeof opts.dryRun === "boolean" ? opts.dryRun : undefined,
  };
  for (const key of Object.keys(normalized)) {
    if (typeof normalized[key] === "undefined") delete normalized[key];
  }
  const key = JSON.stringify({
    sourceId: normalized.sourceId || null,
    categoryName: normalized.categoryName || "",
    vodId: normalized.vodId || null,
    playId: normalized.playId || null,
    playIds: normalized.playIds || [],
    epIndex: typeof normalized.epIndex === "number" ? normalized.epIndex : null,
    episodeMode: normalized.episodeMode,
    limit: normalized.limit,
    strategyId: normalized.strategyId || "",
    strategyIds: normalized.strategyIds || [],
    dryRun: typeof normalized.dryRun === "boolean" ? normalized.dryRun : null,
  });
  return { opts: normalized, key };
}

async function findActiveHlsCleanTask(key: string) {
  const rows = await prisma.task.findMany({
    where: { type: "hls_clean", status: { in: ["pending", "running", "paused", "canceling"] } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  for (const row of rows) {
    let opts: any = {};
    try { opts = row.params ? JSON.parse(row.params) : {}; } catch {}
    if (normalizeHlsCleanTaskOptions(opts).key === key) return row;
  }
  return null;
}

async function pumpHlsCleanQueue() {
  if (hlsCleanRunning) return;
  hlsCleanRunning = true;
  try {
    while (true) {
      const task = await prisma.task.findFirst({
        where: { type: "hls_clean", status: "pending" },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
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
  let clean = 0, noAds = 0, uncertain = 0, failed = 0, processed = 0, totalUnits = 0;
  try {
    const limit = Math.max(1, Math.min(2000, Number(opts.limit) || 100));
    const playIds = Array.isArray(opts.playIds) ? opts.playIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0) : [];
    const where: any = {};
    if (playIds.length) where.id = { in: playIds };
    else if (opts.playId) where.id = Number(opts.playId);
    if (opts.sourceId) where.sourceId = Number(opts.sourceId);
    if (!playIds.length && opts.vodId) where.vodId = Number(opts.vodId);
    if (opts.categoryName) where.vod = { typeName: String(opts.categoryName) };
    where.flag = { not: "icloudm3u8" }; // 排除 iCloud 客户端解析链路
    const plays = await prisma.play.findMany({
      where,
      include: { vod: { select: { id: true, name: true, typeName: true } }, source: { select: { id: true, name: true } } },
      orderBy: { id: "asc" },
      take: limit,
    });
    const units: Array<{ playId: number; sourceId: number; epIndex: number; title: string }> = [];
    for (const p of plays) {
      let eps: Array<{ name?: string; url?: string }> = [];
      try { eps = JSON.parse(p.episodes || "[]"); } catch {}
      if (typeof opts.epIndex === "number" && Number.isFinite(opts.epIndex)) {
        if (eps[opts.epIndex]?.url) units.push({ playId: p.id, sourceId: p.sourceId, epIndex: opts.epIndex, title: `${p.vod.name} ${eps[opts.epIndex]?.name || ""}` });
      } else if (opts.episodeMode === "all") {
        eps.forEach((ep, i) => { if (ep?.url) units.push({ playId: p.id, sourceId: p.sourceId, epIndex: i, title: `${p.vod.name} ${ep.name || `第${i + 1}集`}` }); });
      } else if (eps[0]?.url) {
        units.push({ playId: p.id, sourceId: p.sourceId, epIndex: 0, title: `${p.vod.name} ${eps[0]?.name || "第1集"}` });
      }
    }
    if (!units.length) {
      await taskUpdate({ where: { id: taskId }, data: { status: "done", progress: 100, message: "没有可清洗的 HLS 集数", finishedAt: new Date() } });
      return;
    }

    totalUnits = units.length;
    await taskUpdate({ where: { id: taskId }, data: { pageTotal: units.length, message: `待清洗 ${units.length} 集` } });
    const cfg = await ensureHlsCleanConfig();
    const workerCount = Math.max(1, Math.min(12, Number((cfg as any).workerConcurrency) || 3));
    const sourceLimit = Math.max(1, Math.min(4, Number((cfg as any).sourceConcurrency) || 1));
    const sourceActive = new Map<number, number>();
    let nextIndex = 0;
    async function withSourceLimit<T>(sourceId: number, fn: () => Promise<T>): Promise<T> {
      while ((sourceActive.get(sourceId) || 0) >= sourceLimit) {
        if (canceled.has(taskId) || paused.has(taskId)) throw new Error(canceled.has(taskId) ? "__CANCELED__" : "__PAUSED__");
        await sleep(150);
      }
      sourceActive.set(sourceId, (sourceActive.get(sourceId) || 0) + 1);
      try {
        return await fn();
      } finally {
        sourceActive.set(sourceId, Math.max(0, (sourceActive.get(sourceId) || 1) - 1));
      }
    }
    async function worker() {
      while (true) {
        if (canceled.has(taskId)) throw new Error("__CANCELED__");
        if (paused.has(taskId)) throw new Error("__PAUSED__");
        const i = nextIndex++;
        if (i >= units.length) return;
        const u = units[i];
        let status = "failed";
        try {
          const r = await withSourceLimit(u.sourceId, () => runHlsCleanForEpisode({
            playId: u.playId,
            epIndex: u.epIndex,
            strategyIds: opts.strategyIds,
            strategyId: opts.strategyId || cfg.defaultStrategy,
            dryRun: typeof opts.dryRun === "boolean" ? opts.dryRun : undefined,
            minConfidence: cfg.minConfidence,
          }));
          status = r.status;
        } catch (e: any) {
          if (String(e?.message || "").includes("__CANCELED__") || String(e?.message || "").includes("__PAUSED__")) throw e;
          status = "failed";
        }
        processed++;
        if (status === "clean") clean++;
        else if (status === "no_ads") noAds++;
        else if (status === "dry_run" || status === "uncertain") uncertain++;
        else failed++;
        const progress = Math.round((processed / units.length) * 100);
        await taskUpdate({
          where: { id: taskId },
          data: {
            progress,
            pageNow: processed,
            pageTotal: units.length,
            added: clean,
            updated: failed,
            merged: noAds,
            message: `并发清洗 ${Math.min(workerCount, units.length)} worker：${u.title} · clean ${clean} / no_ads ${noAds} / failed ${failed}`,
          },
        });
      }
    }
    await Promise.all(Array.from({ length: Math.min(workerCount, units.length) }, () => worker()));
    if (canceled.has(taskId)) {
      await taskUpdate({
        where: { id: taskId },
        data: { status: "canceled", message: `已手动中止（已处理${processed}/${totalUnits}）`, finishedAt: new Date() },
      });
      return;
    }
    if (await pauseIfRequested(taskId, `已暂停（已处理${processed}/${totalUnits}）`)) return;
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
    const isPause = paused.has(taskId) || isPauseSignal(e);
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: isCancel ? "canceled" : isPause ? "paused" : "failed",
        message: isCancel ? `已手动中止（已处理${processed}/${totalUnits}）` : isPause ? `已暂停（已处理${processed}/${totalUnits}）` : (e?.message || String(e)),
        finishedAt: isPause ? null : new Date(),
      },
    });
  } finally {
    canceled.delete(taskId);
    paused.delete(taskId);
  }
}

async function pumpCollectQueue() {
  if (collectPumpRunning) return;
  collectPumpRunning = true;
  try {
    while (collectActive < collectConcurrency()) {
      const busySources = [...running];
      const task = await prisma.task.findFirst({
        where: {
          type: "collect",
          status: "pending",
          sourceId: busySources.length ? { not: null, notIn: busySources } : { not: null },
        },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      });
      if (!task?.sourceId) return;
      let opts: SyncOptions = {};
      try { opts = task.params ? JSON.parse(task.params) : {}; } catch {}
      let cur: any = null;
      try { cur = task.cursor ? JSON.parse(task.cursor) : null; } catch {}
      if (cur) opts.resume = cur;
      running.add(task.sourceId);
      collectActive++;
      void runTask(task.id, task.sourceId, opts, true)
        .catch(async (e: any) => {
          if (!isMissingTaskError(e)) {
            await taskUpdate({ where: { id: task.id }, data: { status: "failed", message: e?.message || String(e), finishedAt: new Date() } });
          }
        })
        .finally(() => {
          collectActive = Math.max(0, collectActive - 1);
          void pumpCollectQueue();
        });
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
export async function createKeywordConfirmTask(
  keyword: string,
  candidates: { sourceId: number; vodIds: (string|number)[] }[],
  opts: SyncOptions & { metaAfterCollect?: boolean; cleanAfterCollect?: boolean } = {}
) {
  const totalHits = candidates.reduce((s, c) => s + c.vodIds.length, 0);
  const task = await prisma.task.create({
    data: { type: "keyword", sourceName: `片名「${keyword}」(精选${totalHits}条)`, mode: "full", status: "pending", params: JSON.stringify({ keyword, candidates, ...opts }) },
  });
  emitTaskChange();
  void runKeywordConfirmTask(task.id, candidates, opts);
  return task;
}
async function runKeywordConfirmTask(
  taskId: number,
  candidates: { sourceId: number; vodIds: (string|number)[] }[],
  opts: SyncOptions & { metaAfterCollect?: boolean; cleanAfterCollect?: boolean } = {}
) {
  if (keywordConfirmRunning) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: "已有按片名采集任务进行中，请稍后重试", finishedAt: new Date() } });
    return;
  }
  keywordConfirmRunning = true;
  await taskUpdate({ where: { id: taskId }, data: { status: "running", startedAt: new Date() } });
  try {
    const r = await collectKeywordCandidates(candidates, opts, async (p) => {
      const progress = p.sourceTotal ? Math.round((p.sourceNow / p.sourceTotal) * 100) : 0;
      await taskUpdate({
        where: { id: taskId },
        data: { progress, pageNow: p.sourceNow, pageTotal: p.sourceTotal, added: p.added, updated: p.updated, message: `正在采集「${p.sourceName}」…` },
      });
    });
    const detail = r.perSource.map((s) => `${s.source}:${s.ok ? `入库${s.added}` : "失败"}`).join(" | ");
    const metaQueued = boolOpt(opts.metaAfterCollect, true) ? await queueAutoMetaMatch(r.vodIds) : 0;
    const hlsQueued = boolOpt(opts.cleanAfterCollect, false) ? await queueHlsCleanForVods(r.vodIds) : 0;
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: "done",
        progress: 100,
        added: r.added,
        updated: r.updated,
        merged: r.merged,
        message: `新增${r.added} 更新${r.updated} | ${detail}${metaQueued ? ` | 已提交豆瓣匹配${metaQueued}部` : ""}${hlsQueued ? ` | 已提交HLS清洗${hlsQueued}条线路` : ""}`,
        finishedAt: new Date(),
      },
    });
  } catch (e: any) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: e?.message || String(e), finishedAt: new Date() } });
  } finally {
    keywordConfirmRunning = false;
  }
}

// ============ 按片名单独采集（旧版一步到位，仍保留） ============
let keywordRunning = false;
export async function createKeywordTask(keyword: string, opts: SyncOptions & { metaAfterCollect?: boolean; cleanAfterCollect?: boolean } = {}) {
  const task = await prisma.task.create({
    data: { type: "keyword", sourceName: `片名「${keyword}」`, mode: "full", status: "pending", params: JSON.stringify({ keyword, ...opts }) },
  });
  emitTaskChange();
  void runKeywordTask(task.id, keyword, opts);
  return task;
}
async function runKeywordTask(taskId: number, keyword: string, opts: SyncOptions & { metaAfterCollect?: boolean; cleanAfterCollect?: boolean } = {}) {
  if (keywordRunning) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: "已有按片名采集任务进行中，请稍后重试", finishedAt: new Date() } });
    return;
  }
  keywordRunning = true;
  await taskUpdate({ where: { id: taskId }, data: { status: "running", startedAt: new Date() } });
  try {
    const r = await syncByKeyword(keyword, opts, async (p) => {
      const progress = p.sourceTotal ? Math.round((p.sourceNow / p.sourceTotal) * 100) : 0;
      await taskUpdate({
        where: { id: taskId },
        data: { progress, pageNow: p.sourceNow, pageTotal: p.sourceTotal, added: p.added, updated: p.updated, message: `正在搜索「${p.sourceName}」… 命中${p.hits}` },
      });
    });
    const detail = r.perSource.map((s) => `${s.source}:${s.ok ? `命中${s.hits}/入库${s.added}` : "失败"}`).join(" | ");
    const metaQueued = boolOpt(opts.metaAfterCollect, true) ? await queueAutoMetaMatch(r.vodIds) : 0;
    const hlsQueued = boolOpt(opts.cleanAfterCollect, false) ? await queueHlsCleanForVods(r.vodIds) : 0;
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: "done", progress: 100, added: r.added, updated: r.updated, merged: r.merged,
        message: `共命中${r.hits}条 新增${r.added} 更新${r.updated} | ${detail}${metaQueued ? ` | 已提交豆瓣匹配${metaQueued}部` : ""}${hlsQueued ? ` | 已提交HLS清洗${hlsQueued}条线路` : ""}`,
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

function syncYearFromDouban(metaYear = "") {
  const year = String(metaYear || "").match(/(19|20)\d{2}/)?.[0] || "";
  return year ? { year } : {};
}

function matchedMetaData(r: DoubanMatchResult, status: "matched" | "pending", officialPic = "") {
  const best = r.candidates[0];
  return {
    ...(status === "matched" && r.meta ? {
      doubanId: r.meta.doubanId,
      rating: r.meta.rating,
      ratingCount: r.meta.ratingCount,
      ...syncYearFromDouban(r.meta.year),
      ...(officialPic ? { officialPic } : {}),
      officialIntro: cleanText(r.meta.intro, 2000),
      genres: cleanText(r.meta.genres.join(",")),
    } : {}),
    metaMatched: status,
    metaScore: r.score,
    metaReason: metaReason(r),
    matchedTitle: r.meta?.title || best?.title || "",
    matchedYear: r.meta?.year || best?.year || "",
    metaAt: new Date(),
  };
}

export async function createMetaTask(opts: {
  limit?: number;
  intervalMs?: number;
  redo?: boolean;
  status?: string;
  sourceId?: number;
  categoryName?: string;
  vodIds?: number[];
  priority?: number;
} = {}) {
  const task = await prisma.task.create({
    data: {
      type: "meta",
      sourceName: "豆瓣元数据",
      mode: opts.redo ? "full" : "incr",
      status: "pending",
      priority: clampPriority(opts.priority),
      params: JSON.stringify(opts),
    },
  });
  emitTaskChange();
  void pumpMetaQueue();
  return task;
}

async function pumpMetaQueue() {
  if (metaPumpRunning || metaRunning) return;
  metaPumpRunning = true;
  try {
    while (true) {
      const task = await prisma.task.findFirst({
        where: { type: "meta", status: "pending" },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      });
      if (!task) return;
      let opts: any = {};
      try { opts = task.params ? JSON.parse(task.params) : {}; } catch {}
      await runMetaTask(task.id, opts);
    }
  } finally {
    metaPumpRunning = false;
  }
}

async function runMetaTask(
  taskId: number,
  opts: { limit?: number; intervalMs?: number; redo?: boolean; status?: string; sourceId?: number; categoryName?: string; vodIds?: number[]; autoMatchScore?: number; pendingMatchScore?: number }
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
  const cfg = await prisma.metaConfig.findUnique({ where: { id: 1 } });
  const autoMatchScore = Number.isFinite(Number(opts.autoMatchScore))
    ? Number(opts.autoMatchScore)
    : (cfg?.autoMatchScore ?? AUTO_MATCH_SCORE);
  const pendingMatchScore = Number.isFinite(Number(opts.pendingMatchScore))
    ? Number(opts.pendingMatchScore)
    : (cfg?.pendingMatchScore ?? PENDING_MATCH_SCORE);
  await taskUpdate({
    where: { id: taskId },
    data: { status: "running", startedAt: new Date() },
  });

  try {
    // 待处理：默认只扫未匹配；也支持按状态/源/分类/精确影片重刷。
    const where: any = {};
    const vodIds = Array.isArray(opts.vodIds) ? opts.vodIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (vodIds.length) where.id = { in: vodIds };
    if (opts.categoryName) where.typeName = String(opts.categoryName);
    if (opts.sourceId) where.plays = { some: { sourceId: Number(opts.sourceId) } };
    const status = String(opts.status || "").trim();
    if (status && status !== "all") where.metaMatched = status;
    else if (!opts.redo) where.metaMatched = "none";
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
      if (paused.has(taskId)) {
        await taskUpdate({
          where: { id: taskId },
          data: { status: "paused", message: `已暂停（已处理${i}/${vods.length}）`, added: matched, updated: failed + pending, finishedAt: null },
        });
        metaRunning = false;
        return;
      }
      const v = vods[i];
      try {
        const r = await matchDouban(v.name, v.year, {
          typeName: v.typeName,
          actor: v.actor,
          director: v.director,
          sourcePic: v.pic || v.localPic,
          autoMatchScore,
          pendingMatchScore,
        });
        if (r.status === "matched" && r.meta) {
          const officialPic = await pickOfficialPoster(r.meta, v.pic || v.localPic || "");
          await prisma.vod.update({
            where: { id: v.id },
            data: matchedMetaData(r, "matched", officialPic),
          });
          if (syncYearFromDouban(r.meta.year).year) invalidateAggregateCache();
          if (officialPic) r.meta.pic = officialPic;
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
    paused.delete(taskId);
  }
}

async function runTask(taskId: number, sourceId: number, opts: SyncOptions, reserved = false) {
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
  if (!reserved && running.has(sourceId)) {
    await taskUpdate({
      where: { id: taskId },
      data: { status: "failed", message: "该源已有采集任务进行中", finishedAt: new Date() },
    });
    return;
  }
  if (!reserved) running.add(sourceId);
  await taskUpdate({
    where: { id: taskId },
    data: { status: "running", startedAt: new Date() },
  });

  try {
    const r = await syncSource(sourceId, opts, async (p) => {
      if (canceled.has(taskId)) throw new Error("__CANCELED__");
      if (paused.has(taskId)) throw new Error("__PAUSED__");
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
    const wasPaused = paused.has(taskId) || String(r.message).includes("__PAUSED__");
    const metaQueued = !wasCanceled && !wasPaused && r.ok && boolOpt((opts as any).metaAfterCollect, false)
      ? await queueAutoMetaMatch(r.vodIds)
      : 0;
    let hlsQueued = 0;
    if (!wasCanceled && !wasPaused && r.ok) {
      try {
        const cfg = await ensureHlsCleanConfig();
        const cleanByManual = boolOpt((opts as any).cleanAfterCollect, false);
        const cleanByAutoUpdate = boolOpt((opts as any).autoRun, false) && cfg.enabled && cfg.autoOnCollect;
        if (cleanByManual || cleanByAutoUpdate) {
          const hlsTask = await createHlsCleanTask({ sourceId, episodeMode: "first", limit: 500, priority: cleanByAutoUpdate ? 90 : 80 });
          hlsQueued = hlsTask.id;
        }
      } catch {
        // 后置清洗排队失败不反向影响采集任务
      }
    }
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: wasCanceled ? "canceled" : wasPaused ? "paused" : r.ok ? "done" : "failed",
        progress: 100,
        added: r.added,
        updated: r.updated,
        merged: r.merged,
        message: wasCanceled ? "已手动中止" : wasPaused ? "已暂停" : `${r.message}${metaQueued ? ` | 已提交豆瓣匹配${metaQueued}部` : ""}${hlsQueued ? ` | 已提交HLS清洗任务#${hlsQueued}` : ""}`,
        cursor: wasPaused ? undefined : null, // 暂停保留断点，完成/取消 清空断点
        finishedAt: wasPaused ? null : new Date(),
      },
    });
  } catch (e: any) {
    const isCancel = canceled.has(taskId) || String(e?.message).includes("__CANCELED__");
    const isPause = paused.has(taskId) || isPauseSignal(e);
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: isCancel ? "canceled" : isPause ? "paused" : "failed",
        message: isCancel ? "已手动中止" : isPause ? "已暂停" : (e?.message || String(e)),
        finishedAt: isPause ? null : new Date(),
      },
    });
  } finally {
    running.delete(sourceId);
    canceled.delete(taskId);
    paused.delete(taskId);
  }
}
