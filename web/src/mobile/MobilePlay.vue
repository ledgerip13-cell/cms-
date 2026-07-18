<template>
  <main class="mp">
    <section class="mp-player" :class="{ landscape: playerLandscape, portrait: playerLandscape && fullscreenPortrait }" :style="heroStyle" @click="onPlayerTap" @touchstart="onPlayerTouchStart" @touchmove="onPlayerTouchMove" @touchend="onPlayerTouchEnd" @touchcancel="onPlayerTouchEnd">
      <div class="mp-topbar">
        <button class="mp-icon-btn" type="button" aria-label="返回" @click.stop="goBack">
          <svg viewBox="0 0 24 24" v-html="icon('back')"></svg>
        </button>
        <strong>{{ playerTitle }}</strong>
        <button v-if="mode === 'hls' && curUrl && !accessBlock" class="mp-icon-btn" type="button" :aria-label="playerLandscape ? '退出横屏' : '横屏播放'" @click.stop="toggleLandscape">
          <svg viewBox="0 0 24 24" v-html="icon(playerLandscape ? 'close' : 'ratio')"></svg>
        </button>
      </div>
      <div class="mp-bg"></div>
      <video
        v-if="mode === 'hls' && !accessBlock"
        ref="videoEl"
        class="mp-video"
        autoplay
        preload="auto"
        :poster="poster(vod)"
        playsinline
        webkit-playsinline
        x-webkit-airplay="allow"
        airplay="allow"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @volumechange="syncVideoState"
        @loadedmetadata="syncVideoState"
        @durationchange="syncVideoState"
        @timeupdate="onTimeUpdate"
        @error="handlePlaybackError"
      ></video>
      <iframe v-else-if="mode === 'iframe' && !accessBlock" class="mp-video" :src="curUrl" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>
      <div v-if="loading || resolving" class="mp-state">
        <div></div>
        <span>{{ loading ? '加载中' : '解析中' }}</span>
      </div>
      <div v-else-if="accessBlock" class="mp-lock">
        <strong>{{ accessBlock.title }}</strong>
        <p>{{ accessBlock.desc }}</p>
        <button type="button" @click="handleAccessAction">{{ accessBlock.actionText }}</button>
      </div>
      <button v-else-if="!curUrl" class="mp-play" type="button" aria-label="播放" @click="playCurrent">
        <svg viewBox="0 0 24 24" v-html="icon('play')"></svg>
      </button>
      <div v-if="curUrl && !accessBlock && showCenterControls && mode === 'hls'" class="mp-center-controls">
        <button class="mp-round-btn" type="button" aria-label="上一集" :disabled="!hasPrevEp" @click.stop="playPrevEp">
          <svg viewBox="0 0 24 24" v-html="icon('skipBack')"></svg>
        </button>
        <button class="mp-round-btn mp-round-main" type="button" :aria-label="isPlaying ? '暂停' : '播放'" @click.stop="togglePlayback">
          <svg viewBox="0 0 24 24" v-html="icon(isPlaying ? 'pause' : 'play')"></svg>
        </button>
        <button class="mp-round-btn" type="button" aria-label="下一集" :disabled="!hasNextEp" @click.stop="playNextEp">
          <svg viewBox="0 0 24 24" v-html="icon('skipForward')"></svg>
        </button>
      </div>
      <div v-if="curUrl && !accessBlock && controlsVisible" class="mp-bottom-controls" :class="{ iframe: mode === 'iframe' }" @click.stop="keepControlsVisible()">
        <div v-if="mode === 'hls'" class="mp-progress-row" :class="{ compact: !showQualityControl }">
          <button class="mp-control-btn" type="button" :aria-label="isMuted ? '取消静音' : '静音'" @click.stop="toggleMuted">
            <svg viewBox="0 0 24 24" v-html="icon(isMuted ? 'volumeOff' : 'volume')"></svg>
          </button>
          <span class="mp-time">{{ formatTime(currentTime) }}</span>
          <input
            class="mp-range"
            type="range"
            min="0"
            :max="duration || 0"
            step="0.1"
            :value="currentTime"
            :style="{ '--progress': progressPercent }"
            aria-label="播放进度"
            @pointerdown.stop="beginRangeSeek"
            @pointerup.stop="endRangeSeek"
            @pointercancel.stop="cancelRangeSeek"
            @touchstart.stop="beginRangeSeek"
            @touchend.stop="endRangeSeek"
            @touchcancel.stop="cancelRangeSeek"
            @mousedown.stop="beginRangeSeek"
            @mouseup.stop="endRangeSeek"
            @input="previewRangeSeek"
            @click.stop
          />
          <span class="mp-time">{{ formatTime(duration) }}</span>
          <button v-if="showQualityControl" class="mp-control-btn" type="button" aria-label="清晰度" @click.stop="cycleQuality">
            <svg viewBox="0 0 24 24" v-html="icon('quality')"></svg>
          </button>
          <button class="mp-control-btn" type="button" aria-label="更多播放设置" @click.stop="togglePlayerMenu">
            <svg viewBox="0 0 24 24" v-html="icon('more')"></svg>
          </button>
          <button class="mp-control-btn" type="button" aria-label="全屏播放" @click.stop="enterFullscreen">
            <svg viewBox="0 0 24 24" v-html="icon('expand')"></svg>
          </button>
        </div>
        <button v-else class="mp-control-btn mp-iframe-full" type="button" aria-label="全屏播放" @click.stop="enterFullscreen">
          <svg viewBox="0 0 24 24" v-html="icon('expand')"></svg>
        </button>
        <div v-if="menuOpen && mode === 'hls'" class="mp-menu" @click.stop="keepControlsVisible(4200)">
          <div class="mp-menu-speeds">
            <button v-for="rate in speedOptions" :key="rate" type="button" :class="{ on: playbackRate === rate }" @click.stop="setSpeed(rate)">
              {{ rate === 1 ? '1x' : `${rate}x` }}
            </button>
          </div>
          <button class="mp-menu-cast" type="button" @click.stop="openCast">
            <svg viewBox="0 0 24 24" v-html="icon('cast')"></svg>
            投屏
          </button>
        </div>
      </div>
      <div v-if="playNotice" class="mp-notice">{{ playNotice }}</div>
      <div v-if="seeking" class="mp-seek-preview">{{ formatTime(seekPreviewTime) }} / {{ formatTime(duration) }}</div>
    </section>

    <section v-if="vod.id" class="mp-info">
      <div class="mp-title-row">
        <img class="mp-cover m-img-fade" :src="poster(vod)" :alt="vod.name" @load="onImgLoad" @error="hideBrokenImg" />
        <div>
          <h1>{{ vod.name }}</h1>
          <p>
            <span v-if="vod.typeName">{{ vod.typeName }}</span>
            <span v-if="vod.year">{{ vod.year }}</span>
            <span v-if="vod.remarks">{{ vod.remarks }}</span>
            <span v-if="vod.rating">豆瓣 {{ vod.rating }}</span>
          </p>
        </div>
        <button class="mp-follow" type="button" :class="{ on: followed }" @click="toggleFollow">
          <svg viewBox="0 0 24 24" v-html="icon('heart')"></svg>
          {{ followed ? '已追' : '追剧' }}
        </button>
      </div>
      <p v-if="vod.officialIntro || vod.blurb" class="mp-intro" :class="{ folded: !introOpen }" @click="introOpen = !introOpen">
        {{ vod.officialIntro || vod.blurb }}
      </p>
    </section>

    <section v-if="vod.lines?.length" class="mp-panel mp-lines-panel">
      <header>
        <h2>播放线路</h2>
        <span>{{ currentLineLabel }}</span>
      </header>
      <div class="mp-line-tabs">
        <button v-for="(line, index) in vod.lines" :key="line.id || index" type="button" :class="{ on: lineIdx === index }" @click="selectLine(index)">
          {{ lineLabel(line, index) }}
        </button>
      </div>
      <div v-if="channelOptions.length > 1" class="mp-channel-tabs">
        <button v-for="(channel, index) in channelOptions" :key="channel.id || index" type="button" :class="{ on: chanIdx === index }" @click="selectChannel(index)">
          {{ channelLabel(channel, index) }}
        </button>
      </div>
    </section>

    <section v-if="episodes.length" class="mp-panel">
      <header>
        <h2>选集</h2>
        <span>{{ epIdx + 1 }} / {{ episodes.length }}</span>
      </header>
      <div class="mp-episode-grid">
        <button v-for="(ep, index) in episodes" :key="index" type="button" :class="{ on: epIdx === index }" @click="playEp(index)">
          {{ ep.name || index + 1 }}
        </button>
      </div>
    </section>

    <section v-if="gallery.length" class="mp-panel">
      <header>
        <h2>剧照</h2>
        <span>{{ gallery.length }} 张</span>
      </header>
      <div class="mp-stills">
        <img v-for="img in gallery" :key="img.id || img.url" class="m-img-fade" :src="imgUrl(img.url)" :alt="vod.name" loading="lazy" @load="onImgLoad" @error="hideBrokenImg" />
      </div>
    </section>

    <section v-if="related.length" class="mp-panel">
      <header>
        <h2>相关推荐</h2>
      </header>
      <div class="mp-related">
        <article v-for="item in related" :key="item.id" @click="router.push(`/m/play/${item.id}`)">
          <img class="m-img-fade" :src="poster(item)" :alt="item.name" loading="lazy" @load="onImgLoad" @error="hideBrokenImg" />
          <strong>{{ item.name }}</strong>
          <span>{{ item.typeName || '影片' }}<template v-if="item.year"> · {{ item.year }}</template></span>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup>
