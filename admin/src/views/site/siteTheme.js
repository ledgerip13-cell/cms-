import { computed } from 'vue'
import { DEFAULT_THEME } from '../../api'

const themeGroups = [
  {
    key: 'base',
    label: '底板',
    desc: '页面底色、卡片、文字阶梯',
    fields: [
      { key: 'bg', label: '页面背景' },
      { key: 'card', label: '卡片背景' },
      { key: 'border', label: '分割线', alpha: true },
      { key: 'text', label: '主文字' },
      { key: 'textDim', label: '次要文字' },
      { key: 'textSub', label: '三级文字' },
    ],
  },
  {
    key: 'brand',
    label: '品牌强调',
    desc: '导航、chip、搜索聚焦、播放线路等选中态',
    fields: [
      { key: 'accent', label: '品牌边框色', alpha: true },
      { key: 'accentBgStart', label: '渐变起点', alpha: true },
      { key: 'accentBgEnd', label: '渐变终点', alpha: true },
      { key: 'onBrand', label: '品牌主色文字' },
      { key: 'accentSoft', label: '透明底(%)', type: 'alpha' },
    ],
  },
  {
    key: 'action',
    label: '操作按钮',
    desc: '白底按钮单独设置；主按钮跟随品牌主色',
    fields: [
      { key: 'surfaceButtonBg', label: '白底按钮背景' },
      { key: 'surfaceButtonText', label: '白底按钮文字' },
    ],
  },
  {
    key: 'search',
    label: '搜索',
    desc: '搜索框底色与搜索榜单弹层背景',
    fields: [
      { key: 'searchBg', label: '搜索框底色', alpha: true },
      { key: 'searchPanelBg', label: '榜单背景', alpha: true },
    ],
  },
  {
    key: 'semantic',
    label: '语义色',
    desc: '评分、标签等特殊场景色',
    fields: [
      { key: 'rating', label: '评分色' },
      { key: 'ratingText', label: '评分文字' },
      { key: 'tag', label: '标签色' },
    ],
  },
  {
    key: 'rank',
    label: '榜单',
    desc: '搜索榜单前三名独立设色，不再绑评分/标签/品牌色',
    fields: [
      { key: 'rankFirst', label: '第 1 名' },
      { key: 'rankSecond', label: '第 2 名' },
      { key: 'rankThird', label: '第 3 名' },
    ],
  },
  {
    key: 'hero',
    label: 'Hero',
    desc: '首页大图遮罩和背景融合',
    fields: [
      { key: 'heroOverlayColor', label: 'Hero遮罩色' },
      { key: 'heroOverlayStrength', label: '融合强度(%)', type: 'alpha' },
    ],
  },
  {
    key: 'fixed',
    label: '固定色',
    desc: '深浅底上的文字色',
    fields: [
      { key: 'onDark', label: '白底深字' },
      { key: 'surfaceDim', label: '最暗表面' },
    ],
  },
]

const fieldMeta = {
  bg:         { impacts: ['页面底色'], previews: ['surface'] },
  card:       { impacts: ['卡片/面板/弹窗'], previews: ['surface'] },
  border:     { impacts: ['所有分割线/边框'], previews: ['surface'] },
  text:       { impacts: ['正文/标题'], previews: ['surface'] },
  textDim:    { impacts: ['次要信息/导航常态'], previews: ['surface', 'nav'] },
  textSub:    { impacts: ['三级文字/placeholder'], previews: ['surface'] },
  accent:     { impacts: ['hover边框/搜索聚焦/透明底计算'], previews: ['nav', 'search', 'hero', 'play'] },
  accentBgStart: { impacts: ['品牌渐变起始色，支持透明度'], previews: ['chip', 'section', 'play'] },
  accentBgEnd:   { impacts: ['品牌渐变结束色，支持透明度'], previews: ['chip', 'section', 'play'] },
  accentSoft: { impacts: ['导航选中背景/Hero徽标底/引导面板 — 全自动联动'], previews: ['nav', 'hero'] },
  surfaceButtonBg:   { impacts: ['搜索按钮/Hero主按钮背景'], previews: ['search', 'hero'] },
  surfaceButtonText: { impacts: ['搜索按钮/Hero主按钮文字'], previews: ['search', 'hero'] },
  searchBg:   { impacts: ['顶部搜索框底色'], previews: ['search'] },
  searchPanelBg: { impacts: ['搜索弹层/热门榜单背景透明度'], previews: ['search', 'rank'] },
  rating:     { impacts: ['评分角标背景/评分文字'], previews: ['poster'] },
  ratingText: { impacts: ['评分角标文字'], previews: ['poster'] },
  tag:        { impacts: ['标签/玫瑰强调'], previews: ['rank'] },
  rankFirst:  { impacts: ['搜索榜单第 1 名'], previews: ['rank'] },
  rankSecond: { impacts: ['搜索榜单第 2 名'], previews: ['rank'] },
  rankThird:  { impacts: ['搜索榜单第 3 名'], previews: ['rank'] },
  heroOverlayColor:    { impacts: ['Hero大图遮罩色/底部融合色'], previews: ['hero'] },
  heroOverlayStrength: { impacts: ['Hero大图遮罩强度/底部融合强度'], previews: ['hero'] },
  onBrand:    { impacts: ['品牌底文字(chip/播放选中态)'], previews: ['chip', 'play'] },
  onDark:     { impacts: ['白按钮/搜索按钮深字'], previews: ['search'] },
  surfaceDim: { impacts: ['海报占位/缩略图底'], previews: ['poster'] },
}

