// 回源代理核心：回源模式判定 + SSRF 安全抓取 + m3u8 重写(KEY/TS 改写指向本站接口)
// 设计铁律：默认 direct 不主动下载/中转任何 TS；key/proxy 必须由后台逐源手动开启。
import { URL } from "node:url";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { prisma } from "./db.js";

export type ProxyMode = "direct" | "key" | "proxy";
export type SourceProxyMode = "inherit" | ProxyMode;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120";

// ============ 回源模式判定 ============
// 全局默认从 SiteConfig.playConfig.proxyMode 读取，缺省 direct(最省，不下载)
export async function getGlobalProxyMode(): Promise<ProxyMode> {
  try {
    const site = await prisma.siteConfig.findUnique({ where: { id: 1 }, select: { playConfig: true } });
    const cfg = JSON.parse((site as any)?.playConfig || "{}");
    const m = String(cfg?.proxyMode || "").toLowerCase();
    if (m === "direct" || m === "key" || m === "proxy") return m;
  } catch { /* ignore */ }
  return "direct";
}

// 源级 inherit 则回落全局；否则用源自身设置
export function resolveEffectiveMode(sourceMode: string | null | undefined, globalMode: ProxyMode): ProxyMode {
  const s = String(sourceMode || "inherit").toLowerCase();
  if (s === "direct" || s === "key" || s === "proxy") return s;
  return globalMode; // inherit / 未知 → 全局
}

// ============ SSRF 兜底(与 resolver 同策略) ============
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
function isUnsafeIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) {
    const h = ip.toLowerCase();
    return h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd")
      || h.startsWith("fe80:") || h.startsWith("::ffff:127.") || h.startsWith("::ffff:10.")
      || h.startsWith("::ffff:192.168.") || /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(h);
  }
  return true;
}
export async function assertSafeUrl(u: string): Promise<URL | null> {
  try {
    const x = new URL(u);
    if (x.protocol !== "http:" && x.protocol !== "https:") return null;
    const h = x.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".localhost")) return null;
    if (net.isIP(h)) return isUnsafeIp(h) ? null : x;
    const records = await lookup(h, { all: true, verbatim: true });
    if (!records.length || records.some((r) => isUnsafeIp(r.address))) return null;
    return x;
  } catch {
    return null;
  }
}

// 带 referer 抓取(小体积文本/二进制，如 m3u8 / key)。返回 {buf,contentType}
export async function safeFetch(url: string, referer?: string, timeoutMs = 12000): Promise<{ buf: Buffer; contentType: string }> {
  const safe = await assertSafeUrl(url);
  if (!safe) throw new Error("unsafe url");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "User-Agent": UA };
    if (referer) { headers["Referer"] = referer; headers["Origin"] = new URL(referer).origin; }
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    return { buf: Buffer.from(ab), contentType: res.headers.get("content-type") || "" };
  } finally {
    clearTimeout(t);
  }
}

export async function safeFetchStream(
  url: string,
  referer?: string,
  options: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | null;
  abort: () => void;
  clearTimeout: () => void;
}> {
  const safe = await assertSafeUrl(url);
  if (!safe) throw new Error("unsafe url");
  const ctrl = new AbortController();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 20000);
  const maxBytes = Math.max(0, Number(options.maxBytes) || 0);
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "User-Agent": UA };
    if (referer) { headers["Referer"] = referer; headers["Origin"] = new URL(referer).origin; }
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!res.body) throw new Error("empty response body");
    const contentLength = Number(res.headers.get("content-length") || "");
    const size = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null;
    if (maxBytes && size && size > maxBytes) throw new Error(`body too large: ${size}`);
    return {
      body: res.body,
      contentType: res.headers.get("content-type") || "",
      contentLength: size,
      abort: () => ctrl.abort(),
      clearTimeout: () => clearTimeout(t),
    };
  } catch (e) {
    clearTimeout(t);
    ctrl.abort();
    throw e;
  }
}

// 源站惯用 referer：取 m3u8 origin + "/"
export function refererOf(url: string): string {
  try { return new URL(url).origin + "/"; } catch { return ""; }
}

// ============ m3u8 重写 ============
// mode=key : 只把 #EXT-X-KEY 的 URI 改写到 /api/hls-key(TS 保持源站绝对地址，直连不吃带宽)
// mode=proxy: KEY 与 TS 全部改写到本站接口(TS 走 /api/hls-ts 中转，吃带宽)
// 子 playlist(master)行改写回 /api/hls-mp 以便递归处理
export interface RewriteCtx {
  mode: ProxyMode;
  baseUrl: string; // 当前 m3u8 的绝对地址(用于相对路径解析)
  signKey: (absUrl: string, referer: string) => string;   // → token for /api/hls-key
  signTs: (absUrl: string, referer: string) => string;    // → token for /api/hls-ts
  signMp: (absUrl: string, referer: string) => string;    // → token for /api/hls-mp(子playlist)
}

function absOf(line: string, baseUrl: string): string {
  try { return new URL(line, baseUrl).toString(); } catch { return line; }
}

export function rewriteM3u8(text: string, ctx: RewriteCtx): string {
  const ref = refererOf(ctx.baseUrl);
  const out: string[] = [];
  for (let raw of text.split(/\r?\n/)) {
    const line = raw;
    const trimmed = line.trim();
    if (!trimmed) { out.push(line); continue; }

    // KEY 行：#EXT-X-KEY:...,URI="xxx",...
    if (trimmed.startsWith("#EXT-X-KEY")) {
      out.push(line.replace(/URI="([^"]+)"/i, (_m, uri) => {
        const abs = absOf(uri, ctx.baseUrl);
        const tok = ctx.signKey(abs, ref);
        return `URI="/api/hls-key?t=${encodeURIComponent(tok)}"`;
      }));
      continue;
    }

    // 其它注释/标签原样保留
    if (trimmed.startsWith("#")) { out.push(line); continue; }

    // 非注释行 = URI(子playlist 或 TS 分片)
    const abs = absOf(trimmed, ctx.baseUrl);
    if (/\.m3u8(\?|$)/i.test(abs)) {
      // 子 playlist → 递归走 /api/hls-mp
      const tok = ctx.signMp(abs, ref);
      out.push(`/api/hls-mp?t=${encodeURIComponent(tok)}`);
    } else if (ctx.mode === "proxy") {
      // proxy 模式：TS 走本站中转
      const tok = ctx.signTs(abs, ref);
      out.push(`/api/hls-ts?t=${encodeURIComponent(tok)}`);
    } else {
      // key/direct 模式：TS 保持源站绝对地址(直连，不吃带宽)
      out.push(abs);
    }
  }
  return out.join("\n");
}
