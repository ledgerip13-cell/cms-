import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";

async function ensureSite() {
  const s = await prisma.siteConfig.findUnique({ where: { id: 1 } });
  if (!s) {
    return prisma.siteConfig.create({
      data: { id: 1, siteName: "次元港", description: "多源聚合影视站", footer: "次元港 · 多源聚合" },
    });
  }
  return s;
}

export default async function siteRoutes(app: FastifyInstance) {
  // 公开：前端读取站点信息
  app.get("/api/site", async () => {
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
      },
    });
  });
}
