<template>
  <div class="page home">
    <!-- ============ 发现模式（首页，无筛选） ============ -->
    <template v-if="discover">
      <!-- 骨架屏 -->
      <template v-if="rowsLoading && !hero.length">
        <div class="home-hero sk-hero">
          <div class="hero-in">
            <div class="sk" style="width:100px;height:28px;margin-bottom:20px"></div>
            <div class="sk" style="width:55%;height:46px"></div>
            <div class="sk" style="width:38%;height:18px;margin-top:20px"></div>
            <div class="sk" style="width:70%;height:15px;margin-top:22px"></div>
            <div class="sk" style="width:60%;height:15px;margin-top:8px"></div>
            <div class="sk" style="width:180px;height:48px;margin-top:32px;border-radius:12px"></div>
          </div>
        </div>
        <div class="chip-bar">
          <div v-for="i in 8" :key="i" class="sk" style="width:76px;height:35px;border-radius:11px"></div>
        </div>
        <section v-for="r in 3" :key="r" class="row">
          <div class="sk" style="width:120px;height:22px;margin-bottom:18px"></div>
          <div class="row-scroll">
            <div v-for="i in 8" :key="i" class="sk-card"><div class="sk sk-poster"></div><div class="sk sk-line"></div><div class="sk sk-line s"></div></div>
          </div>
        </section>
      </template>

      <!-- Hero 全屏贯穿 -->
      <section class="home-hero" v-if="hero.length" @mouseenter="pauseHeroLoop" @mouseleave="resumeHeroLoop">
        <div class="hero-bg" :class="{wide: heroImageWide(cur), fallback: !heroImageWide(cur)}" :style="{ backgroundImage: `url(${heroPic(cur)})` }"></div>
        <div class="hero-mask"></div>
        <div class="hero-in">
          <span class="hero-badge">
            <svg class="hero-badge-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
            </svg>
            热门推荐
          </span>
          <h1 class="hero-title">{{ cur.name }}</h1>
          <div class="hero-meta">
            <span v-if="cur.rating" class="score">★ {{ cur.rating }}</span>
            <span class="m year">{{ cur.year || '—' }}</span>
            <span class="m type">{{ cur.typeName || '未分类' }}</span>
            <span class="m extra" v-if="cur.area">{{ cur.area }}</span>
            <span class="m extra" v-if="cur.remarks">{{ cur.remarks }}</span>
          </div>
          <p class="hero-desc" v-if="cur.officialIntro || cur.blurb">{{ cur.officialIntro || cur.blurb }}</p>
          <div class="hero-actions">
            <button class="hero-play" @click="goPlay(cur.id)">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              立即播放
            </button>
            <button class="hero-fav" @click="goPlay(cur.id)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
              查看详情
            </button>
          </div>
        </div>
        <div class="hero-rail" :style="heroRailStyle">
          <div class="hero-rail-track">
            <div v-for="(h,i) in hero" :key="h.id" class="hero-thumb" :class="{on: i===heroIdx}"
              @click.stop="selectHero(i)" @touchstart.passive="pauseHeroLoop" @mouseenter="heroIdx=i; pauseHeroLoop()">
              <img :src="thumbPic(h)" :alt="h.name" @error="onErr($event, fallbackPic(h))" />
            </div>
          </div>
        </div>
      </section>

      <!-- 分类快捷 chips -->
      <div class="chip-bar" v-if="types.length">
        <span v-for="t in types" :key="t.name" class="chip" @click="$router.push({path:'/',query:{type:t.name}})">
          {{ t.name || '未分类' }}<i class="cc">{{ t.count }}</i>
        </span>
      </div>

      <section class="row" v-if="userRecs.length">
        <div class="row-head">
          <div class="row-title">
            <span class="row-title-icon" v-html="sectionIconSvg('recommend')"></span>
            <span>为你推荐</span>
          </div>
          <div class="row-more" @click="$router.push('/me')">调整偏好</div>
        </div>
        <div class="row-scroll">
          <div v-for="v in userRecs" :key="v.id" class="card2" @click="goPlay(v.id)">
            <div class="poster">
              <img v-if="v.officialPic || v.pic || v.localPic" :src="pic(v)" :alt="v.name" loading="lazy" @error="onErr($event, fallbackPic(v))" />
              <div v-else class="noimg">暂无封面</div>
              <span v-if="v.rating" class="badge score">{{ v.rating }}</span>
              <span v-else-if="v.remarks" class="badge">{{ v.remarks }}</span>
              <div class="poster-hover"><span class="play-ic"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></div>
            </div>
            <div class="c-info">
              <div class="c-name">{{ v.name }}</div>
              <div class="c-sub">{{ v.typeName || '未分类' }} · {{ v.year || '—' }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- 每日更新 -->
      <section class="row" v-if="weekReady">
        <div class="row-head">
          <div class="row-title">
            <span class="row-title-icon" v-html="sectionIconSvg('calendar')"></span>
            <span>每日更新</span>
          </div>
        </div>
        <div class="week-tabs">
          <div v-for="d in updateDays" :key="d.date" class="week-tab" :class="{on: updateDate===d.date}" @click="updateDate=d.date">
            <span class="wd">{{ updateDateLabel(d.date) }}</span>
            <span class="wt" :class="{'today-dot': d.date===todayDate}">{{ updateSubLabel(d) }}</span>
          </div>
        </div>
        <div class="row-scroll" v-if="activeUpdateItems.length">
          <div v-for="v in activeUpdateItems" :key="v.id" class="card2" @click="goPlay(v.id)">
            <div class="poster">
              <img v-if="v.officialPic || v.pic || v.localPic" :src="pic(v)" :alt="v.name" loading="lazy" @error="onErr($event, fallbackPic(v))" />
              <div v-else class="noimg">暂无封面</div>
              <span v-if="v.rating" class="badge score">{{ v.rating }}</span>
              <span v-else-if="v.remarks" class="badge">{{ v.remarks }}</span>
              <div class="poster-hover"><span class="play-ic"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></div>
            </div>
            <div class="c-info">
              <div class="c-name">{{ v.name }}</div>
              <div class="c-sub">{{ v.typeName || '未分类' }} · {{ v.year || '—' }}</div>
            </div>
          </div>
        </div>
        <div v-else class="row-empty">{{ activeUpdateLabel }}暂无更新</div>
      </section>

      <!-- 内容分行 -->
      <section v-for="row in rows" :key="row.type" class="row">
        <div class="row-head">
          <div class="row-title">
            <span class="row-title-icon" v-html="categoryIconSvg(row.icon, row.type)"></span>
            <span>{{ row.type || '推荐' }}</span>
          </div>
          <div class="row-more" @click="$router.push({path:'/',query:{type:row.type}})">
            查看全部
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
          </div>
        </div>
        <div class="row-scroll">
          <div v-for="v in row.list" :key="v.id" class="card2" @click="goPlay(v.id)">
            <div class="poster">
              <img v-if="v.officialPic || v.pic || v.localPic" :src="pic(v)" :alt="v.name" loading="lazy" @error="onErr($event, fallbackPic(v))" />
              <div v-else class="noimg">暂无封面</div>
              <span v-if="v.rating" class="badge score">{{ v.rating }}</span>
              <span v-else-if="v.remarks" class="badge">{{ v.remarks }}</span>
              <div class="poster-hover"><span class="play-ic"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></div>
            </div>
            <div class="c-info">
              <div class="c-name">{{ v.name }}</div>
              <div class="c-sub">{{ v.typeName || '未分类' }} · {{ v.year || '—' }}</div>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- ============ 浏览模式（选中分类/搜索） ============ -->
    <template v-else>
      <div v-if="mobileFiltersOpen" class="filter-drawer-backdrop" @click="mobileFiltersOpen = false"></div>
      <div class="filter-bar" :class="{open: mobileFiltersOpen}">
        <div class="filter-head">
          <div>
            <div class="filter-title">{{ title || curType || '筛选' }}</div>
            <div class="filter-summary">{{ filterSummary }}</div>
          </div>
          <button class="filter-toggle" type="button" @click="mobileFiltersOpen = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
            筛选
          </button>
        </div>
      </div>
      <div class="filter-content" :class="{open: mobileFiltersOpen}">
        <div class="filter-sheet-head">
          <div>
            <div class="filter-sheet-title">筛选影片</div>
            <div class="filter-summary">{{ filterSummary }}</div>
          </div>
          <button class="filter-close" type="button" @click="mobileFiltersOpen = false" aria-label="关闭筛选">×</button>
        </div>
        <div class="filter-row" v-if="curType && subs.length">
          <span class="f-label">标签</span>
          <div class="chips">
            <span class="chip sm" :class="{on: !sub}" @click="setSub('')">全部</span>
            <span v-for="s in subs" :key="s.name" class="chip sm" :class="{on: sub===s.name}" @click="setSub(s.name)">
              {{ s.name }}<i class="cc">{{ s.count }}</i>
            </span>
          </div>
        </div>
        <div class="filter-row">
          <span class="f-label">排序</span>
          <div class="chips">
            <span v-for="s in sorts" :key="s.v" class="chip sm" :class="{on: sort===s.v}" @click="setSort(s.v)">{{ s.t }}</span>
          </div>
        </div>
        <div class="filter-row">
          <span class="f-label">年份</span>
          <div class="chips">
            <span class="chip sm" :class="{on: !year}" @click="setYear('')">全部</span>
            <span v-for="y in years" :key="y.year" class="chip sm" :class="{on: year===y.year}" @click="setYear(y.year)">{{ y.year }}</span>
          </div>
        </div>
      </div>

      <div class="section-title">
        <span class="section-title-icon" v-html="browseTitleIcon"></span>
        <span>{{ title }}</span>
        <span class="cnt">共 {{ total }} 部</span>
      </div>

      <div v-if="loading" class="grid">
        <div v-for="i in 18" :key="i" class="sk-card"><div class="sk sk-poster"></div><div class="sk sk-line"></div><div class="sk sk-line s"></div></div>
      </div>
      <div v-else-if="!list.length" class="empty">没有找到相关影片</div>
      <div v-else class="grid">
        <div v-for="v in list" :key="v.id" class="card2" @click="goPlay(v.id)">
          <div class="poster">
            <img v-if="v.officialPic || v.pic || v.localPic" :src="pic(v)" :alt="v.name" loading="lazy" @error="onErr($event, fallbackPic(v))" />
            <div v-else class="noimg">暂无封面</div>
            <span v-if="v.rating" class="badge score">{{ v.rating }}</span>
            <span v-else class="badge">{{ v.remarks || v.year }}</span>
            <div class="poster-hover"><span class="play-ic"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></div>
          </div>
          <div class="c-info">
            <div class="c-name">{{ v.name }}</div>
            <div class="c-sub">{{ v.typeName || '未分类' }} · {{ v.year || '—' }}</div>
          </div>
        </div>
      </div>

      <div class="pager" v-if="total > size">
        <button :disabled="page<=1" @click="go(page-1)">上一页</button>
        <button disabled>{{ page }} / {{ Math.ceil(total/size) }}</button>
        <button :disabled="page>=Math.ceil(total/size)" @click="go(page+1)">下一页</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { categoryIconSvg, sectionIconSvg } from '../categoryIcons'
import { currentUser } from '../userStore'
defineOptions({ name: 'Home' })
const route = useRoute()
const router = useRouter()

const curType = computed(() => route.query.type || '')
const isSearch = computed(() => !!route.query.kw)
const discover = computed(() => !curType.value && !isSearch.value)

function goPlay(id) { router.push('/play/'+id) }
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
function thumbPic(v) { return imgUrl(v.pic || v.officialPic || v.localPic || '') }
function heroPic(v) { return imgUrl(v.heroImage || v.heroPic || v.officialPic || v.pic || v.localPic || '') }
function heroImageWide(v) { return Boolean(v.heroImageWide) }
function withRandomHeroImage(v) {
  const images = Array.isArray(v.heroImages) ? v.heroImages.filter(img => img?.url) : []
  const wideImages = images.filter(img => img.wide && img.source !== 'poster' && img.source !== 'posterFallback')
  const fallbackImages = images.filter(img => !wideImages.includes(img))
  const pool = wideImages.length ? wideImages : fallbackImages
  if (!pool.length) return v
  const picked = pool[Math.floor(Math.random() * pool.length)]
  return { ...v, heroImage: picked.url, heroImageWide: wideImages.length > 0 }
}

/* ---------- 发现模式 ---------- */
const types = ref([])
const hero = ref([]); const heroIdx = ref(0)
const cur = computed(() => hero.value[heroIdx.value] || {})
const heroRailStyle = computed(() => {
  const maxOffset = Math.max(hero.value.length - 4, 0)
  const offset = Math.min(Math.max(heroIdx.value - 1, 0), maxOffset)
  return {
    '--hero-offset': offset,
    '--hero-leading': heroIdx.value === 0 ? '46px' : '0px'
  }
})
const rows = ref([]); const rowsLoading = ref(false)
const userRecs = ref([])
let heroTimer = null
let heroManualTimer = null
// 每日更新
const WDS = ['日','一','二','三','四','五','六']
const weekOrder = [1,2,3,4,5,6,0]
const todayDate = localDateKey(new Date())
const updateDays = ref([]); const updateDate = ref(todayDate); const weekReady = ref(false)
const activeUpdateDay = computed(() => updateDays.value.find(d => d.date === updateDate.value) || updateDays.value[0] || null)
const activeUpdateItems = computed(() => activeUpdateDay.value?.items || [])
const activeUpdateLabel = computed(() => activeUpdateDay.value ? updateDateLabel(activeUpdateDay.value.date) : '该日期')

async function ensureTypes() {
  if (types.value.length) return
  try { types.value = await api.categories() } catch { types.value = [] }
}

function localDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function updateDateLabel(date) {
  const parts = String(date).split('-')
  if (parts.length === 3) return `${Number(parts[1])}月${Number(parts[2])}日`
  const dow = Number(date)
  return Number.isFinite(dow) ? `周${WDS[dow]}` : String(date)
}
function updateSubLabel(day) {
  if (day.date === todayDate) return '• 今天'
  if (typeof day.dow === 'number') return `周${WDS[day.dow]}`
  return `${day.items?.length || 0}部`
}
function normalizeUpdateDays(data) {
  if (Array.isArray(data)) return data.map(d => ({ ...d, items: d.items || [] }))
  return weekOrder.map(d => ({ date: String(d), dow: d, items: data?.[d] || [] }))
}

async function loadDiscover() {
  if (hero.value.length) return
  rowsLoading.value = true
  await ensureTypes()
  // Hero：保留后台返回的全部有封面候选，移动端只通过可视窗口裁切
  const hot = await api.hot(12)
  hero.value = hot.map(withRandomHeroImage).filter(v => v.heroImage || v.heroPic || v.officialPic || v.pic || v.localPic)
  startHeroLoop()
  // 分行：前 6 个大类各取 12 部最近更新
  const top = types.value.filter(t => t.count > 0).slice(0, 6)
  const results = await Promise.all(top.map(t =>
    api.vods({ page: 1, size: 14, type: t.name, sort: 'recent' }).then(r => ({ type: t.name, icon: t.icon, list: r.list }))
  ))
  rows.value = results.filter(r => r.list.length)
  if (currentUser.value) {
    try { userRecs.value = (await api.userRecommendations(14)).list || [] } catch { userRecs.value = [] }
  }
  rowsLoading.value = false
  // 每日更新（后台按自然日期分组）
  try {
    updateDays.value = normalizeUpdateDays(await api.weekly()); weekReady.value = true
    // 今天无更新则默认选数据最多的一天
    const today = updateDays.value.find(d => d.date === todayDate)
    if (today?.items?.length) updateDate.value = today.date
    else {
      let best = updateDays.value[0], max = -1
      for (const d of updateDays.value) { const n = d.items?.length || 0; if (n > max) { max = n; best = d } }
      if (best) updateDate.value = best.date
    }
  } catch {}
}
function startHeroLoop() {
  if (heroTimer) clearInterval(heroTimer)
  if (!discover.value || hero.value.length <= 1) return
  heroTimer = setInterval(() => {
    if (hero.value.length) heroIdx.value = (heroIdx.value + 1) % hero.value.length
  }, 5000)
}
function stopHeroLoop() {
  if (!heroTimer) return
  clearInterval(heroTimer)
  heroTimer = null
}
function pauseHeroLoop() { stopHeroLoop() }
function resumeHeroLoop() { startHeroLoop() }
function selectHero(i) {
  heroIdx.value = i
  pauseHeroLoop()
  if (heroManualTimer) clearTimeout(heroManualTimer)
  heroManualTimer = setTimeout(() => resumeHeroLoop(), 8000)
}

/* ---------- 浏览模式 ---------- */
const subs = ref([]); const sub = ref('')
const list = ref([]); const total = ref(0); const page = ref(1); const size = 30; const loading = ref(true)
const title = ref(''); const years = ref([]); const year = ref(''); const sort = ref('recent')
const mobileFiltersOpen = ref(false)
const BROWSE_CACHE_TTL = 5 * 60 * 1000
const browseCache = new Map()
const subsCache = new Map()
const yearsCache = new Map()
let browseRequestId = 0
const sorts = [{ v:'recent', t:'最近更新' }, { v:'hot', t:'热门' }, { v:'rating', t:'高分' }]
const currentSortLabel = computed(() => sorts.find(s => s.v === sort.value)?.t || '最近更新')
const filterSummary = computed(() => {
  const items = [sub.value || curType.value || '全部', currentSortLabel.value]
  if (year.value) items.push(year.value)
  return items.join(' · ')
})
const browseTitleIcon = computed(() => {
  if (isSearch.value) return sectionIconSvg('search')
  if (!curType.value) return sectionIconSvg('grid')
  const cat = types.value.find(t => t.name === curType.value)
  return categoryIconSvg(cat?.icon, curType.value)
})

function cacheGet(cache, key) {
  const hit = cache.get(key)
  if (!hit || Date.now() - hit.ts > BROWSE_CACHE_TTL) {
    cache.delete(key)
    return null
  }
  return hit.data
}
function cacheSet(cache, key, data) {
  cache.set(key, { ts: Date.now(), data })
  if (cache.size > 80) cache.delete(cache.keys().next().value)
}
function browseParams() {
  return {
    page: page.value,
    size,
    type: String(route.query.type || ''),
    kw: String(route.query.kw || ''),
    year: year.value,
    sort: sort.value,
    sub: sub.value,
  }
}
function browseCacheKey() { return JSON.stringify(browseParams()) }
function yearsCacheKey() { return JSON.stringify({ type: String(curType.value || ''), sub: sub.value }) }

function setSub(s) {
  sub.value = s
  year.value = ''
  page.value = 1
  void load({ preferCache: true })
  void loadYears({ preferCache: true })
  mobileFiltersOpen.value = false
}
async function loadSubs() {
  sub.value = ''
  if (!curType.value) { subs.value = []; return }
  const key = String(curType.value)
  const cached = cacheGet(subsCache, key)
  if (cached) { subs.value = cached; return }
  try {
    const data = (await api.subtypes(curType.value)).filter(s => s.count > 0)
    subs.value = data
    cacheSet(subsCache, key, data)
  } catch { subs.value = [] }
}
async function loadYears({ preferCache = true } = {}) {
  const key = yearsCacheKey()
  const cached = preferCache ? cacheGet(yearsCache, key) : null
  if (cached) { years.value = cached; return }
  try {
    const data = await api.years({ type: curType.value, sub: sub.value })
    if (key !== yearsCacheKey()) return
    years.value = data
    cacheSet(yearsCache, key, data)
  } catch { years.value = [] }
}
async function load({ preferCache = true } = {}) {
  const params = browseParams()
  const key = browseCacheKey()
  const cached = preferCache ? cacheGet(browseCache, key) : null
  const requestId = ++browseRequestId
  const type = params.type
  const kw = params.kw
  title.value = kw ? `搜索“${kw}”` : (type || '全部影片')
  if (cached) {
    list.value = cached.list
    total.value = cached.total
    loading.value = false
    return
  }
  loading.value = true
  try {
    const r = await api.vods(params)
    if (requestId !== browseRequestId || key !== browseCacheKey()) return
    const data = { list: r.list || [], total: r.total || 0 }
    list.value = data.list
    total.value = data.total
    cacheSet(browseCache, key, data)
  } finally {
    if (requestId === browseRequestId) loading.value = false
  }
}
function go(p) { page.value = p; load({ preferCache: true }); window.scrollTo({top:0,behavior:'smooth'}) }
function setSort(v) { sort.value = v; page.value = 1; load({ preferCache: true }); mobileFiltersOpen.value = false }
function setYear(y) { year.value = y; page.value = 1; load({ preferCache: true }); mobileFiltersOpen.value = false }

async function boot() {
  await ensureTypes()
  if (discover.value) { await loadDiscover(); startHeroLoop(); return }
  stopHeroLoop()
  void load({ preferCache: true })
  void loadSubs()
  void loadYears({ preferCache: true })
}
watch(() => route.query, async () => { page.value = 1; year.value=''; sort.value='recent'; mobileFiltersOpen.value = false; await boot() })
onMounted(boot)
onActivated(() => { if (discover.value && hero.value.length > 1) startHeroLoop() })
onDeactivated(stopHeroLoop)
onBeforeUnmount(stopHeroLoop)
</script>