import Hls from 'hls.js'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { openAuthDialog } from '../authDialog'
import { notifySuccess, notifyWarning } from '../feedback'
import { currentUser } from '../userStore'
import { icon } from './icons'

const route = useRoute()
const router = useRouter()
const user = currentUser
const videoEl = ref(null)
const vod = ref({})
const related = ref([])
const loading = ref(true)
const resolving = ref(false)
const introOpen = ref(false)
const followed = ref(false)
const accessBlock = ref(null)
const playNotice = ref('')
const curUrl = ref('')
const mode = ref('hls')
const lineIdx = ref(0)
const chanIdx = ref(0)
const epIdx = ref(0)
const isPlaying = ref(false)
const isMuted = ref(false)
const controlsVisible = ref(false)
const centerControlsVisible = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const playbackRate = ref(1)
const qualityLevel = ref(-1)
const qualityOptions = ref([])
const menuOpen = ref(false)
const playerLandscape = ref(false)
const fullscreenPortrait = ref(false)   // 全屏时的实际方向：true=竖屏全屏，false=横屏全屏
const speedOptions = [0.75, 1, 1.25, 1.5, 2]
// 横滑调进度手势状态
const seeking = ref(false)
const seekPreviewTime = ref(0)
let touchStartX = 0
let touchStartY = 0
let touchBaseTime = 0
let touchAxis = ''   // '' 未定 | 'h' 横滑(进度) | 'v' 竖滑(不拦)
let touchActive = false
let touchMoved = false      // 本次触摸是否发生位移（用于区分点击/滑动）
let suppressTapUntil = 0    // 滑动结束后抑制随后合成 click 的截止时间戳
let hls = null
let noticeTimer = 0
let historyTimer = 0
let controlsTimer = 0
let retryingLine = false
let bodyOverflowBeforeLandscape = ''
let pageActive = false
let loadSeq = 0
let playbackSeq = 0

