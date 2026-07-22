import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";

const SECRET = process.env.JWT_SECRET || "video-cms-dev-secret-change-me";
const EXPIRES = "7d";

export type AdminAuthUser = {
  id: number;
  uid: number;
  username: string;
  role: string;
  kind: "admin";
};

export function signToken(payload: { uid: number; username: string; role: string }) {
  return jwt.sign({ ...payload, kind: "admin" }, SECRET, { expiresIn: EXPIRES });
}

export function signWebToken(payload: { mid: number; username: string }) {
  return jwt.sign({ ...payload, kind: "web" }, SECRET, { expiresIn: EXPIRES });
}

export function verifyToken(token: string): any {
  return jwt.verify(token, SECRET);
}

export function signPlaybackToken(payload: {
  cleanId?: number;
  playId?: number;
  vodId?: number;
  mid?: number;
  sourceId?: number;
  sourceVodId?: string;
  nid?: string;
  epIndex?: number;
  scope?: string;
}) {
  return jwt.sign({ ...payload, kind: "playback" }, SECRET, { expiresIn: "30m" });
}

export function verifyPlaybackToken(token: string): any {
  const data = verifyToken(token);
  if (data?.kind !== "playback") throw new Error("bad playback token");
  return data;
}

// 回源代理 token：给 /api/hls-mp | /api/hls-key | /api/hls-ts 用，内含目标绝对地址+referer，短时效
export function signProxyToken(payload: { u: string; ref?: string; kind: "mp" | "key" | "ts"; mode?: string; mid?: number }) {
  return jwt.sign({ ...payload, t: "proxy" }, SECRET, { expiresIn: "30m" });
}
export function verifyProxyToken(token: string, kind: "mp" | "key" | "ts"): any {
  const data = verifyToken(token);
  if (data?.t !== "proxy" || data?.kind !== kind) throw new Error("bad proxy token");
  return data;
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function checkPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function adminUserFromToken(token: string): Promise<AdminAuthUser> {
  const payload = verifyToken(token);
  if (payload?.kind !== "admin" || !Number.isInteger(payload?.uid) || payload.uid <= 0) {
    throw new Error("bad admin token");
  }
  const u = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, username: true, role: true, enabled: true },
  });
  if (!u || !u.enabled) throw new Error("admin disabled or missing");
  return {
    id: u.id,
    uid: u.id,
    username: u.username,
    role: u.role,
    kind: "admin",
  };
}

// 鉴权中间件（保护写接口）
export async function authGuard(req: FastifyRequest, reply: FastifyReply) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return reply.code(401).send({ error: "未登录" });
  try {
    (req as any).user = await adminUserFromToken(token);
  } catch {
    return reply.code(401).send({ error: "登录已过期" });
  }
}

// 前台用户鉴权（保护追剧、历史、偏好等用户数据）
export async function webUserGuard(req: FastifyRequest, reply: FastifyReply) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return reply.code(401).send({ error: "未登录" });
  try {
    const user = verifyToken(token);
    if (user?.kind !== "web" || !user?.mid) throw new Error("bad token");
    const current = await prisma.webUser.findUnique({
      where: { id: Number(user.mid) },
      select: { enabled: true, banReason: true, bannedAt: true },
    });
    if (!current || !current.enabled) {
      const reason = current?.bannedAt && current.banReason ? `账号已封禁：${current.banReason}` : "账号不存在或已禁用";
      return reply.code(401).send({ error: reason });
    }
    (req as any).webUser = user;
  } catch {
    return reply.code(401).send({ error: "登录已过期" });
  }
}

// 首次启动播种默认管理员 admin / admin888
export async function seedAdmin() {
  const count = await prisma.user.count();
  if (count === 0) {
    await prisma.user.create({
      data: { username: "admin", password: await hashPassword("admin888"), role: "admin" },
    });
    console.log("[auth] 已创建默认管理员 admin / admin888（请尽快修改）");
  }
}
