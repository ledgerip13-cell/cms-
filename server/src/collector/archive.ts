// 本地转存核心（纯 Node，无 ffmpeg）：把 jinpai 源某集的最高清 HLS 原样镜像到本地硬盘。
//
// 做法：拉 m3u8 → 解析（master 则选最高码率变体）→ 逐个下载 .ts 分片与 AES 密钥 →
//       改写播放列表为本地相对名（seg_00000.ts / key_0.key）→ 写 index.m3u8。
//   不转码、不转 mp4：本站本来就以 HLS 播放，直接镜像即可，省去 ffmpeg 依赖。
//   加密流（#EXT-X-KEY AES-128）也支持：密钥下载到本地，URI 改写为本地路径，前端 hls.js 解密。
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fetchEpisodeUrls, pickBest, archiveEpDir, ARCHIVE_DIR } from "../jinpaiPlay.js";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const REFERER = "https://www.x8kb9k8.com/";
const SEG_CONCURRENCY = 6;

export interface ArchiveEpResult {
  nid: string;
  ok: boolean;
  resolution?: number;
  sizeMb?: number;
  error?: string;
  skipped?: boolean;
}

async function fetchBuf(url: string, timeoutMs = 30000): Promise<Buffer> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Referer: REFERER }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url: string, timeoutMs = 20000): Promise<string> {
  return (await fetchBuf(url, timeoutMs)).toString("utf8");
}

function resolveUrl(base: string, ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  try {
    return new URL(ref, base).href;
  } catch {
    const dir = base.substring(0, base.lastIndexOf("/") + 1);
    return dir + ref;
  }
}

// 是否 master 播放列表（含变体流）
function isMaster(text: string): boolean {
  return /#EXT-X-STREAM-INF/i.test(text);
}

// 从 master 选最高码率变体，返回其绝对 URL
function pickVariant(text: string, baseUrl: string): string | null {
  const lines = text.split(/\r?\n/);
  let bestBw = -1, bestUrl: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/#EXT-X-STREAM-INF:.*BANDWIDTH=(\d+)/i);
    if (m) {
      const bw = Number(m[1]);
      const uri = (lines[i + 1] || "").trim();
      if (uri && !uri.startsWith("#") && bw > bestBw) {
        bestBw = bw;
        bestUrl = resolveUrl(baseUrl, uri);
      }
    }
  }
  return bestUrl;
}

// 并发池下载
async function runPool<T>(items: T[], worker: (item: T, idx: number) => Promise<void>, conc: number) {
  let idx = 0;
  async function next(): Promise<void> {
    const i = idx++;
    if (i >= items.length) return;
    await worker(items[i], i);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(conc, items.length || 1) }, next));
}

/**
 * 转存单集到本地（纯 Node 镜像 HLS）。已存在则跳过（除非 force）。
 */