const curLine = computed(() => vod.value.lines?.[lineIdx.value] || null)
const curChannel = computed(() => curLine.value?.channels?.[chanIdx.value] || curLine.value)
const channelOptions = computed(() => curLine.value?.channels?.length ? curLine.value.channels : [])
const episodes = computed(() => curChannel.value?.episodes || [])
const hasPrevEp = computed(() => epIdx.value > 0)
const hasNextEp = computed(() => epIdx.value < episodes.value.length - 1)
const gallery = computed(() => (vod.value.images || []).filter(img => img.type !== 'poster').slice(0, 10))
const progressPercent = computed(() => duration.value ? `${Math.max(0, Math.min(100, (currentTime.value / duration.value) * 100))}%` : '0%')
const showQualityControl = computed(() => qualityOptions.value.length > 1)
const showCenterControls = computed(() => controlsVisible.value && centerControlsVisible.value && !seeking.value)
const qualityLabel = computed(() => {
  if (qualityLevel.value < 0) return '自动'
  return qualityOptions.value.find(item => item.level === qualityLevel.value)?.label || '清晰度'
})
const currentEpisodeName = computed(() => {
  const ep = episodes.value[epIdx.value]
  return ep?.name || (episodes.value.length ? `第 ${epIdx.value + 1} 集` : '')
})
const playerTitle = computed(() => {
  const name = vod.value?.name || '播放'
  return currentEpisodeName.value ? `${name} · ${currentEpisodeName.value}` : name
})
const currentLineLabel = computed(() => {
  const line = curLine.value
  if (!line) return '默认线路'
  const base = lineLabel(line, lineIdx.value)
  return channelOptions.value.length > 1 ? `${base} · ${channelLabel(curChannel.value, chanIdx.value)}` : base
})
const heroStyle = computed(() => {
  const url = poster(vod.value)
  return url ? { backgroundImage: `url(${url})` } : {}
})

function poster(row) {
  return imgUrl(row?.officialPic || row?.heroImage || row?.heroPic || row?.pic || row?.localPic || '')
}

function lineLabel(line, index = 0) {
  return line?.sourceName || line?.flag || `线路 ${index + 1}`
}

function channelLabel(channel, index = 0) {
  return channel?.name || channel?.flag || channel?.sourceName || `通道 ${index + 1}`
}

function hideBrokenImg(event) {
  if (event?.target) event.target.style.visibility = 'hidden'
}

function onImgLoad(event) {
  event?.target?.classList?.add('is-loaded')
}

function goBack() {
  stopPlayback()
  resetLandscape()
  if (window.history.length > 1) router.back()
  else router.push('/m')
}

function showNotice(message) {
  playNotice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => { playNotice.value = '' }, 3600)
}

function isPlayRoute() {
  return String(route.path || '').startsWith('/m/play')
}

function isPlaybackCurrent(seq) {
  return pageActive && isPlayRoute() && seq === playbackSeq
}

function nextPlaybackSeq() {
  playbackSeq += 1
  return playbackSeq
}

function clearPlaybackMedia() {
  if (hls) {
    hls.destroy()
    hls = null
  }
  const video = videoEl.value
  if (video) {
    try { video.pause() } catch {}
    video.removeAttribute('src')
    try { video.load() } catch {}
  }
  curUrl.value = ''
  isPlaying.value = false
  resolving.value = false
  currentTime.value = 0
  duration.value = 0
  isMuted.value = false
  controlsVisible.value = false
  menuOpen.value = false
  qualityLevel.value = -1
  qualityOptions.value = []
  retryingLine = false
  if (controlsTimer) clearTimeout(controlsTimer)
}

function stopPlayback() {
  nextPlaybackSeq()
  clearPlaybackMedia()
}

function startVideo(video, seq) {
  if (!video || !isPlaybackCurrent(seq) || video !== videoEl.value) return
  const play = () => {
    window.requestAnimationFrame(() => {
      if (!isPlaybackCurrent(seq) || video !== videoEl.value) return
      video.play().catch(() => {})
    })
  }
  if (video.readyState >= 2) {
    play()
    return
  }
  video.addEventListener('loadeddata', play, { once: true })
  video.addEventListener('canplay', play, { once: true })
  window.setTimeout(() => {
    if (!isPlaybackCurrent(seq) || video !== videoEl.value) return
    if (video.readyState >= 1) play()
  }, 700)
}

function showControls(timeout = 5000, options = {}) {
  if (!curUrl.value || accessBlock.value) return
  const showCenter = options.center !== false
  controlsVisible.value = true
  centerControlsVisible.value = showCenter
  if (controlsTimer) clearTimeout(controlsTimer)
  controlsTimer = window.setTimeout(() => {
    controlsVisible.value = false
    centerControlsVisible.value = false
    menuOpen.value = false
    controlsTimer = 0
  }, timeout)
}

function keepControlsVisible(timeout = 4200) {
  showControls(timeout, { center: false })
}

function hideControls() {
  controlsVisible.value = false
  centerControlsVisible.value = false
  menuOpen.value = false
  if (controlsTimer) { clearTimeout(controlsTimer); controlsTimer = 0 }
}

// 触点是否落在控件上（顶栏/中央/底部/菜单，含进度条滑块），是则不触发播放器级手势与显隐
function isControlTarget(e) {
  const t = e?.target
  if (!t || !t.closest) return false
  return !!t.closest('.mp-topbar, .mp-center-controls, .mp-bottom-controls, .mp-menu')
}

// 点击播放器：显隐切换（区分滑动——滑动后短时间内抑制合成 click）
function onPlayerTap(e) {
  if (!curUrl.value || accessBlock.value) return
  if (Date.now() < suppressTapUntil) return
  if (isControlTarget(e)) return
  if (controlsVisible.value) hideControls()
  else showControls()
}

