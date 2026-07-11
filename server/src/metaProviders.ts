import { cleanText } from "./textClean.js";

export type MetaProviderKey = "douban" | "tmdb";

export type MetaProviderConfig = {
  key: MetaProviderKey;
  name: string;
  enabled: boolean;
  priority: number;
  intervalMs: number;
  batchLimit: number;
  matchConcurrency?: number;
  concurrencyBatchSize?: number;
  autoMatchScore: number;
  pendingMatchScore: number;
  apiKey?: string;
  accessToken?: string;
};

export const META_PROVIDER_DEFS: MetaProviderConfig[] = [
  { key: "douban", name: "豆瓣", enabled: true, priority: 1, intervalMs: 2500, batchLimit: 50, autoMatchScore: 80, pendingMatchScore: 60 },
  { key: "tmdb", name: "TMDB", enabled: false, priority: 2, intervalMs: 1200, batchLimit: 50, matchConcurrency: 3, concurrencyBatchSize: 5, autoMatchScore: 80, pendingMatchScore: 60, apiKey: "", accessToken: "" },
];

function clampScore(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function parseJsonObject(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeMetaProviders(value: unknown) {
  const raw = parseJsonObject(value);
  const rows = Array.isArray(raw.providers) ? raw.providers : [];
  const byKey = new Map(rows.map((row: any) => [String(row?.key || ""), row]));
  const providers = META_PROVIDER_DEFS.map((def) => {
    const row: any = byKey.get(def.key) || {};
    const autoMatchScore = clampScore(row.autoMatchScore, def.autoMatchScore);
    return {
      key: def.key,
      name: def.name,
      enabled: typeof row.enabled === "boolean" ? row.enabled : def.enabled,
      priority: clampInt(row.priority, def.priority, 1, 99),
      intervalMs: clampInt(row.intervalMs, def.intervalMs, 500, 30000),
      batchLimit: clampInt(row.batchLimit, def.batchLimit, 1, 500),
      ...(def.key === "tmdb" ? {
        matchConcurrency: clampInt(row.matchConcurrency, def.matchConcurrency || 3, 1, 10),
        concurrencyBatchSize: clampInt(row.concurrencyBatchSize, def.concurrencyBatchSize || 5, 1, 50),
      } : {}),
      autoMatchScore,
      pendingMatchScore: Math.min(autoMatchScore, clampScore(row.pendingMatchScore, def.pendingMatchScore)),
      ...(def.key === "tmdb" ? {
        apiKey: cleanText(row.apiKey || "", 180),
        accessToken: cleanText(row.accessToken || "", 1200),
      } : {}),
    };
  }).sort((a, b) => a.priority - b.priority);
  return { providers };
}

export function enabledMetaProviders(value: unknown) {
  return normalizeMetaProviders(value).providers.filter((provider) => provider.enabled);
}

export function metaProviderByKey(value: unknown, key: string) {
  return normalizeMetaProviders(value).providers.find((provider) => provider.key === key);
}
