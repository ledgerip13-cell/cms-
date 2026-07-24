<template>
  <div
    ref="boxEl"
    class="desktop-video-player"
    :class="{ 'controls-visible': controlsVisible || settingsOpen || qualityOpen, theater: theaterMode }"
    :style="subtitleStyleVars"
    tabindex="0"
    @mousemove="showControls"
    @mouseleave="hideControlsSoon"
  >
    <div v-if="theaterMode && title" class="desktop-video-title">
      <b>{{ title }}</b>
    </div>

    <video
      v-if="kind !== 'iframe'"
      ref="videoEl"
      playsinline
      webkit-playsinline
      x-webkit-airplay="allow"
      airplay="allow"
      :poster="poster"
      @click="onVideoClick"
      @timeupdate="syncState"
      @progress="syncState"
      @loadedmetadata="onLoadedMetadata"
      @loadeddata="updateNativeQualityLabel"
      @canplay="updateNativeQualityLabel"
      @durationchange="syncState"
      @play="playing = true"
      @pause="onPause"
      @volumechange="syncState"
      @ended="onEnded"
      @error="onNativeError"
      @webkitbeginfullscreen="onNativeFullscreen(true)"
      @webkitendfullscreen="onNativeFullscreen(false)"
    >
      <track v-for="(s, i) in subtitleOptions" :key="s.url" kind="subtitles" :src="s.url" :srclang="s.lang" :label="s.label" :default="subtitleDefaultEnabled && i === 0" @load="applySubtitleMode" />
    </video>

    <iframe v-else-if="src" :src="src" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>

    <button v-if="!src && kind !== 'iframe'" class="desktop-video-empty" type="button" @click="$emit('play')">
      <span>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 5.8v12.4a1.15 1.15 0 0 0 1.78.96l8.8-6.2a1.16 1.16 0 0 0 0-1.92l-8.8-6.2a1.15 1.15 0 0 0-1.78.96Z" /></svg>
      </span>
      <em>{{ resolving ? '解析中...' : '立即播放' }}</em>
    </button>

    <div v-if="resolving && !src" class="desktop-video-loading">正在解析播放地址...</div>
    <div v-if="notice" class="desktop-video-notice">{{ notice }}</div>
    <div v-if="kind === 'iframe' && src" class="desktop-video-iframe-note">该源为加密分享页，解析未命中，已回退内嵌播放器</div>

    <button v-if="kind !== 'iframe'" class="desktop-airplay" type="button" title="投屏" @click.stop="openAirplay">
      <svg viewBox="0 0 24 24"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><path d="m12 15 5 6H7Z" /></svg>
    </button>

    <div v-if="kind !== 'iframe' && src" class="desktop-video-toolbar" @click.stop @mousemove.stop="showControls">
      <input class="desktop-progress" type="range" min="0" :max="duration || 0" step="0.1" :value="currentTime" :style="{ '--desktop-progress': progressPercent + '%', '--desktop-buffered': bufferedPercent + '%' }" @input="seekVideo" />
      <div class="desktop-control-row">
        <div class="desktop-control-left">
          <button type="button" :title="playing ? '暂停' : '播放'" @click="togglePlay">
            <svg v-if="playing" viewBox="0 0 24 24"><rect x="14" y="4" width="4" height="16" rx="1" /><rect x="6" y="4" width="4" height="16" rx="1" /></svg>
            <svg v-else viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3" /></svg>
          </button>
          <button type="button" title="下一集" :disabled="!canNext" @click="$emit('next')">
            <svg viewBox="0 0 24 24"><polygon points="6 4 16 12 6 20 6 4" /><line x1="18" x2="18" y1="5" y2="19" /></svg>
          </button>
          <button type="button" :title="muted ? '打开声音' : '静音'" @click="toggleMute">
            <svg v-if="muted" viewBox="0 0 24 24"><path d="M16 9a5 5 0 0 1 .95 2.293" /><path d="M19.364 5.636a9 9 0 0 1 1.889 9.96" /><path d="m2 2 20 20" /><path d="m7 7-.587.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298V11" /><path d="M9.828 4.172A.686.686 0 0 1 11 4.657v.686" /></svg>
            <svg v-else viewBox="0 0 24 24"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" /></svg>
          </button>
          <span class="desktop-time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
        </div>
        <div class="desktop-control-right">
          <div class="desktop-pop">
            <button v-if="qualityBadgeLabel" class="desktop-quality-trigger" type="button" :class="{ active: qualityOpen }" :disabled="!qualities.length" @click.stop="toggleQuality">
              <span>清晰度</span>
              <b>{{ qualityBadgeLabel }}</b>
            </button>
            <div v-if="qualities.length && qualityOpen" class="desktop-quality-menu" @click.stop>
              <button type="button" :class="{ on: selectedQuality === 0 }" @click="selectQuality(0)">
                <strong>自动</strong>
                <span>推荐</span>
              </button>
              <button v-for="q in qualities" :key="q.resolution" type="button" :class="{ on: selectedQuality === q.resolution }" @click="selectQuality(q.resolution)">
                <strong>{{ q.resolution }}P</strong>
                <span>{{ q.name || `${q.resolution}P` }}</span>
              </button>
            </div>
          </div>
          <div class="desktop-pop">
            <button type="button" :class="{ active: settingsOpen }" title="设置" @click.stop="toggleSettings">
              <svg viewBox="0 0 24 24"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" /><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /><path d="M12 2v2" /><path d="M12 22v-2" /><path d="m17 20.66-1-1.73" /><path d="M11 10.27 7 3.34" /><path d="m20.66 17-1.73-1" /><path d="m3.34 7 1.73 1" /><path d="M14 12h8" /><path d="M2 12h2" /><path d="m20.66 7-1.73 1" /><path d="m3.34 17 1.73-1" /><path d="m17 3.34-1 1.73" /><path d="m11 13.73-4 6.93" /></svg>
            </button>
            <div v-if="settingsOpen" class="desktop-settings-menu" :class="{ 'rate-mode': rateOpen }" @click.stop>
              <template v-if="!rateOpen">
                <label class="desktop-switch-row">
                  <span>自动下一集</span>
                  <input v-model="autoNextLocal" type="checkbox" />
                  <i></i>
                </label>
                <label class="desktop-switch-row">
                  <span>跳过片头片尾</span>
                  <input v-model="skipIntroOutro" type="checkbox" @change="emitSkipChange" />
                  <i></i>
                </label>
                <div class="desktop-skip-grid">
                  <label>
                    <span>片头</span>
                    <input v-model.number="skipIntroDraft" type="number" min="0" max="600" step="5" @change="emitSkipChange" />
                  </label>
                  <label>
                    <span>片尾</span>
                    <input v-model.number="skipOutroDraft" type="number" min="0" max="600" step="5" @change="emitSkipChange" />
                  </label>
                </div>
                <button class="desktop-setting-row desktop-reset-row" type="button" @click="emitSkipReset">
                  <span>恢复默认</span>
                  <b>本片设置</b>
                </button>
                <button class="desktop-setting-row" type="button" @click="rateOpen = true">
                  <span>倍数</span>
                  <b>{{ playbackRateLabel }}</b>
                  <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
                </button>
                <button v-if="subtitleOptions.length" class="desktop-setting-row" type="button" @click="subtitleOpen = !subtitleOpen">
                  <span>字幕</span>
                  <b>{{ subtitleLabel }}</b>
                  <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
                </button>
                <div v-if="subtitleOptions.length && subtitleOpen" class="desktop-subtitle-panel">
                  <button type="button" :class="{ on: selectedSubtitle === 'off' }" @click="selectSubtitle('off')">关闭</button>
                  <button v-for="(sub, index) in subtitleOptions" :key="sub.url" type="button" :class="{ on: selectedSubtitle === String(index) }" @click="selectSubtitle(String(index))">{{ sub.label }}</button>
                </div>
              </template>
              <div v-else class="desktop-rate-panel">
                <button class="desktop-setting-back" type="button" @click="rateOpen = false">
                  <svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
                  <span>播放倍数</span>
                </button>
                <button v-for="rate in playbackRates" :key="rate" type="button" :class="{ on: playbackRate === rate }" @click="setPlaybackRate(rate)">
                  {{ rateLabel(rate) }}
                </button>
              </div>
            </div>
          </div>
          <button type="button" title="窗口化" @click="togglePip">
            <svg viewBox="0 0 24 24"><path d="M2 10h6V4" /><path d="m2 4 6 6" /><path d="M21 10V7a2 2 0 0 0-2-2h-7" /><path d="M3 14v2a2 2 0 0 0 2 2h3" /><rect x="12" y="14" width="10" height="7" rx="1" /></svg>
          </button>
          <button type="button" :title="theaterMode ? '退出 HLS 全屏' : 'HLS 全屏'" :class="{ active: theaterMode }" @click="toggleTheater">
            <svg v-if="theaterMode" viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
            <svg v-else viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
          </button>
          <button v-if="!theaterMode" type="button" title="系统全屏" @click="requestNativeFullscreen">
            <svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><rect width="10" height="8" x="7" y="8" rx="1" /></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Hls from 'hls.js'