async function toggleLandscape() {
  playerLandscape.value = !playerLandscape.value
  if (playerLandscape.value) {
    // 根据视频实际宽高判定横/竖：竖片锁竖屏全屏，横片锁横屏全屏
    const video = videoEl.value
    const vw = Number(video?.videoWidth) || 0
    const vh = Number(video?.videoHeight) || 0
    fullscreenPortrait.value = vw > 0 && vh > 0 && vh > vw
    bodyOverflowBeforeLandscape = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    try { await screen.orientation?.lock?.(fullscreenPortrait.value ? 'portrait' : 'landscape') } catch {}
  } else {
    document.body.style.overflow = bodyOverflowBeforeLandscape
    fullscreenPortrait.value = false
    try { screen.orientation?.unlock?.() } catch {}
  }
  showControls(3200)
}

function resetLandscape() {
  if (!playerLandscape.value) return
  playerLandscape.value = false
  fullscreenPortrait.value = false
  document.body.style.overflow = bodyOverflowBeforeLandscape
  try { screen.orientation?.unlock?.() } catch {}
}

function enterFullscreen() {
  const target = mode.value === 'hls' ? videoEl.value : document.querySelector('.mp-player iframe')
  const box = document.querySelector('.mp-player')
  try {
    if (target?.webkitEnterFullscreen) {
      target.webkitEnterFullscreen()
      return
    }
    const fullscreenTarget = target || box
    if (fullscreenTarget?.requestFullscreen) {
      fullscreenTarget.requestFullscreen()
      return
    }
    if (fullscreenTarget?.webkitRequestFullscreen) {
      fullscreenTarget.webkitRequestFullscreen()
    }
  } catch {
    showNotice('当前浏览器暂不支持全屏')
  }
}

async function openCast() {
  const video = videoEl.value
  menuOpen.value = false
  showControls()
  if (!video || mode.value !== 'hls') {
    showNotice('当前播放源暂不支持 AirPlay')
    return
  }
  video.setAttribute('x-webkit-airplay', 'allow')
  video.setAttribute('airplay', 'allow')
  try {
    if (video?.webkitShowPlaybackTargetPicker) {
      video.webkitShowPlaybackTargetPicker()
      return
    }
    if (!/iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent || '') && video?.remote?.prompt) {
      await video.remote.prompt()
      return
    }
    showNotice('当前浏览器暂不支持 AirPlay')
  } catch {
    showNotice('AirPlay 未开启')
  }
}

function syncVideoState() {
  const video = videoEl.value
  if (!video) return
  currentTime.value = Number(video.currentTime) || 0
  duration.value = Number.isFinite(video.duration) ? Number(video.duration) || 0 : 0
  isPlaying.value = !video.paused
  isMuted.value = video.muted || Number(video.volume) === 0
  video.playbackRate = playbackRate.value
}

function onTimeUpdate() {
  syncVideoState()
  saveProgressSoon()
}

function togglePlayback() {
  const video = videoEl.value
  if (!video || mode.value !== 'hls') return
  showControls()
  if (video.paused) video.play().catch(() => {})
  else video.pause()
}

function toggleMuted() {
  const video = videoEl.value
  if (!video) return
  video.muted = !video.muted
  isMuted.value = video.muted
  showControls()
}

function previewRangeSeek(event) {
  const next = Number(event?.target?.value) || 0
  currentTime.value = next
  seekPreviewTime.value = next
  keepControlsVisible(3600)
}

function beginRangeSeek(event) {
  if (mode.value !== 'hls' || accessBlock.value || !curUrl.value) return
  event?.stopPropagation?.()
  seeking.value = true
  seekPreviewTime.value = currentTime.value
  menuOpen.value = false
  controlsVisible.value = true
  centerControlsVisible.value = false
  if (controlsTimer) { clearTimeout(controlsTimer); controlsTimer = 0 }
}

function endRangeSeek(event) {
  event?.stopPropagation?.()
  if (!seeking.value) return
  const video = videoEl.value
  if (video && duration.value) {
    video.currentTime = Math.max(0, Math.min(duration.value, seekPreviewTime.value))
  }
  seeking.value = false
  suppressTapUntil = Date.now() + 400
  keepControlsVisible(1800)
}

function cancelRangeSeek(event) {
  event?.stopPropagation?.()
  seeking.value = false
  suppressTapUntil = Date.now() + 400
  keepControlsVisible(1200)
}

// 播放器区域横滑调进度：横滑预览、松手才 seek；竖滑不拦（交给页面滚动）
function onPlayerTouchStart(e) {
  touchMoved = false
  touchActive = false
  if (mode.value !== 'hls' || accessBlock.value || !curUrl.value) return
  if (isControlTarget(e)) return // 落在控件(如进度条滑块)上，交给控件自身处理，不启用播放器手势
  const t = e.touches?.[0]
  if (!t) return
  touchActive = true
  touchAxis = ''
  touchStartX = t.clientX
  touchStartY = t.clientY
  touchBaseTime = currentTime.value
}

function onPlayerTouchMove(e) {
  if (!touchActive) return
  const video = videoEl.value
  const t = e.touches?.[0]
  if (!video || !t || !duration.value) return
  const dx = t.clientX - touchStartX
  const dy = t.clientY - touchStartY
  const cssRotatedLandscape = playerLandscape.value && !fullscreenPortrait.value && window.matchMedia?.('(orientation: portrait)')?.matches
  const seekDelta = cssRotatedLandscape ? dy : dx
  const crossDelta = cssRotatedLandscape ? dx : dy
  if (Math.abs(seekDelta) > 10 || Math.abs(crossDelta) > 10) touchMoved = true
  // 方向判定：首次位移超 10px 才锁轴，横>竖认为调进度
  if (!touchAxis) {
    if (Math.abs(seekDelta) < 10 && Math.abs(crossDelta) < 10) return
    touchAxis = Math.abs(seekDelta) > Math.abs(crossDelta) ? 'h' : 'v'
    // 横滑调进度时隐藏菜单：seek 预览与操作菜单不同时出现
    if (touchAxis === 'h') { seeking.value = true; hideControls() }
  }
  if (touchAxis !== 'h') return // 竖滑不拦截，让页面正常滚动
  e.preventDefault() // 横滑时阻止页面横向滑动/选中
  // 全屏宽度对应整段时长（一屏横滑 = 全片长），最少按 90s 基准避免短片太敏感
  const w = window.innerWidth || 360
  const span = Math.max(duration.value, 90)
  const next = Math.max(0, Math.min(duration.value, touchBaseTime + (seekDelta / w) * span))
  seekPreviewTime.value = next
  currentTime.value = next // 实时更新进度条 UI（不动 video.currentTime，避免频繁 seek 卡顿）
}

