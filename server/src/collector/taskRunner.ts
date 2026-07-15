// 异步采集任务执行器：前端点击后立即返回 taskId，任务在后台跑并更新进度
import { prisma } from "../db.js";
import { invalidateAggregateCache } from "../aggregateCache.js";
import { syncSource, backfillSubTypes, syncByKeyword, collectKeywordCandidates, type SyncOptions } from "./sync.js";
import { doubanDetail, matchDouban, pickOfficialPoster, sleep, type DoubanCandidate, type DoubanMatchResult, type DoubanMeta } from "./douban.js";
import { matchTmdb, tmdbDetail } from "./tmdb.js";
import { applyDoubanAssets, localizeMetaImages } from "./metaAssets.js";
import { ensureHlsCleanConfig, runHlsCleanForEpisode } from "../hls/cleaner.js";
import { archiveEpisode, removeVodArchive } from "./archive.js";
import { JINPAI_FLAG } from "./drivers/jinpai.js";
import { cleanText } from "../textClean.js";
import { enabledMetaProviders, metaProviderByKey, type MetaProviderConfig } from "../metaProviders.js";

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

async function pruneTerminalTasks(status: "done" | "failed", keep = 500) {
  const rows = await prisma.task.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    skip: keep,
    take: 500,
    select: { id: true },
  });
  if (rows.length) await prisma.task.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
}

