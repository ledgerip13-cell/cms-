<template>
  <main class="msearch" :style="{ '--msr-head-bg': headBg }">
    <header class="msr-head">
      <button class="msr-back" type="button" aria-label="返回" @click="goBack">
        <svg viewBox="0 0 24 24" v-html="icon('back')"></svg>
      </button>
      <form class="msr-form" @submit.prevent="submitSearch">
        <svg viewBox="0 0 24 24" v-html="icon('search')"></svg>
        <input ref="inputEl" v-model.trim="draftKw" enterkeyhint="search" placeholder="搜索电影、剧集、动漫、短剧" @focus="suggestOpen = true" @blur="closeSuggestSoon" />
        <button v-if="draftKw" class="msr-clear" type="button" aria-label="清空" @click="clearDraft">×</button>
        <div v-if="suggestOpen && hasSearchAssist" class="msr-suggest-pop">
          <button v-for="vod in searchSuggests" :key="vod.id" type="button" @mousedown.prevent @click="pickSuggest(vod)">
            <strong>{{ vod.name }}</strong>
            <span>{{ [vod.typeName, vod.year, vod.remarks].filter(Boolean).join(' · ') }}</span>
          </button>
          <button v-for="item in correctionSuggests" :key="`fix-${item.id}`" class="msr-correction" type="button" @mousedown.prevent @click="pickCorrection(item)">
            <strong>{{ item.kw || item.name }}</strong>
            <span>纠错推荐</span>
          </button>
        </div>
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

      <section v-if="hotWords.length" class="msr-section">
        <div class="msr-section-head">
          <h2>运营热搜词</h2>
        </div>
        <div class="msr-word-grid">
          <button v-for="word in hotWords" :key="word" type="button" @click="pickWord(word)">{{ word }}</button>
        </div>
      </section>

      <section v-if="suggestItems.length" class="msr-section">
        <div class="msr-section-head">
          <h2>猜你想搜</h2>
          <button type="button" aria-label="换一批" @click="refreshSuggest">
            <svg viewBox="0 0 24 24" v-html="icon('refresh')"></svg>
          </button>
        </div>
        <div class="msr-suggest-cards">
          <article v-for="vod in suggestItems" :key="vod.id" @click="goVod(vod)">
            <div class="msr-suggest-poster">
              <img class="m-img-fade" :src="poster(vod)" :alt="vod.name" loading="lazy" @load="onImgLoad" @error="onImgError($event)" />
              <span v-if="heatValue(vod)" class="msr-heat">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M13.5 2.6c.4 2.9 2.7 4.4 4 6.4 1.1 1.6 1.8 3.1 1.8 5.1 0 4.2-3.2 7.3-7.3 7.3s-7.3-3.1-7.3-7.3c0-2.8 1.5-5.2 3.6-6.7-.1 2.1.6 3.5 1.9 4.2.1-3.7 1.5-6.5 3.3-9z"/>
                </svg>
                热度值 {{ heatValue(vod) }}
              </span>
            </div>
            <strong>{{ vod.name }}</strong>
            <span>{{ suggestMeta(vod) }}</span>
          </article>
        </div>
      </section>

      <section v-if="showRankPanel" class="msr-rank-panel">
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

      <section class="msr-filter-panel" aria-label="搜索筛选">
        <div v-for="group in filterGroups" :key="group.key" class="msr-filter-row">
          <span>{{ group.label }}</span>
          <div>
            <button v-for="item in group.items" :key="`${group.key}-${item.value}`" type="button" :class="{ on: filterValue(group.key) === item.value }" @click="setFilter(group.key, item.value)">
              {{ item.label }}
            </button>
          </div>
        </div>
        <button v-if="hasActiveFilters" class="msr-filter-clear" type="button" @click="clearFilters">清除筛选</button>
      </section>

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
          <button v-if="activeKw && requestVodEnabled" type="button" :disabled="requesting" @click="submitVodRequest">
            {{ requesting ? '提交中...' : '一键求片' }}
          </button>
          <em v-if="requestMsg">{{ requestMsg }}</em>
        </div>
        <div v-else class="msr-card-grid">
          <article v-for="vod in resultItems" :key="vod.id" class="msr-card" @click="goVod(vod)">
            <div class="msr-poster">
              <img class="m-img-fade" :src="poster(vod)" :alt="vod.name" loading="lazy" @load="onImgLoad" @error="onImgError($event)" />
              <span v-if="posterTag(vod)">{{ posterTag(vod) }}</span>
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
const FILTER_KEYS = ['area', 'lang', 'year', 'finish', 'vip', 'minRating', 'sort']

