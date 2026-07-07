<template>
  <div class="page play-wrap" v-if="vod.id">
    <!-- 左：播放器 + 选集 + 信息 -->
    <div class="player-col">
      <div class="player-box" :class="{locked: accessBlock}">
        <div v-if="accessBlock" class="play-lock-bg" :style="playerBackdropStyle"></div>
        <div v-if="accessBlock" class="play-lock">
          <div class="play-lock-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
          </div>
          <div class="play-lock-title">{{ accessBlock.title }}</div>
          <div class="play-lock-desc">{{ accessBlock.desc }}</div>
          <button class="play-lock-btn" type="button" @click="handleAccessAction">{{ accessBlock.actionText }}</button>
        </div>
        <video v-show="!accessBlock && mode==='hls'" ref="videoEl" controls autoplay playsinline webkit-playsinline x-webkit-airplay="allow" airplay="allow" class="video" @timeupdate="onVideoTimeUpdate" @error="onVideoError">
          <track v-for="(s,i) in subtitles" :key="s.url" kind="subtitles" :src="s.url" :srclang="s.lang" :label="s.label" :default="i===0" />
        </video>
        <button v-if="!accessBlock && mode==='hls' && subtitles.length" class="sub-toggle"
          :class="{on: subSyncOpen}" title="字幕设置" @click.stop="subSyncOpen = !subSyncOpen">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 15h3M7 11h6M14 15h3" stroke-linecap="round"/></svg>
        </button>
        <div v-if="!accessBlock && mode==='hls' && subtitles.length && subSyncOpen" class="sub-sync" @click.stop>
          <span class="ss-tag">字幕同步</span>
          <button class="ss-btn" @click="adjustSubtitle(-0.5)" title="字幕提前0.5秒">−0.5s</button>
          <span class="ss-val">{{ (subtitleOffset>0?'+':'') + subtitleOffset.toFixed(1) }}s</span>
          <button class="ss-btn" @click="adjustSubtitle(0.5)" title="字幕延后0.5秒">+0.5s</button>
          <button class="ss-reset" v-if="subtitleOffset!==0" @click="resetSubtitle">复位</button>
        </div>
        <iframe v-if="!accessBlock && mode==='iframe'" :src="curUrl" class="video" frameborder="0"
          allowfullscreen allow="autoplay; fullscreen"></iframe>
        <div v-if="!accessBlock && mode==='iframe'" class="iframe-note">该源为加密分享页，解析未命中，已回退内嵌播放器</div>
        <div v-if="!accessBlock && playNotice" class="play-notice">{{ playNotice }}</div>
        <div v-if="!accessBlock && resolving" class="video-ph">正在解析播放地址...</div>
      </div>

      <!-- 标题信息条 -->
      <div class="pv-head">
        <div class="pv-poster" v-if="vod.officialPic || vod.pic || vod.localPic">
          <img :src="pic(vod)" :alt="vod.name" @error="onErr($event, fallbackPic(vod))" />
        </div>
        <div class="pv-meta">
          <h1 class="pv-title">{{ vod.name }}
            <span v-if="vod.rating" class="db-rating">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.6z"/></svg>
              {{ vod.rating }}
            </span>
          </h1>
          <div class="pv-tags">
            <span class="t">{{ vod.year || '—' }}</span>
            <span class="t">{{ vod.typeName || '未分类' }}</span>
            <span class="t" v-if="vod.area">{{ vod.area }}</span>
            <span class="t accent">{{ vod.lines.length }} 条线路</span>
          </div>
          <p class="pv-line update-line" v-if="vod.remarks">更新：{{ vod.remarks }}</p>
          <div class="people-line" v-if="directors.length">
            <span class="people-label">导演</span>
            <button v-for="p in directors" :key="'d'+p.id" class="person-chip" @click="searchPerson(p.person.name)">
              <img v-if="p.person.avatar" :src="imgUrl(p.person.avatar)" alt="" @error="onErr" />
              {{ p.person.name }}
            </button>
          </div>
          <p class="pv-line credit-line" v-else-if="vod.director">导演：{{ vod.director }}</p>
          <div class="people-line" v-if="actors.length">
            <span class="people-label">主演</span>
            <button v-for="p in actors" :key="'a'+p.id" class="person-chip" @click="searchPerson(p.person.name)">
              <img v-if="p.person.avatar" :src="imgUrl(p.person.avatar)" alt="" @error="onErr" />
              {{ p.person.name }}
            </button>
          </div>
          <p class="pv-line credit-line" v-else-if="vod.actor">主演：{{ vod.actor }}</p>
          <div class="pv-intro" v-if="vod.officialIntro || vod.blurb">
            <p :class="{fold: !introOpen}">{{ vod.officialIntro || vod.blurb }}</p>
            <span class="intro-toggle" @click="introOpen=!introOpen">{{ introOpen ? '收起' : '展开' }}</span>
          </div>
          <div class="still-section" v-if="gallery.length">
            <div class="still-head">
              <span>剧照</span>
              <em>{{ gallery.length }} 张</em>
            </div>
            <div class="still-strip">
              <div v-for="(img, i) in gallery" :key="img.id" class="still" :class="{hero: img.isHero}" @click="openGallery(i)">
                <img :src="imgUrl(img.url)" :alt="vod.name" loading="lazy" @error="onErr" />
              </div>
            </div>
          </div>
          <div class="pv-actions">
            <button class="mini-btn primary" @click="toggleFollow">{{ followed ? '已追剧' : '追剧' }}</button>
            <button class="mini-btn" v-if="user" @click="router.push('/me')">我的片单</button>
          </div>
        </div>
      </div>

      <div class="now-playing" v-if="curEp">
        正在播放：<b>{{ vod.name }}</b> · {{ curLine?.sourceName }}<span v-if="curLine?.channels?.length>1"> · {{ chanIdx===0?'推荐通道':'线路'+(chanIdx+1) }}</span> · {{ curEp.name }}
      </div>

      <!-- 线路切换（按源分组，不因多channel而膨胀） -->
      <div class="lines-bar">
        <span class="lbl">线路</span>
        <span v-for="(l,i) in vod.lines" :key="l.id" class="line-btn" :class="{on: lineIdx===i}"
          @click="switchLine(i)">{{ l.sourceName }} <em>{{ l.epCount }}集</em></span>
      </div>

      <!-- 备用通道：仅当前选中的源有≥2条flag才显示，单flag时完全不渲染(零侵入) -->
      <div class="channels-bar" v-if="curLine && curLine.channels && curLine.channels.length > 1">
        <span class="lbl">通道</span>
        <span v-for="(c,i) in curLine.channels" :key="c.id" class="chan-btn"
          :class="{on: chanIdx===i, dead: !c.alive}" @click="c.alive && switchChannel(i)">
          {{ i===0 ? '推荐' : ('线路'+(i+1)) }}
          <em v-if="!c.alive">失效</em>
        </span>
      </div>

      <!-- 剧集列表 -->
      <div class="eps-box" v-if="curChannel">
        <div class="eps-head">选集 <span>{{ curChannel.episodes.length }} 集</span></div>
        <div class="eps-grid">
          <span v-for="(e,i) in curChannel.episodes" :key="i" class="ep"
            :class="{on: epIdx===i}" @click="playEp(i)">{{ e.name }}</span>
        </div>
      </div>
    </div>

    <!-- 右：相关推荐 -->
    <aside class="rec-col">
      <div class="rec-head">相关推荐</div>
      <div v-if="related.length" class="rec-list">
        <div v-for="r in related" :key="r.id" class="rec-item" @click="goPlay(r.id)">
          <div class="rec-poster">
            <img v-if="r.officialPic || r.pic || r.localPic" :src="pic(r)" :alt="r.name" loading="lazy" @error="onErr($event, fallbackPic(r))" />
            <div v-else class="noimg">无封面</div>
            <span v-if="r.rating" class="rec-score">{{ r.rating }}</span>
          </div>
          <div class="rec-info">
            <div class="rec-name">{{ r.name }}</div>
            <div class="rec-sub">{{ r.typeName || '未分类' }} · {{ r.year || '—' }}</div>
            <div class="rec-sub" v-if="r.remarks">{{ r.remarks }}</div>
          </div>
        </div>
      </div>
      <div v-else class="rec-empty">暂无推荐</div>
    </aside>

    <div v-if="galleryOpen && activeGallery" class="gallery-viewer" @click="closeGallery">
      <button class="gv-close" type="button" @click.stop="closeGallery" aria-label="关闭">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <button class="gv-nav prev" type="button" @click.stop="prevGallery" aria-label="上一张">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <img :src="imgUrl(activeGallery.url)" :alt="vod.name" @click.stop />
      <button class="gv-nav next" type="button" @click.stop="nextGallery" aria-label="下一张">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      <div class="gv-count">{{ galleryIdx + 1 }} / {{ gallery.length }}</div>
    </div>
  </div>
  <div v-else-if="notFound" class="page not-found">
    <div class="nf-box">
      <div class="nf-icon">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M9 9l4 4M13 9l-4 4"/>
        </svg>
      </div>
      <div class="nf-title">该影片不存在或已下架</div>
      <div class="nf-desc">可能链接有误、影片已被移除，或临时维护中</div>
      <div class="nf-actions">
        <button class="nf-btn primary" @click="$router.push('/')">返回首页</button>
        <button class="nf-btn" @click="loadVod(route.params.id)">重新加载</button>
      </div>
    </div>
  </div>
  <div v-else class="page play-wrap">
    <div class="player-col">
      <div class="sk" style="aspect-ratio:16/9;border-radius:14px"></div>
      <div class="sk" style="height:120px;border-radius:14px;margin:18px 0"></div>
      <div class="sk" style="height:56px;border-radius:12px;margin:16px 0"></div>
      <div class="sk" style="height:200px;border-radius:12px"></div>
    </div>
    <aside class="rec-col">
      <div class="sk" style="width:100px;height:18px;margin-bottom:16px"></div>
      <div v-for="i in 6" :key="i" style="display:flex;gap:11px;margin-bottom:14px">
        <div class="sk" style="width:68px;aspect-ratio:2/3;flex-shrink:0;border-radius:8px"></div>
        <div style="flex:1"><div class="sk" style="height:14px"></div><div class="sk" style="height:11px;width:60%;margin-top:8px"></div></div>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Hls from 'hls.js'
