import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { resolveShareUrl } from "../collector/resolver.js";
import { signPlaybackToken } from "../auth.js";
import { accessForType, viewerFromRequest } from "../publicVod.js";
import { ensureHlsCleanConfig, findCleanResultForPlayback } from "../hls/cleaner.js";
import { createHlsCleanTask } from "../collector/taskRunner.js";

// 简单内存缓存（sign 会过期，TTL 取短一点）
const cache = new Map<string, { at: number; result: any }>();
const TTL = 10 * 60 * 1000; // 10分钟

export default async function resolveRoutes(app: FastifyInstance) {
  async function resolveWithCache(cacheKey: string, url: string) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL) return hit.result;
    const result = await resolveShareUrl(url);
    if (result.ok) cache.set(cacheKey, { at: Date.now(), result });
    return result;
  }

  // 公开：前端只提交影片/线路/集数标识，后端从数据库取真实地址并解析。
  app.get("/api/resolve", async (req) => {
    const q = req.query as any;
    const playId = Number(q.playId);
    const epIndex = Math.max(0, Number(q.epIndex) || 0);
    const vodId = Number(q.vodId);
    if (playId && vodId) {
      const play = await prisma.play.findUnique({
        where: { id: playId },
        include: { vod: true, source: { select: { enabled: true } } },
      });
      if (!play || !play.source.enabled || play.vodId !== vodId || play.vod.status !== "online") {
        return { ok: false, error: "播放资源不存在或不可用" };
      }
      const viewer = await viewerFromRequest(req);
      const watchAccess = await accessForType(play.vod.typeName, "watch", viewer);
      if (!watchAccess.allowed) {
        return { ok: false, code: watchAccess.code, error: watchAccess.message || "无观看权限" };
      }
      let episodes: Array<{ name?: string; url?: string }> = [];
      try { episodes = JSON.parse(play.episodes || "[]"); } catch {}
      const url = episodes[epIndex]?.url || "";
      if (!url) return { ok: false, error: "播放集数不存在" };
      const result = await resolveWithCache(`play:${playId}:${epIndex}`, url);
      if (!result?.ok || !result.url || !/\.m3u8(\?|$)/i.test(result.url)) return result;
      const cfg = await ensureHlsCleanConfig();
      if (!cfg.enabled) return result;
      const clean = await findCleanResultForPlayback({ id: play.id, sourceId: play.sourceId, vod: play.vod }, result.url);
      if (clean) {
        const token = signPlaybackToken({ cleanId: clean.id, playId: play.id, vodId: play.vodId });
        return {
          ...result,
          url: `/api/hls-clean/${clean.id}/index.m3u8?t=${encodeURIComponent(token)}`,
          kind: "m3u8",
          rule: "hls_clean",
          cleanId: clean.id,
          fallbackUrl: result.url,
        };
      }
      if (cfg.autoQueueOnMiss) {
        void createHlsCleanTask({ playId: play.id, epIndex, episodeMode: "first", limit: 1 }).catch(() => {});
      }
      return result;
    }

    return { ok: false, error: "缺少播放参数" };
  });
}
