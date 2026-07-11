// 定时调度：按源 cronExpr 自动增量采集 + 周期性线路探活
import cron from "node-cron";
import { prisma } from "./db.js";
import { createCollectTask, createHlsCleanTask, createMetaTask } from "./collector/taskRunner.js";
import { refreshVod } from "./collector/sync.js";
import { probeBatch } from "./collector/probe.js";
import { parseAutoTypeIds } from "./sourceAutoTypes.js";

const tasks = new Map<number, ReturnType<typeof cron.schedule>>();
let metaTask: ReturnType<typeof cron.schedule> | null = null;

// 重新加载元数据定时任务
export async function reloadMetaSchedule() {
  if (metaTask) { metaTask.stop(); metaTask = null; }
  const cfg = await prisma.metaConfig.findUnique({ where: { id: 1 } });
  if (!cfg || !cfg.autoMatch) return;
  const expr = cfg.cronExpr || "0 4 * * *";
  if (!cron.validate(expr)) { console.warn(`[meta] cron 无效: ${expr}`); return; }
  metaTask = cron.schedule(expr, async () => {
    try {
      await createMetaTask({ redo: cfg.redoFailed });
      console.log("[meta] 已创建定时元数据匹配任务");
    } catch (e: any) {
      console.error("[meta] 创建任务失败:", e?.message);
    }
  });
  console.log(`[meta] 定时元数据匹配已启用: ${expr}`);
}

// 重新加载所有自动采集源的定时任务
export async function reloadSchedules() {
  for (const [, t] of tasks) t.stop();
  tasks.clear();
  const sources = await prisma.source.findMany({
    where: { autoSync: true, enabled: true },
  });
  for (const s of sources) {
    const expr = s.cronExpr || "0 * * * *";
    if (!cron.validate(expr)) {
      console.warn(`[scheduler] 源#${s.id} cron 无效: ${expr}`);
      continue;
    }
    const task = cron.schedule(expr, async () => {
      try {
        const typeIds = parseAutoTypeIds(s.autoTypeId);
        const targets = typeIds.length ? typeIds : [undefined];
        for (const typeId of targets) {
          await createCollectTask(s.id, {
            mode: "incr",
            hours: s.syncHours || 24,
            typeId,
            autoRun: true,
            metaAfterCollect: true,
          });
        }
        console.log(`[scheduler] 源#${s.id} ${s.name} 已创建定时采集任务${typeIds.length ? ` types=${typeIds.join(",")}` : " type=全部"}`);
      } catch (e: any) {
        console.error(`[scheduler] 源#${s.id} 创建任务失败:`, e?.message);
      }
    });
    tasks.set(s.id, task);
  }
  console.log(`[scheduler] 已加载 ${tasks.size} 个自动采集任务`);
}

let probing = false;
let vodAutoCollecting = false;

function parseWeekdays(value: unknown) {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw || "[]"); } catch { raw = []; }
  }
  return [...new Set((Array.isArray(raw) ? raw : [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))]
    .sort((a, b) => a - b);
}

function nextVodAutoCollectAt(vod: { autoCollectMode?: string; autoCollectIntervalDays?: number; autoCollectIntervalHours?: number; autoCollectWeekdays?: string }) {
  const now = new Date();
  if (vod.autoCollectMode === "weekdays") {
    const weekdays = parseWeekdays(vod.autoCollectWeekdays);
    const targets = weekdays.length ? weekdays : [1];
    for (let offset = 0; offset <= 14; offset++) {
      const d = new Date(now);
      d.setDate(now.getDate() + offset);
      d.setHours(4, 0, 0, 0);
      const weekday = d.getDay() === 0 ? 7 : d.getDay();
      if (targets.includes(weekday) && d.getTime() > now.getTime() + 60_000) return d;
    }
  }
  const days = Math.max(1, Math.min(30, Number(vod.autoCollectIntervalDays) || Math.ceil((Number(vod.autoCollectIntervalHours) || 24) / 24) || 1));
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

async function runVodAutoCollectDue() {
  if (vodAutoCollecting) return;
  vodAutoCollecting = true;
  const now = new Date();
  try {
    const rows = await prisma.vod.findMany({
      where: {
        autoCollectEnabled: true,
        autoCollectIntervalHours: { gt: 0 },
        OR: [
          { autoCollectNextAt: null },
          { autoCollectNextAt: { lte: now } },
        ],
      },
      select: {
        id: true,
        name: true,
        autoCollectIntervalHours: true,
        autoCollectMode: true,
        autoCollectIntervalDays: true,
        autoCollectWeekdays: true,
        autoCollectMeta: true,
        autoCollectClean: true,
      },
      orderBy: [{ autoCollectNextAt: "asc" }, { id: "asc" }],
      take: 20,
    });
    for (const vod of rows) {
      const nextAt = nextVodAutoCollectAt(vod);
      try {
        await prisma.vod.update({
          where: { id: vod.id },
          data: { autoCollectLastAt: now, autoCollectNextAt: nextAt },
        });
        await refreshVod(vod.id);
        if (vod.autoCollectMeta) await createMetaTask({ vodIds: [vod.id], limit: 1, redo: true, priority: 70 });
        if (vod.autoCollectClean) await createHlsCleanTask({ vodId: vod.id, episodeMode: "first", limit: 20, priority: 90 });
        console.log(`[vod-auto] 已刷新影片#${vod.id} ${vod.name}，下次 ${nextAt.toISOString()}`);
      } catch (e: any) {
        console.error(`[vod-auto] 影片#${vod.id} 刷新失败:`, e?.message || e);
        await prisma.vod.update({
          where: { id: vod.id },
          data: { autoCollectNextAt: nextAt },
        }).catch(() => {});
      }
    }
  } finally {
    vodAutoCollecting = false;
  }
}

export function startScheduler() {
  reloadSchedules();
  reloadMetaSchedule();
  // 每 20 分钟探活一批（最久未检测优先）
  cron.schedule("*/20 * * * *", async () => {
    if (probing) return;
    probing = true;
    try {
      const r = await probeBatch(80);
      if (r.checked) console.log(`[probe] 探活 ${r.checked} 条: 存活${r.alive} 死链${r.dead}`);
    } catch (e: any) {
      console.error("[probe] 失败:", e?.message);
    } finally {
      probing = false;
    }
  });
  cron.schedule("*/10 * * * *", async () => {
    try {
      await runVodAutoCollectDue();
    } catch (e: any) {
      console.error("[vod-auto] 扫描失败:", e?.message || e);
    }
  });
  console.log("[scheduler] 调度器已启动（自动采集 + 单片周期采集 + 20min探活）");
}