import { api, imgUrl } from '../api'
import { openAuthDialog } from '../authDialog'
import { apiErrorMessage, notifyError, notifySuccess } from '../feedback'
import { currentUser } from '../userStore'
defineOptions({ name: 'Play' })

const route = useRoute()
const router = useRouter()
const vod = ref({})
const notFound = ref(false)
const related = ref([])
const introOpen = ref(false)
const galleryOpen = ref(false)
const galleryIdx = ref(0)
const videoEl = ref(null)
const user = currentUser
const followed = ref(false)
const lineIdx = ref(0); const chanIdx = ref(0); const epIdx = ref(0); const curUrl = ref(''); const mode = ref('hls'); const resolving = ref(false)
const subtitles = ref([]); const subtitleOffset = ref(0); const subSyncOpen = ref(false)
const playNotice = ref('')
const accessBlock = ref(null)
const cleanFallbackUrl = ref('')
let hls = null
let hlsRecoverCount = 0
let selfHealTried = false // 自愈：sign 过期(403)时重解析一次拿新地址
let pendingSeekSec = 0
let lastHistorySaveAt = 0
let playNoticeTimer = 0
let playWatchdogTimer = 0

function isDirectM3u8(url) { return /\.m3u8(\?|$)/i.test(url) }
function onErr(e, fallback = '') {
  const img = e?.target
  if (fallback && img && img.dataset.localFallbackApplied !== '1' && img.getAttribute('src') !== fallback) {
    img.dataset.localFallbackApplied = '1'
    img.src = fallback
    return
  }
  if (img) img.style.visibility='hidden'
}
function pic(v) { return imgUrl(v.officialPic || v.pic || v.localPic || '') }
function fallbackPic(v) { return imgUrl(v.localPic || '') }
function goPlay(id) { router.push('/play/'+id) }
function searchPerson(name) { if (name) router.push({ path: '/', query: { kw: name } }) }
function showPlayNotice(message) {
  playNotice.value = message
  if (playNoticeTimer) clearTimeout(playNoticeTimer)
  playNoticeTimer = window.setTimeout(() => { playNotice.value = '' }, 5200)
}
function clearPlayWatchdog() {
  if (playWatchdogTimer) clearTimeout(playWatchdogTimer)
  playWatchdogTimer = 0
}
function schedulePlayWatchdog(url) {
  clearPlayWatchdog()
  playWatchdogTimer = window.setTimeout(() => {
    const video = videoEl.value
    if (curUrl.value !== url || mode.value !== 'hls' || Number(video?.readyState || 0) > 0) return
    showPlayNotice('连接超时或被当前网络拦截，已尝试切换线路')
    if (tryCleanFallback(url)) return
    tryNextPlayback()
  }, 9000)
}
function describePlaybackError(data) {
  const code = Number(data?.response?.code || 0)
  if (code === 403 || code === 451) return '限制当前地区或网络访问，已尝试切换线路'
  if (code === 404 || code === 410) return '播放地址已失效，已尝试切换线路'
  if (String(data?.details || '').toLowerCase().includes('timeout')) return '连接超时或被当前网络拦截，已尝试切换线路'
  return '当前网络无法访问，已尝试切换线路'
}
function onVideoError() {
  if (!curUrl.value) return
  showPlayNotice('播放失败，请切换线路或稍后重试')
}
function tryCleanFallback(failedUrl) {
  if (!cleanFallbackUrl.value || failedUrl !== curUrl.value) return false
  const raw = cleanFallbackUrl.value
  cleanFallbackUrl.value = ''
  showPlayNotice('清洗线路播放失败，已回退原始线路')
  playDirectUrl(raw, 'm3u8')
  return true
}

