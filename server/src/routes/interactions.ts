import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "crypto";
import { verifyToken, webUserGuard, authGuard } from "../auth.js";
import { prisma } from "../db.js";
import { clientIpOf } from "../logging.js";
import { writeAudit } from "./access.js";

const DEFAULT_INTERACTION_CONFIG = {
  commentsEnabled: true,
  commentRequireLogin: true,
  ratingsEnabled: true,
  ratingRequireLogin: true,
  requestsEnabled: true,
  requestRequireLogin: false,
  reportsEnabled: true,
  reportRequireLogin: false,
  messagesEnabled: true,
  danmakuEnabled: true,
  danmakuRequireLogin: true,
};

export function normalizeInteractionConfig(value: any) {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw || "{}"); } catch { raw = {}; }
  }
  raw = raw && typeof raw === "object" ? raw : {};
  return {
    ...DEFAULT_INTERACTION_CONFIG,
    ...raw,
    commentsEnabled: raw.commentsEnabled !== false,
    commentRequireLogin: raw.commentRequireLogin !== false,
    ratingsEnabled: raw.ratingsEnabled !== false,
    ratingRequireLogin: raw.ratingRequireLogin !== false,
    requestsEnabled: raw.requestsEnabled !== false,
    requestRequireLogin: raw.requestRequireLogin === true,
    reportsEnabled: raw.reportsEnabled !== false,
    reportRequireLogin: raw.reportRequireLogin === true,
    messagesEnabled: raw.messagesEnabled !== false,
    danmakuEnabled: raw.danmakuEnabled !== false,
    danmakuRequireLogin: raw.danmakuRequireLogin !== false,
  };
}

async function ensureSite() {
  const s = await prisma.siteConfig.findUnique({ where: { id: 1 } });
  if (s) return s;
  return prisma.siteConfig.create({ data: { id: 1, siteName: "", description: "", footer: "" } });
}

async function interactionConfig() {
  const site = await ensureSite();
  return normalizeInteractionConfig((site as any).interactionConfig);
}

function userAgentOf(req: FastifyRequest) {
  return String(req.headers["user-agent"] || "").slice(0, 500);
}

function sourceOf(value: any) {
  const source = String(value || "web").trim().toLowerCase();
  return ["pc", "mobile", "x8", "web", "api"].includes(source) ? source : "web";
}

function actorOf(req: FastifyRequest) {
  return String((req as any).user?.username || "").slice(0, 120);
}

function anonymousRatingKey(req: FastifyRequest) {
  const raw = `${clientIpOf(req)}|${userAgentOf(req)}`;
  return createHash("sha256").update(raw).digest("hex");
}

function positiveInt(value: any) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

async function optionalWebUser(req: FastifyRequest) {
  const h = String(req.headers.authorization || "");
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  try {
    const data: any = verifyToken(token);
    if (data?.kind !== "web" || !data?.mid) return null;
    const user = await prisma.webUser.findUnique({
      where: { id: Number(data.mid) },
      select: { id: true, username: true, nickname: true, enabled: true, banReason: true, bannedAt: true },
    });
    return user && user.enabled ? user : null;
  } catch {
    return null;
  }
}

async function requireConfiguredUser(req: FastifyRequest, reply: FastifyReply, required: boolean) {
  const user = await optionalWebUser(req);
  if (required && !user) {
    reply.code(401).send({ error: "请先登录" });
    return null;
  }
  return user;
}

function cleanContent(value: any, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").slice(0, 160);
}

function publicComment(row: any) {
  return {
    id: row.id,
    vodId: row.vodId,
    parentId: row.parentId,
    content: row.content,
    createdAt: row.createdAt,
    user: row.user ? { id: row.user.id, username: row.user.username, nickname: row.user.nickname || row.user.username } : null,
  };
}

async function recalcVodRating(vodId: number) {
  const agg = await prisma.userRating.aggregate({
    where: { vodId },
    _avg: { score: true },
    _count: { score: true },
  });
  const count = Number(agg._count.score || 0);
  const avg = count ? Number(((Number(agg._avg.score) || 0) / 2).toFixed(1)) : 0;
  await prisma.vod.update({ where: { id: vodId }, data: { userRatingAvg: avg, userRatingCount: count } }).catch(() => null);
  return { avg, count };
}

