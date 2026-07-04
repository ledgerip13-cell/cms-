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
  year: string;
  type: string;
  directors: DoubanPerson[];
  actors: DoubanPerson[];
  images: DoubanImage[];
}

export interface DoubanPerson {
  name: string;
  doubanId: string;
  avatar: string;
  character?: string;
}

export interface DoubanImage {
  url: string;
  type: "poster" | "backdrop" | "still";
  width: number;
  height: number;
  score: number;
}

export interface DoubanCandidate {
  id: string;
  title: string;
  subTitle: string;
  year: string;
  type: string;
  img: string;
  score: number;
  titleSim: number;
  reasons: string[];
  meta?: DoubanMeta;
}

function idFromValue(value: any) {
  const raw = String(value?.id || value?.douban_id || value?.uri || value?.url || "");
  return raw.match(/(?:celebrity|subject)\/(\d+)/)?.[1] || (/^\d+$/.test(raw) ? raw : "");
}

function picFromValue(value: any) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return (
    value?.image?.large?.url ||
    value?.image?.normal?.url ||
    value?.image?.small?.url ||
    value?.large?.url ||
    value?.normal?.url ||
    value?.small?.url ||
    value?.large ||
    value?.normal ||
    value?.small ||
    value?.url ||
    value?.src ||
    value?.img ||
    value?.cover_url ||
    value?.avatar ||
    value?.pic?.large?.url ||
    value?.pic?.normal?.url ||
    value?.pic?.large ||
    value?.pic?.normal ||
    ""
  );
}

function normalizePerson(value: any): DoubanPerson | null {
  if (!value) return null;
  if (typeof value === "string") {
    const name = value.trim();
    return name ? { name, doubanId: "", avatar: "" } : null;
  }
  const name = String(value.name || value.title || value.cn_name || value.original_name || "").trim();
  if (!name) return null;
  return {
    name,
    doubanId: idFromValue(value),
    avatar: picFromValue(value.avatar || value.cover || value.pic || value),
    character: String(value.character || value.role || value.character_name || "").trim() || undefined,
  };
}

function normalizePeople(...values: any[]) {
  const people: DoubanPerson[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const list = Array.isArray(value) ? value : value?.items || value?.list || [];
    for (const item of list) {
      const person = normalizePerson(item);
      if (!person) continue;
      const key = person.doubanId || person.name;
      if (seen.has(key)) continue;
      seen.add(key);
      people.push(person);
    }
  }
  return people;
}

function normalizeImage(value: any, fallbackType: DoubanImage["type"] = "still"): DoubanImage | null {
  const url = picFromValue(value);
  if (!url) return null;
  const rawType = String(value?.type || value?.kind || "").toLowerCase();
  const type: DoubanImage["type"] = /poster|cover|海报/.test(rawType)
    ? "poster"
    : /backdrop|background|横|剧照/.test(rawType)
      ? "backdrop"
      : fallbackType;
  const image = value?.image || {};
  const size = image?.large || image?.normal || image?.small || value?.large || value?.normal || value?.small || {};
  const width = Number(value?.width || value?.w || size?.width || 0) || 0;
  const height = Number(value?.height || value?.h || size?.height || 0) || 0;
  const score = type === "poster" ? 70 : width > height ? 95 : 82;
  return { url, type, width, height, score };
}

function normalizeImages(d: any, poster: string) {
  const out: DoubanImage[] = [];
  const seen = new Set<string>();
  const push = (img: DoubanImage | null) => {
    if (!img || seen.has(img.url)) return;
    seen.add(img.url);
    out.push(img);
  };
  push(poster ? { url: poster, type: "poster", width: 0, height: 0, score: 70 } : null);
  const pools = [
    d?.photos,
    d?.photos?.items,
    d?.photo_album,
    d?.photo_album?.items,
    d?.gallery,
    d?.gallery?.items,
    d?.images,
    d?.images?.items,
    d?.stills,
    d?.stills?.items,
  ];
  for (const pool of pools) {
    const list = Array.isArray(pool) ? pool : [];
    for (const item of list) push(normalizeImage(item));
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 20);
}