const curLine = computed(() => vod.value.lines?.[lineIdx.value])
const actors = computed(() => (vod.value.people || []).filter(p => p.role === 'actor').slice(0, 12))
const directors = computed(() => (vod.value.people || []).filter(p => p.role === 'director').slice(0, 6))
const gallery = computed(() => (vod.value.images || []).filter(img => img.type !== 'poster').slice(0, 8))
const activeGallery = computed(() => gallery.value[galleryIdx.value])
// 当前选中的具体通道(flag)：有channels则取chanIdx对应项，否则回退用line本身(兼容旧数据)
const curChannel = computed(() => curLine.value?.channels?.[chanIdx.value] || curLine.value)
const curEp = computed(() => curChannel.value?.episodes?.[epIdx.value])
const playerBackdropStyle = computed(() => {
  const url = pic(vod.value)
  return url ? { backgroundImage: `url(${url})` } : {}
})

function stopPlayback() {
  clearPlayWatchdog()
  if (hls) { hls.destroy(); hls = null }
  const video = videoEl.value
  if (video) {
    try { video.pause() } catch {}
    video.removeAttribute('src')
    try { video.load() } catch {}
  }
  curUrl.value = ''
  cleanFallbackUrl.value = ''
}

function accessTitle(result) {
  const req = result?.requirement || {}
  const label = req.label || (req.kind === 'vip' ? 'VIP会员' : '指定会员等级')
  if (result?.code === 'login_required') {
    if (req.kind === 'vip') return `当前影片需要登录后以${label}身份播放`
    if (req.kind === 'level' || req.kind === 'vip_or_level') return `当前影片需要登录后以${label}身份播放`
    return '当前影片需要登录后才能播放'
  }
  if (result?.code === 'vip_required') return `当前影片需要${label}才能播放`
  if (result?.code === 'level_required' || result?.code === 'vip_or_level_required') return `当前影片需要${label}才能播放`
  return result?.error || '当前影片暂无观看权限'
}

function showAccessBlock(result) {
  stopPlayback()
  const loginRequired = result?.code === 'login_required'
  accessBlock.value = {
    code: result?.code || 'access_denied',
    title: accessTitle(result),
    desc: loginRequired ? '登录成功后会自动重新尝试播放当前集。' : '当前账号权限不足，请切换符合权限的会员等级后再播放。',
    actionText: loginRequired ? '登录后播放' : '查看我的会员',
    retryAfterLogin: loginRequired,
  }
}