export async function archiveEpisode(opts: {
  apiUrl: string;
  signKey?: string | null;
  vodId: string | number;
  nid: string | number;
  force?: boolean;
  preferRes?: number; // 清晰度上限(0=最高清)
  clientIp?: string | null; // 签名时伪装客户端 IP(传国内 IP → 拿 blbtgg 阿里云线)
  onLog?: (s: string) => void;
}): Promise<ArchiveEpResult> {
  const vodId = String(opts.vodId);
  const nid = String(opts.nid);
  const dir = archiveEpDir(vodId, nid);
  const indexPath = path.join(dir, "index.m3u8");
  const donePath = path.join(dir, ".done");

  if (!opts.force && fs.existsSync(donePath) && fs.existsSync(indexPath)) {
    return { nid, ok: true, skipped: true };
  }

  // 拿清晰度列表（clientIp 传入则伪装该 IP 签名，影响源站返回的 CDN 线路）
  let list;
  try {
    list = await fetchEpisodeUrls({ apiUrl: opts.apiUrl, signKey: opts.signKey, vodId, nid, clientIp: opts.clientIp, timeoutMs: 15000 });
  } catch (e: any) {
    return { nid, ok: false, error: `签名/取址失败: ${String(e?.message || e).slice(0, 100)}` };
  }
  const best = pickBest(list, opts.preferRes);
  if (!best?.url) return { nid, ok: false, error: "无可下载地址" };

  try {
    // 拉播放列表，master 则下探到媒体列表
    let mediaUrl = best.url;
    let text = await fetchText(mediaUrl);
    if (isMaster(text)) {
      const variant = pickVariant(text, mediaUrl);
      if (!variant) throw new Error("master 无可用变体");
      mediaUrl = variant;
      text = await fetchText(mediaUrl);
    }

    // 临时目录，全部成功再原子改名，避免半成品被播放
    const tmpDir = dir + ".part";
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    await fsp.mkdir(tmpDir, { recursive: true });

    const lines = text.split(/\r?\n/);
    const outLines: string[] = [];
    const segTasks: { url: string; name: string }[] = [];
    const keyTasks: { url: string; name: string }[] = [];
    let segIdx = 0;
    let keyIdx = 0;

    for (const raw of lines) {
      const line = raw;
      const trimmed = line.trim();
      if (!trimmed) {
        outLines.push(line);
        continue;
      }
      // 加密密钥行：改写 URI 为本地
      if (/^#EXT-X-KEY/i.test(trimmed)) {
        const m = trimmed.match(/URI="([^"]+)"/i);
        if (m) {
          const keyUrl = resolveUrl(mediaUrl, m[1]);
          const keyName = `key_${keyIdx++}.key`;
          keyTasks.push({ url: keyUrl, name: keyName });
          outLines.push(trimmed.replace(/URI="[^"]+"/i, `URI="${keyName}"`));
        } else {
          outLines.push(line);
        }
        continue;
      }
      if (trimmed.startsWith("#")) {
        outLines.push(line);
        continue;
      }
      // 分片行
      const segUrl = resolveUrl(mediaUrl, trimmed);
      const segName = `seg_${String(segIdx++).padStart(5, "0")}.ts`;
      segTasks.push({ url: segUrl, name: segName });
      outLines.push(segName);
    }

    if (!segTasks.length) throw new Error("播放列表无分片");

    // 下载密钥（少量，串行）
    let totalBytes = 0;
    for (const k of keyTasks) {
      const buf = await fetchBuf(k.url, 15000);
      await fsp.writeFile(path.join(tmpDir, k.name), buf);
      totalBytes += buf.length;
    }

    // 并发下载分片
    let failed = 0;
    await runPool(
      segTasks,
      async (seg, i) => {
        try {
          const buf = await fetchBuf(seg.url, 40000);
          await fsp.writeFile(path.join(tmpDir, seg.name), buf);
          totalBytes += buf.length;
          if (opts.onLog && i % 20 === 0) opts.onLog(`seg ${i + 1}/${segTasks.length}`);
        } catch (e) {
          failed++;
          throw e;
        }
      },
      SEG_CONCURRENCY
    ).catch((e) => {
      throw new Error(`分片下载失败(${failed}): ${String(e?.message || e).slice(0, 80)}`);
    });

    // 写本地 index.m3u8
    await fsp.writeFile(path.join(tmpDir, "index.m3u8"), outLines.join("\n"));

    // 原子替换
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    await fsp.rename(tmpDir, dir);

    const sizeMb = Math.round(totalBytes / 1024 / 1024);
    await fsp.writeFile(donePath, JSON.stringify({ nid, resolution: best.resolution, sizeMb, segs: segTasks.length, at: new Date().toISOString() }));
    return { nid, ok: true, resolution: best.resolution, sizeMb };
  } catch (e: any) {
    await fsp.rm(dir + ".part", { recursive: true, force: true }).catch(() => {});
    return { nid, ok: false, error: String(e?.message || e).slice(0, 150) };
  }
}

/** 删除某剧的全部本地转存文件 */
export async function removeVodArchive(vodId: string | number, nids: (string | number)[]): Promise<void> {
  for (const nid of nids) {
    try {
      await fsp.rm(archiveEpDir(vodId, nid), { recursive: true, force: true });
    } catch {}
  }
  try {
    const vodDir = path.join(ARCHIVE_DIR, String(vodId));
    const rest = await fsp.readdir(vodDir).catch(() => [] as string[]);
    if (!rest.length) await fsp.rmdir(vodDir).catch(() => {});
  } catch {}
}