const route = useRoute()
const router = useRouter()
const inputEl = ref(null)
const draftKw = ref('')
const historyWords = ref([])
const baseSuggestItems = ref([])
const suggestOffset = ref(0)
const rankTab = ref('hot')
const rankItems = ref([])
const hotWords = ref([])
const rankLoading = ref(false)
const rankCache = ref({})
const resultTab = ref('all')
const resultItems = ref([])
const resultLoading = ref(false)
const requesting = ref(false)
const requestMsg = ref('')
const interactionConfig = ref({ requestsEnabled: true })
const page = ref(1)
const hasMore = ref(false)
const headBg = ref('.9')
const rankTabsEl = ref(null)
const resultTabsEl = ref(null)
let rankRequestId = 0
let headRaf = 0
let suggestTimer = 0
let suggestSeq = 0

const rankTabs = [
  { key: 'hot', label: '综合热搜榜' },
  { key: 'short', label: '短剧热榜', type: '短剧' },
  { key: 'anime', label: '动漫热榜', type: '动漫' },
  { key: 'movie', label: '电影热榜', type: '电影' },
]
const resultTabs = [
  { key: 'all', label: '综合' },
  { key: 'anime', label: '动漫', type: '动漫' },
  { key: 'short', label: '短剧', type: '短剧' },
  { key: 'movie', label: '电影', type: '电影' },
  { key: 'tv', label: '电视剧', type: '电视剧' },
]
const searchSuggests = ref([])
const correctionSuggests = ref([])
const suggestOpen = ref(false)

const activeKw = computed(() => String(route.query.kw || '').trim())
const fromShorts = computed(() => String(route.query.from || '') === 'shorts')
const filterSignature = computed(() => FILTER_KEYS.map(key => `${key}:${String(route.query[key] || '')}`).join('|'))
const hasActiveFilters = computed(() => FILTER_KEYS.some(key => Boolean(route.query[key])))
const hasSearchAssist = computed(() => searchSuggests.value.length > 0 || correctionSuggests.value.length > 0)
const showRankPanel = computed(() => !hotWords.value.length && !(suggestOpen.value && hasSearchAssist.value))
const requestVodEnabled = computed(() => interactionConfig.value.requestsEnabled !== false)
const filterGroups = computed(() => [
  { key: 'area', label: '地区', items: optionItems(['大陆', '香港', '台湾', '日本', '韩国', '美国', '泰国', '英国']) },
  { key: 'lang', label: '语言', items: optionItems(['国语', '粤语', '英语', '日语', '韩语', '泰语']) },
  { key: 'year', label: '年份', items: optionItems(yearOptions()) },
  { key: 'finish', label: '状态', items: [{ label: '全部', value: '' }, { label: '完结', value: 'done' }, { label: '连载', value: 'updating' }] },
  { key: 'vip', label: '权限', items: [{ label: '全部', value: '' }, { label: '免费', value: 'free' }, { label: 'VIP', value: 'vip' }] },
  { key: 'minRating', label: '评分', items: [{ label: '全部', value: '' }, { label: '6+', value: '6' }, { label: '7+', value: '7' }, { label: '8+', value: '8' }] },
  { key: 'sort', label: '排序', items: [{ label: '热度', value: '' }, { label: '高分', value: 'rating' }, { label: '最新', value: 'recent' }, { label: '年份', value: 'year' }] },
])
const suggestItems = computed(() => {
  const items = baseSuggestItems.value.filter(vod => vod?.id && vod?.name)
  if (!items.length) return []
  const start = Math.min(suggestOffset.value, Math.max(0, items.length - 1))
  return [...items.slice(start), ...items.slice(0, start)].slice(0, 4)
})

function optionItems(values) {
  return [{ label: '全部', value: '' }, ...values.map(value => ({ label: value, value }))]
}

function yearOptions() {
  const year = new Date().getFullYear()
  return [year, year - 1, year - 2, year - 3, year - 4, year - 5].map(String).concat('2005年以前')
}

