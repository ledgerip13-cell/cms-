<template>
  <main class="msearch" :style="{ '--msr-head-bg': headBg }">
    <header class="msr-head">
      <button class="msr-back" type="button" aria-label="返回" @click="goBack">
        <svg viewBox="0 0 24 24" v-html="icon('back')"></svg>
      </button>
      <form class="msr-form" @submit.prevent="submitSearch">
        <svg viewBox="0 0 24 24" v-html="icon('search')"></svg>
        <input ref="inputEl" v-model.trim="draftKw" enterkeyhint="search" placeholder="搜索电影、剧集、动漫、短剧" />
        <button v-if="draftKw" class="msr-clear" type="button" aria-label="清空" @click="clearDraft">×</button>
      </form>
      <button class="msr-submit" type="button" @click="submitSearch">搜索</button>
    </header>

    <template v-if="!activeKw">
      <section v-if="historyWords.length" class="msr-section">
        <div class="msr-section-head">
          <h2>搜索历史</h2>
          <button type="button" aria-label="清空搜索历史" @click="clearHistory">
            <svg viewBox="0 0 24 24" v-html="icon('trash')"></svg>
          </button>
        </div>
        <div class="msr-word-grid">
          <button v-for="word in historyWords" :key="word" type="button" @click="pickWord(word)">{{ word }}</button>
        </div>
      </section>

      <section class="msr-section">
        <div class="msr-section-head">
          <h2>猜你想搜</h2>
          <button type="button" aria-label="换一批" @click="refreshSuggest">
            <svg viewBox="0 0 24 24" v-html="icon('refresh')"></svg>
          </button>
        </div>
        <div class="msr-word-grid msr-suggest-grid">
          <button v-for="word in suggestWords" :key="word" type="button" @click="pickWord(word)">{{ word }}</button>
        </div>
      </section>

      <section class="msr-rank-panel">
        <nav ref="rankTabsEl" class="msr-rank-tabs" aria-label="热搜榜">
          <button v-for="tab in rankTabs" :key="tab.key" type="button" :class="{ on: rankTab === tab.key }" @click="rankTab = tab.key">
            {{ tab.label }}
          </button>
        </nav>
        <div v-if="rankLoading" class="msr-rank-grid">
          <div v-for="i in 6" :key="i" class="msr-rank-card msr-sk">
            <div></div>
            <b></b>
            <p></p>
          </div>
        </div>
        <div v-else class="msr-rank-grid">
          <article v-for="(vod, index) in rankItems" :key="vod.id" class="msr-rank-card" @click="goVod(vod)">
            <div class="msr-rank-poster">
              <img class="m-img-fade" :src="poster(vod)" :alt="vod.name" loading="lazy" @load="onImgLoad" @error="onImgError($event)" />
              <span class="msr-rank-no">{{ index + 1 }}</span>
              <span class="msr-rank-tag" :class="rankTag(vod).type">{{ rankTag(vod).label }}</span>
            </div>
            <strong>{{ vod.name }}</strong>
            <p>{{ heatValue(vod) }} 热搜值</p>
          </article>
        </div>
      </section>
    </template>

    <template v-else>
      <nav ref="resultTabsEl" class="msr-result-tabs" aria-label="搜索结果分类">
        <button v-for="tab in resultTabs" :key="tab.key" type="button" :class="{ on: resultTab === tab.key }" @click="pickResultTab(tab.key)">
          {{ tab.label }}
        </button>
      </nav>

      <section class="msr-results">
        <div v-if="resultLoading && !resultItems.length" class="msr-card-grid">
          <div v-for="i in 8" :key="i" class="msr-card msr-sk">
            <div></div>
            <b></b>
            <p></p>
          </div>
        </div>
        <div v-else-if="!resultItems.length" class="msr-empty">
          <strong>没有找到相关影片</strong>
          <span>换个关键词试试</span>
        </div>
        <div v-else class="msr-card-grid">
          <article v-for="vod in resultItems" :key="vod.id" class="msr-card" @click="goVod(vod)">
            <div class="msr-poster">
              <img class="m-img-fade" :src="poster(vod)" :alt="vod.name" loading="lazy" @load="onImgLoad" @error="onImgError($event)" />
              <span v-if="vod.remarks">{{ vod.remarks }}</span>
            </div>
            <strong>{{ vod.name }}</strong>
            <p>
              {{ vod.typeName || '未分类' }}
              <template v-if="vod.year"> · {{ vod.year }}</template>
              <template v-if="heatValue(vod)"> · {{ heatValue(vod) }}热度</template>
            </p>
          </article>
        </div>
        <button v-if="hasMore && !resultLoading" class="msr-more" type="button" @click="loadMore">加载更多</button>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { icon } from './icons'

