import type { FastifyInstance } from "fastify";
import { resolveShareUrl } from "../collector/resolver.js";

// 简单内存缓存（sign 会过期，TTL 取短一点）
const cache = new Map<string, { at: number; result: any }>();
const TTL = 10 * 60 * 1000; // 10分钟

export default async function resolveRoutes(app: FastifyInstance) {
  // 公开：前端播放分享页源时调用，返回真实可播直链
  app.get("/api/resolve", async (req) => {
    const url = (req.query as any).url as string;
    if (!url) return { ok: false, error: "缺少 url 参数" };
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < TTL) return hit.result;
    const result = await resolveShareUrl(url);
    if (result.ok) cache.set(url, { at: Date.now(), result });
    return result;
  });
}
