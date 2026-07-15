import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { resolveShareUrl } from "../collector/resolver.js";
import { signPlaybackToken, signProxyToken } from "../auth.js";
import { getGlobalProxyMode, resolveEffectiveMode, refererOf } from "../playProxy.js";
import { accessForType, viewerFromRequest } from "../publicVod.js";
import { ensureHlsCleanConfig, findCleanResultForPlayback } from "../hls/cleaner.js";
import { createHlsCleanTask } from "../collector/taskRunner.js";
import { getDriver } from "../collector/drivers/index.js";
import { isICloudShareUrl, resolveICloudDirect } from "../icloud.js";
import { normalizeShortsConfig } from "./site.js";
import { JINPAI_FLAG } from "../collector/drivers/jinpai.js";
import { fetchEpisodeUrls, pickBest, clientIpOf, isEpisodeArchived, archiveEpDir, ARCHIVE_DIR } from "../jinpaiPlay.js";
import { LOCAL_FLAG } from "../collector/localSource.js";
import fsp from "node:fs";
import nodePath from "node:path";

// 简单内存缓存（sign 会过期，TTL 取短一点）
const cache = new Map<string, { at: number; result: any }>();
const inflight = new Map<string, Promise<any>>();
const TTL = 30 * 60 * 1000; // 30分钟（sign 实测稳定 >1h，配合前端 403 自愈兵双保险）
const MAX_CACHE = 2000;
const SHORTS_PREVIEW_CODES = new Set(["login_required", "vip_required", "level_required", "vip_or_level_required"]);

