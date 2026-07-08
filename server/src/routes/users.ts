import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard, checkPassword, hashPassword, signWebToken, webUserGuard } from "../auth.js";
import { enabledTypeNames, publicPlayableFilter, publicPlayCountSelect, publicTypeFilter, viewerFromUserId, watchableTypeNames } from "../publicVod.js";
import { ensureDefaultVipLevel, isVipLevelActive, publicVipLevel } from "../vipLevels.js";
import { clearLoginFailures, recordLoginFailure, rejectLimitedLogin } from "../loginRateLimit.js";

const RECOMMENDATION_CACHE_TTL_MS = 60_000;
const recommendationCache = new Map<string, { ts: number; data: any }>();

function recommendationCacheKey(userId: number, take: number) {
  return `${userId}:${take}`;
}

function getRecommendationCache(userId: number, take: number) {
  const key = recommendationCacheKey(userId, take);
  const hit = recommendationCache.get(key);
  if (!hit || Date.now() - hit.ts > RECOMMENDATION_CACHE_TTL_MS) {
    recommendationCache.delete(key);
    return null;
  }
  return hit.data;
}

function setRecommendationCache(userId: number, take: number, data: any) {
  recommendationCache.set(recommendationCacheKey(userId, take), { ts: Date.now(), data });
  if (recommendationCache.size > 500) {
    const oldest = recommendationCache.keys().next().value;
    if (oldest) recommendationCache.delete(oldest);
  }
}

function invalidateUserRecommendation(userId: number) {
  const prefix = `${userId}:`;
  for (const key of recommendationCache.keys()) {
    if (key.startsWith(prefix)) recommendationCache.delete(key);
  }
}

function parseJsonArray(value: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(value || "[]");
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];
  } catch {
    return [];
  }
}

function normalizeTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 12);
}

function publicUser(u: { id: number; username: string; nickname: string; favoriteTypes: string; vipExpireAt?: Date | null; vipLevel?: any | null }) {
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    favoriteTypes: parseJsonArray(u.favoriteTypes),
    isVip: isVipLevelActive(u),
    vipExpireAt: u.vipExpireAt || null,
    vipLevel: publicVipLevel(u.vipLevel),
  };
}

function adminUser(u: {
  id: number;
  username: string;
  nickname: string;
  enabled: boolean;
  vipExpireAt: Date | null;
  vipLevel?: any | null;
  favoriteTypes: string;
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { follows: number; histories: number };
}) {
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    enabled: u.enabled,
    isVip: isVipLevelActive(u),
    vipExpireAt: u.vipExpireAt,
    vipLevel: publicVipLevel(u.vipLevel),
    favoriteTypes: parseJsonArray(u.favoriteTypes),
    lastLogin: u.lastLogin,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    followCount: u._count?.follows ?? 0,
    historyCount: u._count?.histories ?? 0,
  };
}

async function consumeInviteCode(code: string, userId: number) {
  if (!code) return false;
  const invite = await prisma.inviteCode.findUnique({ where: { code } });
  const now = new Date();
  if (!invite || !invite.enabled) return false;
  if (invite.expiresAt && invite.expiresAt <= now) return false;
  if (invite.usedCount >= invite.maxUses) return false;
  await prisma.inviteCode.update({
    where: { id: invite.id },
    data: { usedCount: { increment: 1 }, usedById: userId, usedAt: now },
  });
  return true;
}

async function ensureSite() {
  const s = await prisma.siteConfig.findUnique({ where: { id: 1 } });
  if (s) return s;
  return prisma.siteConfig.create({ data: { id: 1, siteName: "", description: "", footer: "" } });
}

async function pickRecommendationTypes(userId: number, favoriteTypes: string[]) {
  const viewer = await viewerFromUserId(userId);
  const publicTypes = await watchableTypeNames(viewer);
  const watchableFavorites = favoriteTypes.filter((type) => publicTypes.includes(type));
  if (watchableFavorites.length) return { source: "favoriteTypes", types: watchableFavorites, publicTypes };
  const rows = await prisma.watchHistory.findMany({
    where: { userId, vod: { status: "online", typeName: publicTypeFilter(publicTypes) } },
    orderBy: { updatedAt: "desc" },
    take: 30,
    include: { vod: { select: { typeName: true } } },
  });
  const fromHistory = [...new Set(rows.map((r) => r.vod.typeName).filter(Boolean))].slice(0, 6);
  if (fromHistory.length) return { source: "history", types: fromHistory, publicTypes };
  const follows = await prisma.userFollow.findMany({
    where: { userId, vod: { status: "online", typeName: publicTypeFilter(publicTypes) } },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { vod: { select: { typeName: true } } },
  });
  const fromFollows = [...new Set(follows.map((r) => r.vod.typeName).filter(Boolean))].slice(0, 6);
  return fromFollows.length ? { source: "follows", types: fromFollows, publicTypes } : { source: "hot", types: [], publicTypes };
}

