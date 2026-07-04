import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard, verifyToken } from "../auth.js";
import { requestCancel, requestPause, clearPause, wakeTaskQueues, createCollectTask, createMetaTask, createSubtypeTask, createKeywordTask, createKeywordConfirmTask, createHlsCleanTask, taskEvents, emitTaskChange } from "../collector/taskRunner.js";
import { previewByKeyword } from "../collector/sync.js";

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
        const active = list.filter((t) => ["pending", "running", "paused", "canceling"].includes(t.status)).length;
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
    const n = await prisma.task.count({ where: { status: { in: ["pending", "running", "paused", "canceling"] } } });
    return { active: n };
  });

  // 中止任务：排队任务直接取消；运行中任务先置为中止中，等执行器收尾后落为取消。
  secured.post("/api/tasks/:id/cancel", async (req) => {
    const id = Number((req.params as any).id);
    const t = await prisma.task.findUnique({ where: { id } });
    if (!t) return { ok: false, error: "任务不存在" };
    if (t.status === "canceling") return { ok: true };
    if (!["running", "pending", "paused"].includes(t.status)) return { ok: false, error: "任务非运行中，无需中止" };
    requestCancel(id); // 信号活执行器
    await prisma.task.update({
      where: { id },
      data: t.status === "pending" || t.status === "paused"
        ? { status: "canceled", message: "已手动中止", finishedAt: new Date() }
        : { status: "canceling", message: "正在中止，当前步骤完成后停止", finishedAt: null },
    });
    emitTaskChange();
    wakeTaskQueues();
    return { ok: true };
  });

  secured.post("/api/tasks/:id/pause", async (req) => {
    const id = Number((req.params as any).id);
    const t = await prisma.task.findUnique({ where: { id } });
    if (!t) return { ok: false, error: "任务不存在" };
    if (t.status === "paused") return { ok: true };
    if (!["pending", "running"].includes(t.status)) return { ok: false, error: "只有排队或运行中的任务可暂停" };
    requestPause(id);
    if (t.status === "pending") {
      await prisma.task.update({ where: { id }, data: { status: "paused", message: "已暂停", finishedAt: null } });
    } else {
      await prisma.task.update({ where: { id }, data: { message: "正在暂停，当前步骤完成后停止" } });
    }
    emitTaskChange();
    return { ok: true };
  });

  secured.post("/api/tasks/:id/resume", async (req) => {
    const id = Number((req.params as any).id);
    const t = await prisma.task.findUnique({ where: { id } });
    if (!t) return { ok: false, error: "任务不存在" };
    if (t.status !== "paused") return { ok: false, error: "只有已暂停任务可恢复" };
    clearPause(id);
    await prisma.task.update({ where: { id }, data: { status: "pending", message: "已恢复排队", finishedAt: null } });
    emitTaskChange();
    wakeTaskQueues();
    return { ok: true };
  });

  secured.patch("/api/tasks/:id/priority", async (req) => {
    const id = Number((req.params as any).id);
    const priority = Math.max(1, Math.min(999, Math.floor(Number((req.body as any)?.priority) || 100)));
    const t = await prisma.task.findUnique({ where: { id } });
    if (!t) return { ok: false, error: "任务不存在" };
    if (!["pending", "paused"].includes(t.status)) return { ok: false, error: "只有排队或暂停任务可调整优先级" };
    await prisma.task.update({ where: { id }, data: { priority } });
    emitTaskChange();
    wakeTaskQueues();
    return { ok: true, priority };
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
    if (t.type === "keyword" && Array.isArray(opts.candidates) && opts.candidates.length) {
      const nt = await createKeywordConfirmTask(opts.keyword || "", opts.candidates);
      return { ok: true, taskId: nt.id };
    }
    if (t.type === "keyword" && opts.keyword) {
      const nt = await createKeywordTask(opts.keyword);
      return { ok: true, taskId: nt.id };
    }
    if (t.type === "hls_clean") {
      const nt = await createHlsCleanTask(opts);
      return { ok: true, taskId: nt.id };
    }
    return { ok: false, error: "该类型不支持重试" };
  });

  // 按片名单独采集（旧版一步到位，仍保留兼容）：遍历所有启用源搜索关键词入库
  secured.post("/api/collect/keyword", async (req) => {
    const kw = String((req.body as any)?.keyword || "").trim();
    if (!kw) return { ok: false, error: "片名不能为空" };
    if (kw.length > 40) return { ok: false, error: "片名过长" };
    try {
      const t = await createKeywordTask(kw);
      return { ok: true, taskId: t.id };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // 按片名预览：只搜索不入库，按(标准化片名+年份)分组返回命中源列表，供前端展示"龙珠GT 3个源"这类卡片让用户选
  secured.get("/api/collect/keyword/preview", async (req) => {
    const kw = String((req.query as any)?.kw || "").trim();
    if (!kw) return { ok: false, error: "片名不能为空" };
    if (kw.length > 40) return { ok: false, error: "片名过长" };
    try {
      return await previewByKeyword(kw);
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // 按片名确认采集：仅对用户勾选的候选(sourceId+vodIds)拉详情入库
  secured.post("/api/collect/keyword/confirm", async (req) => {
    const b = (req.body as any) || {};
    const keyword = String(b.keyword || "").trim();
    const candidates = Array.isArray(b.candidates) ? b.candidates : [];
    if (!candidates.length) return { ok: false, error: "未选择任何候选" };
    try {
      const t = await createKeywordConfirmTask(keyword, candidates);
      return { ok: true, taskId: t.id };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
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
