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
  previewVodCleanup: (d) => http.post('/admin/vods/cleanup/preview', d),
  executeVodCleanup: (d) => http.post('/admin/vods/cleanup/execute', d),
  vod: (id) => http.get(`/admin/vods/${id}`),
  patchVod: (id, d) => http.patch(`/vods/${id}`, d),
  editVod: (id, d) => http.put(`/vods/${id}`, d),
  refreshVod: (id) => http.post(`/vods/${id}/refresh`),
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
  auditLogs: (limit = 100) => http.get('/admin/audit-logs', { params: { limit } }),
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

// 防盗链图床走服务端代理（与观众端保持一致）
export function imgUrl(url) {
  if (!url) return ''
  if (/doubanio\.com|douban\.com/.test(url)) return '/api/img?u=' + encodeURIComponent(url)
  return url
}
