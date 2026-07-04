import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";

export async function writeAudit(req: FastifyRequest, action: string, target = "", detail: any = {}) {
  const user = (req as any).user || {};
  await prisma.auditLog.create({
    data: {
      actorId: user.uid || null,
      actor: user.username || "",
      action,
      target,
      detail: JSON.stringify(detail || {}),
      ip: req.ip || "",
    },
  }).catch(() => {});
}

function randCode(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default async function accessRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/admin/invites", async (req) => {
    const q = (req.query as any) || {};
    const take = Math.min(200, Number(q.limit) || 100);
    return prisma.inviteCode.findMany({ orderBy: { createdAt: "desc" }, take, include: { usedBy: { select: { id: true, username: true, nickname: true } } } });
  });

  app.post("/api/admin/invites", async (req, reply) => {
    const b = (req.body as any) || {};
    const count = Math.min(200, Math.max(1, Number(b.count) || 1));
    const maxUses = Math.min(9999, Math.max(1, Number(b.maxUses) || 1));
    const remark = String(b.remark || "").trim().slice(0, 100);
    const expiresAt = b.expiresAt ? new Date(String(b.expiresAt)) : null;
    const rows = [];
    for (let i = 0; i < count; i++) {
      let code = String(b.code || "").trim().toUpperCase() || randCode();
      if (count > 1 || i > 0) code = randCode();
      try {
        rows.push(await prisma.inviteCode.create({ data: { code, maxUses, remark, expiresAt } }));
      } catch {
        i--;
      }
    }
    await writeAudit(req, "invite.create", "InviteCode", { count, maxUses, remark });
    return reply.code(201).send(rows);
  });

  app.patch("/api/admin/invites/:id", async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = (req.body as any) || {};
    const data: any = {};
    if ("enabled" in b) data.enabled = Boolean(b.enabled);
    if ("remark" in b) data.remark = String(b.remark || "").trim().slice(0, 100);
    if ("maxUses" in b) data.maxUses = Math.max(1, Number(b.maxUses) || 1);
    if ("expiresAt" in b) data.expiresAt = b.expiresAt ? new Date(String(b.expiresAt)) : null;
    if (!Object.keys(data).length) return reply.code(400).send({ error: "没有可更新字段" });
    const row = await prisma.inviteCode.update({ where: { id }, data });
    await writeAudit(req, "invite.update", `InviteCode:${id}`, data);
    return row;
  });

  app.delete("/api/admin/invites/:id", async (req, reply) => {
    const id = Number((req.params as any).id);
    const row = await prisma.inviteCode.findUnique({ where: { id } });
    if (!row) return reply.code(404).send({ error: "邀请码不存在" });
    if (row.usedCount > 0) {
      await prisma.inviteCode.update({ where: { id }, data: { enabled: false } });
      await writeAudit(req, "invite.disable_used", `InviteCode:${id}`, { code: row.code, usedCount: row.usedCount });
      return { ok: true, disabled: true };
    }
    await prisma.inviteCode.delete({ where: { id } });
    await writeAudit(req, "invite.delete", `InviteCode:${id}`, { code: row.code });
    return { ok: true, deleted: true };
  });

  app.get("/api/admin/member-groups", async () => {
    return prisma.memberGroup.findMany({ orderBy: { id: "desc" }, include: { _count: { select: { members: true } } } });
  });

  app.post("/api/admin/member-groups", async (req, reply) => {
    const b = (req.body as any) || {};
    const name = String(b.name || "").trim().slice(0, 40);
    if (!name) return reply.code(400).send({ error: "分组名称不能为空" });
    const row = await prisma.memberGroup.create({ data: { name, remark: String(b.remark || "").trim().slice(0, 100) } });
    await writeAudit(req, "group.create", `MemberGroup:${row.id}`, row);
    return reply.code(201).send(row);
  });

  app.patch("/api/admin/member-groups/:id", async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = (req.body as any) || {};
    const data: any = {};
    if ("name" in b) data.name = String(b.name || "").trim().slice(0, 40);
    if ("remark" in b) data.remark = String(b.remark || "").trim().slice(0, 100);
    if ("enabled" in b) data.enabled = Boolean(b.enabled);
    if (!Object.keys(data).length) return reply.code(400).send({ error: "没有可更新字段" });
    const row = await prisma.memberGroup.update({ where: { id }, data });
    await writeAudit(req, "group.update", `MemberGroup:${id}`, data);
    return row;
  });

  app.put("/api/admin/users/:id/groups", async (req) => {
    const userId = Number((req.params as any).id);
    const groupIds = Array.isArray((req.body as any)?.groupIds) ? (req.body as any).groupIds.map(Number).filter(Boolean) : [];
    await prisma.$transaction([
      prisma.webUserGroup.deleteMany({ where: { userId } }),
      ...groupIds.map((groupId: number) => prisma.webUserGroup.create({ data: { userId, groupId } })),
    ]);
    await writeAudit(req, "user.groups", `WebUser:${userId}`, { groupIds });
    return { ok: true };
  });

  app.get("/api/admin/audit-logs", async (req) => {
    const q = (req.query as any) || {};
    const take = Math.min(200, Number(q.limit) || 100);
    return prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take });
  });
}
