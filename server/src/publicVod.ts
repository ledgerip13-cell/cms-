import type { FastifyRequest } from "fastify";
import { prisma } from "./db.js";
import { verifyToken } from "./auth.js";
import { isVipLevelActive } from "./vipLevels.js";

const NO_PUBLIC_TYPE = "__NO_PUBLIC_TYPE__";
const DISPLAY_ACCESS_MODES = new Set(["public", "login", "vip", "level", "vip_or_level", "hidden"]);
const WATCH_ACCESS_MODES = new Set(["inherit", "public", "login", "vip", "level", "vip_or_level"]);
const LEGACY_ACCESS_MODE_MAP: Record<string, string> = {
  group: "level",
  vip_or_group: "vip_or_level",
};

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

function toViewer(user: any): AccessViewer {
  if (!user || !user.enabled) return null;
  return {
    id: user.id,
    isVip: isVipLevelActive(user),
    levelId: user.vipLevel?.enabled !== false && Number.isInteger(Number(user.vipLevelId)) ? Number(user.vipLevelId) : null,
  };
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
    return viewer ? { allowed: true, code: "ok", message: "" } : { allowed: false, code: "login_required", message: "请先登录" };
  }
  if (mode === "vip") {
    if (!viewer) return { allowed: false, code: "login_required", message: "请先登录" };
    return viewer.isVip ? { allowed: true, code: "ok", message: "" } : { allowed: false, code: "vip_required", message: "当前分类需要会员权限" };
  }
  if (mode === "level") {
    if (!viewer) return { allowed: false, code: "login_required", message: "请先登录" };
    return viewer.levelId && levelIds.includes(viewer.levelId)
      ? { allowed: true, code: "ok", message: "" }
      : { allowed: false, code: "level_required", message: "当前分类需要指定会员等级权限" };
  }
  if (mode === "vip_or_level") {
    if (!viewer) return { allowed: false, code: "login_required", message: "请先登录" };
    if (viewer.isVip || (viewer.levelId && levelIds.includes(viewer.levelId))) return { allowed: true, code: "ok", message: "" };
    return { allowed: false, code: "vip_or_level_required", message: "当前分类需要指定会员等级权限" };
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
  const cats = await prisma.category.findMany({
    where: { enabled: true },
    orderBy: { sort: "asc" },
  });
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
  const category = await prisma.category.findFirst({ where: { name: typeName } });
  if (!category) return { allowed: false, code: "category_missing", message: "分类不存在或不可用" };
  return categoryAllowed(category, action, viewer);
}

export function publicTypeList(types: string[]) {
  return types.length ? types : [NO_PUBLIC_TYPE];
}

export function publicTypeFilter(types: string[]) {
  return { in: publicTypeList(types) };
}

export function publicPlayableFilter() {
  return { plays: { some: { source: { enabled: true } } } };
}

export function publicPlayCountSelect() {
  return { plays: { where: { source: { enabled: true } } } };
}

export function requestedPublicType(types: string[], type: string) {
  return types.includes(type) ? type : NO_PUBLIC_TYPE;
}

export function isPublicType(types: string[], type: string) {
  return types.includes(type);
}
