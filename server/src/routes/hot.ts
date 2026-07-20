import type { FastifyInstance } from "fastify";
import { authGuard } from "../auth.js";
import { prisma } from "../db.js";
import { ensureHotConfig, hotVodQuery, updateHotConfig } from "../hotConfig.js";
import { withHeatFields } from "../heat.js";

export default async function hotRoutes(app: FastifyInstance) {
  app.register(async (admin) => {
    admin.addHook("preHandler", authGuard);

    admin.get("/api/admin/hot-config", async () => ensureHotConfig());

    admin.put("/api/admin/hot-config", async (req) => updateHotConfig(req.body));

    admin.get("/api/admin/hot-preview", async () => {
      const q = await hotVodQuery("hot");
      const list = await prisma.vod.findMany({
        where: q.where,
        orderBy: q.orderBy,
        take: q.take,
        include: { _count: { select: { plays: true } } },
      });
      return { config: q.config, total: list.length, list: list.map(withHeatFields) };
    });
  });
}
