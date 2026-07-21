import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";
import { CATEGORIES, classifyType } from "../collector/classify.js";
import { inferCategoryIcon, normalizeCategoryIcon } from "../categoryIcons.js";
import { categoryAllowed, invalidatePublicVodCaches, normalizeAccessLevelIds, normalizeDisplayAccessMode, normalizeWatchAccessMode, viewerFromRequest } from "../publicVod.js";
import { aggregateCacheGet, aggregateCacheSet, invalidateAggregateCache } from "../aggregateCache.js";
import { writeAudit } from "./access.js";

const CATEGORY_COUNT_CACHE_TTL_MS = 5 * 60 * 1000;

async function categoryCounts() {
  const cached = aggregateCacheGet<[string, number][]>("categoryCounts");
  if (cached) return new Map(cached);
  const rows = await prisma.vod.groupBy({ by: ["typeName"], _count: { _all: true } });
  const counts = new Map(rows.map((c) => [c.typeName, c._count._all]));
  aggregateCacheSet("categoryCounts", [...counts.entries()], CATEGORY_COUNT_CACHE_TTL_MS);
  return counts;
}

function invalidateCategoryCountCache() {
  invalidateAggregateCache("categoryCounts");
}

async function backfillMapToVods(mapId: number) {
  const map = await prisma.sourceTypeMap.findUnique({
    where: { id: mapId },
    include: { category: true },
  });
  if (!map) return 0;
  const target = map.category?.name || classifyType(map.sourceTypeName);
  if (!target || !map.sourceTypeName) return 0;
  return prisma.$executeRaw`
    UPDATE "Vod" v
    SET "typeName" = ${target}
    WHERE v."subType" = ${map.sourceTypeName}
      AND EXISTS (
        SELECT 1 FROM "Play" p
        WHERE p."vodId" = v.id
          AND p."sourceId" = ${map.sourceId}
      )
  `;
}

async function backfillCategoryMaps(categoryId: number) {
  const maps = await prisma.sourceTypeMap.findMany({
    where: { categoryId },
    select: { id: true },
  });
  let count = 0;
  for (const m of maps) count += await backfillMapToVods(m.id);
  return count;
}

function categoryWriteData(input: any, creating = false, current: any = null) {
  const b = input || {};
  const data: any = {};
  if (creating || "name" in b) data.name = String(b.name || "").trim();
  if (creating || "slug" in b) data.slug = String(b.slug || "").trim();
  const nextName = data.name ?? current?.name ?? "";
  if (creating || "icon" in b) data.icon = normalizeCategoryIcon(b.icon, inferCategoryIcon(nextName));
  else if (!current?.icon && nextName) data.icon = inferCategoryIcon(nextName);
  if (creating || "sort" in b) data.sort = Number.isFinite(Number(b.sort)) ? Number(b.sort) : 100;
  if ("parentId" in b) data.parentId = b.parentId ?? null;
  if (creating || "enabled" in b) data.enabled = creating ? b.enabled !== false : Boolean(b.enabled);
  const displayMode = normalizeDisplayAccessMode(b.displayMode ?? current?.displayMode, "public");
  if (creating || "displayMode" in b) data.displayMode = displayMode;
  if (creating || "displayLevelIds" in b || "displayGroupIds" in b) {
    data.displayLevelIds = JSON.stringify(normalizeAccessLevelIds(b.displayLevelIds ?? b.displayGroupIds));
  }
  const enabled = "enabled" in data ? data.enabled !== false : current?.enabled !== false;
  const hiddenOrDisabled = !enabled || displayMode === "hidden";
  if (hiddenOrDisabled) {
    data.watchMode = "inherit";
    data.watchLevelIds = "[]";
  } else {
    if (creating || "watchMode" in b) data.watchMode = normalizeWatchAccessMode(b.watchMode, "inherit");
    if (creating || "watchLevelIds" in b || "watchGroupIds" in b) {
      data.watchLevelIds = JSON.stringify(normalizeAccessLevelIds(b.watchLevelIds ?? b.watchGroupIds));
    }
  }
  return data;
}