function handleAccessAction() {
  if (accessBlock.value?.code === 'login_required') {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: accessBlock.value.title })
    return
  }
  router.push('/me')
}

function playHls(url) {
  mode.value = 'hls'
  curUrl.value = url
  const video = videoEl.value
  if (hls) { hls.destroy(); hls = null }
  hlsRecoverCount = 0
  const seekToPending = () => {
    if (!video || pendingSeekSec < 8) return
    const duration = Number(video.duration) || 0
    if (duration && pendingSeekSec >= duration - 6) return
    try { video.currentTime = pendingSeekSec } catch {}
  }
  video?.addEventListener('loadedmetadata', seekToPending, { once: true })
  schedulePlayWatchdog(url)
  if (Hls.isSupported()) {
    hls = new Hls({ maxBufferLength: 30 })
    hls.loadSource(url)
    hls.attachMedia(video)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      clearPlayWatchdog()
      seekToPending()
      video.play().catch(()=>{})
    })
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data?.fatal || !hls) return
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsRecoverCount < 2) {
        hlsRecoverCount++
        hls.startLoad()
        return
      }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsRecoverCount < 4) {
        hlsRecoverCount++
        hls.recoverMediaError()
        return
      }
      clearPlayWatchdog()
      if (trySelfHeal()) return // 先尝试重解析拿新 sign(治 sign 过期/403)
      showPlayNotice(describePlaybackError(data))
      if (tryCleanFallback(url)) return
      tryNextPlayback()
    })
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url; video.play().catch(()=>{})
  }
}

