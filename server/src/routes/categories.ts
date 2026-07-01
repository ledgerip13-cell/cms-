import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";
import { CATEGORIES, classifyType } from "../collector/classify.js";

export default async function categoryRoutes(app: FastifyInstance) {
  // 公开：前端取启用的统一分类（带影片数）——前后台均读此，保证一致
  app.get("/api/categories", async () => {
    const cats = await prisma.category.findMany({
      where: { enabled: true },
      orderBy: { sort: "asc" },
    });
    // 回填后 Vod.typeName == 大类名，直接按 typeName 聚合计数
    const counts = await prisma.vod.groupBy({ by: ["typeName"], _count: { _all: true } });
    const cmap = new Map(counts.map((c) => [c.typeName, c._count._all]));
    return cats.map((c) => ({ ...c, count: cmap.get(c.name) || 0 }));
  });

  // 管理：一键建立统一分类体系（播种大类 + 自动映射196条源type + 回填存量）
  app.post("/api/admin/categories/unify", { preHandler: authGuard }, async () => {
    // 1) upsert 大类
    for (const c of CATEGORIES) {
      const exist = await prisma.category.findFirst({ where: { name: c.name } });
      if (exist) await prisma.category.update({ where: { id: exist.id }, data: { slug: c.slug, sort: c.sort, enabled: true } });
      else await prisma.category.create({ data: { name: c.name, slug: c.slug, sort: c.sort } });
    }
    const cats = await prisma.category.findMany();
    const byName = new Map(cats.map((c) => [c.name, c.id]));
    // 2) 自动映射所有源 type → 大类
    const maps = await prisma.sourceTypeMap.findMany();
    let mapped = 0;
    for (const m of maps) {
      const cid = byName.get(classifyType(m.sourceTypeName));
      if (cid && m.categoryId !== cid) {
        await prisma.sourceTypeMap.update({ where: { id: m.id }, data: { categoryId: cid } });
        mapped++;
      }
    }
    // 3) 回填存量 Vod.typeName → 大类（按当前 typeName 归一）
    const typeRows = await prisma.vod.groupBy({ by: ["typeName"] });
    let backfilled = 0;
    for (const r of typeRows) {
      const target = classifyType(r.typeName);
      if (target !== r.typeName) {
        const res = await prisma.vod.updateMany({ where: { typeName: r.typeName }, data: { typeName: target } });
        backfilled += res.count;
      }
    }
    return { ok: true, categories: CATEGORIES.length, mapped, backfilled };
  });

  // 以下为后台管理，需登录
  app.register(async (admin) => {
    admin.addHook("preHandler", authGuard);

    // 分类 CRUD
    admin.post("/api/admin/categories", async (req) => {
      const b = req.body as any;
      return prisma.category.create({
        data: { name: b.name, slug: b.slug || "", sort: b.sort ?? 100, parentId: b.parentId ?? null },
      });
    });
    admin.put("/api/admin/categories/:id", async (req) => {
      const id = Number((req.params as any).id);
      const b = req.body as any;
      return prisma.category.update({
        where: { id },
        data: { name: b.name, slug: b.slug, sort: b.sort, enabled: b.enabled, parentId: b.parentId ?? null },
      });
    });
    admin.delete("/api/admin/categories/:id", async (req) => {
      await prisma.category.delete({ where: { id: Number((req.params as any).id) } });
      return { ok: true };
    });

    // 源分类映射：列出所有已发现的源type + 映射状态
    admin.get("/api/admin/typemaps", async (req) => {
      const sourceId = (req.query as any).sourceId ? Number((req.query as any).sourceId) : undefined;
      return prisma.sourceTypeMap.findMany({
        where: sourceId ? { sourceId } : undefined,
        include: { category: true, source: { select: { name: true } } },
        orderBy: [{ sourceId: "asc" }, { sourceTypeName: "asc" }],
      });
    });

    // 设置某个源type → 统一分类
    admin.post("/api/admin/typemaps/:id", async (req) => {
      const id = Number((req.params as any).id);
      const { categoryId } = req.body as any;
      return prisma.sourceTypeMap.update({
        where: { id },
        data: { categoryId: categoryId ?? null },
      });
    });

    // 未映射数量提醒
    admin.get("/api/admin/typemaps/unmapped", async () => {
      const n = await prisma.sourceTypeMap.count({ where: { categoryId: null } });
      return { unmapped: n };
    });
  });
}
