import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { enabledCleanOnlySourceIds, enabledPlayableSourceIds, enabledTypeNames, formatPublicRating, publicPlayableFilter, publicTypeFilter } from "../publicVod.js";

const SITEMAP_LIMIT = 50000;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripText(value: unknown, max = 180) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function jsonLd(value: any) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function publicBaseUrl(req: FastifyRequest) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return `${proto}://${host || "localhost"}`.replace(/\/+$/, "");
}

async function publicVodWhere() {
  const [publicTypes, sourceIds, cleanOnlySourceIds] = await Promise.all([enabledTypeNames(null), enabledPlayableSourceIds(), enabledCleanOnlySourceIds()]);
  return {
    status: "online",
    typeName: publicTypeFilter(publicTypes),
    ...publicPlayableFilter(sourceIds, cleanOnlySourceIds),
  };
}

async function siteInfo() {
  const site = await prisma.siteConfig.findUnique({ where: { id: 1 } }).catch(() => null);
  return {
    name: site?.siteName || "视频CMS",
    description: site?.description || "高清影视内容聚合与播放",
    logo: site?.logo || "",
  };
}

function imageOf(vod: any) {
  return vod.heroPic || vod.officialPic || vod.pic || vod.localPic || "";
}

function vodDescription(vod: any, siteDesc: string) {
  return stripText(vod.officialIntro || vod.blurb || [vod.name, vod.typeName, vod.year, vod.remarks].filter(Boolean).join(" "), 220) || siteDesc;
}

export default async function seoRoutes(app: FastifyInstance) {
  app.get("/vod/:id", async (req, reply) => {
    const id = Number((req.params as any).id);
    const [where, site] = await Promise.all([publicVodWhere(), siteInfo()]);
    const vod = Number.isInteger(id) && id > 0
      ? await prisma.vod.findFirst({
        where: { ...where, id },
        include: {
          people: { include: { person: true }, orderBy: [{ role: "asc" }, { sort: "asc" }] },
          images: { orderBy: [{ isHero: "desc" }, { score: "desc" }], take: 6 },
          _count: { select: { plays: true } },
        },
      })
      : null;
    if (!vod) return reply.code(404).type("text/html; charset=utf-8").send("<!doctype html><title>影片不存在</title><h1>影片不存在</h1>");

    const baseUrl = publicBaseUrl(req);
    const canonical = `${baseUrl}/vod/${vod.id}`;
    const spaUrl = `${baseUrl}/#/play/${vod.id}`;
    const mobileUrl = `${baseUrl}/#/m/detail/${vod.id}`;
    const title = `${vod.name}${vod.year ? ` (${vod.year})` : ""} - ${site.name}`;
    const description = vodDescription(vod, site.description);
    const image = imageOf(vod);
    const imageUrl = image ? new URL(image, baseUrl).toString() : "";
    const actors = (vod.people || []).filter((p: any) => p.role === "actor").map((p: any) => p.person?.name).filter(Boolean).slice(0, 12);
    const directors = (vod.people || []).filter((p: any) => p.role === "director").map((p: any) => p.person?.name).filter(Boolean).slice(0, 6);
    const rating = formatPublicRating(vod.rating);
    const graph = [
      {
        "@type": "Movie",
        "@id": `${canonical}#movie`,
        name: vod.name,
        description,
        url: canonical,
        image: imageUrl || undefined,
        datePublished: vod.year || undefined,
        genre: vod.genres ? vod.genres.split(/[,，/]/).map((s) => s.trim()).filter(Boolean) : undefined,
        actor: actors.map((name: string) => ({ "@type": "Person", name })),
        director: directors.map((name: string) => ({ "@type": "Person", name })),
        aggregateRating: rating ? { "@type": "AggregateRating", ratingValue: rating, ratingCount: Math.max(1, Number(vod.ratingCount || 1)) } : undefined,
      },
      {
        "@type": "VideoObject",
        "@id": `${canonical}#video`,
        name: vod.name,
        description,
        thumbnailUrl: imageUrl ? [imageUrl] : undefined,
        uploadDate: vod.contentUpdatedAt || vod.updatedAt || vod.createdAt,
        embedUrl: spaUrl,
        url: canonical,
      },
    ];

    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="video.movie">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : ""}
  <script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@graph": graph })}</script>
  <style>
    body{margin:0;background:#0b0d12;color:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{max-width:980px;margin:0 auto;padding:28px 18px 42px}
    .hero{display:grid;grid-template-columns:minmax(160px,260px) 1fr;gap:24px;align-items:start}
    img{width:100%;border-radius:8px;background:#151820}
    h1{margin:0 0 12px;font-size:32px;line-height:1.18;letter-spacing:0}
    p{color:#c4cad6;line-height:1.7}
    .meta{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
    .meta span{padding:5px 9px;border-radius:999px;background:#1c2230;color:#dfe5f2;font-size:13px}
    .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
    a{color:#111827;background:#f8c64d;text-decoration:none;padding:11px 16px;border-radius:6px;font-weight:700}
    a.secondary{background:#202838;color:#eef2ff}
    @media(max-width:640px){.hero{grid-template-columns:110px 1fr;gap:14px}h1{font-size:22px}main{padding-top:18px}}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(vod.name)}">` : "<div></div>"}
      <div>
        <h1>${escapeHtml(vod.name)}</h1>
        <div class="meta">
          ${[vod.typeName, vod.year, vod.area, vod.lang, vod.remarks, rating ? `评分 ${rating}` : ""].filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
        <p>${escapeHtml(description)}</p>
        <p>${escapeHtml([directors.length ? `导演：${directors.join(" / ")}` : "", actors.length ? `主演：${actors.slice(0, 8).join(" / ")}` : ""].filter(Boolean).join("　"))}</p>
        <div class="actions">
          <a href="${escapeHtml(spaUrl)}">立即播放</a>
          <a class="secondary" href="${escapeHtml(mobileUrl)}">移动详情页</a>
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
    return reply.header("Cache-Control", "public, max-age=300").type("text/html; charset=utf-8").send(html);
  });

  app.get("/sitemap.xml", async (req, reply) => {
    const baseUrl = publicBaseUrl(req);
    const where = await publicVodWhere();
    const rows = await prisma.vod.findMany({
      where,
      select: { id: true, updatedAt: true, contentUpdatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: SITEMAP_LIMIT,
    });
    const urls = rows.map((row) => {
      const lastmod = (row.contentUpdatedAt || row.updatedAt || new Date()).toISOString();
      return `<url><loc>${escapeHtml(`${baseUrl}/vod/${row.id}`)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`;
    }).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
    return reply.header("Cache-Control", "public, max-age=1800").type("application/xml; charset=utf-8").send(xml);
  });

  app.get("/robots.txt", async (req, reply) => {
    const baseUrl = publicBaseUrl(req);
    return reply.header("Cache-Control", "public, max-age=1800").type("text/plain; charset=utf-8").send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Sitemap: ${baseUrl}/sitemap.xml
`);
  });
}
