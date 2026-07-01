import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";
import { createMetaTask } from "../collector/taskRunner.js";
import { matchDouban, doubanSuggest, doubanDetail } from "../collector/douban.js";

export default async function metaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // 批量元数据匹配（异步任务）
  app.post("/api/meta/batch", async (req) => {
    const b = (req.body as any) || {};
    const task = await createMetaTask({ limit: b.limit, intervalMs: b.intervalMs, redo: b.redo });
    return { taskId: task.id, message: "元数据匹配任务已提交，去「采集任务」看进度" };
  });

  // 单片即时匹配（后台手动，用于预览/确认）
  app.post("/api/meta/match/:id", async (req) => {
    const id = Number((req.params as any).id);
    const v = await prisma.vod.findUnique({ where: { id } });
    if (!v) return { ok: false, error: "影片不存在" };
    const r = await matchDouban(v.name, v.year);
    if (r.ok && r.meta) {
      await prisma.vod.update({
        where: { id },
        data: {
          doubanId: r.meta.doubanId, rating: r.meta.rating, ratingCount: r.meta.ratingCount,
          officialPic: r.meta.pic, officialIntro: r.meta.intro,
          genres: r.meta.genres.join(","), metaMatched: "matched", metaAt: new Date(),
        },
      });
    } else {
      await prisma.vod.update({ where: { id }, data: { metaMatched: "failed", metaAt: new Date() } });
    }
    return r;
  });

  // 候选搜索（人工确认用）
  app.get("/api/meta/suggest", async (req) => {
    const kw = (req.query as any).kw as string;
    if (!kw) return [];
    return doubanSuggest(kw);
  });

  // 人工指定豆瓣id（矫正匹配）
  app.post("/api/meta/set/:id", async (req) => {
    const id = Number((req.params as any).id);
    const { doubanId } = req.body as any;
    if (!doubanId) return { ok: false, error: "缺少 doubanId" };
    const meta = await doubanDetail(String(doubanId));
    if (!meta) return { ok: false, error: "豆瓣详情获取失败" };
    await prisma.vod.update({
      where: { id },
      data: {
        doubanId: meta.doubanId, rating: meta.rating, ratingCount: meta.ratingCount,
        officialPic: meta.pic, officialIntro: meta.intro,
        genres: meta.genres.join(","), metaMatched: "manual", metaAt: new Date(),
      },
    });
    return { ok: true, meta };
  });

  // 元数据配置：获取
  app.get("/api/meta/config", async () => {
    const c = await prisma.metaConfig.findUnique({ where: { id: 1 } });
    return c || prisma.metaConfig.create({ data: { id: 1 } });
  });

  // 元数据配置：更新
  app.put("/api/meta/config", async (req) => {
    const b = (req.body as any) || {};
    await prisma.metaConfig.upsert({
      where: { id: 1 },
      create: { id: 1, ...b },
      update: {
        intervalMs: b.intervalMs,
        batchLimit: b.batchLimit,
        autoMatch: b.autoMatch,
        cronExpr: b.cronExpr,
        redoFailed: b.redoFailed,
      },
    });
    const { reloadMetaSchedule } = await import("../scheduler.js");
    await reloadMetaSchedule();
    return { ok: true };
  });

  // 元数据统计
  app.get("/api/meta/stats", async () => {
    const [total, matched, failed, none] = await Promise.all([
      prisma.vod.count(),
      prisma.vod.count({ where: { metaMatched: { in: ["matched", "manual"] } } }),
      prisma.vod.count({ where: { metaMatched: "failed" } }),
      prisma.vod.count({ where: { metaMatched: "none" } }),
    ]);
    return { total, matched, failed, none };
  });
}
