import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";
import { createMetaTask } from "../collector/taskRunner.js";
import { matchDouban, doubanSuggest, doubanDetail, type DoubanCandidate, type DoubanMatchResult } from "../collector/douban.js";
import { applyDoubanAssets } from "../collector/metaAssets.js";

function candidateSnapshot(candidates: DoubanCandidate[]) {
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
    candidates: candidateSnapshot(r.candidates),
  });
}

function matchedData(r: DoubanMatchResult, status: "matched" | "pending") {
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

export default async function metaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // 批量元数据匹配（异步任务）
  app.post("/api/meta/batch", async (req) => {
    const b = (req.body as any) || {};
    const vodIds = Array.isArray(b.vodIds) ? b.vodIds.map((x: any) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0) : undefined;
    const task = await createMetaTask({
      limit: b.limit,
      intervalMs: b.intervalMs,
      redo: b.redo,
      status: b.status,
      sourceId: b.sourceId ? Number(b.sourceId) : undefined,
      categoryName: b.categoryName ? String(b.categoryName) : undefined,
      vodIds,
      priority: b.priority,
    });
    return { taskId: task.id, message: "元数据匹配任务已提交，去「采集任务」看进度" };
  });

  app.get("/api/meta/vods", async (req) => {
    const q = (req.query as any) || {};
    const page = Math.max(1, Number(q.page) || 1);
    const size = Math.min(100, Math.max(10, Number(q.size) || 20));
    const where: any = {};
    const status = String(q.status || "").trim();
    if (status && status !== "all") where.metaMatched = status;
    if (q.sourceId) where.plays = { some: { sourceId: Number(q.sourceId) } };
    if (q.categoryName) where.typeName = String(q.categoryName);
    if (q.kw) {
      const kw = String(q.kw);
      where.OR = [{ name: { contains: kw } }, { matchedTitle: { contains: kw } }];
    }
    const [total, list] = await Promise.all([
      prisma.vod.count({ where }),
      prisma.vod.findMany({
        where,
        orderBy: [{ metaAt: "desc" }, { updatedAt: "desc" }],
        skip: (page - 1) * size,
        take: size,
        include: { _count: { select: { plays: true } } },
      }),
    ]);
    return { total, page, size, list };
  });

  // 单片即时匹配（后台手动，用于预览/确认）
  app.post("/api/meta/match/:id", async (req) => {
    const id = Number((req.params as any).id);
    const v = await prisma.vod.findUnique({ where: { id } });
    if (!v) return { ok: false, error: "影片不存在" };
    const r = await matchDouban(v.name, v.year, { typeName: v.typeName, actor: v.actor, director: v.director });
    if (r.status === "matched" && r.meta) {
      await prisma.vod.update({
        where: { id },
        data: matchedData(r, "matched"),
      });
      await applyDoubanAssets(id, r.meta);
    } else if (r.status === "pending") {
      await prisma.vod.update({
        where: { id },
        data: matchedData(r, "pending"),
      });
    } else {
      await prisma.vod.update({
        where: { id },
        data: { metaMatched: "failed", metaScore: r.score, metaReason: metaReason(r), matchedTitle: "", matchedYear: "", metaAt: new Date() },
      });
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
        genres: meta.genres.join(","), metaMatched: "manual", metaScore: 100,
        metaReason: JSON.stringify({ score: 100, reasons: ["manual"], candidates: [{ id: meta.doubanId, title: meta.title, year: meta.year, score: 100, reasons: ["manual"] }] }),
        matchedTitle: meta.title, matchedYear: meta.year, metaAt: new Date(),
      },
    });
    await applyDoubanAssets(id, meta);
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
    const [total, matched, pending, failed, none] = await Promise.all([
      prisma.vod.count(),
      prisma.vod.count({ where: { metaMatched: { in: ["matched", "manual"] } } }),
      prisma.vod.count({ where: { metaMatched: "pending" } }),
      prisma.vod.count({ where: { metaMatched: "failed" } }),
      prisma.vod.count({ where: { metaMatched: "none" } }),
    ]);
    return { total, matched, pending, failed, none };
  });
}
