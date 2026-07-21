import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";
import { writeAudit } from "./access.js";

type QcSeed = {
  issueKey: string;
  type: string;
  severity: string;
  title: string;
  targetType: string;
  targetId?: number | null;
  targetName?: string;
  sourceId?: number | null;
  sourceName?: string;
  detail?: any;
};

function json(value: any) {
  return JSON.stringify(value || {});
}

function parseJson(value: string) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function sinceDate(days: number) {
  return new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
}

async function upsertQcIssues(seeds: QcSeed[]) {
  const now = new Date();
  for (const seed of seeds) {
    await prisma.qcIssue.upsert({
      where: { issueKey: seed.issueKey },
      create: {
        issueKey: seed.issueKey,
        type: seed.type,
        severity: seed.severity,
        title: seed.title,
        targetType: seed.targetType,
        targetId: seed.targetId || null,
        targetName: seed.targetName || "",
        sourceId: seed.sourceId || null,
        sourceName: seed.sourceName || "",
        detail: json(seed.detail),
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        type: seed.type,
        severity: seed.severity,
        title: seed.title,
        targetType: seed.targetType,
        targetId: seed.targetId || null,
        targetName: seed.targetName || "",
        sourceId: seed.sourceId || null,
        sourceName: seed.sourceName || "",
        detail: json(seed.detail),
        lastSeenAt: now,
      },
    }).catch(() => {});
  }
}

