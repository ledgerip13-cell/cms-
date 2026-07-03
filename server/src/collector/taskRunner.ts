// 异步采集任务执行器：前端点击后立即返回 taskId，任务在后台跑并更新进度
import { prisma } from "../db.js";
import { syncSource, backfillSubTypes, syncByKeyword, collectKeywordCandidates, type SyncOptions } from "./sync.js";
import { matchDouban, sleep, type DoubanCandidate, type DoubanMatchResult } from "./douban.js";
import { applyDoubanAssets } from "./metaAssets.js";

import { EventEmitter } from "node:events";

// 任务变更事件（供 SSE 推送）——任何任务创建/进度/完成/取消 都 emit 一下
export const taskEvents = new EventEmitter();
taskEvents.setMaxListeners(100);
export function emitTaskChange() {
  taskEvents.emit("changed");
}

// 包一层：更新任务即推送事件
async function taskUpdate(args: Parameters<typeof prisma.task.update>[0]) {
  const r = await prisma.task.update(args);
  emitTaskChange();
  return r;
}

const running = new Set<number>(); // 正在跑的 sourceId，防重复
let collectPumpRunning = false; // 采集任务队列泵：全局串行，避免多任务抢资源
let metaRunning = false; // 元数据任务全局串行(限速防封)
const canceled = new Set<number>(); // 请求中止的 taskId

// 请求中止某任务（运行中的执行器会在下一页/下一条检查并停止）
export function requestCancel(taskId: number) {
  canceled.add(taskId);
}

// 服务重启回收：将遗留的 running/pending 僵尸任务自动从断点续跑（采集）或标失败
const MAX_RESUME = 5; // 自动续跑上限，防死循环
export async function recoverOrphanTasks() {
  const orphans = await prisma.task.findMany({
    where: { status: { in: ["running", "pending"] } },
  });
  let resumed = 0, failed = 0;
  for (const t of orphans) {
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
    } else {
      await taskUpdate({
        where: { id: t.id },
        data: { status: "failed", message: (t.message || "") + " [服务重启中断，请重试]", finishedAt: new Date() },
      });
      failed++;
    }
  }
  return { resumed, failed };
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
      await runTask(task.id, task.sourceId, opts);
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
  // 同源已有任务在跑则标记排队失败（简单串行保护）
  if (running.has(sourceId)) {
    await taskUpdate({
      where: { id: taskId },
      data: { status: "failed", message: "该源已有采集任务进行中", finishedAt: new Date() },
    });
    return;
  }
  running.add(sourceId);
  canceled.delete(taskId);
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
