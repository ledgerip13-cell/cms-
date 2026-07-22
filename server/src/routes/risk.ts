import type { FastifyInstance, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";
import { clientIpOf } from "../logging.js";
import { writeAudit } from "./access.js";

function userAgentOf(req: FastifyRequest) {
  return String(req.headers["user-agent"] || "").slice(0, 500);
}

function headerString(req: FastifyRequest, name: string) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(",") : String(value || "");
}

function sha(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function deviceHashOf(req: FastifyRequest) {
  const supplied = headerString(req, "x-vcms-device").trim();
  if (/^[a-f0-9]{32,128}$/i.test(supplied)) return supplied.toLowerCase().slice(0, 128);
  const ua = userAgentOf(req);
  const platform = headerString(req, "sec-ch-ua-platform");
  const lang = headerString(req, "accept-language");
  return sha([ua, platform, lang].join("|"));
}

function deviceLabel(ua: string) {
  if (/iphone|ipad|ios/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os|macintosh/i.test(ua)) return "macOS";
  return "未知设备";
}

function browserLabel(ua: string) {
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return "";
}

async function ensureRiskEvent(data: {
  type: string;
  severity?: string;
  userId?: number | null;
  username?: string;
  ip?: string;
  deviceHash?: string;
  relatedUserIds?: number[];
  title: string;
  reason?: string;
  detail?: any;
}) {
  const where: any = {
    type: data.type,
    status: "open",
  };
  if (data.userId) where.userId = data.userId;
  if (data.ip) where.ip = data.ip;
  if (data.deviceHash) where.deviceHash = data.deviceHash;
  const exists = await prisma.userRiskEvent.findFirst({ where, select: { id: true } }).catch(() => null);
  if (exists) return exists;
  return prisma.userRiskEvent.create({
    data: {
      type: data.type,
      severity: data.severity || "medium",
      userId: data.userId || null,
      username: String(data.username || "").slice(0, 120),
      ip: String(data.ip || ""),
      deviceHash: String(data.deviceHash || ""),
      relatedUserIds: JSON.stringify([...(new Set(data.relatedUserIds || []))].slice(0, 50)),
      title: data.title,
      reason: String(data.reason || "").slice(0, 500),
      detail: JSON.stringify(data.detail || {}),
    },
  }).catch(() => null);
}

export async function recordWebUserDeviceAndRisk(req: FastifyRequest, user: { id: number; username: string }) {
  const ip = clientIpOf(req);
  const ua = userAgentOf(req);
  const deviceHash = deviceHashOf(req);
  const now = new Date();
  await prisma.loginDevice.upsert({
    where: { userId_deviceHash: { userId: user.id, deviceHash } },
    create: {
      userId: user.id,
      deviceHash,
      label: deviceLabel(ua),
      userAgent: ua,
      platform: headerString(req, "sec-ch-ua-platform").slice(0, 80),
      browser: browserLabel(ua),
      firstIp: ip,
      lastIp: ip,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      userAgent: ua,
      platform: headerString(req, "sec-ch-ua-platform").slice(0, 80),
      browser: browserLabel(ua),
      lastIp: ip,
      lastSeenAt: now,
      loginCount: { increment: 1 },
    },
  }).catch(() => null);

  const [sameDevice, sameIp] = await Promise.all([
    prisma.loginDevice.findMany({
      where: { deviceHash },
      select: { userId: true },
      distinct: ["userId"],
      take: 20,
    }).catch(() => []),
    ip ? prisma.loginDevice.findMany({
      where: { lastIp: ip },
      select: { userId: true },
      distinct: ["userId"],
      take: 20,
    }).catch(() => []) : Promise.resolve([]),
  ]);
  const deviceUsers = sameDevice.map((x) => x.userId).filter((id) => id !== user.id);
  const ipUsers = sameIp.map((x) => x.userId).filter((id) => id !== user.id);
  if (deviceUsers.length) {
    await ensureRiskEvent({
      type: "multi_account_device",
      severity: deviceUsers.length >= 3 ? "high" : "medium",
      userId: user.id,
      username: user.username,
      ip,
      deviceHash,
      relatedUserIds: deviceUsers,
      title: "同设备多账号登录",
      reason: `同一设备指纹关联 ${deviceUsers.length + 1} 个账号`,
    });
  }
  if (ipUsers.length) {
    await ensureRiskEvent({
      type: "multi_account_ip",
      severity: ipUsers.length >= 5 ? "high" : "medium",
      userId: user.id,
      username: user.username,
      ip,
      deviceHash,
      relatedUserIds: ipUsers,
      title: "同 IP 多账号登录",
      reason: `同一 IP 关联 ${ipUsers.length + 1} 个账号`,
    });
  }
}

function parseJsonArray(value: string | null | undefined): number[] {
  try {
    const rows = JSON.parse(value || "[]");
    return Array.isArray(rows) ? rows.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0) : [];
  } catch {
    return [];
  }
}

function actorOf(req: FastifyRequest) {
  return String((req as any).user?.username || "").slice(0, 120);
}

