import { prisma } from "./db.js";

export type Episode = { name?: string; url?: string };
export type PlayDomainStat = { origin: string; host: string; count: number; playCount: number };

export function parseEpisodes(raw: string): Episode[] {
  try {
    const rows = JSON.parse(raw || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function parseHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function normalizeOrigin(raw: string, fallbackProtocol = "https:"): URL | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  return parseHttpUrl(value.includes("://") ? value : `${fallbackProtocol}//${value}`);
}

export function readPlayDomains(raw: string): PlayDomainStat[] {
  try {
    const rows = JSON.parse(raw || "[]");
    if (!Array.isArray(rows)) return [];
    return rows
      .map((d) => ({
        origin: String(d.origin || ""),
        host: String(d.host || ""),
        count: Number(d.count || 0),
        playCount: Number(d.playCount || 0),
      }))
      .filter((d) => d.origin && d.host);
  } catch {
    return [];
  }
}

export async function collectSourcePlayDomains(sourceId: number): Promise<PlayDomainStat[]> {
  const plays = await prisma.play.findMany({
    where: { sourceId },
    select: { id: true, episodes: true },
  });
  const byOrigin = new Map<string, { origin: string; host: string; count: number; playIds: Set<number> }>();
  for (const play of plays) {
    for (const ep of parseEpisodes(play.episodes)) {
      const url = parseHttpUrl(String(ep.url || ""));
      if (!url) continue;
      const cur = byOrigin.get(url.origin) || { origin: url.origin, host: url.host, count: 0, playIds: new Set<number>() };
      cur.count++;
      cur.playIds.add(play.id);
      byOrigin.set(url.origin, cur);
    }
  }
  return [...byOrigin.values()]
    .map((d) => ({ origin: d.origin, host: d.host, count: d.count, playCount: d.playIds.size }))
    .sort((a, b) => b.count - a.count || a.origin.localeCompare(b.origin));
}

export async function refreshSourcePlayDomains(sourceId: number): Promise<PlayDomainStat[]> {
  const domains = await collectSourcePlayDomains(sourceId);
  await prisma.source.update({
    where: { id: sourceId },
    data: { playDomains: JSON.stringify(domains) },
  });
  return domains;
}