// 包一层：更新任务即推送事件
async function taskUpdate(args: Parameters<typeof prisma.task.update>[0]) {
  try {
    const r = await prisma.task.update(args);
    if (r.status === "done" || r.status === "failed") void pruneTerminalTasks(r.status);
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
let archiveRunning = false; // 本地转存任务全局串行（ffmpeg 吃带宽/CPU，串行避免拖垮机器）
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

// 方案A：采集完自动转存。仅对「源 autoArchive=true 的 jinpai 线路」且尚未转存/未手动关闭的剧排队。
async function queueAutoArchiveForVods(vodIds: unknown[] | undefined) {
  const ids = uniqueVodIds(vodIds);
  if (!ids.length) return 0;
  const vods = await prisma.vod.findMany({
    where: {
      id: { in: ids },
      archiveStatus: "none", // off(手动关)/done/pending/running 不重复排
      plays: { some: { flag: JINPAI_FLAG, source: { autoArchive: true, enabled: true } } },
    },
    select: { id: true },
    take: 200,
  });
  let n = 0;
  for (const v of vods) {
    try { await createArchiveTask({ vodId: v.id, priority: 95 }); n++; } catch { /* 单部失败不阻断 */ }
  }
  return n;
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
  void pumpArchiveQueue();
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
  let shouldPumpCollect = false;
  let shouldPumpHlsClean = false;
  let shouldPumpMeta = false;
  let shouldPumpArchive = false;
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
      shouldPumpCollect = true;
      resumed++;
    } else if (t.type === "hls_clean" && t.resumeCount < MAX_RESUME) {
      await taskUpdate({
        where: { id: t.id },
        data: { status: "pending", resumeCount: { increment: 1 }, message: restartResumeMessage(t.message), finishedAt: null },
      });
      shouldPumpHlsClean = true;
      resumed++;
    } else if (t.type === "meta" && t.resumeCount < MAX_RESUME) {
      await taskUpdate({
        where: { id: t.id },
        data: { status: "pending", resumeCount: { increment: 1 }, message: restartResumeMessage(t.message), finishedAt: null },
      });
      shouldPumpMeta = true;
      resumed++;
    } else if (t.type === "archive" && t.resumeCount < MAX_RESUME) {
      await taskUpdate({
        where: { id: t.id },
        data: { status: "pending", resumeCount: { increment: 1 }, message: restartResumeMessage(t.message), finishedAt: null },
      });
      shouldPumpArchive = true;
      resumed++;
    } else {
      await taskUpdate({
        where: { id: t.id },
        data: { status: "failed", message: (t.message || "") + " [服务重启中断，请重试]", finishedAt: new Date() },
      });
      failed++;
    }
  }
  if (shouldPumpCollect) void pumpCollectQueue();
  if (shouldPumpHlsClean) void pumpHlsCleanQueue();
  if (shouldPumpMeta) void pumpMetaQueue();
  if (shouldPumpArchive) void pumpArchiveQueue();
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
  sourceId?: number | string;
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

// ===== 本地转存任务（archive）=====
async function pumpArchiveQueue() {
  if (archiveRunning) return;
  archiveRunning = true;
  try {
    while (true) {
      const task = await prisma.task.findFirst({
        where: { type: "archive", status: "pending" },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      });
      if (!task) return;
      let opts: any = {};
      try { opts = task.params ? JSON.parse(task.params) : {}; } catch {}
      try {
        await runArchiveTask(task.id, opts);
      } catch (e: any) {
        if (!isMissingTaskError(e)) {
          await taskUpdate({ where: { id: task.id }, data: { status: "failed", message: e?.message || String(e), finishedAt: new Date() } });
          if (opts.vodId) await prisma.vod.update({ where: { id: opts.vodId }, data: { archiveStatus: "failed" } }).catch(() => {});
        }
      }
    }
  } finally {
    archiveRunning = false;
  }
}

// 转存单部剧（Vod 级）：拉取该剧 jinpai 线路的全部集，逐集下载切片存本地硬盘（最高清）。
async function runArchiveTask(taskId: number, opts: { vodId?: number; force?: boolean }) {
  const vodId = opts.vodId;
  if (!vodId) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: "缺少 vodId", finishedAt: new Date() } });
    return;
  }
  if (canceled.has(taskId)) {
    await taskUpdate({ where: { id: taskId }, data: { status: "canceled", message: "已手动中止", finishedAt: new Date() } });
    canceled.delete(taskId);
    return;
  }
  const vod = await prisma.vod.findUnique({
    where: { id: vodId },
    include: { plays: { include: { source: { select: { apiUrl: true, signKey: true, driver: true, enabled: true } } } } },
  });
  if (!vod) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: "影片不存在", finishedAt: new Date() } });
    return;
  }
  // 取该剧的 jinpai 线路（转存仅支持 jinpai 系）
  const play = vod.plays.find((p) => p.flag === JINPAI_FLAG && p.source.enabled && p.source.driver === "jinpai");
  if (!play) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: "该影片无可转存的 jinpai 线路", finishedAt: new Date() } });
    await prisma.vod.update({ where: { id: vodId }, data: { archiveStatus: "failed" } }).catch(() => {});
    return;
  }
  let episodes: Array<{ name?: string; url?: string }> = [];
  try { episodes = JSON.parse(play.episodes || "[]"); } catch {}
  const eps = episodes.map((e) => ({ name: String(e.name || ""), nid: String(e.url || "").trim() })).filter((e) => e.nid);
  if (!eps.length) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: "无集数信息", finishedAt: new Date() } });
    await prisma.vod.update({ where: { id: vodId }, data: { archiveStatus: "failed" } }).catch(() => {});
    return;
  }

  await taskUpdate({ where: { id: taskId }, data: { status: "running", startedAt: new Date(), pageTotal: eps.length, pageNow: 0, progress: 0, message: `转存「${vod.name}」共 ${eps.length} 集` } });
  await prisma.vod.update({ where: { id: vodId }, data: { archiveStatus: "running" } }).catch(() => {});

  let doneEps = 0, failEps = 0, totalMb = 0, bestRes = 0;
  for (let i = 0; i < eps.length; i++) {
    // 取消检查
    const cur = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
    if (!cur || canceled.has(taskId) || cur.status === "canceling") {
      await taskUpdate({ where: { id: taskId }, data: { status: "canceled", message: `已中止（完成 ${doneEps}/${eps.length} 集）`, finishedAt: new Date() } });
      canceled.delete(taskId);
      await prisma.vod.update({ where: { id: vodId }, data: { archiveStatus: doneEps > 0 ? "done" : "none", archiveEps: doneEps, archiveSize: totalMb, archiveRes: bestRes || 0 } }).catch(() => {});
      return;
    }
    const ep = eps[i];
    const r = await archiveEpisode({ apiUrl: play.source.apiUrl, signKey: play.source.signKey, vodId: play.sourceVodId, nid: ep.nid, force: opts.force });
    if (r.ok) {
      doneEps++;
      if (r.sizeMb) totalMb += r.sizeMb;
      if (r.resolution && r.resolution > bestRes) bestRes = r.resolution;
    } else {
      failEps++;
    }
    await taskUpdate({
      where: { id: taskId },
      data: { pageNow: i + 1, progress: Math.round(((i + 1) / eps.length) * 100), message: `转存中 ${i + 1}/${eps.length}（成功${doneEps} 失败${failEps}）`, added: doneEps, updated: failEps },
    }).catch(() => {});
  }

  const finalStatus = doneEps > 0 ? "done" : "failed";
  await prisma.vod.update({
    where: { id: vodId },
    data: { archiveStatus: finalStatus, archiveEps: doneEps, archiveSize: totalMb, archiveRes: bestRes || 0, archivedAt: new Date() },
  }).catch(() => {});
  await taskUpdate({
    where: { id: taskId },
    data: { status: finalStatus === "done" ? "done" : "failed", progress: 100, message: `转存完成：${doneEps} 集成功 / ${failEps} 失败，共 ${totalMb} MB`, finishedAt: new Date() },
  });
  invalidateAggregateCache();
}

