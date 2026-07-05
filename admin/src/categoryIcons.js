const ICON_PATHS = {
  action: '<path d="M13 3 4 14h7l-1 7 9-11h-7z"/>',
  adventure: '<path d="M12 2l7 19-7-4-7 4z"/><path d="m12 17 2-8-2 2-2-2z"/>',
  anime: '<circle cx="9" cy="12" r="5"/><path d="M14 8a5 5 0 0 1 0 8M7.5 11h.01M10.5 11h.01M8 14c1 .7 2 .7 3 0"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  car: '<path d="M5 16h14l-1.6-5.2A2.5 2.5 0 0 0 15 9H9a2.5 2.5 0 0 0-2.4 1.8z"/><path d="M7 16v2M17 16v2M6 13h12"/>',
  cinema: '<path d="M4 6h16v12H4z"/><path d="M8 6l2 4M14 6l2 4M4 10h16M8 18l-2 3M16 18l2 3"/>',
  classic: '<path d="M5 4h14v16l-7-4-7 4z"/><path d="M8 8h8M8 11h6"/>',
  collection: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  comedy: '<circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M8 14c2.4 2 5.6 2 8 0"/>',
  comic: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
  commentary: '<path d="M12 3a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  crime: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="M9 12h6M12 9v6"/>',
  diamond: '<path d="M6 4h12l4 6-10 11L2 10z"/><path d="M2 10h20M8 4l4 17 4-17"/>',
  documentary: '<path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 11h6M9 15h6"/>',
  education: '<path d="M3 8l9-4 9 4-9 4z"/><path d="M7 10v5c3 2 7 2 10 0v-5"/>',
  fashion: '<path d="M8 4h8l2 5-3 1v10H9V10L6 9z"/><path d="M10 4c1 2 3 2 4 0"/>',
  film: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 5v14M16 5v14M4 10h16M4 14h16"/>',
  folder: '<path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  food: '<path d="M7 3v8M4 3v8M10 3v8M4 11h6M7 11v10"/><path d="M17 3v18M14 7c0-2 1.5-4 3-4s3 2 3 4v4h-6z"/>',
  game: '<path d="M8 12h8"/><path d="M10 10v4"/><path d="M16 10h.01M18 14h.01"/><rect x="3" y="8" width="18" height="10" rx="5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  health: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/><path d="M9 12h6M12 9v6"/>',
  heart: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>',
  history: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2M4 12H2M22 12h-2"/>',
  hot: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  kids: '<circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M8.5 14c2 2 5 2 7 0"/>',
  live: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M10 10l5 2-5 2z"/><path d="M8 21h8"/>',
  magic: '<path d="M4 20 20 4"/><path d="m14 4 6 6"/><path d="M5 6l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM17 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  movie: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 5v14M16 5v14M4 10h16M4 14h16"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>',
  mystery: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8a2 2 0 0 1 1 3.7c-.6.3-1 .7-1 1.3M11 16h.01"/>',
  news: '<path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z"/>',
  podcast: '<circle cx="12" cy="9" r="3"/><path d="M7 10a5 5 0 0 0 10 0M9 18l3-4 3 4M12 14v7"/>',
  radio: '<rect x="4" y="9" width="16" height="10" rx="2"/><path d="m8 9 8-5M8 14h.01M12 14h4"/>',
  ranking: '<path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/>',
  recommend: '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z"/>',
  romance: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/><path d="M9 13h6"/>',
  science: '<path d="M10 3v5l-5 9a3 3 0 0 0 2.6 4h8.8a3 3 0 0 0 2.6-4l-5-9V3"/><path d="M8 3h8M8 15h8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  series: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 21h8M12 18v3M8 10h8M8 14h5"/>',
  shortplay: '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',
  sport: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"/>',
  stage: '<path d="M4 7h16M7 7v10M17 7v10"/><path d="M8 17h8l2 4H6z"/>',
  star: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z"/>',
  travel: '<path d="M4 19 20 5"/><path d="m8 5 12 12"/><path d="M4 19l6-1 8-8-4-4-8 8z"/>',
  trophy: '<path d="M8 4h8v3a4 4 0 0 1-8 0z"/><path d="M8 6H5a2 2 0 0 0 2 4h1M16 6h3a2 2 0 0 1-2 4h-1M12 11v5M9 20h6M10 16h4"/>',
  tv: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M12 18v3"/>',
  update: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/><path d="M12 8v5l3 2"/>',
  variety: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z"/>',
  war: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="M9 14 15 8M15 14 9 8"/>',
}

