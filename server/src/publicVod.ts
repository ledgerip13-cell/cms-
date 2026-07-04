import type { FastifyRequest } from "fastify";
import { prisma } from "./db.js";
import { verifyToken } from "./auth.js";

const NO_PUBLIC_TYPE = "__NO_PUBLIC_TYPE__";
const ACCESS_MODES = new Set(["public", "login", "vip", "group", "hidden"]);

export type AccessAction = "display" | "watch";
export type AccessViewer = {
  id: number;
  isVip: boolean;
  groupIds: number[];
} | null;

function parseGroupIds(value: unknown) {
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
  const mode = String(value || "").trim();
  return ACCESS_MODES.has(mode) ? mode : fallback;
}

export function normalizeAccessGroupIds(value: unknown) {
  return parseGroupIds(value).slice(0, 100);
}

function isVipActive(user: { isVip?: boolean; vipExpireAt?: Date | null }) {
  return Boolean(user.isVip && (!user.vipExpireAt || user.vipExpireAt > new Date()));
}

function toViewer(user: any): AccessViewer {
  if (!user || !user.enabled) return null;
  return {
    id: user.id,
    isVip: isVipActive(user),
    groupIds: Array.isArray(user.groups)
      ? user.groups
        .filter((g: any) => g?.group?.enabled !== false)
        .map((g: any) => Number(g.groupId || g.group?.id))
        .filter((n: number) => Number.isInteger(n) && n > 0)
      : [],
  };
}

export async function viewerFromUserId(userId: number): Promise<AccessViewer> {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const user = await prisma.webUser.findUnique({
    where: { id: userId },
    include: { groups: { include: { group: true } } },
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

export function categoryAllowed(category: any, action: AccessAction, viewer: AccessViewer) {
  if (!category?.enabled) return { allowed: false, code: "category_disabled", message: "分类已关闭" };
  const mode = normalizeAccessMode(action === "display" ? category.displayMode : category.watchMode, "public");
  const groupIds = normalizeAccessGroupIds(action === "display" ? category.displayGroupIds : category.watchGroupIds);
  if (mode === "hidden") return { allowed: false, code: "hidden", message: "内容不可见" };
  if (mode === "public") return { allowed: true, code: "ok", message: "" };
  if (mode === "login") {
    return viewer ? { allowed: true, code: "ok", message: "" } : { allowed: false, code: "login_required", message: "请先登录" };
  }
  if (mode === "vip") {
    if (!viewer) return { allowed: false, code: "login_required", message: "请先登录" };
    return viewer.isVip ? { allowed: true, code: "ok", message: "" } : { allowed: false, code: "vip_required", message: "当前分类需要会员权限" };
  }
  if (mode === "group") {
    if (!viewer) return { allowed: false, code: "login_required", message: "请先登录" };
    const groups = new Set(viewer.groupIds);
    return groupIds.some((id) => groups.has(id))
      ? { allowed: true, code: "ok", message: "" }
      : { allowed: false, code: "group_required", message: "当前分类需要指定分组权限" };
  }
  return { allowed: true, code: "ok", message: "" };
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