function currentFilterQuery() {
  const out = {}
  for (const key of FILTER_KEYS) {
    const value = String(route.query[key] || '').trim()
    if (value) out[key] = value
  }
  return out
}

function filterValue(key) {
  return String(route.query[key] || '')
}

function setFilter(key, value) {
  const query = { ...route.query }
  if (value) query[key] = value
  else delete query[key]
  page.value = 1
  router.replace({ path: '/m/search', query })
}

function clearFilters() {
  const query = { ...route.query }
  for (const key of FILTER_KEYS) delete query[key]
  page.value = 1
  router.replace({ path: '/m/search', query })
}

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
  const len = Math.max(1, baseSuggestItems.value.length)
  suggestOffset.value = (suggestOffset.value + 4) % len
}

function clearDraft() {
  draftKw.value = ''
  searchSuggests.value = []
  correctionSuggests.value = []
  inputEl.value?.focus?.()
}

function submitSearch() {
  const kw = draftKw.value.trim()
  const baseQuery = { ...(fromShorts.value ? { from: 'shorts' } : {}), ...currentFilterQuery() }
  if (!kw) {
    router.replace({ path: '/m/search', query: baseQuery })
    return
  }
  saveHistory(kw)
  router.replace({ path: '/m/search', query: { ...baseQuery, kw } })
}

function pickWord(word) {
  draftKw.value = word
  submitSearch()
}

function pickSuggest(vod) {
  draftKw.value = String(vod?.name || '').trim()
  searchSuggests.value = []
  correctionSuggests.value = []
  suggestOpen.value = false
  submitSearch()
}

function pickCorrection(item) {
  draftKw.value = String(item?.kw || item?.name || '').trim()
  searchSuggests.value = []
  correctionSuggests.value = []
  suggestOpen.value = false
  submitSearch()
}

function closeSuggestSoon() {
  window.setTimeout(() => { suggestOpen.value = false }, 120)
}

async function loadSearchSuggests() {
  const kw = String(draftKw.value || '').trim()
  if (!kw || kw === activeKw.value) {
    searchSuggests.value = []
    correctionSuggests.value = []
    return
  }
  const seq = ++suggestSeq
  try {
    const [suggestResult, correctionResult] = await Promise.allSettled([
      api.vodSuggest(kw, 8),
      kw.length >= 2 ? api.searchCorrections(kw, 3) : Promise.resolve([]),
    ])
    if (seq !== suggestSeq) return
    const rows = suggestResult.status === 'fulfilled' && Array.isArray(suggestResult.value) ? suggestResult.value : []
    const fixes = correctionResult.status === 'fulfilled' && Array.isArray(correctionResult.value) ? correctionResult.value : []
    const seen = new Set(rows.map(vod => Number(vod?.id)).filter(Boolean))
    searchSuggests.value = rows.filter(vod => vod?.id && vod?.name).slice(0, 8)
    correctionSuggests.value = fixes.filter(item => item?.id && !seen.has(Number(item.id)) && (item?.kw || item?.name)).slice(0, 3)
    suggestOpen.value = hasSearchAssist.value
  } catch {
    if (seq === suggestSeq) {
      searchSuggests.value = []
      correctionSuggests.value = []
    }
  }
}

async function loadHotWords() {
  try {
    const rows = await api.searchHotTerms(10)
    hotWords.value = Array.isArray(rows) ? rows.map(row => String(row?.kw || '').trim()).filter(Boolean).slice(0, 10) : []
  } catch {
    hotWords.value = []
  }
}

async function loadInteractionConfig() {
  try {
    interactionConfig.value = { requestsEnabled: true, ...(await api.interactionConfig()) }
  } catch {
    interactionConfig.value = { requestsEnabled: true }
  }
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
  headBg.value = Math.max(.9, Math.min(1, .9 + (window.scrollY / 88) * .1)).toFixed(3)
}

function onPageScroll() {
  if (headRaf) return
  headRaf = window.requestAnimationFrame(syncHeadBg)
}

function goBack() {
  if (fromShorts.value) {
    router.push('/m/shorts')
    return
  }
  if (window.history.length > 1) router.back()
  else router.push('/m')
}