export const categoryIconOptions = [
  { value: 'movie', label: '电影' },
  { value: 'film', label: '胶片' },
  { value: 'tv', label: '电视' },
  { value: 'series', label: '剧集' },
  { value: 'variety', label: '综艺' },
  { value: 'anime', label: '动漫' },
  { value: 'comic', label: '漫剧' },
  { value: 'shortplay', label: '短剧' },
  { value: 'commentary', label: '解说' },
  { value: 'documentary', label: '纪录片' },
  { value: 'cinema', label: '影院' },
  { value: 'play', label: '播放' },
  { value: 'action', label: '动作' },
  { value: 'comedy', label: '喜剧' },
  { value: 'romance', label: '爱情' },
  { value: 'mystery', label: '悬疑' },
  { value: 'crime', label: '犯罪' },
  { value: 'war', label: '战争' },
  { value: 'magic', label: '奇幻' },
  { value: 'adventure', label: '冒险' },
  { value: 'sport', label: '体育' },
  { value: 'music', label: '音乐' },
  { value: 'stage', label: '舞台' },
  { value: 'news', label: '资讯' },
  { value: 'game', label: '游戏' },
  { value: 'kids', label: '少儿' },
  { value: 'education', label: '教育' },
  { value: 'science', label: '科技' },
  { value: 'travel', label: '旅行' },
  { value: 'food', label: '美食' },
  { value: 'car', label: '汽车' },
  { value: 'health', label: '健康' },
  { value: 'fashion', label: '时尚' },
  { value: 'history', label: '历史' },
  { value: 'live', label: '直播' },
  { value: 'radio', label: '电台' },
  { value: 'podcast', label: '播客' },
  { value: 'ranking', label: '排行' },
  { value: 'hot', label: '热门' },
  { value: 'recommend', label: '推荐' },
  { value: 'calendar', label: '每日更新' },
  { value: 'update', label: '更新' },
  { value: 'grid', label: '全部分类' },
  { value: 'search', label: '搜索' },
  { value: 'classic', label: '经典' },
  { value: 'star', label: '精选' },
  { value: 'trophy', label: '获奖' },
  { value: 'diamond', label: '会员' },
  { value: 'heart', label: '收藏' },
  { value: 'collection', label: '合集' },
  { value: 'folder', label: '通用分类' },
]

const iconValues = new Set(categoryIconOptions.map(icon => icon.value))

export function inferCategoryIcon(name) {
  const text = String(name || '').trim()
  if (/动作|武打|功夫|格斗/.test(text)) return 'action'
  if (/冒险|探险/.test(text)) return 'adventure'
  if (/影院|院线/.test(text)) return 'cinema'
  if (/电影|影片|片库/.test(text)) return 'movie'
  if (/电视剧|剧集|连续剧|国产剧|日剧|韩剧|美剧|港剧|台剧|泰剧/.test(text)) return 'tv'
  if (/综艺|真人秀|节目/.test(text)) return 'variety'
  if (/动漫|动画|番剧/.test(text)) return 'anime'
  if (/漫剧|漫画/.test(text)) return 'comic'
  if (/短剧|短片|短视频/.test(text)) return 'shortplay'
  if (/解说|讲解|预告/.test(text)) return 'commentary'
  if (/喜剧|搞笑/.test(text)) return 'comedy'
  if (/爱情|恋爱|言情/.test(text)) return 'romance'
  if (/悬疑|推理|惊悚/.test(text)) return 'mystery'
  if (/犯罪|刑侦|警匪/.test(text)) return 'crime'
  if (/战争|军事/.test(text)) return 'war'
  if (/奇幻|魔幻|玄幻|仙侠/.test(text)) return 'magic'
  if (/体育|足球|篮球|赛事|电竞|比赛/.test(text)) return 'sport'
  if (/纪录|记录/.test(text)) return 'documentary'
  if (/音乐|演唱|MV|歌/.test(text)) return 'music'
  if (/舞台|戏剧|晚会/.test(text)) return 'stage'
  if (/新闻|资讯/.test(text)) return 'news'
  if (/游戏/.test(text)) return 'game'
  if (/少儿|儿童|亲子/.test(text)) return 'kids'
  if (/教育|课堂|公开课/.test(text)) return 'education'
  if (/科技|科学|科幻/.test(text)) return 'science'
  if (/旅行|旅游|户外/.test(text)) return 'travel'
  if (/美食|料理/.test(text)) return 'food'
  if (/汽车|车/.test(text)) return 'car'
  if (/健康|医疗|养生/.test(text)) return 'health'
  if (/时尚|穿搭|美妆/.test(text)) return 'fashion'
  if (/历史|人文/.test(text)) return 'history'
  if (/直播/.test(text)) return 'live'
  if (/电台|广播/.test(text)) return 'radio'
  if (/播客|音频/.test(text)) return 'podcast'
  if (/获奖|大奖|奥斯卡|金像|金马/.test(text)) return 'trophy'
  if (/排行|榜/.test(text)) return 'ranking'
  if (/热门|热播|爆款/.test(text)) return 'hot'
  if (/推荐|猜你喜欢|为你/.test(text)) return 'recommend'
  if (/更新|每日|今日|本周/.test(text)) return 'calendar'
  if (/全部|分类|频道/.test(text)) return 'grid'
  if (/搜索|查找/.test(text)) return 'search'
  if (/播放|片单/.test(text)) return 'play'
  if (/经典/.test(text)) return 'classic'
  if (/高分|精选/.test(text)) return 'star'
  if (/会员|VIP|专享/.test(text)) return 'diamond'
  if (/收藏|喜欢/.test(text)) return 'heart'
  if (/合集|专题|精选/.test(text)) return 'collection'
  return 'folder'
}

