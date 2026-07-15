// jinpai 驱动 —— 接入「金牌影院」系源站（www.x8kb9k8.com 家族，接口前缀 /api/mw-movie/anonymous）
//
// 方案（类 iCloud）：采集只存 vodId + 每集 nid 占位，不存真实 CDN 直链。
//   播放时由服务端 /api/resolve 用「客户端 IP」向源站签名换取带 whip/auth_key 的 m3u8，前端直连 CDN。
//   → 视频流量不汇聚本站 IP（whip 绑客户端），本站零视频流量。
//
// 关键适配：
//  - 接口需签名：sign = SHA1(MD5(sortedParams&key=<signKey>&t=<ms>))，见 jinpaiSign.ts。
//  - 列表接口 video/list 仅按 type1(顶级分类) 分页，无子类/时间过滤；子类靠每条 vodClass 名。
//  - 详情 video/detail?id= 返回 episodeList:[{nid,name,sort}]，据此拼 maccms 同款 play 串。
//  - flag 固定 "jinpaim3u8"，供 resolve 识别走「客户端IP签名→CDN直连」而非普通解析。
//  - 每集 url 存该集 nid（纯数字，无 $/# 冲突）；vodId 由 Play.sourceVodId 提供。
import type { CollectorDriver } from "./types.js";
import type { RawVod, ListResult, ClassItem } from "../maccms.js";
import { buildJinpaiHeaders } from "../jinpaiSign.js";
import crypto from "node:crypto";

export const JINPAI_FLAG = "jinpaim3u8";
const API_PREFIX = "/api/mw-movie/anonymous";
const MAX_PAGES = 200; // 防跑飞：单次采集单分类最多翻页数（源站 totalCount 常报 10000）
const PAGE_SIZE = 30;
// 进程级稳定 deviceId（源站按 deviceid 做弱风控，固定比每次随机更稳）
const DEVICE_ID = crypto.randomUUID();

// 顶级分类（type1）。子类名从每条 vodClass 派生，仅作 subType 展示。
const TOP_CATEGORIES: { type1: number; name: string }[] = [
  { type1: 1, name: "电影" },
  { type1: 2, name: "电视剧" },
  { type1: 3, name: "综艺" },
  { type1: 4, name: "动漫" },
  { type1: 88, name: "短剧" },
];

function originOf(apiUrl: string): string {
  try {
    return new URL(apiUrl).origin;
  } catch {
    return (apiUrl || "https://www.x8kb9k8.com").replace(/\/+$/, "");
  }
}

