export const SITE_CACHE_KEY = 'vcms.site'

export const EMPTY_SITE = {
  siteName: '',
  logo: '',
  description: '',
  keywords: '',
  footer: '',
  announcement: '',
  theme: {},
  shortsConfig: {},
  playConfig: {},
}

export const DEFAULT_THEME = {
  global: {
    bg: '#0a0b0f',
    bgSoft: '#12141b',
    card: '#14161d',
    cardHi: '#1a1d26',
    text: '#eceef3',
    muted: '#79818f',
    muted2: '#9aa2b1',
    accent: '#ff5e6c',
    accentLt: '#ff8a94',
    accent2: '#7aa7ff',
    gold: '#ffc233',
    rose: '#e88db0',
    accentSoftAlpha: 15,
    roseSoftAlpha: 16,
    btnPrimaryBg: '#ff5e6c',
    btnPrimaryText: '#ffffff',
    btnGhostBg: 'rgba(255,255,255,.06)',
    btnGhostText: '#eceef3',
    btnHoverBorder: '#ff5e6c',
    btnHoverText: '#ff8a94',
    navActiveBg: 'rgba(255,94,108,.15)',
    navActiveText: '#ff5e6c',
    searchBg: 'rgba(20,22,29,.6)',
    searchFocusBorder: 'rgba(255,94,108,.6)',
    searchFocusShadow: 'rgba(255,94,108,.15)',
    searchButtonBg: '#ffffff',
    searchButtonText: '#16181d',
    rankFirstText: '#ff5e6c',
    rankSecondText: '#ffc233',
    rankThirdText: '#e88db0',
    heroBadgeBg: 'rgba(255,94,108,.15)',
    heroBadgeText: '#ff5e6c',
    heroPrimaryButtonBg: '#ffffff',
    heroPrimaryButtonText: '#16181d',
    heroSecondaryButtonBg: 'rgba(255,255,255,.12)',
    heroSecondaryButtonText: '#ffffff',
    chipActiveBg: '#ff5e6c',
    chipActiveText: '#ffffff',
    sectionAccentBg: 'linear-gradient(120deg, #ff5e6c, #ff8a94)',
    badgeScoreBg: '#ffc233',
    badgeScoreText: '#1a1204',
    posterOverlayBg: 'linear-gradient(0deg, rgba(8,9,13,.82) 0%, transparent 55%)',
    playLineActiveBg: 'linear-gradient(120deg, #ff5e6c, #ff8a94)',
    playLineActiveText: '#ffffff',
    playChannelActiveBg: '#ff5e6c',
    playChannelActiveText: '#ffffff',
    playEpisodeActiveBg: '#7aa7ff',
    playEpisodeActiveText: '#ffffff',
    playLinkText: '#7aa7ff',
    galleryActiveBorder: '#ff5e6c',
    onboardingBg: 'linear-gradient(135deg, rgba(255,94,108,.14), rgba(32,36,52,.78))',
  },
  home: {},
  play: {},
  list: {},
}

export const DEFAULT_SHORTS_CONFIG = {
  enabled: true,
  defaultType: '短剧',
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

function normalizeTheme(theme) {
  let raw = theme
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '{}') } catch { raw = {} }
  }
  const out = { global: {}, home: {}, play: {}, list: {} }
  for (const scope of Object.keys(out)) out[scope] = { ...(DEFAULT_THEME[scope] || {}), ...(raw?.[scope] || {}) }
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
  const rest = { ...(raw || {}) }
  delete rest.enableSwipeGestures
  return {
    ...DEFAULT_SHORTS_CONFIG,
    ...rest,
    enabled: raw?.enabled !== false,
    defaultType: String(raw?.defaultType || DEFAULT_SHORTS_CONFIG.defaultType).trim().slice(0, 24) || DEFAULT_SHORTS_CONFIG.defaultType,
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

export function normalizeSite(site) {
  const next = { ...EMPTY_SITE, ...(site || {}) }
  next.theme = normalizeTheme(next.theme)
  next.shortsConfig = normalizeShortsConfig(next.shortsConfig)
  next.playConfig = normalizePlayConfig(next.playConfig)
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
  if (s.logo) {
    let link = document.querySelector("link[rel~='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = s.logo
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
  const colors = { ...theme.global, ...(theme[page] || {}) }
  const root = document.documentElement
  for (const [key, value] of Object.entries(colors)) {
    if (value !== undefined && value !== null && value !== '') root.style.setProperty(cssVarName(key), value)
  }
  if (colors.accent) root.style.setProperty('--accent-soft', rgba(colors.accent, alphaPercent(colors.accentSoftAlpha, .15)))
  if (colors.rose) root.style.setProperty('--rose-soft', rgba(colors.rose, alphaPercent(colors.roseSoftAlpha, .16)))
  if (colors.accent && colors.accentLt) root.style.setProperty('--grad', `linear-gradient(120deg, ${colors.accent}, ${colors.accentLt})`)
}