export function normalizeCategoryIcon(icon, name = '') {
  if (isCustomIcon(icon)) return icon
  return iconValues.has(icon) ? icon : inferCategoryIcon(name)
}

export function isCustomIcon(icon) {
  return typeof icon === 'string' && icon.startsWith('svg:') && Boolean(decodeCustomSvgIcon(icon))
}

export function encodeCustomSvgIcon(svgText) {
  const markup = sanitizeSvgMarkup(String(svgText || ''))
  return markup ? `svg:${encodeURIComponent(markup)}` : ''
}

export function decodeCustomSvgIcon(icon) {
  if (typeof icon !== 'string' || !icon.startsWith('svg:')) return ''
  try { return sanitizeSvgMarkup(decodeURIComponent(icon.slice(4))) } catch { return '' }
}

export function categoryIconSvg(icon, name = '') {
  const custom = decodeCustomSvgIcon(icon)
  if (custom) return custom
  const key = normalizeCategoryIcon(icon, name)
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[key] || ICON_PATHS.folder}</svg>`
}

function sanitizeSvgMarkup(input) {
  const raw = String(input || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|foreignObject|iframe)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
  const svgMatch = raw.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i)
  const viewBox = safeSvgViewBox(svgMatch?.[1] || '')
  const inner = svgMatch ? svgMatch[2] : raw
  const allowedTags = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])
  const allowedAttrs = new Set(['d', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule'])
  const parts = []
  const tagRe = /<\s*(path|rect|circle|ellipse|line|polyline|polygon)\b([^>]*)\/?\s*>/gi
  let match
  while ((match = tagRe.exec(inner))) {
    const tag = match[1].toLowerCase()
    if (!allowedTags.has(tag)) continue
    const attrs = []
    const attrRe = /([a-zA-Z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g
    let attr
    while ((attr = attrRe.exec(match[2] || ''))) {
      const name = attr[1].toLowerCase()
      const value = attr[3] ?? attr[4] ?? ''
      if (!allowedAttrs.has(name) || !safeSvgAttrValue(name, value)) continue
      attrs.push(`${name}="${value.replace(/"/g, '&quot;')}"`)
    }
    if (tag === 'path' && !attrs.some(attr => attr.startsWith('d='))) continue
    parts.push(`<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}/>`)
  }
  const content = parts.join('').slice(0, 6000)
  return content ? `<svg viewBox="${viewBox}" fill="currentColor" stroke="none" aria-hidden="true">${content}</svg>` : ''
}

function safeSvgViewBox(attrs) {
  const match = String(attrs || '').match(/\bviewBox\s*=\s*("([^"]*)"|'([^']*)')/i)
  const value = String(match?.[2] ?? match?.[3] ?? '').trim()
  return /^-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?$/.test(value)
    ? value
    : '0 0 24 24'
}

function safeSvgAttrValue(name, value) {
  const v = String(value || '').trim()
  if (!v || /[<>]/.test(v) || /javascript:|data:|url\(|expression\(|on\w+=/i.test(v)) return false
  if (['fill', 'stroke'].includes(name)) {
    return /^(none|currentColor|#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/.test(v)
  }
  if (['stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule'].includes(name)) return /^[a-zA-Z-]+$/.test(v)
  return /^[0-9a-zA-Z.,+\-_\s()]+$/.test(v)
}