function vodInShortsScope(vod: { typeName?: string; subType?: string }, config: any) {
  const type = String(vod?.typeName || "");
  const sub = String(vod?.subType || "");
  const types = Array.isArray(config?.preferredTypes) ? config.preferredTypes.map((x: any) => String(x || "").trim()).filter(Boolean) : [];
  const subtypes = Array.isArray(config?.preferredSubtypes) ? config.preferredSubtypes : [];
  if (!types.length && !subtypes.length) return type === config.defaultType;
  if (types.includes(type)) return true;
  return subtypes.some((item: any) => String(item?.type || "") === type && String(item?.name || item?.subType || item?.sub || "") === sub);
}

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
        include: { vod: true, source: { select: { enabled: true, proxyMode: true, apiUrl: true, driver: true, signKey: true } } },
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
        && vodInShortsScope(play.vod, shortsConfig)
        && epIndex < shortsConfig.guestPreviewEpisodes
        && SHORTS_PREVIEW_CODES.has(String(watchAccess.code || ""));
      if (!watchAccess.allowed && !shortsPreviewAllowed) {
        return { ok: false, code: watchAccess.code, error: watchAccess.message || "无观看权限", requirement: (watchAccess as any).requirement || null };
      }
      let episodes: Array<{ name?: string; url?: string }> = [];
      try { episodes = JSON.parse(play.episodes || "[]"); } catch {}
      const url = episodes[epIndex]?.url || "";
      if (!url) return { ok: false, error: "播放集数不存在" };
      // iCloud 系源（方案A）：服务器不解析，直接返回原始 iCloud 分享链（解码），
      // 由浏览器 Service Worker 拦截 iclouddrive 请求走 CloudKit 客户端解析。不走代理/清洗（那会让解析汇聚到本站IP→被封）。
      if (play.flag === "icloudm3u8") {
        let icloudUrl = url;
        try { icloudUrl = decodeURIComponent(url); } catch {}
        // 按需拉字幕（dramaNumber 实测 = epIndex+1），字幕文件同为 iCloud 链，交前端 SW 解析
        let subtitles: Array<{ lang: string; label: string; url: string }> = [];
        try {
          const drv = getDriver((play.source as any).driver);
          if (drv.fetchSubtitle) {
            const tracks = await drv.fetchSubtitle((play.source as any).apiUrl, String(play.sourceVodId), epIndex + 1);
            // 字幕走本站同源代理，避免跨域 <track> 被浏览器 CORS 拦截
            subtitles = tracks.map((t, i) => ({ lang: t.lang, label: t.label, url: `/api/subtitle?playId=${playId}&epIndex=${epIndex}&i=${i}` }));
          }
        } catch { /* 字幕失败不阻断播放 */ }
        return { ok: true, url: icloudUrl, kind: "m3u8", rule: "icloud_client", subtitles };
      }
      // 本地源（转存产物独立线路）：url 存该集 nid，直接服务本站本地 HLS。
      // 只在文件在时可播；本地源 Source 默认 enabled=false，故默认不对前台开放(publicPlayableFilter 已过滤)。
      if (play.flag === LOCAL_FLAG) {
        const nid = String(url).trim();
        const vodSvid = String(play.sourceVodId);
        if (isEpisodeArchived(vodSvid, nid)) {
          return { ok: true, url: `/api/jinpai-local/${vodSvid}/${nid}/index.m3u8`, kind: "m3u8", rule: "local_archive" };
        }
        return { ok: false, error: "本地文件不存在(可能已删除或未转存该集)" };
      }
      // 金牌影院系源（jinpai）：url 存的是该集 nid，vodId 取 play.sourceVodId。
      // 用「客户端真实 IP」向源站签名换 CDN m3u8，前端直连（whip 绑客户端/国内 auth_key 不绑）。
      // 注：转存产物不再在此透明替换，改为独立「本地源」线路(flag=LOCAL_FLAG)显式播放。
      if (play.flag === JINPAI_FLAG) {
        const nid = String(url).trim();
        const vodSvid = String(play.sourceVodId);
        // 客户端 IP 签名 → CDN 直连；返回全部清晰度供前台切换
        try {
          const list = await fetchEpisodeUrls({
            apiUrl: (play.source as any).apiUrl,
            signKey: (play.source as any).signKey,
            vodId: vodSvid,
            nid,
            clientIp: clientIpOf(req),
          });
          const best = pickBest(list);
          if (!best?.url) return { ok: false, error: "源站无可播地址" };
          const qualities = list.map((x) => ({ resolution: x.resolution, name: x.resolutionName, url: x.url }));
          return { ok: true, url: best.url, kind: "m3u8", rule: "jinpai_client", resolution: best.resolution, qualities };
        } catch (e: any) {
          return { ok: false, error: `源站解析失败: ${String(e?.message || e).slice(0, 80)}` };
        }
      }
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
      if (cfg.requireCleanPlayback) {
        return {
          ok: false,
          code: "hls_clean_missing",
          error: cfg.autoQueueOnMiss ? "该线路尚未完成清洗，已提交后台清洗任务" : "该线路尚未完成清洗",
        };
      }
      return result;
    }

    return { ok: false, error: "缺少播放参数" };
  });

  // iCloud 字幕同源代理：服务端解析 iCloud .vtt 后同源返回，前端 <track> 零跨域（字幕体积小、每集一次，无视频那种 IP 风险）
  app.get("/api/subtitle", async (req, reply) => {
    const q = req.query as any;
    const playId = Number(q.playId);
    const epIndex = Math.max(0, Number(q.epIndex) || 0);
    const i = Math.max(0, Number(q.i) || 0);
    if (!playId) return reply.code(400).send("missing playId");
    const play = await prisma.play.findUnique({
      where: { id: playId },
      include: { source: { select: { enabled: true, apiUrl: true, driver: true } } },
    });
    if (!play || !play.source.enabled || play.flag !== "icloudm3u8") return reply.code(404).send("not found");
    try {
      const drv = getDriver((play.source as any).driver);
      if (!drv.fetchSubtitle) return reply.code(404).send("no subtitle");
      const tracks = await drv.fetchSubtitle((play.source as any).apiUrl, String(play.sourceVodId), epIndex + 1);
      const sub = tracks[i];
      if (!sub?.url) return reply.code(404).send("no subtitle");
      const direct = isICloudShareUrl(sub.url) ? await resolveICloudDirect(sub.url) : sub.url;
      const r = await fetch(direct, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) return reply.code(502).send("subtitle fetch failed");
      let text = await r.text();
      if (!/^\uFEFF?WEBVTT/.test(text)) text = "WEBVTT\n\n" + text; // 容错：缺头补 WEBVTT
      reply.header("content-type", "text/vtt; charset=utf-8");
      reply.header("cache-control", "public, max-age=3600");
      return text;
    } catch {
      return reply.code(502).send("subtitle error");
    }
  });

  // jinpai 本地转存 HLS 静态服务：/api/jinpai-local/{vodId}/{nid}/{file}
  //  index.m3u8 内分片为相对名(seg_xxxxx.ts)，播放器自动拼到同目录 → 命中本路由。
  app.get("/api/jinpai-local/:vodId/:nid/:file", async (req, reply) => {
    const p = req.params as any;
    const vodId = String(p.vodId || "").replace(/[^0-9]/g, "");
    const nid = String(p.nid || "").replace(/[^0-9]/g, "");
    const file = String(p.file || "");
    // 只允许 index.m3u8 / seg_xxxxx.ts / key_x.key，防路径穿越
    if (!vodId || !nid || !/^(index\.m3u8|seg_\d+\.ts|key_\d+\.key)$/.test(file)) return reply.code(404).send("not found");
    const full = nodePath.join(archiveEpDir(vodId, nid), file);
    if (!full.startsWith(ARCHIVE_DIR)) return reply.code(403).send("forbidden");
    if (!fsp.existsSync(full)) return reply.code(404).send("not found");
    const ct = file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : file.endsWith(".key") ? "application/octet-stream" : "video/mp2t";
    reply.header("content-type", ct);
    reply.header("cache-control", file.endsWith(".m3u8") ? "no-cache" : "public, max-age=86400");
    reply.header("access-control-allow-origin", "*");
    return reply.send(fsp.createReadStream(full));
  });
}
