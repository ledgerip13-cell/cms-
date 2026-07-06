import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const STORAGE_ROOT = process.env.MEDIA_STORAGE_DIR || "/app/storage";
const IMAGE_DIR = path.join(STORAGE_ROOT, "images");
const MAX_IMAGE_BYTES = Number(process.env.LOCAL_IMAGE_MAX_BYTES || 8 * 1024 * 1024);
export const LOCAL_IMAGE_PREFIX = "/api/media/images/";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";

function extFromContentType(contentType: string) {
  const ct = contentType.toLowerCase().split(";")[0].trim();
  if (ct === "image/jpeg" || ct === "image/jpg") return ".jpg";
  if (ct === "image/png") return ".png";
  if (ct === "image/webp") return ".webp";
  if (ct === "image/gif") return ".gif";
  if (ct === "image/avif") return ".avif";
  return "";
}

function extFromUrl(url: URL) {
  const ext = path.extname(url.pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"].includes(ext)
    ? (ext === ".jpeg" ? ".jpg" : ext)
    : "";
}

function contentTypeFromName(name: string) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".avif") return "image/avif";
  return "image/jpeg";
}

function localNameFor(url: string, ext: string) {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 40);
  return `${hash}${ext || ".jpg"}`;
}

export function isLocalImageUrl(url: unknown) {
  return String(url || "").startsWith(LOCAL_IMAGE_PREFIX);
}

export async function downloadImageToLocal(url: string, timeoutMs = 15000) {
  const raw = String(url || "").trim();
  if (!raw || isLocalImageUrl(raw)) return raw;

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return "";
  }
  if (!["http:", "https:"].includes(target.protocol)) return "";

  const earlyExt = extFromUrl(target) || ".jpg";
  const earlyName = localNameFor(raw, earlyExt);
  try {
    await stat(path.join(IMAGE_DIR, earlyName));
    return LOCAL_IMAGE_PREFIX + earlyName;
  } catch {}

  const headers = {
    "User-Agent": UA,
    Referer: target.origin,
    Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
  };
  const res = await fetch(raw, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return "";
  const contentType = res.headers.get("content-type") || "";
  const declaredSize = Number(res.headers.get("content-length") || 0);
  if (declaredSize > MAX_IMAGE_BYTES) return "";
  const looksLikeImage = contentType.toLowerCase().startsWith("image/")
    || contentType.toLowerCase().includes("octet-stream")
    || Boolean(extFromUrl(target));
  if (!looksLikeImage) return "";

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return "";

  const ext = extFromContentType(contentType) || extFromUrl(target) || ".jpg";
  const name = localNameFor(raw, ext);
  await mkdir(IMAGE_DIR, { recursive: true });
  const finalPath = path.join(IMAGE_DIR, name);
  try {
    await stat(finalPath);
    return LOCAL_IMAGE_PREFIX + name;
  } catch {}
  const tmp = path.join(IMAGE_DIR, `${name}.${randomUUID()}.tmp`);
  await writeFile(tmp, buf);
  await rename(tmp, finalPath);
  return LOCAL_IMAGE_PREFIX + name;
}

export async function readLocalImage(name: string) {
  if (!/^[a-f0-9]{40}\.(jpg|png|webp|gif|avif)$/.test(name)) return null;
  const file = path.join(IMAGE_DIR, name);
  try {
    const buf = await readFile(file);
    return { buf, contentType: contentTypeFromName(name) };
  } catch {
    return null;
  }
}
