export const DEFAULT_LEVEL_TAG_COLOR = '#ffc233'

export const LEVEL_TAG_COLOR_PRESETS = [
  '#ffc233',
  '#f59e0b',
  '#94a3b8',
  '#60a5fa',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#111827',
]

export function normalizeLevelTagColor(value, fallback = DEFAULT_LEVEL_TAG_COLOR) {
  const raw = String(value || '').trim()
  const hex = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (!hex) return fallback
  if (hex.length === 3) return `#${hex.split('').map(c => c + c).join('')}`.toLowerCase()
  return `#${hex}`.toLowerCase()
}

export function levelTagStyle(levelOrColor) {
  const rawColor = typeof levelOrColor === 'string' ? levelOrColor : levelOrColor?.tagColor
  const color = normalizeLevelTagColor(rawColor)
  const hex = color.slice(1)
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const linear = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  return { backgroundColor: color, borderColor: color, color: luminance > 0.56 ? '#111827' : '#ffffff' }
}