function onPlayerTouchEnd(e) {
  if (!touchActive) return
  touchActive = false
  const cancelled = e?.type === 'touchcancel'
  if (touchAxis === 'h' && seeking.value) {
    const video = videoEl.value
    if (!cancelled && video && duration.value) {
      video.currentTime = seekPreviewTime.value
    }
    seeking.value = false
  }
  // 发生过位移=滑动手势，抑制随后合成的 click，避免误触发菜单显隐
  if (touchMoved) suppressTapUntil = Date.now() + 400
  touchAxis = ''
}

function playPrevEp() {
  if (!hasPrevEp.value) {
    showControls(2200)
    return
  }
  playEp(epIdx.value - 1)
  showControls(2200)
}

function playNextEp() {
  if (!hasNextEp.value) {
    showControls(2200)
    return
  }
  playEp(epIdx.value + 1)
  showControls(2200)
}

function setSpeed(rate) {
  playbackRate.value = rate
  const video = videoEl.value
  if (video) video.playbackRate = playbackRate.value
  showNotice(playbackRate.value === 1 ? '已恢复正常速度' : `已切换 ${playbackRate.value}x`)
  menuOpen.value = false
  showControls(3200)
}

function togglePlayerMenu() {
  menuOpen.value = !menuOpen.value
  showControls(menuOpen.value ? 4200 : 2600)
}

function refreshQualityOptions() {
  if (!hls?.levels?.length) {
    qualityOptions.value = []
    return
  }
  qualityOptions.value = hls.levels
    .map((level, index) => ({
      level: index,
      height: Number(level.height) || 0,
      bitrate: Number(level.bitrate) || 0,
      label: level.height ? `${level.height}P` : `${Math.round((Number(level.bitrate) || 0) / 1000)}K`,
    }))
    .filter(item => item.label && item.label !== '0K')
    .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)
}

function cycleQuality() {
  if (!hls || !qualityOptions.value.length) return
  menuOpen.value = false
  const order = [-1, ...qualityOptions.value.map(item => item.level)]
  const current = order.indexOf(qualityLevel.value)
  qualityLevel.value = order[(current + 1) % order.length]
  hls.currentLevel = qualityLevel.value
  showNotice(qualityLevel.value < 0 ? '清晰度：自动' : `清晰度：${qualityLabel.value}`)
  showControls(3200)
}

function formatTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  const mins = Math.floor(total / 60)
  const secs = String(total % 60).padStart(2, '0')
  return `${mins}:${secs}`
}

function playDirect(url, kind = '', seq = nextPlaybackSeq()) {
  if (!isPlaybackCurrent(seq)) return
  clearPlaybackMedia()
  curUrl.value = url
  mode.value = kind === 'iframe' ? 'iframe' : 'hls'
  if (mode.value === 'iframe') return
  nextTick(() => {
    const video = videoEl.value
    if (!video || !isPlaybackCurrent(seq)) return
    const isM3u8 = kind === 'm3u8' || /\.m3u8(\?|$)/i.test(url)
    const nativeHls = isM3u8 && video.canPlayType('application/vnd.apple.mpegurl')
    if (nativeHls) {
      video.src = url
      try { video.load() } catch {}
      video.playbackRate = playbackRate.value
      startVideo(video, seq)
    } else if (isM3u8 && Hls.isSupported()) {
      const hlsInstance = new Hls({ maxBufferLength: 30, capLevelToPlayerSize: true })
      hls = hlsInstance
      hlsInstance.attachMedia(video)
      hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (!isPlaybackCurrent(seq) || hls !== hlsInstance) return
        hlsInstance.loadSource(url)
      })
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!isPlaybackCurrent(seq) || hls !== hlsInstance) return
        refreshQualityOptions()
        if (qualityLevel.value >= 0) hlsInstance.currentLevel = qualityLevel.value
        video.playbackRate = playbackRate.value
        startVideo(video, seq)
      })
      hlsInstance.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        if (!isPlaybackCurrent(seq) || hls !== hlsInstance) return
        if (hlsInstance.autoLevelEnabled) qualityLevel.value = -1
        else if (Number.isInteger(data?.level)) qualityLevel.value = data.level
      })
      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (!isPlaybackCurrent(seq) || hls !== hlsInstance) return
        if (!data?.fatal) return
        handlePlaybackError()
      })
    } else {
      if (!isPlaybackCurrent(seq)) return
      video.src = url
      try { video.load() } catch {}
      video.playbackRate = playbackRate.value
      startVideo(video, seq)
    }
  })
}

function accessTitle(result) {
  const req = result?.requirement || {}
  const label = req.label || (req.kind === 'vip' ? 'VIP会员' : '指定会员等级')
  if (result?.code === 'login_required') return `登录后以${label}身份播放`
  if (result?.code === 'vip_required') return `需要${label}才能播放`
  if (result?.code === 'level_required' || result?.code === 'vip_or_level_required') return `需要${label}才能播放`
  return result?.error || '当前影片暂无观看权限'
}