import { serializeHlsError, serializeNativeMediaError } from '../hlsErrorReport'

const props = defineProps({
  src: { type: String, default: '' },
  kind: { type: String, default: 'hls' },
  poster: { type: String, default: '' },
  title: { type: String, default: '' },
  qualities: { type: Array, default: () => [] },
  selectedQuality: { type: Number, default: 0 },
  subtitles: { type: Array, default: () => [] },
  playConfig: { type: Object, default: () => ({}) },
  resolving: { type: Boolean, default: false },
  notice: { type: String, default: '' },
  canNext: { type: Boolean, default: false },
  seekTo: { type: Number, default: 0 },
})

const emit = defineEmits(['state', 'play', 'next', 'ended', 'error', 'quality-change', 'skip-change', 'skip-reset'])

const boxEl = ref(null)
const videoEl = ref(null)
const controlsVisible = ref(false)
const settingsOpen = ref(false)
const qualityOpen = ref(false)
const rateOpen = ref(false)
const subtitleOpen = ref(false)
const theaterMode = ref(false)
const nativeFullscreen = ref(false)
const playing = ref(false)
const muted = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const bufferedEnd = ref(0)
const playbackRate = ref(1)
const autoNextLocal = ref(true)
const skipIntroOutro = ref(false)
const skipIntroDraft = ref(0)
const skipOutroDraft = ref(0)
const selectedSubtitle = ref('off')
const nativeQualityLabel = ref('')
const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2]
let hls = null
let controlsTimer = 0
let introSkippedSrc = ''
let outroSkippedSrc = ''

