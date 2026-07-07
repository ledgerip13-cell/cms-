import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { authGuard } from "../auth.js";
import { getIconPng, iconVersionOf, type IconVariant } from "../pwaIcons.js";

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
  preferredTypes: [],
  preferredSubtypes: [],
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

const DEFAULT_PWA_CONFIG = {
  enabled: true,
  name: "",
  shortName: "",
  icon: "",
  themeColor: "#0a0b0f",
  backgroundColor: "#0a0b0f",
  orientation: "portrait",
};

function clampInt(value: any, fallback: number, min: number, max: number) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanStringList(value: any, limit = 40) {
  const rows = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(rows.map((x: any) => String(x || "").trim()).filter(Boolean))]
    .slice(0, limit);
}

function cleanSubtypeRules(value: any, limit = 120) {
  let rows = value;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows || "[]");
    } catch {
      rows = rows.split(",");
    }
  }
  if (!Array.isArray(rows)) rows = [];
  const seen = new Set<string>();
  const out: Array<{ type: string; name: string }> = [];
  for (const row of rows) {
    const raw = typeof row === "string" ? row : "";
    const parts = raw ? raw.split("::") : [];
    const type = String((typeof row === "object" ? row?.type : parts[0]) || "").trim();
    const name = String((typeof row === "object" ? (row?.name || row?.subType || row?.sub) : parts[1]) || "").trim();
    const key = `${type}::${name}`;
    if (!type || !name || seen.has(key)) continue;
    seen.add(key);
    out.push({ type, name });
    if (out.length >= limit) break;
  }
  return out;
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
    preferredTypes: cleanStringList(raw?.preferredTypes),
    preferredSubtypes: cleanSubtypeRules(raw?.preferredSubtypes),
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

export function normalizePwaConfig(value: any) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw || "{}");
    } catch {
      raw = {};
    }
  }
  const color = (next: any, fallback: string) => {
    const rawColor = String(next || "").trim();
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(rawColor) ? rawColor : fallback;
  };
  return {
    ...DEFAULT_PWA_CONFIG,
    ...(raw || {}),
    enabled: raw?.enabled !== false,
    name: String(raw?.name || "").trim().slice(0, 60),
    shortName: String(raw?.shortName || "").trim().slice(0, 24),
    icon: String(raw?.icon || "").trim(),
    themeColor: color(raw?.themeColor, DEFAULT_PWA_CONFIG.themeColor),
    backgroundColor: color(raw?.backgroundColor, DEFAULT_PWA_CONFIG.backgroundColor),
    orientation: "portrait",
  };
}

function publicSite(s: Awaited<ReturnType<typeof ensureSite>>, inviteRequired = false) {
  const { registerInviteCode, ...rest } = s;
  return {
    ...rest,
    shortsConfig: normalizeShortsConfig((s as any).shortsConfig),
    playConfig: normalizePlayConfig((s as any).playConfig),
    pwaConfig: normalizePwaConfig((s as any).pwaConfig),
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
        pwaConfig: JSON.stringify(normalizePwaConfig(b.pwaConfig)),
        allowRegister: Boolean(b.allowRegister),
      },
    });
    const invitePoolCount = await prisma.inviteCode.count({ where: { enabled: true } });
    return publicSite(updated, invitePoolCount > 0);
  });

  app.get("/api/pwa/manifest.webmanifest", async (_req, reply) => {
    const site = await ensureSite();
    const pwa = normalizePwaConfig((site as any).pwaConfig);
    if (!pwa.enabled) return reply.code(404).send({ error: "pwa disabled" });
    const name = pwa.name || site.siteName || "视频CMS";
    const shortName = pwa.shortName || name.slice(0, 12);
    // 图标不再内嵌 base64，改为引用服务端生成的真实多尺寸 PNG；?v= 随源图变化刷新缓存
    const v = iconVersionOf(pwa.icon, site.logo || "");
    reply.header("Content-Type", "application/manifest+json; charset=utf-8");
    reply.header("Cache-Control", "no-cache");
    return {
      id: "/",
      name,
      short_name: shortName,
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: pwa.orientation,
      theme_color: pwa.themeColor,
      background_color: pwa.backgroundColor,
      icons: [
        { src: `/api/pwa/icon-192.png?v=${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `/api/pwa/icon-512.png?v=${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `/api/pwa/icon-maskable.png?v=${v}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
  });

  // 服务端按需生成真实尺寸图标（192/512/maskable/apple-touch）
  const iconRoutes: Array<{ path: string; variant: IconVariant }> = [
    { path: "/api/pwa/icon-192.png", variant: "192" },
    { path: "/api/pwa/icon-512.png", variant: "512" },
    { path: "/api/pwa/icon-maskable.png", variant: "maskable" },
    { path: "/api/pwa/apple-touch-icon.png", variant: "apple" },
  ];
  for (const { path, variant } of iconRoutes) {
    app.get(path, async (req, reply) => {
      const site = await ensureSite();
      const pwa = normalizePwaConfig((site as any).pwaConfig);
      const { buf, version } = await getIconPng(variant, pwa.icon, site.logo || "", pwa.backgroundColor);
      const etag = `"${version}-${variant}"`;
      if ((req.headers["if-none-match"] || "") === etag) {
        return reply.code(304).send();
      }
      reply.header("Content-Type", "image/png");
      reply.header("Cache-Control", "public, max-age=86400");
      reply.header("ETag", etag);
      return reply.send(buf);
    });
  }
}
