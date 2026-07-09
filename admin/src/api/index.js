import axios from 'axios'
import { ElMessage } from 'element-plus'

const http = axios.create({ baseURL: '/api', timeout: 1200000 }) // 20分钟，容纳大批量采集

// 注入 token
http.interceptors.request.use(cfg => {
  const t = localStorage.getItem('token')
  if (t) cfg.headers.Authorization = 'Bearer ' + t
  return cfg
})
http.interceptors.response.use(
  r => r.data,
  e => {
    if (e.response?.status === 401) {
      localStorage.removeItem('token')
      if (location.hash !== '#/login') { location.hash = '#/login'; ElMessage.error('请先登录') }
    }
    return Promise.reject(e.response?.data?.error ? new Error(e.response.data.error) : e)
  }
)

export const api = {
  // auth
  login: (d) => http.post('/auth/login', d),
  me: () => http.get('/auth/me'),
  changePassword: (d) => http.post('/auth/password', d),
  // sources
  sources: () => http.get('/sources'),
  drivers: () => http.get('/drivers'),
  addSource: (d) => http.post('/sources', d),
  updateSource: (id, d) => http.put(`/sources/${id}`, d),
  delSource: (id) => http.delete(`/sources/${id}`),
  pingSource: (id) => http.post(`/sources/${id}/ping`),
  syncSource: (id, d) => http.post(`/sources/${id}/sync`, d),
  sourceLogs: (id) => http.get(`/sources/${id}/logs`),
  sourceTypes: (id) => http.get(`/sources/${id}/types`),
  sourceClasses: (id) => http.get(`/sources/${id}/classes`),
  sourceTypeCount: (id, t, hours) => http.get(`/sources/${id}/typecount`, { params: { t: Array.isArray(t) ? t.join(',') : t, hours } }),
  sourcePlayDomains: (id) => http.get(`/sources/${id}/play-domains`),
  replaceSourcePlayDomain: (id, d) => http.post(`/sources/${id}/play-domains/replace`, d),
  collectByKeyword: (keyword, options = {}) => http.post('/collect/keyword', { keyword, ...options }),
  previewKeyword: (kw) => http.get('/collect/keyword/preview', { params: { kw } }),
  confirmKeyword: (keyword, candidates, options = {}) => http.post('/collect/keyword/confirm', { keyword, candidates, ...options }),
  probe: (d) => http.post('/probe', d),
  // vods
  vods: (params) => http.get('/vods', { params }),
  adminVods: (params) => http.get('/admin/vods', { params }),
  batchVods: (ids, action) => http.post('/admin/vods/batch', { ids, action }),
  mergeVods: (targetId, sourceIds) => http.post('/admin/vods/merge', { targetId, sourceIds }),
  previewVodCleanup: (d) => http.post('/admin/vods/cleanup/preview', d),
  executeVodCleanup: (d) => http.post('/admin/vods/cleanup/execute', d),
  vod: (id) => http.get(`/admin/vods/${id}`),
  patchVod: (id, d) => http.patch(`/vods/${id}`, d),
  editVod: (id, d) => http.put(`/vods/${id}`, d),
  refreshVod: (id) => http.post(`/vods/${id}/refresh`),
  resolvePlay: (d) => http.get('/resolve', { params: d }),
  types: () => http.get('/types'),
  adminSubtypes: (type) => http.get('/admin/subtypes', { params: { type } }),
  stats: () => http.get('/stats'),
  // categories & mapping
  categories: () => http.get('/categories'),
  adminCategories: () => http.get('/admin/categories'),
  unifyCategories: () => http.post('/admin/categories/unify'),
  backfillSubtypes: () => http.post('/tasks/backfill-subtypes'),
  addCategory: (d) => http.post('/admin/categories', d),
  updateCategory: (id, d) => http.put(`/admin/categories/${id}`, d),
  delCategory: (id) => http.delete(`/admin/categories/${id}`),
  typemaps: (sourceId) => http.get('/admin/typemaps', { params: { sourceId } }),
  setTypemap: (id, categoryId) => http.post(`/admin/typemaps/${id}`, { categoryId }),
  batchTypemaps: (ids, categoryId) => http.post('/admin/typemaps/batch', { ids, categoryId }),
  delTypemap: (id) => http.delete(`/admin/typemaps/${id}`),
  unmappedCount: () => http.get('/admin/typemaps/unmapped'),
  // tasks
  tasks: (params) => http.get('/tasks', { params }),
  taskActiveCount: () => http.get('/tasks/active/count'),
  cleanupTasks: () => http.delete('/tasks/cleanup'),
  batchTasks: (ids, action) => http.post('/tasks/batch', { ids, action }),
  cancelTask: (id) => http.post(`/tasks/${id}/cancel`),
  pauseTask: (id) => http.post(`/tasks/${id}/pause`),
  resumeTask: (id) => http.post(`/tasks/${id}/resume`),
  updateTaskPriority: (id, priority) => http.patch(`/tasks/${id}/priority`, { priority }),
  retryTask: (id) => http.post(`/tasks/${id}/retry`),
  // metadata
  metaBatch: (d) => http.post('/meta/batch', d),
  metaMatch: (id) => http.post(`/meta/match/${id}`),
  metaSuggest: (kw) => http.get('/meta/suggest', { params: { kw } }),
  metaSet: (id, doubanId) => http.post(`/meta/set/${id}`, { doubanId }),
  metaStats: () => http.get('/meta/stats'),
  metaVods: (params) => http.get('/meta/vods', { params }),
  metaConfig: () => http.get('/meta/config'),
  updateMetaConfig: (d) => http.put('/meta/config', d),
  metaBatchRedo: () => http.post('/meta/batch', { redo: true }),
  // hot recommendation
  hotConfig: () => http.get('/admin/hot-config'),
  updateHotConfig: (d) => http.put('/admin/hot-config', d),
  hotPreview: () => http.get('/admin/hot-preview'),
  // HLS cleaning
  hlsCleanOverview: () => http.get('/admin/hls-clean/overview'),
  hlsCleanConfig: () => http.get('/admin/hls-clean/config'),
  updateHlsCleanConfig: (d) => http.put('/admin/hls-clean/config', d),
  updateHlsCleanPolicy: (d) => http.put('/admin/hls-clean/policy', d),
  deleteHlsCleanPolicy: (id) => http.delete(`/admin/hls-clean/policy/${id}`),
  createHlsCleanTask: (d) => http.post('/admin/hls-clean/tasks', d),
  hlsCleanResults: (params) => http.get('/admin/hls-clean/results', { params }),
  // users
  adminUsers: (params) => http.get('/admin/users', { params }),
  adminUser: (id) => http.get(`/admin/users/${id}`),
  updateAdminUser: (id, d) => http.patch(`/admin/users/${id}`, d),
  resetAdminUserPassword: (id, d) => http.post(`/admin/users/${id}/password`, d),
  invites: () => http.get('/admin/invites'),
  createInvites: (d) => http.post('/admin/invites', d),
  updateInvite: (id, d) => http.patch(`/admin/invites/${id}`, d),
  deleteInvite: (id) => http.delete(`/admin/invites/${id}`),
  vipLevels: () => http.get('/admin/vip-levels'),
  createVipLevel: (d) => http.post('/admin/vip-levels', d),
  updateVipLevel: (id, d) => http.patch(`/admin/vip-levels/${id}`, d),
  deleteVipLevel: (id) => http.delete(`/admin/vip-levels/${id}`),
  auditLogs: (params = { page: 1, size: 100 }) => {
    const p = typeof params === 'number' ? { limit: params } : params
    return http.get('/admin/audit-logs', { params: p })
  },
  // site
  site: () => http.get('/site'),
  adminSite: () => http.get('/admin/site'),
  updateSite: (d) => http.put('/site', d),
}