// 创建转存任务（方案A自动/方案B手动共用）。同一 vod 有活动任务则复用。
export async function createArchiveTask(opts: { vodId: number; force?: boolean; priority?: number }) {
  const existing = await prisma.task.findFirst({
    where: { type: "archive", status: { in: ["pending", "running"] }, params: { contains: `\"vodId\":${opts.vodId}` } },
  });
  if (existing) return existing;
  const vod = await prisma.vod.findUnique({ where: { id: opts.vodId }, select: { name: true } });
  const task = await prisma.task.create({
    data: {
      type: "archive",
      sourceId: null,
      sourceName: `转存「${vod?.name || opts.vodId}」`,
      mode: "full",
      status: "pending",
      priority: opts.priority ?? 90,
      params: JSON.stringify({ vodId: opts.vodId, force: !!opts.force }),
    },
  });
  await prisma.vod.update({ where: { id: opts.vodId }, data: { archiveStatus: "pending" } }).catch(() => {});
  emitTaskChange();
  void pumpArchiveQueue();
  return task;
}

// 取消/删除某剧的本地转存（清文件 + 复位状态）
export async function removeArchive(vodId: number) {
  const vod = await prisma.vod.findUnique({
    where: { id: vodId },
    include: { plays: { where: { flag: JINPAI_FLAG }, select: { episodes: true, sourceVodId: true } } },
  });
  if (!vod) return;
  const play = vod.plays[0];
  if (play) {
    let episodes: Array<{ url?: string }> = [];
    try { episodes = JSON.parse(play.episodes || "[]"); } catch {}
    const nids = episodes.map((e) => String(e.url || "").trim()).filter(Boolean);
    await removeVodArchive(play.sourceVodId, nids);
  }
  await prisma.vod.update({ where: { id: vodId }, data: { archiveStatus: "off", archiveEps: 0, archiveSize: 0, archiveRes: 0, archivedAt: null } }).catch(() => {});
  emitTaskChange();
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
    const keyOf = (u: { playId: number; epIndex: number }) => `${u.playId}:${u.epIndex}`;
    const finalStatus = new Map<string, string>();
    const retryCandidatesBySource = new Map<number, typeof units>();
    const sourcesWithNewDurSig = new Set<number>();
    let totalWork = units.length;
    function counts() {
      let c = 0, n = 0, u = 0, f = 0;
      for (const status of finalStatus.values()) {
        if (status === "clean") c++;
        else if (status === "no_ads") n++;
        else if (status === "dry_run" || status === "uncertain") u++;
        else f++;
      }
      return { clean: c, noAds: n, uncertain: u, failed: f };
    }
    function parseEvidence(value: unknown) {
      try { return JSON.parse(String(value || "{}")); } catch { return {}; }
    }
    async function processUnit(u: typeof units[number], round: 1 | 2) {
      let status = "failed";
      let newFingerprints = 0;
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
        const evidence = parseEvidence((r as any).evidence);
        newFingerprints = Number(evidence?.durationPattern?.newFingerprints || 0);
        if (newFingerprints > 0) sourcesWithNewDurSig.add(u.sourceId);
      } catch (e: any) {
        if (String(e?.message || "").includes("__CANCELED__") || String(e?.message || "").includes("__PAUSED__")) throw e;
        status = "failed";
      }
      finalStatus.set(keyOf(u), status);
      if (round === 1 && ["no_ads", "uncertain"].includes(status)) {
        const rows = retryCandidatesBySource.get(u.sourceId) || [];
        rows.push(u);
        retryCandidatesBySource.set(u.sourceId, rows);
      }
      processed++;
      const s = counts();
      clean = s.clean; noAds = s.noAds; uncertain = s.uncertain; failed = s.failed;
      const progress = Math.min(99, Math.round((processed / totalWork) * 100));
      await taskUpdate({
        where: { id: taskId },
        data: {
          progress,
          pageNow: processed,
          pageTotal: totalWork,
          added: clean,
          updated: failed,
          merged: noAds,
          message: `${round === 2 ? "时长指纹二次扫" : "并发清洗"} ${Math.min(workerCount, totalWork)} worker：${u.title} · clean ${clean} / no_ads ${noAds} / failed ${failed}`,
        },
      });
    }
    async function runQueue(queue: typeof units, round: 1 | 2) {
      let nextIndex = 0;
      let stopSignal = "";
      async function worker() {
        while (true) {
          if (stopSignal) return;
          if (canceled.has(taskId)) { stopSignal = "__CANCELED__"; return; }
          if (paused.has(taskId)) { stopSignal = "__PAUSED__"; return; }
          const i = nextIndex++;
          if (i >= queue.length) return;
          try {
            await processUnit(queue[i], round);
          } catch (e: any) {
            if (String(e?.message || "").includes("__CANCELED__")) { stopSignal = "__CANCELED__"; return; }
            if (String(e?.message || "").includes("__PAUSED__")) { stopSignal = "__PAUSED__"; return; }
            throw e;
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(workerCount, queue.length) }, () => worker()));
      if (stopSignal) throw new Error(stopSignal);
    }
    await runQueue(units, 1);
    const retryUnits = [...sourcesWithNewDurSig]
      .flatMap((sourceId) => retryCandidatesBySource.get(sourceId) || []);
    if (retryUnits.length) {
      totalWork += retryUnits.length;
      await taskUpdate({
        where: { id: taskId },
        data: {
          pageTotal: totalWork,
          message: `源级时长指纹新增，追加二次扫 ${retryUnits.length} 集`,
        },
      });
      await runQueue(retryUnits, 2);
    }
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
    const archiveQueued = await queueAutoArchiveForVods(r.vodIds).catch(() => 0);
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: "done",
        progress: 100,
        added: r.added,
        updated: r.updated,
        merged: r.merged,
        message: `新增${r.added} 更新${r.updated} | ${detail}${metaQueued ? ` | 已提交元数据匹配${metaQueued}部` : ""}${hlsQueued ? ` | 已提交HLS清洗${hlsQueued}条线路` : ""}${archiveQueued ? ` | 已提交自动转存${archiveQueued}部` : ""}`,
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
        message: `共命中${r.hits}条 新增${r.added} 更新${r.updated} | ${detail}${metaQueued ? ` | 已提交元数据匹配${metaQueued}部` : ""}${hlsQueued ? ` | 已提交HLS清洗${hlsQueued}条线路` : ""}`,
        finishedAt: new Date(),
      },
    });
  } catch (e: any) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: e?.message || String(e), finishedAt: new Date() } });
  } finally {
    keywordRunning = false;
  }
}