export default async function userRoutes(app: FastifyInstance) {
  app.get("/api/admin/users", { preHandler: authGuard }, async (req) => {
    const q = (req.query as any) || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(q.pageSize) || 20));
    const kw = String(q.kw || "").trim();
    const status = String(q.status || "").trim();
    const where: any = {};
    if (kw) {
      where.OR = [
        { username: { contains: kw, mode: "insensitive" } },
        { nickname: { contains: kw, mode: "insensitive" } },
      ];
    }
    if (status === "enabled") where.enabled = true;
    if (status === "disabled") where.enabled = false;
    const [total, list] = await Promise.all([
      prisma.webUser.count({ where }),
      prisma.webUser.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { follows: true, histories: true } }, vipLevel: true },
      }),
    ]);
    return { total, page, pageSize, list: list.map(adminUser) };
  });

  app.get("/api/admin/users/:id", { preHandler: authGuard }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const u = await prisma.webUser.findUnique({
      where: { id },
      include: {
        _count: { select: { follows: true, histories: true } },
        vipLevel: true,
        follows: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { vod: { select: { id: true, name: true, typeName: true, pic: true, localPic: true, officialPic: true, heroPic: true } } },
        },
        histories: {
          orderBy: { updatedAt: "desc" },
          take: 20,
          include: { vod: { select: { id: true, name: true, typeName: true, pic: true, localPic: true, officialPic: true, heroPic: true } } },
        },
      },
    });
    if (!u) return reply.code(404).send({ error: "用户不存在" });
    const { follows, histories, ...base } = u;
    return {
      ...adminUser(base),
      follows,
      histories,
    };
  });

  app.patch("/api/admin/users/:id", { preHandler: authGuard }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = (req.body as any) || {};
    const data: any = {};
    if ("enabled" in b) data.enabled = Boolean(b.enabled);
    if ("nickname" in b) data.nickname = String(b.nickname || "").trim().slice(0, 32);
    if ("vipLevelId" in b) {
      const vipLevelId = Number(b.vipLevelId);
      const level = Number.isInteger(vipLevelId) && vipLevelId > 0
        ? await prisma.vipLevel.findUnique({ where: { id: vipLevelId } })
        : null;
      if (!level) return reply.code(400).send({ error: "VIP等级不存在" });
      data.vipLevelId = level.id;
    }
    if ("vipExpireAt" in b) data.vipExpireAt = b.vipExpireAt ? new Date(String(b.vipExpireAt)) : null;
    if ("favoriteTypes" in b) data.favoriteTypes = JSON.stringify(normalizeTypes(b.favoriteTypes));
    if (!Object.keys(data).length) return reply.code(400).send({ error: "没有可更新字段" });
    try {
      const u = await prisma.webUser.update({
        where: { id },
        data,
        include: { _count: { select: { follows: true, histories: true } }, vipLevel: true },
      });
      invalidateUserRecommendation(id);
      return adminUser(u);
    } catch {
      return reply.code(404).send({ error: "用户不存在" });
    }
  });

  app.post("/api/admin/users/:id/password", { preHandler: authGuard }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const password = String(((req.body as any) || {}).password || "");
    if (password.length < 6) return reply.code(400).send({ error: "密码至少6位" });
    try {
      await prisma.webUser.update({ where: { id }, data: { password: await hashPassword(password) } });
      return { ok: true };
    } catch {
      return reply.code(404).send({ error: "用户不存在" });
    }
  });

  app.get("/api/user/register-config", async () => {
    const site = await ensureSite();
    const invitePoolCount = await prisma.inviteCode.count({ where: { enabled: true } });
    return {
      allowRegister: site.allowRegister,
      inviteRequired: invitePoolCount > 0,
    };
  });

  app.post("/api/user/register", async (req, reply) => {
    const site = await ensureSite();
    if (!site.allowRegister) return reply.code(403).send({ error: "暂未开放注册" });
    const b = (req.body as any) || {};
    const username = String(b.username || "").trim();
    const password = String(b.password || "");
    const nickname = String(b.nickname || username).trim().slice(0, 32);
    const inviteCode = String(b.inviteCode || "").trim();
    if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
      return reply.code(400).send({ error: "账号需为3-32位字母、数字或下划线" });
    }
    if (password.length < 6) return reply.code(400).send({ error: "密码至少6位" });
    const invitePoolCount = await prisma.inviteCode.count({ where: { enabled: true } });
    if (invitePoolCount > 0 && !inviteCode) return reply.code(400).send({ error: "请输入邀请码" });
    const exists = await prisma.webUser.findUnique({ where: { username } });
    if (exists) return reply.code(409).send({ error: "账号已存在" });
    const defaultLevel = await ensureDefaultVipLevel();
    const u = await prisma.webUser.create({
      data: { username, nickname, password: await hashPassword(password), vipLevelId: defaultLevel.id },
      include: { vipLevel: true },
    });
    if (invitePoolCount > 0 && !(await consumeInviteCode(inviteCode, u.id))) {
      await prisma.webUser.delete({ where: { id: u.id } });
      return reply.code(400).send({ error: "邀请码无效或已失效" });
    }
    const token = signWebToken({ mid: u.id, username: u.username });
    return { token, user: publicUser(u) };
  });

  app.post("/api/user/login", async (req, reply) => {
    const b = (req.body as any) || {};
    const username = String(b.username || "").trim();
    const password = String(b.password || "");
    if (!username) return reply.code(400).send({ error: "请输入账号" });
    if (!password) return reply.code(400).send({ error: "请输入密码" });
    if (rejectLimitedLogin(req, reply, "web", username)) return reply;
    const u = await prisma.webUser.findUnique({ where: { username }, include: { vipLevel: true } });
    if (!u || !u.enabled) {
      recordLoginFailure(req, "web", username);
      return reply.code(401).send({ error: "账号不存在或已禁用" });
    }
    if (!(await checkPassword(password, u.password))) {
      recordLoginFailure(req, "web", username);
      return reply.code(401).send({ error: "密码错误" });
    }
    clearLoginFailures(req, "web", username);
    await prisma.webUser.update({ where: { id: u.id }, data: { lastLogin: new Date() } });
    const token = signWebToken({ mid: u.id, username: u.username });
    return { token, user: publicUser(u) };
  });

  app.get("/api/user/me", { preHandler: webUserGuard }, async (req, reply) => {
    const mid = (req as any).webUser.mid;
    const u = await prisma.webUser.findUnique({ where: { id: mid }, include: { vipLevel: true } });
    if (!u || !u.enabled) return reply.code(401).send({ error: "账号不存在或已禁用" });
    return publicUser(u);
  });

  app.put("/api/user/profile", { preHandler: webUserGuard }, async (req) => {
    const mid = (req as any).webUser.mid;
    const b = (req.body as any) || {};
    const favoriteTypes = normalizeTypes(b.favoriteTypes);
    const nickname = String(b.nickname || "").trim().slice(0, 32);
    const u = await prisma.webUser.update({
      where: { id: mid },
      data: { nickname, favoriteTypes: JSON.stringify(favoriteTypes) },
      include: { vipLevel: true },
    });
    invalidateUserRecommendation(mid);
    return publicUser(u);
  });

  app.get("/api/user/vods/:id/state", { preHandler: webUserGuard }, async (req) => {
    const mid = (req as any).webUser.mid;
    const vodId = Number((req.params as any).id);
    const [follow, history] = await Promise.all([
      prisma.userFollow.findUnique({ where: { userId_vodId: { userId: mid, vodId } } }),
      prisma.watchHistory.findUnique({ where: { userId_vodId: { userId: mid, vodId } } }),
    ]);
    return { followed: Boolean(follow), history };
  });

  app.get("/api/user/follows", { preHandler: webUserGuard }, async (req) => {
    const mid = (req as any).webUser.mid;
    const q = req.query as any;
    const take = Math.min(100, Number(q.limit) || 50);
    const viewer = await viewerFromUserId(mid);
    const publicTypes = await enabledTypeNames(viewer);
    return prisma.userFollow.findMany({
      where: { userId: mid, vod: { status: "online", typeName: publicTypeFilter(publicTypes), ...publicPlayableFilter() } },
      orderBy: { createdAt: "desc" },
      take,
      include: { vod: { include: { _count: { select: publicPlayCountSelect() } } } },
    });
  });

  app.post("/api/user/follows/:vodId", { preHandler: webUserGuard }, async (req, reply) => {
    const mid = (req as any).webUser.mid;
    const vodId = Number((req.params as any).vodId);
    const viewer = await viewerFromUserId(mid);
    const publicTypes = await enabledTypeNames(viewer);
    const vod = await prisma.vod.findFirst({ where: { id: vodId, status: "online", typeName: publicTypeFilter(publicTypes), ...publicPlayableFilter() }, select: { id: true } });
    if (!vod) return reply.code(404).send({ error: "影片不存在或已下架" });
    await prisma.userFollow.upsert({
      where: { userId_vodId: { userId: mid, vodId } },
      create: { userId: mid, vodId },
      update: {},
    });
    invalidateUserRecommendation(mid);
    return { followed: true };
  });

  app.delete("/api/user/follows/:vodId", { preHandler: webUserGuard }, async (req) => {
    const mid = (req as any).webUser.mid;
    const vodId = Number((req.params as any).vodId);
    await prisma.userFollow.deleteMany({ where: { userId: mid, vodId } });
    invalidateUserRecommendation(mid);
    return { followed: false };
  });

  app.get("/api/user/history", { preHandler: webUserGuard }, async (req) => {
    const mid = (req as any).webUser.mid;
    const q = req.query as any;
    const take = Math.min(100, Number(q.limit) || 50);
    const viewer = await viewerFromUserId(mid);
    const publicTypes = await watchableTypeNames(viewer);
    return prisma.watchHistory.findMany({
      where: { userId: mid, vod: { status: "online", typeName: publicTypeFilter(publicTypes), ...publicPlayableFilter() } },
      orderBy: { updatedAt: "desc" },
      take,
      include: { vod: { include: { _count: { select: publicPlayCountSelect() } } } },
    });
  });

  app.post("/api/user/history", { preHandler: webUserGuard }, async (req, reply) => {
    const mid = (req as any).webUser.mid;
    const b = (req.body as any) || {};
    const vodId = Number(b.vodId);
    const viewer = await viewerFromUserId(mid);
    const publicTypes = await watchableTypeNames(viewer);
    const vod = await prisma.vod.findFirst({ where: { id: vodId, status: "online", typeName: publicTypeFilter(publicTypes), ...publicPlayableFilter() }, select: { id: true } });
    if (!vod) return reply.code(404).send({ error: "影片不存在或已下架" });
    const epIndex = Math.max(0, Number(b.epIndex) || 0);
    const epName = String(b.epName || "").trim().slice(0, 80);
    const lineId = Number.isFinite(Number(b.lineId)) ? Number(b.lineId) : null;
    const progressSec = Math.max(0, Math.floor(Number(b.progressSec) || 0));
    const durationSec = Math.max(0, Math.floor(Number(b.durationSec) || 0));
    const history = await prisma.watchHistory.upsert({
      where: { userId_vodId: { userId: mid, vodId } },
      create: { userId: mid, vodId, epIndex, epName, lineId, progressSec, durationSec },
      update: { epIndex, epName, lineId, progressSec, durationSec },
    });
    invalidateUserRecommendation(mid);
    return { ok: true, history };
  });

  app.get("/api/user/recommendations", { preHandler: webUserGuard }, async (req) => {
    const mid = (req as any).webUser.mid;
    const q = req.query as any;
    const take = Math.min(48, Number(q.limit) || 24);
    const cached = getRecommendationCache(mid, take);
    if (cached) return cached;
    const u = await prisma.webUser.findUnique({ where: { id: mid } });
    const picked = await pickRecommendationTypes(mid, parseJsonArray(u?.favoriteTypes));
    const where: any = { status: "online", typeName: publicTypeFilter(picked.publicTypes), ...publicPlayableFilter() };
    if (picked.types.length) where.typeName = { in: picked.types };
    const list = await prisma.vod.findMany({
      where,
      orderBy: [{ ratingCount: "desc" }, { rating: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }, { id: "desc" }],
      take,
      include: { _count: { select: publicPlayCountSelect() } },
    });
    if (list.length >= take) {
      const data = { ...picked, list };
      setRecommendationCache(mid, take, data);
      return data;
    }
    const more = await prisma.vod.findMany({
      where: { status: "online", typeName: publicTypeFilter(picked.publicTypes), ...publicPlayableFilter(), id: { notIn: list.map((v) => v.id) } },
      orderBy: { updatedAt: "desc" },
      take: take - list.length,
      include: { _count: { select: publicPlayCountSelect() } },
    });
    const data = { ...picked, list: [...list, ...more] };
    setRecommendationCache(mid, take, data);
    return data;
  });
}
