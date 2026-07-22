import { normalizePlayConfig } from './siteConfig'

const MAX_SKIP_SECONDS = 600
const LOCAL_PREFIX = 'vcms.skip.pref.v1:'

export function clampSkipSeconds(value, fallback = 0) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(MAX_SKIP_SECONDS, n))
}

export function normalizeSkipOverride(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const cleanBool = (v) => {
    if (v === null || v === undefined || v === '') return null
    if (v === true || v === 'true' || v === 1 || v === '1') return true
    if (v === false || v === 'false' || v === 0 || v === '0') return false
    return null
  }
  const cleanSeconds = (v) => {
    if (v === null || v === undefined || v === '') return null
    return clampSkipSeconds(v, null)
  }
  return {
    enabled: cleanBool(raw.enabled ?? raw.skipIntroEnabled),
    introSeconds: cleanSeconds(raw.introSeconds ?? raw.skipIntroSeconds),
    outroSeconds: cleanSeconds(raw.outroSeconds ?? raw.skipOutroSeconds),
  }
}

export function emptySkipOverride(value) {
  const cfg = normalizeSkipOverride(value)
  return cfg.enabled === null && cfg.introSeconds === null && cfg.outroSeconds === null
}

export function mergeSkipConfig(globalPlayConfig, vodConfig, userPreference) {
  const base = normalizePlayConfig(globalPlayConfig)
  const next = { ...base, skipSource: 'global' }
  const apply = (value, source) => {
    const cfg = normalizeSkipOverride(value)
    let changed = false
    if (cfg.enabled !== null) { next.skipIntroEnabled = cfg.enabled; changed = true }
    if (cfg.introSeconds !== null) { next.skipIntroSeconds = cfg.introSeconds; changed = true }
    if (cfg.outroSeconds !== null) { next.skipOutroSeconds = cfg.outroSeconds; changed = true }
    if (changed) next.skipSource = source
  }
  apply(vodConfig, 'vod')
  apply(userPreference, 'user')
  return next
}

export function readLocalSkipPreference(vodId) {
  if (!vodId) return null
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_PREFIX + vodId) || 'null')
    return raw ? normalizeSkipOverride(raw) : null
  } catch {
    return null
  }
}

export function writeLocalSkipPreference(vodId, value) {
  if (!vodId) return null
  const cfg = normalizeSkipOverride(value)
  if (emptySkipOverride(cfg)) {
    localStorage.removeItem(LOCAL_PREFIX + vodId)
    return null
  }
  localStorage.setItem(LOCAL_PREFIX + vodId, JSON.stringify({ ...cfg, updatedAt: Date.now() }))
  return cfg
}
