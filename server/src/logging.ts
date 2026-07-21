import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import net from "node:net";
import { adminUserFromToken, verifyToken } from "./auth.js";
import { prisma } from "./db.js";
import { recordPlayHealth } from "./playHealth.js";

const LOCATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const inflightLocations = new Map<string, Promise<any>>();

function normalizeIp(value: any): string {
  let raw = String(value || "").trim();
  if (!raw) return "";
  raw = raw.replace(/^::ffff:/, "");
  if (raw.startsWith("[") && raw.includes("]")) raw = raw.slice(1, raw.indexOf("]"));
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(raw)) raw = raw.slice(0, raw.lastIndexOf(":"));
  return net.isIP(raw) ? raw : "";
}

function headerValues(req: FastifyRequest, name: string): string[] {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.flatMap((item) => String(item).split(","));
  return String(value || "").split(",");
}

export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map((x) => Number(x));
    return a === 10
      || a === 127
      || a >= 240
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)
      || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }
  return true;
}

export function clientIpOf(req: FastifyRequest | any): string {
  const candidates = [
    ...headerValues(req, "cf-connecting-ipv6"),
    ...headerValues(req, "cf-connecting-ip"),
    ...headerValues(req, "true-client-ip"),
    ...headerValues(req, "x-forwarded-for"),
    ...headerValues(req, "x-real-ip"),
    req?.ip,
  ].map(normalizeIp).filter(Boolean);
  const publicIp = candidates.find((ip) => !isPrivateIp(ip));
  return publicIp || candidates[0] || "";
}

function userAgentOf(req: FastifyRequest) {
  return String(req.headers["user-agent"] || "").slice(0, 500);
}

type AccessLogUser = {
  userType: "admin" | "web" | "guest";
  userId: number | null;
};

const GUEST_USER: AccessLogUser = { userType: "guest", userId: null };

function positiveInt(value: any): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function authUserOf(req: FastifyRequest): Promise<AccessLogUser> {
  const h = String(req.headers.authorization || "");
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return GUEST_USER;
  try {
    const data: any = verifyToken(token);
    if (data?.kind === "web") {
      const userId = positiveInt(data.mid);
      if (userId) return { userType: "web", userId };
    }
    if (data?.kind === "admin") {
      const userId = positiveInt(data.uid);
      if (!userId) return GUEST_USER;
      await adminUserFromToken(token);
      return { userType: "admin", userId };
    }
  } catch {}
  return GUEST_USER;
}