async function scanQcIssues() {
  const [noLines, allDead, noCover, metaPending, hlsFailed, playbackHot] = await Promise.all([
    prisma.vod.findMany({
      where: { status: "online", plays: { none: {} } },
      select: { id: true, name: true, typeName: true, updatedAt: true },
      take: 100,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.vod.findMany({
      where: { status: "online", plays: { some: {} }, NOT: { plays: { some: { alive: true } } } },
      select: { id: true, name: true, typeName: true, _count: { select: { plays: true } } },
      take: 100,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.vod.findMany({
      where: { status: "online", pic: "", officialPic: "", localPic: "" },
      select: { id: true, name: true, typeName: true },
      take: 100,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.vod.findMany({
      where: { status: "online", OR: [{ metaMatched: "pending" }, { metaMatched: "none" }] },
      select: { id: true, name: true, typeName: true, metaMatched: true, metaScore: true },
      take: 100,
      orderBy: [{ metaScore: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.hlsCleanResult.findMany({
      where: { status: "failed" },
      select: { id: true, vodId: true, epIndex: true, epName: true, error: true, play: { select: { sourceId: true, source: { select: { name: true } }, vod: { select: { name: true } } } } },
      take: 100,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.playbackErrorLog.findMany({
      where: { createdAt: { gte: sinceDate(7) } },
      select: { vodId: true, playId: true, vodName: true, lineName: true, sourceName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
  ]);
  const playbackGroups = new Map<string, any>();
  for (const row of playbackHot) {
    const key = `${row.playId || ""}:${row.vodId || ""}:${row.vodName || ""}:${row.lineName || ""}`;
    const item = playbackGroups.get(key) || { ...row, count: 0, lastAt: row.createdAt };
    item.count += 1;
    if (row.createdAt > item.lastAt) item.lastAt = row.createdAt;
    playbackGroups.set(key, item);
  }
  const playbackHotRows = [...playbackGroups.values()].filter((row) => row.count >= 3).sort((a, b) => b.count - a.count).slice(0, 100);

  const seeds: QcSeed[] = [
    ...noLines.map((v) => ({
      issueKey: `vod:${v.id}:no_lines`,
      type: "no_lines",
      severity: "high",
      title: "无线路",
      targetType: "vod",
      targetId: v.id,
      targetName: v.name,
      detail: { typeName: v.typeName },
    })),
    ...allDead.map((v) => ({
      issueKey: `vod:${v.id}:all_dead`,
      type: "all_dead",
      severity: "critical",
      title: "全死链",
      targetType: "vod",
      targetId: v.id,
      targetName: v.name,
      detail: { typeName: v.typeName, playCount: v._count.plays },
    })),
    ...noCover.map((v) => ({
      issueKey: `vod:${v.id}:no_cover`,
      type: "no_cover",
      severity: "medium",
      title: "无封面",
      targetType: "vod",
      targetId: v.id,
      targetName: v.name,
      detail: { typeName: v.typeName },
    })),
    ...metaPending.map((v) => ({
      issueKey: `vod:${v.id}:meta_pending`,
      type: "meta_pending",
      severity: "medium",
      title: "元数据待确认",
      targetType: "vod",
      targetId: v.id,
      targetName: v.name,
      detail: { typeName: v.typeName, metaMatched: v.metaMatched, metaScore: v.metaScore },
    })),
    ...hlsFailed.map((r) => ({
      issueKey: `hls:${r.id}:failed`,
      type: "hls_failed",
      severity: "high",
      title: "HLS 清洗失败",
      targetType: "hls_clean_result",
      targetId: r.id,
      targetName: r.play?.vod?.name || `影片 ${r.vodId}`,
      sourceId: r.play?.sourceId || null,
      sourceName: r.play?.source?.name || "",
      detail: { vodId: r.vodId, epIndex: r.epIndex, epName: r.epName, error: r.error },
    })),
    ...playbackHotRows.map((r: any) => ({
      issueKey: `playback:${r.playId || r.vodId || r.vodName}:hot`,
      type: "playback_hot",
      severity: "high",
      title: "播放错误高发",
      targetType: r.playId ? "play" : "vod",
      targetId: Number(r.playId || r.vodId) || null,
      targetName: r.vodName || r.lineName || "未知播放对象",
      sourceName: r.sourceName || "",
      detail: { vodId: r.vodId, playId: r.playId, lineName: r.lineName, count: r.count || 0, lastAt: r.lastAt || null },
    })),
  ];
  await upsertQcIssues(seeds);
  return { scanned: seeds.length };
}

function qcWhere(q: any) {
  const where: any = {};
  if (q.type) where.type = String(q.type);
  if (q.status) where.status = String(q.status);
  if (q.assignee) where.assignee = { contains: String(q.assignee), mode: "insensitive" };
  if (q.keyword) {
    const kw = String(q.keyword).trim();
    where.OR = [
      { title: { contains: kw, mode: "insensitive" } },
      { targetName: { contains: kw, mode: "insensitive" } },
      { sourceName: { contains: kw, mode: "insensitive" } },
      { note: { contains: kw, mode: "insensitive" } },
    ];
  }
  return where;
}

async function sourceSla(days: number) {
  const since = sinceDate(days);
  const [sources, syncRows, errorRows] = await Promise.all([
    prisma.source.findMany({
      orderBy: [{ priority: "asc" }, { id: "asc" }],
      select: {
        id: true, name: true, enabled: true, status: true, lastError: true, lastSyncAt: true,
        plays: { select: { alive: true, checkMs: true, playSuccessCount: true, playFailureCount: true, lastFailureAt: true } },
      },
    }),
    prisma.syncLog.groupBy({
      by: ["sourceId"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { ms: true },
      _max: { createdAt: true },
    }),
    prisma.playbackErrorLog.findMany({
      where: { createdAt: { gte: since } },
      select: { sourceName: true, message: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 3000,
    }),
  ]);
  const syncMap = new Map(syncRows.map((row) => [row.sourceId, row]));
  const errorBySource = new Map<string, any[]>();
  const errorGrouped = new Map<string, any>();
  for (const row of errorRows as any[]) {
    const key = `${row.sourceName || ""}\n${row.message || ""}`;
    const item = errorGrouped.get(key) || { sourceName: row.sourceName, message: row.message, count: 0, lastAt: row.createdAt };
    item.count += 1;
    if (row.createdAt > item.lastAt) item.lastAt = row.createdAt;
    errorGrouped.set(key, item);
  }
  for (const row of [...errorGrouped.values()].sort((a, b) => b.count - a.count || Number(b.lastAt) - Number(a.lastAt))) {
    const key = String(row.sourceName || "");
    if (!errorBySource.has(key)) errorBySource.set(key, []);
    errorBySource.get(key)!.push(row);
  }
  const rows = sources.map((source) => {
    const plays = source.plays || [];
    const success = plays.reduce((n, p) => n + Number(p.playSuccessCount || 0), 0);
    const failure = plays.reduce((n, p) => n + Number(p.playFailureCount || 0), 0);
    const live = plays.filter((p) => p.alive).length;
    const checked = plays.filter((p) => p.checkMs > 0).length;
    const avgCheckMs = checked ? Math.round(plays.reduce((n, p) => n + Number(p.checkMs || 0), 0) / checked) : 0;
    const sync = syncMap.get(source.id);
    const errors = errorBySource.get(source.name) || [];
    const total = Math.max(1, success + failure);
    const successRate = Math.round((success / total) * 1000) / 10;
    const qualityScore = Math.round(successRate * 0.7 + (plays.length ? (live / plays.length) * 30 : 0));
    return {
      id: source.id,
      name: source.name,
      enabled: source.enabled,
      status: source.status,
      playCount: plays.length,
      aliveCount: live,
      success,
      failure,
      successRate,
      avgMs: Math.round(Number(sync?._avg?.ms || avgCheckMs || 0)),
      lastSyncAt: source.lastSyncAt,
      lastFailureAt: plays.map((p) => p.lastFailureAt).filter(Boolean).sort((a: any, b: any) => Number(b) - Number(a))[0] || null,
      lastFailureReason: errors[0]?.message || source.lastError || "",
      syncCount7Or30: sync?._count?._all || 0,
      qualityScore,
    };
  }).sort((a, b) => b.qualityScore - a.qualityScore || b.successRate - a.successRate);
  return { days, list: rows };
}

export default async function opsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/admin/qc/issues", async (req) => {
    await scanQcIssues();
    const q = (req.query as any) || {};
    const page = Math.max(1, Number(q.page) || 1);
    const size = Math.max(10, Math.min(200, Number(q.size) || 50));
    const where = qcWhere(q);
    const [total, summaryRows, list] = await Promise.all([
      prisma.qcIssue.count({ where }),
      prisma.qcIssue.groupBy({ by: ["type", "status"], where, _count: { _all: true } }),
      prisma.qcIssue.findMany({
        where,
        orderBy: [{ status: "asc" }, { severity: "asc" }, { lastSeenAt: "desc" }],
        skip: (page - 1) * size,
        take: size,
      }),
    ]);
    return { total, page, size, summary: summaryRows, list: list.map((row) => ({ ...row, detail: parseJson(row.detail) })) };
  });

  app.post("/api/admin/qc/issues/scan", async () => scanQcIssues());

  app.post("/api/admin/qc/issues/:id/:action", async (req, reply) => {
    const id = Number((req.params as any).id);
    const action = String((req.params as any).action || "");
    const b = (req.body as any) || {};
    const current = await prisma.qcIssue.findUnique({ where: { id } });
    if (!current) return reply.code(404).send({ error: "问题不存在" });
    const user = (req as any).user || {};
    const data: any = { note: b.note !== undefined ? String(b.note || "").slice(0, 1000) : current.note };
    if (action === "claim") {
      data.status = "claimed";
      data.assigneeId = user.uid || null;
      data.assignee = user.username || "";
    } else if (action === "handle") {
      data.status = "handling";
      data.handledAt = new Date();
      data.assigneeId = user.uid || current.assigneeId || null;
      data.assignee = user.username || current.assignee || "";
    } else if (action === "close") {
      data.status = "closed";
      data.closedAt = new Date();
    } else if (action === "review") {
      data.status = "reviewing";
      data.reviewedAt = new Date();
    } else {
      return reply.code(400).send({ error: "不支持的操作" });
    }
    const row = await prisma.qcIssue.update({ where: { id }, data });
    await writeAudit(req, `qc.${action}`, `QcIssue:${id}`, { before: current, after: row, result: "ok" });
    return { ok: true, issue: { ...row, detail: parseJson(row.detail) } };
  });

  app.get("/api/admin/source-sla", async (req) => {
    const days = [7, 30].includes(Number((req.query as any)?.days)) ? Number((req.query as any).days) : 7;
    const [current, week, month] = await Promise.all([sourceSla(days), sourceSla(7), sourceSla(30)]);
    return { ...current, trends: { "7": week.list, "30": month.list } };
  });
}
