// 分享页解析器：把加密/带广告的分享页地址解析成可直链播放的真实 m3u8
// 目前支持：lz(量子)系 share 页（var main 模式），可扩展其它源规则
import { URL } from "node:url";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120";

export interface ResolveResult {
  ok: boolean;
  url?: string;       // 解析出的真实可播地址
  kind?: string;      // m3u8 / mp4
  rule?: string;      // 命中的解析规则
  error?: string;
}

// SSRF 兜底：只允许 http/https，拦截明显的内网地址
function isSafeUrl(u: string): boolean {
  try {
    const x = new URL(u);
    if (x.protocol !== "http:" && x.protocol !== "https:") return false;
    const h = x.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return false;
    if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// 规则1：lz/通用 share 页 —— 内联 `var main = "/path/index.m3u8?sign=..."`，真实地址 = origin + main
function ruleVarMain(html: string, origin: string): string | null {
  const m = html.match(/var\s+main\s*=\s*["']([^"']+)["']/);
  if (!m) return null;
  const main = m[1];
  if (/^https?:\/\//i.test(main)) return main;      // 已是全链
  if (main.startsWith("/")) return origin + main;    // 相对路径拼 origin
  return null;
}

// 规则2：页面内直接出现 m3u8 全链（部分源）
function ruleInlineM3u8(html: string): string | null {
  const m = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
  return m ? m[0] : null;
}

export async function resolveShareUrl(shareUrl: string): Promise<ResolveResult> {
  if (!isSafeUrl(shareUrl)) return { ok: false, error: "非法或不安全的地址" };
  // 已是直链 m3u8，无需解析
  if (/\.m3u8(\?|$)/i.test(shareUrl)) return { ok: true, url: shareUrl, kind: "m3u8", rule: "direct" };

  let html: string;
  try {
    html = await fetchText(shareUrl);
  } catch (e: any) {
    return { ok: false, error: "抓取分享页失败: " + (e?.message || e) };
  }

  const origin = new URL(shareUrl).origin;
  // 依次尝试规则
  const byMain = ruleVarMain(html, origin);
  if (byMain) return { ok: true, url: byMain, kind: byMain.includes(".m3u8") ? "m3u8" : "mp4", rule: "var_main" };

  const byInline = ruleInlineM3u8(html);
  if (byInline) return { ok: true, url: byInline, kind: "m3u8", rule: "inline_m3u8" };

  return { ok: false, error: "未识别的分享页结构，需补充解析规则" };
}
