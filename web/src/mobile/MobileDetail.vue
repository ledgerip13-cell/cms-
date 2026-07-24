<template>
  <main class="mdetail" :style="{ '--md-head-bg': headBg }">
    <header class="md-head">
      <button class="m-back-btn" type="button" aria-label="返回" @click="goBack">
        <svg viewBox="0 0 24 24" v-html="icon('back')"></svg>
      </button>
      <strong class="md-head-title">{{ vod.name || '详情' }}</strong>
    </header>

    <template v-if="loading">
      <section class="md-hero md-skeleton-hero" aria-label="详情加载中">
        <div class="md-sk-cover"></div>
        <div class="md-sk-info">
          <i class="md-sk-title"></i>
          <div class="md-sk-tags">
            <i></i><i></i><i></i>
          </div>
          <i class="md-sk-line wide"></i>
          <i class="md-sk-line"></i>
          <i class="md-sk-line short"></i>
        </div>
      </section>

      <section class="md-sk-actions" aria-hidden="true">
        <i class="primary"></i>
        <i></i><i></i><i></i>
      </section>

      <section class="md-sk-stats" aria-hidden="true">
        <div v-for="i in 4" :key="`stat-${i}`"><i></i><b></b></div>
      </section>

      <section class="md-sk-intro" aria-hidden="true">
        <i></i><i></i><i class="short"></i>
      </section>

      <section class="md-section md-sk-section" aria-hidden="true">
        <header><i></i><b></b></header>
        <div class="md-sk-tabs"><i v-for="i in 3" :key="`tab-${i}`"></i></div>
        <div class="md-sk-episodes"><i v-for="i in 15" :key="`ep-${i}`"></i></div>
      </section>

      <section class="md-section md-sk-section" aria-hidden="true">
        <header><i></i></header>
        <div class="md-sk-related"><article v-for="i in 6" :key="`rel-${i}`"><i></i><b></b><em></em></article></div>
      </section>
    </template>

    <template v-else-if="vod.id">
      <section class="md-hero">
        <img class="md-cover m-img-fade" :src="poster(vod)" :alt="vod.name" @load="onImgLoad" @error="hideBrokenImg" />
        <div class="md-info">
          <h1>{{ vod.name }}</h1>
          <div class="md-tags">
            <span v-for="tag in detailTags" :key="tag">{{ tag }}</span>
          </div>
          <div class="md-meta-list">
            <p v-for="row in metaRows" :key="row.label"><span>{{ row.label }}：</span>{{ row.value }}</p>
          </div>
        </div>
      </section>

      <section class="md-action-row">
        <button class="primary" type="button" @click="playSelected()">
          <svg viewBox="0 0 24 24" v-html="icon('play')"></svg>
          立即播放
        </button>
        <button type="button" :class="{ on: followed }" aria-label="收藏" @click="toggleFollow">
          <svg viewBox="0 0 24 24" v-html="icon('heart')"></svg>
        </button>
        <button type="button" aria-label="添加" @click="toggleFollow">
          <svg viewBox="0 0 24 24" v-html="icon('plus')"></svg>
        </button>
        <button type="button" aria-label="分享" @click="shareVod">
          <svg viewBox="0 0 24 24" v-html="icon('share')"></svg>
        </button>
      </section>

      <section class="md-stats">
        <div v-for="item in statRows" :key="item.label">
          <b>{{ item.value }}</b>
          <span>{{ item.label }}</span>
        </div>
      </section>

      <section v-if="intro" class="md-intro-block">
        <p class="md-intro" :class="{ folded: !introOpen }">简介：{{ intro }}</p>
        <button v-if="intro.length > 88" type="button" @click="introOpen = !introOpen">{{ introOpen ? '收起' : '展开全部' }}</button>
      </section>

      <section v-if="lines.length" class="md-section">
        <header>
          <h2>播放线路</h2>
          <span>{{ selectedLineName }}</span>
        </header>
        <div ref="lineTabsEl" class="md-line-tabs">
          <button v-for="(line, index) in lines" :key="line.id || index" type="button" :class="{ on: selectedLineIndex === index, watched: lineHasHistory(line) }" @click="setSelectedLine(index)">
            {{ lineLabel(line, index) }}
            <em v-if="lineHasHistory(line)">最近看过</em>
          </button>
        </div>
        <div v-if="episodeRanges.length > 1" ref="episodeRangesEl" class="md-episode-ranges">
          <button v-for="range in episodeRanges" :key="range.start" type="button" :class="{ on: activeRangeStart === range.start }" @click="selectEpisodeRange(range.start)">
            {{ range.label }}
          </button>
        </div>
        <button v-if="resumeEntry" class="md-resume-episode" type="button" @click="playSelected(resumeEntry.epIndex)">
          <span>上次看到 第{{ resumeEntry.epIndex + 1 }}集</span>
          <em>{{ historyProgressText }}</em>
          <i :style="{ width: historyProgressPercent }"></i>
        </button>
        <div ref="episodesEl" class="md-episodes">
          <button v-for="ep in visibleEpisodes" :key="ep.index" type="button" :class="{ resume: isHistoryEpisode(ep.index) }" @click="playSelected(ep.index)">
            <span>{{ ep.name || `第${ep.index + 1}集` }}</span>
            <em v-if="isHistoryEpisode(ep.index)">{{ historyProgressText }}</em>
            <i v-if="isHistoryEpisode(ep.index)" :style="{ width: historyProgressPercent }"></i>
          </button>
        </div>
      </section>

      <section v-if="related.length" class="md-section">
        <header><h2>猜你喜欢</h2></header>
        <div class="md-related">
          <article v-for="item in related" :key="item.id" @click="goDetail(item.id)">
            <img class="m-img-fade" :src="poster(item)" :alt="item.name" loading="lazy" @load="onImgLoad" @error="hideBrokenImg" />
            <strong>{{ item.name }}</strong>
            <span>{{ item.typeName || '影片' }}<template v-if="item.year"> · {{ item.year }}</template></span>
          </article>
        </div>
      </section>
    </template>

    <section v-else class="md-empty">
      <strong>影片不存在</strong>
      <button type="button" @click="router.replace('/m')">返回首页</button>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { openAuthDialog } from '../authDialog'
