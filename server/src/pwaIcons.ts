import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export type IconVariant = "192" | "512" | "maskable" | "apple";
export type StartupImageSize = { width: number; height: number };

type SourceResult = { buf: Buffer; version: string } | null;

// 简单内存缓存：key = `${version}:${variant}` -> PNG Buffer
const renderCache = new Map<string, Buffer>();
const CACHE_CAP = 32;
const STARTUP_TEXT_VERSION = "text-only-v2";
let startupTextMarkCache: Buffer | null = null;

function hexToRgb(hex: string, fallback = { r: 10, g: 11, b: 15 }) {
  const raw = String(hex || "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }
  return fallback;
}

// 从 pwaConfig.icon / site.logo 拿到原图字节。支持 data URI 与 http(s) URL；拿不到返回 null。
export async function loadIconSource(icon: string, logo: string): Promise<SourceResult> {
  const src = String(icon || "").trim() || String(logo || "").trim();
  if (!src) return null;
  const version = createHash("sha256").update(src).digest("hex").slice(0, 16);

  // data URI
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(src);
  if (m) {
    try {
      const isBase64 = Boolean(m[2]);
      const data = m[3] || "";
      const buf = isBase64
        ? Buffer.from(data, "base64")
        : Buffer.from(decodeURIComponent(data), "utf8");
      if (buf.length) return { buf, version };
    } catch {
      return null;
    }
    return null;
  }

  // http(s) URL：尽力抓取（配置由后台管理员控制，风险可控）
  if (/^https?:\/\//i.test(src)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(src, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      if (buf.length) return { buf, version };
    } catch {
      return null;
    }
  }
  return null;
}

function pruneCache() {
  if (renderCache.size <= CACHE_CAP) return;
  const drop = renderCache.size - CACHE_CAP;
  let i = 0;
  for (const k of renderCache.keys()) {
    renderCache.delete(k);
    if (++i >= drop) break;
  }
}

function getStartupTextMark(): Buffer {
  if (startupTextMarkCache) return startupTextMarkCache;
  const candidates = [
    new URL("./assets/startup-text-mark.png", import.meta.url),
    new URL("../src/assets/startup-text-mark.png", import.meta.url),
  ];
  for (const candidate of candidates) {
    const filePath = fileURLToPath(candidate);
    if (existsSync(filePath)) {
      startupTextMarkCache = readFileSync(filePath);
      return startupTextMarkCache;
    }
  }
  throw new Error("PWA startup text asset missing");
}

// 生成指定规格的 PNG。source 为空时生成纯 backgroundColor 方图，保证始终可安装。
export async function renderIcon(
  variant: IconVariant,
  source: Buffer | null,
  backgroundHex: string,
): Promise<Buffer> {
  const size = variant === "apple" ? 180 : 512; // 192 也用 512 源缩放，质量更好
  const outSize = variant === "192" ? 192 : variant === "apple" ? 180 : 512;
  const bg = hexToRgb(backgroundHex);

  // 无源图：纯色方图兜底
  if (!source) {
    return sharp({
      create: { width: outSize, height: outSize, channels: 4, background: { ...bg, alpha: 1 } },
    })
      .png()
      .toBuffer();
  }

  if (variant === "maskable") {
    // 512 画布 + 中心 ~80% 安全区留白，背景填 backgroundColor
    const inner = 410;
    const fg = await sharp(source)
      .resize(inner, inner, { fit: "cover" })
      .png()
      .toBuffer();
    return sharp({
      create: { width: 512, height: 512, channels: 4, background: { ...bg, alpha: 1 } },
    })
      .composite([{ input: fg, gravity: "centre" }])
      .png()
      .toBuffer();
  }

  if (variant === "apple") {
    // iOS 不支持透明，铺底色
    return sharp(source)
      .resize(180, 180, { fit: "cover" })
      .flatten({ background: bg })
      .png()
      .toBuffer();
  }

  // any: 192 / 512，保留透明，cover 填满
  return sharp(source)
    .resize(outSize, outSize, { fit: "cover" })
    .png()
    .toBuffer();
}

export async function getIconPng(
  variant: IconVariant,
  icon: string,
  logo: string,
  backgroundHex: string,
): Promise<{ buf: Buffer; version: string }> {
  const src = await loadIconSource(icon, logo);
  const version = src?.version || "empty";
  const key = `${version}:${variant}:${backgroundHex}`;
  const cached = renderCache.get(key);
  if (cached) return { buf: cached, version };
  const buf = await renderIcon(variant, src?.buf || null, backgroundHex);
  renderCache.set(key, buf);
  pruneCache();
  return { buf, version };
}

export async function getStartupImagePng(
  size: StartupImageSize,
  icon: string,
  logo: string,
  backgroundHex: string,
): Promise<{ buf: Buffer; version: string }> {
  void icon;
  void logo;
  const width = Math.max(1, Math.min(4096, Math.floor(Number(size.width) || 0)));
  const height = Math.max(1, Math.min(4096, Math.floor(Number(size.height) || 0)));
  const version = STARTUP_TEXT_VERSION;
  const key = `${version}:startup:${width}x${height}:${backgroundHex}`;
  const cached = renderCache.get(key);
  if (cached) return { buf: cached, version };

  const bg = hexToRgb(backgroundHex);
  const canvas = sharp({
    create: { width, height, channels: 4, background: { ...bg, alpha: 1 } },
  });
  const textMarkWidth = Math.max(320, Math.min(760, Math.round(width * 0.58)));
  const textMark = await sharp(getStartupTextMark())
    .resize({ width: textMarkWidth, withoutEnlargement: false })
    .png()
    .toBuffer();
  const buf = await canvas.composite([{ input: textMark, gravity: "centre" }]).png().toBuffer();
  renderCache.set(key, buf);
  pruneCache();
  return { buf, version };
}

// 供 manifest 计算 ?v= 用的稳定版本号
export function iconVersionOf(icon: string, logo: string): string {
  const src = String(icon || "").trim() || String(logo || "").trim();
  if (!src) return "empty";
  return createHash("sha256").update(src).digest("hex").slice(0, 16);
}
