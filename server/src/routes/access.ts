import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";
import { ensureDefaultVipLevel, inferVipLevelCode, normalizeVipCode, normalizeVipTagColor } from "../vipLevels.js";

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

async function uniqueVipLevelCode(name: string, preferred = "", excludeId?: number) {
  const base = normalizeVipCode(preferred, "") || inferVipLevelCode(name);
  let code = base;
  for (let i = 2; ; i++) {
    const exists = await prisma.vipLevel.findUnique({ where: { code } });
    if (!exists || exists.id === excludeId) return code;
    code = `${base}_${i}`;
  }
}

const vipLevelSelect = {
  id: true,
  code: true,
  name: true,
  tagColor: true,
  sort: true,
  isDefault: true,
  isVip: true,
  remark: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { users: true } },
} as const;

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

  app.get("/api/admin/vip-levels", async () => {
    await ensureDefaultVipLevel();
    return prisma.vipLevel.findMany({
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      select: vipLevelSelect,
    });
  });

  app.post("/api/admin/vip-levels", async (req, reply) => {
    const b = (req.body as any) || {};
    const name = String(b.name || "").trim().slice(0, 40);
    if (!name) return reply.code(400).send({ error: "等级名称不能为空" });
    const code = await uniqueVipLevelCode(name, b.code);
    const exists = await prisma.vipLevel.findUnique({ where: { name } });
    if (exists) return reply.code(409).send({ error: "等级名称已存在" });
    const row = await prisma.vipLevel.create({
      data: {
        code,
        name,
        tagColor: normalizeVipTagColor(b.tagColor),
        sort: Number.isFinite(Number(b.sort)) ? Number(b.sort) : 100,
        isVip: b.isVip !== false,
        remark: String(b.remark || "").trim().slice(0, 100),
        enabled: b.enabled !== false,
      },
    });
    await writeAudit(req, "vip_level.create", `VipLevel:${row.id}`, row);
    const fresh = await prisma.vipLevel.findUnique({ where: { id: row.id }, select: vipLevelSelect });
    return reply.code(201).send(fresh);
  });

  app.patch("/api/admin/vip-levels/:id", async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = (req.body as any) || {};
    const current = await prisma.vipLevel.findUnique({ where: { id } });
    if (!current) return reply.code(404).send({ error: "VIP等级不存在" });
    const data: any = {};
    if ("name" in b) {
      data.name = String(b.name || "").trim().slice(0, 40);
      if (!data.name) return reply.code(400).send({ error: "等级名称不能为空" });
    }
    if ("code" in b && !current.isDefault) data.code = await uniqueVipLevelCode(data.name || current.name, b.code, id);
    if ("tagColor" in b) data.tagColor = normalizeVipTagColor(b.tagColor, normalizeVipTagColor(current.tagColor));
    if ("sort" in b) data.sort = Number.isFinite(Number(b.sort)) ? Number(b.sort) : current.sort;
    if ("isVip" in b && !current.isDefault) data.isVip = Boolean(b.isVip);
    if ("remark" in b) data.remark = String(b.remark || "").trim().slice(0, 100);
    if ("enabled" in b) data.enabled = current.isDefault ? true : Boolean(b.enabled);
    if (!Object.keys(data).length) return reply.code(400).send({ error: "没有可更新字段" });
    if (data.code || data.name) {
      const conflict = await prisma.vipLevel.findFirst({
        where: {
          id: { not: id },
          OR: [
            data.code ? { code: data.code } : undefined,
            data.name ? { name: data.name } : undefined,
          ].filter(Boolean) as any,
        },
      });
      if (conflict) return reply.code(409).send({ error: "等级名称或标识已存在" });
    }
    const row = await prisma.vipLevel.update({ where: { id }, data, select: vipLevelSelect });
    await writeAudit(req, "vip_level.update", `VipLevel:${id}`, data);
    return row;
  });

  app.delete("/api/admin/vip-levels/:id", async (req, reply) => {
    const id = Number((req.params as any).id);
    const current = await prisma.vipLevel.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!current) return reply.code(404).send({ error: "VIP等级不存在" });
    if (current.isDefault) return reply.code(400).send({ error: "默认等级不能删除" });
    if (current._count.users > 0) return reply.code(400).send({ error: "该等级已有用户，不能删除" });
    await prisma.vipLevel.delete({ where: { id } });
    await writeAudit(req, "vip_level.delete", `VipLevel:${id}`, { name: current.name });
    return { ok: true };
  });

  app.get("/api/admin/audit-logs", async (req) => {
    const q = (req.query as any) || {};
    const take = Math.min(200, Number(q.limit) || 100);
    return prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take });
  });
}
