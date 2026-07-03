import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";

async function ensureSite() {
  const s = await prisma.siteConfig.findUnique({ where: { id: 1 } });
  if (!s) {
    return prisma.siteConfig.create({
      data: { id: 1, siteName: "", description: "", footer: "" },
    });
  }
  return s;
}

function normalizeJsonField(value: any) {
  if (typeof value === "string") {
    try {
      JSON.parse(value || "{}");
      return value || "{}";
    } catch {
      return "{}";
    }
  }
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
}

function publicSite(s: Awaited<ReturnType<typeof ensureSite>>) {
  const { registerInviteCode, ...rest } = s;
  return {
    ...rest,
    inviteRequired: Boolean(registerInviteCode),
  };
}

export default async function siteRoutes(app: FastifyInstance) {
  // 公开：前端读取站点信息
  app.get("/api/site", async () => {
    return publicSite(await ensureSite());
  });

  // 后台读取完整站点信息（含注册邀请码）
  app.get("/api/admin/site", { preHandler: authGuard }, async () => {
    return ensureSite();
  });

  // 后台更新（鉴权）
  app.put("/api/site", { preHandler: authGuard }, async (req) => {
    const b = (req.body as any) || {};
    await ensureSite();
    return prisma.siteConfig.update({
      where: { id: 1 },
      data: {
        siteName: b.siteName,
        logo: b.logo,
        description: b.description,
        keywords: b.keywords,
        footer: b.footer,
        announcement: b.announcement,
        theme: normalizeJsonField(b.theme),
        allowRegister: Boolean(b.allowRegister),
        registerInviteCode: String(b.registerInviteCode || "").trim(),
      },
    });
  });
}