function goVod(vod) {
  if (!vod?.id) return
  if (fromShorts.value) {
    router.push({ path: '/m/shorts', query: { play: vod.id } })
    return
  }
  router.push(`/m/detail/${vod.id}`)
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
  if (vod?.heatValue) return String(vod.heatValue)
  const ratingCount = Math.max(0, Number(vod?.ratingCount) || 0)
  const popularity = Math.max(0, Number(vod?.popularity) || 0)
  const n = Math.max(ratingCount, popularity > 0 ? Math.round(popularity * 1000) : 0)
  if (!n) return ''
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`
  return String(n)
}

function vodStatus(vod) {
  const text = String(vod?.remarks || '')
  const full = text.match(/全\s*(\d+)\s*(集|话|期|回)/i)
  if (full) return { label: `全${full[1]}集`, type: 'done' }
  if (/完结|已完结|全集|大结局|终章/i.test(text)) return { label: '完结', type: 'done' }
  const updating = text.match(/(?:更新至|更新到|更至)\s*第?\s*(\d+)\s*(集|话|期|回)?|^第\s*(\d+)\s*(集|话|期|回)$/i)
  if (updating) return { label: `更新至${updating[1] || updating[3]}集`, type: 'updating' }
  return null
}

function suggestMeta(vod) {
  const type = vod?.typeName || '影片'
  const status = vodStatus(vod)
  return status ? `${type} · ${status.label}` : type
}

function posterTag(vod) {
  return vodStatus(vod)?.label || String(vod?.remarks || '').trim()
}

function isFreshVod(vod) {
  const t = Date.parse(vod?.contentUpdatedAt || vod?.createdAt || '')
  return Number.isFinite(t) && Date.now() - t < 1000 * 60 * 60 * 24 * 21
}

function rankTag(vod) {
  const status = vodStatus(vod)
  if (status) return status
  if (isFreshVod(vod)) return { label: '新剧', type: 'fresh' }
  return { label: '热门', type: 'hot' }
}

async function loadDiscovery() {
  try {
    const hot = await api.hot(16)
    const rows = Array.isArray(hot) ? hot.filter(vod => vod?.id && vod?.name) : []
    baseSuggestItems.value = rows
    rankCache.value = { ...rankCache.value, hot: rows.slice(0, 12) }
    if (rankTab.value === 'hot') rankItems.value = rows.slice(0, 12)
  } catch {
    baseSuggestItems.value = []
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
    sort: String(route.query.sort || 'hot'),
    kw: activeKw.value,
    ...(tab.type ? { type: tab.type } : {}),
    ...currentFilterQuery(),
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
    if (!append) api.logSearch({ kw: activeKw.value, source: fromShorts.value ? 'mobile_shorts' : 'mobile', resultCount: Number(res.total ?? next.length) || next.length })
  } catch {
    if (!append) resultItems.value = []
    hasMore.value = false
  } finally {
    resultLoading.value = false
  }
}

async function submitVodRequest() {
  const title = activeKw.value
  if (!title || requesting.value) return
  requesting.value = true
  requestMsg.value = ''
  try {
    await api.requestVod({ title, source: 'mobile' })
    requestMsg.value = '已提交到后台'
  } catch (e) {
    requestMsg.value = e?.response?.data?.error || e?.message || '提交失败'
  } finally {
    requesting.value = false
  }
}

async function loadMore() {
  page.value += 1
  await loadResults({ append: true })
}

watch([activeKw, filterSignature], async ([kw], [oldKw] = []) => {
  draftKw.value = kw
  page.value = 1
  if (kw !== oldKw) resultTab.value = 'all'
  if (kw) await loadResults()
  else {
    resultItems.value = []
    hasMore.value = false
    await nextTick()
    inputEl.value?.focus?.()
  }
}, { immediate: true })

watch(draftKw, () => {
  clearTimeout(suggestTimer)
  suggestTimer = window.setTimeout(loadSearchSuggests, 180)
})

watch(rankTab, async () => {
  await Promise.allSettled([loadRank(), syncHorizontalTabs()])
})
watch(resultTab, syncHorizontalTabs)
watch(activeKw, syncHorizontalTabs)

onMounted(async () => {
  syncHeadBg()
  window.addEventListener('scroll', onPageScroll, { passive: true })
  readHistory()
  await Promise.allSettled([loadDiscovery(), loadHotWords(), loadInteractionConfig()])
  if (!rankItems.value.length) await loadRank()
  await nextTick()
  syncHorizontalTabs()
  inputEl.value?.focus?.()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onPageScroll)
  if (headRaf) cancelAnimationFrame(headRaf)
  clearTimeout(suggestTimer)
})
</script>

<style scoped>
.msearch {
  min-height: 100dvh;
  padding: calc(env(safe-area-inset-top) + 62px) 14px 28px;
  background: #fffefe;
  color: #1f232b;
}
.msr-head {
  position: fixed;
  z-index: 20;
  left: 0;
  right: 0;
  top: 0;
  margin: 0;
  padding: calc(env(safe-area-inset-top) + 8px) 15px 10px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 46px;
  align-items: center;
  gap: 9px;
  background: rgb(255 255 255 / var(--msr-head-bg));
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
  width: 34px;
  height: 34px;
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
.msr-back svg {
  width: 23px;
  height: 23px;
}
.msr-form {
  height: 44px;
  min-width: 0;
  border-radius: 22px;
  padding: 0 9px 0 15px;
  display: flex;
  align-items: center;
  gap: 9px;
  background: #f2f3f5;
  box-shadow: none;
  position: relative;
}
.msr-form svg {
  width: 18px;
  height: 18px;
  color: #8f96a3;
}
.msr-form input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #1f232b;
  font-size: 16px;
  font-weight: 500;
}
.msr-form input::placeholder {
  color: #a6abb4;
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
  height: 40px;
  padding: 0;
  color: #111318;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0;
}
.msr-suggest-pop {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  z-index: 30;
  padding: 6px;
  border: 1px solid #eceef2;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 14px 34px rgba(21, 25, 36, .14);
}
.msr-suggest-pop button {
  width: 100%;
  min-height: 42px;
  border: 0;
  border-radius: 10px;
  padding: 7px 10px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
}
.msr-suggest-pop button:active {
  background: #f4f5f7;
}
.msr-suggest-pop .msr-correction {
  background: #fff8ed;
}
.msr-suggest-pop .msr-correction:active {
  background: #ffefd8;
}
.msr-suggest-pop .msr-correction span {
  color: #d17b18;
}
.msr-suggest-pop strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1f232b;
  font-size: 14px;
  font-weight: 500;
}
.msr-suggest-pop span {
  flex: 0 0 auto;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #8d95a1;
  font-size: 12px;
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
  gap: 0;
}
.msr-word-grid button {
  min-width: 0;
  height: 34px;
  border: 0;
  border-radius: 12px;
  padding: 0 8px;
  background: transparent;
  color: #3c424d;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.1;
  text-align: left;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  box-shadow: none;
}
.msr-suggest-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.msr-suggest-cards article {
  min-width: 0;
  touch-action: manipulation;
}
.msr-suggest-poster {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background: #e7e9ee;
  box-shadow: 0 8px 22px rgba(17, 24, 39, .08);
}
.msr-suggest-poster::after,
.msr-rank-poster::after,
.msr-poster::after {
  content: "";
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  bottom: 0;
  height: 36%;
  background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.34));
  pointer-events: none;
}
.msr-suggest-cards img {
  width: 100%;
  aspect-ratio: 3 / 4.1;
  object-fit: cover;
}
.msr-heat {
  position: absolute;
  z-index: 4;
  left: 7px;
  bottom: 7px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: calc(100% - 14px);
  color: #fff;
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  text-shadow: 0 1px 4px rgba(0,0,0,.48);
}
.msr-heat svg {
  width: 11px;
  height: 11px;
  fill: currentColor;
}
.msr-suggest-cards strong {
  display: block;
  margin-top: 7px;
  color: var(--mobile-vod-card-title-color);
  font-size: var(--mobile-vod-card-title-size);
  font-weight: var(--mobile-vod-card-title-weight);
  line-height: var(--mobile-vod-card-title-line);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.msr-suggest-cards span {
  display: block;
  margin-top: 3px;
  color: #8c929d;
  font-size: 11px;
  line-height: 1.2;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.msr-suggest-cards .msr-heat {
  display: inline-flex;
  margin-top: 0;
  color: #fff;
}
.msr-rank-panel {
  margin-top: 20px;
  margin-left: -14px;
  margin-right: -14px;
  padding: 14px 14px 15px;
  border-radius: 10px 10px 0 0;
  background:
    linear-gradient(118deg, rgba(255, 239, 235, .96) 0%, rgba(242, 250, 246, .98) 50%, rgba(226, 244, 236, .98) 100%),
    #fff;
  box-shadow: 0 10px 28px rgba(33, 38, 48, .06);
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
  color: #8b919c;
  font-weight: 700;
}
.msr-rank-tabs button {
  height: 34px;
  padding: 0 5px;
  font-size: 16px;
  font-weight: 500;
}
.msr-rank-tabs button.on {
  color: #15171c;
  font-weight: 500;
}
.msr-result-tabs button.on {
  color: #15171c;
  font-weight: 900;
}
.msr-rank-grid {
  margin-top: 9px;
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
  z-index: 3;
  color: #fff;
  font-weight: 900;
}
.msr-rank-no {
  left: 0;
  top: 0;
  min-width: 25px;
  height: 24px;
  border-radius: 10px 0 10px 0;
  display: grid;
  place-items: center;
  background: rgba(30, 34, 42, .72);
  box-shadow: 0 4px 12px rgba(0, 0, 0, .14);
  font-size: 12px;
  font-style: italic;
  overflow: hidden;
}
.msr-rank-card:nth-child(1) .msr-rank-no {
  background: linear-gradient(135deg, #ff4b3e, #ff8a4a);
}
.msr-rank-card:nth-child(2) .msr-rank-no {
  background: linear-gradient(135deg, #ff8c2f, #ffc247);
}
.msr-rank-card:nth-child(3) .msr-rank-no {
  background: linear-gradient(135deg, #ffbd36, #ffe07a);
  color: #6a4300;
}
.msr-rank-card:nth-child(-n + 3) .msr-rank-no::before {
  content: "";
  position: absolute;
  left: -9px;
  top: -10px;
  width: 23px;
  height: 35px;
  transform: rotate(38deg);
  background: linear-gradient(90deg, rgba(255,255,255,.86), rgba(255,255,255,.22), rgba(255,255,255,0));
  pointer-events: none;
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
.msr-rank-tag.updating {
  background: rgba(31, 119, 255, .9);
}
.msr-rank-tag.done {
  background: rgba(33, 6, 6, .62);
}
.msr-rank-card strong,
.msr-card strong {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  margin-top: 7px;
  color: var(--mobile-vod-card-title-color);
  font-size: var(--mobile-vod-card-title-size);
  font-weight: var(--mobile-vod-card-title-weight);
  line-height: var(--mobile-vod-card-title-line);
}
.msr-rank-card p,
.msr-card p {
  margin: 4px 0 0;
  color: #8c929d;
  font-size: 12px;
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
.msr-filter-panel {
  margin: 0 -14px 14px;
  padding: 0 14px 12px;
  background: #f7f7f8;
  border-bottom: 1px solid #eceef2;
}
.msr-filter-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  margin-top: 8px;
}
.msr-filter-row > span {
  color: #8b929f;
  font-size: 12px;
  line-height: 30px;
}
.msr-filter-row > div {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  scrollbar-width: none;
}
.msr-filter-row > div::-webkit-scrollbar {
  display: none;
}
.msr-filter-row button,
.msr-filter-clear {
  border: 0;
}
.msr-filter-row button {
  flex: 0 0 auto;
  height: 30px;
  border-radius: 999px;
  padding: 0 11px;
  background: #fff;
  color: #555e6e;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 6px 14px rgba(17, 24, 39, .04);
}
.msr-filter-row button.on {
  background: #111318;
  color: #fff;
}
.msr-filter-clear {
  height: 30px;
  margin-top: 10px;
  border-radius: 999px;
  padding: 0 12px;
  background: #fff;
  color: #f04438;
  font-size: 12px;
  font-weight: 700;
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
.msr-empty button {
  justify-self: center;
  height: 34px;
  border: 0;
  border-radius: 12px;
  padding: 0 16px;
  background: #1f232b;
  color: #fff;
  font-weight: 900;
}
.msr-empty em {
  color: #5f6672;
  font-size: 12px;
  font-style: normal;
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