// ============ 元数据任务（按配置源限速批处理） ============
function metaCandidateSnapshot(candidates: DoubanCandidate[]) {
  return candidates.slice(0, 5).map((c) => ({
    source: c.source || "douban",
    sourceName: c.sourceName || "豆瓣",
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
    provider: r.meta?.source || r.candidates[0]?.source || "douban",
    score: r.score,
    reasons: r.reasons,
    candidates: metaCandidateSnapshot(r.candidates),
  });
}

function syncYearFromMeta(metaYear = "") {
  const year = String(metaYear || "").match(/(19|20)\d{2}/)?.[0] || "";
  return year ? { year } : {};
}

function matchedMetaData(r: DoubanMatchResult, status: "matched" | "pending", officialPic = "") {
  const best = r.candidates[0];
  return {
    ...(status === "matched" && r.meta ? {
      metaSource: r.meta.source || "douban",
      metaSourceId: r.meta.sourceId || r.meta.doubanId,
      ...(r.meta.doubanId ? { doubanId: r.meta.doubanId } : {}),
      rating: r.meta.rating,
      ratingCount: r.meta.ratingCount,
      ...(typeof r.meta.popularity === "number" ? { popularity: r.meta.popularity } : {}),
      ...syncYearFromMeta(r.meta.year),
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

function manualMetaReason(meta: DoubanMeta, provider: string, providerId: string) {
  return JSON.stringify({
    provider: meta.source || provider || "douban",
    score: 100,
    reasons: ["manual"],
    candidates: [{
      source: meta.source || provider || "douban",
      sourceName: meta.sourceName || provider,
      id: meta.sourceId || meta.doubanId || providerId,
      title: meta.title,
      year: meta.year,
      score: 100,
      reasons: ["manual"],
    }],
  });
}

async function detailByConfiguredSource(source: string, id: string): Promise<DoubanMeta | null> {
  const cfg = await prisma.metaConfig.findUnique({ where: { id: 1 } });
  const provider = metaProviderByKey(cfg?.providersConfig, source || "douban");
  if (source === "tmdb") return tmdbDetail(id, { apiKey: provider?.apiKey, accessToken: provider?.accessToken }).catch(() => null);
  return doubanDetail(id).catch(() => null);
}

async function runManualMetaConfirm(taskId: number, opts: { vodId?: number; provider?: string; metaSourceId?: string; doubanId?: string }) {
  const vodId = Number(opts.vodId);
  const provider = String(opts.provider || (opts.doubanId ? "douban" : "") || "douban");
  const providerId = String(opts.metaSourceId || opts.doubanId || "");
  if (!Number.isInteger(vodId) || vodId <= 0 || !providerId) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: "缺少影片或元数据源ID", finishedAt: new Date() } });
    return;
  }
  await taskUpdate({ where: { id: taskId }, data: { status: "running", startedAt: new Date(), pageNow: 0, pageTotal: 1 } });
  const vod = await prisma.vod.findUnique({ where: { id: vodId }, select: { id: true, pic: true, localPic: true } });
  if (!vod) {
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", message: "影片不存在", finishedAt: new Date() } });
    return;
  }
  const meta = await detailByConfiguredSource(provider, providerId);
  if (!meta) {
    await prisma.vod.update({
      where: { id: vodId },
      data: { metaMatched: "failed", metaScore: 0, metaReason: JSON.stringify({ provider, score: 0, reasons: ["detail_failed"], candidates: [] }), metaAt: new Date() },
    });
    await taskUpdate({ where: { id: taskId }, data: { status: "failed", progress: 100, pageNow: 1, pageTotal: 1, message: "元数据详情获取失败", finishedAt: new Date() } });
    return;
  }
  meta.pic = await pickOfficialPoster(meta, vod.pic || vod.localPic || "");
  const cfg = await prisma.metaConfig.findUnique({ where: { id: 1 }, select: { saveImages: true } });
  if (cfg?.saveImages) await localizeMetaImages(meta);
  await prisma.vod.update({
    where: { id: vodId },
    data: {
      metaSource: meta.source || provider || "douban",
      metaSourceId: meta.sourceId || providerId,
      ...(meta.doubanId ? { doubanId: meta.doubanId } : {}),
      rating: meta.rating,
      ratingCount: meta.ratingCount,
      ...(typeof meta.popularity === "number" ? { popularity: meta.popularity } : {}),
      ...syncYearFromMeta(meta.year),
      ...(meta.pic ? { officialPic: meta.pic } : {}),
      officialIntro: cleanText(meta.intro, 2000),
      genres: cleanText(meta.genres.join(",")),
      metaMatched: "manual",
      metaScore: 100,
      metaReason: manualMetaReason(meta, provider, providerId),
      matchedTitle: meta.title,
      matchedYear: meta.year,
      metaAt: new Date(),
    },
  });
  if (syncYearFromMeta(meta.year).year) invalidateAggregateCache();
  await applyDoubanAssets(vodId, meta);
  await taskUpdate({
    where: { id: taskId },
    data: { status: "done", progress: 100, pageNow: 1, pageTotal: 1, added: 1, message: `已确认${meta.sourceName || provider}《${meta.title}》`, finishedAt: new Date() },
  });
}

async function runProviderMatch(provider: MetaProviderConfig, v: any): Promise<DoubanMatchResult> {
  const aliases = Array.isArray(v.aliases)
    ? v.aliases
      .map((alias: any) => cleanText(alias?.note || String(alias?.fingerprint || "").split("|")[0] || "", 120))
      .filter(Boolean)
    : [];
  const ctx = {
    typeName: v.typeName,
    actor: v.actor,
    director: v.director,
    aliases,
    sourcePic: v.pic || v.localPic,
    autoMatchScore: provider.autoMatchScore,
    pendingMatchScore: provider.pendingMatchScore,
  };
  if (provider.key === "tmdb") {
    return matchTmdb(v.name, v.year, { ...ctx, credentials: { apiKey: provider.apiKey, accessToken: provider.accessToken } });
  }
  return matchDouban(v.name, v.year, ctx);
}

async function matchByConfiguredProviders(v: any, providerKey = ""): Promise<DoubanMatchResult> {
  const cfg = await prisma.metaConfig.findUnique({ where: { id: 1 } });
  const providers = providerKey
    ? [metaProviderByKey(cfg?.providersConfig, providerKey)].filter(Boolean) as MetaProviderConfig[]
    : enabledMetaProviders(cfg?.providersConfig);
  const active = providers.length ? providers : [metaProviderByKey(cfg?.providersConfig, "douban")].filter(Boolean) as MetaProviderConfig[];
  const candidates: DoubanCandidate[] = [];
  let bestPending: DoubanMatchResult | null = null;
  let bestPendingProvider = "";
  let bestFailed: DoubanMatchResult | null = null;
  for (const provider of active) {
    const result = await runProviderMatch(provider, v).catch(() => ({
      ok: false,
      status: "failed" as const,
      score: 0,
      reasons: ["provider_failed"],
      candidates: [],
    }));
    candidates.push(...result.candidates);
    if (result.status === "matched") return result;
    if (result.status === "pending") {
      if (!bestPending || result.score > bestPending.score) {
        bestPending = result;
        bestPendingProvider = provider.key;
      }
      continue;
    }
    if (!bestFailed || result.score > bestFailed.score) bestFailed = result;
  }
  if (bestPending) return {
    ...bestPending,
    candidates: [...bestPending.candidates, ...candidates.filter((c) => c.source !== bestPendingProvider)],
  };
  return bestFailed ? { ...bestFailed, candidates } : { ok: false, status: "failed", score: 0, reasons: ["no_provider"], candidates };
}

async function processMetaVod(v: any, providerKey = "") {
  try {
    const r = await matchByConfiguredProviders(v, providerKey);
    if (r.status === "matched" && r.meta) {
      const officialPic = await pickOfficialPoster(r.meta, v.pic || v.localPic || "");
      const cfg = await prisma.metaConfig.findUnique({ where: { id: 1 }, select: { saveImages: true } });
      if (officialPic) r.meta.pic = officialPic;
      if (cfg?.saveImages) await localizeMetaImages(r.meta);
      await prisma.vod.update({
        where: { id: v.id },
        data: matchedMetaData(r, "matched", r.meta.pic || officialPic),
      });
      if (syncYearFromMeta(r.meta.year).year) invalidateAggregateCache();
      await applyDoubanAssets(v.id, r.meta);
      return "matched" as const;
    }
    if (r.status === "pending") {
      await prisma.vod.update({
        where: { id: v.id },
        data: matchedMetaData(r, "pending"),
      });
      return "pending" as const;
    }
    await prisma.vod.update({
      where: { id: v.id },
      data: { metaMatched: "failed", metaScore: r.score, metaReason: metaReason(r), matchedTitle: "", matchedYear: "", metaAt: new Date() },
    });
    return "failed" as const;
  } catch {
    return "failed" as const;
  }
}

function splitChunks<T>(rows: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
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
  provider?: string;
  matchConcurrency?: number;
  concurrencyBatchSize?: number;
  autoMatchScore?: number;
  pendingMatchScore?: number;
  manualConfirm?: boolean;
  vodId?: number;
  metaSourceId?: string;
  doubanId?: string;
} = {}) {
  const task = await prisma.task.create({
    data: {
      type: "meta",
      sourceName: opts.manualConfirm ? "确认元数据" : opts.provider ? `${opts.provider}元数据` : "元数据匹配",
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
  opts: { limit?: number; intervalMs?: number; redo?: boolean; status?: string; sourceId?: number; categoryName?: string; vodIds?: number[]; autoMatchScore?: number; pendingMatchScore?: number; provider?: string; matchConcurrency?: number; concurrencyBatchSize?: number; manualConfirm?: boolean; vodId?: number; metaSourceId?: string; doubanId?: string }
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
  if (opts.manualConfirm) {
    try {
      await runManualMetaConfirm(taskId, {
        vodId: opts.vodId,
        provider: opts.provider,
        metaSourceId: opts.metaSourceId,
        doubanId: opts.doubanId,
      });
    } finally {
      metaRunning = false;
      canceled.delete(taskId);
      paused.delete(taskId);
    }
    return;
  }
  const cfg = await prisma.metaConfig.findUnique({ where: { id: 1 } });
  const providers = opts.provider
    ? [metaProviderByKey(cfg?.providersConfig, opts.provider)].filter(Boolean) as MetaProviderConfig[]
    : enabledMetaProviders(cfg?.providersConfig);
  const primaryProvider = providers[0] || metaProviderByKey(cfg?.providersConfig, "douban");
  const effectiveProvider = opts.provider || primaryProvider?.key || "";
  const limit = Math.min(opts.limit || primaryProvider?.batchLimit || cfg?.batchLimit || 50, 500);
  const interval = Math.max(opts.intervalMs || primaryProvider?.intervalMs || cfg?.intervalMs || 2500, 500);
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
      include: { aliases: true },
      take: limit,
    });
    let matched = 0, failed = 0, pending = 0;
    let processed = 0;
    const tmdbFirst = primaryProvider?.key === "tmdb" && effectiveProvider === "tmdb";
    const concurrency = tmdbFirst ? Math.max(1, Math.min(10, Number(opts.matchConcurrency || primaryProvider?.matchConcurrency) || 1)) : 1;
    const concurrencyBatchSize = tmdbFirst ? Math.max(1, Math.min(50, Number(opts.concurrencyBatchSize || primaryProvider?.concurrencyBatchSize) || 1)) : 1;
    const waveSize = concurrency * concurrencyBatchSize;
    for (let offset = 0; offset < vods.length; offset += waveSize) {
      if (canceled.has(taskId)) {
        await taskUpdate({
          where: { id: taskId },
          data: { status: "canceled", message: `已手动中止（已处理${processed}/${vods.length}）`, added: matched, updated: failed, merged: pending, finishedAt: new Date() },
        });
        metaRunning = false;
        return;
      }
      if (paused.has(taskId)) {
        await taskUpdate({
          where: { id: taskId },
          data: { status: "paused", message: `已暂停（已处理${processed}/${vods.length}）`, added: matched, updated: failed, merged: pending, finishedAt: null },
        });
        metaRunning = false;
        return;
      }
      const wave = vods.slice(offset, offset + waveSize);
      const chunks = splitChunks(wave, concurrencyBatchSize);
      const results = (await Promise.all(chunks.map(async (chunk) => {
        const rows: Array<"matched" | "pending" | "failed"> = [];
        for (const v of chunk) rows.push(await processMetaVod(v, opts.provider));
        return rows;
      }))).flat();
      matched += results.filter((status) => status === "matched").length;
      pending += results.filter((status) => status === "pending").length;
      failed += results.filter((status) => status === "failed").length;
      processed += results.length;
      const progress = vods.length ? Math.round((processed / vods.length) * 100) : 100;
      await taskUpdate({
        where: { id: taskId },
        data: { progress, pageNow: processed, pageTotal: vods.length, added: matched, updated: failed, merged: pending },
      });
      if (offset + waveSize < vods.length) await sleep(interval);
    }
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: "done", progress: 100, added: matched, updated: failed, merged: pending,
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
    // 方案A：源级自动转存
    const archiveQueued = !wasCanceled && !wasPaused && r.ok ? await queueAutoArchiveForVods(r.vodIds).catch(() => 0) : 0;
    await taskUpdate({
      where: { id: taskId },
      data: {
        status: wasCanceled ? "canceled" : wasPaused ? "paused" : r.ok ? "done" : "failed",
        progress: 100,
        added: r.added,
        updated: r.updated,
        merged: r.merged,
        message: wasCanceled ? "已手动中止" : wasPaused ? "已暂停" : `${r.message}${metaQueued ? ` | 已提交元数据匹配${metaQueued}部` : ""}${hlsQueued ? ` | 已提交HLS清洗任务#${hlsQueued}` : ""}${archiveQueued ? ` | 已提交自动转存${archiveQueued}部` : ""}`,
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