export const SITE_CACHE_KEY = 'vcms.site'
export const EMPTY_SITE = {
  siteName: '',
  logo: '',
  description: '',
  keywords: '',
  footer: '',
  announcement: '',
  allowRegister: true,
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
    accentBg: '#e5a00d',
    accentBgStart: '#e5a00d',
    accentBgEnd: '#f5c842',
    accentSoft: 12,
    buttonBg: '#e5a00d',
    buttonText: '#ffffff',
    surfaceButtonBg: '#ffffff',
    surfaceButtonText: '#16181d',
    searchBg: 'rgba(20,22,29,.5)',
    searchPanelBg: 'rgba(20,22,29,.82)',
    rating: '#ffc233',
    ratingText: '#1a1204',
    tag: '#e88db0',
    rankFirst: '#e5a00d',
    rankSecond: '#ffc233',
    rankThird: '#e88db0',
    heroOverlayColor: '#0a0b0f',
    heroOverlayStrength: 88,
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
  proxyMode: 'direct',
}

export const DEFAULT_HOME_CONFIG = {
  dailyUpdateTypes: [],
  mobileTemplate: 'responsive',
}

export const DEFAULT_PWA_CONFIG = {
  enabled: true,
  name: '',
  shortName: '',
  icon: '',
  themeColor: '#0a0b0f',
  backgroundColor: '#0a0b0f',
}

