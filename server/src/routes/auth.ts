import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { checkPassword, hashPassword, signToken, authGuard } from "../auth.js";
import { clearLoginFailures, recordLoginFailure, rejectLimitedLogin } from "../loginRateLimit.js";
import { clientIpOf, recordLoginLog } from "../logging.js";

export default async function authRoutes(app: FastifyInstance) {
  // 登录
  app.post("/api/auth/login", async (req, reply) => {
    const { username, password } = (req.body as any) || {};
    if (rejectLimitedLogin(req, reply, "admin", username || "")) return reply;
    const u = await prisma.user.findUnique({ where: { username: username || "" } });
    if (!u || !u.enabled) {
      recordLoginFailure(req, "admin", username || "");
      recordLoginLog(req, { userType: "admin", username, success: false, message: "账号不存在或已禁用" });
      return reply.code(401).send({ error: "账号不存在或已禁用" });
    }
    if (!(await checkPassword(password || "", u.password))) {
      recordLoginFailure(req, "admin", username || "");
      recordLoginLog(req, { userType: "admin", userId: u.id, username: u.username, success: false, message: "密码错误" });
      return reply.code(401).send({ error: "密码错误" });
    }
    clearLoginFailures(req, "admin", username || "");
    await prisma.user.update({ where: { id: u.id }, data: { lastLogin: new Date(), lastLoginIp: clientIpOf(req) } });
    recordLoginLog(req, { userType: "admin", userId: u.id, username: u.username, success: true, message: "登录成功" });
    const token = signToken({ uid: u.id, username: u.username, role: u.role });
    return { token, user: { id: u.id, username: u.username, role: u.role } };
  });

  // 当前用户
  app.get("/api/auth/me", { preHandler: authGuard }, async (req) => {
    return (req as any).user;
  });

  // 修改密码
  app.post("/api/auth/password", { preHandler: authGuard }, async (req, reply) => {
    const { oldPassword, newPassword } = (req.body as any) || {};
    const uid = (req as any).user.uid;
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u || !(await checkPassword(oldPassword || "", u.password)))
      return reply.code(400).send({ error: "原密码错误" });
    if (!newPassword || newPassword.length < 6)
      return reply.code(400).send({ error: "新密码至少6位" });
    await prisma.user.update({ where: { id: uid }, data: { password: await hashPassword(newPassword) } });
    return { ok: true };
  });
}