const progressPercent = computed(() => duration.value ? Math.min(100, Math.max(0, currentTime.value / duration.value * 100)) : 0)
const bufferedPercent = computed(() => duration.value ? Math.min(100, Math.max(progressPercent.value, (bufferedEnd.value / duration.value) * 100)) : 0)
const playbackRateLabel = computed(() => rateLabel(playbackRate.value))
const playConfig = computed(() => props.playConfig || {})
const subtitleOptions = computed(() => (Array.isArray(props.subtitles) ? props.subtitles : [])
  .map((item, index) => ({
    url: String(item?.url || '').trim(),
    lang: String(item?.lang || 'zh').trim() || 'zh',
    label: String(item?.label || item?.lang || `字幕${index + 1}`).trim() || `字幕${index + 1}`,
  }))
  .filter(item => item.url))
const subtitleDefaultEnabled = computed(() => playConfig.value.subtitleDefault !== 'off')
const subtitleLabel = computed(() => {
  if (selectedSubtitle.value === 'off') return '关闭'
  const item = subtitleOptions.value[Number(selectedSubtitle.value)]
  return item?.label || '自动'
})
const subtitleStyleVars = computed(() => ({
  '--desktop-subtitle-color': String(playConfig.value.subtitleColor || '#fff'),
  '--desktop-subtitle-bg': String(playConfig.value.subtitleBackground || 'rgba(0,0,0,.55)'),
  '--desktop-subtitle-size': `${Math.max(14, Math.min(40, Number(playConfig.value.subtitleFontSize) || 22))}px`,
}))
const currentQualityLabel = computed(() => {
  if (!props.qualities.length) return ''
  if (!props.selectedQuality) return '自动'
  const hit = props.qualities.find(q => Number(q.resolution) === Number(props.selectedQuality))
  return hit ? (hit.name || `${hit.resolution}P`) : '自动'
})
const qualityBadgeLabel = computed(() => {
  if (props.qualities.length) {
    const picked = currentQualityLabel.value
    return picked === '自动' && nativeQualityLabel.value ? `自动 · ${nativeQualityLabel.value}` : picked
  }
  return nativeQualityLabel.value
})

