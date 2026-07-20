import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import net from "node:net";
import { prisma } from "./db.js";

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

function authUserOf(req: FastifyRequest) {
  const h = String(req.headers.authorization || "");
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return { userType: "guest", userId: null as number | null };
  try {
    const data: any = jwt.decode(token);
    if (data?.kind === "web" && data.mid) return { userType: "web", userId: Number(data.mid) || null };
    if (data?.uid) return { userType: "admin", userId: Number(data.uid) || null };
  } catch {}
  return { userType: "guest", userId: null as number | null };
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
  void (async () => {
    const loc = await ipLocation(ip).catch(() => null as any);
    await prisma.playbackErrorLog.create({
      data: {
        vodId: Number(payload?.vodId) || null,
        vodName: String(payload?.vodName || "").slice(0, 160),
        playId: Number(payload?.playId) || null,
        lineName: String(payload?.lineName || "").slice(0, 160),
        sourceName: String(payload?.sourceName || "").slice(0, 160),
        epIndex: Number.isFinite(Number(payload?.epIndex)) ? Number(payload.epIndex) : null,
        epName: String(payload?.epName || "").slice(0, 120),
        page: String(payload?.page || "").slice(0, 260),
        message: String(payload?.message || "").slice(0, 500),
        detail: JSON.stringify(payload?.detail || {}),
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

export function installAccessLogger(app: FastifyInstance) {
  app.addHook("onResponse", async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url || "";
    if (url === "/health" || url.startsWith("/api/admin/logs") || url.startsWith("/api/playback-errors")) return;
    const ip = clientIpOf(req);
    const auth = authUserOf(req);
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