const HISTORY_KEY = 'vcms.mobile.search.history'

const route = useRoute()
const router = useRouter()
const inputEl = ref(null)
const draftKw = ref('')
const historyWords = ref([])
const baseSuggestWords = ref([])
const suggestOffset = ref(0)
const rankTab = ref('hot')
const rankItems = ref([])
const rankLoading = ref(false)
const rankCache = ref({})
const resultTab = ref('all')
const resultItems = ref([])
const resultLoading = ref(false)
const page = ref(1)
const hasMore = ref(false)
const headBg = ref('0')
const rankTabsEl = ref(null)
const resultTabsEl = ref(null)
let rankRequestId = 0
let headRaf = 0

const rankTabs = [
  { key: 'hot', label: '热门榜' },
  { key: 'short', label: '短剧榜', type: '短剧' },
  { key: 'anime', label: '动漫榜', type: '动漫' },
  { key: 'movie', label: '电影榜', type: '电影' },
]
const resultTabs = [
  { key: 'all', label: '综合' },
  { key: 'anime', label: '动漫', type: '动漫' },
  { key: 'short', label: '短剧', type: '短剧' },
  { key: 'movie', label: '电影', type: '电影' },
  { key: 'tv', label: '电视剧', type: '电视剧' },
]

const activeKw = computed(() => String(route.query.kw || '').trim())
const suggestWords = computed(() => {
  const words = uniqueWords([...baseSuggestWords.value, '热门短剧', '动漫', '电影', '电视剧', '热播', '上新'])
  const start = Math.min(suggestOffset.value, Math.max(0, words.length - 1))
  return [...words.slice(start), ...words.slice(0, start)].slice(0, 4)
})

function uniqueWords(words) {
  return [...new Set(words.map(x => String(x || '').trim()).filter(Boolean))]
}

function readHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    historyWords.value = Array.isArray(rows) ? uniqueWords(rows).slice(0, 10) : []
  } catch {
    historyWords.value = []
  }
}

function saveHistory(word) {
  const value = String(word || '').trim()
  if (!value) return
  historyWords.value = uniqueWords([value, ...historyWords.value]).slice(0, 10)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyWords.value))
}

function clearHistory() {
  historyWords.value = []
  localStorage.removeItem(HISTORY_KEY)
}

function refreshSuggest() {
  const len = Math.max(1, baseSuggestWords.value.length)
  suggestOffset.value = (suggestOffset.value + 4) % len
}

function clearDraft() {
  draftKw.value = ''
  inputEl.value?.focus?.()
}

function submitSearch() {
  const kw = draftKw.value.trim()
  if (!kw) {
    router.replace({ path: '/m/search' })
    return
  }
  saveHistory(kw)
  router.replace({ path: '/m/search', query: { kw } })
}

function pickWord(word) {
  draftKw.value = word
  submitSearch()
}

function pickResultTab(key) {
  resultTab.value = key
  page.value = 1
  loadResults()
}

