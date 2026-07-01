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
      <section class="home-hero" v-if="hero.length">
        <div class="hero-bg" :style="{ backgroundImage: `url(${heroPic(cur)})` }"></div>
        <div class="hero-mask"></div>
        <div class="hero-in">
          <span class="hero-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s4 3 4 7a4 4 0 0 1-8 0c0-1 .5-2 .5-2S8 16 12 22c4-6 3.5-13 3.5-13S16 6 12 2z"/></svg>
            热门推荐
          </span>
          <h1 class="hero-title">{{ cur.name }}</h1>
          <div class="hero-meta">
            <span v-if="cur.rating" class="score">★ {{ cur.rating }}</span>
            <span class="m">{{ cur.year || '—' }}</span>
            <span class="m">{{ cur.typeName || '未分类' }}</span>
            <span class="m" v-if="cur.area">{{ cur.area }}</span>
            <span class="m" v-if="cur.remarks">{{ cur.remarks }}</span>
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
        <div class="hero-rail">
          <div v-for="(h,i) in hero" :key="h.id" class="hero-thumb" :class="{on: i===heroIdx}"
            @click="heroIdx=i" @mouseenter="heroIdx=i">
            <img :src="heroPic(h)" :alt="h.name" @error="onErr" />
          </div>
        </div>
      </section>

      <!-- 分类快捷 chips -->
      <div class="chip-bar" v-if="types.length">
        <span v-for="t in types" :key="t.name" class="chip" @click="$router.push({path:'/',query:{type:t.name}})">
          {{ t.name || '未分类' }}<i class="cc">{{ t.count }}</i>
        </span>
      </div>

      <!-- 内容分行 -->
      <section v-for="row in rows" :key="row.type" class="row">
        <div class="row-head">
          <div class="row-title">{{ row.type || '推荐' }}</div>
          <div class="row-more" @click="$router.push({path:'/',query:{type:row.type}})">
            查看全部
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
          </div>
        </div>
        <div class="row-scroll">
          <div v-for="v in row.list" :key="v.id" class="card2" @click="goPlay(v.id)">
            <div class="poster">
              <img v-if="v.officialPic || v.pic" :src="pic(v)" :alt="v.name" loading="lazy" @error="onErr" />
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
      <div class="filter-bar">
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

      <div class="section-title">{{ title }} <span class="cnt">共 {{ total }} 部</span></div>

      <div v-if="loading" class="grid">
        <div v-for="i in 18" :key="i" class="sk-card"><div class="sk sk-poster"></div><div class="sk sk-line"></div><div class="sk sk-line s"></div></div>
      </div>
      <div v-else-if="!list.length" class="empty">没有找到相关影片</div>
      <div v-else class="grid">
        <div v-for="v in list" :key="v.id" class="card2" @click="goPlay(v.id)">
          <div class="poster">
            <img v-if="v.officialPic || v.pic" :src="pic(v)" :alt="v.name" loading="lazy" @error="onErr" />
            <div v-else class="noimg">暂无封面</div>
            <span class="badge lines">{{ v._count.plays }}线路</span>
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
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
defineOptions({ name: 'Home' })
const route = useRoute()
const router = useRouter()

const curType = computed(() => route.query.type || '')
const isSearch = computed(() => !!route.query.kw)
const discover = computed(() => !curType.value && !isSearch.value)

function goPlay(id) { router.push('/play/'+id) }
function onErr(e) { e.target.style.visibility='hidden' }
function pic(v) { return imgUrl(v.officialPic || v.pic || '') }
function heroPic(v) { return pic(v) }

/* ---------- 发现模式 ---------- */
const types = ref([])
const hero = ref([]); const heroIdx = ref(0)
const cur = computed(() => hero.value[heroIdx.value] || {})
const rows = ref([]); const rowsLoading = ref(false)
let heroTimer = null

async function loadDiscover() {
  if (hero.value.length) return
  rowsLoading.value = true
  types.value = (await api.categories()).filter(t => t.count > 0)
  // Hero：取热门（有封面）前 6
  const hot = await api.hot(12)
  hero.value = hot.filter(v => v.officialPic || v.pic).slice(0, 6)
  startHeroLoop()
  // 分行：前 6 个大类各取 12 部最近更新
  const top = types.value.slice(0, 6)
  const results = await Promise.all(top.map(t =>
    api.vods({ page: 1, size: 14, type: t.name, sort: 'recent' }).then(r => ({ type: t.name, list: r.list }))
  ))
  rows.value = results.filter(r => r.list.length)
  rowsLoading.value = false
}
function startHeroLoop() {
  if (heroTimer) clearInterval(heroTimer)
  heroTimer = setInterval(() => {
    if (hero.value.length) heroIdx.value = (heroIdx.value + 1) % hero.value.length
  }, 5000)
}

/* ---------- 浏览模式 ---------- */
const subs = ref([]); const sub = ref('')
const list = ref([]); const total = ref(0); const page = ref(1); const size = 30; const loading = ref(true)
const title = ref(''); const years = ref([]); const year = ref(''); const sort = ref('recent')
const sorts = [{ v:'recent', t:'最近更新' }, { v:'hot', t:'热门' }, { v:'rating', t:'高分' }]

function setSub(s) { sub.value = s; page.value = 1; load() }
async function loadSubs() {
  sub.value = ''
  if (!curType.value) { subs.value = []; return }
  try { subs.value = (await api.subtypes(curType.value)).filter(s => s.count > 0) } catch { subs.value = [] }
}
async function load() {
  loading.value = true
  const type = route.query.type || ''
  const kw = route.query.kw || ''
  title.value = kw ? `搜索“${kw}”` : (type || '全部影片')
  const r = await api.vods({ page: page.value, size, type, kw, year: year.value, sort: sort.value, sub: sub.value })
  list.value = r.list; total.value = r.total; loading.value = false
}
function go(p) { page.value = p; load(); window.scrollTo({top:0,behavior:'smooth'}) }
function setSort(v) { sort.value = v; page.value = 1; load() }
function setYear(y) { year.value = y; page.value = 1; load() }

async function boot() {
  if (discover.value) { await loadDiscover(); return }
  if (!years.value.length) years.value = await api.years()
  await loadSubs()
  load()
}
watch(() => route.query, async () => { page.value = 1; year.value=''; sort.value='recent'; await boot() })
onMounted(boot)
</script>