export interface DoubanMatchContext {
  typeName?: string;
  actor?: string;
  director?: string;
  autoMatchScore?: number;
  pendingMatchScore?: number;
}

export interface DoubanMatchResult {
  ok: boolean;
  status: "matched" | "pending" | "failed";
  meta?: DoubanMeta;
  suggest?: DoubanSuggest;
  score: number;
  reasons: string[];
  candidates: DoubanCandidate[];
}

export const AUTO_MATCH_SCORE = 80;
export const PENDING_MATCH_SCORE = 60;
const detailCache = new Map<string, Promise<DoubanMeta | null>>();

function matchScore(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
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

async function doubanPhotos(id: string, kind: string): Promise<any[]> {
  try {
    const url = `https://m.douban.com/rexxar/api/v2/${kind}/${id}/photos?type=S&start=0&count=12&ck=&for_mobile=1`;
    const d = await getJson(url, UA_M, `https://m.douban.com/movie/subject/${id}/`);
    return Array.isArray(d?.photos) ? d.photos : [];
  } catch {
    return [];
  }
}

// 搜索候选
export async function doubanSuggest(keyword: string): Promise<DoubanSuggest[]> {
  const out = new Map<string, DoubanSuggest>();
  const add = (s: DoubanSuggest | null) => {
    if (s?.id && !out.has(s.id)) out.set(s.id, s);
  };

  try {
    const url = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(keyword)}`;
    const arr = await getJson(url, UA_PC, "https://movie.douban.com/");
    if (Array.isArray(arr)) for (const item of arr) add(item);
  } catch {
    // subject_suggest 经常空/限流，继续走移动端兜底
  }

  for (const item of await doubanSearch(keyword)) add(item);

  for (const id of await doubanSubjectIds(keyword)) {
    if (out.has(id)) continue;
    const meta = await doubanDetail(id);
    add(meta ? { id, title: meta.title, year: meta.year, type: meta.type, img: meta.pic } : null);
    if (out.size >= 12) break;
  }

  return [...out.values()].slice(0, 12);
}

function searchItemToSuggest(item: any): DoubanSuggest | null {
  const t = item?.target || item;
  const id = String(t?.id || item?.target_id || "").trim();
  const title = String(t?.title || "").trim();
  if (!id || !title) return null;
  const type = String(item?.target_type || t?.type || t?.uri || "").includes("tv") ? "tv" : "movie";
  return {
    id,
    title,
    sub_title: String(t?.card_subtitle || "").trim(),
    year: yearOf(t?.year),
    type,
    img: t?.cover_url || picFromValue(t?.pic || t?.cover),
  };
}

async function doubanSearch(keyword: string): Promise<DoubanSuggest[]> {
  try {
    const url = `https://m.douban.com/rexxar/api/v2/search?q=${encodeURIComponent(keyword)}&type=movie`;
    const d = await getJson(url, UA_M, `https://m.douban.com/search/?query=${encodeURIComponent(keyword)}`);
    const items = d?.subjects?.items;
    if (!Array.isArray(items)) return [];
    return items.map(searchItemToSuggest).filter(Boolean).slice(0, 12) as DoubanSuggest[];
  } catch {
    return [];
  }
}

async function doubanSubjectIds(keyword: string): Promise<string[]> {
  try {
    const url = `https://m.douban.com/rexxar/api/v2/search/subjects?q=${encodeURIComponent(keyword)}`;
    const d = await getJson(url, UA_M, `https://m.douban.com/search/?query=${encodeURIComponent(keyword)}`);
    const movie = (Array.isArray(d?.types) ? d.types : []).find((x: any) => x?.type === "movie");
    const ids = Array.isArray(movie?.uuids) ? movie.uuids : [];
    const parsed: string[] = ids.map((x: any) => String(x).match(/(\d+)$/)?.[1] || "").filter(Boolean);
    return unique(parsed).slice(0, 8);
  } catch {
    return [];
  }
}

