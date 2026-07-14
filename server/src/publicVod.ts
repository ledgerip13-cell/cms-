import type { FastifyRequest } from "fastify";
import { prisma } from "./db.js";
import { verifyToken } from "./auth.js";
import { isVipLevelActive } from "./vipLevels.js";

const NO_PUBLIC_TYPE = "__NO_PUBLIC_TYPE__";
const DISPLAY_ACCESS_MODES = new Set(["public", "login", "vip", "level", "vip_or_level", "hidden"]);
const WATCH_ACCESS_MODES = new Set(["inherit", "public", "login", "vip", "level", "vip_or_level"]);
const STATIC_POLICY_CACHE_TTL_MS = 30_000;
const LEGACY_ACCESS_MODE_MAP: Record<string, string> = {
  group: "level",
  vip_or_group: "vip_or_level",
};
let categoryCache: { ts: number; rows: any[] } | null = null;
let enabledSourceIdCache: { ts: number; ids: number[] } | null = null;

export type AccessAction = "display" | "watch";
export type AccessViewer = {
  id: number;
  isVip: boolean;
  levelId: number | null;
} | null;

function parseLevelIds(value: unknown) {
  try {
    const arr = Array.isArray(value) ? value : JSON.parse(String(value || "[]"));
    return Array.isArray(arr)
      ? [...new Set(arr.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))]
      : [];
  } catch {
    return [];
  }
}

export function normalizeAccessMode(value: unknown, fallback = "public") {
  const raw = String(value || "").trim();
  const mode = LEGACY_ACCESS_MODE_MAP[raw] || raw;
  return DISPLAY_ACCESS_MODES.has(mode) || WATCH_ACCESS_MODES.has(mode) ? mode : fallback;
}

export function normalizeDisplayAccessMode(value: unknown, fallback = "public") {
  const raw = String(value || "").trim();
  const mode = LEGACY_ACCESS_MODE_MAP[raw] || raw;
  return DISPLAY_ACCESS_MODES.has(mode) ? mode : fallback;
}

export function normalizeWatchAccessMode(value: unknown, fallback = "inherit") {
  const raw = String(value || "").trim();
  const mode = LEGACY_ACCESS_MODE_MAP[raw] || raw;
  if (mode === "public") return "inherit";
  return WATCH_ACCESS_MODES.has(mode) ? mode : fallback;
}

export function normalizeAccessLevelIds(value: unknown) {
  return parseLevelIds(value).slice(0, 100);
}

function fresh(ts: number) {
  return Date.now() - ts < STATIC_POLICY_CACHE_TTL_MS;
}

async function cachedCategories() {
  if (categoryCache && fresh(categoryCache.ts)) return categoryCache.rows;
  const rows = await prisma.category.findMany({
    orderBy: { sort: "asc" },
  });
  categoryCache = { ts: Date.now(), rows };
  return rows;
}

export function invalidatePublicVodCaches(scope: "category" | "source" | "all" = "all") {
  if (scope === "category" || scope === "all") categoryCache = null;
  if (scope === "source" || scope === "all") enabledSourceIdCache = null;
}

function toViewer(user: any): AccessViewer {
  if (!user || !user.enabled) return null;
  return {
    id: user.id,
    isVip: isVipLevelActive(user),
    levelId: user.vipLevel?.enabled !== false && Number.isInteger(Number(user.vipLevelId)) ? Number(user.vipLevelId) : null,
  };
}

function accessRequirement(mode: string, levelIds: number[]) {
  if (mode === "login") return { kind: "login", label: "登录" };
  if (mode === "vip") return { kind: "vip", label: "VIP会员" };
  if (mode === "level") return { kind: "level", label: "指定会员等级", levelIds };
  if (mode === "vip_or_level") return { kind: "vip_or_level", label: "VIP会员或指定会员等级", levelIds };
  return null;
}

function deniedAccess(mode: string, levelIds: number[], code: string, message: string) {
  const requirement = accessRequirement(mode, levelIds);
  return requirement
    ? { allowed: false, code, message, requirement }
    : { allowed: false, code, message };
}

export async function viewerFromUserId(userId: number): Promise<AccessViewer> {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const user = await prisma.webUser.findUnique({
    where: { id: userId },
    include: { vipLevel: true },
  });
  return toViewer(user);
}

export async function viewerFromRequest(req: FastifyRequest): Promise<AccessViewer> {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  try {
    const data = verifyToken(token);
    if (data?.kind !== "web" || !data?.mid) return null;
    return viewerFromUserId(Number(data.mid));
  } catch {
    return null;
  }
}

