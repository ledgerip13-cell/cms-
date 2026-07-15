// 金牌影院(jinpai)播放解析 + 本地转存路径工具
//
// 播放：服务端用「客户端真实 IP」向源站签名换 m3u8。
//   - 客户端国内 → 源站返回 blbtgg 阿里云 auth_key 链（不绑 IP，任意客户端可播）
//   - 客户端境外 → 源站返回 kqgfbs whip=客户端IP 链（绑 IP，客户端自己连 CDN 匹配）
//   两种都由前端直连 CDN，视频流量不过本站。
//
// 转存：archiveStatus=done 时，本地 HLS 存于 ARCHIVE_DIR/{vodId}/{nid}/index.m3u8。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildJinpaiHeaders } from "./collector/jinpaiSign.js";

const API_PREFIX = "/api/mw-movie/anonymous";
const DEVICE_ID = crypto.randomUUID();
export const ARCHIVE_DIR = process.env.ARCHIVE_DIR || "/app/archive";

export interface EpisodeUrlItem {
  resolution: number;
  resolutionName: string;
  url: string;
  needLogin?: boolean;
}

/** 取请求真实客户端 IP：X-Forwarded-For(首跳) > X-Real-IP > socket。 */
export function clientIpOf(req: any): string {
  const xff = req?.headers?.["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  const xr = req?.headers?.["x-real-ip"];
  if (xr) return String(xr).trim();
  return String(req?.ip || "").replace(/^::ffff:/, "");
}

/**
 * 向源站换取某集的清晰度列表（带客户端 IP 签名）。
 * @returns 按分辨率降序的清晰度数组
 */
export async function fetchEpisodeUrls(opts: {
  apiUrl: string;
  signKey?: string | null;
  vodId: string | number;
  nid: string | number;
  clientIp?: string | null;
  timeoutMs?: number;
}): Promise<EpisodeUrlItem[]> {
  const origin = (() => {
    try {
      return new URL(opts.apiUrl).origin;
    } catch {
      return "https://www.x8kb9k8.com";
    }
  })();
  const params = { clientType: "1", id: String(opts.vodId), nid: String(opts.nid) };
  const headers = buildJinpaiHeaders(params, { signKey: opts.signKey, deviceId: DEVICE_ID, clientIp: opts.clientIp });
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || 12000);
  try {
    const res = await fetch(`${origin}${API_PREFIX}/v2/video/episode/url?${qs}`, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j: any = await res.json();
    if (j?.code !== 200 || !Array.isArray(j?.data?.list)) throw new Error(`API code=${j?.code} ${j?.msg || ""}`);
    return (j.data.list as any[])
      .map((x) => ({ resolution: Number(x.resolution) || 0, resolutionName: String(x.resolutionName || ""), url: String(x.url || ""), needLogin: !!x.needLogin }))
      .filter((x) => x.url)
      .sort((a, b) => b.resolution - a.resolution);
  } finally {
    clearTimeout(t);
  }
}

/**
 * 选清晰度。preferRes=0/空 → 最高清；preferRes>0 → 不超过上限的最高一档，若均高于上限则取最低。
 * (needLogin 实测服务端不真拦，一律可用；列表已按分辨率降序)
 */
export function pickBest(list: EpisodeUrlItem[], preferRes?: number): EpisodeUrlItem | null {
  if (!list.length) return null;
  if (!preferRes) return list[0]; // 0/空 = 最高清
  const exact = list.find((x) => x.resolution === preferRes);
  if (exact) return exact;
  const under = list.filter((x) => x.resolution <= preferRes);
  if (under.length) return under[0]; // 已降序 → ≤上限的最高一档
  return list[list.length - 1]; // 均高于上限 → 取最低
}

// ---- 本地转存路径 ----
export function archiveEpDir(vodId: string | number, nid: string | number): string {
  return path.join(ARCHIVE_DIR, String(vodId), String(nid));
}
export function archiveIndexPath(vodId: string | number, nid: string | number): string {
  return path.join(archiveEpDir(vodId, nid), "index.m3u8");
}
export function isEpisodeArchived(vodId: string | number, nid: string | number): boolean {
  try {
    return fs.existsSync(archiveIndexPath(vodId, nid));
  } catch {
    return false;
  }
}
