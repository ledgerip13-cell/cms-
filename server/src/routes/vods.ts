import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";
import { refreshVod } from "../collector/sync.js";
import { normalizeName } from "../collector/dedupe.js";
import { enabledTypeNames, isPublicType, publicPlayableFilter, publicPlayCountSelect, publicTypeFilter, requestedPublicType } from "../publicVod.js";
import { hotVodQuery } from "../hotConfig.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function shanghaiDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function recentShanghaiDates(days: number) {
  const now = new Date();
  const shanghaiNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(shanghaiNow);
    d.setDate(shanghaiNow.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
}

function shanghaiDow(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+08:00`).getDay();
}

function heroImageCandidates(vod: any) {
  const images: Array<{ url?: string; type?: string; isHero?: boolean; width?: number; height?: number }> = Array.isArray(vod.images)
    ? vod.images
    : [];
  const seen = new Set<string>();
  const candidates: Array<{ url: string; wide: boolean; source: string }> = [];
  function push(url: string, wide: boolean, source: string) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push({ url, wide, source });
  }
  if (vod.heroPic) push(vod.heroPic, true, "heroPic");
  for (const img of images) {
    if (!img?.url) continue;
    const hasSize = Number(img.width) > 0 && Number(img.height) > 0;
    const wide = img.type === "poster"
      ? true
      : hasSize
        ? Number(img.width) > Number(img.height)
        : Boolean(img.isHero || img.type === "backdrop" || img.type === "still");
    if (img.isHero || img.type === "backdrop" || img.type === "still" || img.type === "poster") push(img.url, wide, img.type || "asset");
  }
  push(vod.officialPic || vod.pic || "", false, "posterFallback");
  return candidates;
}

function pickHeroImage(vod: any) {
  return heroImageCandidates(vod)[0] || { url: "", wide: false };
}

function withHeroImage(vod: any) {
  const { images, ...rest } = vod;
  const heroImages = heroImageCandidates(vod);
  const heroImage = heroImages[0] || { url: "", wide: false };
  return { ...rest, heroImage: heroImage.url, heroImageWide: heroImage.wide, heroImages };
}

function parseEpisodes(value: string | null | undefined): Array<{ name?: string; url?: string }> {
  try {
    const rows = JSON.parse(value || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function publicEpisodes(value: Array<{ name?: string; url?: string }>) {
  return value.map((ep, index) => ({
    name: String(ep?.name || `第${index + 1}集`),
  }));
}

const SERIES_MARKER_RE = /(第?[一二三四五六七八九十百千万0-9]+季|第?[一二三四五六七八九十百千万0-9]+部|第?[一二三四五六七八九十百千万0-9]+篇|season[0-9]+|s[0-9]+|续篇|前传|后传|剧场版|特别篇|总集篇)$/i;

function seriesBaseName(name: string) {
  const compact = String(name || "").replace(/[\s\u3000]+/g, "").replace(/[：:·・.\-_/|]+/g, "");
  const stripped = compact.replace(SERIES_MARKER_RE, "");
  return stripped.length >= 3 && stripped.length < compact.length ? stripped : "";
}

function seriesKey(name: string) {
  const base = seriesBaseName(name);
  return normalizeName(base || name).replace(SERIES_MARKER_RE, "");
}

function seasonNo(name: string) {
  const raw = normalizeName(name);
  const cn: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const m = raw.match(/第?([一二三四五六七八九十0-9]+)季/i) || raw.match(/(?:season|s)([0-9]+)/i);
  if (!m) return 999;
  if (/^\d+$/.test(m[1])) return Number(m[1]);
  if (m[1] === "十") return 10;
  const ten = m[1].startsWith("十");
  if (ten) return 10 + (cn[m[1].slice(1)] || 0);
  if (m[1].includes("十")) {
    const [a, b] = m[1].split("十");
    return (cn[a] || 1) * 10 + (cn[b] || 0);
  }
  return cn[m[1]] || 999;
}

function cleanupRuleWhere(input: any) {
  const rule = String(input?.rule || "");
  if (rule === "empty_plays") return { rule, where: { plays: { none: {} } } };
  if (rule === "all_dead") return { rule, where: { plays: { some: {} }, NOT: { plays: { some: { alive: true } } } } };
  if (rule === "disabled_source_only") return { rule, where: { plays: { some: {} }, NOT: { plays: { some: { source: { enabled: true } } } } } };
  if (rule === "offline_old") {
    const days = Math.max(1, Math.min(3650, Number(input?.days) || 30));
    return { rule, where: { status: "offline", updatedAt: { lt: new Date(Date.now() - days * DAY_MS) } } };
  }
  if (rule === "source_lines") {
    const sourceId = Number(input?.sourceId);
    if (!Number.isInteger(sourceId) || sourceId <= 0) throw new Error("按源清退必须选择采集源");
    return { rule, sourceId, where: { plays: { some: { sourceId } } } };
  }
  throw new Error("不支持的清理规则");
}

export default async function vodRoutes(app: FastifyInstance) {
  // 影片列表（分页 + 搜索 + 分类 + 年份 + 排序）
  app.get("/api/vods", async (req) => {
    const q = req.query as any;
    const page = Math.max(1, Number(q.page) || 1);
    const size = Math.min(100, Number(q.size) || 20);
    const publicTypes = await enabledTypeNames();
    // 观众端只能看到 online 影片，不信任前端传入的 status(避免绕过下架限制)；admin 后台管理页面用另外的 secured 接口查全量
    const where: any = { status: "online", typeName: publicTypeFilter(publicTypes), ...publicPlayableFilter() };
    if (q.kw) {
      const kw = String(q.kw);
      where.OR = [
        { name: { contains: kw } },
        { actor: { contains: kw } },
        { director: { contains: kw } },
        { people: { some: { person: { name: { contains: kw } } } } },
      ];
    }
    if (q.type) where.typeName = requestedPublicType(publicTypes, String(q.type));
    if (q.sub) where.subType = q.sub;
    if (q.year === "2005年以前") {
      // year 字段是自由文本，不能用字典序比较。列出 1900~2004 全部取值做 IN 查询，
      // 比 raw SQL 更安全，也避免在应用层做内存分页过滤破坏分页正确性。
      const years: string[] = [];
      for (let y = 1900; y < 2005; y++) years.push(String(y));
      where.year = { in: years };
    } else if (q.year) {
      where.year = { contains: q.year };
    }
    // 排序：recent 最近更新 / hot 热门(评分) / rating 高分
    let orderBy: any = [{ pinned: "desc" }, { updatedAt: "desc" }];
    if (q.sort === "hot") orderBy = [{ ratingCount: "desc" }, { rating: "desc" }, { updatedAt: "desc" }];
    else if (q.sort === "rating") orderBy = [{ rating: "desc" }, { ratingCount: "desc" }];
    const [total, list] = await Promise.all([
      prisma.vod.count({ where }),
      prisma.vod.findMany({
        where,
        orderBy,
        skip: (page - 1) * size,
        take: size,
        include: { _count: { select: publicPlayCountSelect() } },
      }),
    ]);
    return { total, page, size, list };
  });

  // 年份索引（聚合，降序）：支持按 type/sub 联动，只返回该分类下实际存在的年份
  app.get("/api/years", async (req) => {
    const q = req.query as any;
    const publicTypes = await enabledTypeNames();
    const where: any = { typeName: publicTypeFilter(publicTypes), ...publicPlayableFilter() };
    if (q.type) where.typeName = requestedPublicType(publicTypes, String(q.type));
    if (q.sub) where.subType = q.sub;
    const rows = await prisma.vod.groupBy({
      by: ["year"],
      where,
      _count: { _all: true },
      orderBy: { year: "desc" },
    });
    // 提取4位年份后二次合并(去除空格/后缀噪音)
    const merged = new Map<string, number>();
    for (const r of rows) {
      const y = r.year.match(/(19|20)\d{2}/)?.[0];
      if (!y) continue;
      merged.set(y, (merged.get(y) || 0) + r._count._all);
    }
    // 去除异常未来年份(超出当前年+1的视为脏数据)
    const curYear = new Date().getFullYear();
    const OLDEST_YEAR = 2005; // 2005年以前合并为“更早”，避免筛选栏被数十个年份塑破
    let earlierCount = 0;
    const recent: { year: string; count: number }[] = [];
    for (const [y, c] of merged.entries()) {
      const n = Number(y);
      if (n > curYear + 1) continue; // 异常未来年份丢弃
      if (n < OLDEST_YEAR) earlierCount += c;
      else recent.push({ year: y, count: c });
    }
    recent.sort((a, b) => Number(b.year) - Number(a.year));
    if (earlierCount > 0) recent.push({ year: `${OLDEST_YEAR}年以前`, count: earlierCount });
    return recent;
  });

  // 热门推荐：默认榜按后台算法配置；分类榜保留固定分类逻辑
  // cat: 可选榜单分类，hot(默认/热搜榜全部) | guoman(国产动漫) | anime(动漫大类全部) | shortplay(短剧)
  app.get("/api/hot", async (req) => {
    const q = req.query as any;
    const cat = String(q.cat || "hot");
    const hotQuery = await hotVodQuery(cat, Number(q.limit) || undefined);
    const list = await prisma.vod.findMany({
      where: hotQuery.where,
      orderBy: hotQuery.orderBy,
      take: hotQuery.take,
      include: {
        _count: { select: publicPlayCountSelect() },
        images: { orderBy: [{ isHero: "desc" }, { score: "desc" }] },
      },
    });
    return list.map(withHeroImage);
  });

  // 每日更新：按最近7个自然日期分组，每天最多14部
  app.get("/api/weekly", async () => {
    const dates = recentShanghaiDates(7);
    const since = new Date(Date.now() - 8 * DAY_MS);
    const publicTypes = await enabledTypeNames();
    const rows = await prisma.vod.findMany({
      where: { status: "online", typeName: publicTypeFilter(publicTypes), ...publicPlayableFilter(), updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 600,
      include: { _count: { select: publicPlayCountSelect() } },
    });
    const byDate = new Map(dates.map((date) => [date, [] as any[]]));
    for (const v of rows) {
      const date = shanghaiDateKey(v.updatedAt);
      const bucket = byDate.get(date);
      if (bucket && bucket.length < 14) bucket.push(v);
    }
    return dates.map((date) => ({
      date,
      dow: shanghaiDow(date),
      items: byDate.get(date) || [],
    }));
  });

  // 相关推荐：同系列 > 同小类 > 同大类 > 热门补足，排除自身。用于播放页右栏
  app.get("/api/related", async (req) => {
    const q = req.query as any;
    const id = Number(q.id) || 0;
    const take = Math.min(24, Number(q.limit) || 12);
    const type = String(q.type || "");
    const sub = String(q.sub || "");
    const publicTypes = await enabledTypeNames();
    const baseWhere: any = { status: "online", typeName: publicTypeFilter(publicTypes), ...publicPlayableFilter(), id: { not: id } };
    const current = id ? await prisma.vod.findUnique({ where: { id }, select: { name: true } }) : null;
    const baseName = seriesBaseName(current?.name || "");
    const currentSeriesKey = current?.name ? seriesKey(current.name) : "";
    const picks: any[] = [];
    const seen = new Set<number>([id]);
    const pushRows = (rows: any[]) => {
      for (const r of rows) { if (!seen.has(r.id)) { seen.add(r.id); picks.push(r); } }
    };
    // 1) 同系列：例如 师兄啊师兄第一季/第二季，先于普通同类热门。
    if (baseName && currentSeriesKey) {
      const seriesRows = await prisma.vod.findMany({
        where: { ...baseWhere, ...(type ? { typeName: requestedPublicType(publicTypes, type) } : {}), name: { contains: baseName } },
        orderBy: [{ updatedAt: "desc" }],
        take: Math.max(take * 3, 24),
        include: { _count: { select: publicPlayCountSelect() } },
      });
      pushRows(seriesRows
        .filter((r) => seriesKey(r.name) === currentSeriesKey)
        .sort((a, b) => seasonNo(a.name) - seasonNo(b.name) || String(a.year || "").localeCompare(String(b.year || "")) || b.ratingCount - a.ratingCount)
      );
    }
    // 2) 同小类
    if (sub) {
      pushRows(await prisma.vod.findMany({
        where: { ...baseWhere, subType: sub },
        orderBy: [{ ratingCount: "desc" }, { updatedAt: "desc" }],
        take, include: { _count: { select: publicPlayCountSelect() } },
      }));
    }
    // 3) 同大类补足
    if (picks.length < take && type) {
      pushRows(await prisma.vod.findMany({
        where: { ...baseWhere, typeName: requestedPublicType(publicTypes, type), id: { notIn: [...seen] } },
        orderBy: [{ ratingCount: "desc" }, { updatedAt: "desc" }],
        take: take - picks.length, include: { _count: { select: publicPlayCountSelect() } },
      }));
    }
    // 4) 仍不足用热门补
    if (picks.length < take) {
      pushRows(await prisma.vod.findMany({
        where: { ...baseWhere, id: { notIn: [...seen] } },
        orderBy: { updatedAt: "desc" },
        take: take - picks.length, include: { _count: { select: publicPlayCountSelect() } },
      }));
    }
    return picks.slice(0, take);
  });

  // 影片详情 + 所有线路（按源优先级排序）
  app.get("/api/vods/:id", async (req, reply) => {
    const id = Number((req.params as any).id);
    const vod = await prisma.vod.findUnique({
      where: { id },
      include: {
        plays: { where: { source: { enabled: true } }, include: { source: true } },
        people: { include: { person: true }, orderBy: [{ role: "asc" }, { sort: "asc" }] },
        images: { orderBy: [{ isHero: "desc" }, { score: "desc" }] },
      },
    });
    // 观众端不能看到已下架影片，同列表接口限制保持一致（admin详情页用另外的鲟权接口）
    const publicTypes = await enabledTypeNames();
    if (!vod || vod.status !== "online" || !isPublicType(publicTypes, vod.typeName) || !vod.plays.length) return reply.code(404).send({ error: "not found" });
    const allChannels = vod.plays.map((p) => ({
      id: p.id,
      sourceId: p.sourceId,
      sourceName: p.source.name,
      priority: p.source.priority,
      flag: p.flag,
      epCount: p.epCount,
      alive: p.alive,
      score: p.score,
      checkMs: p.checkMs,
      playKind: p.playKind,
      episodes: parseEpisodes(p.episodes),
    }));
    // 健康优选排序：存活优先 → 评分高优先 → 源优先级
    const byHealth = (a: { alive: boolean; score: number; priority: number }, b: { alive: boolean; score: number; priority: number }) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.priority - b.priority;
    };
    // 按源分组：每个源可能有多条 flag 通道，组内按健康分排序，默认选中组内第0个
    const bySource = new Map<number, typeof allChannels>();
    for (const c of allChannels) {
      if (!bySource.has(c.sourceId)) bySource.set(c.sourceId, []);
      bySource.get(c.sourceId)!.push(c);
    }
    const lines = [...bySource.values()]
      .map((channels) => {
        const sorted = [...channels].sort(byHealth);
        const best = sorted[0];
        return {
          id: best.id,
          sourceId: best.sourceId,
          sourceName: best.sourceName,
          priority: best.priority,
          flag: best.flag,
          epCount: best.epCount,
          alive: best.alive,
          score: best.score,
          playKind: best.playKind,
          episodes: publicEpisodes(best.episodes),
          channels: sorted.map((c) => ({ ...c, episodes: publicEpisodes(c.episodes) })), // 同源全部备用通道(按健康分降序)，前端需展示备用tab时用
        };
      })
      .sort(byHealth);
    return { ...vod, plays: undefined, lines };
  });

  // 大类下的小类标签聚合（下钻用）
  app.get("/api/subtypes", async (req) => {
    const type = String((req.query as any).type || "");
    if (!type) return [];
    const publicTypes = await enabledTypeNames();
    if (!isPublicType(publicTypes, type)) return [];
    const rows = await prisma.vod.groupBy({
      by: ["subType"],
      where: { typeName: type, subType: { not: "" }, ...publicPlayableFilter() },
      _count: { _all: true },
      orderBy: { _count: { subType: "desc" } },
    });
    return rows.map((r) => ({ name: r.subType, count: r._count._all }));
  });

  // 分类聚合
  app.get("/api/types", async () => {
    const publicTypes = await enabledTypeNames();
    const rows = await prisma.vod.groupBy({
      by: ["typeName"],
      where: { typeName: publicTypeFilter(publicTypes), ...publicPlayableFilter() },
      _count: { _all: true },
      orderBy: { _count: { typeName: "desc" } },
    });
    return rows.map((r) => ({ name: r.typeName, count: r._count._all }));
  });

  // ============ 以下需登录（admin 后台管理专用，可看到全部状态+支持批量操作）============
  app.register(async (secured) => {
    secured.addHook("preHandler", authGuard);

    // 后台单片详情（含已下架），供管理页“线路详情”面板用，复用同一份组装逻辑
    secured.get("/api/admin/vods/:id", async (req, reply) => {
      const id = Number((req.params as any).id);
      const vod = await prisma.vod.findUnique({
        where: { id },
        include: {
          plays: { include: { source: true } },
          people: { include: { person: true }, orderBy: [{ role: "asc" }, { sort: "asc" }] },
          images: { orderBy: [{ isHero: "desc" }, { score: "desc" }] },
        },
      });
      if (!vod) return reply.code(404).send({ error: "not found" });
      const channels = vod.plays.map((p) => ({
        id: p.id, sourceId: p.sourceId, sourceName: p.source.name, priority: p.source.priority,
        flag: p.flag, epCount: p.epCount, alive: p.alive, score: p.score, checkMs: p.checkMs,
        playKind: p.playKind, episodes: parseEpisodes(p.episodes),
      }));
      const byHealth = (a: any, b: any) => (a.alive !== b.alive ? (a.alive ? -1 : 1) : b.score !== a.score ? b.score - a.score : a.priority - b.priority);
      const bySource = new Map<number, typeof channels>();
      for (const c of channels) { if (!bySource.has(c.sourceId)) bySource.set(c.sourceId, []); bySource.get(c.sourceId)!.push(c); }
      const lines = [...bySource.values()].map((cs) => { const sorted = [...cs].sort(byHealth); return { ...sorted[0], channels: sorted }; }).sort(byHealth);
      return { ...vod, plays: undefined, lines };
    });

    // 后台管理列表：不限 status，支持多条件筛选(同 /api/vods 参数 + status)
    secured.get("/api/admin/vods", async (req) => {
      const q = req.query as any;
      const page = Math.max(1, Number(q.page) || 1);
      const size = Math.min(200, Number(q.size) || 20);
      const where: any = {};
      if (q.status) where.status = q.status;
      if (q.kw) {
        const kw = String(q.kw);
        where.OR = [
          { name: { contains: kw } },
          { actor: { contains: kw } },
          { director: { contains: kw } },
          { people: { some: { person: { name: { contains: kw } } } } },
        ];
      }
      if (q.type) where.typeName = q.type;
      if (q.sub) where.subType = q.sub;
      if (q.sourceId) {
        const sourceId = Number(q.sourceId);
        if (Number.isInteger(sourceId) && sourceId > 0) where.plays = { some: { sourceId } };
      }
      if (q.year === "2005年以前") {
        const years: string[] = [];
        for (let y = 1900; y < 2005; y++) years.push(String(y));
        where.year = { in: years };
      } else if (q.year) {
        where.year = { contains: q.year };
      }
      const [total, list] = await Promise.all([
        prisma.vod.count({ where }),
        prisma.vod.findMany({
          where,
          orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
          skip: (page - 1) * size,
          take: size,
          include: { _count: { select: { plays: true } } },
        }),
      ]);
      return { total, page, size, list };
    });

    // 批量操作：下架/上架/删除，传 ids 数组，支持多选
    secured.post("/api/admin/vods/batch", async (req) => {
      const b = req.body as any;
      const ids: number[] = Array.isArray(b.ids) ? b.ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)) : [];
      const action = String(b.action || "");
      if (!ids.length) return { ok: false, error: "未选择任何影片" };
      if (action === "offline") {
        const r = await prisma.vod.updateMany({ where: { id: { in: ids } }, data: { status: "offline" } });
        return { ok: true, count: r.count };
      }
      if (action === "online") {
        const r = await prisma.vod.updateMany({ where: { id: { in: ids } }, data: { status: "online" } });
        return { ok: true, count: r.count };
      }
      if (action === "delete") {
        // 先删关联的播放线路再删影片，避免外键约束报错
        await prisma.play.deleteMany({ where: { vodId: { in: ids } } });
        const r = await prisma.vod.deleteMany({ where: { id: { in: ids } } });
        return { ok: true, count: r.count };
      }
      return { ok: false, error: "不支持的操作类型" };
    });

    secured.post("/api/admin/vods/cleanup/preview", async (req, reply) => {
      try {
        const b = (req.body as any) || {};
        const { rule, sourceId, where } = cleanupRuleWhere(b);
        const limit = Math.max(1, Math.min(5000, Number(b.limit) || 500));
        if (rule === "source_lines") {
          const [playCount, vodCount, source, samples] = await Promise.all([
            prisma.play.count({ where: { sourceId } }),
            prisma.vod.count({ where }),
            prisma.source.findUnique({ where: { id: sourceId }, select: { id: true, name: true, enabled: true } }),
            prisma.vod.findMany({ where, take: 12, orderBy: { updatedAt: "desc" }, include: { _count: { select: { plays: true } } } }),
          ]);
          return { ok: true, rule, mode: "delete_lines", source, playCount, total: vodCount, limit, samples };
        }
        const [total, samples] = await Promise.all([
          prisma.vod.count({ where }),
          prisma.vod.findMany({ where, take: 12, orderBy: { updatedAt: "desc" }, include: { _count: { select: { plays: true } } } }),
        ]);
        return { ok: true, rule, mode: "delete_vods", total, limit, samples };
      } catch (e: any) {
        return reply.code(400).send({ ok: false, error: e?.message || String(e) });
      }
    });

    secured.post("/api/admin/vods/cleanup/execute", async (req, reply) => {
      try {
        const b = (req.body as any) || {};
        const { rule, sourceId, where } = cleanupRuleWhere(b);
        const limit = Math.max(1, Math.min(5000, Number(b.limit) || 500));
        if (rule === "source_lines") {
          const playIds = await prisma.play.findMany({ where: { sourceId }, select: { id: true }, take: limit, orderBy: { id: "asc" } });
          const playIdList = playIds.map((p) => p.id);
          const deleted = playIdList.length ? await prisma.play.deleteMany({ where: { id: { in: playIdList } } }) : { count: 0 };
          let orphanDeleted = { count: 0 };
          if (b.deleteOrphans) {
            const orphans = await prisma.vod.findMany({ where: { plays: { none: {} } }, select: { id: true }, take: limit });
            orphanDeleted = orphans.length ? await prisma.vod.deleteMany({ where: { id: { in: orphans.map((v) => v.id) } } }) : { count: 0 };
          }
          return { ok: true, rule, deletedLines: deleted.count, deletedOrphans: orphanDeleted.count };
        }
        const rows = await prisma.vod.findMany({ where, select: { id: true }, take: limit, orderBy: { id: "asc" } });
        const ids = rows.map((v) => v.id);
        const r = ids.length ? await prisma.vod.deleteMany({ where: { id: { in: ids } } }) : { count: 0 };
        return { ok: true, rule, deletedVods: r.count };
      } catch (e: any) {
        return reply.code(400).send({ ok: false, error: e?.message || String(e) });
      }
    });
  });

  // 编辑单片（需登录）：只更新允许的字段
  app.put("/api/vods/:id", { preHandler: authGuard }, async (req) => {
    const id = Number((req.params as any).id);
    const b = (req.body as any) || {};
    const data: any = {};
    const fields = ["name", "year", "typeName", "pic", "heroPic", "actor", "director", "area", "lang", "remarks", "blurb", "officialIntro", "officialPic", "genres"];
    for (const f of fields) if (b[f] !== undefined) data[f] = b[f];
    if (b.rating !== undefined) data.rating = b.rating === null || b.rating === "" ? null : Number(b.rating);
    if (!data.name || !String(data.name).trim()) {
      // 防空名：名字未传则不改；传了但为空则拒绝
      if (b.name !== undefined) return { error: "片名不能为空" };
      delete data.name;
    }
    const vod = await prisma.vod.update({ where: { id }, data });
    return { ok: true, vod };
  });

  // 单片采集更新（需登录）：按各源 sourceVodId 重拉详情刷新剧集
  app.post("/api/vods/:id/refresh", { preHandler: authGuard }, async (req) => {
    const id = Number((req.params as any).id);
    try {
      const r = await refreshVod(id);
      return { ok: true, ...r };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // 上下架 / 置顶（需登录）
  app.patch("/api/vods/:id", { preHandler: authGuard }, async (req) => {
    const id = Number((req.params as any).id);
    const b = req.body as any;
    return prisma.vod.update({
      where: { id },
      data: { status: b.status, pinned: b.pinned },
    });
  });

  // 概览统计（后台首页）
  app.get("/api/stats", async () => {
    const [vods, plays, sources, online] = await Promise.all([
      prisma.vod.count(),
      prisma.play.count(),
      prisma.source.count(),
      prisma.vod.count({ where: { status: "online" } }),
    ]);
    return { vods, plays, sources, online };
  });
}
