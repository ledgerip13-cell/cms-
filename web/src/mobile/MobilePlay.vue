<template>
  <main class="mp">
    <section class="mp-player" :style="heroStyle" @click="showControls()">
      <button class="mp-back" type="button" aria-label="返回" @click.stop="goBack">
        <svg viewBox="0 0 24 24" v-html="icon('back')"></svg>
      </button>
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
        @click="showControls()"
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
      <div v-if="curUrl && !accessBlock && controlsVisible" class="mp-controls" :class="{ iframe: mode === 'iframe' }" @click.stop="showControls()">
        <button v-if="mode === 'hls'" class="mp-control-btn mp-toggle" type="button" :aria-label="isPlaying ? '暂停' : '播放'" @click.stop="togglePlayback">
          <svg viewBox="0 0 24 24" v-html="icon(isPlaying ? 'pause' : 'play')"></svg>
        </button>
        <button v-if="mode === 'hls'" class="mp-control-btn" type="button" :aria-label="isMuted ? '取消静音' : '静音'" @click.stop="toggleMuted">
          <svg viewBox="0 0 24 24" v-html="icon(isMuted ? 'volumeOff' : 'volume')"></svg>
        </button>
        <span v-if="mode === 'hls'" class="mp-time">{{ formatTime(currentTime) }}</span>
        <input
          v-if="mode === 'hls'"
          class="mp-range"
          type="range"
          min="0"
          :max="duration || 0"
          step="0.1"
          :value="currentTime"
          :style="{ '--progress': progressPercent }"
          aria-label="播放进度"
          @input="seekVideo"
          @click.stop
        />
        <span v-if="mode === 'hls'" class="mp-time">{{ formatTime(duration) }}</span>
        <button v-if="mode === 'hls'" class="mp-control-btn" type="button" aria-label="投屏" @click.stop="openCast">
          <svg viewBox="0 0 24 24" v-html="icon('cast')"></svg>
        </button>
        <button class="mp-control-btn" type="button" aria-label="全屏播放" @click.stop="enterFullscreen">
          <svg viewBox="0 0 24 24" v-html="icon('expand')"></svg>
        </button>
      </div>
      <div v-if="playNotice" class="mp-notice">{{ playNotice }}</div>
    </section>

    <section v-if="vod.id" class="mp-info">
      <div class="mp-title-row">
        <img class="mp-cover" :src="poster(vod)" :alt="vod.name" @error="hideBrokenImg" />
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
        <img v-for="img in gallery" :key="img.id || img.url" :src="imgUrl(img.url)" :alt="vod.name" loading="lazy" @error="hideBrokenImg" />
      </div>
    </section>

    <section v-if="related.length" class="mp-panel">
      <header>
        <h2>相关推荐</h2>
      </header>
      <div class="mp-related">
        <article v-for="item in related" :key="item.id" @click="router.push(`/m/play/${item.id}`)">
          <img :src="poster(item)" :alt="item.name" loading="lazy" @error="hideBrokenImg" />
          <strong>{{ item.name }}</strong>
          <span>{{ item.typeName || '影片' }}<template v-if="item.year"> · {{ item.year }}</template></span>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup>
import Hls from 'hls.js'
import { computed, nextTick, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
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
const currentTime = ref(0)
const duration = ref(0)
let hls = null
let noticeTimer = 0
let historyTimer = 0
let controlsTimer = 0
let retryingLine = false

const curLine = computed(() => vod.value.lines?.[lineIdx.value] || null)
const curChannel = computed(() => curLine.value?.channels?.[chanIdx.value] || curLine.value)
const episodes = computed(() => curChannel.value?.episodes || [])
const gallery = computed(() => (vod.value.images || []).filter(img => img.type !== 'poster').slice(0, 10))
const progressPercent = computed(() => duration.value ? `${Math.max(0, Math.min(100, (currentTime.value / duration.value) * 100))}%` : '0%')
const heroStyle = computed(() => {
  const url = poster(vod.value)
  return url ? { backgroundImage: `url(${url})` } : {}
})

function poster(row) {
  return imgUrl(row?.officialPic || row?.heroImage || row?.heroPic || row?.pic || row?.localPic || '')
}

function hideBrokenImg(event) {
  if (event?.target) event.target.style.visibility = 'hidden'
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/m')
}

function showNotice(message) {
  playNotice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => { playNotice.value = '' }, 3600)
}

function stopPlayback() {
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
  currentTime.value = 0
  duration.value = 0
  isMuted.value = false
  controlsVisible.value = false
  if (controlsTimer) clearTimeout(controlsTimer)
}

