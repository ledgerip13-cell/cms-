<template>
  <div class="page play-wrap" v-if="vod.id">
    <!-- 左：播放器 + 选集 + 信息 -->
    <div class="player-col">
      <div class="player-box">
        <video v-show="mode==='hls'" ref="videoEl" controls autoplay playsinline class="video" @timeupdate="onVideoTimeUpdate" @error="onVideoError"></video>
        <iframe v-if="mode==='iframe'" :src="curUrl" class="video" frameborder="0"
          allowfullscreen allow="autoplay; fullscreen"></iframe>
        <div v-if="mode==='iframe'" class="iframe-note">该源为加密分享页，解析未命中，已回退内嵌播放器</div>
        <div v-if="playNotice" class="play-notice">{{ playNotice }}</div>
        <div v-if="resolving" class="video-ph">正在解析播放地址…</div>
      </div>

      <!-- 标题信息条 -->
      <div class="pv-head">
        <div class="pv-poster" v-if="vod.officialPic || vod.pic">
          <img :src="pic(vod)" :alt="vod.name" @error="onErr" />
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
          <p class="pv-line" v-if="vod.remarks">更新：{{ vod.remarks }}</p>
          <div class="people-line" v-if="directors.length">
            <span class="people-label">导演</span>
            <button v-for="p in directors" :key="'d'+p.id" class="person-chip" @click="searchPerson(p.person.name)">
              <img v-if="p.person.avatar" :src="imgUrl(p.person.avatar)" alt="" @error="onErr" />
              {{ p.person.name }}
            </button>
          </div>
          <p class="pv-line" v-else-if="vod.director">导演：{{ vod.director }}</p>
          <div class="people-line" v-if="actors.length">
            <span class="people-label">主演</span>
            <button v-for="p in actors" :key="'a'+p.id" class="person-chip" @click="searchPerson(p.person.name)">
              <img v-if="p.person.avatar" :src="imgUrl(p.person.avatar)" alt="" @error="onErr" />
              {{ p.person.name }}
            </button>
          </div>
          <p class="pv-line" v-else-if="vod.actor">主演：{{ vod.actor }}</p>
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
            <img v-if="r.officialPic || r.pic" :src="pic(r)" :alt="r.name" loading="lazy" @error="onErr" />
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
const playNotice = ref('')
const cleanFallbackUrl = ref('')
let hls = null
let hlsRecoverCount = 0
let pendingSeekSec = 0
let lastHistorySaveAt = 0
let playNoticeTimer = 0
let playWatchdogTimer = 0

function isDirectM3u8(url) { return /\.m3u8(\?|$)/i.test(url) }
function onErr(e) { e.target.style.visibility='hidden' }
function pic(v) { return imgUrl(v.officialPic || v.pic || '') }
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
      showPlayNotice(describePlaybackError(data))
      if (tryCleanFallback(url)) return
      tryNextPlayback()
    })
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url; video.play().catch(()=>{})
  }
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

async function playResolvedEp(i) {
  const channel = curChannel.value
  if (!channel?.id || !vod.value?.id) return
  resolving.value = true
  try {
    const r = await api.resolvePlay({ vodId: vod.value.id, playId: channel.id, epIndex: i })
    if (r.ok && r.url && (r.kind === 'm3u8' || r.kind === 'mp4' || /\.m3u8(\?|$)/i.test(r.url))) {
      cleanFallbackUrl.value = r.fallbackUrl || ''
      playDirectUrl(r.url, r.kind)
      return
    }
    if (['login_required', 'vip_required', 'group_required'].includes(r.code)) {
      cleanFallbackUrl.value = ''
      showPlayNotice(r.error || '当前内容无观看权限')
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
  if (!user.value || !vod.value?.id) return
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
  saveWatchHistory(i, pendingSeekSec || 0)
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
  notFound.value = false; vod.value = {}; followed.value = false
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
    router.push({ path: '/auth', query: { redirect: route.fullPath } })
    return
  }
  const r = followed.value ? await api.unfollowVod(vod.value.id) : await api.followVod(vod.value.id)
  followed.value = r.followed
}

onMounted(() => loadVod(route.params.id))
watch(() => route.params.id, (id) => { if (id) loadVod(id) })
onBeforeUnmount(() => {
  saveWatchHistory(epIdx.value)
  if (hls) hls.destroy()
  clearPlayWatchdog()
})
</script>

<style scoped>
.play-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 316px; gap: 26px; }
.player-col { min-width: 0; }
.player-box { position: relative; background: #000; border-radius: 14px; overflow: hidden; aspect-ratio: 16/9; }
.video { width: 100%; height: 100%; background: #000; }
.video-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #667; pointer-events: none; }
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
  .pv-head {
    display: grid;
    grid-template-columns: 86px minmax(0, 1fr);
    gap: 10px 12px;
    padding: 12px;
    overflow: hidden;
  }
  .pv-poster {
    width: 86px;
    grid-column: 1;
    grid-row: 1 / span 3;
    max-height: 129px;
  }
  .pv-meta { display: contents; }
  .pv-title {
    grid-column: 2;
    min-width: 0;
    margin: 0;
    font-size: 20px;
    line-height: 1.25;
  }
  .db-rating { margin-left: 6px; font-size: 14px; }
  .pv-tags {
    grid-column: 2;
    gap: 6px;
    margin: 0;
  }
  .pv-tags .t { padding: 3px 8px; }
  .pv-line {
    grid-column: 2;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .people-line,
  .pv-intro,
  .still-section,
  .pv-actions {
    grid-column: 1 / -1;
  }
  .people-line { margin: 4px 0 0; }
  .person-chip { max-width: 104px; }
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