function keepActiveTabVisible(containerRef) {
  const container = containerRef.value
  const active = container?.querySelector?.('button.on')
  if (!container || !active || container.scrollWidth <= container.clientWidth) return
  const left = active.offsetLeft
  const maxLeft = container.scrollWidth - container.clientWidth
  const nextLeft = Math.max(0, Math.min(maxLeft, left - ((container.clientWidth - active.offsetWidth) / 2)))
  if (Math.abs(container.scrollLeft - nextLeft) < 1) return
  container.scrollTo({ left: nextLeft, behavior: 'smooth' })
}

async function syncHorizontalTabs() {
  await nextTick()
  keepActiveTabVisible(rankTabsEl)
  keepActiveTabVisible(resultTabsEl)
}

function syncHeadBg() {
  headRaf = 0
  headBg.value = Math.max(0, Math.min(.9, (window.scrollY / 88) * .9)).toFixed(3)
}

function onPageScroll() {
  if (headRaf) return
  headRaf = window.requestAnimationFrame(syncHeadBg)
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/m')
}

function goVod(vod) {
  if (!vod?.id) return
  router.push(`/m/play/${vod.id}`)
}

function poster(vod) {
  return imgUrl(vod?.officialPic || vod?.pic || vod?.localPic || vod?.heroImage || vod?.heroPic || '')
}

function onImgError(event) {
  const img = event?.target
  if (img) img.style.visibility = 'hidden'
}

function onImgLoad(event) {
  event?.target?.classList?.add('is-loaded')
}