function showAccessBlock(result) {
  stopPlayback()
  const loginRequired = result?.code === 'login_required'
  accessBlock.value = {
    code: result?.code || 'access_denied',
    title: accessTitle(result),
    desc: loginRequired ? '登录后会自动回到当前影片。' : '当前账号权限不足，请切换符合权限的会员等级。',
    actionText: loginRequired ? '登录后播放' : '查看会员',
  }
}

function handleAccessAction() {
  if (accessBlock.value?.code === 'login_required') {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: accessBlock.value.title })
    return
  }
  router.push('/m/me')
}

async function playCurrent() {
  const channel = curChannel.value
  if (!vod.value?.id || !channel?.id) return
  const seq = nextPlaybackSeq()
  resolving.value = true
  accessBlock.value = null
  try {
    const result = await api.resolvePlay({ vodId: vod.value.id, playId: channel.id, epIndex: epIdx.value })
    if (!isPlaybackCurrent(seq)) return
    if (result?.ok && result.url) {
      playDirect(result.url, result.kind || '', seq)
      showControls(1800)
      saveHistory(0)
      return
    }
    if (['login_required', 'vip_required', 'level_required', 'vip_or_level_required'].includes(result?.code)) {
      showAccessBlock(result)
      return
    }
    if (tryNextLine()) return
    showNotice(result?.error || '当前集暂时无法播放')
  } catch {
    if (!isPlaybackCurrent(seq)) return
    if (tryNextLine()) return
    showNotice('解析播放地址失败')
  } finally {
    if (seq === playbackSeq) resolving.value = false
  }
}

function playEp(index) {
  epIdx.value = Math.max(0, Math.min(index, episodes.value.length - 1))
  retryingLine = false
  playCurrent()
}

function selectLine(index) {
  const next = Math.max(0, Math.min(Number(index) || 0, (vod.value.lines || []).length - 1))
  if (lineIdx.value === next && chanIdx.value === 0) return
  lineIdx.value = next
  chanIdx.value = 0
  epIdx.value = Math.max(0, Math.min(epIdx.value, episodes.value.length - 1))
  retryingLine = false
  playCurrent()
}

function selectChannel(index) {
  const next = Math.max(0, Math.min(Number(index) || 0, channelOptions.value.length - 1))
  if (chanIdx.value === next) return
  chanIdx.value = next
  epIdx.value = Math.max(0, Math.min(epIdx.value, episodes.value.length - 1))
  retryingLine = false
  playCurrent()
}

function handlePlaybackError() {
  if (tryNextLine()) return
  showNotice('播放失败，请稍后重试')
}

function playbackSlots() {
  const slots = []
  for (let li = 0; li < (vod.value.lines || []).length; li++) {
    const line = vod.value.lines[li]
    const channels = line?.channels?.length ? line.channels : [line]
    for (let ci = 0; ci < channels.length; ci++) {
      const channel = channels[ci]
      if (!channel || channel.alive === false || !(channel.episodes || [])[epIdx.value]) continue
      slots.push({ li, ci })
    }
  }
  return slots
}

function tryNextLine() {
  if (retryingLine) return false
  const slots = playbackSlots()
  if (slots.length <= 1) return false
  const current = slots.findIndex(slot => slot.li === lineIdx.value && slot.ci === chanIdx.value)
  const next = slots[(Math.max(0, current) + 1) % slots.length]
  if (!next || (next.li === lineIdx.value && next.ci === chanIdx.value)) return false
  retryingLine = true
  lineIdx.value = next.li
  chanIdx.value = next.ci
  showNotice('线路异常，已自动切换')
  const seq = playbackSeq
  window.setTimeout(() => {
    if (!isPlaybackCurrent(seq)) return
    retryingLine = false
    playCurrent()
  }, 120)
  return true
}

function saveHistory(progressOverride = null) {
  if (!user.value || !vod.value?.id || !curChannel.value?.id || !curUrl.value) return
  const video = videoEl.value
  const ep = episodes.value[epIdx.value]
  api.saveHistory({
    vodId: vod.value.id,
    lineId: curChannel.value.id,
    epIndex: epIdx.value,
    epName: ep?.name || '',
    progressSec: progressOverride === null ? Math.floor(Number(video?.currentTime) || 0) : progressOverride,
    durationSec: Math.floor(Number(video?.duration) || 0),
  }).catch(() => {})
}

function saveProgressSoon() {
  if (historyTimer) return
  historyTimer = window.setTimeout(() => {
    historyTimer = 0
    saveHistory()
  }, 15000)
}

async function toggleFollow() {
  if (!user.value) {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后追剧' })
    return
  }
  try {
    if (followed.value) await api.unfollowVod(vod.value.id)
    else await api.followVod(vod.value.id)
    followed.value = !followed.value
    notifySuccess(followed.value ? '已加入追剧' : '已取消追剧')
  } catch {
    notifyWarning('操作失败')
  }
}

