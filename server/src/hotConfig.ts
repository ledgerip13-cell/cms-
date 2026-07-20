import { prisma } from "./db.js";
import { enabledTypeNames, publicPlayableFilter, publicTypeFilter, requestedPublicType, type AccessViewer } from "./publicVod.js";
import { invalidateAggregateCache } from "./aggregateCache.js";

export const HOT_SORT_MODES = ["hot", "rating", "recent", "created", "pinned", "popularity"] as const;
type HotSortMode = (typeof HOT_SORT_MODES)[number];

export interface HotConfigDto {
  id: number;
  typeNames: string[];
  sortMode: HotSortMode;
  timeWindowDays: number;
  minRating: number;
  minRatingCount: number;
  limit: number;
  updatedAt?: Date;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseTypeNames(value: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(value || "[]");
    return Array.isArray(arr) ? [...new Set(arr.map((x) => String(x || "").trim()).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

function normalizeSortMode(value: unknown): HotSortMode {
  const v = String(value || "hot");
  return HOT_SORT_MODES.includes(v as HotSortMode) ? (v as HotSortMode) : "hot";
}

function toDto(row: any): HotConfigDto {
  return {
    id: row.id,
    typeNames: parseTypeNames(row.typeNames),
    sortMode: normalizeSortMode(row.sortMode),
    timeWindowDays: Number(row.timeWindowDays) || 0,
    minRating: Number(row.minRating) || 0,
    minRatingCount: Number(row.minRatingCount) || 0,
    limit: Number(row.limit) || 12,
    updatedAt: row.updatedAt,
  };
}

export async function ensureHotConfig() {
  const row = await prisma.hotConfig.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  invalidateAggregateCache();
  return toDto(row);
}

export async function updateHotConfig(input: any) {
  const publicTypes = await enabledTypeNames();
  const typeNames = Array.isArray(input?.typeNames)
    ? [...new Set(input.typeNames.map((x: any) => String(x || "").trim()).filter((x: string) => publicTypes.includes(x)))]
    : [];
  const row = await prisma.hotConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      typeNames: JSON.stringify(typeNames),
      sortMode: normalizeSortMode(input?.sortMode),
      timeWindowDays: clamp(Number(input?.timeWindowDays) || 0, 0, 3650),
      minRating: clamp(Number(input?.minRating) || 0, 0, 10),
      minRatingCount: clamp(Number(input?.minRatingCount) || 0, 0, 100000000),
      limit: clamp(Number(input?.limit) || 12, 1, 20),
    },
    update: {
      typeNames: JSON.stringify(typeNames),
      sortMode: normalizeSortMode(input?.sortMode),
      timeWindowDays: clamp(Number(input?.timeWindowDays) || 0, 0, 3650),
      minRating: clamp(Number(input?.minRating) || 0, 0, 10),
      minRatingCount: clamp(Number(input?.minRatingCount) || 0, 0, 100000000),
      limit: clamp(Number(input?.limit) || 12, 1, 20),
    },
  });
  return toDto(row);
}

function orderByFor(sortMode: HotSortMode): any[] {
  const ratingDesc = { rating: { sort: "desc", nulls: "last" } };
  if (sortMode === "rating") return [ratingDesc, { heatScore: "desc" }, { updatedAt: "desc" }];
  if (sortMode === "recent") return [{ updatedAt: "desc" }, { heatScore: "desc" }, ratingDesc];
  if (sortMode === "created") return [{ createdAt: "desc" }, { heatScore: "desc" }, ratingDesc];
  if (sortMode === "popularity") return [{ popularity: { sort: "desc", nulls: "last" } }, { heatScore: "desc" }, { ratingCount: "desc" }, ratingDesc, { updatedAt: "desc" }];
  if (sortMode === "pinned") return [{ pinned: "desc" }, { heatScore: "desc" }, ratingDesc, { updatedAt: "desc" }];
  return [{ heatScore: "desc" }, { ratingCount: "desc" }, { popularity: { sort: "desc", nulls: "last" } }, ratingDesc, { updatedAt: "desc" }];
}

export async function hotVodQuery(cat = "hot", limit?: number, viewer: AccessViewer = null) {
  const publicTypes = await enabledTypeNames(viewer);
  if (cat && cat !== "hot") {
    const catWhere: any =
      cat === "guoman" ? { typeName: requestedPublicType(publicTypes, "动漫"), subType: "国产动漫" } :
      cat === "anime" ? { typeName: requestedPublicType(publicTypes, "动漫") } :
      cat === "shortplay" ? { typeName: requestedPublicType(publicTypes, "短剧") } :
      { typeName: publicTypeFilter(publicTypes) };
    return {
      config: null,
      take: clamp(Number(limit) || 10, 1, 20),
      where: { status: "online", ...publicPlayableFilter(), ...catWhere },
      orderBy: orderByFor("hot"),
    };
  }

  const config = await ensureHotConfig();
  const selectedTypes = config.typeNames.filter((type) => publicTypes.includes(type));
  const where: any = {
    status: "online",
    ...publicPlayableFilter(),
    typeName: publicTypeFilter(selectedTypes.length ? selectedTypes : publicTypes),
  };
  if (config.timeWindowDays > 0) where.updatedAt = { gte: new Date(Date.now() - config.timeWindowDays * 24 * 60 * 60 * 1000) };
  if (config.minRating > 0) where.rating = { gte: config.minRating };
  else if (config.sortMode === "hot" || config.sortMode === "rating") where.rating = { not: null };
  if (config.sortMode === "popularity") where.popularity = { not: null };
  if (config.minRatingCount > 0) where.heatScore = { gte: config.minRatingCount };

  return {
    config,
    take: clamp(Number(config.limit || limit) || 12, 1, 20),
    where,
    orderBy: orderByFor(config.sortMode),
  };
}