import { notifySuccess, notifyWarning } from '../feedback'
import { currentUser } from '../userStore'
import { icon } from './icons'

const route = useRoute()
const router = useRouter()
const vod = ref({})
const related = ref([])
const loading = ref(true)
const followed = ref(false)
const introOpen = ref(false)
const selectedLineIndex = ref(0)
const activeRangeStart = ref(0)
const historyState = ref(null)
const historyLineStates = ref({})
const lineTabsEl = ref(null)
const episodeRangesEl = ref(null)
const episodesEl = ref(null)
const headBg = ref('.94')
let headRaf = 0
let loadSeq = 0
const MOBILE_HISTORY_KEY = 'vcms.mobile.play.history.v1'
const EPISODE_GROUP_SIZE = 40

const intro = computed(() => String(vod.value.officialIntro || vod.value.blurb || '').trim())
const lines = computed(() => Array.isArray(vod.value.lines) ? vod.value.lines : [])
const selectedLine = computed(() => lines.value[selectedLineIndex.value] || lines.value[0] || null)
const selectedChannel = computed(() => {
  const line = selectedLine.value
  return Array.isArray(line?.channels) && line.channels.length ? line.channels[0] : line
})
const episodes = computed(() => Array.isArray(selectedChannel.value?.episodes) ? selectedChannel.value.episodes : [])
const episodeRanges = computed(() => {
  const total = episodes.value.length
  if (!total) return []
  const ranges = []
  for (let start = 0; start < total; start += EPISODE_GROUP_SIZE) {
    const end = Math.min(total, start + EPISODE_GROUP_SIZE)
    ranges.push({ start, end, label: `${start + 1}-${end}` })
  }
  return ranges
})
const activeRange = computed(() => {
  const ranges = episodeRanges.value
  return ranges.find(item => item.start === activeRangeStart.value) || ranges[0] || { start: 0, end: 0, label: '' }
})
const visibleEpisodes = computed(() => episodes.value.map((ep, index) => ({ ...ep, index })).slice(activeRange.value.start, activeRange.value.end))
const historyForSelectedLine = computed(() => {
  const channelId = Number(selectedChannel.value?.id || 0)
  const lineId = Number(selectedLine.value?.id || 0)
  const byChannel = channelId ? historyLineStates.value?.[channelId] : null
  const byLine = lineId ? historyLineStates.value?.[lineId] : null
  return byChannel || byLine || (lineMatchesHistory(selectedLine.value) ? historyState.value : null)
})
const resumeEntry = computed(() => {
  const row = historyForSelectedLine.value
  if (!row) return null
  const epIndex = Math.max(0, Number(row.epIndex) || 0)
  if (epIndex >= episodes.value.length && episodes.value.length) return null
  return { ...row, epIndex }
})
const historyProgressText = computed(() => {
  const row = resumeEntry.value
  const progress = Number(row?.progress || row?.progressSec || 0)
  const duration = Number(row?.duration || row?.durationSec || 0)
  if (duration > 0) return `${Math.round(Math.max(0, Math.min(100, (progress / duration) * 100)))}%`
  if (progress > 0) return formatTime(progress)
  return '已看过'
})
const historyProgressPercent = computed(() => {
  const row = resumeEntry.value
  const progress = Number(row?.progress || row?.progressSec || 0)
  const duration = Number(row?.duration || row?.durationSec || 0)
  if (!duration) return '18%'
  return `${Math.max(8, Math.min(100, (progress / duration) * 100))}%`
})
const actors = computed(() => peopleByRole('actor').slice(0, 12))
const directors = computed(() => peopleByRole('director').slice(0, 6))
const actorsFallback = computed(() => actors.value.length ? actors.value : splitNames(vod.value.actor).slice(0, 12).map(name => ({ id: 0, name })))
const directorsFallback = computed(() => directors.value.length ? directors.value : splitNames(vod.value.director).slice(0, 6).map(name => ({ id: 0, name })))
const detailTags = computed(() => {
  const tags = []
  const genreNames = splitNames(vod.value.genres).slice(0, 2)
  if (vod.value.typeName) tags.push(vod.value.typeName)
  for (const name of genreNames) if (!tags.includes(name)) tags.push(name)
  if (!tags.length && vod.value.subType) tags.push(vod.value.subType)
  return tags.slice(0, 3)
})
const metaRows = computed(() => [
  { label: '导演', value: directorsFallback.value.map(item => item.name).join('、') },
  { label: '主演', value: actorsFallback.value.map(item => item.name).join('、') },
  { label: '别名', value: vod.value.aliasName || vod.value.aliasNames?.join('、') || vod.value.enName || '' },
  { label: '语言', value: vod.value.lang || vod.value.area || '' },
].filter(item => item.value))
const selectedLineName = computed(() => lineLabel(selectedLine.value, selectedLineIndex.value))
const episodeSummary = computed(() => {
  const total = episodes.value.length || Number(selectedLine.value?.epCount || 0)
  if (total) return `${total}集`
  const remark = meaningfulEpisodeRemark(vod.value.remarks)
  if (remark) return remark
  return total ? `${total}集` : '待更新'
})
const statRows = computed(() => [
  { label: '评分', value: vod.value.rating ? String(vod.value.rating) : '暂无' },
  { label: '热度', value: heatText(vod.value.heatValue || vod.value.heatScore || vod.value.ratingCount) || '暂无' },
  { label: '上映时间', value: vod.value.year || '未知' },
  { label: '集数', value: episodeSummary.value },
])

