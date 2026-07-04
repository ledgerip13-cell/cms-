// 定时调度：按源 cronExpr 自动增量采集 + 周期性线路探活
import cron from "node-cron";
import { prisma } from "./db.js";
import { createCollectTask, createMetaTask } from "./collector/taskRunner.js";
import { probeBatch } from "./collector/probe.js";
import { parseAutoTypeIds } from "./sourceAutoTypes.js";

const tasks = new Map<number, ReturnType<typeof cron.schedule>>();
let metaTask: ReturnType<typeof cron.schedule> | null = null;

// 重新加载豆瓣元数据定时任务
export async function reloadMetaSchedule() {
  if (metaTask) { metaTask.stop(); metaTask = null; }
  const cfg = await prisma.metaConfig.findUnique({ where: { id: 1 } });
  if (!cfg || !cfg.autoMatch) return;
  const expr = cfg.cronExpr || "0 4 * * *";
  if (!cron.validate(expr)) { console.warn(`[meta] cron 无效: ${expr}`); return; }
  metaTask = cron.schedule(expr, async () => {
    try {
      await createMetaTask({ limit: cfg.batchLimit, intervalMs: cfg.intervalMs, redo: cfg.redoFailed });
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
  console.log("[scheduler] 调度器已启动（自动采集 + 20min探活）");
}
