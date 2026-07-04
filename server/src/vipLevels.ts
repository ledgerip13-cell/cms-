import { prisma } from "./db.js";

export const DEFAULT_VIP_TAG_COLOR = "#ffc233";

export function normalizeVipCode(value: unknown, fallback = "") {
  const code = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return code || fallback;
}

export function normalizeVipTagColor(value: unknown, fallback = DEFAULT_VIP_TAG_COLOR) {
  const raw = String(value || "").trim();
  const hex = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return fallback;
  if (hex.length === 3) return `#${hex.split("").map((c) => c + c).join("")}`.toLowerCase();
  return `#${hex}`.toLowerCase();
}

export function isVipLevelActive(user: { vipLevel?: any | null; vipExpireAt?: Date | null }) {
  const level = user.vipLevel;
  return Boolean(level?.enabled !== false && level?.isVip && (!user.vipExpireAt || user.vipExpireAt > new Date()));
}

export function publicVipLevel(level: any) {
  if (!level) return null;
  return {
    id: level.id,
    code: level.code,
    name: level.name,
    tagColor: normalizeVipTagColor(level.tagColor),
    isDefault: Boolean(level.isDefault),
    isVip: Boolean(level.isVip),
  };
}

function inferCode(name: string, id: number) {
  if (/黑金/.test(name)) return "black_gold";
  if (/超级|至尊|皇冠/.test(name)) return "super";
  if (/钻石/.test(name)) return "diamond";
  if (/白金|铂金/.test(name)) return "platinum";
  if (/黄金|金牌/.test(name)) return "gold";
  if (/白银|银牌/.test(name)) return "silver";
  if (isNormalName(name)) return "normal";
  if (/VIP/i.test(name)) return "vip";
  return normalizeVipCode(name, `level_${id}`);
}

export function inferVipLevelCode(name: string) {
  return inferCode(name, Date.now());
}

function isNormalName(name: string) {
  return /普通|默认|免费|normal/i.test(name);
}

async function ensureFallbackVipLevel() {
  return prisma.vipLevel.upsert({
    where: { code: "vip" },
    update: { name: "VIP会员", tagColor: DEFAULT_VIP_TAG_COLOR, isVip: true, enabled: true },
    create: { code: "vip", name: "VIP会员", tagColor: DEFAULT_VIP_TAG_COLOR, sort: 50, isVip: true, remark: "旧VIP用户自动迁移等级" },
  });
}

export async function ensureDefaultVipLevel() {
  const byDefault = await prisma.vipLevel.findFirst({ where: { isDefault: true }, orderBy: { sort: "asc" } });
  const row = byDefault || await prisma.vipLevel.findFirst({ where: { OR: [{ code: "normal" }, { name: "普通会员" }] }, orderBy: { sort: "asc" } });
  const level = row
    ? await prisma.vipLevel.update({
        where: { id: row.id },
        data: { code: "normal", name: "普通会员", sort: 0, isDefault: true, isVip: false, enabled: true },
      })
    : await prisma.vipLevel.create({
        data: { code: "normal", name: "普通会员", tagColor: DEFAULT_VIP_TAG_COLOR, sort: 0, isDefault: true, isVip: false, enabled: true, remark: "注册默认等级" },
      });
  await prisma.vipLevel.updateMany({ where: { id: { not: level.id }, isDefault: true }, data: { isDefault: false } });
  return level;
}

async function importLegacyGroupsAsLevels() {
  const groups = await prisma.legacyMemberGroup.findMany({ orderBy: { id: "asc" } }).catch(() => []);
  for (const group of groups) {
    const existing = await prisma.vipLevel.findUnique({ where: { id: group.id } });
    const name = group.name.trim();
    const code = inferCode(name, group.id);
    if (existing) {
      if (existing.code.startsWith("legacy_group_") && existing.code !== code) {
        const conflict = await prisma.vipLevel.findUnique({ where: { code } });
        if (!conflict) await prisma.vipLevel.update({ where: { id: existing.id }, data: { code } });
      }
      continue;
    }
    await prisma.vipLevel.create({
      data: {
        id: group.id,
        code,
        name,
        tagColor: DEFAULT_VIP_TAG_COLOR,
        sort: group.id,
        isDefault: isNormalName(name),
        isVip: !isNormalName(name),
        remark: group.remark,
        enabled: group.enabled,
        createdAt: group.createdAt,
      },
    }).catch(async () => {
      await prisma.vipLevel.create({
        data: {
          code: `legacy_group_${group.id}`,
          name: `${name}-${group.id}`,
          tagColor: DEFAULT_VIP_TAG_COLOR,
          sort: group.id,
          isDefault: false,
          isVip: !isNormalName(name),
          remark: group.remark,
          enabled: group.enabled,
        },
      });
    });
  }
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('"VipLevel"', 'id'),
      GREATEST((SELECT COALESCE(MAX("id"), 1) FROM "VipLevel"), 1),
      (SELECT COUNT(*) > 0 FROM "VipLevel")
    )
  `).catch(() => {});
}

async function assignMissingUserLevels(defaultLevelId: number) {
  const users = await prisma.webUser.findMany({
    where: { vipLevelId: null },
    include: { legacyGroups: { include: { group: true } } },
  });
  if (!users.length) return;
  const levels = await prisma.vipLevel.findMany();
  const byId = new Map(levels.map((level) => [level.id, level]));
  let fallbackVipLevelId: number | null = null;

  for (const user of users) {
    const candidates = user.legacyGroups
      .map((link) => byId.get(link.groupId))
      .filter((level): level is NonNullable<typeof level> => Boolean(level && level.enabled !== false))
      .sort((a, b) => Number(b.isVip) - Number(a.isVip) || b.sort - a.sort || b.id - a.id);
    if (!candidates[0] && user.isVip && !fallbackVipLevelId) {
      fallbackVipLevelId = (await ensureFallbackVipLevel()).id;
    }
    const levelId = candidates[0]?.id || (user.isVip ? fallbackVipLevelId : defaultLevelId) || defaultLevelId;
    await prisma.webUser.update({ where: { id: user.id }, data: { vipLevelId: levelId } });
  }
}

export async function seedVipLevels() {
  await importLegacyGroupsAsLevels();
  const normal = await ensureDefaultVipLevel();
  await assignMissingUserLevels(normal.id);
}