export default async function interactionRoutes(app: FastifyInstance) {
  app.get("/api/interactions/config", async () => interactionConfig());

  app.get("/api/admin/interactions/config", { preHandler: authGuard }, async () => interactionConfig());

  app.put("/api/admin/interactions/config", { preHandler: authGuard }, async (req) => {
    const cfg = normalizeInteractionConfig((req.body as any) || {});
    await ensureSite();
    const site = await prisma.siteConfig.update({
      where: { id: 1 },
      data: { interactionConfig: JSON.stringify(cfg) },
    });
    await writeAudit(req, "interaction_config.update", "SiteConfig:1", { interactionConfig: cfg });
    return normalizeInteractionConfig((site as any).interactionConfig);
  });

  app.get("/api/vods/:vodId/comments", async (req) => {
    const vodId = positiveInt((req.params as any).vodId);
    const q = (req.query as any) || {};
    const take = Math.min(100, Math.max(10, Number(q.limit) || 30));
    const rows = await prisma.comment.findMany({
      where: { vodId, status: "visible" },
      orderBy: { createdAt: "desc" },
      take,
      include: { user: { select: { id: true, username: true, nickname: true } } },
    });
    return rows.map(publicComment);
  });

  app.post("/api/vods/:vodId/comments", async (req, reply) => {
    const cfg = await interactionConfig();
    if (!cfg.commentsEnabled) return reply.code(403).send({ error: "评论已关闭" });
    const user = await requireConfiguredUser(req, reply, cfg.commentRequireLogin);
    if (cfg.commentRequireLogin && !user) return reply;
    const vodId = positiveInt((req.params as any).vodId);
    const b = (req.body as any) || {};
    const content = cleanContent(b.content, 500);
    if (!content) return reply.code(400).send({ error: "请输入评论内容" });
    const vod = await prisma.vod.findFirst({ where: { id: vodId, status: "online" }, select: { id: true } });
    if (!vod) return reply.code(404).send({ error: "影片不存在或已下架" });
    const row = await prisma.comment.create({
      data: {
        vodId,
        userId: user?.id || null,
        parentId: positiveInt(b.parentId) || null,
        content,
        source: sourceOf(b.source),
        ip: clientIpOf(req),
        userAgent: userAgentOf(req),
      },
      include: { user: { select: { id: true, username: true, nickname: true } } },
    });
    return publicComment(row);
  });

  app.get("/api/vods/:vodId/rating", async (req) => {
    const vodId = positiveInt((req.params as any).vodId);
    const [vod, user] = await Promise.all([
      prisma.vod.findUnique({ where: { id: vodId }, select: { userRatingAvg: true, userRatingCount: true } }),
      optionalWebUser(req),
    ]);
    let myScore = 0;
    if (user) {
      const mine = await prisma.userRating.findUnique({ where: { userId_vodId: { userId: user.id, vodId } }, select: { score: true } }).catch(() => null);
      myScore = Number(mine?.score || 0);
    } else {
      const anonymousKey = anonymousRatingKey(req);
      const mine = await prisma.userRating.findUnique({ where: { anonymousKey_vodId: { anonymousKey, vodId } }, select: { score: true } }).catch(() => null);
      myScore = Number(mine?.score || 0);
    }
    return { avg: vod?.userRatingAvg || 0, count: vod?.userRatingCount || 0, myScore };
  });

  app.post("/api/vods/:vodId/rating", async (req, reply) => {
    const cfg = await interactionConfig();
    if (!cfg.ratingsEnabled) return reply.code(403).send({ error: "评分已关闭" });
    const user = await requireConfiguredUser(req, reply, cfg.ratingRequireLogin);
    if (cfg.ratingRequireLogin && !user) return reply;
    const vodId = positiveInt((req.params as any).vodId);
    const score = Math.max(1, Math.min(10, Math.floor(Number(((req.body as any) || {}).score) || 0)));
    if (!score) return reply.code(400).send({ error: "评分无效" });
    const vod = await prisma.vod.findFirst({ where: { id: vodId, status: "online" }, select: { id: true } });
    if (!vod) return reply.code(404).send({ error: "影片不存在或已下架" });
    const source = sourceOf((req.body as any)?.source);
    const ip = clientIpOf(req);
    const userAgent = userAgentOf(req);
    if (user) {
      await prisma.userRating.upsert({
        where: { userId_vodId: { userId: user.id, vodId } },
        create: { userId: user.id, anonymousKey: null, vodId, score, source, ip, userAgent },
        update: { score, source, ip, userAgent },
      });
    } else {
      const anonymousKey = anonymousRatingKey(req);
      await prisma.userRating.upsert({
        where: { anonymousKey_vodId: { anonymousKey, vodId } },
        create: { userId: null, anonymousKey, vodId, score, source, ip, userAgent },
        update: { score, source, ip, userAgent },
      });
    }
    const rating = await recalcVodRating(vodId);
    return { ...rating, myScore: score };
  });

  app.post("/api/vod-requests", async (req, reply) => {
    const cfg = await interactionConfig();
    if (!cfg.requestsEnabled) return reply.code(403).send({ error: "求片已关闭" });
    const user = await requireConfiguredUser(req, reply, cfg.requestRequireLogin);
    if (cfg.requestRequireLogin && !user) return reply;
    const b = (req.body as any) || {};
    const title = cleanContent(b.title || b.kw, 120);
    if (!title) return reply.code(400).send({ error: "请输入片名" });
    const row = await prisma.vodRequest.create({
      data: {
        title,
        normalized: normalizeTitle(title),
        authorName: cleanContent(b.authorName || user?.nickname || user?.username || "匿名", 80),
        userId: user?.id || null,
        source: sourceOf(b.source),
        ip: clientIpOf(req),
        userAgent: userAgentOf(req),
      },
    });
    return row;
  });

  app.post("/api/reports", async (req, reply) => {
    const cfg = await interactionConfig();
    if (!cfg.reportsEnabled) return reply.code(403).send({ error: "举报已关闭" });
    const user = await requireConfiguredUser(req, reply, cfg.reportRequireLogin);
    if (cfg.reportRequireLogin && !user) return reply;
    const b = (req.body as any) || {};
    const reason = cleanContent(b.reason, 160);
    if (!reason) return reply.code(400).send({ error: "请选择举报原因" });
    const row = await prisma.userReport.create({
      data: {
        type: cleanContent(b.type || "vod", 40),
        targetId: positiveInt(b.targetId) || null,
        vodId: positiveInt(b.vodId) || null,
        userId: user?.id || null,
        reason,
        content: cleanContent(b.content, 500),
        source: sourceOf(b.source),
        ip: clientIpOf(req),
        userAgent: userAgentOf(req),
      },
    });
    return row;
  });

  app.get("/api/user/messages", { preHandler: webUserGuard }, async (req) => {
    const cfg = await interactionConfig();
    if (!cfg.messagesEnabled) return { total: 0, unread: 0, list: [] };
    const userId = Number((req as any).webUser.mid);
    const rows = await prisma.siteMessage.findMany({
      where: { status: "sent", OR: [{ recipientUserId: null }, { recipientUserId: userId }] },
      orderBy: { sentAt: "desc" },
      take: 100,
      include: { reads: { where: { userId }, select: { id: true } } },
    });
    const list = rows.map((row) => ({ ...row, read: row.reads.length > 0, reads: undefined }));
    return { total: list.length, unread: list.filter((x) => !x.read).length, list };
  });

  app.post("/api/user/messages/:id/read", { preHandler: webUserGuard }, async (req) => {
    const userId = Number((req as any).webUser.mid);
    const messageId = positiveInt((req.params as any).id);
    await prisma.siteMessageRead.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: { readAt: new Date() },
    });
    return { ok: true };
  });

  app.get("/api/vods/:vodId/danmaku", async (req) => {
    const vodId = positiveInt((req.params as any).vodId);
    const q = (req.query as any) || {};
    const epIndex = Math.max(0, Math.floor(Number(q.epIndex) || 0));
    const from = Math.max(0, Math.floor(Number(q.from) || 0));
    const to = Math.max(from + 1, Math.floor(Number(q.to) || from + 120));
    const rows = await prisma.danmaku.findMany({
      where: {
        vodId,
        epIndex,
        status: "visible",
        ...(q.playId ? { playId: positiveInt(q.playId) } : {}),
        timeSec: { gte: from, lte: to },
      },
      orderBy: [{ timeSec: "asc" }, { id: "asc" }],
      take: 300,
      include: { user: { select: { id: true, username: true, nickname: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      vodId: row.vodId,
      playId: row.playId,
      epIndex: row.epIndex,
      timeSec: row.timeSec,
      content: row.content,
      color: row.color,
      mode: row.mode,
      createdAt: row.createdAt,
      user: row.user ? { id: row.user.id, username: row.user.username, nickname: row.user.nickname || row.user.username } : null,
    }));
  });

  app.post("/api/vods/:vodId/danmaku", async (req, reply) => {
    const cfg = await interactionConfig();
    if (!cfg.danmakuEnabled) return reply.code(403).send({ error: "弹幕已关闭" });
    const user = await requireConfiguredUser(req, reply, cfg.danmakuRequireLogin);
    if (cfg.danmakuRequireLogin && !user) return reply;
    const vodId = positiveInt((req.params as any).vodId);
    const b = (req.body as any) || {};
    const content = cleanContent(b.content, 80);
    if (!content) return reply.code(400).send({ error: "请输入弹幕内容" });
    const row = await prisma.danmaku.create({
      data: {
        vodId,
        playId: positiveInt(b.playId) || null,
        epIndex: Math.max(0, Math.floor(Number(b.epIndex) || 0)),
        timeSec: Math.max(0, Math.floor(Number(b.timeSec) || 0)),
        content,
        color: /^#[0-9a-f]{6}$/i.test(String(b.color || "")) ? String(b.color) : "#ffffff",
        mode: ["scroll", "top", "bottom"].includes(String(b.mode)) ? String(b.mode) : "scroll",
        source: sourceOf(b.source),
        userId: user?.id || null,
        ip: clientIpOf(req),
        userAgent: userAgentOf(req),
      },
    });
    return row;
  });

  app.get("/api/admin/interactions/comments", { preHandler: authGuard }, async (req) => adminList(req, "comment"));
  app.get("/api/admin/interactions/ratings", { preHandler: authGuard }, async (req) => adminList(req, "rating"));
  app.get("/api/admin/interactions/requests", { preHandler: authGuard }, async (req) => adminList(req, "request"));
  app.get("/api/admin/interactions/reports", { preHandler: authGuard }, async (req) => adminList(req, "report"));
  app.get("/api/admin/interactions/messages", { preHandler: authGuard }, async (req) => adminList(req, "message"));
  app.get("/api/admin/interactions/danmaku", { preHandler: authGuard }, async (req) => adminList(req, "danmaku"));

  app.patch("/api/admin/interactions/comments/:id", { preHandler: authGuard }, async (req, reply) => updateStatus(req, reply, "comment"));
  app.patch("/api/admin/interactions/requests/:id", { preHandler: authGuard }, async (req, reply) => updateStatus(req, reply, "request"));
  app.patch("/api/admin/interactions/reports/:id", { preHandler: authGuard }, async (req, reply) => updateStatus(req, reply, "report"));
  app.patch("/api/admin/interactions/danmaku/:id", { preHandler: authGuard }, async (req, reply) => updateStatus(req, reply, "danmaku"));

  app.post("/api/admin/interactions/messages", { preHandler: authGuard }, async (req, reply) => {
    const b = (req.body as any) || {};
    const title = cleanContent(b.title, 120);
    const content = cleanContent(b.content, 1200);
    if (!title || !content) return reply.code(400).send({ error: "标题和内容不能为空" });
    const recipientUserId = positiveInt(b.recipientUserId) || null;
    const row = await prisma.siteMessage.create({
      data: { title, content, recipientUserId, sentBy: actorOf(req), status: "sent" },
    });
    await writeAudit(req, "site_message.create", `SiteMessage:${row.id}`, { title, recipientUserId });
    return row;
  });

  app.patch("/api/admin/interactions/messages/:id", { preHandler: authGuard }, async (req, reply) => updateStatus(req, reply, "message"));
}

async function adminList(req: FastifyRequest, kind: string) {
  const q = (req.query as any) || {};
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(q.pageSize || q.size) || 30));
  const kw = String(q.kw || "").trim();
  const status = String(q.status || "").trim();
  const skip = (page - 1) * pageSize;
  if (kind === "comment") {
    const where: any = {};
    if (status) where.status = status;
    if (kw) where.OR = [{ content: { contains: kw, mode: "insensitive" } }, { ip: { contains: kw } }, { vod: { name: { contains: kw, mode: "insensitive" } } }, { user: { username: { contains: kw, mode: "insensitive" } } }];
    const [total, list] = await Promise.all([
      prisma.comment.count({ where }),
      prisma.comment.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { user: true, vod: { select: { id: true, name: true } } } }),
    ]);
    return { total, page, pageSize, list };
  }
  if (kind === "rating") {
    const where: any = {};
    if (kw) where.OR = [{ ip: { contains: kw } }, { vod: { name: { contains: kw, mode: "insensitive" } } }, { user: { username: { contains: kw, mode: "insensitive" } } }];
    const [total, list] = await Promise.all([
      prisma.userRating.count({ where }),
      prisma.userRating.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: pageSize, include: { user: true, vod: { select: { id: true, name: true } } } }),
    ]);
    return { total, page, pageSize, list };
  }
  if (kind === "request") {
    const where: any = {};
    if (status) where.status = status;
    if (kw) where.OR = [{ title: { contains: kw, mode: "insensitive" } }, { authorName: { contains: kw, mode: "insensitive" } }, { ip: { contains: kw } }];
    const [total, list] = await Promise.all([
      prisma.vodRequest.count({ where }),
      prisma.vodRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { user: true, matchedVod: { select: { id: true, name: true } } } }),
    ]);
    return { total, page, pageSize, list };
  }
  if (kind === "report") {
    const where: any = {};
    if (status) where.status = status;
    if (kw) where.OR = [{ reason: { contains: kw, mode: "insensitive" } }, { content: { contains: kw, mode: "insensitive" } }, { ip: { contains: kw } }, { vod: { name: { contains: kw, mode: "insensitive" } } }, { user: { username: { contains: kw, mode: "insensitive" } } }];
    const [total, list] = await Promise.all([
      prisma.userReport.count({ where }),
      prisma.userReport.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { user: true, vod: { select: { id: true, name: true } } } }),
    ]);
    return { total, page, pageSize, list };
  }
  if (kind === "message") {
    const where: any = {};
    if (status) where.status = status;
    if (kw) where.OR = [{ title: { contains: kw, mode: "insensitive" } }, { content: { contains: kw, mode: "insensitive" } }, { recipient: { username: { contains: kw, mode: "insensitive" } } }];
    const [total, list] = await Promise.all([
      prisma.siteMessage.count({ where }),
      prisma.siteMessage.findMany({ where, orderBy: { sentAt: "desc" }, skip, take: pageSize, include: { recipient: true, _count: { select: { reads: true } } } }),
    ]);
    return { total, page, pageSize, list };
  }
  const where: any = {};
  if (status) where.status = status;
  if (kw) where.OR = [{ content: { contains: kw, mode: "insensitive" } }, { ip: { contains: kw } }, { vod: { name: { contains: kw, mode: "insensitive" } } }, { user: { username: { contains: kw, mode: "insensitive" } } }];
  const [total, list] = await Promise.all([
    prisma.danmaku.count({ where }),
    prisma.danmaku.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { user: true, vod: { select: { id: true, name: true } } } }),
  ]);
  return { total, page, pageSize, list };
}

