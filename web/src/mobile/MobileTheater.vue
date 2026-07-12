<template>
  <main class="mt" :style="{ '--mt-head-bg': headBg }">
    <header class="mt-head">
      <form class="mt-search" @submit.prevent="submitSearch">
        <svg viewBox="0 0 24 24" v-html="icon('search')"></svg>
        <input v-model.trim="draftKw" enterkeyhint="search" placeholder="搜索电影、剧集、动漫、短剧" @focus="openSearch" />
        <button v-if="draftKw" type="submit">搜索</button>
      </form>
    </header>

    <section v-if="rankItems.length" class="mt-section">
      <div class="mt-section-head">
        <h2>{{ rankTitle }}</h2>
        <button type="button" @click="pickSort('hot')">更多</button>
      </div>
      <div class="mt-rank">
        <article v-for="(vod, index) in rankItems" :key="vod.id" @click="goPlay(vod.id)">
          <div class="mt-rank-poster">
            <img :src="poster(vod)" :alt="vod.name" loading="lazy" @error="onImgError($event)" />
            <b>{{ index + 1 }}</b>
          </div>
          <strong>{{ vod.name }}</strong>
          <span>{{ compactCount(vod.ratingCount || vod._count?.plays || 0) }}热度</span>
        </article>
      </div>
    </section>

    <nav ref="typeTabsEl" class="mt-types" aria-label="影片大类">
      <button type="button" :class="{ on: !type }" @click="pickType('')">全部</button>
      <button v-for="cat in categories" :key="cat.name" type="button" :class="{ on: type === cat.name }" @click="pickType(cat.name)">
        {{ cat.name }}
      </button>
    </nav>

    <nav ref="sortTabsEl" class="mt-sortbar" aria-label="排序入口">
      <button v-for="item in quickSorts" :key="item.value" type="button" :class="{ on: sort === item.value }" @click="pickSort(item.value)">
        <svg viewBox="0 0 24 24" v-html="icon(item.icon)"></svg>
        {{ item.label }}
      </button>
    </nav>

    <section v-if="subtypes.length && !kw" class="mt-section">
      <div class="mt-section-head">
        <h2>热门分类</h2>
      </div>
      <div class="mt-subgrid">
        <button v-for="sub in topSubtypes" :key="sub.name" type="button" :class="{ on: subtype === sub.name }" @click="pickSubtype(sub.name)">
          <span>{{ sub.name }}</span>
          <i>{{ compactCount(sub.count) }}</i>
        </button>
      </div>
    </section>

    <section class="mt-section mt-list-section">
      <div class="mt-section-head">
        <h2>{{ listTitle }}</h2>
        <button type="button" @click="filterOpen = true">
          <svg viewBox="0 0 24 24" v-html="icon('filter')"></svg>
          筛选
        </button>
      </div>
      <div v-if="loading" class="mt-grid">
        <div v-for="i in 8" :key="i" class="mt-card mt-sk">
          <div></div>
          <b></b>
          <p></p>
        </div>
      </div>
      <div v-else-if="!items.length" class="mt-empty">
        <strong>没有找到相关影片</strong>
        <span>换个关键词或筛选条件试试</span>
      </div>
      <div v-else class="mt-grid">
        <article v-for="vod in items" :key="vod.id" class="mt-card" @click="goPlay(vod.id)">
          <div class="mt-poster">
            <img :src="poster(vod)" :alt="vod.name" loading="lazy" @error="onImgError($event)" />
            <span v-if="vod.remarks">{{ vod.remarks }}</span>
          </div>
          <strong>{{ vod.name }}</strong>
          <p>{{ vod.typeName || '未分类' }}<template v-if="vod.year"> · {{ vod.year }}</template></p>
        </article>
      </div>
      <button v-if="hasMore && !loading" class="mt-more" type="button" @click="loadMore">加载更多</button>
    </section>

    <div v-if="filterOpen" class="mt-filter-mask" @click="filterOpen = false"></div>
    <aside class="mt-filter" :class="{ open: filterOpen }">
      <div class="mt-filter-head">
        <h3>筛选影片</h3>
        <button type="button" aria-label="关闭筛选" @click="filterOpen = false">
          <svg viewBox="0 0 24 24" v-html="icon('close')"></svg>
        </button>
      </div>
      <div class="mt-filter-group">
        <label>类型</label>
        <div>
          <button type="button" :class="{ on: !type }" @click="pickType('', false)">全部</button>
          <button v-for="cat in categories" :key="cat.name" type="button" :class="{ on: type === cat.name }" @click="pickType(cat.name, false)">
            {{ cat.name }}
          </button>
        </div>
      </div>
      <div v-if="subtypes.length" class="mt-filter-group">
        <label>分类</label>
        <div>
          <button type="button" :class="{ on: !subtype }" @click="pickSubtype('', false)">全部</button>
          <button v-for="sub in subtypes.slice(0, 18)" :key="sub.name" type="button" :class="{ on: subtype === sub.name }" @click="pickSubtype(sub.name, false)">
            {{ sub.name }}
          </button>
        </div>
      </div>
      <div class="mt-filter-group">
        <label>年份</label>
        <div>
          <button type="button" :class="{ on: !year }" @click="pickYear('')">全部</button>
          <button v-for="row in years.slice(0, 12)" :key="row.year" type="button" :class="{ on: year === row.year }" @click="pickYear(row.year)">
            {{ row.year }}
          </button>
        </div>
      </div>
      <div class="mt-filter-group">
        <label>排序</label>
        <div>
          <button v-for="item in filterSorts" :key="item.value" type="button" :class="{ on: sort === item.value }" @click="pickSort(item.value, false)">
            {{ item.label }}
          </button>
        </div>
      </div>
      <div class="mt-filter-actions">
        <button type="button" @click="resetFilter">重置</button>
        <button type="button" @click="applyFilter">查看结果</button>
      </div>
    </aside>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { readCachedCategories, writeCachedCategories } from '../siteConfig'
