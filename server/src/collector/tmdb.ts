import { normalizeName } from "./dedupe.js";
import type { DoubanCandidate, DoubanMatchContext, DoubanMatchResult, DoubanMeta, DoubanPerson, DoubanSuggest } from "./douban.js";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/original";

export type TmdbCredentials = {
  apiKey?: string;
  accessToken?: string;
};

function headers(creds: TmdbCredentials) {
  return {
    Accept: "application/json",
    ...(creds.accessToken ? { Authorization: `Bearer ${creds.accessToken}` } : {}),
  };
}

function withKey(url: string, creds: TmdbCredentials) {
  if (!creds.apiKey || creds.accessToken) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}api_key=${encodeURIComponent(creds.apiKey)}`;
}

async function getJson(url: string, creds: TmdbCredentials) {
  if (!creds.apiKey && !creds.accessToken) throw new Error("TMDB credentials missing");
  const res = await fetch(withKey(url, creds), { headers: headers(creds) });
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
  return res.json();
}

function img(path: string | null | undefined) {
  return path ? `${IMG}${path}` : "";
}

function yearOf(value?: string) {
  return (value || "").match(/\d{4}/)?.[0] || "";
}

function typeOf(mediaType: string) {
  return mediaType === "tv" ? "tv" : "movie";
}

function titleOf(row: any) {
  return String(row?.title || row?.name || row?.original_title || row?.original_name || "").trim();
}

function dateOf(row: any) {
  return String(row?.release_date || row?.first_air_date || "").trim();
}

function unique<T>(rows: T[]) {
  return [...new Set(rows.filter(Boolean))];
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

function titleEntries(values: string[], source: "title" | "alias") {
  return values
    .flatMap((value) => {
      const normalized = normalizeName(value);
      const loose = normalized.replace(/[的之]/g, "");
      return [normalized, loose];
    })
    .filter(Boolean)
    .map((name) => ({ name, source }));
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

function peopleScore(ctx: DoubanMatchContext | undefined, meta: DoubanMeta | null | undefined, reasons: string[]) {
  if (!ctx || !meta) return 0;
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

function people(rows: any[] = []): DoubanPerson[] {
  return rows.map((row) => ({
    name: String(row?.name || "").trim(),
    doubanId: row?.id ? `tmdb:${row.id}` : "",
    avatar: img(row?.profile_path),
    character: String(row?.character || row?.job || "").trim() || undefined,
  })).filter((row) => row.name);
}

function altTitles(d: any, primary: string) {
  const rows = [
    d?.original_title,
    d?.original_name,
    ...(Array.isArray(d?.alternative_titles?.titles) ? d.alternative_titles.titles.map((x: any) => x?.title) : []),
    ...(Array.isArray(d?.alternative_titles?.results) ? d.alternative_titles.results.map((x: any) => x?.title) : []),
  ].map((x) => String(x || "").trim()).filter(Boolean);
  return unique(rows).filter((name) => normalizeName(name) !== normalizeName(primary)).slice(0, 30);
}

export async function tmdbSuggest(keyword: string, creds: TmdbCredentials): Promise<DoubanSuggest[]> {
  const url = `${API}/search/multi?query=${encodeURIComponent(keyword)}&include_adult=false&language=zh-CN&page=1`;
  const d = await getJson(url, creds);
  const rows = Array.isArray(d?.results) ? d.results : [];
  return rows
    .filter((row: any) => row?.media_type === "movie" || row?.media_type === "tv")
    .map((row: any) => ({
      source: "tmdb",
      sourceName: "TMDB",
      id: `${typeOf(row.media_type)}:${row.id}`,
      title: titleOf(row),
      sub_title: row.original_title || row.original_name || "",
      year: yearOf(dateOf(row)),
      type: typeOf(row.media_type),
      img: img(row.poster_path),
    }))
    .filter((row: DoubanSuggest) => row.id && row.title)
    .slice(0, 12);
}

export async function tmdbDetail(id: string, creds: TmdbCredentials): Promise<DoubanMeta | null> {
  const [kind, rawId] = String(id || "").includes(":") ? String(id).split(":") : ["movie", String(id || "")];
  const mediaType = kind === "tv" ? "tv" : "movie";
  if (!rawId) return null;
  const url = `${API}/${mediaType}/${encodeURIComponent(rawId)}?language=zh-CN&append_to_response=credits,images,alternative_titles`;
  const d = await getJson(url, creds);
  const title = titleOf(d);
  if (!title) return null;
  const poster = img(d.poster_path);
  const directorRows = [
    ...(mediaType === "tv" ? (d?.created_by || []) : []),
    ...(d?.credits?.crew || []).filter((x: any) => x?.job === "Director"),
  ];
  const directors = people(directorRows);
  const actors = people((d?.credits?.cast || []).slice(0, 24));
  const backdrops = Array.isArray(d?.images?.backdrops) ? d.images.backdrops : [];
  const posters = Array.isArray(d?.images?.posters) ? d.images.posters : [];
  return {
    source: "tmdb",
    sourceName: "TMDB",
    sourceId: `${mediaType}:${rawId}`,
    doubanId: "",
    title,
    rating: Number(d.vote_average) > 0 ? Number(d.vote_average) : null,
    ratingCount: Number(d.vote_count) || 0,
    pic: poster,
    intro: String(d.overview || ""),
    genres: Array.isArray(d.genres) ? d.genres.map((x: any) => String(x?.name || "")).filter(Boolean) : [],
    year: yearOf(dateOf(d)),
    type: mediaType,
    directors,
    actors,
    aliases: altTitles(d, title),
    images: [
      ...(poster ? [{ url: poster, type: "poster" as const, width: 0, height: 0, score: 80 }] : []),
      ...posters.slice(0, 8).map((x: any) => ({ url: img(x.file_path), type: "poster" as const, width: Number(x.width) || 0, height: Number(x.height) || 0, score: 82 })),
      ...backdrops.slice(0, 12).map((x: any) => ({ url: img(x.file_path), type: "backdrop" as const, width: Number(x.width) || 0, height: Number(x.height) || 0, score: 92 })),
    ].filter((x) => x.url),
  };
}

function scoreCandidate(suggest: DoubanSuggest, name: string, year = "", ctx?: DoubanMatchContext, meta?: DoubanMeta | null) {
  const locals = [
    ...titleEntries([name], "title"),
    ...titleEntries(ctx?.aliases || [], "alias"),
  ];
  const candidates = [
    ...titleEntries([suggest.title, suggest.sub_title || "", meta?.title || ""], "title"),
    ...titleEntries(meta?.aliases || [], "alias"),
  ];
  let bestSim = 0;
  let bestAlias = false;
  let bestStrongContains = false;
  for (const local of locals) {
    for (const candidate of candidates) {
      let strongContains = false;
      const sim = candidate.name === local.name
        ? 1
        : (candidate.name.includes(local.name) || local.name.includes(candidate.name)
          ? (() => {
            const shorter = Math.min(candidate.name.length, local.name.length);
            const longer = Math.max(candidate.name.length, local.name.length);
            strongContains = longer > 0 && shorter / longer >= 0.82;
            return strongContains ? 0.86 : 0.78;
          })()
          : dice(local.name, candidate.name));
      if (sim > bestSim) {
        bestSim = sim;
        bestAlias = local.source === "alias" || candidate.source === "alias";
        bestStrongContains = strongContains;
      }
    }
  }
  let score = 0;
  const reasons: string[] = [];
  if (bestSim >= 1) { score += 55; reasons.push(bestAlias ? "alias_exact" : "title_exact"); }
  else if (bestAlias && bestStrongContains) { score += 45; reasons.push("alias_strong_contains"); }
  else if (bestSim >= 0.78) { score += 38; reasons.push(bestAlias ? "alias_contains" : "title_contains"); }
  else if (bestSim >= 0.58) { score += 26; reasons.push(bestAlias ? "alias_similar" : "title_similar"); }
  else if (bestSim >= 0.38) { score += 12; reasons.push(bestAlias ? "alias_weak" : "title_weak"); }
  const y = yearOf(year);
  const cy = yearOf(meta?.year || suggest.year);
  if (y && cy && y === cy) { score += 22; reasons.push("year_match"); }
  else if (y && cy && Math.abs(Number(y) - Number(cy)) <= 1) { score += 10; reasons.push("year_near"); }
  else if (y && cy) { score -= 12; reasons.push("year_mismatch"); }
  const localSeries = /剧|动漫|综艺|短剧/.test(ctx?.typeName || "");
  const remoteSeries = /tv/.test(meta?.type || suggest.type || "");
  if ((localSeries && remoteSeries) || (!localSeries && !remoteSeries)) { score += 8; reasons.push("type_match"); }
  score += peopleScore(ctx, meta, reasons);
  return { score: Math.max(0, Math.min(100, Math.round(score))), bestSim, reasons };
}

export async function matchTmdb(name: string, year = "", ctx: DoubanMatchContext & { credentials?: TmdbCredentials } = {}): Promise<DoubanMatchResult> {
  const credentials = ctx.credentials || {};
  const suggests = await tmdbSuggest(name, credentials);
  if (!suggests.length) return { ok: false, status: "failed", score: 0, reasons: ["no_suggest"], candidates: [] };
  const candidates: DoubanCandidate[] = [];
  for (const suggest of suggests.slice(0, 8)) {
    const meta = await tmdbDetail(suggest.id, credentials).catch(() => null);
    const scored = scoreCandidate(suggest, name, year, ctx, meta);
    candidates.push({
      source: "tmdb",
      sourceName: "TMDB",
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
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const auto = Number(ctx.autoMatchScore) || 80;
  const pending = Number(ctx.pendingMatchScore) || 60;
  if (best?.meta && best.score >= auto && best.titleSim >= 0.58) {
    return { ok: true, status: "matched", meta: best.meta, suggest: suggests[0], score: best.score, reasons: best.reasons, candidates };
  }
  if (best && best.score >= pending) {
    return { ok: false, status: "pending", meta: best.meta, suggest: suggests[0], score: best.score, reasons: best.reasons, candidates };
  }
  return { ok: false, status: "failed", score: best?.score || 0, reasons: best?.reasons || ["low_score"], candidates };
}