function isIcloudUrl(u) { return typeof u === 'string' && u.includes('/iclouddrive/') }
async function waitForServiceWorker(timeoutMs = 4000) {
  if (!('serviceWorker' in navigator)) return
  try {
    // 已有 controller 控制当前页面则无需等待
    if (navigator.serviceWorker.controller) return
    await Promise.race([
      navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  } catch { /* SW 不可用时不阻塞播放，交给后续错误处理分支 */ }
}

function playDirectUrl(url, kind = '') {
  if (hls) { hls.destroy(); hls = null }
  if (kind === 'm3u8' || isDirectM3u8(url)) { playHls(url); return }
  mode.value = 'hls'
  curUrl.value = url
  const video = videoEl.value
  if (!video) return
  video.src = url
  video.play().catch(()=>{})
}

// 字幕轨（iCloud 系源经 resolve 返回同源代理地址）
// 同步面板是完全独立的设置面板：默认收起，只有用户点击字幕设置图标才展开，
// 与原生 video 的 CC 开关状态完全解耦（浏览器原生菜单无法嵌入自定义 UI，只能做独立入口）
function applySubtitleOffset() {
  const video = videoEl.value; if (!video) return
  const tracks = video.textTracks || []
  for (let i = 0; i < tracks.length; i++) {
    const tr = tracks[i]; if (tr.kind !== 'subtitles' || !tr.cues) continue
    for (let j = 0; j < tr.cues.length; j++) {
      const cue = tr.cues[j]
      if (cue._o0 === undefined) { cue._o0 = cue.startTime; cue._o1 = cue.endTime }
      cue.startTime = Math.max(0, cue._o0 + subtitleOffset.value)
      cue.endTime = Math.max(0, cue._o1 + subtitleOffset.value)
    }
  }
}
function adjustSubtitle(d) { subtitleOffset.value = Math.round((subtitleOffset.value + d) * 10) / 10; applySubtitleOffset() }
function resetSubtitle() { subtitleOffset.value = 0; applySubtitleOffset() }

function trySelfHeal() {
  if (selfHealTried) return false
  selfHealTried = true
  playResolvedEp(epIdx.value, { fresh: true })
  return true
}

async function playResolvedEp(i, opts = {}) {
  const channel = curChannel.value
  if (!channel?.id || !vod.value?.id) return
  if (!opts.fresh) selfHealTried = false // 正常起播重置自愈标记
  accessBlock.value = null
  subtitles.value = []; subtitleOffset.value = 0
  resolving.value = true
  try {
    const r = await api.resolvePlay({ vodId: vod.value.id, playId: channel.id, epIndex: i, ...(opts.fresh ? { fresh: 1 } : {}) })
    if (r.ok && r.url && (r.kind === 'm3u8' || r.kind === 'mp4' || /\.m3u8(\?|$)/i.test(r.url))) {
      cleanFallbackUrl.value = r.fallbackUrl || ''
      subtitles.value = Array.isArray(r.subtitles) ? r.subtitles : []
      subSyncOpen.value = false
      // iCloud 链必须等 Service Worker 接管页面后才能发起请求（否则请求会绕过 SW 直接打到 iCloud 拿到网页而非视频）；
      // 首次访问时 App.vue 的 SW 注册与本组件加载存在竞态，实测确认过这个时序问题。
      if (isIcloudUrl(r.url)) await waitForServiceWorker()
      playDirectUrl(r.url, r.kind)
      saveWatchHistory(i, pendingSeekSec || 0)
      return
    }
    if (['login_required', 'vip_required', 'level_required', 'vip_or_level_required'].includes(r.code)) {
      showAccessBlock(r)
      return
    }
  } catch {}
  finally { resolving.value = false }
  cleanFallbackUrl.value = ''
  tryNextPlayback()
}

function tryNextPlayback() {
  const lines = vod.value.lines || []
  const slots = []
  lines.forEach((line, li) => {
    const channels = line.channels?.length ? line.channels : [line]
    channels.forEach((channel, ci) => {
      slots.push({ li, ci, channel })
    })
  })
  if (slots.length <= 1) return
  const current = slots.findIndex(s => s.li === lineIdx.value && s.ci === chanIdx.value)
  const start = current < 0 ? -1 : current
  for (let step = 1; step < slots.length; step++) {
    const next = slots[(start + step) % slots.length]
    if (!next?.channel || next.channel.alive === false || !next.channel.episodes?.length) continue
    lineIdx.value = next.li
    chanIdx.value = next.ci
    const n = Math.min(epIdx.value, next.channel.episodes.length - 1)
    playEp(n < 0 ? 0 : n)
    return
  }
}

function saveWatchHistory(i, progressOverride = null) {
  if (!user.value || !vod.value?.id || !curUrl.value) return
  const ep = curChannel.value?.episodes?.[i]
  const video = videoEl.value
  const progressSec = progressOverride === null ? Math.floor(Number(video?.currentTime) || 0) : progressOverride
  const durationSec = Math.floor(Number(video?.duration) || 0)
  api.saveHistory({
    vodId: vod.value.id,
    lineId: curChannel.value?.id,
    epIndex: i,
    epName: ep?.name || '',
    progressSec,
    durationSec,
  }).catch(() => {})
}
function onVideoTimeUpdate() {
  if (!user.value || mode.value !== 'hls') return
  const now = Date.now()
  if (now - lastHistorySaveAt < 15000) return
  lastHistorySaveAt = now
  saveWatchHistory(epIdx.value)
}
function playEp(i, opts = {}) {
  epIdx.value = i
  cleanFallbackUrl.value = ''
  if (!opts.keepResume) pendingSeekSec = 0
  playResolvedEp(i)
}
function switchLine(i) {
  lineIdx.value = i; chanIdx.value = 0
  const n = Math.min(epIdx.value, (curChannel.value?.episodes?.length || 1) - 1)
  playEp(n < 0 ? 0 : n)
}
function switchChannel(i) {
  chanIdx.value = i
  const n = Math.min(epIdx.value, (curLine.value.channels[i]?.episodes?.length || 1) - 1)
  playEp(n < 0 ? 0 : n)
}

async function loadVod(id) {
  introOpen.value = false; lineIdx.value = 0; chanIdx.value = 0; epIdx.value = 0; curUrl.value = ''
  galleryOpen.value = false; galleryIdx.value = 0
  notFound.value = false; vod.value = {}; followed.value = false; accessBlock.value = null
  try {
    vod.value = await api.vod(id)
  } catch (e) {
    // 404 或其他请求异常：降级为友好提示，不再永久卡骨架屏
    notFound.value = true; return
  }
  if (!vod.value?.id) { notFound.value = true; return }
  await nextTick()
  if (user.value) {
    try {
      const state = await api.userVodState(id)
      followed.value = state.followed
      const h = state.history
      if (h?.lineId && vod.value.lines?.length) {
        for (let li = 0; li < vod.value.lines.length; li++) {
          const channels = vod.value.lines[li].channels || []
          const ci = channels.findIndex(c => c.id === h.lineId)
          if (ci >= 0) { lineIdx.value = li; chanIdx.value = ci; break }
        }
      }
      epIdx.value = Math.max(0, Number(h?.epIndex) || 0)
      pendingSeekSec = Math.max(0, Number(h?.progressSec) || 0)
    } catch {}
  }
  if (vod.value.lines?.length) playEp(Math.min(epIdx.value, (curChannel.value?.episodes?.length || 1) - 1), { keepResume: true })
  // 相关推荐
  try {
    related.value = await api.related({ id, type: vod.value.typeName, sub: vod.value.subType, limit: 12 })
  } catch { related.value = [] }
  window.scrollTo({ top: 0 })
}

function openGallery(i) {
  galleryIdx.value = i
  galleryOpen.value = true
}
function closeGallery() { galleryOpen.value = false }
function prevGallery() {
  if (!gallery.value.length) return
  galleryIdx.value = (galleryIdx.value - 1 + gallery.value.length) % gallery.value.length
}
function nextGallery() {
  if (!gallery.value.length) return
  galleryIdx.value = (galleryIdx.value + 1) % gallery.value.length
}

async function toggleFollow() {
  if (!vod.value?.id) return
  if (!user.value) {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后可追剧和同步片单' })
    return
  }
  try {
    const r = followed.value ? await api.unfollowVod(vod.value.id) : await api.followVod(vod.value.id)
    followed.value = r.followed
    notifySuccess(r.followed ? '已加入追剧' : '已取消追剧')
  } catch (error) {
    notifyError(apiErrorMessage(error, '操作失败'))
  }
}

// 键盘快捷键（桌面/平板）：仅在非输入态 + 视频已加载时生效，不影响手机触控
function onPlayerKeydown(e) {
  const video = videoEl.value
  if (!video || mode.value !== 'hls' || accessBlock.value) return
  const el = document.activeElement
  const tag = (el?.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return
  switch (e.key) {
    case ' ': case 'k': e.preventDefault(); video.paused ? video.play().catch(()=>{}) : video.pause(); break
    case 'f': e.preventDefault(); if (document.fullscreenElement) document.exitFullscreen?.(); else (video.closest('.player-box') || video).requestFullscreen?.(); break
    case 'ArrowLeft': e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); break
    case 'ArrowRight': e.preventDefault(); video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 5); break
    case 'ArrowUp': e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); break
    case 'ArrowDown': e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); break
    case 'm': e.preventDefault(); video.muted = !video.muted; break
  }
}

