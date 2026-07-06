import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { resolveShareUrl } from "../collector/resolver.js";
import { signPlaybackToken, signProxyToken } from "../auth.js";
import { getGlobalProxyMode, resolveEffectiveMode, refererOf } from "../playProxy.js";
import { accessForType, viewerFromRequest } from "../publicVod.js";
import { ensureHlsCleanConfig, findCleanResultForPlayback } from "../hls/cleaner.js";
import { createHlsCleanTask } from "../collector/taskRunner.js";
import { normalizeShortsConfig } from "./site.js";

// 简单内存缓存（sign 会过期，TTL 取短一点）
const cache = new Map<string, { at: number; result: any }>();
const inflight = new Map<string, Promise<any>>();
const TTL = 30 * 60 * 1000; // 30分钟（sign 实测稳定 >1h，配合前端 403 自愈兵双保险）
const MAX_CACHE = 2000;
const SHORTS_PREVIEW_CODES = new Set(["login_required", "vip_required", "level_required", "vip_or_level_required"]);

export default async function resolveRoutes(app: FastifyInstance) {
  function setCache(cacheKey: string, result: any) {
    cache.delete(cacheKey);
    cache.set(cacheKey, { at: Date.now(), result });
    while (cache.size > MAX_CACHE) {
      const firstKey = cache.keys().next().value;
      if (!firstKey) break;
      cache.delete(firstKey);
    }
  }

  async function resolveWithCache(cacheKey: string, url: string, force = false) {
    if (force) {
      cache.delete(cacheKey); // 自愈：强制重解，丢弃旧 sign
      inflight.delete(cacheKey);
    }
    if (!force) {
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.at < TTL) {
        cache.delete(cacheKey);
        cache.set(cacheKey, hit);
        return hit.result;
      }
      if (hit) cache.delete(cacheKey);
      const pending = inflight.get(cacheKey);
      if (pending) return pending;
    }
    const task = resolveShareUrl(url).then((result) => {
      if (result.ok) setCache(cacheKey, result);
      return result;
    }).finally(() => {
      if (inflight.get(cacheKey) === task) inflight.delete(cacheKey);
    });
    if (!force) inflight.set(cacheKey, task);
    return task;
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
        include: { vod: true, source: { select: { enabled: true, proxyMode: true } } },
      });
      if (!play || !play.source.enabled || play.vodId !== vodId || play.vod.status !== "online") {
        return { ok: false, error: "播放资源不存在或不可用" };
      }
      const viewer = await viewerFromRequest(req);
      const watchAccess = await accessForType(play.vod.typeName, "watch", viewer);
      const site = await prisma.siteConfig.findUnique({ where: { id: 1 } });
      const shortsConfig = normalizeShortsConfig((site as any)?.shortsConfig);
      const shortsPreviewAllowed = shortsConfig.enabled
        && !viewer
        && String(q.context || "") === "shorts"
        && play.vod.typeName === shortsConfig.defaultType
        && epIndex < shortsConfig.guestPreviewEpisodes
        && SHORTS_PREVIEW_CODES.has(String(watchAccess.code || ""));
      if (!watchAccess.allowed && !shortsPreviewAllowed) {
        return { ok: false, code: watchAccess.code, error: watchAccess.message || "无观看权限", requirement: (watchAccess as any).requirement || null };
      }
      let episodes: Array<{ name?: string; url?: string }> = [];
      try { episodes = JSON.parse(play.episodes || "[]"); } catch {}
      const url = episodes[epIndex]?.url || "";
      if (!url) return { ok: false, error: "播放集数不存在" };
      const fresh = q.fresh === "1" || q.fresh === "true"; // 前端撞 403 时传 fresh=1 强制重解拿新 sign
      const result = await resolveWithCache(`play:${playId}:${epIndex}`, url, fresh);
      if (!result?.ok || !result.url || !/\.m3u8(\?|$)/i.test(result.url)) return result;
      // 回源模式：source.proxyMode(inherit→全局)。key/proxy 才走本站中转，direct 保持原逻辑
      const globalMode = await getGlobalProxyMode();
      const effMode = resolveEffectiveMode((play.source as any).proxyMode, globalMode);
      if (effMode !== "direct") {
        const ref = refererOf(result.url);
        const tok = signProxyToken({ u: result.url, ref, kind: "mp", mode: effMode, mid: viewer?.id });
        return { ...result, url: `/api/hls-mp?t=${encodeURIComponent(tok)}`, kind: "m3u8", rule: `proxy_${effMode}`, fallbackUrl: result.url };
      }
      const cfg = await ensureHlsCleanConfig();
      if (!cfg.enabled) return result;
      const clean = await findCleanResultForPlayback({ id: play.id, sourceId: play.sourceId, vod: play.vod }, result.url);
      if (clean) {
        const token = signPlaybackToken({ cleanId: clean.id, playId: play.id, vodId: play.vodId, mid: viewer?.id });
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