function splitNames(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean)
  return String(value || '').split(/[,，/、\s]+/).map(item => item.trim()).filter(Boolean)
}
function episodeCountHint(value) {
  const text = String(value || '').trim()
  if (!text) return 0
  if (/^\d+$/.test(text)) return Number(text) || 0
  const match = text.match(/(?:更新至|更至|第|全)?\s*(\d{1,5})\s*(?:集|期|话|回)/)
  return match ? Number(match[1]) || 0 : 0
}
function meaningfulEpisodeRemark(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const count = episodeCountHint(text)
  if (/^0+$/.test(text) || /^0\s*(集|期|话|回)$/.test(text) || (count <= 0 && /0\s*(集|期|话|回)/.test(text))) return ''
  return /^\d+$/.test(text) && count > 0 ? `${count}集` : text
}
function peopleByRole(role) {
  return (vod.value.people || [])
    .filter(item => item.role === role && item.person?.name)
    .map(item => ({ id: Number(item.person?.id || 0), name: item.person.name }))
    .filter(item => item.name)
}
function poster(item) {
  return imgUrl(item?.officialPic || item?.pic || item?.localPic || item?.heroImage || item?.heroPic || '')
}
function onImgLoad(event) {
  event?.target?.classList?.add('is-loaded')
}
function hideBrokenImg(event) {
  const img = event?.target
  if (img) img.style.visibility = 'hidden'
}
function lineLabel(line, index = 0) {
  return line?.sourceName || line?.flag || `线路 ${index + 1}`
}
function lineChannels(line) {
  return Array.isArray(line?.channels) && line.channels.length ? line.channels : [line].filter(Boolean)
}
function lineMatchesHistory(line) {
  const targetId = Number(historyState.value?.lineId || 0)
  if (!targetId) return false
  return lineChannels(line).some(item => Number(item?.id || 0) === targetId) || Number(line?.id || 0) === targetId
}
function lineHasHistory(line) {
  return lineMatchesHistory(line) || lineChannels(line).some(item => historyLineStates.value?.[Number(item?.id || 0)])
}
function setSelectedLine(index) {
  selectedLineIndex.value = Math.max(0, Math.min(lines.value.length - 1, Number(index) || 0))
  activeRangeStart.value = 0
  focusPlaybackContext()
}
function selectEpisodeRange(start) {
  activeRangeStart.value = Math.max(0, Number(start) || 0)
  focusPlaybackContext()
}
function selectedPlaybackLineId() {
  return selectedChannel.value?.id || selectedLine.value?.id
}
function playSelected(epIndex = 0) {
  if (!vod.value.id) return
  const lineId = selectedPlaybackLineId()
  router.push({ path: `/m/play/${vod.value.id}`, query: { ...(lineId ? { line: lineId } : {}), ep: Math.max(0, Number(epIndex) || 0) } })
}
function isHistoryEpisode(index) {
  return Boolean(resumeEntry.value && Number(resumeEntry.value.epIndex) === Number(index))
}
function formatTime(sec) {
  const value = Math.max(0, Math.floor(Number(sec) || 0))
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
function readLocalHistory(vodId) {
  try {
    const data = JSON.parse(localStorage.getItem(MOBILE_HISTORY_KEY) || '{}')
    const row = data?.[vodId]
    return row?.latest || row || null
  } catch {
    return null
  }
}
function readLocalLineHistories(vodId) {
  try {
    const data = JSON.parse(localStorage.getItem(MOBILE_HISTORY_KEY) || '{}')
    return data?.[vodId]?.lineHistories || {}
  } catch {
    return {}
  }
}
function normalizeLineHistories(value) {
  if (!value) return {}
  if (Array.isArray(value)) {
    return value.reduce((acc, item) => {
      const id = Number(item?.lineId || 0)
      if (id) acc[id] = item
      return acc
    }, {})
  }
  return Object.entries(value).reduce((acc, [key, item]) => {
    const id = Number(item?.lineId || key || 0)
    if (id) acc[id] = item
    return acc
  }, {})
}
function applyHistorySelection(history, lineHistories) {
  historyState.value = history || null
  historyLineStates.value = normalizeLineHistories(lineHistories)
  const targetId = Number(history?.lineId || 0)
  if (!targetId || !lines.value.length) return
  const lineIndex = lines.value.findIndex(line => lineMatchesHistory(line))
  if (lineIndex >= 0) selectedLineIndex.value = lineIndex
  const epIndex = Math.max(0, Number(history?.epIndex) || 0)
  activeRangeStart.value = Math.floor(epIndex / EPISODE_GROUP_SIZE) * EPISODE_GROUP_SIZE
  focusPlaybackContext()
}
function focusPlaybackContext() {
  nextTick(() => {
    lineTabsEl.value?.querySelector?.('button.on')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    episodeRangesEl.value?.querySelector?.('button.on')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    episodesEl.value?.querySelector?.('button.resume')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  })
}
function heatText(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  const n = Math.max(0, Math.round(Number(value) || 0))
  if (!n) return ''
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`
  return String(n)
}
function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/m')
}
function goDetail(id) {
  if (id) router.push(`/m/detail/${id}`)
}
function openPerson(person) {
  const id = Number(person?.id || 0)
  const name = String(person?.name || '').trim()
  if (id) {
    router.push(`/m/person/${id}`)
    return
  }
  if (name) router.push({ path: '/m/search', query: { kw: name } })
}
async function toggleFollow() {
  if (!vod.value.id) return
  if (!currentUser.value) {
    openAuthDialog('login')
    return
  }
  try {
    const res = followed.value ? await api.unfollowVod(vod.value.id) : await api.followVod(vod.value.id)
    followed.value = Boolean(res?.followed ?? !followed.value)
    notifySuccess(followed.value ? '已加入追剧' : '已取消追剧')
  } catch {
    notifyWarning('操作失败')
  }
}
async function shareVod() {
  const url = `${window.location.origin}/vod/${vod.value.id || route.params.id}`
  const title = vod.value.name || document.title
  try {
    if (navigator.share) await navigator.share({ title, url })
    else {
      await navigator.clipboard?.writeText(url)
      notifySuccess('链接已复制')
    }
  } catch {}
}
async function loadDetail(id) {
  const seq = ++loadSeq
  loading.value = true
  vod.value = {}
  related.value = []
  followed.value = false
  introOpen.value = false
  selectedLineIndex.value = 0
  activeRangeStart.value = 0
  historyState.value = null
  historyLineStates.value = {}
  try {
    const data = await api.vod(id)
    if (seq !== loadSeq) return
    vod.value = data || {}
    document.title = vod.value.name ? `${vod.value.name} - 详情` : document.title
    applyHistorySelection(readLocalHistory(id), readLocalLineHistories(id))
    loading.value = false
    const [items, state] = await Promise.all([
      api.related({ id, type: vod.value.typeName, sub: vod.value.subType, limit: 8 }).catch(() => []),
      currentUser.value ? api.userVodState(id).catch(() => null) : Promise.resolve(null),
    ])
    if (seq !== loadSeq) return
    related.value = Array.isArray(items) ? items : []
    followed.value = Boolean(state?.followed)
    if (state?.history) applyHistorySelection(state.history, state.lineHistories)
  } catch {
    if (seq === loadSeq) vod.value = {}
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}
function syncHeadBg() {
  headRaf = 0
  headBg.value = Math.max(.94, Math.min(1, .94 + (window.scrollY / 96) * .06)).toFixed(3)
}
function onPageScroll() {
  if (headRaf) return
  headRaf = window.requestAnimationFrame(syncHeadBg)
}

watch(() => route.params.id, (id) => {
  if (id) loadDetail(id)
}, { immediate: true })
watch([selectedLineIndex, activeRangeStart], focusPlaybackContext)
onMounted(() => {
  syncHeadBg()
  window.addEventListener('scroll', onPageScroll, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onPageScroll)
  if (headRaf) cancelAnimationFrame(headRaf)
})
</script>

<style scoped>
.mdetail {
  min-height: 100dvh;
  padding: calc(env(safe-area-inset-top) + 82px) 14px 38px;
  background: #f5f6f8;
  color: #151922;
  --md-cover-w: clamp(122px, 32vw, 132px);
  --md-cover-h: calc(var(--md-cover-w) * 4 / 3);
}
.md-head {
  position: fixed;
  z-index: 30;
  left: 0;
  right: 0;
  top: 0;
  height: calc(env(safe-area-inset-top) + 58px);
  padding: env(safe-area-inset-top) 12px 0;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  background: rgb(255 255 255 / var(--md-head-bg));
  backdrop-filter: blur(14px);
  box-shadow: 0 1px 0 rgba(18,24,36,.06);
}
.md-head button,
.md-action-row button,
.md-line-tabs button,
.md-episodes button,
.md-intro-block button,
.md-empty button {
  border: 0;
}
.md-head > button { color: #1f2530; }
.md-head-title {
  min-width: 0;
  overflow: hidden;
  color: #151922;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-action-row svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.md-hero {
  display: grid;
  grid-template-columns: var(--md-cover-w) minmax(0, 1fr);
  gap: 15px;
  align-items: start;
}
.md-cover {
  width: var(--md-cover-w);
  aspect-ratio: 3 / 4;
  border-radius: 9px;
  object-fit: cover;
  background: #e8ebf0;
  box-shadow: 0 8px 22px rgba(20,28,42,.12);
}
.md-info {
  min-width: 0;
  max-height: var(--md-cover-h);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 1px;
}
.md-info h1 {
  margin: 0;
  color: #121722;
  font-size: 23px;
  line-height: 1.16;
  letter-spacing: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.md-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 55px;
  overflow: hidden;
}
.md-tags span {
  padding: 4px 8px;
  border-radius: 6px;
  color: #596273;
  background: #eef1f5;
  box-shadow: inset 0 0 0 1px #e3e7ee;
  font-size: 12px;
  line-height: 1.2;
}
.md-meta-list {
  display: grid;
  gap: 6px;
  min-height: 0;
  overflow: hidden;
}
.md-meta-list p {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #4d5665;
  font-size: 14px;
  line-height: 1.34;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-meta-list span {
  color: #8a93a3;
}
.md-action-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, 52px);
  gap: 12px;
  margin-top: 24px;
}
.md-action-row button {
  height: 52px;
  min-width: 0;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #151922;
  background: transparent;
  box-shadow: inset 0 0 0 1px #d6dbe4;
  font-size: 18px;
  font-weight: 600;
}
.md-action-row button.primary {
  color: #fff;
  background: #1f2530;
  box-shadow: none;
}
.md-action-row button.primary svg {
  fill: currentColor;
  stroke: none;
}
.md-action-row button.on {
  color: #f04438;
  background: #fff1ef;
}
.md-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 24px;
}
.md-stats div {
  min-width: 0;
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 0 7px;
  border-left: 1px solid #e2e6ee;
}
.md-stats div:first-child {
  border-left: 0;
}
.md-stats b,
.md-stats span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-stats b {
  color: #222936;
  font-size: 15px;
  line-height: 1.1;
}
.md-stats span {
  color: #7c8595;
  font-size: 13px;
}
.md-intro-block {
  display: grid;
  justify-items: stretch;
  gap: 10px;
  margin-top: 24px;
}
.md-section {
  margin-top: 28px;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 1px 0 rgba(18,24,36,.04);
}
.md-section header {
  min-height: 58px;
  padding: 0 16px;
  margin-bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #edf0f5;
}
.md-section h2 {
  margin: 0;
  color: #151922;
  font-size: 16px;
  line-height: 1;
}
.md-section header span {
  min-width: 0;
  overflow: hidden;
  color: #8a93a3;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-intro {
  margin: 0;
  color: #394150;
  font-size: 15px;
  line-height: 1.62;
}
.md-intro.folded {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.md-intro-block button {
  justify-self: end;
  height: 31px;
  border-radius: 7px;
  padding: 0 10px;
  color: #1f2530;
  background: #fff;
  box-shadow: inset 0 0 0 1px #d6dbe4;
  font-size: 13px;
}
.md-line-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 14px 16px 2px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.md-line-tabs::-webkit-scrollbar { display: none; }
.md-line-tabs button {
  flex: 0 0 auto;
  min-height: 34px;
  border-radius: 8px;
  padding: 0 13px;
  display: inline-grid;
  align-content: center;
  gap: 2px;
  background: #f1f3f6;
  color: #626b7a;
  font-size: 13px;
}
.md-line-tabs button em {
  font-style: normal;
  font-size: 10px;
  line-height: 1;
  opacity: .76;
}
.md-line-tabs button.watched:not(.on) {
  color: #f04438;
  background: #fff1ef;
}
.md-line-tabs button.on {
  background: #1f2530;
  color: #fff;
  box-shadow: none;
}
.md-episode-ranges {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 12px 16px 0;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.md-episode-ranges::-webkit-scrollbar { display: none; }
.md-episode-ranges button {
  flex: 0 0 auto;
  height: 30px;
  border: 0;
  border-radius: 7px;
  padding: 0 11px;
  color: #697281;
  background: #f4f6f8;
  font-size: 12px;
  font-weight: 700;
}
.md-episode-ranges button.on {
  color: #fff;
  background: #1f2530;
}
.md-resume-episode {
  position: relative;
  width: calc(100% - 32px);
  min-height: 42px;
  margin: 12px 16px 0;
  border: 0;
  border-radius: 9px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px;
  color: #f04438;
  background: #fff1ef;
  font-size: 13px;
  font-weight: 800;
  text-align: left;
}
.md-resume-episode span,
.md-resume-episode em {
  position: relative;
  z-index: 1;
}
.md-resume-episode em {
  flex: 0 0 auto;
  font-style: normal;
  color: #9f2b22;
  font-size: 12px;
}
.md-resume-episode i {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  background: #f04438;
}
.md-episodes {
  padding: 12px 14px 16px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.md-episodes button {
  position: relative;
  height: 38px;
  border-radius: 8px;
  background: #f6f7f9;
  color: #394150;
  box-shadow: inset 0 0 0 1px #e5e8ef;
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
}
.md-episodes button span,
.md-episodes button em {
  position: relative;
  z-index: 1;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-episodes button em {
  margin-top: 1px;
  color: #f04438;
  font-size: 10px;
  font-style: normal;
}
.md-episodes button i {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: #f04438;
}
.md-episodes button.resume {
  color: #f04438;
  background: #fff6f4;
  box-shadow: inset 0 0 0 1px #ffd6cf;
}
.md-related {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 9px;
  padding: 0 14px 16px;
}
.md-related article {
  min-width: 0;
}
.md-related img {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 8px;
  object-fit: cover;
  background: #e8ebf0;
}
.md-related strong,
.md-related span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-related strong {
  margin-top: 6px;
  color: #1d2330;
  font-size: 14px;
  font-weight: 500;
}
.md-related span {
  margin-top: 3px;
  color: #7d8796;
  font-size: 12px;
}
.md-empty {
  min-height: 50vh;
  display: grid;
  place-content: center;
  gap: 14px;
  text-align: center;
}
.md-empty button {
  height: 38px;
  border-radius: 999px;
  padding: 0 16px;
  background: #1f2530;
  color: #fff;
}
.md-skeleton-hero,
.md-sk-actions,
.md-sk-stats,
.md-sk-intro,
.md-sk-section {
  pointer-events: none;
}
.md-skeleton-hero i,
.md-sk-actions i,
.md-sk-stats i,
.md-sk-stats b,
.md-sk-intro i,
.md-sk-section i,
.md-sk-section b,
.md-sk-section em {
  display: block;
  border-radius: 8px;
  background: linear-gradient(110deg, #e8ebf1 8%, #f8f9fb 18%, #e8ebf1 33%);
  background-size: 200% 100%;
  animation: md-shimmer 1.15s linear infinite;
}
.md-sk-cover {
  width: var(--md-cover-w);
  aspect-ratio: 3 / 4;
  border-radius: 9px;
  background: linear-gradient(110deg, #e2e6ee 8%, #f7f8fb 18%, #e2e6ee 33%);
  background-size: 200% 100%;
  animation: md-shimmer 1.15s linear infinite;
  box-shadow: 0 8px 22px rgba(20,28,42,.08);
}
.md-sk-info {
  min-width: 0;
  max-height: var(--md-cover-h);
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 2px;
  overflow: hidden;
}
.md-sk-title {
  width: min(92%, 240px);
  height: 54px;
}
.md-sk-tags {
  display: flex;
  gap: 6px;
}
.md-sk-tags i {
  width: 46px;
  height: 24px;
  border-radius: 6px;
}
.md-sk-line {
  width: 78%;
  height: 18px;
}
.md-sk-line.wide {
  width: 96%;
}
.md-sk-line.short {
  width: 62%;
}
.md-sk-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, 52px);
  gap: 12px;
  margin-top: 24px;
}
.md-sk-actions i {
  height: 52px;
  border-radius: 12px;
}
.md-sk-actions i:not(.primary) {
  border-radius: 50%;
}
.md-sk-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 24px;
}
.md-sk-stats div {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 0 7px;
  border-left: 1px solid #e2e6ee;
}
.md-sk-stats div:first-child {
  border-left: 0;
}
.md-sk-stats i {
  width: 42px;
  height: 16px;
}
.md-sk-stats b {
  width: 34px;
  height: 13px;
}
.md-sk-intro {
  display: grid;
  gap: 9px;
  margin-top: 24px;
}
.md-sk-intro i {
  width: 100%;
  height: 17px;
}
.md-sk-intro i.short {
  width: 68%;
}
.md-sk-section {
  min-height: 0;
}
.md-sk-section header i {
  width: 96px;
  height: 18px;
}
.md-sk-section header b {
  width: 72px;
  height: 14px;
}
.md-sk-tabs {
  display: flex;
  gap: 8px;
  overflow: hidden;
  padding: 14px 16px 2px;
}
.md-sk-tabs i {
  flex: 0 0 78px;
  height: 34px;
}
.md-sk-episodes {
  padding: 12px 14px 16px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.md-sk-episodes i {
  height: 38px;
}
.md-sk-related {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 9px;
  padding: 0 14px 16px;
}
.md-sk-related article {
  min-width: 0;
}
.md-sk-related article > i {
  width: 100%;
  aspect-ratio: 3 / 4;
}
.md-sk-related b {
  width: 86%;
  height: 15px;
  margin-top: 7px;
}
.md-sk-related em {
  width: 58%;
  height: 12px;
  margin-top: 5px;
}
@keyframes md-shimmer {
  to { background-position-x: -200%; }
}
</style>