function destroyHls() {
  if (hls) {
    hls.destroy()
    hls = null
  }
}
function clearControlsTimer() {
  if (controlsTimer) clearTimeout(controlsTimer)
  controlsTimer = 0
}
function showControls() {
  controlsVisible.value = true
  clearControlsTimer()
  if (!settingsOpen.value && !qualityOpen.value) {
    controlsTimer = window.setTimeout(() => { controlsVisible.value = false }, 2600)
  }
}
function hideControlsSoon() {
  clearControlsTimer()
  if (!settingsOpen.value && !qualityOpen.value) {
    controlsTimer = window.setTimeout(() => { controlsVisible.value = false }, 900)
  }
}
function closePops() {
  settingsOpen.value = false
  qualityOpen.value = false
  rateOpen.value = false
  subtitleOpen.value = false
}
function loadSource() {
  destroyHls()
  closePops()
  currentTime.value = 0
  duration.value = 0
  bufferedEnd.value = 0
  nativeQualityLabel.value = ''
  playing.value = false
  introSkippedSrc = ''
  outroSkippedSrc = ''
  resetSubtitleSelection()
  if (props.kind === 'iframe' || !props.src) return
  nextTick(() => {
    const video = videoEl.value
    if (!video) return
    try { video.pause() } catch {}
    video.removeAttribute('src')
    video.controls = false
    video.playbackRate = playbackRate.value
    video.load()
    if (/\.m3u8(\?|$)/i.test(props.src) && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 180, maxMaxBufferLength: 180, capLevelToPlayerSize: true })
      hls.attachMedia(video)
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls?.loadSource(props.src))
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().then(syncState).catch(syncState))
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data?.fatal) emit('error', serializeHlsError(data, { event: 'hls_fatal', currentUrl: props.src, video }))
      })
    } else {
      video.src = props.src
      video.play().then(syncState).catch(syncState)
    }
  })
}
function onNativeError(event) {
  emit('error', serializeNativeMediaError(event, { event: 'native_video_error', currentUrl: props.src, video: videoEl.value }))
}
function seekPending() {
  const video = videoEl.value
  const seek = Math.max(0, Number(props.seekTo) || 0)
  if (!video || seek < 8) return
  const total = Number(video.duration) || 0
  if (total && seek >= total - 6) return
  try {
    video.currentTime = seek
    currentTime.value = seek
  } catch {}
}
function onLoadedMetadata() {
  updateNativeQualityLabel()
  seekPending()
  applySkipIntro()
  applySubtitleMode()
  syncState()
}
function updateNativeQualityLabel() {
  const video = videoEl.value
  const height = Math.floor(Number(video?.videoHeight) || 0)
  nativeQualityLabel.value = height > 0 ? `${height}P` : ''
}
function syncState() {
  const video = videoEl.value
  if (!video) return
  applySkipRanges()
  currentTime.value = Number(video.currentTime) || 0
  duration.value = Number(video.duration) || 0
  bufferedEnd.value = bufferedEndFor(video, currentTime.value)
  muted.value = Boolean(video.muted)
  playing.value = !video.paused
  emit('state', { currentTime: currentTime.value, duration: duration.value, muted: muted.value, playing: playing.value })
}
function bufferedEndFor(video, current) {
  const ranges = video?.buffered
  if (!ranges?.length) return 0
  let end = 0
  for (let i = 0; i < ranges.length; i += 1) {
    const start = Number(ranges.start(i)) || 0
    const rangeEnd = Number(ranges.end(i)) || 0
    if (current >= start && current <= rangeEnd) return rangeEnd
    end = Math.max(end, rangeEnd)
  }
  return end
}
function onPause() {
  playing.value = false
  syncState()
}
function onEnded() {
  syncState()
  emit('ended', { autoNext: autoNextLocal.value })
}
function skipIntroSeconds() {
  return Math.max(0, Math.min(600, Number(skipIntroDraft.value) || 0))
}
function skipOutroSeconds() {
  return Math.max(0, Math.min(600, Number(skipOutroDraft.value) || 0))
}
function skipEnabled() {
  return Boolean(skipIntroOutro.value)
}
function syncSkipDrafts() {
  skipIntroOutro.value = playConfig.value.skipIntroEnabled === true
  skipIntroDraft.value = skipIntroSecondsFromConfig()
  skipOutroDraft.value = skipOutroSecondsFromConfig()
}
function skipIntroSecondsFromConfig() {
  return Math.max(0, Math.min(600, Number(playConfig.value.skipIntroSeconds) || 0))
}
function skipOutroSecondsFromConfig() {
  return Math.max(0, Math.min(600, Number(playConfig.value.skipOutroSeconds) || 0))
}
function emitSkipChange() {
  skipIntroDraft.value = skipIntroSeconds()
  skipOutroDraft.value = skipOutroSeconds()
  emit('skip-change', {
    enabled: Boolean(skipIntroOutro.value),
    introSeconds: skipIntroDraft.value,
    outroSeconds: skipOutroDraft.value,
  })
}
function emitSkipReset() {
  emit('skip-reset')
}
function applySkipIntro() {
  const video = videoEl.value
  const intro = skipIntroSeconds()
  const total = Number(video?.duration) || 0
  if (!video || !skipEnabled() || !intro || introSkippedSrc === props.src) return
  if (total && intro >= total - 8) return
  if ((Number(video.currentTime) || 0) < Math.max(1, intro - 0.5)) {
    introSkippedSrc = props.src
    try {
      video.currentTime = intro
      currentTime.value = intro
    } catch {}
  }
}
function applySkipRanges() {
  const video = videoEl.value
  if (!video || !skipEnabled()) return
  applySkipIntro()
  const outro = skipOutroSeconds()
  const total = Number(video.duration) || 0
  const now = Number(video.currentTime) || 0
  if (!outro || !total || total < 30 || now < total - outro || outroSkippedSrc === props.src) return
  outroSkippedSrc = props.src
  if (autoNextLocal.value) {
    emit('ended', { autoNext: true, skippedOutro: true })
  } else {
    try {
      video.currentTime = Math.max(0, total - 0.3)
      video.pause()
    } catch {}
  }
}
function togglePlay() {
  const video = videoEl.value
  if (!video || props.kind === 'iframe') return
  showControls()
  if (video.paused) video.play().then(syncState).catch(syncState)
  else {
    video.pause()
    syncState()
  }
}
function onVideoClick() {
  try { boxEl.value?.focus?.({ preventScroll: true }) } catch {}
  showControls()
  togglePlay()
}
function toggleMute() {
  const video = videoEl.value
  if (!video) return
  video.muted = !video.muted
  syncState()
}
function seekVideo(event) {
  const video = videoEl.value
  if (!video) return
  const next = Number(event?.target?.value || 0)
  video.currentTime = next
  currentTime.value = next
  syncState()
}
function seekBy(seconds) {
  const video = videoEl.value
  if (!video || props.kind === 'iframe') return
  const max = Number(video.duration) || duration.value || 0
  const next = Math.max(0, max ? Math.min(max, video.currentTime + seconds) : video.currentTime + seconds)
  video.currentTime = next
  currentTime.value = next
  showControls()
  syncState()
}
function toggleQuality() {
  qualityOpen.value = !qualityOpen.value
  if (qualityOpen.value) {
    settingsOpen.value = false
    rateOpen.value = false
  }
  showControls()
}
function selectQuality(resolution) {
  qualityOpen.value = false
  emit('quality-change', { resolution, currentTime: Math.floor(currentTime.value || 0) })
}
function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
  if (settingsOpen.value) qualityOpen.value = false
  if (!settingsOpen.value) {
    rateOpen.value = false
    subtitleOpen.value = false
  }
  showControls()
}
function setPlaybackRate(rate) {
  playbackRate.value = rate
  const video = videoEl.value
  if (video) video.playbackRate = rate
  rateOpen.value = false
  showControls()
}
async function togglePip() {
  const video = videoEl.value
  if (!video || !document.pictureInPictureEnabled) return
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture()
    else await video.requestPictureInPicture()
  } catch {}
}
function toggleTheater() {
  theaterMode.value = !theaterMode.value
  nativeFullscreen.value = false
  const video = videoEl.value
  if (video) video.controls = false
  showControls()
}
async function requestNativeFullscreen() {
  const video = videoEl.value
  if (!video) return
  try {
    nativeFullscreen.value = true
    closePops()
    video.controls = true
    if (video.requestFullscreen) await video.requestFullscreen()
    else if (video.webkitRequestFullscreen) await video.webkitRequestFullscreen()
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen()
  } catch {}
}
function onNativeFullscreen(active) {
  nativeFullscreen.value = Boolean(active)
  const video = videoEl.value
  if (video) video.controls = Boolean(active)
}
function syncFullscreenState() {
  const fs = document.fullscreenElement || document.webkitFullscreenElement
  const video = videoEl.value
  nativeFullscreen.value = fs === video || Boolean(video?.webkitDisplayingFullscreen)
  if (video) video.controls = nativeFullscreen.value
}
function openAirplay() {
  const video = videoEl.value
  if (video?.webkitShowPlaybackTargetPicker) video.webkitShowPlaybackTargetPicker()
}
function formatTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
function rateLabel(rate) {
  const value = Number(rate) || 1
  return Number.isInteger(value) ? `${value.toFixed(1)}x` : `${value}x`
}
function defaultSubtitleValue() {
  return subtitleDefaultEnabled.value && subtitleOptions.value.length ? '0' : 'off'
}
function resetSubtitleSelection() {
  selectedSubtitle.value = defaultSubtitleValue()
  nextTick(() => {
    applySubtitleMode()
    window.setTimeout(applySubtitleMode, 200)
  })
}
function applySubtitleMode() {
  const tracks = videoEl.value?.textTracks
  if (!tracks) return
  for (let i = 0; i < tracks.length; i++) {
    tracks[i].mode = selectedSubtitle.value === String(i) ? 'showing' : 'disabled'
  }
}
function selectSubtitle(value) {
  selectedSubtitle.value = String(value)
  subtitleOpen.value = false
  applySubtitleMode()
  showControls()
}
function shouldHandleHotkey(event) {
  if (props.kind === 'iframe' || !videoEl.value) return false
  const target = event.target
  const tag = String(target?.tagName || '').toLowerCase()
  if (target?.isContentEditable || ['input', 'textarea', 'select'].includes(tag)) return false
  return true
}
function onKeydown(event) {
  if (event.key === 'Escape' && theaterMode.value) {
    theaterMode.value = false
    return
  }
  if (!shouldHandleHotkey(event)) return
  if (event.key === ' ' || event.key === 'Spacebar' || event.key.toLowerCase() === 'k') {
    event.preventDefault()
    togglePlay()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    seekBy(-10)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    seekBy(10)
  } else if (event.key === 'ArrowUp') {
    const video = videoEl.value
    if (video) {
      event.preventDefault()
      video.volume = Math.min(1, video.volume + 0.1)
      syncState()
    }
  } else if (event.key === 'ArrowDown') {
    const video = videoEl.value
    if (video) {
      event.preventDefault()
      video.volume = Math.max(0, video.volume - 0.1)
      syncState()
    }
  } else if (event.key.toLowerCase() === 'm') {
    event.preventDefault()
    toggleMute()
  }
}

