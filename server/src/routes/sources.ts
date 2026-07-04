import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { ping, fetchClasses, fetchTypeTotal, resolveApiUrls, withFailover } from "../collector/maccms.js";
import { syncSource } from "../collector/sync.js";
import { createCollectTask } from "../collector/taskRunner.js";
import { probeBatch } from "../collector/probe.js";
import { reloadSchedules } from "../scheduler.js";
import { authGuard } from "../auth.js";
import { normalizeOrigin, readPlayDomains, refreshSourcePlayDomains } from "../playDomains.js";
import { writeAudit } from "./access.js";
import { parseAutoTypeIds, serializeAutoTypeIds } from "../sourceAutoTypes.js";

export default async function sourceRoutes(app: FastifyInstance) {
  // 采集源管理全部需要登录（含列表，避免泄露源站）
  app.addHook("preHandler", authGuard);
  // 列表
  app.get("/api/sources", async () => {
    const rows = await prisma.source.findMany({ orderBy: { priority: "asc" } });
    return rows.map((row) => ({ ...row, autoTypeIds: parseAutoTypeIds(row.autoTypeId) }));
  });

  // 新建
  app.post("/api/sources", async (req, reply) => {
    const b = req.body as any;
    const name = String(b.name || "").trim();
    const apiUrls: string[] = Array.isArray(b.apiUrls) ? b.apiUrls.map((s: string) => String(s || "").trim()).filter(Boolean) : [];
    const apiUrl = String(b.apiUrl || apiUrls[0] || "").trim();
    if (!name) return reply.code(400).send({ error: "源名称不能为空" });
    if (!apiUrl) return reply.code(400).send({ error: "采集API地址不能为空" });
    const s = await prisma.source.create({
      data: {
        name,
        apiUrl,
        apiUrls: JSON.stringify(apiUrls),
        flag: b.flag || "",
        priority: b.priority ?? 100,
        enabled: b.enabled ?? true,
        autoSync: b.autoSync ?? false,
        autoTypeId: serializeAutoTypeIds(b.autoTypeIds ?? b.autoTypeId),
        syncHours: b.syncHours ?? 24,
        cronExpr: b.cronExpr || "0 * * * *",
      },
    });
    await reloadSchedules();
    return s;
  });

  // 更新
  app.put("/api/sources/:id", async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as any;
    const data: any = {
      name: b.name,
      apiUrl: b.apiUrl,
      flag: b.flag,
      priority: b.priority,
      enabled: b.enabled,
      autoSync: b.autoSync,
      autoTypeId: b.autoTypeIds !== undefined || b.autoTypeId !== undefined ? serializeAutoTypeIds(b.autoTypeIds ?? b.autoTypeId) : undefined,
      syncHours: b.syncHours,
      cronExpr: b.cronExpr,
    };
    if (Array.isArray(b.apiUrls)) {
      const apiUrls = b.apiUrls.map((s: string) => String(s || "").trim()).filter(Boolean);
      data.apiUrls = JSON.stringify(apiUrls);
      if (!b.apiUrl && apiUrls[0]) data.apiUrl = apiUrls[0];
    }
    // 必填校验：编辑时也不允许清空名称/API（只在传了该字段时检查，避免阻碍部分字段更新）
    if (b.name !== undefined && !String(b.name).trim()) return reply.code(400).send({ error: "源名称不能为空" });
    if (b.apiUrl !== undefined && !data.apiUrls && !String(b.apiUrl).trim()) return reply.code(400).send({ error: "采集API地址不能为空" });
    const s = await prisma.source.update({ where: { id }, data });
    await reloadSchedules();
    return s;
  });

  // 删除
  app.delete("/api/sources/:id", async (req) => {
    const id = Number((req.params as any).id);
    await prisma.source.delete({ where: { id } });
    await reloadSchedules();
    return { ok: true };
  });

  // 手动探活一批
  app.post("/api/probe", async (req) => {
    const limit = Number((req.body as any)?.limit) || 50;
    return probeBatch(limit);
  });

  // 当前采集源下已入库播放地址域名统计（不读取/修改采集API）
  app.get("/api/sources/:id/play-domains", async (req, reply) => {
    const id = Number((req.params as any).id);
    const source = await prisma.source.findUnique({ where: { id }, select: { id: true, playDomains: true } });
    if (!source) return reply.code(404).send({ error: "采集源不存在" });
    const domains = readPlayDomains(source.playDomains);
    return { sourceId: id, domains };
  });

  // 替换当前采集源下某个播放域名；只更新 Play.episodes，不触碰 Source.apiUrl/apiUrls
  app.post("/api/sources/:id/play-domains/replace", async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = (req.body as any) || {};
    const source = await prisma.source.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!source) return reply.code(404).send({ error: "采集源不存在" });

    const oldUrl = normalizeOrigin(b.oldOrigin || b.oldDomain || "");
    if (!oldUrl) return reply.code(400).send({ error: "旧播放域名无效" });
    const newUrl = normalizeOrigin(b.newOrigin || b.newDomain || "", oldUrl.protocol);
    if (!newUrl) return reply.code(400).send({ error: "新播放域名无效" });
    if (oldUrl.origin === newUrl.origin) return reply.code(400).send({ error: "新旧播放域名相同" });

    const pattern = `%${oldUrl.origin}%`;
    const statRows = await prisma.$queryRaw<Array<{ affectedPlays: bigint; affectedEpisodes: bigint }>>`
      select
        count(*)::bigint as "affectedPlays",
        coalesce(sum(((length(episodes) - length(replace(episodes, ${oldUrl.origin}, ''))) / length(${oldUrl.origin}))::int), 0)::bigint as "affectedEpisodes"
      from "Play"
      where "sourceId" = ${id} and episodes like ${pattern}
    `;
    const affectedPlays = Number(statRows[0]?.affectedPlays || 0);
    const affectedEpisodes = Number(statRows[0]?.affectedEpisodes || 0);

    if (affectedPlays > 0) {
      await prisma.$executeRaw`
        update "Play"
        set
          episodes = replace(episodes, ${oldUrl.origin}, ${newUrl.origin}),
          alive = true,
          score = 0,
          "checkMs" = 0,
          "lastCheck" = null
        where "sourceId" = ${id} and episodes like ${pattern}
      `;
    }

    const domains = await refreshSourcePlayDomains(id);
    await writeAudit(req, "source.playDomain.replace", `Source:${id}`, {
      oldOrigin: oldUrl.origin,
      newOrigin: newUrl.origin,
      affectedPlays,
      affectedEpisodes,
    });

    return {
      ok: true,
      sourceId: id,
      sourceName: source.name,
      oldOrigin: oldUrl.origin,
      newOrigin: newUrl.origin,
      affectedPlays,
      affectedEpisodes,
      domains,
    };
  });

  // 测活：按顺序逐个试 apiUrls，返回每个入口的结果+最终生效的那个
  app.post("/api/sources/:id/ping", async (req) => {
    const id = Number((req.params as any).id);
    const s = await prisma.source.findUnique({ where: { id } });
    if (!s) return { ok: false, error: "not found" };
    const urls = resolveApiUrls(s.apiUrl, s.apiUrls);
    const results: any[] = [];
    let firstOk: any = null;
    for (const u of urls) {
      const r = await ping(u);
      results.push({ url: u, ...r });
      if (r.ok && !firstOk) firstOk = { url: u, ...r };
    }
    await prisma.source.update({
      where: { id },
      data: {
        status: firstOk ? "ok" : "fail",
        lastError: firstOk ? null : results.map((r) => r.error).filter(Boolean).join("; "),
        activeApiUrl: firstOk ? firstOk.url : s.activeApiUrl,
      },
    });
    return firstOk
      ? { ...firstOk, multi: urls.length > 1, results }
      : { ok: false, error: "全部入口均失败", multi: urls.length > 1, results };
  });

  // 触发采集（异步：创建任务后立即返回 taskId，后台执行，去任务页看进度）
  app.post("/api/sources/:id/sync", async (req) => {
    const id = Number((req.params as any).id);
    const b = (req.body as any) || {};
    const task = await createCollectTask(id, {
      mode: b.mode || "incr",
      maxPages: b.maxPages,
      hours: b.hours,
      typeId: b.typeId || undefined,
      yearMode: b.yearMode || "",
      year: b.year,
      yearStart: b.yearStart,
      yearEnd: b.yearEnd,
      metaAfterCollect: b.metaAfterCollect !== false,
      cleanAfterCollect: Boolean(b.cleanAfterCollect),
    });
    return { taskId: task.id, status: task.status, message: "采集任务已提交，请到「采集任务」查看进度" };
  });

  // 源的分类列表(供前端按分类采集选择)
  app.get("/api/sources/:id/types", async (req) => {
    const id = Number((req.params as any).id);
    const maps = await prisma.sourceTypeMap.findMany({
      where: { sourceId: id },
      orderBy: { sourceTypeName: "asc" },
    });
    return maps.map((m) => ({ typeId: m.sourceTypeId, typeName: m.sourceTypeName }));
  });

  // 源的实时分类树（从上游拉，含父子关系）——按分类采集下拉用
  app.get("/api/sources/:id/classes", async (req) => {
    const id = Number((req.params as any).id);
    const s = await prisma.source.findUnique({ where: { id } });
    if (!s) return { ok: false, error: "not found", tree: [] };
    try {
      const urls = resolveApiUrls(s.apiUrl, s.apiUrls);
      const { result: classes } = await withFailover(urls, (u) => fetchClasses(u));
      // 构建父→子树；typePid=="0" 或无对应父节点的为顶级
      const byId = new Map(classes.map((c) => [c.typeId, c]));
      const parents = classes.filter((c) => c.typePid === "0" || !byId.has(c.typePid));
      const tree = parents.map((p) => ({
        typeId: p.typeId,
        typeName: p.typeName,
        children: classes
          .filter((c) => c.typePid === p.typeId && c.typeId !== p.typeId)
          .map((c) => ({ typeId: c.typeId, typeName: c.typeName })),
      }));
      return { ok: true, tree };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e), tree: [] };
    }
  });

  // 预估某分类可采总量（父类自动汇总其子类）
  app.get("/api/sources/:id/typecount", async (req) => {
    const id = Number((req.params as any).id);
    const t = String((req.query as any).t || "");
    const hours = Number((req.query as any).hours) || 0;
    const s = await prisma.source.findUnique({ where: { id } });
    if (!s || !t) return { ok: false, total: 0 };
    try {
      const urls = resolveApiUrls(s.apiUrl, s.apiUrls);
      const { result: classes, usedUrl } = await withFailover(urls, (u) => fetchClasses(u));
      const children = classes.filter((c) => c.typePid === t).map((c) => c.typeId);
      const targets = children.length ? children : [t];
      let total = 0;
      for (const tid of targets) total += await fetchTypeTotal(usedUrl, tid, hours);
      return { ok: true, total, expanded: children.length };
    } catch (e: any) {
      return { ok: false, total: 0, error: e?.message || String(e) };
    }
  });

  // 采集日志
  app.get("/api/sources/:id/logs", async (req) => {
    const id = Number((req.params as any).id);
    return prisma.syncLog.findMany({
      where: { sourceId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  });
}