// 取详情（评分/简介/类型）。先试 movie 端点，跟随重定向到 tv
export async function doubanDetail(id: string): Promise<DoubanMeta | null> {
  if (!detailCache.has(id)) detailCache.set(id, fetchDoubanDetail(id));
  return detailCache.get(id)!;
}

async function fetchDoubanDetail(id: string): Promise<DoubanMeta | null> {
  for (const kind of ["movie", "tv"]) {
    try {
      const url = `https://m.douban.com/rexxar/api/v2/${kind}/${id}?ck=&for_mobile=1`;
      const d = await getJson(url, UA_M, `https://m.douban.com/movie/subject/${id}/`);
      // 重定向情形 fetch 会自动跟随；若返回无 rating 再试下一个 kind
      const rating = d?.rating?.value ?? null;
      if (d && d.title) {
        const poster = d?.pic?.large || d?.pic?.normal || d?.cover_url || "";
        const photos = await doubanPhotos(id, kind);
        return {
          doubanId: id,
          title: d.title,
          rating: typeof rating === "number" && rating > 0 ? rating : null,
          ratingCount: d?.rating?.count ?? 0,
          pic: poster,
          intro: d?.intro || "",
          genres: Array.isArray(d?.genres) ? d.genres : [],
          year: String(d?.year || d?.pubdate?.[0] || d?.release_date || "").match(/\d{4}/)?.[0] || "",
          type: String(d?.type || kind || ""),
          directors: normalizePeople(d?.directors, d?.director, d?.directors?.items),
          actors: normalizePeople(d?.actors, d?.casts, d?.cast, d?.actors?.items, d?.casts?.items),
          images: normalizeImages({ ...d, photos: [...(Array.isArray(d?.photos) ? d.photos : []), ...photos] }, poster),
        };
      }
    } catch {
      // 试下一个端点
    }
  }
  return null;
}

function yearOf(value?: string) {
  return (value || "").match(/\d{4}/)?.[0] || "";
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list)];
}

function titleBag(name: string) {
  const raw = name || "";
  const normalized = normalizeName(raw);
  const compact = normalizeName(
    raw
      .replace(/[（(【\[].*?[）)】\]]/g, "")
      .replace(/第[一二三四五六七八九十0-9]+季/gi, "")
      .replace(/\b(S\d+|Season\s*\d+)\b/gi, "")
  );
  return unique([normalized, compact].filter(Boolean));
}

