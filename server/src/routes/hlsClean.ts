import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard, verifyPlaybackToken } from "../auth.js";
import {
  ensureHlsCleanConfig,
  HLS_STRATEGIES,
  normalizeHlsStrategyIds,
  updateHlsCleanConfig,
  upsertHlsCleanPolicy,
} from "../hls/cleaner.js";
import { createHlsCleanTask } from "../collector/taskRunner.js";

function parseJson(value: string, fallback: any) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

export default async function hlsCleanRoutes(app: FastifyInstance) {
  // 公开 clean m3u8，下发文本；TS 行已经是源站绝对地址，视频流量不走 Node
  app.get("/api/hls-clean/:id/index.m3u8", async (req, reply) => {
    const id = Number((req.params as any).id);
    const token = String((req.query as any)?.t || "");
    try {
      const data = verifyPlaybackToken(token);
      if (Number(data.cleanId) !== id) throw new Error("clean id mismatch");
    } catch {
      return reply.code(403).send("clean m3u8 access denied");
    }
    const cfg = await ensureHlsCleanConfig();
    if (!cfg.enabled) return reply.code(404).send("hls clean disabled");
    const row = await prisma.hlsCleanResult.findUnique({ where: { id } });
    if (!row || row.status !== "clean" || !row.cleanM3u8) return reply.code(404).send("clean m3u8 not found");
    reply.header("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
    reply.header("Cache-Control", "public, max-age=300");
    return reply.send(row.cleanM3u8);
  });

  app.register(async (admin) => {
    admin.addHook("preHandler", authGuard);

    admin.get("/api/admin/hls-clean/config", async () => ensureHlsCleanConfig());

    admin.put("/api/admin/hls-clean/config", async (req) => updateHlsCleanConfig(req.body));

    admin.get("/api/admin/hls-clean/overview", async () => {
      const [rawConfig, rawPolicies, sources, categories, statsRows, recent] = await Promise.all([
        ensureHlsCleanConfig(),
        prisma.hlsCleanPolicy.findMany({ orderBy: [{ scope: "asc" }, { targetName: "asc" }] }),
        prisma.source.findMany({ select: { id: true, name: true, enabled: true }, orderBy: { priority: "asc" } }),
        prisma.category.findMany({ select: { id: true, name: true, enabled: true }, orderBy: { sort: "asc" } }),
        prisma.hlsCleanResult.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.hlsCleanResult.findMany({
          orderBy: { checkedAt: "desc" },
          take: 20,
          select: {
            id: true, vodId: true, playId: true, sourceId: true, epIndex: true, epName: true, status: true,
            confidence: true, strategyId: true, error: true, checkedAt: true, adRanges: true,
          },
        }),
      ]);
      const stats = Object.fromEntries(statsRows.map((r) => [r.status, r._count._all]));
      const config = { ...rawConfig, defaultStrategies: normalizeHlsStrategyIds(rawConfig.defaultStrategy) };
      const policies = rawPolicies.map((p) => ({ ...p, strategyIds: normalizeHlsStrategyIds(p.strategyId, []) }));
      return {
        config,
        strategies: HLS_STRATEGIES,
        policies,
        sources,
        categories,
        stats,
        recent: recent.map((r) => ({ ...r, adRanges: parseJson(r.adRanges, []) })),
      };
    });

    admin.put("/api/admin/hls-clean/policy", async (req) => {
      const row = await upsertHlsCleanPolicy(req.body);
      return { ok: true, policy: row };
    });

    admin.delete("/api/admin/hls-clean/policy/:id", async (req) => {
      const id = Number((req.params as any).id);
      await prisma.hlsCleanPolicy.delete({ where: { id } });
      return { ok: true };
    });

    admin.post("/api/admin/hls-clean/tasks", async (req, reply) => {
      const b = (req.body as any) || {};
      const playIds = Array.isArray(b.playIds)
        ? b.playIds.map((x: any) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0)
        : undefined;
      const rangeMode = ["vod", "line", "batch"].includes(String(b.rangeMode || "")) ? String(b.rangeMode) : "";
      if ((rangeMode === "vod" || (b.vodId && !b.playId)) && (!playIds || !playIds.length)) {
        return reply.code(400).send({ error: "精确影片清洗必须选择具体线路" });
      }
      if (rangeMode === "line" && (!Number.isInteger(Number(b.playId)) || Number(b.playId) <= 0)) {
        return reply.code(400).send({ error: "请输入有效线路ID" });
      }
      if (rangeMode === "batch" && !b.sourceId && !b.categoryName) {
        return reply.code(400).send({ error: "批量清洗请至少选择采集源或分类" });
      }
      const strategyIds = normalizeHlsStrategyIds(b.strategyIds ?? b.strategyId, []);
      const task = await createHlsCleanTask({
        sourceId: b.sourceId ? Number(b.sourceId) : undefined,
        categoryName: b.categoryName ? String(b.categoryName) : undefined,
        vodId: b.vodId ? Number(b.vodId) : undefined,
        playId: b.playId ? Number(b.playId) : undefined,
        playIds,
        epIndex: b.epIndex === "" || b.epIndex === null || typeof b.epIndex === "undefined" ? undefined : Number(b.epIndex),
        episodeMode: b.episodeMode === "all" ? "all" : "first",
        limit: Math.max(1, Math.min(2000, Number(b.limit) || 100)),
        strategyIds: strategyIds.length ? strategyIds : undefined,
        dryRun: typeof b.dryRun === "boolean" ? b.dryRun : undefined,
      });
      return { ok: true, taskId: task.id };
    });

    admin.get("/api/admin/hls-clean/results", async (req) => {
      const q = req.query as any;
      const where: any = {};
      if (q.status) where.status = String(q.status);
      if (q.sourceId) where.sourceId = Number(q.sourceId);
      if (q.playId) where.playId = Number(q.playId);
      if (q.vodId) where.vodId = Number(q.vodId);
      const page = Math.max(1, Number(q.page) || 1);
      const size = Math.min(100, Number(q.size) || 30);
      const [total, list] = await Promise.all([
        prisma.hlsCleanResult.count({ where }),
        prisma.hlsCleanResult.findMany({
          where,
          orderBy: { checkedAt: "desc" },
          skip: (page - 1) * size,
          take: size,
        }),
      ]);
      return { total, list: list.map((r) => ({ ...r, adRanges: parseJson(r.adRanges, []), evidence: parseJson(r.evidence, {}) })) };
    });
  });
}