function heatValue(vod) {
  const n = Number(vod?.ratingCount || vod?._count?.plays || 0)
  if (!n) return ''
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`
  return String(n)
}

function isDoneVod(vod) {
  return /完结|已完结|全集|全\s*\d+\s*(集|话|期|回)|大结局|终章/i.test(String(vod?.remarks || ''))
}

function isFreshVod(vod) {
  const t = Date.parse(vod?.contentUpdatedAt || vod?.createdAt || '')
  return Number.isFinite(t) && Date.now() - t < 1000 * 60 * 60 * 24 * 21
}

function rankTag(vod) {
  if (isDoneVod(vod)) return { label: '完结', type: 'done' }
  if (isFreshVod(vod)) return { label: '新剧', type: 'fresh' }
  return { label: '热门', type: 'hot' }
}

async function loadSuggest() {
  try {
    const hot = await api.hot(14)
    baseSuggestWords.value = uniqueWords((hot || []).map(v => v.name))
  } catch {
    baseSuggestWords.value = []
  }
}

async function loadRank() {
  const tab = rankTabs.find(x => x.key === rankTab.value) || rankTabs[0]
  const cached = rankCache.value[tab.key]
  if (cached) {
    rankItems.value = cached
    rankLoading.value = false
    return
  }
  const requestId = ++rankRequestId
  rankLoading.value = true
  try {
    let rows = []
    if (tab.key === 'hot') {
      rows = (await api.hot(12)) || []
    } else {
      const res = await api.vods({ page: 1, size: 12, sort: 'hot', type: tab.type })
      rows = res.list || []
    }
    if (requestId !== rankRequestId || rankTab.value !== tab.key) return
    rankCache.value = { ...rankCache.value, [tab.key]: rows }
    rankItems.value = rows
  } catch {
    if (requestId !== rankRequestId || rankTab.value !== tab.key) return
    rankItems.value = []
  } finally {
    if (requestId === rankRequestId) rankLoading.value = false
  }
}

function resultParams(extra = {}) {
  const tab = resultTabs.find(x => x.key === resultTab.value) || resultTabs[0]
  return {
    page: page.value,
    size: 20,
    sort: 'hot',
    kw: activeKw.value,
    ...(tab.type ? { type: tab.type } : {}),
    ...extra,
  }
}

async function loadResults({ append = false } = {}) {
  if (!activeKw.value) {
    resultItems.value = []
    hasMore.value = false
    return
  }
  resultLoading.value = true
  try {
    const res = await api.vods(resultParams())
    const next = res.list || []
    resultItems.value = append ? [...resultItems.value, ...next] : next
    hasMore.value = Boolean(res.hasMore)
  } catch {
    if (!append) resultItems.value = []
    hasMore.value = false
  } finally {
    resultLoading.value = false
  }
}

async function loadMore() {
  page.value += 1
  await loadResults({ append: true })
}

watch(activeKw, async (kw) => {
  draftKw.value = kw
  page.value = 1
  resultTab.value = 'all'
  if (kw) await loadResults()
  else {
    resultItems.value = []
    hasMore.value = false
    await nextTick()
    inputEl.value?.focus?.()
  }
}, { immediate: true })

watch(rankTab, async () => {
  await Promise.allSettled([loadRank(), syncHorizontalTabs()])
})
watch(resultTab, syncHorizontalTabs)
watch(activeKw, syncHorizontalTabs)

onMounted(async () => {
  syncHeadBg()
  window.addEventListener('scroll', onPageScroll, { passive: true })
  readHistory()
  await Promise.allSettled([loadSuggest(), loadRank()])
  await nextTick()
  syncHorizontalTabs()
  inputEl.value?.focus?.()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onPageScroll)
  if (headRaf) cancelAnimationFrame(headRaf)
})
</script>

<style scoped>
.msearch {
  min-height: 100dvh;
  padding: calc(env(safe-area-inset-top) + 62px) 14px 28px;
  background: #f7f7f8;
  color: #1f232b;
}
.msr-head {
  position: fixed;
  z-index: 20;
  left: 0;
  right: 0;
  top: 0;
  margin: 0;
  padding: calc(env(safe-area-inset-top) + 10px) 14px 10px;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 8px;
  background: rgb(255 244 241 / var(--msr-head-bg));
  backdrop-filter: blur(9px);
  transition: background .16s ease;
}
.msr-back,
.msr-submit,
.msr-section-head button {
  border: 0;
  background: transparent;
}
.msr-back {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #1f232b;
}
.msr-back svg,
.msr-form svg,
.msr-section-head svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.msr-form {
  height: 40px;
  min-width: 0;
  border-radius: 999px;
  padding: 0 8px 0 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 10px 24px rgba(56, 31, 24, .06);
}
.msr-form svg {
  width: 18px;
  height: 18px;
  color: #9aa0aa;
}
.msr-form input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #1f232b;
  font-size: 14px;
}
.msr-form input::placeholder {
  color: #a1a6af;
}
.msr-clear {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: #f0f1f4;
  color: #8e949f;
  font-size: 17px;
  line-height: 1;
}
.msr-submit {
  height: 36px;
  padding: 0;
  color: #f04438;
  font-size: 14px;
  font-weight: 900;
}
.msr-section {
  margin-top: 18px;
}
.msr-section-head {
  height: 30px;
  margin-bottom: 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.msr-section-head h2 {
  margin: 0;
  font-size: 17px;
  line-height: 1;
}
.msr-section-head button {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #9aa0aa;
}
.msr-word-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}
.msr-word-grid button {
  min-width: 0;
  height: 38px;
  border: 0;
  border-radius: 12px;
  padding: 0 12px;
  background: #fff;
  color: #3c424d;
  font-size: 13px;
  font-weight: 800;
  text-align: left;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  box-shadow: 0 8px 20px rgba(17, 24, 39, .04);
}
.msr-suggest-grid {
  gap: 0;
}
.msr-suggest-grid button {
  background: transparent;
  box-shadow: none;
}
.msr-rank-panel {
  margin-top: 20px;
  padding: 12px;
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 238, 231, .95), rgba(255, 255, 255, .96)),
    #fff;
  box-shadow: 0 12px 30px rgba(88, 30, 20, .08);
}
.msr-rank-tabs,
.msr-result-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}
.msr-rank-tabs::-webkit-scrollbar,
.msr-result-tabs::-webkit-scrollbar {
  display: none;
}
.msr-rank-tabs button,
.msr-result-tabs button {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: #2106069e;
  font-weight: 900;
}
.msr-rank-tabs button {
  height: 34px;
  padding: 0 4px;
  font-size: 15px;
}
.msr-rank-tabs button.on,
.msr-result-tabs button.on {
  color: #f04438;
}
.msr-rank-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 8px;
}
.msr-rank-poster,
.msr-poster {
  position: relative;
  overflow: hidden;
  background: #e7e9ee;
}
.msr-rank-poster {
  aspect-ratio: 3 / 4.2;
  border-radius: 10px;
}
.msr-rank-poster img,
.msr-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.msr-rank-no,
.msr-rank-tag,
.msr-poster span {
  position: absolute;
  color: #fff;
  font-weight: 900;
}
.msr-rank-no {
  left: 5px;
  top: 5px;
  min-width: 20px;
  height: 20px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #ff7b4c, #f04438);
  font-size: 11px;
}
.msr-rank-tag {
  right: 5px;
  top: 5px;
  padding: 4px 6px;
  border-radius: 999px;
  background: rgba(240, 68, 56, .92);
  font-size: 11px;
  line-height: 1;
}
.msr-rank-tag.hot {
  background: rgba(240, 68, 56, .92);
}
.msr-rank-tag.fresh {
  background: rgba(31, 119, 255, .9);
}
.msr-rank-tag.done {
  background: rgba(33, 6, 6, .62);
}
.msr-rank-card strong,
.msr-card strong {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  margin-top: 7px;
  color: #20242d;
  font-size: 13px;
  line-height: 1.25;
}
.msr-rank-card p,
.msr-card p {
  margin: 4px 0 0;
  color: #8c929d;
  font-size: 11px;
  line-height: 1.25;
}
.msr-result-tabs {
  position: sticky;
  z-index: 18;
  top: calc(env(safe-area-inset-top) + 52px);
  margin: 0 -14px 12px;
  padding: 0 14px 10px;
  background: linear-gradient(180deg, rgba(255, 244, 241, .94), rgba(247, 247, 248, .94));
}
.msr-result-tabs button {
  height: 36px;
  border-radius: 999px;
  padding: 0 14px;
  background: #fff;
  font-size: 14px;
  box-shadow: 0 8px 18px rgba(17, 24, 39, .04);
}
.msr-result-tabs button.on {
  color: #fff;
  background: linear-gradient(135deg, #ff6a4f, #f04438);
}
.msr-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 10px;
}
.msr-poster {
  aspect-ratio: 3 / 4.1;
  border-radius: 12px;
  box-shadow: 0 8px 22px rgba(17, 24, 39, .08);
}
.msr-poster span {
  left: 7px;
  bottom: 7px;
  max-width: calc(100% - 14px);
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, .52);
  font-size: 10px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.msr-more {
  width: 100%;
  height: 42px;
  margin-top: 18px;
  border: 0;
  border-radius: 999px;
  color: #f04438;
  background: #fff;
  font-weight: 900;
}
.msr-empty {
  min-height: 180px;
  border-radius: 18px;
  display: grid;
  place-content: center;
  gap: 6px;
  text-align: center;
  background: #fff;
  color: #9aa0aa;
}
.msr-empty strong {
  color: #2a2f38;
}
.msr-sk div,
.msr-sk b,
.msr-sk p {
  display: block;
  border-radius: 10px;
  background: linear-gradient(90deg, #eceef2, #f8f8fa, #eceef2);
  background-size: 200% 100%;
  animation: msr-sk 1.1s infinite linear;
}
.msr-sk div {
  aspect-ratio: 3 / 4.15;
}
.msr-sk b {
  height: 13px;
  margin-top: 8px;
}
.msr-sk p {
  width: 72%;
  height: 10px;
}
@keyframes msr-sk {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}
</style>