export function useSiteTheme(form, activeFieldKey) {
  const previewColors = computed(() => effectiveTheme(form))
  const visibleThemeGroups = computed(() => themeGroups.map(group => ({
    ...group,
    fields: group.fields.map(f => ({ ...f, ...(fieldMeta[f.key] || {}) })),
  })))
  const allThemeFields = computed(() => themeGroups.flatMap(group => group.fields.map(f => ({ ...f, ...(fieldMeta[f.key] || {}) }))))
  const currentField = computed(() => allThemeFields.value.find(f => f.key === activeFieldKey.value) || allThemeFields.value[0] || { label: '主题字段', impacts: [], previews: ['surface'] })
  const currentImpacts = computed(() => currentField.value.impacts?.length ? currentField.value.impacts : ['当前字段影响的组件'])
  const currentPreviewBlocks = computed(() => currentField.value.previews?.length ? currentField.value.previews : ['surface'])
  const previewVars = computed(() => buildPreviewVars(previewColors.value))

  function themeValue(key) {
    if (hasOwn(form.value.theme?.global, key)) return form.value.theme.global[key]
    return DEFAULT_THEME.global[key]
  }

  function setThemeValue(key, value) {
    setActiveField(key)
    if (!form.value.theme) form.value.theme = { global: {} }
    if (!form.value.theme.global) form.value.theme.global = {}
    form.value.theme.global[key] = normalizeThemeValue(key, value)
  }

  function setActiveField(key) {
    activeFieldKey.value = key
  }

  function previewActive(block) {
    return currentPreviewBlocks.value.includes(block)
  }

  function resetTheme() {
    if (!form.value.theme) form.value.theme = { global: {} }
    form.value.theme.global = { ...DEFAULT_THEME.global }
  }

  function alphaColorField(key) {
    return allThemeFields.value.some(f => f.key === key && f.alpha)
  }

  function normalizeThemeValue(key, value) {
    if (!alphaColorField(key)) return value
    const color = parseCssColor(value)
    if (!color) return value
    const oldColor = parseCssColor(themeValue(key))
    const fallbackAlpha = oldColor?.a ?? 1
    return colorToRgba(color, fallbackAlpha)
  }

  return {
    visibleThemeGroups,
    currentField,
    currentImpacts,
    previewVars,
    themeValue,
    setThemeValue,
    setActiveField,
    previewActive,
    resetTheme,
  }
}

function effectiveTheme(form) {
  const theme = form.value.theme || {}
  return {
    ...DEFAULT_THEME.global,
    ...(theme.global || {}),
  }
}