function startVideo(video) {
  if (!video) return
  const play = () => {
    window.requestAnimationFrame(() => {
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
    if (video.readyState >= 1) play()
  }, 700)
}

function showControls(timeout = 2600) {
  if (!curUrl.value || accessBlock.value) return
  controlsVisible.value = true
  if (controlsTimer) clearTimeout(controlsTimer)
  controlsTimer = window.setTimeout(() => {
    controlsVisible.value = false
    controlsTimer = 0
  }, timeout)
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
  showControls()
  try {
    if (video?.webkitShowPlaybackTargetPicker) {
      video.webkitShowPlaybackTargetPicker()
      return
    }
    if (video?.remote?.prompt) {
      await video.remote.prompt()
      return
    }
    showNotice('当前浏览器暂不支持投屏')
  } catch {
    showNotice('投屏未开启')
  }
}

function syncVideoState() {
  const video = videoEl.value
  if (!video) return
  currentTime.value = Number(video.currentTime) || 0
  duration.value = Number.isFinite(video.duration) ? Number(video.duration) || 0 : 0
  isPlaying.value = !video.paused
  isMuted.value = video.muted || Number(video.volume) === 0
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

function seekVideo(event) {
  const video = videoEl.value
  if (!video) return
  const next = Number(event?.target?.value) || 0
  video.currentTime = next
  currentTime.value = next
  showControls(3600)
}

function formatTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  const mins = Math.floor(total / 60)
  const secs = String(total % 60).padStart(2, '0')
  return `${mins}:${secs}`
}

function playDirect(url, kind = '') {
  stopPlayback()
  curUrl.value = url
  mode.value = kind === 'iframe' ? 'iframe' : 'hls'
  if (mode.value === 'iframe') return
  nextTick(() => {
    const video = videoEl.value
    if (!video) return
    if ((kind === 'm3u8' || /\.m3u8(\?|$)/i.test(url)) && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30, capLevelToPlayerSize: true })
      hls.attachMedia(video)
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(url))
      hls.on(Hls.Events.MANIFEST_PARSED, () => startVideo(video))
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data?.fatal) return
        handlePlaybackError()
      })
    } else {
      video.src = url
      try { video.load() } catch {}
      startVideo(video)
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
  resolving.value = true
  accessBlock.value = null
  try {
    const result = await api.resolvePlay({ vodId: vod.value.id, playId: channel.id, epIndex: epIdx.value })
    if (result?.ok && result.url) {
      playDirect(result.url, result.kind || '')
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
    if (tryNextLine()) return
    showNotice('解析播放地址失败')
  } finally {
    resolving.value = false
  }
}

function playEp(index) {
  epIdx.value = Math.max(0, Math.min(index, episodes.value.length - 1))
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
  window.setTimeout(() => {
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
    vod.value = data || {}
    await nextTick()
    if (user.value) {
      try {
        const state = await api.userVodState(id)
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
    related.value = await api.related({ id, type: vod.value.typeName, sub: vod.value.subType, limit: 8 }).catch(() => [])
  } catch {
    showNotice('影片不存在或已下架')
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, (id) => {
  if (id) loadVod(id)
})
onMounted(() => loadVod(route.params.id))
onBeforeUnmount(() => {
  stopPlayback()
  if (noticeTimer) clearTimeout(noticeTimer)
  if (historyTimer) clearTimeout(historyTimer)
  if (controlsTimer) clearTimeout(controlsTimer)
})
onDeactivated(stopPlayback)
</script>

<style scoped>
.mp {
  min-height: 100dvh;
  padding-bottom: calc(22px + env(safe-area-inset-bottom));
  background: #f7f7f8;
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
.mp-back {
  position: absolute;
  z-index: 10;
  top: calc(env(safe-area-inset-top) + 6px);
  left: 6px;
  width: 38px;
  height: 38px;
  border: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: transparent;
}
.mp-back svg {
  width: 23px;
  height: 23px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.3;
  stroke-linecap: round;
  stroke-linejoin: round;
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
  font-weight: 900;
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
.mp-controls {
  position: absolute;
  z-index: 9;
  left: 0;
  right: 0;
  bottom: 0;
  min-height: 48px;
  padding: 8px 8px 8px 10px;
  display: grid;
  grid-template-columns: 34px 34px auto minmax(0, 1fr) auto 34px 34px;
  align-items: center;
  gap: 7px;
  color: #fff;
  background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.72));
}
.mp-controls.iframe {
  grid-template-columns: minmax(0, 1fr) 34px;
}
.mp-controls.iframe .mp-control-btn {
  grid-column: 2;
}
.mp-control-btn {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 9px;
  display: grid;
  place-items: center;
  color: #fff;
  background: transparent;
}
.mp-control-btn svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.1;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mp-toggle svg {
  fill: currentColor;
  stroke: none;
  opacity: .86;
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
  color: rgba(255,255,255,.82);
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
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
  font-weight: 800;
  white-space: nowrap;
}
.mp-info,
.mp-panel {
  margin: 12px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(25, 28, 36, .06);
}
.mp-info {
  padding: 12px;
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
  font-weight: 800;
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
  font-weight: 900;
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
  padding: 14px;
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
  font-weight: 800;
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
  font-weight: 900;
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
  font-size: 13px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-related span {
  display: block;
  margin-top: 3px;
  color: #8a8f99;
  font-size: 11px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@keyframes mp-spin {
  to { transform: rotate(360deg); }
}
</style>