import { icon } from './icons'

const THEATER_CACHE_KEY = 'vcms.mobile.theater.cache.v1'
const THEATER_CACHE_LIMIT = 96
const route = useRoute()
const router = useRouter()
const categories = ref(readCachedCategories())
const subtypes = ref([])
const years = ref([])
const rankItems = ref([])
const items = ref([])
const loading = ref(false)
const filterOpen = ref(false)
const draftKw = ref('')
const page = ref(1)
const hasMore = ref(false)
const headBg = ref(0)
const typeTabsEl = ref(null)
const sortTabsEl = ref(null)

const type = computed(() => String(route.query.type || ''))
const subtype = computed(() => String(route.query.sub || ''))
const sort = computed(() => String(route.query.sort || 'recent'))
const year = computed(() => String(route.query.year || ''))
const kw = computed(() => String(route.query.kw || ''))
const topSubtypes = computed(() => subtypes.value.slice(0, 8))
const rankTitle = computed(() => type.value ? `${type.value}热播榜` : '全站热播榜')
const listTitle = computed(() => {
  if (kw.value) return `搜索“${kw.value}”`
  if (subtype.value) return subtype.value
  if (type.value) return `${type.value}片库`
  return '全部影片'
})
const quickSorts = [
  { value: 'hot', label: '热播', icon: 'hot' },
  { value: 'recent', label: '新片', icon: 'calendar' },
  { value: 'rating', label: '高分', icon: 'rank' },
]
const filterSorts = [
  { value: 'recent', label: '最近更新' },
  { value: 'hot', label: '热门优先' },
  { value: 'rating', label: '高分优先' },
  { value: 'year', label: '年份新到旧' },
]
let listRequestId = 0
let rankRequestId = 0
let theaterCache = readTheaterCache()
let headRaf = 0

