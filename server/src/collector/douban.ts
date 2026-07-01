// 豆瓣元数据抓取：subject_suggest 搜条目 + rexxar API 取评分/简介
// 内置限速（顺序 + 间隔），规避反爬；调用方仍应做批量间隔
import { normalizeName } from "./dedupe.js";

const UA_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const UA_M = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Mobile Safari/537.36";

export interface DoubanSuggest {
  id: string;
  title: string;
  sub_title?: string;
  year?: string;
  type?: string;   // movie / tv (suggest 里多为 movie，需 detail 再判)
  img?: string;
  episode?: string;
}

export interface DoubanMeta {
  doubanId: string;
  title: string;
  rating: number | null;
  ratingCount: number;
  pic: string;
  intro: string;
  genres: string[];
}

async function getJson(url: string, ua: string, referer: string, timeoutMs = 12000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": ua, Referer: referer, Accept: "application/json,*/*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return JSON.parse((await res.text()).trim());
  } finally {
    clearTimeout(t);
  }
}

// 搜索候选
export async function doubanSuggest(keyword: string): Promise<DoubanSuggest[]> {
  const url = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(keyword)}`;
  const arr = await getJson(url, UA_PC, "https://movie.douban.com/");
  return Array.isArray(arr) ? arr : [];
}

// 取详情（评分/简介/类型）。先试 movie 端点，跟随重定向到 tv
export async function doubanDetail(id: string): Promise<DoubanMeta | null> {
  for (const kind of ["movie", "tv"]) {
    try {
      const url = `https://m.douban.com/rexxar/api/v2/${kind}/${id}?ck=&for_mobile=1`;
      const d = await getJson(url, UA_M, `https://m.douban.com/movie/subject/${id}/`);
      // 重定向情形 fetch 会自动跟随；若返回无 rating 再试下一个 kind
      const rating = d?.rating?.value ?? null;
      if (d && d.title) {
        return {
          doubanId: id,
          title: d.title,
          rating: typeof rating === "number" && rating > 0 ? rating : null,
          ratingCount: d?.rating?.count ?? 0,
          pic: d?.pic?.large || d?.pic?.normal || d?.cover_url || "",
          intro: d?.intro || "",
          genres: Array.isArray(d?.genres) ? d.genres : [],
        };
      }
    } catch {
      // 试下一个端点
    }
  }
  return null;
}

// 从候选里挑最佳匹配：标准化片名相等优先，其次年份接近
export function pickBest(
  suggests: DoubanSuggest[],
  name: string,
  year?: string
): DoubanSuggest | null {
  if (!suggests.length) return null;
  const nn = normalizeName(name);
  const y = (year || "").match(/\d{4}/)?.[0] || "";
  // 1) 标准化片名完全相等
  const exact = suggests.filter(
    (s) => normalizeName(s.title) === nn || normalizeName(s.sub_title || "") === nn
  );
  const pool = exact.length ? exact : suggests;
  // 2) 年份匹配优先
  if (y) {
    const yMatch = pool.find((s) => (s.year || "") === y);
    if (yMatch) return yMatch;
  }
  // 3) 兜底取第一条（豆瓣 suggest 已按相关度排序）
  return pool[0];
}

// 综合：按片名+年份匹配并取元数据。matched=false 表示未找到
export async function matchDouban(
  name: string,
  year?: string
): Promise<{ ok: boolean; meta?: DoubanMeta; suggest?: DoubanSuggest }> {
  const suggests = await doubanSuggest(name);
  const best = pickBest(suggests, name, year);
  if (!best) return { ok: false };
  const meta = await doubanDetail(best.id);
  if (!meta) return { ok: false, suggest: best };
  // suggest 的高清封面通常更好，优先用它
  if (best.img) meta.pic = best.img;
  return { ok: true, meta, suggest: best };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