function buildPreviewVars(c) {
  const accSoft = rgba(c.accent, alphaPercent(c.accentSoft, .12))
  const brandBg = `linear-gradient(120deg, ${c.accentBgStart || c.accentBg || c.accent}, ${c.accentBgEnd || c.accentBgStart || c.accentBg || c.accent})`
  const heroOverlay = c.heroOverlayColor || c.bg
  const heroStrength = alphaPercent(c.heroOverlayStrength, .88)
  const gh = rgbaColor('#ffffff', .06)
  return {
    '--tp-bg': c.bg, '--tp-card': c.card, '--tp-text': c.text,
    '--tp-muted2': c.textDim, '--tp-muted': c.textSub,
    '--tp-accent': c.accent, '--tp-accent-lt': c.accent, '--tp-accent-soft': accSoft, '--tp-grad': brandBg,
    '--tp-rating': c.rating, '--tp-rating-text': c.ratingText, '--tp-tag': c.tag,
    '--tp-gold': c.rating,
    '--tp-on-brand': c.onBrand, '--tp-on-dark': c.onDark, '--tp-surface-dim': c.surfaceDim,
    '--tp-card-hi': c.surfaceDim,
    '--tp-soft': rgba(c.accent, .18),
    '--tp-rose-soft': rgba(c.tag, .22),
    '--tp-hero-overlay-strong': rgba(heroOverlay, heroStrength),
    '--tp-hero-overlay-mid': rgba(heroOverlay, Math.max(.18, heroStrength * .72)),
    '--tp-hero-overlay-soft': rgba(heroOverlay, Math.max(.08, heroStrength * .32)),
    '--tp-hero-bottom': c.bg,
    '--tp-hero-bottom-mid': rgba(c.bg, .82),
    '--tp-hero-bottom-soft': rgba(c.bg, .36),
    '--tp-nav-active-bg': accSoft, '--tp-nav-active-text': c.accent,
    '--tp-search-button-bg': c.surfaceButtonBg, '--tp-search-button-text': c.surfaceButtonText,
    '--tp-search-bg': c.searchBg || rgbaColor(c.card, .5),
    '--tp-search-panel-bg': c.searchPanelBg || rgbaColor(c.card, .82),
    '--tp-rank-first-text': c.rankFirst, '--tp-rank-second-text': c.rankSecond, '--tp-rank-third-text': c.rankThird,
    '--tp-btn-primary-bg': brandBg, '--tp-btn-primary-text': c.onBrand,
    '--tp-btn-ghost-bg': gh, '--tp-btn-ghost-text': c.text,
    '--tp-btn-hover-text': c.accent, '--tp-btn-hover-border': c.accent,
    '--tp-section-accent-bg': brandBg,
    '--tp-poster-overlay-bg': `linear-gradient(0deg, ${rgba(c.bg, .82)} 0%, transparent 55%)`,
    '--tp-badge-score-bg': c.rating, '--tp-badge-score-text': c.ratingText,
    '--tp-hero-badge-bg': accSoft, '--tp-hero-badge-text': c.accent,
    '--tp-hero-primary-button-bg': c.surfaceButtonBg, '--tp-hero-primary-button-text': c.surfaceButtonText,
    '--tp-chip-active-bg': brandBg, '--tp-chip-active-text': c.onBrand,
    '--tp-play-line-active-bg': brandBg, '--tp-play-line-active-text': c.onBrand,
    '--tp-play-channel-active-bg': brandBg, '--tp-play-channel-active-text': c.onBrand,
    '--tp-play-episode-active-bg': brandBg, '--tp-play-episode-active-text': c.onBrand,
    '--tp-gallery-active-border': c.accent,
    '--tp-onboarding-bg': `linear-gradient(135deg, ${accSoft}, rgba(32,36,52,.78))`,
  }
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key)
}

function clampAlpha(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.max(0, Math.min(1, n))
}

function fmtAlpha(value) {
  return Number(clampAlpha(value).toFixed(3)).toString()
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
      hasAlpha: Boolean(hex[2]),
    }
  }
  const rgb = raw.match(/^rgba?\((.+)\)$/i)
  if (rgb) {
    const parts = rgb[1].split(',').map(x => x.trim())
    if (parts.length >= 3) {
      const [r, g, b] = parts.map(Number)
      if ([r, g, b].every(Number.isFinite)) {
        const hasAlpha = parts.length >= 4
        return { r, g, b, a: hasAlpha ? clampAlpha(parts[3]) : 1, hasAlpha }
      }
    }
  }
  return null
}

function colorToRgba(color, fallbackAlpha = 1) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${fmtAlpha(color.hasAlpha ? color.a : fallbackAlpha)})`
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

function rgbaColor(value, alpha) {
  const color = parseCssColor(value)
  return color ? `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${fmtAlpha(alpha)})` : value
}

function alphaPercent(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, n)) / 100
}