function readTheaterCache() {
  try {
    const data = JSON.parse(localStorage.getItem(THEATER_CACHE_KEY) || '{}')
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

function writeTheaterCache() {
  const rows = Object.entries(theaterCache)
    .sort((a, b) => Number(b[1]?.ts || 0) - Number(a[1]?.ts || 0))
    .slice(0, THEATER_CACHE_LIMIT)
  theaterCache = Object.fromEntries(rows)
  try {
    localStorage.setItem(THEATER_CACHE_KEY, JSON.stringify(theaterCache))
  } catch {}
}

function cacheKey(scope, params) {
  return JSON.stringify({ scope, ...params })
}

function cacheGet(key) {
  return theaterCache[key]?.data || null
}

function cacheSet(key, data) {
  theaterCache[key] = { ts: Date.now(), data }
  writeTheaterCache()
}

function sameData(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function poster(vod) {
  return imgUrl(vod?.officialPic || vod?.pic || vod?.localPic || vod?.heroImage || '')
}

function onImgError(event) {
  const img = event?.target
  if (img) img.style.visibility = 'hidden'
}

function compactCount(value) {
  const n = Number(value) || 0
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`
  return String(n)
}

function queryPatch(patch) {
  return { ...route.query, ...patch }
}

function cleanQuery(query) {
  const out = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== '' && value !== null && typeof value !== 'undefined') out[key] = value
  }
  return out
}

function pushQuery(patch) {
  router.push({ path: '/m/theater', query: cleanQuery(queryPatch(patch)) })
}

function pickType(next, close = true) {
  pushQuery({ type: next, sub: '', year: '', kw: '' })
  if (close) filterOpen.value = false
}

function pickSubtype(next, close = true) {
  pushQuery({ sub: next, year: '', kw: '' })
  if (close) filterOpen.value = false
}

function pickSort(next, close = true) {
  pushQuery({ sort: next })
  if (close) filterOpen.value = false
}

function pickYear(next) {
  pushQuery({ year: next })
}

function submitSearch() {
  router.push({ path: '/m/search', query: cleanQuery({ kw: draftKw.value }) })
}

function openSearch() {
  router.push({ path: '/m/search', query: cleanQuery({ kw: draftKw.value }) })
}

function resetFilter() {
  router.push('/m/theater')
}

function applyFilter() {
  filterOpen.value = false
}

function goPlay(id) {
  if (!id) return
  router.push(`/m/play/${id}`)
}

function vodParams(extra = {}) {
  return cleanQuery({
    page: page.value,
    size: 24,
    type: kw.value ? '' : type.value,
    sub: kw.value ? '' : subtype.value,
    kw: kw.value,
    year: year.value,
    sort: sort.value,
    ...extra,
  })
}

async function loadCategories() {
  try {
    categories.value = writeCachedCategories(await api.categories())
  } catch {}
}

async function loadSubtypes() {
  if (!type.value || kw.value) {
    subtypes.value = []
    return
  }
  const key = cacheKey('subtypes', { type: type.value })
  const cached = cacheGet(key)
  if (cached) subtypes.value = cached
  try {
    const currentType = type.value
    const data = (await api.subtypes(currentType)).filter(row => Number(row.count) > 0)
    if (currentType !== type.value || kw.value) return
    if (!sameData(subtypes.value, data)) subtypes.value = data
    cacheSet(key, data)
  } catch {
    if (!cached) subtypes.value = []
  }
}

async function loadYears() {
  const params = cleanQuery({ type: kw.value ? '' : type.value, sub: kw.value ? '' : subtype.value, kw: kw.value })
  const key = cacheKey('years', params)
  const cached = cacheGet(key)
  if (cached) years.value = cached
  try {
    const data = await api.years(params)
    if (key !== cacheKey('years', cleanQuery({ type: kw.value ? '' : type.value, sub: kw.value ? '' : subtype.value, kw: kw.value }))) return
    if (!sameData(years.value, data)) years.value = data
    cacheSet(key, data)
  } catch {
    if (!cached) years.value = []
  }
}

async function loadRank() {
  const params = cleanQuery({ page: 1, size: 6, type: type.value, sort: 'hot' })
  const key = cacheKey('rank', params)
  const cached = cacheGet(key)
  const requestId = ++rankRequestId
  if (cached) rankItems.value = cached
  try {
    const res = await api.vods(params)
    if (requestId !== rankRequestId || key !== cacheKey('rank', cleanQuery({ page: 1, size: 6, type: type.value, sort: 'hot' }))) return
    const data = res.list || []
    if (!sameData(rankItems.value, data)) rankItems.value = data
    cacheSet(key, data)
  } catch {
    if (!cached) rankItems.value = []
  }
}

async function loadList({ append = false } = {}) {
  const params = vodParams()
  const key = cacheKey('list', params)
  const cached = cacheGet(key)
  const requestId = ++listRequestId
  let usedCache = false
  if (cached) {
    usedCache = true
    const cachedList = cached.list || []
    items.value = append ? [...items.value, ...cachedList] : cachedList
    hasMore.value = Boolean(cached.hasMore)
  }
  loading.value = !append && !usedCache
  try {
    const res = await api.vods(params)
    if (requestId !== listRequestId || key !== cacheKey('list', vodParams())) return
    const next = res.list || []
    const data = { list: next, hasMore: Boolean(res.hasMore) }
    if (!sameData(cached, data)) {
      items.value = append ? [...items.value.slice(0, Math.max(0, items.value.length - (cached?.list?.length || 0))), ...next] : next
      hasMore.value = data.hasMore
    }
    cacheSet(key, data)
  } finally {
    if (requestId === listRequestId) loading.value = false
  }
}

async function loadMore() {
  page.value += 1
  await loadList({ append: true })
}

async function reload() {
  draftKw.value = kw.value
  page.value = 1
  await Promise.allSettled([loadSubtypes(), loadYears(), loadRank(), loadList()])
}

function syncHeadBg() {
  headRaf = 0
  headBg.value = Math.max(0, Math.min(.9, (window.scrollY / 88) * .9)).toFixed(3)
}

function onPageScroll() {
  if (headRaf) return
  headRaf = window.requestAnimationFrame(syncHeadBg)
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
  keepActiveTabVisible(typeTabsEl)
  keepActiveTabVisible(sortTabsEl)
}

watch(() => route.fullPath, reload)
watch([type, sort, () => categories.value.length], syncHorizontalTabs, { immediate: true })
onMounted(async () => {
  syncHeadBg()
  window.addEventListener('scroll', onPageScroll, { passive: true })
  await loadCategories()
  await reload()
  syncHorizontalTabs()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onPageScroll)
  if (headRaf) cancelAnimationFrame(headRaf)
})
</script>

<style scoped>
.mt {
  min-height: 100dvh;
  padding: calc(env(safe-area-inset-top) + 64px) 14px calc(90px + env(safe-area-inset-bottom));
  background:
    linear-gradient(180deg, #fff4f1 0%, #f7f7f8 180px, #f7f7f8 100%);
  color: #191a20;
  overscroll-behavior-y: none;
}
.mt-head {
  position: fixed;
  z-index: 20;
  left: 0;
  right: 0;
  top: 0;
  margin: 0;
  padding: calc(env(safe-area-inset-top) + 12px) 14px 10px;
  background: rgb(255 244 241 / var(--mt-head-bg));
  transition: background .16s ease;
  -webkit-backdrop-filter: blur(9px);
  backdrop-filter: blur(9px);
}
.mt-search {
  height: 42px;
  border-radius: 999px;
  padding: 0 10px 0 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 10px 26px rgba(43, 20, 18, .06);
  touch-action: manipulation;
}
.mt-search svg,
.mt-sortbar svg,
.mt-section-head svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mt-search svg {
  color: #9aa0aa;
}
.mt-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #1f232b;
  font-size: 14px;
}
.mt button:focus-visible,
.mt input:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 2px rgba(240, 68, 56, .18);
}
.mt-search input::placeholder {
  color: #9aa0aa;
}
.mt-search button {
  height: 28px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  color: #f04438;
  background: #fff0ed;
  font-size: 12px;
  font-weight: 900;
  transition: transform .16s ease, background .16s ease;
}
.mt-search button:active,
.mt-types button:active,
.mt-sortbar button:active,
.mt-section-head button:active,
.mt-subgrid button:active,
.mt-rank article:active,
.mt-card:active,
.mt-more:active,
.mt-filter button:active {
  transform: scale(.98);
}
.mt-types,
.mt-sortbar {
  margin: 10px -14px 0;
  padding: 0 14px 2px;
  display: flex;
  gap: 9px;
  overflow-x: auto;
  scrollbar-width: none;
}
.mt-types::-webkit-scrollbar,
.mt-sortbar::-webkit-scrollbar,
.mt-rank::-webkit-scrollbar {
  display: none;
}
.mt-types button {
  flex: 0 0 auto;
  height: 32px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  color: #3d414a;
  background: #fff;
  font-weight: 800;
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease, color .16s ease;
}
.mt-types button.on {
  color: #fff;
  background: linear-gradient(135deg, #ff6a4f, #f04438);
}
.mt-sortbar {
  margin-top: 10px;
}
.mt-sortbar button {
  flex: 0 0 auto;
  height: 34px;
  border: 0;
  border-radius: 12px;
  padding: 0 13px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #616773;
  background: #fff;
  font-weight: 800;
  touch-action: manipulation;
  transition: transform .16s ease, color .16s ease, background .16s ease;
}
.mt-sortbar button.on {
  color: #f04438;
}
.mt-section {
  margin-top: 20px;
}
.mt > .mt-section:first-of-type {
  margin-top: 0;
}
.mt-section-head {
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.mt-section-head h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1;
}
.mt-section-head button {
  border: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #9a9fa8;
  background: transparent;
  font-size: 13px;
  font-weight: 800;
  touch-action: manipulation;
  transition: transform .16s ease, color .16s ease;
}
.mt-subgrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.mt-subgrid button {
  min-width: 0;
  height: 54px;
  border: 0;
  border-radius: 13px;
  padding: 7px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(17, 24, 39, .05);
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease;
}
.mt-subgrid span {
  max-width: 100%;
  color: #262a33;
  font-size: 13px;
  font-weight: 900;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mt-subgrid i {
  color: #a1a6af;
  font-size: 10px;
  font-style: normal;
}
.mt-subgrid button.on {
  background: #fff0ed;
}
.mt-subgrid button.on span,
.mt-subgrid button.on i {
  color: #f04438;
}
.mt-rank {
  margin: 0 -14px;
  padding: 0 14px 2px;
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scrollbar-width: none;
}
.mt-rank article {
  width: 104px;
  flex: 0 0 auto;
  min-width: 0;
  touch-action: manipulation;
  transition: transform .16s ease;
}
.mt-rank-poster,
.mt-poster {
  position: relative;
  overflow: hidden;
  background: #e9eaee;
}
.mt-rank-poster {
  aspect-ratio: 3 / 4.15;
  border-radius: 10px;
}
.mt-rank-poster img,
.mt-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mt-rank-poster b {
  position: absolute;
  left: 6px;
  top: 6px;
  min-width: 22px;
  height: 22px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, #ff7b4c, #f04438);
  font-size: 12px;
}
.mt-rank strong,
.mt-card strong {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  margin-top: 7px;
  color: #1f232b;
  font-size: 13px;
  line-height: 1.25;
  min-height: 32px;
}
.mt-rank span,
.mt-card p {
  display: block;
  margin: 4px 0 0;
  color: #8b9098;
  font-size: 11px;
  line-height: 1.2;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mt-list-section {
  margin-top: 22px;
}
.mt-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 8px;
}
.mt-card {
  min-width: 0;
  touch-action: manipulation;
  transition: transform .16s ease;
}
.mt-poster {
  aspect-ratio: 3 / 4.1;
  border-radius: 12px;
  box-shadow: 0 8px 22px rgba(17, 24, 39, .08);
}
.mt-poster span {
  position: absolute;
  left: 7px;
  bottom: 7px;
  max-width: calc(100% - 14px);
  padding: 3px 7px;
  border-radius: 999px;
  color: #fff;
  background: rgba(0, 0, 0, .54);
  font-size: 10px;
  font-weight: 800;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mt-more {
  width: 100%;
  height: 42px;
  margin-top: 18px;
  border: 0;
  border-radius: 999px;
  color: #f04438;
  background: #fff;
  font-weight: 900;
  touch-action: manipulation;
  transition: transform .16s ease, color .16s ease;
}
.mt-empty {
  min-height: 160px;
  padding: 24px 16px;
  display: grid;
  place-content: center;
  gap: 8px;
  text-align: center;
  background: #fff;
  border-radius: 16px;
  box-shadow: inset 0 0 0 1px rgba(17, 24, 39, .03);
}
.mt-empty strong {
  color: #292d36;
  font-size: 15px;
}
.mt-empty span {
  color: #9a9fa8;
  font-size: 12px;
  font-weight: 700;
}
.mt-sk div,
.mt-sk b,
.mt-sk p {
  display: block;
  border-radius: 10px;
  background: linear-gradient(90deg, #eceef2, #f7f7f9, #eceef2);
  background-size: 200% 100%;
  animation: mt-sk 1.1s infinite linear;
}
.mt-sk div {
  aspect-ratio: 3 / 4.1;
}
.mt-sk b {
  width: 82%;
  height: 14px;
  margin-top: 8px;
}
.mt-sk p {
  width: 48%;
  height: 11px;
}
.mt-filter-mask {
  position: fixed;
  z-index: 80;
  inset: 0;
  background: transparent;
}
.mt-filter {
  position: fixed;
  z-index: 81;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: min(78dvh, 620px);
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom));
  border-radius: 22px 22px 0 0;
  background: #fff;
  transform: translate3d(0, 108%, 0);
  transition: transform .16s ease;
  will-change: transform;
  backface-visibility: hidden;
  overflow-y: auto;
  box-shadow: 0 -18px 48px rgba(17, 24, 39, .18);
}
.mt-filter.open {
  transform: translate3d(0, 0, 0);
}
.mt-filter-head,
.mt-filter-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mt-filter-head h3 {
  margin: 0;
  font-size: 18px;
}
.mt-filter-head button {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #6b7280;
}
.mt-filter-head button svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mt-filter-group {
  margin-top: 18px;
}
.mt-filter-group label {
  display: block;
  margin-bottom: 10px;
  color: #6d7480;
  font-size: 13px;
  font-weight: 900;
}
.mt-filter-group div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.mt-filter-group button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 12px;
  color: #5f6570;
  background: #f4f5f7;
  font-weight: 800;
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease, color .16s ease;
}
.mt-filter-group button.on {
  color: #f04438;
  background: #fff0ed;
}
.mt-filter-actions {
  position: sticky;
  bottom: 0;
  gap: 10px;
  margin-top: 22px;
  padding-top: 12px;
  background: linear-gradient(180deg, rgba(255,255,255,0), #fff 26%);
}
.mt-filter-actions button {
  flex: 1;
  height: 42px;
  border: 0;
  border-radius: 999px;
  font-weight: 900;
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease;
}
.mt-filter-actions button:first-child {
  color: #5f6570;
  background: #f4f5f7;
}
.mt-filter-actions button:last-child {
  color: #fff;
  background: linear-gradient(135deg, #ff6a4f, #f04438);
}
@keyframes mt-sk {
  to { background-position: -200% 0; }
}
@media (max-width: 360px) {
  .mt-subgrid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