export default async function categoryRoutes(app: FastifyInstance) {
  // 公开：前端取启用的统一分类（带影片数）——前后台均读此，保证一致
  app.get("/api/categories", async (req) => {
    const viewer = await viewerFromRequest(req);
    const cats = await prisma.category.findMany({
      where: { enabled: true },
      orderBy: { sort: "asc" },
    });
    // 回填后 Vod.typeName == 大类名，直接按 typeName 聚合计数
    const cmap = await categoryCounts();
    return cats
      .filter((c: any) => categoryAllowed(c, "display", viewer).allowed)
      .map((c) => ({ ...c, count: cmap.get(c.name) || 0 }));
  });

  // 后台管理：列出全部大类(含已禁用的)，用于后台开关管理页面（新增/编辑/删除 CRUD 复用下方已有的 admin 作用域，不重复定义）
  app.get("/api/admin/categories", { preHandler: authGuard }, async () => {
    const cats = await prisma.category.findMany({ orderBy: { sort: "asc" } });
    const cmap = await categoryCounts();
    return cats.map((c) => ({ ...c, count: cmap.get(c.name) || 0 }));
  });

  // 管理：一键建立统一分类体系（播种大类 + 自动映射196条源type + 回填存量）
  app.post("/api/admin/categories/unify", { preHandler: authGuard }, async () => {
    // 1) upsert 大类
    for (const c of CATEGORIES) {
      const exist = await prisma.category.findFirst({ where: { name: c.name } });
      if (exist) await prisma.category.update({ where: { id: exist.id }, data: { slug: c.slug, icon: exist.icon || inferCategoryIcon(c.name), sort: c.sort, enabled: true } });
      else await prisma.category.create({ data: { name: c.name, slug: c.slug, icon: inferCategoryIcon(c.name), sort: c.sort } });
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
    invalidatePublicVodCaches("category");
    invalidateCategoryCountCache();
    return { ok: true, categories: CATEGORIES.length, mapped, backfilled };
  });

  // 以下为后台管理，需登录
  app.register(async (admin) => {
    admin.addHook("preHandler", authGuard);

    // 分类 CRUD
    admin.post("/api/admin/categories", async (req) => {
      const b = req.body as any;
      const row = await prisma.category.create({
        data: categoryWriteData(b, true),
      });
      invalidatePublicVodCaches("category");
      invalidateCategoryCountCache();
      await writeAudit(req, "category.create", `Category:${row.id}`, { before: null, after: row, result: "ok" });
      return row;
    });
    admin.put("/api/admin/categories/:id", async (req) => {
      const id = Number((req.params as any).id);
      const b = req.body as any;
      const before = await prisma.category.findUnique({ where: { id } });
      const data = categoryWriteData(b, false, before);
      const row = await prisma.category.update({
        where: { id },
        data,
      });
      const backfilled = before && b.name && b.name !== before.name ? await backfillCategoryMaps(id) : 0;
      invalidatePublicVodCaches("category");
      invalidateCategoryCountCache();
      await writeAudit(req, "category.update", `Category:${id}`, { before, after: row, backfilled, result: "ok" });
      return { ...row, backfilled };
    });
    admin.delete("/api/admin/categories/:id", async (req) => {
      const id = Number((req.params as any).id);
      const maps = await prisma.sourceTypeMap.findMany({ where: { categoryId: id }, select: { id: true } });
      await prisma.category.delete({ where: { id } });
      let backfilled = 0;
      for (const m of maps) backfilled += await backfillMapToVods(m.id);
      invalidatePublicVodCaches("category");
      invalidateCategoryCountCache();
      await writeAudit(req, "category.delete", `Category:${id}`, { before: { id, maps }, after: null, backfilled, result: "ok" });
      return { ok: true, backfilled };
    });

    // 源分类映射：列出所有已发现的源type + 映射状态
    admin.get("/api/admin/typemaps", async (req) => {
      const sourceId = (req.query as any).sourceId ? Number((req.query as any).sourceId) : undefined;
      const unmappedOnly = (req.query as any).unmapped === "1" || (req.query as any).unmapped === "true";
      return prisma.sourceTypeMap.findMany({
        where: { ...(sourceId ? { sourceId } : {}), ...(unmappedOnly ? { categoryId: null } : {}) },
        include: { category: true, source: { select: { name: true } } },
        orderBy: [{ sourceId: "asc" }, { sourceTypeName: "asc" }],
      });
    });

    // 自动映射未映射源分类：沿用现有分类器，只填充 categoryId 为空的映射
    admin.post("/api/admin/typemaps/auto", async (req) => {
      const b = (req.body as any) || {};
      const sourceId = b.sourceId ? Number(b.sourceId) : undefined;
      const cats = await prisma.category.findMany({ select: { id: true, name: true } });
      const byName = new Map(cats.map((c) => [c.name, c.id]));
      const rows = await prisma.sourceTypeMap.findMany({
        where: { categoryId: null, ...(sourceId ? { sourceId } : {}) },
        select: { id: true, sourceTypeName: true },
      });
      let updated = 0;
      let skipped = 0;
      let backfilled = 0;
      for (const row of rows) {
        const categoryId = byName.get(classifyType(row.sourceTypeName));
        if (!categoryId) {
          skipped++;
          continue;
        }
        await prisma.sourceTypeMap.update({ where: { id: row.id }, data: { categoryId } });
        updated++;
        backfilled += await backfillMapToVods(row.id);
      }
      invalidatePublicVodCaches("category");
      invalidateCategoryCountCache();
      return { ok: true, scanned: rows.length, updated, skipped, backfilled };
    });

    // 批量设置源type → 统一分类
    admin.post("/api/admin/typemaps/batch", async (req, reply) => {
      const b = (req.body as any) || {};
      const ids: number[] = Array.isArray(b.ids)
        ? [...new Set<number>(b.ids.map((x: any) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0))]
        : [];
      if (!ids.length) return reply.code(400).send({ error: "未选择任何源分类" });
      const categoryId = b.categoryId == null || b.categoryId === "" ? null : Number(b.categoryId);
      if (categoryId !== null) {
        const category = await prisma.category.findUnique({ where: { id: categoryId } });
        if (!category) return reply.code(400).send({ error: "目标分类不存在" });
      }
      const rows = await prisma.sourceTypeMap.findMany({ where: { id: { in: ids } }, select: { id: true } });
      if (!rows.length) return reply.code(404).send({ error: "源分类不存在" });
      await prisma.sourceTypeMap.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { categoryId },
      });
      let backfilled = 0;
      for (const row of rows) backfilled += await backfillMapToVods(row.id);
      invalidateCategoryCountCache();
      await writeAudit(req, "typemap.batch", `SourceTypeMap:${rows.map((row) => row.id).join(",")}`, { before: rows, after: { categoryId }, backfilled, result: "ok" });
      return { ok: true, updated: rows.length, backfilled };
    });

    // 设置某个源type → 统一分类
    admin.post("/api/admin/typemaps/:id", async (req) => {
      const id = Number((req.params as any).id);
      const { categoryId } = req.body as any;
      const before = await prisma.sourceTypeMap.findUnique({ where: { id }, include: { category: true, source: { select: { name: true } } } });
      const row = await prisma.sourceTypeMap.update({
        where: { id },
        data: { categoryId: categoryId ?? null },
        include: { category: true, source: { select: { name: true } } },
      });
      const backfilled = await backfillMapToVods(id);
      invalidateCategoryCountCache();
      await writeAudit(req, "typemap.update", `SourceTypeMap:${id}`, { before, after: row, backfilled, result: "ok" });
      return { ...row, backfilled };
    });

    // 删除某个源分类映射行（“小类”）。注：若该源分类仍在采集范围内，下次采集会重新生成
    admin.delete("/api/admin/typemaps/:id", async (req, reply) => {
      const id = Number((req.params as any).id);
      const row = await prisma.sourceTypeMap.findUnique({ where: { id } });
      if (!row) return reply.code(404).send({ error: "映射不存在" });
      await prisma.sourceTypeMap.delete({ where: { id } });
      await writeAudit(req, "typemap.delete", `SourceTypeMap:${id}`, { before: row, after: null, result: "ok" });
      return { ok: true };
    });

    // 未映射数量提醒
    admin.get("/api/admin/typemaps/unmapped", async () => {
      const n = await prisma.sourceTypeMap.count({ where: { categoryId: null } });
      return { unmapped: n };
    });
  });
}
