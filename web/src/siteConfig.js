export const SITE_CACHE_KEY = 'vcms.site'
export const CATEGORY_CACHE_KEY = 'vcms.categories'

export const EMPTY_SITE = {
  siteName: '',
  logo: '',
  description: '',
  keywords: '',
  footer: '',
  announcement: '',
  theme: {},
  homeConfig: {},
  shortsConfig: {},
  playConfig: {},
  pwaConfig: {},
}

export const DEFAULT_THEME = {
  global: {
    bg: '#0a0b0f',
    card: '#14161d',
    border: 'rgba(255,255,255,.06)',
    text: '#eceef3',
    textDim: '#9aa2b1',
    textSub: '#79818f',
    accent: '#e5a00d',
    accentLight: '#f5c842',
    accentSoft: 12,
    rating: '#ffc233',
    ratingText: '#1a1204',
    tag: '#e88db0',
    onBrand: '#ffffff',
    onDark: '#16181d',
    surfaceDim: '#0f111a',
  },
  home: {},
  play: {},
  list: {},
}

export const DEFAULT_SHORTS_CONFIG = {
  enabled: true,
  defaultType: '短剧',
  preferredTypes: [],
  preferredSubtypes: [],
  sortMode: 'smart',
  feedLimit: 10,
  guestPreviewEpisodes: 0,
  enableSearch: true,
  showImmersiveButton: true,
  autoPlayNext: true,
}

export const DEFAULT_PLAY_CONFIG = {
  hideDuplicateSourceChannels: true,
}

export const DEFAULT_HOME_CONFIG = {
  dailyUpdateTypes: [],
}

export const DEFAULT_PWA_CONFIG = {
  enabled: true,
  name: '',
  shortName: '',
  icon: '',
  themeColor: '#0a0b0f',
  backgroundColor: '#0a0b0f',
}

function normalizeTheme(theme) {
  let raw = theme
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '{}') } catch { raw = {} }
  }
  const out = { global: {}, home: {}, play: {}, list: {} }
  for (const scope of Object.keys(out)) {
    const merged = { ...(DEFAULT_THEME[scope] || {}), ...(raw?.[scope] || {}) }
    // 迁移旧字段名 → 新字段名
    if (merged.gold != null && merged.rating == null) merged.rating = merged.gold
    if (merged.accentLt != null && merged.accentLight == null) merged.accentLight = merged.accentLt
    if (merged.accentSoftAlpha != null && merged.accentSoft == null) merged.accentSoft = merged.accentSoftAlpha
    if (merged.muted2 != null && merged.textDim == null) merged.textDim = merged.muted2
    if (merged.muted != null && merged.textSub == null) merged.textSub = merged.muted
    if (merged.badgeScoreText != null && merged.ratingText == null) merged.ratingText = merged.badgeScoreText
    if (merged.rose != null && merged.tag == null) merged.tag = merged.rose
    out[scope] = merged
  }
  return out
}

export function normalizeShortsConfig(config) {
  let raw = config
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '{}') } catch { raw = {} }
  }
  const sortMode = ['smart', 'hot', 'recent', 'rating'].includes(String(raw?.sortMode || '')) ? raw.sortMode : DEFAULT_SHORTS_CONFIG.sortMode
  const clamp = (value, fallback, min, max) => {
    const n = Math.floor(Number(value))
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
  }
  const cleanList = (value, limit = 40) => {
    const rows = Array.isArray(value) ? value : String(value || '').split(',')
    return [...new Set(rows.map(item => String(item || '').trim()).filter(Boolean))].slice(0, limit)
  }
  const cleanSubtypes = (value, limit = 120) => {
    let rows = value
    if (typeof rows === 'string') {
      try { rows = JSON.parse(rows || '[]') } catch { rows = rows.split(',') }
    }
    if (!Array.isArray(rows)) rows = []
    const seen = new Set()
    const out = []
    for (const item of rows) {
      const parts = typeof item === 'string' ? item.split('::') : []
      const type = String((typeof item === 'object' ? item?.type : parts[0]) || '').trim()
      const name = String((typeof item === 'object' ? (item?.name || item?.subType || item?.sub) : parts[1]) || '').trim()
      const key = `${type}::${name}`
      if (!type || !name || seen.has(key)) continue
      seen.add(key)
      out.push({ type, name })
      if (out.length >= limit) break
    }
    return out
  }
  const rest = { ...(raw || {}) }
  delete rest.enableSwipeGestures
  return {
    ...DEFAULT_SHORTS_CONFIG,
    ...rest,
    enabled: raw?.enabled !== false,
    defaultType: String(raw?.defaultType || DEFAULT_SHORTS_CONFIG.defaultType).trim().slice(0, 24) || DEFAULT_SHORTS_CONFIG.defaultType,
    preferredTypes: cleanList(raw?.preferredTypes),
    preferredSubtypes: cleanSubtypes(raw?.preferredSubtypes),
    sortMode,
    feedLimit: clamp(raw?.feedLimit, DEFAULT_SHORTS_CONFIG.feedLimit, 4, 20),
    guestPreviewEpisodes: clamp(raw?.guestPreviewEpisodes, DEFAULT_SHORTS_CONFIG.guestPreviewEpisodes, 0, 20),
    enableSearch: raw?.enableSearch !== false,
    showImmersiveButton: raw?.showImmersiveButton !== false,
    autoPlayNext: raw?.autoPlayNext !== false,
  }
}