// 带签名的 GET；源站偶发 5xx，指数退避重试
async function apiGet(
  apiUrl: string,
  path: string,
  params: Record<string, string | number>,
  timeoutMs: number,
  signKey?: string | null,
  clientIp?: string | null
): Promise<any> {
  const origin = originOf(apiUrl);
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const headers = buildJinpaiHeaders(params, { signKey, deviceId: DEVICE_ID, clientIp });
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${origin}${path}${qs ? "?" + qs : ""}`, { headers, signal: ctrl.signal });
      if (!res.ok) {
        if (res.status >= 500 && attempt < 2) {
          lastErr = new Error(`HTTP ${res.status}`);
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const j: any = await res.json();
      if (j && typeof j === "object" && "code" in j && j.code !== 200) {
        throw new Error(`API code=${j.code} ${j.msg || ""}`);
      }
      return j;
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      if (attempt >= 2 || msg.startsWith("API code=") || msg.includes("Abort")) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr || new Error("apiGet failed");
}

// 源站列表/详情条目 → 本站 RawVod
function toRawVod(item: any, episodes?: { name: string; nid: string }[]): RawVod {
  const year = (() => {
    const d = String(item.vodPubdate || item.vodYear || "");
    const m = d.match(/(\d{4})/);
    return m ? m[1] : "";
  })();
  // type_id 用顶级分类 typeId1（与 fetchClasses 的 ClassItem.typeId 对齐，供 resolveCategory 映射）
  const t1 = String(item.typeId1 ?? "");
  // 大类名取顶级分类名(电影/电视剧/...)，保证分类映射表显示干净大类，而非被子类文本覆盖
  const topName = TOP_CATEGORIES.find((c) => String(c.type1) === t1)?.name || "";
  const raw: RawVod = {
    vod_id: String(item.vodId ?? ""),
    vod_name: String(item.vodName || "").trim(),
    type_id: t1,
    // type_name 用大类名供 SourceTypeMap 映射；vodClass 完整多标签串存 sub_type，
    // 由 upsertVod 拆分入 VodSubType 多标签表(主类型取首个写 Vod.subType)
    type_name: topName,
    sub_type: String(item.vodClass || "").trim(),
    vod_year: year,
    vod_pic: String(item.vodPic || ""),
    vod_actor: String(item.vodActor || ""),
    vod_director: String(item.vodDirector || ""),
    vod_area: String(item.vodArea || ""),
    vod_lang: String(item.vodLang || ""),
    vod_remarks: String(item.vodRemarks || item.vodSerial || ""),
    vod_content: String(item.vodContent || item.vodBlurb || "").replace(/<[^>]+>/g, "").trim(),
    vod_time: String(item.vodPubdate || ""),
  };
  if (episodes && episodes.length) {
    raw.vod_play_from = JINPAI_FLAG;
    // 每集：name$nid（nid 纯数字，无分隔符冲突）
    raw.vod_play_url = episodes.map((e) => `${cleanEpName(e.name, 0)}$${e.nid}`).join("#");
  }
  return raw;
}

function cleanEpName(name: string, idx: number): string {
  const s = String(name || "").replace(/[#$]/g, " ").trim();
  return s || `第${idx + 1}集`;
}

// 分类树：顶级分类固定 5 项（子类走 vodClass 派生，不单列）
async function fetchClasses(_apiUrl: string, _timeoutMs = 15000): Promise<ClassItem[]> {
  return TOP_CATEGORIES.map((c) => ({ typeId: String(c.type1), typePid: "0", typeName: c.name }));
}

// 列表：typeId 传顶级分类(type1)；无 type 时遍历全部顶级分类的当前 page
async function fetchList(
  apiUrl: string,
  page = 1,
  _hours = 0,
  timeoutMs = 15000,
  typeId?: string | number,
  _keyword?: string,
  ctx?: { signKey?: string | null }
): Promise<ListResult> {
  const t1 = String(typeId ?? "").trim();
  const cats = t1 ? [Number(t1)] : TOP_CATEGORIES.map((c) => c.type1);
  const all: RawVod[] = [];
  let maxTotalPage = 1;
  for (const cat of cats) {
    if (!Number.isFinite(cat)) continue;
    try {
      const j = await apiGet(apiUrl, `${API_PREFIX}/video/list`, { type1: cat, pageNum: page, pageSize: PAGE_SIZE }, timeoutMs, ctx?.signKey);
      const list: any[] = Array.isArray(j?.data?.list) ? j.data.list : [];
      const totalPage = Math.min(Number(j?.data?.totalPage || 1), MAX_PAGES);
      if (totalPage > maxTotalPage) maxTotalPage = totalPage;
      for (const it of list) all.push(toRawVod(it));
    } catch {
      /* 单分类失败跳过，不阻断整体 */
    }
  }
  return { page, pagecount: maxTotalPage, total: all.length, list: all, format: "json" };
}

// 详情：逐 id 拉 video/detail，据 episodeList 拼 play 串（礼貌并发 4）
async function fetchDetail(apiUrl: string, ids: (number | string)[], timeoutMs = 15000, ctx?: { signKey?: string | null }): Promise<RawVod[]> {
  const out: RawVod[] = [];
  const queue = [...ids];
  const CONC = 4;
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      if (id == null) return;
      try {
        const j = await apiGet(apiUrl, `${API_PREFIX}/video/detail`, { id }, timeoutMs, ctx?.signKey);
        const d = j?.data;
        if (!d) continue;
        const eps: any[] = Array.isArray(d.episodeList) ? d.episodeList : [];
        const episodes = eps
          .map((e, i) => ({ name: cleanEpName(e.name || `${i + 1}`, i), nid: String(e.nid ?? "").trim() }))
          .filter((e) => e.nid);
        out.push(toRawVod(d, episodes));
      } catch {
        /* 单条失败跳过 */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, ids.length || 1) }, worker));
  return out;
}

async function searchByKeyword(_apiUrl: string, _keyword: string, _timeoutMs = 15000): Promise<RawVod[]> {
  // 源站无公开搜索接口，主采集走分类全量+去重
  return [];
}

export const jinpaiDriver: CollectorDriver = {
  name: "jinpai",
  fetchList,
  fetchDetail,
  fetchClasses,
  searchByKeyword,
};