function accessRuleAllowed(mode: string, levelIds: number[], viewer: AccessViewer, hiddenMessage: string) {
  if (mode === "hidden") return { allowed: false, code: "hidden", message: "内容不可见" };
  if (mode === "public") return { allowed: true, code: "ok", message: "" };
  if (mode === "inherit") return { allowed: true, code: "ok", message: "" };
  if (mode === "login") {
    return viewer ? { allowed: true, code: "ok", message: "" } : deniedAccess(mode, levelIds, "login_required", "请先登录");
  }
  if (mode === "vip") {
    if (!viewer) return deniedAccess(mode, levelIds, "login_required", "请先登录");
    return viewer.isVip ? { allowed: true, code: "ok", message: "" } : deniedAccess(mode, levelIds, "vip_required", "当前分类需要会员权限");
  }
  if (mode === "level") {
    if (!viewer) return deniedAccess(mode, levelIds, "login_required", "请先登录");
    return viewer.levelId && levelIds.includes(viewer.levelId)
      ? { allowed: true, code: "ok", message: "" }
      : deniedAccess(mode, levelIds, "level_required", "当前分类需要指定会员等级权限");
  }
  if (mode === "vip_or_level") {
    if (!viewer) return deniedAccess(mode, levelIds, "login_required", "请先登录");
    if (viewer.isVip || (viewer.levelId && levelIds.includes(viewer.levelId))) return { allowed: true, code: "ok", message: "" };
    return deniedAccess(mode, levelIds, "vip_or_level_required", "当前分类需要指定会员等级权限");
  }
  return { allowed: false, code: "hidden", message: hiddenMessage };
}

export function categoryAllowed(category: any, action: AccessAction, viewer: AccessViewer) {
  if (!category?.enabled) return { allowed: false, code: "category_disabled", message: "分类已关闭" };
  const displayMode = normalizeDisplayAccessMode(category.displayMode, "public");
  const displayLevelIds = normalizeAccessLevelIds(category.displayLevelIds ?? category.displayGroupIds);
  const displayAccess = accessRuleAllowed(displayMode, displayLevelIds, viewer, "内容不可见");
  if (action === "display") return displayAccess;
  if (!displayAccess.allowed) return { ...displayAccess, message: displayAccess.message || "内容不可见" };
  const watchMode = normalizeWatchAccessMode(category.watchMode, "inherit");
  const watchLevelIds = normalizeAccessLevelIds(category.watchLevelIds ?? category.watchGroupIds);
  return accessRuleAllowed(watchMode, watchLevelIds, viewer, "无观看权限");
}

async function typeNamesForAction(action: AccessAction, viewer: AccessViewer) {
  const cats = await cachedCategories();
  return cats.filter((c: any) => categoryAllowed(c, action, viewer).allowed).map((c) => c.name).filter(Boolean);
}

export async function visibleTypeNames(viewer: AccessViewer = null) {
  return typeNamesForAction("display", viewer);
}

export async function watchableTypeNames(viewer: AccessViewer = null) {
  return typeNamesForAction("watch", viewer);
}

export async function enabledTypeNames(viewer: AccessViewer = null) {
  return visibleTypeNames(viewer);
}

export async function accessForType(typeName: string, action: AccessAction, viewer: AccessViewer = null) {
  const category = (await cachedCategories()).find((c) => c.name === typeName);
  if (!category) return { allowed: false, code: "category_missing", message: "分类不存在或不可用" };
  const access: any = categoryAllowed(category, action, viewer);
  const levelIds = access.requirement?.levelIds;
  if (!Array.isArray(levelIds) || !levelIds.length) return access;
  const levels = await prisma.vipLevel.findMany({
    where: { id: { in: levelIds }, enabled: true },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  const levelNames = levels.map((level) => level.name).filter(Boolean);
  return {
    ...access,
    requirement: {
      ...access.requirement,
      levelNames,
      label: levelNames.length ? levelNames.join(" / ") : access.requirement.label,
    },
  };
}

export function publicTypeList(types: string[]) {
  return types.length ? types : [NO_PUBLIC_TYPE];
}

export function publicTypeFilter(types: string[]) {
  return { in: publicTypeList(types) };
}

export async function enabledPlayableSourceIds() {
  if (enabledSourceIdCache && fresh(enabledSourceIdCache.ts)) return enabledSourceIdCache.ids;
  const rows = await prisma.source.findMany({
    where: { enabled: true },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  enabledSourceIdCache = { ts: Date.now(), ids };
  return ids;
}

export function publicPlayableFilter(sourceIds?: number[]) {
  return sourceIds
    ? { plays: { some: { sourceId: { in: sourceIds.length ? sourceIds : [-1] } } } }
    : { plays: { some: { source: { enabled: true } } } };
}

export function formatPublicRating(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

export function publicPlayCountSelect(sourceIds?: number[]) {
  return sourceIds
    ? { plays: { where: { sourceId: { in: sourceIds.length ? sourceIds : [-1] } } } }
    : { plays: { where: { source: { enabled: true } } } };
}

export function requestedPublicType(types: string[], type: string) {
  return types.includes(type) ? type : NO_PUBLIC_TYPE;
}

export function isPublicType(types: string[], type: string) {
  return types.includes(type);
}
