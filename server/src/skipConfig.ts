const MAX_SKIP_SECONDS = 600;

export type SkipOverride = {
  enabled: boolean | null;
  introSeconds: number | null;
  outroSeconds: number | null;
};

export type EffectiveSkipConfig = {
  skipIntroEnabled: boolean;
  skipIntroSeconds: number;
  skipOutroSeconds: number;
  source: "global" | "vod" | "user";
  vodConfig?: SkipOverride | null;
  userPreference?: SkipOverride | null;
};

export function clampSkipSeconds(value: any, fallback: number | null = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(MAX_SKIP_SECONDS, n));
}

export function normalizeSkipOverride(value: any): SkipOverride {
  const raw = value && typeof value === "object" ? value : {};
  const cleanBool = (v: any) => {
    if (v === null || v === undefined || v === "") return null;
    if (v === true || v === "true" || v === 1 || v === "1") return true;
    if (v === false || v === "false" || v === 0 || v === "0") return false;
    return null;
  };
  return {
    enabled: cleanBool(raw.enabled ?? raw.skipIntroEnabled),
    introSeconds: clampSkipSeconds(raw.introSeconds ?? raw.skipIntroSeconds, null),
    outroSeconds: clampSkipSeconds(raw.outroSeconds ?? raw.skipOutroSeconds, null),
  };
}

export function emptySkipOverride(value: SkipOverride) {
  return value.enabled === null && value.introSeconds === null && value.outroSeconds === null;
}

export function publicSkipOverride(value: any): SkipOverride | null {
  if (!value) return null;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : null,
    introSeconds: clampSkipSeconds(value.introSeconds, null),
    outroSeconds: clampSkipSeconds(value.outroSeconds, null),
  };
}

export function mergeSkipConfig(playConfig: any, vodConfig?: any, userPreference?: any): EffectiveSkipConfig {
  const baseEnabled = playConfig?.skipIntroEnabled === true;
  const baseIntro = clampSkipSeconds(playConfig?.skipIntroSeconds, 0) || 0;
  const baseOutro = clampSkipSeconds(playConfig?.skipOutroSeconds, 0) || 0;
  let enabled = baseEnabled;
  let introSeconds = baseIntro;
  let outroSeconds = baseOutro;
  let source: EffectiveSkipConfig["source"] = "global";
  const apply = (row: any, nextSource: EffectiveSkipConfig["source"]) => {
    const cfg = publicSkipOverride(row);
    if (!cfg) return;
    let changed = false;
    if (cfg.enabled !== null) { enabled = cfg.enabled; changed = true; }
    if (cfg.introSeconds !== null) { introSeconds = cfg.introSeconds; changed = true; }
    if (cfg.outroSeconds !== null) { outroSeconds = cfg.outroSeconds; changed = true; }
    if (changed) source = nextSource;
  };
  apply(vodConfig, "vod");
  apply(userPreference, "user");
  return {
    skipIntroEnabled: enabled,
    skipIntroSeconds: introSeconds,
    skipOutroSeconds: outroSeconds,
    source,
    vodConfig: publicSkipOverride(vodConfig),
    userPreference: publicSkipOverride(userPreference),
  };
}