export function normalizeTheme(theme) {
  let raw = theme
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '{}') } catch { raw = {} }
  }
  const out = { global: {}, home: {}, play: {}, list: {} }
  for (const scope of Object.keys(out)) {
    const scopeTheme = { ...(raw?.[scope] || {}) }
    // 迁移旧字段名 → 新字段名
    if (scopeTheme.gold != null && scopeTheme.rating == null) scopeTheme.rating = scopeTheme.gold
    if (scopeTheme.accentLt != null && scopeTheme.accentLight == null) scopeTheme.accentLight = scopeTheme.accentLt
    if (scopeTheme.accentBg == null && scopeTheme.accent != null) {
      scopeTheme.accentBg = scopeTheme.accent
    }
    if (typeof scopeTheme.accentBg === 'string' && /^linear-gradient/i.test(scopeTheme.accentBg.trim())) {
      scopeTheme.accentBg = scopeTheme.accent || DEFAULT_THEME.global.accentBg
    }
    if (scopeTheme.accentBgStart == null) scopeTheme.accentBgStart = scopeTheme.accentBg || scopeTheme.accent || DEFAULT_THEME.global.accentBgStart
    if (scopeTheme.accentBgEnd == null) scopeTheme.accentBgEnd = scopeTheme.accentLight || scopeTheme.accentBgStart || DEFAULT_THEME.global.accentBgEnd
    if (scopeTheme.accentSoftAlpha != null && scopeTheme.accentSoft == null) scopeTheme.accentSoft = scopeTheme.accentSoftAlpha
    if (scopeTheme.muted2 != null && scopeTheme.textDim == null) scopeTheme.textDim = scopeTheme.muted2
    if (scopeTheme.muted != null && scopeTheme.textSub == null) scopeTheme.textSub = scopeTheme.muted
    if (scopeTheme.badgeScoreText != null && scopeTheme.ratingText == null) scopeTheme.ratingText = scopeTheme.badgeScoreText
    if (scopeTheme.rose != null && scopeTheme.tag == null) scopeTheme.tag = scopeTheme.rose
    if (scopeTheme.primaryButtonBg != null && scopeTheme.buttonBg == null) scopeTheme.buttonBg = scopeTheme.primaryButtonBg
    if (scopeTheme.primaryButtonText != null && scopeTheme.buttonText == null) scopeTheme.buttonText = scopeTheme.primaryButtonText
    if (scopeTheme.buttonBg == null && scopeTheme.accent != null) scopeTheme.buttonBg = scopeTheme.accent
    if (scopeTheme.buttonText == null && scopeTheme.onBrand != null) scopeTheme.buttonText = scopeTheme.onBrand
    if (scopeTheme.surfaceButtonText == null && scopeTheme.onDark != null) scopeTheme.surfaceButtonText = scopeTheme.onDark
    if (scopeTheme.searchBg == null && scopeTheme.card != null) scopeTheme.searchBg = rgbaColor(scopeTheme.card, .5)
    if (scopeTheme.searchPanelBg == null && scopeTheme.card != null) scopeTheme.searchPanelBg = rgbaColor(scopeTheme.card, .82)
    if (scopeTheme.rankFirst == null && scopeTheme.accent != null) scopeTheme.rankFirst = scopeTheme.accent
    if (scopeTheme.rankSecond == null && scopeTheme.rating != null) scopeTheme.rankSecond = scopeTheme.rating
    if (scopeTheme.rankThird == null && scopeTheme.tag != null) scopeTheme.rankThird = scopeTheme.tag
    if (scopeTheme.heroOverlayColor == null && scopeTheme.bg != null) scopeTheme.heroOverlayColor = scopeTheme.bg
    out[scope] = { ...(DEFAULT_THEME[scope] || {}), ...scopeTheme }
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
    proxyMode: ['direct', 'key', 'proxy'].includes(raw?.proxyMode) ? raw.proxyMode : 'direct',
  }
}

export function normalizeHomeConfig(config) {
  let raw = config
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '{}') } catch { raw = {} }
  }
  const rest = { ...(raw || {}) }
  const mobileTemplate = ['responsive', 'shortDrama'].includes(String(raw?.mobileTemplate || ''))
    ? raw.mobileTemplate
    : DEFAULT_HOME_CONFIG.mobileTemplate
  const cleanList = (value, limit = 20) => {
    const rows = Array.isArray(value) ? value : String(value || '').split(',')
    return [...new Set(rows.map(item => String(item || '').trim()).filter(Boolean))].slice(0, limit)
  }
  return {
    ...DEFAULT_HOME_CONFIG,
    ...rest,
    mobileTemplate,
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

// 防盗链图床走服务端代理（与观众端保持一致）
export function imgUrl(url) {
  if (!url) return ''
  if (/doubanio\.com|douban\.com/.test(url)) return '/api/img?u=' + encodeURIComponent(url)
  return url
}
