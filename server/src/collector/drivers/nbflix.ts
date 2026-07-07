// nbflix 驱动 —— 接入 iCloud 系源站（api.nbflix.com 家族，兼容 apollotec 同款接口）
// 方案A：采集只存 iCloud 原始分享链，播放时由前端/Service Worker 走 CloudKit 客户端解析。
//
// 关键适配：
//  - 把 detailsByNo 的 dramaList 拼成 maccms 同款 play 字符串，复用共享 parsePlay。
//  - iCloud filmUrl 内含 '#'（.../iclouddrive/GUID#文件名.m3u8），与 play 字符串分隔符冲突，
//    故对每集 url 做 encodeURIComponent 编码，前端 icloudm3u8 分流时 decodeURIComponent 还原。
//  - flag 固定 "icloudm3u8"，供前端识别走客户端解析而非服务器 /api/resolve。
import type { CollectorDriver, SubtitleTrack } from "./types.js";
import type { RawVod, ListResult, ClassItem } from "../maccms.js";

const LANG_LABEL: Record<string, string> = { zh: "中文", "zh-cn": "简体", "zh-tw": "繁体", en: "English", ja: "日本語", ko: "한국어" };

export const ICLOUD_FLAG = "icloudm3u8";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function baseOf(apiUrl: string): string {
  // 允许传 "https://api.nbflix.com" 或带 /api 的地址，统一取 origin
  try {
    return new URL(apiUrl).origin;
  } catch {
    return (apiUrl || "").replace(/\/+$/, "");
  }
}

function siteOrigin(apiOrigin: string): string {
  // api.nbflix.com -> https://www.nbflix.com（用于 Origin/Referer 头）
  try {
    const u = new URL(apiOrigin);
    const host = u.host.replace(/^api\./, "www.");
    return `${u.protocol}//${host}`;
  } catch {
    return apiOrigin;
  }
}