export function normalizePlayConfig(config) {
  let raw = config
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '{}') } catch { raw = {} }
  }
  return {
    ...DEFAULT_PLAY_CONFIG,
    ...(raw || {}),
    hideDuplicateSourceChannels: raw?.hideDuplicateSourceChannels !== false,
  }
}

export function normalizeHomeConfig(config) {
  let raw = config
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '{}') } catch { raw = {} }
  }
  const cleanList = (value, limit = 20) => {
    const rows = Array.isArray(value) ? value : String(value || '').split(',')
    return [...new Set(rows.map(item => String(item || '').trim()).filter(Boolean))].slice(0, limit)
  }
  return {
    ...DEFAULT_HOME_CONFIG,
    ...(raw || {}),
    dailyUpdateTypes: cleanList(raw?.dailyUpdateTypes),
  }
}

export function normalizePwaConfig(config) {
  let raw = config
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '{}') } catch { raw = {} }
  }
  const color = (value, fallback) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim()) ? String(value).trim() : fallback
  return {
    ...DEFAULT_PWA_CONFIG,
    ...(raw || {}),
    enabled: raw?.enabled !== false,
    name: String(raw?.name || '').trim().slice(0, 60),
    shortName: String(raw?.shortName || '').trim().slice(0, 24),
    icon: String(raw?.icon || '').trim(),
    themeColor: color(raw?.themeColor, DEFAULT_PWA_CONFIG.themeColor),
    backgroundColor: color(raw?.backgroundColor, DEFAULT_PWA_CONFIG.backgroundColor),
  }
}

export function normalizeSite(site) {
  const next = { ...EMPTY_SITE, ...(site || {}) }
  next.theme = normalizeTheme(next.theme)
  next.homeConfig = normalizeHomeConfig(next.homeConfig)
  next.shortsConfig = normalizeShortsConfig(next.shortsConfig)
  next.playConfig = normalizePlayConfig(next.playConfig)
  next.pwaConfig = normalizePwaConfig(next.pwaConfig)
  return next
}

export function readCachedSite() {
  try {
    return normalizeSite(JSON.parse(localStorage.getItem(SITE_CACHE_KEY) || '{}'))
  } catch {
    return normalizeSite()
  }
}

export function writeCachedSite(site) {
  const next = normalizeSite(site)
  localStorage.setItem(SITE_CACHE_KEY, JSON.stringify(next))
  return next
}

function normalizeCategories(rows) {
  return Array.isArray(rows)
    ? rows
      .map(row => ({
        ...row,
        name: String(row?.name || '').trim(),
        icon: String(row?.icon || '').trim(),
        count: Number.isFinite(Number(row?.count)) ? Number(row.count) : 0,
      }))
      .filter(row => row.name)
    : []
}

export function readCachedCategories() {
  try {
    return normalizeCategories(JSON.parse(localStorage.getItem(CATEGORY_CACHE_KEY) || '[]'))
  } catch {
    return []
  }
}

export function writeCachedCategories(rows) {
  const next = normalizeCategories(rows)
  localStorage.setItem(CATEGORY_CACHE_KEY, JSON.stringify(next))
  return next
}

function upsertMeta(name, content) {
  let tag = document.querySelector(`meta[name="${name}"]`)
  if (!content) {
    tag?.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('meta')
    tag.name = name
    document.head.appendChild(tag)
  }
  tag.content = content
}

export function applySiteHead(site) {
  const s = normalizeSite(site)
  if (s.siteName) document.title = s.siteName
  upsertMeta('description', s.description)
  upsertMeta('keywords', s.keywords)
  const icon = s.pwaConfig?.icon || s.logo
  upsertMeta('theme-color', s.pwaConfig?.themeColor || '#0a0b0f')
  if (icon) {
    let link = document.querySelector("link[rel~='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = icon
    let apple = document.querySelector("link[rel='apple-touch-icon']")
    if (!apple) {
      apple = document.createElement('link')
      apple.rel = 'apple-touch-icon'
      document.head.appendChild(apple)
    }
    apple.href = icon
  }
}

function clampAlpha(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.max(0, Math.min(1, n))
}

function parseCssColor(value) {
  const raw = String(value || '').trim()
  const hex = raw.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i)
  if (hex) {
    const body = hex[1]
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
      a: hex[2] ? parseInt(hex[2], 16) / 255 : 1,
    }
  }
  const rgb = raw.match(/^rgba?\((.+)\)$/i)
  if (rgb) {
    const parts = rgb[1].split(',').map(x => x.trim())
    if (parts.length >= 3) {
      const [r, g, b] = parts.map(Number)
      if ([r, g, b].every(Number.isFinite)) {
        return { r, g, b, a: parts.length >= 4 ? clampAlpha(parts[3]) : 1 }
      }
    }
  }
  return null
}

