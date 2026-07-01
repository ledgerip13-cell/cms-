// 苹果CMS provide/vod 标准采集适配器
// 兼容 JSON 与 XML(RSS) 两种响应；detail 无播放地址时回退 videolist
import { XMLParser } from "fast-xml-parser";

export interface RawVod {
  vod_id: number | string;
  vod_name: string;
  type_id?: number | string;
  type_name?: string;
  vod_year?: string;
  vod_pic?: string;
  vod_actor?: string;
  vod_director?: string;
  vod_area?: string;
  vod_lang?: string;
  vod_remarks?: string;
  vod_content?: string;
  vod_play_from?: string; // "rym3u8$$$wjm3u8"
  vod_play_url?: string;  // "第1集$url#第2集$url$$$第1集$url2"
  vod_time?: string;
}

export interface ListResult {
  page: number;
  pagecount: number;
  total: number;
  list: RawVod[];
  format: "json" | "xml";
}

export interface ParsedLine {
  flag: string;
  episodes: { name: string; url: string }[];
}

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "__cdata",
  parseTagValue: true,
  trimValues: true,
});

function textOf(v: any): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object") {
    if ("__cdata" in v) return String(v.__cdata ?? "");
    if ("#text" in v) return String(v["#text"] ?? "");
  }
  return "";
}

function buildUrl(base: string, params: Record<string, string | number>) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

// 将 XML(RSS) 的一个 <video> 节点映射为 RawVod
function xmlVideoToRaw(v: any): RawVod {
  // 播放线路：<dl><dd flag="x">内容</dd>...</dl>
  let dds: any[] = [];
  if (v.dl && v.dl.dd) dds = Array.isArray(v.dl.dd) ? v.dl.dd : [v.dl.dd];
  const froms: string[] = [];
  const urls: string[] = [];
  for (const dd of dds) {
    froms.push(String(dd["@_flag"] ?? "").trim());
    urls.push(textOf(dd));
  }
  return {
    vod_id: textOf(v.id),
    vod_name: textOf(v.name),
    type_id: textOf(v.tid),
    type_name: textOf(v.type),
    vod_year: textOf(v.year),
    vod_pic: textOf(v.pic),
    vod_actor: textOf(v.actor),
    vod_director: textOf(v.director),
    vod_area: textOf(v.area),
    vod_lang: textOf(v.lang),
    vod_remarks: textOf(v.note),
    vod_content: textOf(v.des),
    vod_play_from: froms.filter(Boolean).join("$$$"),
    vod_play_url: urls.join("$$$"),
    vod_time: textOf(v.last),
  };
}

