import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";
import { refreshVod } from "../collector/sync.js";

export default async function vodRoutes(app: FastifyInstance) {
  // 影片列表（分页 + 搜索 + 分类 + 年份 + 排序）
  app.get("/api/vods", async (req) => {
    const q = req.query as any;
    const page = Math.max(1, Number(q.page) || 1);
    const size = Math.min(100, Number(q.size) || 20);
    const where: any = { status: q.status || undefined };
    if (q.kw) where.name = { contains: q.kw };
    if (q.type) where.typeName = q.type;
    if (q.sub) where.subType = q.sub;
    if (q.year) where.year = { contains: q.year };
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
        include: { _count: { select: { plays: true } } },
      }),
    ]);
    return { total, page, size, list };
  });

  // 年份索引（聚合，降序）
  app.get("/api/years", async () => {
    const rows = await prisma.vod.groupBy({
      by: ["year"],
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
    return [...merged.entries()]
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([year, count]) => ({ year, count }))
      .slice(0, 16);
  });

  // 热门推荐（搜索框点击时展示）：有评分优先，否则按线路数/更新
  // cat: 可选榜单分类，hot(默认/热搜榜全部) | guoman(国产动漫) | anime(动漫大类全部) | shortplay(短剧)
  app.get("/api/hot", async (req) => {
    const q = req.query as any;
    const take = Math.min(20, Number(q.limit) || 10);
    const cat = String(q.cat || "hot");
    const catWhere: any =
      cat === "guoman" ? { typeName: "动漫", subType: "国产动漫" } :
      cat === "anime" ? { typeName: "动漫" } :
      cat === "shortplay" ? { typeName: "短剧" } : {};
    const rated = await prisma.vod.findMany({
      where: { status: "online", rating: { not: null }, ...catWhere },
      orderBy: [{ ratingCount: "desc" }, { rating: "desc" }],
      take,
      include: { _count: { select: { plays: true } } },
    });
    if (rated.length >= take) return rated;
    // 评分片不够，补最近更新(同榜单分类过滤)
    const more = await prisma.vod.findMany({
      where: { status: "online", id: { notIn: rated.map((v) => v.id) }, ...catWhere },
      orderBy: { updatedAt: "desc" },
      take: take - rated.length,
      include: { _count: { select: { plays: true } } },
    });
    return [...rated, ...more];
  });

  // 每日更新：按 updatedAt 的星期分组（近7天），每天最多14部
  app.get("/api/weekly", async () => {
    const since = new Date(Date.now() - 7 * 864e5);
    const rows = await prisma.vod.findMany({
      where: { status: "online", updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 600,
      include: { _count: { select: { plays: true } } },
    });
    const week: Record<number, any[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const v of rows) {
      const d = new Date(v.updatedAt).getDay();
      if (week[d].length < 14) week[d].push(v);
    }
    return week;
  });

  // 相关推荐：同大类优先，其次同小类，排除自身。用于播放页右栏
  app.get("/api/related", async (req) => {
    const q = req.query as any;
    const id = Number(q.id) || 0;
    const take = Math.min(24, Number(q.limit) || 12);
    const type = String(q.type || "");
    const sub = String(q.sub || "");
    const baseWhere: any = { status: "online", id: { not: id } };
    const picks: any[] = [];
    const seen = new Set<number>([id]);
    const pushRows = (rows: any[]) => {
      for (const r of rows) { if (!seen.has(r.id)) { seen.add(r.id); picks.push(r); } }
    };
    // 1) 同小类
    if (sub) {
      pushRows(await prisma.vod.findMany({
        where: { ...baseWhere, subType: sub },
        orderBy: [{ ratingCount: "desc" }, { updatedAt: "desc" }],
        take, include: { _count: { select: { plays: true } } },
      }));
    }
    // 2) 同大类补足
    if (picks.length < take && type) {
      pushRows(await prisma.vod.findMany({
        where: { ...baseWhere, typeName: type, id: { notIn: [...seen] } },
        orderBy: [{ ratingCount: "desc" }, { updatedAt: "desc" }],
        take: take - picks.length, include: { _count: { select: { plays: true } } },
      }));
    }
    // 3) 仍不足用热门补
    if (picks.length < take) {
      pushRows(await prisma.vod.findMany({
        where: { ...baseWhere, id: { notIn: [...seen] } },
        orderBy: { updatedAt: "desc" },
        take: take - picks.length, include: { _count: { select: { plays: true } } },
      }));
    }
    return picks.slice(0, take);
  });

  // 影片详情 + 所有线路（按源优先级排序）
  app.get("/api/vods/:id", async (req) => {
    const id = Number((req.params as any).id);
    const vod = await prisma.vod.findUnique({
      where: { id },
      include: { plays: { include: { source: true } } },
    });
    if (!vod) return { error: "not found" };
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
      episodes: JSON.parse(p.episodes || "[]"),
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
          episodes: best.episodes,
          channels: sorted, // 同源全部备用通道(按健康分降序)，前端需展示备用tab时用
        };
      })
      .sort(byHealth);
    return { ...vod, plays: undefined, lines };
  });

  // 大类下的小类标签聚合（下钻用）
  app.get("/api/subtypes", async (req) => {
    const type = String((req.query as any).type || "");
    if (!type) return [];
    const rows = await prisma.vod.groupBy({
      by: ["subType"],
      where: { typeName: type, subType: { not: "" } },
      _count: { _all: true },
      orderBy: { _count: { subType: "desc" } },
    });
    return rows.map((r) => ({ name: r.subType, count: r._count._all }));
  });

  // 分类聚合
  app.get("/api/types", async () => {
    const rows = await prisma.vod.groupBy({
      by: ["typeName"],
      _count: { _all: true },
      orderBy: { _count: { typeName: "desc" } },
    });
    return rows.map((r) => ({ name: r.typeName, count: r._count._all }));
  });

  // 编辑单片（需登录）：只更新允许的字段
  app.put("/api/vods/:id", { preHandler: authGuard }, async (req) => {
    const id = Number((req.params as any).id);
    const b = (req.body as any) || {};
    const data: any = {};
    const fields = ["name", "year", "typeName", "pic", "actor", "director", "area", "lang", "remarks", "blurb", "officialIntro", "officialPic", "genres"];
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
