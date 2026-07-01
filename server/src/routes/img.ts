import type { FastifyInstance } from "fastify";

// 图片代理：解决豆瓣等图床防盗链（无 Referer 返回 418，需带同源 Referer）
// 仅代理白名单图床，避免被当作开放代理滥用（SSRF 防护）
const ALLOW = [
  "doubanio.com",
  "douban.com",
];

function refererFor(host: string): string {
  if (host.includes("douban")) return "https://movie.douban.com/";
  return "";
}

export default async function imgRoutes(app: FastifyInstance) {
  app.get("/api/img", async (req, reply) => {
    const u = String((req.query as any).u || "");
    if (!u) return reply.code(400).send({ error: "missing u" });
    let target: URL;
    try {
      target = new URL(u);
    } catch {
      return reply.code(400).send({ error: "bad url" });
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return reply.code(400).send({ error: "bad protocol" });
    }
    const host = target.hostname;
    if (!ALLOW.some((d) => host === d || host.endsWith("." + d))) {
      return reply.code(403).send({ error: "host not allowed" });
    }
    try {
      const upstream = await fetch(target.toString(), {
        headers: {
          Referer: refererFor(host),
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        },
      });
      if (!upstream.ok || !upstream.body) {
        return reply.code(502).send({ error: "upstream " + upstream.status });
      }
      const ct = upstream.headers.get("content-type") || "image/jpeg";
      const buf = Buffer.from(await upstream.arrayBuffer());
      reply
        .header("Content-Type", ct)
        .header("Cache-Control", "public, max-age=604800, immutable")
        .send(buf);
    } catch (e: any) {
      return reply.code(502).send({ error: e?.message || "fetch failed" });
    }
  });
}
