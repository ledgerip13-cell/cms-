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
  const site = siteOrigin(apiOrigin);
  const headers = { "User-Agent": UA, Accept: "application/json,*/*", Origin: site, Referer: site + "/", ...(init.headers || {}) };
  // Cloudflare 边缘偶发 5xx（实测过 502），驱动内指数退避重试，让采集/测活不因偷发不可用而失败
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(apiOrigin + path, { ...init, headers, signal: ctrl.signal });
      if (!res.ok) {
        if (res.status >= 500 && res.status < 600 && attempt < 2) {
          lastErr = new Error(`HTTP ${res.status}`);
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1))); // 0.4s / 0.8s
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const j = await res.json();
      if (j && typeof j === "object" && "code" in j && j.code !== 0) {
        throw new Error(`API code=${j.code} ${j.message || ""}`);
      }
      return j;
    } catch (e: any) {
      lastErr = e;
      // 网络层错误（非 HTTP 非超时）也重试
      const msg = String(e?.message || e);
      const shouldRetry = attempt < 2 && !msg.startsWith("API code=") && !msg.includes("AbortError");
      if (!shouldRetry) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr || new Error("req failed");
}

// 单条源站记录 -> 本站 RawVod（列表项无 dramaList，详情项才拼播放地址）
function toRawVod(item: any, episodes?: { name: string; url: string }[]): RawVod {
  const year = (() => {
    const d = String(item.videoDate || "");
    const m = d.match(/(\d{4})/);
    return m ? m[1] : "";
  })();
  const cls = String(item.videoClass || item.videoType || "").trim();
  const raw: RawVod = {
    vod_id: String(item.headNo ?? item.id ?? ""),
    vod_name: String(item.videoName || item.title || "").trim(),
    // 源站不下发数字型 type_id，直接用 videoClass 名字当运 id：
    //   ① resolveCategory 靠 `${sourceId}:${typeId}` 作 cache key，必须非空且量名量姓才能正确分流
    //   ② 伤入库 SourceTypeMap遵命名可读，后台能直接看到 "动漫/犯罪片/.." 并手工映射到大类
    type_id: cls,
    type_name: cls,
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
  // 源站 videoClass/list 接口的 id 与每条影片的 videoClass 名字字段不能直接关联（一个数字、一个名字）；
  // 而数据中实际出现的 videoClass 名称又可能包含接口列表以外的新名（如 "剧情片/爱情片"）。
  // 为保证后台选到的分类名 = 采集能匹配到，改为拉全量列表后按 videoClass 实际出现值去重；
  // typeId=typeName（与 resolveCategory/upsert 链路一致）。
  const origin = baseOf(apiUrl);
  const j = await req(origin, `/api/video/listFormMobile?sort=1&pageNum=1&pageSize=5000`, { method: "GET" }, timeoutMs);
  const list: any[] = Array.isArray(j?.data?.list) ? j.data.list : [];
  const seen = new Set<string>();
  const out: ClassItem[] = [];
  for (const it of list) {
    const nm = String(it.videoClass || it.videoType || "").trim();
    if (nm && !seen.has(nm)) { seen.add(nm); out.push({ typeId: nm, typePid: "0", typeName: nm }); }
  }
  out.sort((a, b) => a.typeName.localeCompare(b.typeName, "zh"));
  return out;
}

async function fetchList(
  apiUrl: string,
  page = 1,
  _hours = 0,
  timeoutMs = 15000,
  typeId?: string | number,
  _keyword?: string
): Promise<ListResult> {
  // 源站 classId 筛选不生效，统一全量采集，靠详情 videoClass 回填分类。
  // ⚠️ 实测（2026-07-07）：分页参数是 pageNum（非 page）；count 是当页条数非总数；
  //    列表按更新时间实时排序，pageNum 分页跨请求会漂移导致漏采（实测 5 页只覆盖 176/195）。
  //    而大 pageSize 单次能稳定拿全量，故一次性全量拉取作单页返回（pagecount=1）。
  const origin = baseOf(apiUrl);
  const PAGE_CAP = 5000;
  const j = await req(
    origin,
    `/api/video/listFormMobile?sort=1&pageNum=1&pageSize=${PAGE_CAP}`,
    { method: "GET" },
    timeoutMs
  );
  let list: any[] = Array.isArray(j?.data?.list) ? j.data.list : [];
  // typeId 客户端过滤（源站 classId 参数不生效，但每条记录有 videoClass 名字，能精确匹配）
  const filterCls = String(typeId || "").trim();
  if (filterCls) list = list.filter((it) => String(it.videoClass || it.videoType || "").trim() === filterCls);
  // 全部已在第1页；runSync 若请求 page>1 返回空使循环安全终止
  const pageItems = page === 1 ? list : [];
  return { page, pagecount: 1, total: list.length, list: pageItems.map((it) => toRawVod(it)), format: "json" };
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
