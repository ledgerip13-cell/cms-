import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";
import { invalidateAggregateCache } from "../aggregateCache.js";
import { createMetaTask } from "../collector/taskRunner.js";
import {
  AUTO_MATCH_SCORE,
  PENDING_MATCH_SCORE,
  matchDouban,
  doubanSuggest,
  pickOfficialPoster,
  type DoubanCandidate,
  type DoubanMatchResult,
} from "../collector/douban.js";
import { matchTmdb, tmdbSuggest } from "../collector/tmdb.js";
import { applyDoubanAssets, localizeMetaImages } from "../collector/metaAssets.js";
import { cleanText } from "../textClean.js";
import { enabledMetaProviders, metaProviderByKey, normalizeMetaProviders, type MetaProviderConfig } from "../metaProviders.js";

function candidateSnapshot(candidates: DoubanCandidate[]) {
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
    candidates: candidateSnapshot(r.candidates),
  });
}

function syncYearFromMeta(metaYear = "") {
  const year = String(metaYear || "").match(/(19|20)\d{2}/)?.[0] || "";
  return year ? { year } : {};
}

function matchedData(r: DoubanMatchResult, status: "matched" | "pending", officialPic = "") {
  const best = r.candidates[0];
  return {
    ...(status === "matched" && r.meta ? {
      metaSource: r.meta.source || "douban",
      metaSourceId: r.meta.sourceId || r.meta.doubanId,
      ...(r.meta.doubanId ? { doubanId: r.meta.doubanId } : {}),
      rating: r.meta.rating,
      ratingCount: r.meta.ratingCount,
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

function clampScore(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function metaVodWhere(q: any) {
  const where: any = {};
  const vodIds = Array.isArray(q.vodIds)
    ? q.vodIds.map((x: any) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  if (vodIds.length) where.id = { in: vodIds };
  const status = String(q.status || "").trim();
  if (status && status !== "all") where.metaMatched = status;
  if (q.sourceId) where.plays = { some: { sourceId: Number(q.sourceId) } };
  if (q.categoryName) where.typeName = String(q.categoryName);
  if (q.kw) {
    const kw = String(q.kw);
    where.OR = [{ name: { contains: kw } }, { matchedTitle: { contains: kw } }];
  }
  return where;
}

function metaTaskPayload(b: any, extra: Record<string, any> = {}) {
  return {
    limit: b.limit,
    intervalMs: b.intervalMs,
    redo: b.redo,
    status: b.status,
    sourceId: b.sourceId ? Number(b.sourceId) : undefined,
    categoryName: b.categoryName ? String(b.categoryName) : undefined,
    priority: b.priority,
    provider: b.provider ? String(b.provider) : undefined,
    matchConcurrency: b.matchConcurrency,
    concurrencyBatchSize: b.concurrencyBatchSize,
    autoMatchScore: b.autoMatchScore,
    pendingMatchScore: b.pendingMatchScore,
    ...extra,
  };
}

function chunks<T>(rows: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function runProviderMatch(provider: MetaProviderConfig, v: any): Promise<DoubanMatchResult> {
  const ctx = {
    typeName: v.typeName,
    actor: v.actor,
    director: v.director,
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

export default async function metaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // 批量元数据匹配（异步任务）
  app.post("/api/meta/batch", async (req) => {
    const b = (req.body as any) || {};
    const vodIds = Array.isArray(b.vodIds) ? b.vodIds.map((x: any) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0) : undefined;
    if (b.split) {
      const limit = clampInt(b.limit, 50, 1, 500);
      const where = metaVodWhere(b);
      const rows = await prisma.vod.findMany({
        where,
        orderBy: b.redo ? { metaAt: "asc" } : { id: "asc" },
        select: { id: true },
      });
      if (!rows.length) return { taskIds: [], total: 0, tasks: 0, message: "当前筛选没有可提交的影片" };
      const taskIds: number[] = [];
      for (const part of chunks(rows.map((row) => row.id), limit)) {
        const task = await createMetaTask(metaTaskPayload(b, {
          limit: part.length,
          vodIds: part,
          status: undefined,
          redo: true,
        }));
        taskIds.push(task.id);
      }
      return {
        taskIds,
        total: rows.length,
        tasks: taskIds.length,
        perTaskLimit: limit,
        message: `已提交 ${rows.length} 部，拆分为 ${taskIds.length} 个元数据任务`,
      };
    }
    const task = await createMetaTask({
      ...metaTaskPayload(b),
      vodIds,
    });
    return { taskId: task.id, message: "元数据匹配任务已提交，去「采集任务」看进度" };
  });

  app.get("/api/meta/vods", async (req) => {
    const q = (req.query as any) || {};
    const page = Math.max(1, Number(q.page) || 1);
    const size = Math.min(100, Math.max(10, Number(q.size) || 20));
    const where = metaVodWhere(q);
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
    const provider = String((req.body as any)?.provider || "");
    const r = await matchByConfiguredProviders(v, provider);
    if (r.status === "matched" && r.meta) {
      const officialPic = await pickOfficialPoster(r.meta, v.pic || v.localPic || "");
      const cfg = await prisma.metaConfig.findUnique({ where: { id: 1 }, select: { saveImages: true } });
      if (officialPic) r.meta.pic = officialPic;
      if (cfg?.saveImages) await localizeMetaImages(r.meta);
      await prisma.vod.update({
        where: { id },
        data: matchedData(r, "matched", r.meta.pic || officialPic),
      });
      if (syncYearFromMeta(r.meta.year).year) invalidateAggregateCache();
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
    const cfg = await prisma.metaConfig.findUnique({ where: { id: 1 } });
    const provider = String((req.query as any).provider || "");
    const providers = provider
      ? [metaProviderByKey(cfg?.providersConfig, provider)].filter(Boolean) as MetaProviderConfig[]
      : enabledMetaProviders(cfg?.providersConfig);
    const active = providers.length ? providers : [metaProviderByKey(cfg?.providersConfig, "douban")].filter(Boolean) as MetaProviderConfig[];
    const rows: DoubanCandidate[] = [];
    for (const item of active) {
      if (item.key === "tmdb") {
        const suggests = await tmdbSuggest(kw, { apiKey: item.apiKey, accessToken: item.accessToken }).catch(() => []);
        rows.push(...suggests.map((s) => ({ ...s, subTitle: s.sub_title || "", score: 0, titleSim: 0, reasons: [] } as any)));
      } else {
        const suggests = await doubanSuggest(kw).catch(() => []);
        rows.push(...suggests.map((s) => ({ ...s, source: "douban", sourceName: "豆瓣", subTitle: s.sub_title || "", score: 0, titleSim: 0, reasons: [] } as any)));
      }
    }
    return rows.slice(0, 20);
  });

  // 人工指定元数据源ID（矫正匹配）
  app.post("/api/meta/set/:id", async (req) => {
    const id = Number((req.params as any).id);
    const { doubanId, source, sourceId } = req.body as any;
    const provider = String(source || (doubanId ? "douban" : ""));
    const providerId = String(sourceId || doubanId || "");
    if (!providerId) return { ok: false, error: "缺少元数据源ID" };
    const v = await prisma.vod.findUnique({ where: { id }, select: { id: true } });
    if (!v) return { ok: false, error: "影片不存在" };
    const task = await createMetaTask({
      manualConfirm: true,
      vodId: id,
      provider,
      metaSourceId: providerId,
      doubanId: doubanId ? String(doubanId) : undefined,
      priority: 20,
    });
    return { ok: true, taskId: task.id, message: "已提交后台确认，稍后自动写入元数据" };
  });

  // 批量清理匹配记录/候选：只重置匹配状态，不删除影片和已入库资产
  app.post("/api/meta/clear", async (req) => {
    const b = (req.body as any) || {};
    const ids: number[] = [...new Set<number>((Array.isArray(b.ids) ? b.ids : [])
      .map((id: any) => Number(id))
      .filter((id: number) => Number.isInteger(id) && id > 0))]
      .slice(0, 500);
    if (!ids.length) return { ok: false, error: "未选择匹配记录" };
    const r = await prisma.vod.updateMany({
      where: { id: { in: ids } },
      data: {
        metaMatched: "none",
        metaScore: 0,
        metaReason: "",
        matchedTitle: "",
        matchedYear: "",
        metaAt: null,
      },
    });
    return { ok: true, count: r.count };
  });

  // 元数据配置：获取
  app.get("/api/meta/config", async () => {
    const c = await prisma.metaConfig.findUnique({ where: { id: 1 } });
    const row = c || await prisma.metaConfig.create({ data: { id: 1 } });
    return { ...row, providersConfig: normalizeMetaProviders(row.providersConfig) };
  });

  // 元数据配置：更新
  app.put("/api/meta/config", async (req) => {
    const b = (req.body as any) || {};
    const current = await prisma.metaConfig.findUnique({ where: { id: 1 } });
    const autoMatchScore = clampScore(b.autoMatchScore ?? current?.autoMatchScore, AUTO_MATCH_SCORE);
    const pendingMatchScore = Math.min(
      autoMatchScore,
      clampScore(b.pendingMatchScore ?? current?.pendingMatchScore, PENDING_MATCH_SCORE)
    );
    const data = {
      intervalMs: clampInt(b.intervalMs ?? current?.intervalMs, 2500, 1000, 10000),
      batchLimit: clampInt(b.batchLimit ?? current?.batchLimit, 50, 1, 500),
      autoMatchScore,
      pendingMatchScore,
      autoMatch: Boolean(b.autoMatch ?? current?.autoMatch ?? false),
      cronExpr: String(b.cronExpr || current?.cronExpr || "0 4 * * *"),
      redoFailed: Boolean(b.redoFailed ?? current?.redoFailed ?? false),
      saveImages: Boolean(b.saveImages ?? current?.saveImages ?? false),
      providersConfig: JSON.stringify(normalizeMetaProviders(b.providersConfig ?? current?.providersConfig)),
    };
    await prisma.metaConfig.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
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
