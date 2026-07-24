function trimText(value, max = 800) {
  if (value === null || value === undefined) return ''
  return String(value).slice(0, max)
}

function finiteNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function compactObject(obj) {
  const out = {}
  Object.entries(obj || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value) && !value.length) return
    if (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length) return
    out[key] = value
  })
  return out
}

function serializeMediaError(error) {
  if (!error) return {}
  return compactObject({
    code: finiteNumber(error.code),
    message: trimText(error.message || error.name || error.toString?.(), 500),
  })
}

function serializeVideoState(video) {
  if (!video) return {}
  return compactObject({
    currentSrc: trimText(video.currentSrc || video.src || '', 1200),
    readyState: finiteNumber(video.readyState),
    networkState: finiteNumber(video.networkState),
    currentTime: finiteNumber(video.currentTime),
    duration: finiteNumber(video.duration),
    paused: typeof video.paused === 'boolean' ? video.paused : undefined,
    mediaError: serializeMediaError(video.error),
  })
}

function serializeResponse(response) {
  if (!response) return {}
  return compactObject({
    code: finiteNumber(response.code ?? response.status),
    text: trimText(response.text || response.statusText || '', 500),
    url: trimText(response.url || response.responseURL || '', 1200),
  })
}

function serializeNetworkDetails(details) {
  if (!details) return {}
  return compactObject({
    status: finiteNumber(details.status),
    statusText: trimText(details.statusText || '', 500),
    responseURL: trimText(details.responseURL || details.url || '', 1200),
    readyState: finiteNumber(details.readyState),
  })
}

function serializeFrag(frag) {
  if (!frag) return {}
  return compactObject({
    type: trimText(frag.type || '', 80),
    url: trimText(frag.url || frag.relurl || '', 1200),
    sn: trimText(frag.sn ?? '', 80),
    level: finiteNumber(frag.level),
    cc: finiteNumber(frag.cc),
    start: finiteNumber(frag.start),
    duration: finiteNumber(frag.duration),
  })
}

function basePlaybackContext(extra = {}) {
  return compactObject({
    event: trimText(extra.event || '', 120),
    currentUrl: trimText(extra.currentUrl || extra.url || '', 1200),
    rule: trimText(extra.rule || '', 80),
    proxyMode: trimText(extra.proxyMode || '', 40),
    cleanId: finiteNumber(extra.cleanId),
    fallbackUrl: trimText(extra.fallbackUrl || '', 1200),
    video: serializeVideoState(extra.video),
    at: new Date().toISOString(),
  })
}

export function serializeHlsError(data, extra = {}) {
  return compactObject({
    kind: 'hls.js',
    type: trimText(data?.type || '', 120),
    details: trimText(data?.details || '', 160),
    fatal: typeof data?.fatal === 'boolean' ? data.fatal : undefined,
    level: finiteNumber(data?.level),
    parent: trimText(data?.parent || '', 80),
    reason: trimText(data?.reason || data?.error?.message || '', 600),
    response: serializeResponse(data?.response),
    networkDetails: serializeNetworkDetails(data?.networkDetails),
    frag: serializeFrag(data?.frag),
    error: serializeMediaError(data?.error),
    context: basePlaybackContext(extra),
  })
}

export function serializeNativeMediaError(eventOrVideo, extra = {}) {
  const video = eventOrVideo?.target || eventOrVideo || extra.video
  return compactObject({
    kind: 'native_media',
    type: trimText(eventOrVideo?.type || 'error', 80),
    error: serializeMediaError(video?.error),
    context: basePlaybackContext({ ...extra, video }),
  })
}

export function serializePlaybackWatchdog(reason, extra = {}) {
  return compactObject({
    kind: 'playback_watchdog',
    details: trimText(reason || 'first_frame_timeout', 160),
    fatal: true,
    context: basePlaybackContext(extra),
  })
}
