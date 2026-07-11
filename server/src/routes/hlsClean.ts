import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard, verifyPlaybackToken } from "../auth.js";
import { accessForType, viewerFromUserId } from "../publicVod.js";
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
    let tokenData: any = null;
    try {
      tokenData = verifyPlaybackToken(token);
      if (Number(tokenData.cleanId) !== id) throw new Error("clean id mismatch");
    } catch {
      return reply.code(403).send("clean m3u8 access denied");
    }
    const cfg = await ensureHlsCleanConfig();
    if (!cfg.enabled) return reply.code(404).send("hls clean disabled");
    const row = await prisma.hlsCleanResult.findUnique({ where: { id } });
    if (!row || row.status !== "clean" || !row.cleanM3u8) return reply.code(404).send("clean m3u8 not found");
    const vod = await prisma.vod.findUnique({ where: { id: row.vodId }, select: { typeName: true, status: true } });
    const viewer = tokenData?.mid ? await viewerFromUserId(Number(tokenData.mid)) : null;
    const watchAccess = vod?.status === "online" ? await accessForType(vod.typeName, "watch", viewer) : { allowed: false };
    if (!watchAccess.allowed) return reply.code(403).send("clean m3u8 access denied");
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

    // 结果列表：默认按“影片+源(playId)”聚合(grouped)；传 mode=flat 或 playId 时回逐集明细
    admin.get("/api/admin/hls-clean/results", async (req) => {
      const q = req.query as any;
      const status = q.status ? String(q.status) : "";
      const sourceId = q.sourceId ? Number(q.sourceId) : 0;
      const playId = q.playId ? Number(q.playId) : 0;
      const vodId = q.vodId ? Number(q.vodId) : 0;
      const kw = String(q.kw || "").trim();
      const page = Math.max(1, Number(q.page) || 1);
      const size = Math.min(100, Number(q.size) || 30);
      const grouped = String(q.mode || "grouped") === "grouped" && !playId;

      const where: any = {};
      if (status) where.status = status;
      if (sourceId) where.sourceId = sourceId;
      if (playId) where.playId = playId;
      if (vodId) where.vodId = vodId;

      // 按影片名筛选：先查匹配的 vodId 集
      if (kw) {
        const vods = await prisma.vod.findMany({
          where: { name: { contains: kw } },
          select: { id: true },
          take: 500,
        });
        const ids = vods.map((v) => v.id);
        where.vodId = ids.length ? { in: ids } : -1; // 无匹配则置空
      }

      // 非聚合(逐集明细)：供“展开某条线路”使用
      if (!grouped) {
        const [total, list] = await Promise.all([
          prisma.hlsCleanResult.count({ where }),
          prisma.hlsCleanResult.findMany({
            where,
            orderBy: [{ epIndex: "asc" }, { checkedAt: "desc" }],
            skip: (page - 1) * size,
            take: size,
          }),
        ]);
        return {
          mode: "flat",
          total,
          list: list.map((r) => ({ ...r, adRanges: parseJson(r.adRanges, []), evidence: parseJson(r.evidence, {}) })),
        };
      }

      // 聚合模式：一行 = 一条线路(playId)，带各状态计数 + 影片/源名
      const groups = await prisma.hlsCleanResult.groupBy({
        by: ["playId", "vodId", "sourceId"],
        where,
        _count: { _all: true },
        _max: { checkedAt: true },
      });
      groups.sort((a, b) => (b._max.checkedAt?.getTime() || 0) - (a._max.checkedAt?.getTime() || 0));
      const total = groups.length;
      const pageGroups = groups.slice((page - 1) * size, (page - 1) * size + size);

      // 批量拉各行的状态分布 + 名字
      const playIds = pageGroups.map((g) => g.playId);
      const vodIds = [...new Set(pageGroups.map((g) => g.vodId))];
      const sourceIds = [...new Set(pageGroups.map((g) => g.sourceId))];
      const [statusRows, vods, sources] = await Promise.all([
        playIds.length
          ? prisma.hlsCleanResult.groupBy({
              by: ["playId", "status"],
              where: { ...where, playId: { in: playIds } },
              _count: { _all: true },
            })
          : Promise.resolve([] as any[]),
        prisma.vod.findMany({ where: { id: { in: vodIds } }, select: { id: true, name: true, status: true } }),
        prisma.source.findMany({ where: { id: { in: sourceIds } }, select: { id: true, name: true } }),
      ]);
      const vodMap = new Map(vods.map((v) => [v.id, v]));
      const srcMap = new Map(sources.map((s) => [s.id, s]));
      const statusMap = new Map<number, Record<string, number>>();
      for (const r of statusRows as any[]) {
        const m = statusMap.get(r.playId) || {};
        m[r.status] = r._count._all;
        statusMap.set(r.playId, m);
      }
      const list = pageGroups.map((g) => ({
        playId: g.playId,
        vodId: g.vodId,
        sourceId: g.sourceId,
        vodName: vodMap.get(g.vodId)?.name || `#${g.vodId}`,
        vodStatus: vodMap.get(g.vodId)?.status || "",
        sourceName: srcMap.get(g.sourceId)?.name || `#${g.sourceId}`,
        episodes: g._count._all,
        lastCheckedAt: g._max.checkedAt,
        statusCounts: statusMap.get(g.playId) || {},
      }));
      return { mode: "grouped", total, list };
    });
  });
}
