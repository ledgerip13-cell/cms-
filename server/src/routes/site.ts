import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";

async function ensureSite() {
  const s = await prisma.siteConfig.findUnique({ where: { id: 1 } });
  if (!s) {
    return prisma.siteConfig.create({
      data: { id: 1, siteName: "", description: "", footer: "" },
    });
  }
  return s;
}

function normalizeJsonField(value: any) {
  if (typeof value === "string") {
    try {
      JSON.parse(value || "{}");
      return value || "{}";
    } catch {
      return "{}";
    }
  }
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
}

const DEFAULT_SHORTS_CONFIG = {
  enabled: true,
  defaultType: "短剧",
  sortMode: "smart",
  feedLimit: 10,
  guestPreviewEpisodes: 0,
  enableSearch: true,
  showImmersiveButton: true,
  autoPlayNext: true,
};

const DEFAULT_PLAY_CONFIG = {
  hideDuplicateSourceChannels: true,
  proxyMode: "direct", // 全局默认回源模式: direct/key/proxy（源级 inherit 回落此值）
};

function clampInt(value: any, fallback: number, min: number, max: number) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeShortsConfig(value: any) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw || "{}");
    } catch {
      raw = {};
    }
  }
  const sortMode = ["smart", "hot", "recent", "rating"].includes(String(raw?.sortMode || ""))
    ? String(raw.sortMode)
    : DEFAULT_SHORTS_CONFIG.sortMode;
  const rest = { ...(raw || {}) };
  delete rest.enableSwipeGestures;
  return {
    ...DEFAULT_SHORTS_CONFIG,
    ...rest,
    enabled: raw?.enabled !== false,
    defaultType: String(raw?.defaultType || DEFAULT_SHORTS_CONFIG.defaultType).trim().slice(0, 24) || DEFAULT_SHORTS_CONFIG.defaultType,
    sortMode,
    feedLimit: clampInt(raw?.feedLimit, DEFAULT_SHORTS_CONFIG.feedLimit, 4, 20),
    guestPreviewEpisodes: clampInt(raw?.guestPreviewEpisodes, DEFAULT_SHORTS_CONFIG.guestPreviewEpisodes, 0, 20),
    enableSearch: raw?.enableSearch !== false,
    showImmersiveButton: raw?.showImmersiveButton !== false,
    autoPlayNext: raw?.autoPlayNext !== false,
  };
}

export function normalizePlayConfig(value: any) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw || "{}");
    } catch {
      raw = {};
    }
  }
  const proxyMode = ["direct", "key", "proxy"].includes(String(raw?.proxyMode)) ? raw.proxyMode : "direct";
  return {
    ...DEFAULT_PLAY_CONFIG,
    ...(raw || {}),
    hideDuplicateSourceChannels: raw?.hideDuplicateSourceChannels !== false,
    proxyMode,
  };
}

function publicSite(s: Awaited<ReturnType<typeof ensureSite>>, inviteRequired = false) {
  const { registerInviteCode, ...rest } = s;
  return {
    ...rest,
    shortsConfig: normalizeShortsConfig((s as any).shortsConfig),
    playConfig: normalizePlayConfig((s as any).playConfig),
    inviteRequired,
  };
}

export default async function siteRoutes(app: FastifyInstance) {
  // 公开：前端读取站点信息
  app.get("/api/site", async () => {
    const [site, invitePoolCount] = await Promise.all([
      ensureSite(),
      prisma.inviteCode.count({ where: { enabled: true } }),
    ]);
    return publicSite(site, invitePoolCount > 0);
  });

  // 后台读取完整站点信息（邀请码已迁移到邀请码池）
  app.get("/api/admin/site", { preHandler: authGuard }, async () => {
    const [site, invitePoolCount] = await Promise.all([
      ensureSite(),
      prisma.inviteCode.count({ where: { enabled: true } }),
    ]);
    return publicSite(site, invitePoolCount > 0);
  });

  // 后台更新（鉴权）
  app.put("/api/site", { preHandler: authGuard }, async (req) => {
    const b = (req.body as any) || {};
    await ensureSite();
    const updated = await prisma.siteConfig.update({
      where: { id: 1 },
      data: {
        siteName: b.siteName,
        logo: b.logo,
        description: b.description,
        keywords: b.keywords,
        footer: b.footer,
        announcement: b.announcement,
        theme: normalizeJsonField(b.theme),
        shortsConfig: JSON.stringify(normalizeShortsConfig(b.shortsConfig)),
        playConfig: JSON.stringify(normalizePlayConfig(b.playConfig)),
        allowRegister: Boolean(b.allowRegister),
      },
    });
    const invitePoolCount = await prisma.inviteCode.count({ where: { enabled: true } });
    return publicSite(updated, invitePoolCount > 0);
  });
}