// 统一请求：自动识别 JSON / XML
async function getData(url: string, timeoutMs = 15000): Promise<ListResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json,text/xml,*/*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim();
    // JSON 优先
    if (text.startsWith("{") || text.startsWith("[")) {
      const j = JSON.parse(text);
      return {
        page: Number(j.page) || 1,
        pagecount: Number(j.pagecount) || 1,
        total: Number(j.total) || 0,
        list: Array.isArray(j.list) ? j.list : [],
        format: "json",
      };
    }
    // XML(RSS)
    if (text.startsWith("<")) {
      const doc = xmlParser.parse(text);
      const list = doc?.rss?.list ?? doc?.list ?? {};
      let videos = list.video ?? [];
      if (!Array.isArray(videos)) videos = videos ? [videos] : [];
      return {
        page: Number(list["@_page"]) || 1,
        pagecount: Number(list["@_pagecount"]) || 1,
        total: Number(list["@_recordcount"]) || 0,
        list: videos.map(xmlVideoToRaw),
        format: "xml",
      };
    }
    throw new Error("unknown response format: " + text.slice(0, 40));
  } finally {
    clearTimeout(t);
  }
}

export async function fetchList(
  apiUrl: string,
  page = 1,
  hours = 0,
  timeoutMs = 15000,
  typeId?: string | number
): Promise<ListResult> {
  const params: Record<string, string | number> = { ac: "list", pg: page, at: "json" };
  if (hours > 0) params.h = hours;
  if (typeId) params.t = typeId; // 苹果CMS 按分类采集
  return getData(buildUrl(apiUrl, params), timeoutMs);
}

// 拉详情：先 ac=detail，若无任何播放地址则回退 ac=videolist（部分XML源如此）
export async function fetchDetail(
  apiUrl: string,
  ids: (number | string)[],
  timeoutMs = 15000
): Promise<RawVod[]> {
  const idstr = ids.join(",");
  let r = await getData(buildUrl(apiUrl, { ac: "detail", ids: idstr, at: "json" }), timeoutMs);
  const hasPlay = r.list.some((v) => (v.vod_play_url || "").length > 0);
  if (!hasPlay) {
    const r2 = await getData(buildUrl(apiUrl, { ac: "videolist", ids: idstr, at: "json" }), timeoutMs);
    if (r2.list.some((v) => (v.vod_play_url || "").length > 0)) r = r2;
  }
  return r.list;
}

export function parsePlay(raw: RawVod): ParsedLine[] {
  const froms = (raw.vod_play_from || "").split("$$$").filter(Boolean);
  const urls = (raw.vod_play_url || "").split("$$$");
  const lines: ParsedLine[] = [];
  froms.forEach((flag, i) => {
    const block = urls[i] || "";
    const episodes = block
      .split("#")
      .map((seg) => {
        const [name, url] = seg.split("$");
        return { name: (name || "").trim(), url: (url || "").trim() };
      })
      .filter((e) => e.url);
    if (episodes.length) lines.push({ flag: flag.trim(), episodes });
  });
  return lines;
}

// 分类项（含父子关系）
export interface ClassItem {
  typeId: string;
  typePid: string; // "0" 表示顶级父类
  typeName: string;
}

// 拉取源的分类树（class 列表）。JSON 源含 type_pid，XML 源多无 pid（按顶级处理）
export async function fetchClasses(apiUrl: string, timeoutMs = 15000): Promise<ClassItem[]> {
  const url = buildUrl(apiUrl, { ac: "list", pg: 1, at: "json" });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json,text/xml,*/*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      const j = JSON.parse(text);
      const arr = Array.isArray(j.class) ? j.class : [];
      return arr.map((c: any) => ({
        typeId: String(c.type_id ?? ""),
        typePid: String(c.type_pid ?? "0"),
        typeName: String(c.type_name ?? "").trim(),
      })).filter((c: ClassItem) => c.typeId);
    }
    if (text.startsWith("<")) {
      const doc = xmlParser.parse(text);
      const cls = doc?.rss?.class ?? doc?.class ?? {};
      let tys = cls.ty ?? [];
      if (!Array.isArray(tys)) tys = tys ? [tys] : [];
      return tys.map((ty: any) => ({
        typeId: String(ty["@_id"] ?? ""),
        typePid: "0", // XML 无父子信息，全部按顶级
        typeName: textOf(ty),
      })).filter((c: ClassItem) => c.typeId);
    }
    return [];
  } finally {
    clearTimeout(t);
  }
}

// 拉某分类总量（用于前端预估可采）
export async function fetchTypeTotal(apiUrl: string, typeId: string | number, hours = 0, timeoutMs = 12000): Promise<number> {
  const r = await fetchList(apiUrl, 1, hours, timeoutMs, typeId);
  return r.total;
}

export async function ping(apiUrl: string, timeoutMs = 10000) {
  const start = Date.now();
  try {
    const r = await fetchList(apiUrl, 1, 0, timeoutMs);
    return {
      ok: true,
      ms: Date.now() - start,
      total: r.total,
      format: r.format,
      sample: r.list[0]?.vod_name || "",
    };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - start, error: e?.message || String(e) };
  }
}