export default async function riskRoutes(app: FastifyInstance) {
  app.get("/api/admin/risk/overview", { preHandler: authGuard }, async () => {
    const [openEvents, highEvents, bannedUsers, deviceCount] = await Promise.all([
      prisma.userRiskEvent.count({ where: { status: "open" } }),
      prisma.userRiskEvent.count({ where: { status: "open", severity: "high" } }),
      prisma.webUser.count({ where: { enabled: false, bannedAt: { not: null } } }),
      prisma.loginDevice.count(),
    ]);
    return { openEvents, highEvents, bannedUsers, deviceCount };
  });

  app.get("/api/admin/risk/events", { preHandler: authGuard }, async (req) => {
    const q = (req.query as any) || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(q.pageSize || q.size) || 30));
    const where: any = {};
    if (q.status) where.status = String(q.status);
    if (q.type) where.type = String(q.type);
    if (q.severity) where.severity = String(q.severity);
    const kw = String(q.kw || "").trim();
    if (kw) {
      where.OR = [
        { username: { contains: kw, mode: "insensitive" } },
        { ip: { contains: kw } },
        { title: { contains: kw, mode: "insensitive" } },
        { reason: { contains: kw, mode: "insensitive" } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.userRiskEvent.count({ where }),
      prisma.userRiskEvent.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, username: true, nickname: true, enabled: true } } },
      }),
    ]);
    return { total, page, pageSize, list: rows.map((row) => ({ ...row, relatedUserIds: parseJsonArray(row.relatedUserIds) })) };
  });

  app.patch("/api/admin/risk/events/:id", { preHandler: authGuard }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = (req.body as any) || {};
    const status = String(b.status || "").trim();
    if (!["open", "confirmed", "ignored", "resolved"].includes(status)) return reply.code(400).send({ error: "状态无效" });
    const row = await prisma.userRiskEvent.update({
      where: { id },
      data: {
        status,
        handledBy: actorOf(req),
        handledNote: String(b.note || "").trim().slice(0, 500),
        handledAt: status === "open" ? null : new Date(),
      },
    }).catch(() => null);
    if (!row) return reply.code(404).send({ error: "风险事件不存在" });
    await writeAudit(req, "risk_event.update", `UserRiskEvent:${id}`, { status, note: b.note || "" });
    return row;
  });

  app.get("/api/admin/risk/devices", { preHandler: authGuard }, async (req) => {
    const q = (req.query as any) || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(q.pageSize || q.size) || 30));
    const kw = String(q.kw || "").trim();
    const where: any = {};
    if (kw) {
      where.OR = [
        { deviceHash: { contains: kw } },
        { lastIp: { contains: kw } },
        { userAgent: { contains: kw, mode: "insensitive" } },
        { user: { username: { contains: kw, mode: "insensitive" } } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.loginDevice.count({ where }),
      prisma.loginDevice.findMany({
        where,
        orderBy: { lastSeenAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, username: true, nickname: true, enabled: true } } },
      }),
    ]);
    return { total, page, pageSize, list: rows };
  });

  app.get("/api/admin/users/:id/risk", { preHandler: authGuard }, async (req) => {
    const userId = Number((req.params as any).id);
    const [devices, events, banLogs, loginLogs] = await Promise.all([
      prisma.loginDevice.findMany({ where: { userId }, orderBy: { lastSeenAt: "desc" }, take: 30 }),
      prisma.userRiskEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.userBanLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.loginLog.findMany({ where: { userType: "web", userId }, orderBy: { createdAt: "desc" }, take: 30 }),
    ]);
    return { devices, events: events.map((row) => ({ ...row, relatedUserIds: parseJsonArray(row.relatedUserIds) })), banLogs, loginLogs };
  });

  app.post("/api/admin/users/:id/ban", { preHandler: authGuard }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const reason = String(((req.body as any) || {}).reason || "").trim();
    if (!reason) return reply.code(400).send({ error: "请填写封禁原因" });
    const actor = actorOf(req);
    const user = await prisma.webUser.update({
      where: { id },
      data: { enabled: false, banReason: reason.slice(0, 500), bannedAt: new Date(), bannedBy: actor, unbanReason: "", unbannedAt: null },
    }).catch(() => null);
    if (!user) return reply.code(404).send({ error: "用户不存在" });
    await prisma.userBanLog.create({ data: { userId: id, action: "ban", reason: reason.slice(0, 500), actor, ip: clientIpOf(req) } });
    await writeAudit(req, "web_user.ban", `WebUser:${id}`, { reason, result: "ok" });
    return { ok: true };
  });

  app.post("/api/admin/users/:id/unban", { preHandler: authGuard }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const reason = String(((req.body as any) || {}).reason || "").trim();
    if (!reason) return reply.code(400).send({ error: "请填写解封原因" });
    const actor = actorOf(req);
    const user = await prisma.webUser.update({
      where: { id },
      data: { enabled: true, unbanReason: reason.slice(0, 500), unbannedAt: new Date() },
    }).catch(() => null);
    if (!user) return reply.code(404).send({ error: "用户不存在" });
    await prisma.userBanLog.create({ data: { userId: id, action: "unban", reason: reason.slice(0, 500), actor, ip: clientIpOf(req) } });
    await writeAudit(req, "web_user.unban", `WebUser:${id}`, { reason, result: "ok" });
    return { ok: true };
  });
}
