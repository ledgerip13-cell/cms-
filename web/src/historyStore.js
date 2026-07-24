import { api } from './api'

export const MOBILE_HISTORY_KEY = 'vcms.mobile.play.history.v1'
export const PLAY_LOCAL_HISTORY_KEY = 'vcms.play.local.history'
export const X8_LOCAL_HISTORY_KEY = 'vcms.x8.local.history'

export function historyUpdatedAt(item) {
  const value = item?.updatedAt
  if (!value) return 0
  if (typeof value === 'number') return value
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function normalizeEntry(row) {
  if (!row) return null
  const latest = row.latest || row
  const vodId = Number(latest.vodId || latest.vod?.id || 0)
  if (!vodId) return null
  return {
    ...latest,
    vodId,
    lineId: Number(latest.lineId || 0) || latest.lineId,
    epIndex: Math.max(0, Number(latest.epIndex) || 0),
    progressSec: Number(latest.progressSec ?? latest.progress ?? 0) || 0,
    durationSec: Number(latest.durationSec ?? latest.duration ?? 0) || 0,
    updatedAt: latest.updatedAt || Date.now(),
    vod: latest.vod || row.vod || null,
  }
}

export function readLocalHistoryMap(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') || {}
  } catch {
    return {}
  }
}

export function writeLocalHistoryToKey(key, history) {
  const entry = normalizeEntry(history)
  if (!entry) return
  try {
    const data = readLocalHistoryMap(key)
    const previous = data[entry.vodId]
    const existingLines = Array.isArray(previous?.lineHistories) ? previous.lineHistories : (previous ? [previous] : [])
    const updated = { ...entry, updatedAt: entry.updatedAt || Date.now() }
    const lineHistories = [
      updated,
      ...existingLines.filter(item => Number(item?.lineId || 0) !== Number(updated.lineId || 0)),
    ].slice(0, 20)
    data[entry.vodId] = { ...updated, latest: updated, lineHistories }
    const rows = Object.entries(data)
      .sort((a, b) => historyUpdatedAt(b[1]) - historyUpdatedAt(a[1]))
      .slice(0, 120)
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(rows)))
  } catch {}
}

export function syncHistoryRowsToLocal(rows, key = MOBILE_HISTORY_KEY) {
  if (!Array.isArray(rows)) return
  rows.forEach(row => writeLocalHistoryToKey(key, row))
}

export function readLocalHistoryRows(key = MOBILE_HISTORY_KEY, limit = 50) {
  const data = readLocalHistoryMap(key)
  return Object.values(data || {})
    .map(normalizeEntry)
    .filter(Boolean)
    .sort((a, b) => historyUpdatedAt(b) - historyUpdatedAt(a))
    .slice(0, limit)
}

export async function hydrateLocalHistoryRows(key = MOBILE_HISTORY_KEY, limit = 50) {
  const rows = readLocalHistoryRows(key, limit)
  const settled = await Promise.all(rows.map(async (row) => {
    const vod = row.vod || await api.vod(row.vodId).catch(() => null)
    return { ...row, id: row.id || `local-${row.vodId}-${row.lineId || 0}-${row.epIndex || 0}`, vod }
  }))
  return settled.filter(row => row.vod)
}
