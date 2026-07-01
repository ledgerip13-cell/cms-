import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";

const SECRET = process.env.JWT_SECRET || "video-cms-dev-secret-change-me";
const EXPIRES = "7d";

export function signToken(payload: { uid: number; username: string; role: string }) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

export function verifyToken(token: string): any {
  return jwt.verify(token, SECRET);
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function checkPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

// 鉴权中间件（保护写接口）
export async function authGuard(req: FastifyRequest, reply: FastifyReply) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return reply.code(401).send({ error: "未登录" });
  try {
    (req as any).user = verifyToken(token);
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