function queryBag(name: string) {
  const raw = (name || "").trim();
  const compact = raw
    .replace(/[（(【\[].*?[）)】\]]/g, "")
    .replace(/第[一二三四五六七八九十0-9]+季/gi, "")
    .replace(/\b(S\d+|Season\s*\d+)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return unique([raw, compact].filter(Boolean));
}

function bigrams(value: string) {
  const s = value || "";
  if (s.length <= 1) return s ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

function dice(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aa = bigrams(a);
  const bb = bigrams(b);
  if (!aa.length || !bb.length) return 0;
  const counts = new Map<string, number>();
  for (const x of aa) counts.set(x, (counts.get(x) || 0) + 1);
  let hit = 0;
  for (const x of bb) {
    const n = counts.get(x) || 0;
    if (n > 0) {
      hit++;
      counts.set(x, n - 1);
    }
  }
  return (2 * hit) / (aa.length + bb.length);
}

function seasonMarker(value: string) {
  const s = value || "";
  const m = s.match(/第([一二三四五六七八九十0-9]+)季/i) || s.match(/\bS(?:eason)?\s*(\d+)\b/i);
  return m?.[1] || "";
}

function hasSpecialMarker(value: string) {
  return /剧场版|映画|特别篇|总集篇|OVA|OAD|SP|篇/i.test(value || "");
}

function typeScore(localType: string, candidateType: string, reasons: string[]) {
  if (!localType || !candidateType) return 0;
  const localMovie = /电影/.test(localType);
  const localAnime = /动漫|漫剧/.test(localType);
  const localSeries = /电视剧|短剧|综艺/.test(localType);
  const remoteMovie = /movie|电影/.test(candidateType);
  const remoteSeries = /tv|电视剧|剧集|series/.test(candidateType);
  if (localAnime && (remoteMovie || remoteSeries)) {
    reasons.push("type_match");
    return 5;
  }
  if ((localMovie && remoteMovie) || (localSeries && remoteSeries)) {
    reasons.push("type_match");
    return 8;
  }
  if ((localMovie && remoteSeries) || (localSeries && remoteMovie)) {
    reasons.push("type_mismatch");
    return -12;
  }
  return 0;
}

function parsePeople(value?: string) {
  return unique(
    String(value || "")
      .split(/[，,、/|;；]+/)
      .map((x) => normalizeName(x))
      .filter(Boolean)
  ).slice(0, 12);
}

function personHit(local: string, remote: string) {
  if (!local || !remote) return false;
  return local === remote || local.includes(remote) || remote.includes(local);
}

function peopleScore(ctx: DoubanMatchContext, meta: DoubanMeta | null | undefined, reasons: string[]) {
  if (!meta) return 0;
  let score = 0;
  const localDirectors = parsePeople(ctx.director);
  const remoteDirectors = meta.directors.map((x) => normalizeName(x.name)).filter(Boolean);
  const localActors = parsePeople(ctx.actor);
  const remoteActors = meta.actors.map((x) => normalizeName(x.name)).filter(Boolean);

  if (localDirectors.length && remoteDirectors.length) {
    const matched = localDirectors.filter((l) => remoteDirectors.some((r) => personHit(l, r)));
    if (matched.length) {
      score += 28;
      reasons.push("director_match");
    } else {
      score -= 16;
      reasons.push("director_mismatch");
    }
  }

  if (localActors.length && remoteActors.length) {
    const matched = localActors.filter((l) => remoteActors.some((r) => personHit(l, r)));
    if (matched.length) {
      score += Math.min(18, matched.length * 7);
      reasons.push(matched.length >= 2 ? "actors_match" : "actor_match");
    } else {
      score -= 6;
      reasons.push("actors_mismatch");
    }
  }

  return score;
}

function scoreCandidate(
  suggest: DoubanSuggest,
  name: string,
  year?: string,
  ctx: DoubanMatchContext = {},
  meta?: DoubanMeta | null
) {
  const reasons: string[] = [];
  let score = 0;
  const names = titleBag(name);
  const title = normalizeName(meta?.title || suggest.title);
  const subTitle = normalizeName(suggest.sub_title || "");
  const candidateNames = unique([title, subTitle].filter(Boolean));

  let bestSim = 0;
  for (const n of names) {
    for (const c of candidateNames) {
      if (!n || !c) continue;
      if (n === c) bestSim = Math.max(bestSim, 1);
      else if (n.includes(c) || c.includes(n)) bestSim = Math.max(bestSim, 0.78);
      else bestSim = Math.max(bestSim, dice(n, c));
    }
  }
  if (bestSim >= 1) {
    score += 55;
    reasons.push("title_exact");
  } else if (bestSim >= 0.78) {
    score += 38;
    reasons.push("title_contains");
  } else if (bestSim >= 0.58) {
    score += Math.round(bestSim * 42);
    reasons.push("title_similar");
  } else {
    score += Math.round(bestSim * 18);
    if (bestSim > 0) reasons.push("title_weak");
  }

  const localYear = yearOf(year);
  const remoteYear = yearOf(meta?.year || suggest.year);
  if (localYear && remoteYear) {
    const diff = Math.abs(Number(localYear) - Number(remoteYear));
    if (diff === 0) {
      score += 22;
      reasons.push("year_match");
    } else if (diff === 1) {
      score += 8;
      reasons.push("year_near");
    } else {
      score -= 22;
      reasons.push("year_mismatch");
    }
  }

  const localSeason = seasonMarker(name);
  const remoteSeason = seasonMarker(`${suggest.title} ${suggest.sub_title || ""} ${meta?.title || ""}`);
  if (localSeason && remoteSeason) {
    if (localSeason === remoteSeason) {
      score += 12;
      reasons.push("season_match");
    } else {
      score -= 28;
      reasons.push("season_mismatch");
    }
  }

  const localSpecial = hasSpecialMarker(name);
  const remoteSpecial = hasSpecialMarker(`${suggest.title} ${suggest.sub_title || ""} ${meta?.title || ""}`);
  if (localSpecial && remoteSpecial) {
    score += 10;
    reasons.push("special_match");
  } else if (localSpecial && !remoteSpecial && bestSim < 1) {
    score -= 15;
    reasons.push("special_missing");
  }

  score += typeScore(ctx.typeName || "", meta?.type || suggest.type || "", reasons);
  score += peopleScore(ctx, meta, reasons);
  score = Math.max(0, Math.min(100, score));
  return { score, reasons: unique(reasons), bestSim };
}

function toCandidate(suggest: DoubanSuggest, name: string, year?: string, ctx?: DoubanMatchContext, meta?: DoubanMeta | null): DoubanCandidate {
  const scored = scoreCandidate(suggest, name, year, ctx, meta);
  return {
    id: suggest.id,
    title: suggest.title,
    subTitle: suggest.sub_title || "",
    year: yearOf(meta?.year || suggest.year),
    type: meta?.type || suggest.type || "",
    img: suggest.img || meta?.pic || "",
    score: scored.score,
    titleSim: Number(scored.bestSim.toFixed(3)),
    reasons: scored.reasons,
    ...(meta ? { meta } : {}),
  };
}

function autoEligible(c: DoubanCandidate) {
  const r = new Set(c.reasons);
  if (r.has("season_mismatch") || r.has("director_mismatch")) return false;
  if (c.titleSim < 0.58) return false;
  const titleStrong = r.has("title_exact") || r.has("title_contains") || r.has("title_similar");
  if (r.has("year_mismatch") && !r.has("director_match") && !r.has("actors_match")) return false;
  const secondEvidence =
    r.has("year_match") ||
    r.has("year_near") ||
    r.has("director_match") ||
    r.has("actors_match") ||
    (r.has("type_match") && r.has("special_match"));
  return titleStrong && secondEvidence;
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
  year?: string,
  ctx: DoubanMatchContext = {}
): Promise<DoubanMatchResult> {
  const autoMatchScore = matchScore(ctx.autoMatchScore, AUTO_MATCH_SCORE);
  const pendingMatchScore = Math.min(autoMatchScore, matchScore(ctx.pendingMatchScore, PENDING_MATCH_SCORE));
  const suggestMap = new Map<string, DoubanSuggest>();
  for (const kw of queryBag(name)) {
    for (const s of await doubanSuggest(kw)) suggestMap.set(s.id, s);
  }
  const suggests = [...suggestMap.values()];
  if (!suggests.length) return { ok: false, status: "failed", score: 0, reasons: ["no_suggest"], candidates: [] };
  const preliminary = suggests
    .map((s) => toCandidate(s, name, year, ctx))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const detailed: DoubanCandidate[] = [];
  for (const c of preliminary) {
    const suggest = suggests.find((s) => s.id === c.id)!;
    const meta = await doubanDetail(c.id);
    if (meta && suggest.img) meta.pic = suggest.img; // suggest 的高清封面通常更好，优先用它
    detailed.push(toCandidate(suggest, name, year, ctx, meta));
  }
  const byId = new Map<string, DoubanCandidate>();
  for (const c of [...preliminary, ...detailed]) byId.set(c.id, c);
  const candidates = [...byId.values()].sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const suggest = suggests.find((s) => s.id === best.id);
  if (!best?.meta) {
    return {
      ok: false,
      status: "failed",
      suggest,
      score: best?.score || 0,
      reasons: unique([...(best?.reasons || []), "detail_failed"]),
      candidates,
    };
  }
  if (best.score >= autoMatchScore && autoEligible(best)) {
    return { ok: true, status: "matched", meta: best.meta, suggest, score: best.score, reasons: best.reasons, candidates };
  }
  if (best.score >= pendingMatchScore) {
    return { ok: false, status: "pending", meta: best.meta, suggest, score: best.score, reasons: best.reasons, candidates };
  }
  return { ok: false, status: "failed", meta: best.meta, suggest, score: best.score, reasons: best.reasons, candidates };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
