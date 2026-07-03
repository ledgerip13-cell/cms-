import { prisma } from "./db.js";

const NO_PUBLIC_TYPE = "__NO_PUBLIC_TYPE__";

export async function enabledTypeNames() {
  const cats = await prisma.category.findMany({
    where: { enabled: true },
    select: { name: true },
  });
  return cats.map((c) => c.name).filter(Boolean);
}

export function publicTypeList(types: string[]) {
  return types.length ? types : [NO_PUBLIC_TYPE];
}

export function publicTypeFilter(types: string[]) {
  return { in: publicTypeList(types) };
}

export function requestedPublicType(types: string[], type: string) {
  return types.includes(type) ? type : NO_PUBLIC_TYPE;
}

export function isPublicType(types: string[], type: string) {
  return types.includes(type);
}