function pathOf(url: string) {
  const i = url.search(/[?#]/);
  return i >= 0 ? url.slice(0, i) : url;
}

function shouldSkipAccessLog(url: string) {
  const path = pathOf(url);
  if (
    path === "/health"
    || path === "/api/hls-mp"
    || path === "/api/hls-key"
    || path === "/api/hls-ts"
    || path === "/api/admin"
    || path.startsWith("/api/admin/")
    || path === "/api/playback-errors"
    || path.startsWith("/api/playback-errors/")
    || path === "/api/auth"
    || path.startsWith("/api/auth/")
  ) return true;
  return path.startsWith("/api/jinpai-local/") && /\.(m3u8|ts|key)$/i.test(path);
}

async function fetchJson(url: string, timeoutMs = 2500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "video-cms-ip-lookup/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function lookupIpLocationRaw(ip: string) {
  try {
    const data: any = await fetchJson(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,isp,org,as,query&lang=zh-CN`);
    if (data?.status === "success") {
      return {
        country: String(data.country || ""),
        region: String(data.regionName || ""),
        city: String(data.city || ""),
        isp: String(data.isp || ""),
        org: String(data.org || ""),
        asn: String(data.as || ""),
        source: "ip-api",
        raw: data,
      };
    }
  } catch {}
  try {
    const data: any = await fetchJson(`https://ipinfo.io/${encodeURIComponent(ip)}/json`);
    return {
      country: String(data.country || ""),
      region: String(data.region || ""),
      city: String(data.city || ""),
      isp: String(data.org || ""),
      org: String(data.org || ""),
      asn: String(data.org || ""),
      source: "ipinfo",
      raw: data,
    };
  } catch {}
  return { country: "", region: "", city: "", isp: "", org: "", asn: "", source: "", raw: {} };
}

export async function ipLocation(ip: string) {
  if (!ip || isPrivateIp(ip)) return { country: "", region: "", city: "", isp: "", org: "", asn: "", source: "", raw: "{}" };
  const cached = await prisma.ipLocationCache.findUnique({ where: { ip } }).catch(() => null);
  if (cached && Date.now() - cached.updatedAt.getTime() < LOCATION_TTL_MS) return cached;
  if (!inflightLocations.has(ip)) {
    inflightLocations.set(ip, (async () => {
      const data = await lookupIpLocationRaw(ip);
      return prisma.ipLocationCache.upsert({
        where: { ip },
        create: { ip, ...data, raw: JSON.stringify(data.raw || {}) },
        update: { ...data, raw: JSON.stringify(data.raw || {}) },
      });
    })().finally(() => inflightLocations.delete(ip)));
  }
  return inflightLocations.get(ip)!;
}

export function recordLoginLog(req: FastifyRequest, data: { userType: "admin" | "web"; userId?: number | null; username?: string; success: boolean; message?: string }) {
  const ip = clientIpOf(req);
  void (async () => {
    const loc = await ipLocation(ip).catch(() => null as any);
    await prisma.loginLog.create({
      data: {
        userType: data.userType,
        userId: data.userId || null,
        username: String(data.username || "").slice(0, 120),
        success: data.success,
        message: String(data.message || "").slice(0, 300),
        ip,
        country: loc?.country || "",
        region: loc?.region || "",
        city: loc?.city || "",
        isp: loc?.isp || "",
        userAgent: userAgentOf(req),
      },
    }).catch(() => {});
  })();
}

export function recordPlaybackError(req: FastifyRequest, payload: any) {
  const ip = clientIpOf(req);
  const detail = payload?.detail && typeof payload.detail === "object" ? payload.detail : {};
  const failures = Array.isArray(detail?.failures) ? detail.failures : [];
  const firstFailure = failures.find((item: any) => item && typeof item === "object") || {};
  const current = detail?.current && typeof detail.current === "object" ? detail.current : {};
  const hlsErrorData = payload?.hlsErrorData || payload?.hlsError || detail?.hlsErrorData || detail?.hlsError || firstFailure?.hlsErrorData || {};
  const playId = Number(payload?.playId ?? current?.playId ?? firstFailure?.playId) || null;
  const lineName = String(payload?.lineName || firstFailure?.lineName || firstFailure?.line || "").slice(0, 160);
  const sourceName = String(payload?.sourceName || firstFailure?.sourceName || lineName || "").slice(0, 160);
  const url = String(payload?.url || current?.url || firstFailure?.url || detail?.url || "").slice(0, 1200);
  const rule = String(payload?.rule || current?.rule || firstFailure?.rule || detail?.rule || "").slice(0, 80);
  const proxyMode = String(payload?.proxyMode || current?.proxyMode || firstFailure?.proxyMode || detail?.proxyMode || "").slice(0, 40);
  const cleanId = Number(payload?.cleanId ?? current?.cleanId ?? firstFailure?.cleanId ?? detail?.cleanId) || null;
  const fallbackUrl = String(payload?.fallbackUrl || current?.fallbackUrl || firstFailure?.fallbackUrl || detail?.fallbackUrl || "").slice(0, 1200);
  const ipKind = net.isIP(ip) === 6 ? "ipv6" : net.isIP(ip) === 4 ? "ipv4" : "";
  void (async () => {
    const loc = await ipLocation(ip).catch(() => null as any);
    await prisma.playbackErrorLog.create({
      data: {
        vodId: Number(payload?.vodId) || null,
        vodName: String(payload?.vodName || "").slice(0, 160),
        playId,
        lineName,
        sourceName,
        epIndex: Number.isFinite(Number(payload?.epIndex ?? firstFailure?.epIndex)) ? Number(payload?.epIndex ?? firstFailure?.epIndex) : null,
        epName: String(payload?.epName || firstFailure?.epName || "").slice(0, 120),
        url,
        rule,
        proxyMode,
        cleanId,
        fallbackUrl,
        hlsErrorData: JSON.stringify(hlsErrorData || {}),
        ipType: ipKind,
        page: String(payload?.page || "").slice(0, 260),
        message: String(payload?.message || firstFailure?.error || "").slice(0, 500),
        detail: JSON.stringify({ ...detail, normalized: { url, rule, proxyMode, cleanId, fallbackUrl, ipType: ipKind } }),
        ip,
        country: loc?.country || "",
        region: loc?.region || "",
        city: loc?.city || "",
        isp: loc?.isp || "",
        userAgent: userAgentOf(req),
      },
    }).catch(() => {});
    await recordPlayHealth(playId, false, { reason: String(payload?.message || firstFailure?.error || "playback_error") });
  })();
}

export function installAccessLogger(app: FastifyInstance) {
  app.addHook("onResponse", async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url || "";
    if (shouldSkipAccessLog(url)) return;
    const auth = await authUserOf(req);
    if (auth.userType === "admin") return;
    const ip = clientIpOf(req);
    const ms = Math.max(0, Math.round((reply as any).elapsedTime || 0));
    void (async () => {
      const loc = await ipLocation(ip).catch(() => null as any);
      await prisma.requestAccessLog.create({
        data: {
          userType: auth.userType,
          userId: auth.userId,
          method: req.method,
          path: url.slice(0, 600),
          status: reply.statusCode,
          ms,
          ip,
          country: loc?.country || "",
          region: loc?.region || "",
          city: loc?.city || "",
          isp: loc?.isp || "",
          userAgent: userAgentOf(req),
          referer: String(req.headers.referer || req.headers.referrer || "").slice(0, 500),
        },
      }).catch(() => {});
    })();
  });
}

function parseJson(value: string) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function paging(q: any) {
  const page = Math.max(1, Number(q.page) || 1);
  const size = Math.max(10, Math.min(200, Number(q.size) || 50));
  return { page, size, skip: (page - 1) * size };
}

export function registerLogRoutes(app: FastifyInstance, authGuard: any) {
  app.post("/api/playback-errors", async (req) => {
    recordPlaybackError(req, (req.body as any) || {});
    return { ok: true };
  });

  app.get("/api/admin/logs/playback-errors", { preHandler: authGuard }, async (req) => {
    const q = (req.query as any) || {};
    const { page, size, skip } = paging(q);
    const where: any = {};
    if (q.keyword) {
      const kw = String(q.keyword).trim();
      where.OR = [
        { vodName: { contains: kw, mode: "insensitive" } },
        { lineName: { contains: kw, mode: "insensitive" } },
        { sourceName: { contains: kw, mode: "insensitive" } },
        { message: { contains: kw, mode: "insensitive" } },
        { ip: { contains: kw } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.playbackErrorLog.count({ where }),
      prisma.playbackErrorLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: size }),
    ]);
    return { total, page, size, list: rows.map((row) => ({ ...row, detail: parseJson(row.detail) })) };
  });

  app.get("/api/admin/logs/playback-errors/aggregate", { preHandler: authGuard }, async (req) => {
    const q = (req.query as any) || {};
    const by = ["vod", "line", "source", "region", "ipType"].includes(String(q.by)) ? String(q.by) : "vod";
    const sinceHours = Math.max(1, Math.min(24 * 30, Number(q.sinceHours) || 24 * 7));
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    const field = by === "vod" ? "vodId" : by === "line" ? "playId" : by === "source" ? "sourceName" : by === "region" ? "region" : "ipType";
    const rows = await prisma.playbackErrorLog.groupBy({
      by: [field as any],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _count: { [field]: "desc" } } as any,
      take: Math.max(10, Math.min(100, Number(q.size) || 30)),
    } as any);
    const vodIds = by === "vod" ? rows.map((r: any) => Number(r.vodId)).filter(Boolean) : [];
    const playIds = by === "line" ? rows.map((r: any) => Number(r.playId)).filter(Boolean) : [];
    const [vods, plays] = await Promise.all([
      vodIds.length ? prisma.vod.findMany({ where: { id: { in: vodIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      playIds.length ? prisma.play.findMany({ where: { id: { in: playIds } }, select: { id: true, flag: true, source: { select: { name: true } }, vod: { select: { name: true } } } }) : Promise.resolve([]),
    ]);
    const vodMap = new Map(vods.map((v) => [v.id, v.name]));
    const playMap = new Map(plays.map((p) => [p.id, `${p.vod.name} / ${p.source.name || p.flag}`]));
    return {
      by,
      sinceHours,
      list: rows.map((r: any) => {
        const key = r[field] ?? "";
        const label = by === "vod" ? (vodMap.get(Number(key)) || String(key || "未知影片"))
          : by === "line" ? (playMap.get(Number(key)) || String(key || "未知线路"))
            : String(key || "未归类");
        return { key, label, count: r._count?._all || 0, lastAt: r._max?.createdAt || null };
      }),
    };
  });

  app.get("/api/admin/logs/logins", { preHandler: authGuard }, async (req) => {
    const q = (req.query as any) || {};
    const { page, size, skip } = paging(q);
    const where: any = {};
    if (q.userType) where.userType = String(q.userType);
    const [total, rows] = await Promise.all([
      prisma.loginLog.count({ where }),
      prisma.loginLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: size }),
    ]);
    return { total, page, size, list: rows };
  });

  app.get("/api/admin/logs/access", { preHandler: authGuard }, async (req) => {
    const q = (req.query as any) || {};
    const { page, size, skip } = paging(q);
    const where: any = {};
    if (q.keyword) {
      const kw = String(q.keyword).trim();
      where.OR = [
        { path: { contains: kw, mode: "insensitive" } },
        { ip: { contains: kw } },
        { userAgent: { contains: kw, mode: "insensitive" } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.requestAccessLog.count({ where }),
      prisma.requestAccessLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: size }),
    ]);
    return { total, page, size, list: rows };
  });
}