async function updateStatus(req: FastifyRequest, reply: FastifyReply, kind: string) {
  const id = positiveInt((req.params as any).id);
  const b = (req.body as any) || {};
  const status = cleanContent(b.status, 40);
  const note = cleanContent(b.note, 500);
  const actor = actorOf(req);
  let row: any = null;
  if (kind === "comment") {
    if (!["visible", "hidden", "deleted"].includes(status)) return reply.code(400).send({ error: "状态无效" });
    row = await prisma.comment.update({ where: { id }, data: { status } }).catch(() => null);
  } else if (kind === "request") {
    if (!["pending", "collecting", "done", "rejected"].includes(status)) return reply.code(400).send({ error: "状态无效" });
    row = await prisma.vodRequest.update({ where: { id }, data: { status, note, handledBy: actor, handledAt: status === "pending" ? null : new Date() } }).catch(() => null);
  } else if (kind === "report") {
    if (!["pending", "handling", "resolved", "rejected"].includes(status)) return reply.code(400).send({ error: "状态无效" });
    row = await prisma.userReport.update({ where: { id }, data: { status, handledBy: actor, handledNote: note, handledAt: status === "pending" ? null : new Date() } }).catch(() => null);
  } else if (kind === "message") {
    if (!["draft", "sent", "archived"].includes(status)) return reply.code(400).send({ error: "状态无效" });
    row = await prisma.siteMessage.update({ where: { id }, data: { status } }).catch(() => null);
  } else {
    if (!["visible", "hidden", "deleted"].includes(status)) return reply.code(400).send({ error: "状态无效" });
    row = await prisma.danmaku.update({ where: { id }, data: { status } }).catch(() => null);
  }
  if (!row) return reply.code(404).send({ error: "记录不存在" });
  await writeAudit(req, `interaction.${kind}.update`, `${kind}:${id}`, { status, note });
  return row;
}