async function loadVod(id) {
  const seq = ++loadSeq
  pageActive = true
  loading.value = true
  stopPlayback()
  vod.value = {}
  related.value = []
  accessBlock.value = null
  introOpen.value = false
  followed.value = false
  lineIdx.value = 0
  chanIdx.value = 0
  epIdx.value = 0
  try {
    const data = await api.vod(id)
    if (seq !== loadSeq || !pageActive || !isPlayRoute()) return
    vod.value = data || {}
    await nextTick()
    if (seq !== loadSeq || !pageActive || !isPlayRoute()) return
    if (user.value) {
      try {
        const state = await api.userVodState(id)
        if (seq !== loadSeq || !pageActive || !isPlayRoute()) return
        followed.value = Boolean(state?.followed)
        const h = state?.history
        if (h?.lineId && vod.value.lines?.length) {
          for (let li = 0; li < vod.value.lines.length; li++) {
            const ci = (vod.value.lines[li].channels || []).findIndex(c => c.id === h.lineId)
            if (ci >= 0) {
              lineIdx.value = li
              chanIdx.value = ci
              break
            }
          }
        }
        epIdx.value = Math.max(0, Number(h?.epIndex) || 0)
      } catch {}
    }
    if (vod.value.lines?.length) playCurrent()
    const items = await api.related({ id, type: vod.value.typeName, sub: vod.value.subType, limit: 8 }).catch(() => [])
    if (seq !== loadSeq || !pageActive || !isPlayRoute()) return
    related.value = items
  } catch {
    if (seq !== loadSeq || !pageActive || !isPlayRoute()) return
    showNotice('影片不存在或已下架')
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(() => route.params.id, (id) => {
  if (id) loadVod(id)
})
onMounted(() => {
  pageActive = true
  loadVod(route.params.id)
})
onActivated(() => {
  pageActive = true
  if (isPlayRoute() && route.params.id && !curUrl.value && !loading.value) {
    loadVod(route.params.id)
  }
})
onBeforeUnmount(() => {
  pageActive = false
  loadSeq += 1
  stopPlayback()
  resetLandscape()
  if (noticeTimer) clearTimeout(noticeTimer)
  if (historyTimer) clearTimeout(historyTimer)
  if (controlsTimer) clearTimeout(controlsTimer)
})
onDeactivated(() => {
  pageActive = false
  loadSeq += 1
  stopPlayback()
  resetLandscape()
})
</script>

<style scoped>
.mp {
  min-height: 100dvh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: calc(22px + env(safe-area-inset-bottom));
  background: #fff;
  color: #15171d;
}
.mp-player {
  position: relative;
  aspect-ratio: 16 / 9;
  height: auto;
  min-height: 0;
  margin: 0;
  overflow: hidden;
  background-color: #08090d;
  background-size: cover;
  background-position: center;
}
.mp-player.landscape {
  position: fixed;
  z-index: 1000;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  aspect-ratio: auto;
  --mp-player-top-safe: env(safe-area-inset-top);
}
/* 横片 + 手机处于竖屏且方向锁定未生效时，用 CSS 旋转铺满横向全屏（方向锁成功时视口已为横向，不匹配此规则） */
@media (orientation: portrait) {
  .mp-player.landscape:not(.portrait) {
    inset: auto;
    top: 50%;
    left: 50%;
    width: 100dvh;
    height: 100vw;
    transform: translate(-50%, -50%) rotate(90deg);
    transform-origin: center center;
  }
}
.mp-bg {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,.46);
  backdrop-filter: blur(12px);
}
.mp-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}
.mp-topbar {
  position: absolute;
  z-index: 10;
  top: calc(var(--mp-player-top-safe, 0px) + 6px);
  left: 8px;
  right: 8px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 4px;
  color: #fff;
  pointer-events: none;
}
.mp-topbar strong {
  min-width: 0;
  overflow: hidden;
  color: rgba(255,255,255,.94);
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
  line-height: 1.2;
  text-overflow: ellipsis;
  text-shadow: 0 1px 8px rgba(0,0,0,.72);
  white-space: nowrap;
}
.mp-icon-btn {
  width: 38px;
  height: 38px;
  border: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: transparent;
  pointer-events: auto;
}
.mp-icon-btn svg {
  width: 23px;
  height: 23px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.3;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 1px 6px rgba(0,0,0,.72));
}
.mp-state,
.mp-lock,
.mp-play {
  position: absolute;
  z-index: 6;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
.mp-state {
  display: grid;
  justify-items: center;
  gap: 10px;
  color: rgba(255,255,255,.9);
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
}
.mp-state div {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid rgba(255,255,255,.24);
  border-top-color: #fff;
  animation: mp-spin .8s linear infinite;
}
.mp-play {
  width: 72px;
  height: 72px;
  border: 0;
  background: transparent;
  color: #fff;
}
.mp-play svg {
  width: 60px;
  height: 60px;
  fill: currentColor;
  stroke: none;
  opacity: .8;
  margin-left: 4px;
  filter: drop-shadow(0 8px 18px rgba(0,0,0,.46));
}
.mp-center-controls {
  position: absolute;
  z-index: 9;
  left: 50%;
  top: 50%;
  display: grid;
  grid-template-columns: 46px 62px 46px;
  align-items: center;
  gap: 22px;
  transform: translate(-50%, -50%);
}
.mp-round-btn {
  width: 46px;
  height: 46px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(0,0,0,.26);
  backdrop-filter: blur(8px);
}
.mp-round-btn:disabled {
  opacity: .35;
}
.mp-round-btn svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mp-round-main {
  width: 62px;
  height: 62px;
  background: rgba(0,0,0,.34);
}
.mp-round-main svg {
  width: 34px;
  height: 34px;
  fill: currentColor;
  stroke: none;
  opacity: .86;
}
.mp-bottom-controls {
  position: absolute;
  z-index: 9;
  left: 0;
  right: 0;
  bottom: 0;
  min-height: 54px;
  padding: 12px 8px 8px;
  color: #fff;
  background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.76));
}
.mp-progress-row {
  display: grid;
  grid-template-columns: 30px auto minmax(74px, 1fr) auto repeat(3, 30px);
  align-items: center;
  gap: 5px;
}
.mp-progress-row.compact {
  grid-template-columns: 30px auto minmax(92px, 1fr) auto repeat(2, 30px);
}
.mp-control-btn {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #fff;
  background: transparent;
}
.mp-control-btn:disabled {
  opacity: .35;
}
.mp-control-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.1;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mp-iframe-full {
  margin-left: auto;
}
.mp-range {
  min-width: 0;
  width: 100%;
  height: 20px;
  margin: 0;
  appearance: none;
  background: transparent;
}
.mp-range::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, #f04438 var(--progress), rgba(255,255,255,.34) 0);
}
.mp-range::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4.5px;
  border-radius: 50%;
  background: #fff;
}
.mp-range::-moz-range-track {
  height: 3px;
  border-radius: 999px;
  background: rgba(255,255,255,.34);
}
.mp-range::-moz-range-progress {
  height: 3px;
  border-radius: 999px;
  background: #f04438;
}
.mp-range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 0;
  border-radius: 50%;
  background: #fff;
}
.mp-time {
  flex: 0 0 auto;
  color: rgba(255,255,255,.82);
  font-size: 11px;
  font-weight: var(--small-text-max-weight);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.mp-menu {
  position: absolute;
  right: 10px;
  bottom: 50px;
  width: min(240px, calc(100vw - 20px));
  padding: 10px;
  border-radius: 14px;
  display: grid;
  gap: 10px;
  background: rgba(18,18,22,.9);
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 28px rgba(0,0,0,.28);
}
.mp-menu-speeds {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}
.mp-menu-speeds button,
.mp-menu-cast {
  height: 32px;
  border: 0;
  border-radius: 9px;
  color: rgba(255,255,255,.84);
  background: rgba(255,255,255,.1);
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-menu-speeds button.on {
  color: #fff;
  background: #f04438;
}
.mp-menu-cast {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.mp-menu-cast svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.1;
}
.mp-lock {
  width: min(320px, calc(100vw - 42px));
  padding: 22px;
  border-radius: 18px;
  display: grid;
  gap: 10px;
  color: #fff;
  text-align: center;
  background: rgba(10,10,12,.82);
  backdrop-filter: blur(18px);
}
.mp-lock strong {
  font-size: 17px;
  line-height: 1.35;
}
.mp-lock p {
  margin: 0;
  color: rgba(255,255,255,.72);
  font-size: 13px;
  line-height: 1.5;
}
.mp-lock button {
  height: 40px;
  border: 0;
  border-radius: 999px;
  color: #fff;
  background: #f04438;
  font-weight: 900;
}
.mp-notice {
  position: absolute;
  z-index: 8;
  left: 50%;
  bottom: 56px;
  transform: translateX(-50%);
  max-width: calc(100vw - 40px);
  padding: 8px 12px;
  border-radius: 999px;
  color: #fff;
  background: rgba(0,0,0,.56);
  backdrop-filter: blur(12px);
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
  white-space: nowrap;
}
.mp-seek-preview {
  position: absolute;
  z-index: 9;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 10px 18px;
  border-radius: 12px;
  color: #fff;
  background: rgba(0,0,0,.66);
  backdrop-filter: blur(12px);
  font-size: 16px;
  font-weight: 800;
  letter-spacing: .5px;
  white-space: nowrap;
  pointer-events: none;
}
.mp-info,
.mp-panel {
  margin: 0;
  border-radius: 0;
  background: #fff;
  box-shadow: none;
  border-top: 8px solid #f5f6f8;
}
.mp-info {
  padding: 14px 14px 16px;
  border-top: 0;
}
.mp-title-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.mp-title-row > div {
  min-width: 0;
  flex: 1;
}
.mp-cover {
  width: 58px;
  aspect-ratio: 2 / 3;
  flex: 0 0 58px;
  border-radius: 9px;
  object-fit: cover;
  background: #eceef2;
}
.mp-title-row h1 {
  margin: 0;
  font-size: 18px;
  line-height: 1.22;
  letter-spacing: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mp-title-row p {
  margin: 8px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: #767b86;
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-title-row p span {
  padding: 4px 7px;
  border-radius: 8px;
  background: #f2f3f5;
}
.mp-follow {
  flex: 0 0 auto;
  min-width: 58px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #f04438;
  background: #fff0ed;
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-follow.on {
  color: #fff;
  background: #f04438;
}
.mp-follow svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
}
.mp-intro {
  margin: 10px 0 0;
  color: #535966;
  font-size: 14px;
  line-height: 1.72;
}
.mp-intro.folded {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mp-panel {
  padding: 16px 14px 18px;
}
.mp-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.mp-panel h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1;
}
.mp-panel header span {
  color: #8a8f99;
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-lines-panel {
  padding-bottom: 14px;
}
.mp-line-tabs,
.mp-channel-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.mp-line-tabs::-webkit-scrollbar,
.mp-channel-tabs::-webkit-scrollbar {
  display: none;
}
.mp-channel-tabs {
  margin-top: 10px;
}
.mp-line-tabs button,
.mp-channel-tabs button {
  flex: 0 0 auto;
  max-width: 128px;
  height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 13px;
  color: #4b515c;
  background: #f2f3f5;
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-line-tabs button.on,
.mp-channel-tabs button.on {
  color: #fff;
  background: #15171d;
}
.mp-episode-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.mp-episode-grid button {
  min-width: 0;
  height: 38px;
  border: 0;
  border-radius: 11px;
  color: #4b515c;
  background: #f2f3f5;
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-episode-grid button.on {
  color: #fff;
  background: #f04438;
}
.mp-stills {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 74%;
  gap: 10px;
  overflow-x: auto;
}
.mp-stills img {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 13px;
  object-fit: cover;
  background: #eceef2;
}
.mp-related {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 9px;
}
.mp-related article {
  min-width: 0;
}
.mp-related img {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 12px;
  object-fit: cover;
  background: #eceef2;
}
.mp-related strong {
  display: block;
  margin-top: 7px;
  color: var(--mobile-vod-card-title-color);
  font-size: var(--mobile-vod-card-title-size);
  font-weight: var(--mobile-vod-card-title-weight);
  line-height: var(--mobile-vod-card-title-line);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-related span {
  display: block;
  margin-top: 3px;
  color: #8a8f99;
  font-size: 11px;
  font-weight: var(--small-text-max-weight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@keyframes mp-spin {
  to { transform: rotate(360deg); }
}
</style>