function hexToRgb(hex) {
  const color = parseCssColor(hex)
  if (!color) return null
  return {
    r: color.r,
    g: color.g,
    b: color.b,
  }
}

function rgba(hex, alpha) {
  const c = hexToRgb(hex)
  return c ? `rgba(${c.r},${c.g},${c.b},${alpha})` : hex
}

function alphaPercent(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, n)) / 100
}

function cssVarName(key) {
  return '--' + key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
}

export function themePageFromRoute(route) {
  if (route?.path?.startsWith('/play/')) return 'play'
  if (route?.path === '/' && (route.query?.type || route.query?.kw)) return 'list'
  return 'home'
}

export function applySiteTheme(site, page = 'home') {
  const theme = normalizeTheme(site?.theme)
  const c = { ...theme.global, ...(theme[page] || {}) }
  const root = document.documentElement
  const s = (k, v) => { if (v != null && v !== '') root.style.setProperty(cssVarName(k), v) }

  // ── 底板 (可直接消费) ──
  s('bg', c.bg)
  s('card', c.card)
  s('line', c.border)
  s('line-hi', rgbaColor(c.border, .16))
  s('text', c.text)
  s('muted', c.textSub)
  s('muted2', c.textDim)

  // ── 品牌 → 展开所有别名 ──
  const acc_soft = rgba(c.accent, alphaPercent(c.accentSoft, .12))
  const acc_grad = `linear-gradient(120deg, ${c.accent}, ${c.accentLight})`
  s('accent', c.accent)
  s('accent-lt', c.accentLight)
  s('accent-soft', acc_soft)
  s('grad', acc_grad)
  // 按钮
  s('btn-primary-bg', c.accent); s('btn-primary-text', c.onBrand)
  s('btn-ghost-bg', rgbaColor('#ffffff', .06)); s('btn-ghost-text', c.text)
  s('btn-hover-border', c.accent); s('btn-hover-text', c.accent)
  // 导航
  s('nav-active-bg', acc_soft); s('nav-active-text', c.accent)
  // 搜索
  s('search-bg', rgbaColor(c.card, .5))
  s('search-focus-border', rgba(c.accent, .6))
  s('search-focus-shadow', rgba(c.accent, .15))
  s('search-button-bg', '#ffffff'); s('search-button-text', c.onDark)
  // 排行榜
  s('rank-first-text', c.accent)
  s('rank-second-text', rgba(c.rating, .7))
  s('rank-third-text', c.tag)
  // Hero
  s('hero-badge-bg', acc_soft); s('hero-badge-text', c.accent)
  s('hero-primary-button-bg', '#ffffff'); s('hero-primary-button-text', c.onDark)
  s('hero-secondary-button-bg', rgbaColor('#ffffff', .12)); s('hero-secondary-button-text', '#ffffff')
  // Chip
  s('chip-active-bg', c.accent); s('chip-active-text', c.onBrand)
  s('section-accent-bg', acc_grad)
  // 卡片
  s('badge-score-bg', c.rating); s('badge-score-text', c.ratingText)
  s('poster-overlay-bg', `linear-gradient(0deg, ${rgba(c.bg, .82)} 0%, transparent 55%)`)
  // 播放页
  s('play-line-active-bg', acc_grad); s('play-line-active-text', c.onBrand)
  s('play-channel-active-bg', c.accent); s('play-channel-active-text', c.onBrand)
  s('play-episode-active-bg', c.accent); s('play-episode-active-text', c.onBrand)
  s('play-link-text', c.accent)
  s('gallery-active-border', c.accent)
  // 引导面板
  s('onboarding-bg', `linear-gradient(135deg, ${acc_soft}, rgba(32,36,52,.78))`)
  // 标签
  s('rose', c.tag)
  // 暗面
  s('card-hi', c.surfaceDim)
}

function rgbaColor(value, alpha) {
  const c = hexToRgb(value)
  if (!c) { const p = parseCssColor(value); return p ? `rgba(${p.r},${p.g},${p.b},${alpha})` : value }
  return `rgba(${c.r},${c.g},${c.b},${alpha})`
}
