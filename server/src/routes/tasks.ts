import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard, verifyToken } from "../auth.js";
import { requestCancel, createCollectTask, createMetaTask, createSubtypeTask, taskEvents, emitTaskChange } from "../collector/taskRunner.js";

export default async function taskRoutes(app: FastifyInstance) {
  // SSE 实时推送：任务变更时推送活跃任务快照（EventSource 不能带 header，故用 query token）
  // 注意：此路由在 authGuard 钩子之前注册，自行验证 token
  app.get("/api/tasks/stream", async (req, reply) => {
    const token = String((req.query as any).token || "");
    try { verifyToken(token); } catch { return reply.code(401).send({ error: "未登录" }); }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    let lastHash = "";
    const push = async () => {
      try {
        const list = await prisma.task.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
        const active = list.filter((t) => ["pending", "running"].includes(t.status)).length;
        const hash = JSON.stringify(list.map((t) => [t.id, t.status, t.progress, t.pageNow, t.added, t.updated, t.merged, t.message]));
        if (hash === lastHash) return;
        lastHash = hash;
        reply.raw.write(`data: ${JSON.stringify({ list, active })}\n\n`);
      } catch { /* ignore */ }
    };

    await push(); // 初始快照
    const onChange = () => { void push(); };
    taskEvents.on("changed", onChange);
    const hb = setInterval(() => reply.raw.write(": hb\n\n"), 25000); // 心跳保活

    req.raw.on("close", () => {
      clearInterval(hb);
      taskEvents.off("changed", onChange);
    });
  });

  // 以下需登录：包在独立作用域里加 authGuard，不影响上面的 SSE 流
  app.register(async (secured) => {
  secured.addHook("preHandler", authGuard);

  // 任务列表（分页 + 状态筛选）
  secured.get("/api/tasks", async (req) => {
    const q = req.query as any;
    const where: any = {};
    if (q.status) where.status = q.status;
    if (q.type) where.type = q.type;
    const [total, list] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(100, Number(q.size) || 30),
        skip: ((Math.max(1, Number(q.page) || 1)) - 1) * (Number(q.size) || 30),
      }),
    ]);
    return { total, list };
  });

  // 单任务
  secured.get("/api/tasks/:id", async (req) => {
    return prisma.task.findUnique({ where: { id: Number((req.params as any).id) } });
  });

  // 运行中任务数（前端角标）
  secured.get("/api/tasks/active/count", async () => {
    const n = await prisma.task.count({ where: { status: { in: ["pending", "running"] } } });
    return { active: n };
  });

  // 中止任务（运行中的标记取消，活执行器下一页停止；僵尸任务直接落库取消）
  secured.post("/api/tasks/:id/cancel", async (req) => {
    const id = Number((req.params as any).id);
    const t = await prisma.task.findUnique({ where: { id } });
    if (!t) return { ok: false, error: "任务不存在" };
    if (!["running", "pending"].includes(t.status)) return { ok: false, error: "任务非运行中，无需中止" };
    requestCancel(id); // 信号活执行器
    await prisma.task.update({
      where: { id },
      data: { status: "canceled", message: "已手动中止", finishedAt: new Date() },
    });
    emitTaskChange();
    return { ok: true };
  });

  // 重试任务（按原参数新建一个任务）
  secured.post("/api/tasks/:id/retry", async (req) => {
    const id = Number((req.params as any).id);
    const t = await prisma.task.findUnique({ where: { id } });
    if (!t) return { ok: false, error: "任务不存在" };
    let opts: any = {};
    try { opts = t.params ? JSON.parse(t.params) : {}; } catch {}
    if (t.type === "collect" && t.sourceId) {
      const nt = await createCollectTask(t.sourceId, opts);
      return { ok: true, taskId: nt.id };
    }
    if (t.type === "meta") {
      const nt = await createMetaTask(opts);
      return { ok: true, taskId: nt.id };
    }
    return { ok: false, error: "该类型不支持重试" };
  });

  // 触发补全小类任务
  secured.post("/api/tasks/backfill-subtypes", async () => {
    const t = await createSubtypeTask();
    return { ok: true, taskId: t.id };
  });

  // 清理已完成/失败任务
  secured.delete("/api/tasks/cleanup", async () => {
    const r = await prisma.task.deleteMany({ where: { status: { in: ["done", "failed", "canceled"] } } });
    emitTaskChange();
    return { removed: r.count };
  });
  }); // end secured register
}