function onGlobalClickCloseSubSync() { subSyncOpen.value = false }
onMounted(() => { loadVod(route.params.id); window.addEventListener('keydown', onPlayerKeydown); document.addEventListener('click', onGlobalClickCloseSubSync) })
watch(() => route.params.id, (id) => { if (id) loadVod(id) })
watch(user, (next) => {
  if (next && accessBlock.value?.retryAfterLogin) playEp(epIdx.value, { keepResume: true })
})
onBeforeUnmount(() => {
  if (curUrl.value) saveWatchHistory(epIdx.value)
  if (hls) hls.destroy()
  clearPlayWatchdog()
  window.removeEventListener('keydown', onPlayerKeydown)
  document.removeEventListener('click', onGlobalClickCloseSubSync)
})
</script>

<style scoped>
.play-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 316px; gap: 26px; }
.player-col { min-width: 0; }
.player-box { position: relative; background: #000; border-radius: 14px; overflow: hidden; aspect-ratio: 16/9; }
.player-box.locked { background: #11131b; }
.video { width: 100%; height: 100%; background: #000; object-fit: contain; }
.sub-toggle { position: absolute; left: 12px; top: 12px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.28); background: rgba(0,0,0,.5); color: rgba(255,255,255,.85); border-radius: 8px; cursor: pointer; z-index: 6; }
.sub-toggle:hover, .sub-toggle.on { background: rgba(0,0,0,.72); color: #fff; }
.sub-sync { position: absolute; left: 12px; top: 50px; display: flex; align-items: center; gap: 6px; padding: 5px 8px; background: rgba(0,0,0,.72); backdrop-filter: blur(8px); border-radius: 18px; font-size: 12px; z-index: 6; pointer-events: auto; }
.sub-sync .ss-tag { color: rgba(255,255,255,.72); margin-right: 2px; }
.sub-sync .ss-val { color: #fff; min-width: 40px; text-align: center; }
.sub-sync .ss-btn, .sub-sync .ss-reset { border: 1px solid rgba(255,255,255,.28); background: transparent; color: #fff; border-radius: 6px; padding: 3px 8px; cursor: pointer; font-size: 12px; }
.sub-sync .ss-btn:hover, .sub-sync .ss-reset:hover { background: rgba(255,255,255,.16); }
.video-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #667; pointer-events: none; }
.play-lock-bg { position: absolute; inset: 0; background-size: cover; background-position: center; filter: blur(16px) brightness(.42) saturate(1.08);
  transform: scale(1.08); opacity: .88; }
.play-lock-bg::after { content: ''; position: absolute; inset: 0; background:
  radial-gradient(circle at 50% 42%, rgba(20,22,29,.5), rgba(6,7,10,.9) 70%),
  linear-gradient(0deg, rgba(0,0,0,.78), rgba(0,0,0,.18)); }
.play-lock { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 24px; text-align: center; }
.play-lock-icon { width: 54px; height: 54px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.14); color: #fff; backdrop-filter: blur(8px); }
.play-lock-icon svg { width: 27px; height: 27px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.play-lock-title { max-width: 680px; color: #fff; font-size: 22px; line-height: 1.35; font-weight: 900; overflow-wrap: anywhere; }
.play-lock-desc { max-width: 520px; color: #c4cad6; font-size: 13.5px; line-height: 1.7; }
.play-lock-btn { height: 42px; padding: 0 24px; border: 0; border-radius: 11px; background: var(--btn-primary-bg);
  color: var(--btn-primary-text); cursor: pointer; font-size: 14px; font-weight: 900; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.play-lock-btn:hover { filter: brightness(1.06); }
.play-notice { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 3;
  border: 1px solid rgba(255,255,255,.18); border-radius: 10px; background: rgba(8,10,15,.82);
  color: #f6d7db; font-size: 13px; line-height: 1.45; padding: 9px 12px; backdrop-filter: blur(10px);
  pointer-events: none; }
.iframe-note { position: absolute; left: 0; right: 0; bottom: 0; font-size: 12px; color: #cbd3e0;
  background: rgba(0,0,0,.6); padding: 6px 12px; text-align: center; pointer-events: none; }

/* 影片不存在 */
.not-found { display: flex; align-items: center; justify-content: center; min-height: 60vh; }
.nf-box { text-align: center; max-width: 360px; }
.nf-icon { color: var(--muted); margin-bottom: 20px; display: flex; justify-content: center; }
.nf-title { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
.nf-desc { font-size: 13px; color: var(--muted); margin-bottom: 26px; }
.nf-actions { display: flex; gap: 12px; justify-content: center; }
.nf-btn { padding: 10px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
  border: 1px solid var(--line); background: var(--card); color: var(--text); transition: .15s; }
.nf-btn:hover { border-color: var(--btn-hover-border); color: var(--btn-hover-text); }
.nf-btn.primary { background: var(--btn-primary-bg); border-color: transparent; color: var(--btn-primary-text); }
.nf-btn.primary:hover { opacity: .9; color: #fff; }

/* 标题信息条 */
.pv-head { display: flex; align-items: flex-start; gap: 16px; margin: 18px 0; padding: 16px; background: var(--card);
  border: 1px solid var(--line); border-radius: 14px; }
.pv-poster { width: 108px; flex-shrink: 0; align-self: flex-start; aspect-ratio: 2/3; border-radius: 10px; overflow: hidden; }
.pv-poster img { width: 100%; height: 100%; object-fit: cover; }
.pv-meta { min-width: 0; flex: 1; }
.pv-title { font-size: 22px; margin-bottom: 10px; }
.db-rating { display: inline-flex; align-items: center; gap: 4px; font-size: 15px; color: var(--gold); font-weight: 800; margin-left: 10px; }
.db-rating svg { width: 16px; height: 16px; flex-shrink: 0; }
.pv-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.pv-tags .t { font-size: 12px; padding: 3px 10px; background: var(--bg2); border-radius: 6px; color: var(--muted); }
.pv-tags .t.accent { background: var(--play-line-active-bg); color: var(--play-line-active-text); }
.pv-line { font-size: 13px; color: var(--muted); margin: 5px 0; line-height: 1.6;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.people-line { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin: 8px 0; }
.people-label { color: var(--muted); font-size: 12px; margin-right: 2px; }
.person-chip { display: inline-flex; align-items: center; gap: 5px; min-height: 25px; max-width: 112px; padding: 3px 8px;
  border-radius: 999px; border: 1px solid var(--line); background: var(--bg2); color: var(--text);
  font-size: 12px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.person-chip:hover { border-color: var(--play-link-text); color: #fff; }
.person-chip img { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.pv-intro { margin-top: 10px; }
.pv-intro p { font-size: 13px; color: #9aa4b7; line-height: 1.75; }
.pv-intro p.fold { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.intro-toggle { font-size: 12px; color: var(--play-link-text); cursor: pointer; margin-top: 4px; display: inline-block; }
.still-section { margin-top: 14px; }
.still-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 9px; }
.still-head span { font-size: 14px; font-weight: 800; color: var(--text); }
.still-head em { font-style: normal; font-size: 12px; color: var(--muted); }
.still-strip { display: flex; gap: 10px; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity;
  padding: 0 2px 8px; scrollbar-width: thin; scroll-behavior: smooth; -webkit-overflow-scrolling: touch; }
.still { flex: 0 0 148px; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; background: #0f1420;
  border: 1px solid var(--line); cursor: zoom-in; scroll-snap-align: start; }
.still.hero { border-color: var(--gallery-active-border); }
.still img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gallery-viewer { position: fixed; inset: 0; z-index: 120; background: rgba(0,0,0,.86);
  display: flex; align-items: center; justify-content: center; padding: 54px 70px; }
.gallery-viewer img { max-width: min(1180px, 100%); max-height: 82vh; object-fit: contain; border-radius: 10px; box-shadow: 0 18px 60px rgba(0,0,0,.65); }
.gv-close, .gv-nav { position: fixed; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255,255,255,.18); background: rgba(20,22,29,.72);
  color: #fff; cursor: pointer; backdrop-filter: blur(10px); line-height: 1; padding: 0; }
.gv-close svg, .gv-nav svg { display: block; width: 24px; height: 24px; stroke: currentColor; stroke-width: 2.2;
  stroke-linecap: round; stroke-linejoin: round; fill: none; }
.gv-close { top: 24px; right: 28px; width: 42px; height: 42px; border-radius: 50%; }
.gv-nav { top: 50%; transform: translateY(-50%); width: 48px; height: 64px; border-radius: 12px; }
.gv-nav svg { width: 30px; height: 30px; }
.gv-nav.prev { left: 24px; }
.gv-nav.next { right: 24px; }
.gv-count { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); color: #dfe5ef;
  font-size: 13px; background: rgba(20,22,29,.72); border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: 7px 14px; }

.now-playing { margin: 14px 0; font-size: 14px; color: var(--muted); }
.now-playing b { color: var(--text); }
.lines-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 16px 0;
  padding: 14px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
.channels-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: -6px 0 16px; padding: 10px 14px;
  background: rgba(255,255,255,.02); border: 1px dashed var(--line); border-radius: 10px; }
.chan-btn { padding: 5px 12px; border-radius: 7px; background: var(--bg2); border: 1px solid var(--line);
  font-size: 12.5px; cursor: pointer; transition: .15s; }
.chan-btn:hover { border-color: var(--play-channel-active-bg); }
.chan-btn.on { background: var(--play-channel-active-bg); border-color: transparent; color: var(--play-channel-active-text); font-weight: 600; }
.chan-btn.dead { opacity: .4; cursor: not-allowed; text-decoration: line-through; }
.chan-btn em { font-style: normal; font-size: 11px; margin-left: 4px; opacity: .8; }
.lbl { color: var(--muted); font-size: 14px; }
.line-btn { padding: 6px 14px; border-radius: 8px; background: var(--bg2); border: 1px solid var(--line);
  font-size: 13px; cursor: pointer; transition: .2s; }
.line-btn em { color: var(--muted); font-style: normal; font-size: 12px; }
.line-btn:hover { border-color: var(--play-link-text); }
.line-btn.on { background: var(--play-line-active-bg); border-color: transparent; color: var(--play-line-active-text); }
.line-btn.on em { color: rgba(255,255,255,.8); }
.eps-box { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.eps-head { font-size: 15px; font-weight: 700; margin-bottom: 14px; }
.eps-head span { color: var(--muted); font-size: 13px; font-weight: 400; margin-left: 8px; }
.eps-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(66px, 1fr)); gap: 8px;
  max-height: 360px; overflow-y: auto; }
.ep { text-align: center; padding: 9px 4px; background: var(--bg2); border: 1px solid var(--line);
  border-radius: 7px; font-size: 13px; cursor: pointer; transition: .15s; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.ep:hover { border-color: var(--play-episode-active-bg); color: #fff; }
.ep.on { background: var(--play-episode-active-bg); border-color: transparent; color: var(--play-episode-active-text); }

/* 相关推荐 */
.rec-col { min-width: 0; }
.rec-head { font-size: 16px; font-weight: 800; margin-bottom: 14px; display: flex; align-items: center; gap: 9px; }
.rec-head::before { content: ''; width: 4px; height: 17px; border-radius: 2px; background: var(--section-accent-bg); }
.rec-list { display: flex; flex-direction: column; gap: 12px; }
.rec-item { display: flex; gap: 11px; cursor: pointer; padding: 6px; border-radius: 10px; transition: .15s; }
.rec-item:hover { background: var(--card); }
.rec-poster { width: 68px; flex-shrink: 0; aspect-ratio: 2/3; border-radius: 8px; overflow: hidden; position: relative; background: #0f1420; }
.rec-poster img { width: 100%; height: 100%; object-fit: cover; }
.rec-poster .noimg { width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#455068;font-size:11px; }
.rec-score { position: absolute; right: 3px; bottom: 3px; background: linear-gradient(90deg,#ff8a00,#ff5c8a);
  color: #fff; font-size: 11px; font-weight: 700; padding: 1px 5px; border-radius: 5px; }
.rec-info { min-width: 0; flex: 1; padding-top: 3px; }
.rec-name { font-size: 14px; font-weight: 600; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rec-sub { font-size: 12px; color: var(--muted); margin-top: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rec-empty { color: var(--muted); font-size: 13px; padding: 20px 0; text-align: center; }

@media (max-width: 1024px) {
  .play-wrap { grid-template-columns: 1fr; }
  .rec-col { margin-top: 8px; }
  .rec-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
}
@media (max-width: 480px) {
  .play-wrap { gap: 14px; }
  .player-box { border-radius: 12px; margin: 0 -12px; }
  .play-lock { gap: 10px; padding: 18px; }
  .play-lock-icon { width: 44px; height: 44px; }
  .play-lock-icon svg { width: 23px; height: 23px; }
  .play-lock-title { font-size: 17px; }
  .play-lock-desc { font-size: 12.5px; }
  .play-lock-btn { height: 38px; padding: 0 18px; }
  .pv-head {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 10px 13px;
    margin: 14px 0 12px;
    padding: 12px;
    border-radius: 13px;
    overflow: hidden;
  }
  .pv-poster {
    width: 92px;
    grid-column: 1;
    grid-row: 1 / span 4;
    max-height: 138px;
    border-radius: 9px;
  }
  .pv-meta { display: contents; }
  .pv-title {
    grid-column: 2;
    min-width: 0;
    margin: 0;
    font-size: 19px;
    line-height: 1.26;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .db-rating { margin-left: 6px; font-size: 14px; }
  .pv-tags {
    grid-column: 2;
    align-content: start;
    gap: 6px 7px;
    margin: 0;
  }
  .pv-tags .t {
    max-width: 100%;
    padding: 3px 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pv-line {
    margin: 0;
    line-height: 1.55;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .update-line {
    grid-column: 2;
    align-self: start;
  }
  .credit-line,
  .people-line,
  .still-section,
  .pv-actions {
    grid-column: 2;
  }
  .credit-line {
    color: var(--muted2);
    -webkit-line-clamp: 2;
  }
  .people-line {
    align-items: flex-start;
    gap: 7px;
    margin: 2px 0 0;
  }
  .people-label {
    flex: 0 0 auto;
    height: 26px;
    display: inline-flex;
    align-items: center;
  }
  .person-chip {
    max-width: 100%;
    min-height: 26px;
  }
  .pv-intro {
    grid-column: 1 / -1;
    margin-top: 2px;
    padding-top: 10px;
    border-top: 1px solid rgba(255,255,255,.045);
  }
  .pv-intro p {
    font-size: 13px;
    line-height: 1.68;
  }
  .pv-actions {
    gap: 8px;
    margin-top: 6px;
  }
  .pv-actions .mini-btn {
    height: 34px;
    padding: 0 12px;
    border-radius: 11px;
  }
  .now-playing {
    margin: 14px 0 12px;
    font-size: 13px;
    line-height: 1.6;
  }
  .lines-bar,
  .channels-bar,
  .eps-box {
    border-radius: 12px;
  }
  .lines-bar {
    align-items: flex-start;
    gap: 9px;
    margin: 12px 0;
    padding: 12px;
  }
  .lines-bar .lbl,
  .channels-bar .lbl {
    width: 38px;
    padding-top: 7px;
  }
  .line-btn,
  .chan-btn {
    max-width: calc(100% - 48px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .still { flex-basis: 164px; }
  .gallery-viewer { padding: 62px 44px 54px; }
  .gv-close { top: 16px; right: 16px; width: 38px; height: 38px; }
  .gv-close svg { width: 22px; height: 22px; }
  .gv-nav { width: 36px; height: 52px; border-radius: 10px; }
  .gv-nav svg { width: 26px; height: 26px; }
  .gv-nav.prev { left: 8px; }
  .gv-nav.next { right: 8px; }
}
</style>