watch(() => props.src, loadSource)
watch(() => props.kind, loadSource)
watch(() => props.seekTo, seekPending)
watch(() => props.subtitles, resetSubtitleSelection, { deep: true })
watch(() => props.playConfig, () => {
  syncSkipDrafts()
  resetSubtitleSelection()
}, { deep: true, immediate: true })

onMounted(() => {
  loadSource()
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('fullscreenchange', syncFullscreenState)
  document.addEventListener('webkitfullscreenchange', syncFullscreenState)
})
onBeforeUnmount(() => {
  destroyHls()
  clearControlsTimer()
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('fullscreenchange', syncFullscreenState)
  document.removeEventListener('webkitfullscreenchange', syncFullscreenState)
})

defineExpose({
  getVideo: () => videoEl.value,
  getState: () => ({ currentTime: currentTime.value, duration: duration.value }),
})
</script>

<style scoped>
.desktop-video-player { position: relative; width: 100%; height: 100%; background: #000; overflow: hidden; color: #fff; outline: none; }
.desktop-video-player video,
.desktop-video-player iframe { width: 100%; height: 100%; display: block; background: #000; object-fit: contain; border: 0; }
.desktop-video-player video::cue { color: var(--desktop-subtitle-color, #fff); background: var(--desktop-subtitle-bg, rgba(0,0,0,.55)); font-size: var(--desktop-subtitle-size, 22px); line-height: 1.38; text-shadow: 0 2px 5px rgba(0,0,0,.9); }
.desktop-video-player video:not([controls])::-webkit-media-controls { display: none !important; }
.desktop-video-player.theater { position: fixed; inset: 0; z-index: 1000; border-radius: 0; }
.desktop-video-title { position: absolute; top: 18px; left: 20px; z-index: 5; max-width: calc(100% - 40px); color: rgba(255,255,255,.92); font-size: 15px; text-shadow: 0 2px 10px rgba(0,0,0,.55); }
.desktop-video-empty { position: absolute; inset: 0; margin: auto; width: 132px; height: 132px; border: 0; background: transparent; color: #fff; cursor: pointer; display: grid; place-items: center; gap: 10px; z-index: 4; }
.desktop-video-empty span { width: 68px; height: 68px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.18); backdrop-filter: blur(12px); }
.desktop-video-empty svg { width: 34px; height: 34px; }
.desktop-video-empty em { font-style: normal; font-size: 14px; font-weight: 800; }
.desktop-video-loading { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(255,255,255,.72); pointer-events: none; z-index: 3; }
.desktop-video-notice { position: absolute; left: 14px; right: 14px; bottom: 76px; z-index: 6; border: 1px solid rgba(255,255,255,.18); border-radius: 10px; background: rgba(8,10,15,.82); color: #f6d7db; font-size: 13px; line-height: 1.45; padding: 9px 12px; backdrop-filter: blur(10px); pointer-events: none; }
.desktop-video-iframe-note { position: absolute; left: 0; right: 0; bottom: 0; z-index: 4; font-size: 12px; color: rgba(255,255,255,.72); background: rgba(0,0,0,.6); padding: 6px 12px; text-align: center; pointer-events: none; }
.desktop-airplay { position: absolute; right: 16px; top: 14px; z-index: 5; width: 34px; height: 34px; border: 0; background: transparent; color: rgba(255,255,255,.86); cursor: pointer; opacity: 0; transform: translateY(-4px); transition: .18s; }
.desktop-video-player.controls-visible .desktop-airplay,
.desktop-video-player:hover .desktop-airplay { opacity: 1; transform: none; }
.desktop-airplay svg,
.desktop-video-toolbar svg { width: 22px; height: 22px; display: block; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.desktop-video-toolbar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 6; padding: 0 16px 14px; background: linear-gradient(180deg, transparent, rgba(0,0,0,.78)); opacity: 0; transform: translateY(16px); transition: opacity .18s, transform .18s; pointer-events: none; }
.desktop-video-player.controls-visible .desktop-video-toolbar,
.desktop-video-player:hover .desktop-video-toolbar { opacity: 1; transform: none; pointer-events: auto; }
.desktop-progress { width: 100%; height: 34px; margin: -8px 0 0; appearance: none; background: transparent; cursor: pointer; display: block; touch-action: pan-x; }
.desktop-progress::-webkit-slider-runnable-track { height: 3px; border-radius: 99px; background: linear-gradient(90deg, #e50914 0%, #e50914 var(--desktop-progress, 0%), rgba(255,255,255,.56) var(--desktop-progress, 0%), rgba(255,255,255,.56) var(--desktop-buffered, 0%), rgba(255,255,255,.32) var(--desktop-buffered, 0%), rgba(255,255,255,.32) 100%); }
.desktop-progress::-webkit-slider-thumb { appearance: none; width: 12px; height: 12px; margin-top: -4.5px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 7px rgba(229,9,20,.22), 0 2px 10px rgba(0,0,0,.35); }
.desktop-progress::-moz-range-track { height: 3px; border-radius: 99px; background: rgba(255,255,255,.32); }
.desktop-progress::-moz-range-progress { height: 3px; border-radius: 99px; background: #e50914; }
.desktop-progress::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 0 0 7px rgba(229,9,20,.22), 0 2px 10px rgba(0,0,0,.35); }
.desktop-control-row { min-height: 34px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.desktop-control-left,
.desktop-control-right { display: flex; align-items: center; gap: 8px; min-width: 0; }
.desktop-control-right { justify-content: flex-end; }
.desktop-video-toolbar button { width: 34px; height: 34px; border: 0; border-radius: 50%; background: transparent; color: rgba(255,255,255,.9); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: transform .15s, color .15s, background .15s; flex: 0 0 auto; }
.desktop-video-toolbar button:not(:disabled):hover,
.desktop-video-toolbar button.active { color: #fff; transform: scale(1.06); background: rgba(255,255,255,.1); }
.desktop-video-toolbar button:disabled { opacity: .35; cursor: not-allowed; }
.desktop-time { color: rgba(255,255,255,.82); font-size: 13px; line-height: 1; white-space: nowrap; }
.desktop-pop { position: relative; display: inline-flex; }
.desktop-quality-trigger { width: auto !important; min-width: 86px; padding: 0 10px !important; border-radius: 18px !important; gap: 6px; }
.desktop-quality-trigger:disabled { opacity: 1; cursor: default; transform: none !important; }
.desktop-quality-trigger span { font-size: 12px; color: rgba(255,255,255,.62); }
.desktop-quality-trigger b { font-size: 12px; color: #fff; }
.desktop-quality-menu,
.desktop-settings-menu { position: absolute; right: 0; bottom: 44px; border: 1px solid rgba(255,255,255,.12); background: rgba(18,18,18,.68); backdrop-filter: blur(16px); box-shadow: 0 18px 46px rgba(0,0,0,.32); z-index: 8; }
.desktop-quality-menu { width: 168px; padding: 8px; border-radius: 12px; display: grid; gap: 6px; }
.desktop-quality-menu button { width: 100%; height: 38px; border-radius: 8px; justify-content: space-between; padding: 0 10px !important; background: transparent; transform: none !important; }
.desktop-quality-menu button.on,
.desktop-quality-menu button:hover { background: rgba(255,255,255,.12); }
.desktop-quality-menu strong { font-size: 13px; }
.desktop-quality-menu span { font-size: 12px; color: rgba(255,255,255,.62); }
.desktop-settings-menu { width: 218px; min-height: 118px; padding: 8px; border-radius: 14px; }
.desktop-settings-menu:not(.rate-mode) { min-height: 248px; }
.desktop-settings-menu.rate-mode { width: 154px; }
.desktop-switch-row,
.desktop-setting-row,
.desktop-setting-back { width: 100%; height: 32px; display: flex; align-items: center; justify-content: space-between; gap: 10px; color: rgba(255,255,255,.88); font-size: 14px; border-radius: 8px; }
.desktop-switch-row { padding: 0 8px; }
.desktop-switch-row input { display: none; }
.desktop-switch-row i { width: 36px; height: 20px; border-radius: 999px; background: rgba(255,255,255,.2); position: relative; transition: .16s; }
.desktop-switch-row i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: .16s; }
.desktop-switch-row input:checked + i { background: #e50914; }
.desktop-switch-row input:checked + i::after { transform: translateX(16px); }
.desktop-skip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 4px 0 6px; }
.desktop-skip-grid label { min-width: 0; height: 38px; display: flex; align-items: center; gap: 6px; padding: 0 7px; border-radius: 8px; background: rgba(255,255,255,.07); color: rgba(255,255,255,.78); font-size: 12px; }
.desktop-skip-grid input { min-width: 0; width: 48px; height: 24px; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; background: rgba(0,0,0,.22); color: #fff; text-align: center; outline: none; }
.desktop-skip-grid input::-webkit-outer-spin-button,
.desktop-skip-grid input::-webkit-inner-spin-button { margin: 0; }
.desktop-setting-row,
.desktop-setting-back,
.desktop-rate-panel button { width: 100% !important; border-radius: 8px !important; justify-content: space-between !important; padding: 0 8px !important; background: transparent !important; transform: none !important; }
.desktop-setting-row:hover,
.desktop-setting-back:hover,
.desktop-rate-panel button:hover,
.desktop-rate-panel button.on { background: rgba(255,255,255,.12) !important; }
.desktop-setting-row svg,
.desktop-setting-back svg { width: 16px; height: 16px; }
.desktop-reset-row b { color: rgba(255,255,255,.5); font-size: 12px; font-weight: 500; }
.desktop-rate-panel { display: grid; gap: 4px; }
.desktop-rate-panel button { height: 26px !important; font-size: 13px; color: rgba(255,255,255,.86); }
.desktop-subtitle-panel { margin: 3px 0 0; padding-top: 5px; border-top: 1px solid rgba(255,255,255,.08); display: grid; gap: 3px; }
.desktop-subtitle-panel button { width: 100% !important; height: 28px !important; border-radius: 8px !important; padding: 0 8px !important; justify-content: flex-start !important; color: rgba(255,255,255,.82); font-size: 13px; transform: none !important; background: transparent !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.desktop-subtitle-panel button:hover,
.desktop-subtitle-panel button.on { background: rgba(255,255,255,.12) !important; color: #fff; }
@media (max-width: 760px) {
  .desktop-video-toolbar { padding: 0 10px 10px; overflow-x: auto; }
  .desktop-control-row { min-width: 600px; }
}
</style>