async function req(apiOrigin: string, path: string, init: RequestInit, timeoutMs: number): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const site = siteOrigin(apiOrigin);
  try {
    const res = await fetch(apiOrigin + path, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json,*/*",
        Origin: site,
        Referer: site + "/",
        ...(init.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (j && typeof j === "object" && "code" in j && j.code !== 0) {
      throw new Error(`API code=${j.code} ${j.message || ""}`);
    }
    return j;
  } finally {
    clearTimeout(t);
  }
}

// 单条源站记录 -> 本站 RawVod（列表项无 dramaList，详情项才拼播放地址）
function toRawVod(item: any, episodes?: { name: string; url: string }[]): RawVod {
  const year = (() => {
    const d = String(item.videoDate || "");
    const m = d.match(/(\d{4})/);
    return m ? m[1] : "";
  })();
  const raw: RawVod = {
    vod_id: String(item.headNo ?? item.id ?? ""),
    vod_name: String(item.videoName || item.title || "").trim(),
    type_name: String(item.videoClass || item.videoType || "").trim(),
    vod_year: year,
    vod_pic: String(item.posterUrl || ""), // iCloud webp 链，保持原始
    vod_actor: Array.isArray(item.cast) ? item.cast.join(",") : String(item.cast || ""),
    vod_director: String(item.director || ""),
    vod_area: String(item.alpha2Code || ""),
    vod_remarks: String(item.clarity || (item.setsNumber ? `全${item.setsNumber}集` : "")),
    vod_content: String(item.intro || ""),
    vod_time: String(item.updateDate || item.videoDate || ""),
  };
  if (episodes && episodes.length) {
    raw.vod_play_from = ICLOUD_FLAG;
    raw.vod_play_url = episodes
      .map((e) => `${e.name}$${encodeURIComponent(e.url)}`)
      .join("#");
  }
  return raw;
}

// 清洗集名，去掉分隔符避免污染 play 字符串
function cleanEpName(name: string, idx: number): string {
  const s = String(name || "").replace(/[#$]/g, " ").trim();
  return s || `第${idx + 1}集`;
}

async function fetchClasses(apiUrl: string, timeoutMs = 15000): Promise<ClassItem[]> {
  const origin = baseOf(apiUrl);
  const j = await req(origin, "/api/videoClass/list", { method: "GET" }, timeoutMs);
  const arr = Array.isArray(j?.data) ? j.data : [];
  return arr
    .map((c: any) => ({
      typeId: String(c.id ?? ""),
      typePid: "0", // 源站分类为平铺结构
      typeName: String(c.title || "").trim(),
    }))
    .filter((c: ClassItem) => c.typeId);
}

async function fetchList(
  apiUrl: string,
  page = 1,
  _hours = 0,
  timeoutMs = 15000,
  _typeId?: string | number,
  _keyword?: string
): Promise<ListResult> {
  // 源站 classId 筛选不生效，统一全量采集（sort=1 按更新倒序），靠详情 videoClass 回填分类
  const origin = baseOf(apiUrl);
  const pageSize = 20;
  const j = await req(
    origin,
    `/api/video/listFormMobile?sort=1&page=${page}&pageSize=${pageSize}`,
    { method: "GET" },
    timeoutMs
  );
  const data = j?.data || {};
  const list: any[] = Array.isArray(data.list) ? data.list : [];
  const total = Number(data.count || 0);
  const pagecount = total > 0 ? Math.ceil(total / pageSize) : (list.length ? page + 1 : page);
  return {
    page,
    pagecount,
    total,
    list: list.map((it) => toRawVod(it)),
    format: "json",
  };
}

async function fetchDetail(
  apiUrl: string,
  ids: (number | string)[],
  timeoutMs = 15000
): Promise<RawVod[]> {
  const origin = baseOf(apiUrl);
  // detailsByNo 只支持单 headNo，批量则并发受限拉取（礼貌并发=4，避免打爆源站）
  const out: RawVod[] = [];
  const queue = [...ids];
  const CONC = 4;
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      if (id == null) return;
      try {
        const j = await req(
          origin,
          "/api/video/detailsByNo",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ headNo: String(id) }) },
          timeoutMs
        );
        const d = j?.data;
        if (!d) continue;
        const dramaList: any[] = Array.isArray(d.dramaList) ? d.dramaList : [];
        const episodes = dramaList
          .map((e, i) => ({
            name: cleanEpName(e.dramaTitle || (e.dramaNumber ? `第${e.dramaNumber}集` : ""), i),
            url: String(e.filmUrl || "").trim(),
          }))
          .filter((e) => e.url);
        out.push(toRawVod(d, episodes));
      } catch {
        // 单条失败跳过，不阻断整批
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, ids.length || 1) }, worker));
  return out;
}

async function searchByKeyword(_apiUrl: string, _keyword: string, _timeoutMs = 15000): Promise<RawVod[]> {
  // 源站搜索接口字段未定/需鉴权，主采集链路不依赖搜索，暂返回空（按片名采集走全量+去重）
  return [];
}

// 拉字幕：GET getSubtitleV2?headNo&dramaNumber → [{srclang,kind,src}]；src 为 iCloud .vtt 分享链（交前端 SW 解析）
async function fetchSubtitle(apiUrl: string, headNo: string, dramaNumber: number, timeoutMs = 10000): Promise<SubtitleTrack[]> {
  const origin = baseOf(apiUrl);
  const j = await req(
    origin,
    `/api/sysvideosubtitle/getSubtitleV2?headNo=${encodeURIComponent(headNo)}&dramaNumber=${dramaNumber}`,
    { method: "GET" },
    timeoutMs
  );
  const arr: any[] = Array.isArray(j?.data) ? j.data : [];
  return arr
    .filter((s) => s && s.src)
    .map((s) => {
      const lang = String(s.srclang || "zh").toLowerCase();
      return { lang, label: LANG_LABEL[lang] || lang, url: String(s.src) };
    });
}

export const nbflixDriver: CollectorDriver = {
  name: "nbflix",
  fetchList,
  fetchDetail,
  fetchClasses,
  searchByKeyword,
  fetchSubtitle,
};
