<template>
  <main class="mh">
    <header class="mh-head">
      <div class="mh-brand">
        <img v-if="site.logo" :src="site.logo" alt="logo" />
        <span v-else>D</span>
      </div>
      <button class="mh-search" type="button" @click="goSearch">
        <svg viewBox="0 0 24 24" v-html="icon('search')"></svg>
        <span>搜索电影、剧集、动漫、短剧</span>
      </button>
    </header>

    <section v-if="loading && !hero" class="mh-hero mh-skeleton">
      <div class="sk sk-badge"></div>
      <div class="sk sk-title"></div>
      <div class="sk sk-text"></div>
      <div class="sk sk-actions"></div>
    </section>

    <section v-else-if="hero" class="mh-hero" @click="goPlay(hero.id)">
      <img class="mh-hero-img" :src="poster(hero, true)" :alt="hero.name" @error="onImgError($event, poster(hero))" />
      <div class="mh-hero-shade"></div>
      <div class="mh-hero-content">
        <div class="mh-kicker">
          <svg viewBox="0 0 24 24" v-html="icon('hot')"></svg>
          <span>热门推荐</span>
        </div>
        <h1>{{ hero.name }}</h1>
        <p class="mh-meta">
          <span v-if="hero.typeName">{{ hero.typeName }}</span>
          <span v-if="hero.year">{{ hero.year }}</span>
          <span v-if="hero.remarks">{{ hero.remarks }}</span>
        </p>
        <p v-if="hero.officialIntro || hero.blurb" class="mh-desc">{{ hero.officialIntro || hero.blurb }}</p>
        <div class="mh-actions">
          <button class="mh-primary" type="button" @click.stop="goPlay(hero.id)">
            <svg viewBox="0 0 24 24" v-html="icon('play')"></svg>
            立即播放
          </button>
          <button class="mh-secondary" type="button" @click.stop="goPlay(hero.id)">
            <svg viewBox="0 0 24 24" v-html="icon('plus')"></svg>
            追剧
          </button>
        </div>
      </div>
    </section>

    <nav v-if="categories.length" class="mh-cats" aria-label="分类快捷入口">
      <button v-for="cat in categories" :key="cat.name" type="button" @click="goTheater(cat.name)">
        {{ cat.name }}
      </button>
    </nav>

    <section v-if="historyItems.length" class="mh-section">
      <div class="mh-section-head">
        <h2>
          <svg viewBox="0 0 24 24" v-html="icon('clock')"></svg>
          继续看
        </h2>
        <button type="button" @click="router.push('/m/me')">全部</button>
      </div>
      <div class="mh-continue">
        <article v-for="item in historyItems" :key="item.id || item.vodId" class="mh-history" @click="goPlay(item.vodId || item.vod?.id)">
          <div class="mh-history-cover">
            <img v-if="item.vod" :src="poster(item.vod)" :alt="item.vod.name" @error="onImgError($event)" />
            <div class="mh-progress"><i :style="{ width: historyProgress(item) }"></i></div>
          </div>
          <strong>{{ item.vod?.name || '继续观看' }}</strong>
          <span>{{ item.epName || `第${Number(item.epIndex || 0) + 1}集` }}</span>
        </article>
      </div>
    </section>

    <section v-for="block in blocks" :key="block.key" class="mh-section">
      <div class="mh-section-head">
        <h2>
          <svg viewBox="0 0 24 24" v-html="icon(block.icon)"></svg>
          {{ block.title }}
        </h2>
        <button type="button" @click="goTheater('', block.sort)">更多</button>
      </div>
      <div class="mh-grid">
        <article v-for="vod in block.items" :key="`${block.key}-${vod.id}`" class="mh-card" @click="goPlay(vod.id)">
          <div class="mh-poster">
            <img :src="poster(vod)" :alt="vod.name" loading="lazy" @error="onImgError($event)" />
            <span v-if="vod.remarks" class="mh-mark">{{ vod.remarks }}</span>
            <span v-if="vod.rating" class="mh-score">{{ vod.rating }}</span>
          </div>
          <strong>{{ vod.name }}</strong>
          <p>{{ vod.typeName || '未分类' }}<template v-if="vod.year"> · {{ vod.year }}</template></p>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { readCachedCategories, readCachedSite, writeCachedCategories, writeCachedSite } from '../siteConfig'
import { currentUser, refreshUser } from '../userStore'
import { icon } from './icons'

const router = useRouter()
const site = ref(readCachedSite())
const categories = ref(readCachedCategories().slice(0, 10))
const heroList = ref([])
const historyItems = ref([])
const hotItems = ref([])
const newItems = ref([])
const guessItems = ref([])
const loading = ref(true)

const hero = computed(() => heroList.value[0] || null)
const blocks = computed(() => [
  { key: 'hot', title: '热播推荐', icon: 'hot', sort: 'hot', items: hotItems.value },
  { key: 'new', title: '今日上新', icon: 'calendar', sort: 'recent', items: newItems.value },
  { key: 'guess', title: '猜你喜欢', icon: 'grid', sort: 'rating', items: guessItems.value },
].filter(block => block.items.length))

function poster(vod, heroMode = false) {
  if (!vod) return ''
  const source = heroMode
    ? (vod.heroImage || vod.heroPic || vod.officialPic || vod.pic || vod.localPic)
    : (vod.officialPic || vod.pic || vod.localPic || vod.heroImage || vod.heroPic)
  return imgUrl(source || '')
}

function onImgError(event, fallback = '') {
  const img = event?.target
  if (fallback && img && img.dataset.fallbackApplied !== '1') {
    img.dataset.fallbackApplied = '1'
    img.src = fallback
    return
  }
  if (img) img.style.visibility = 'hidden'
}

function historyProgress(item) {
  const progress = Number(item.progressSec) || 0
  const duration = Number(item.durationSec) || 0
  if (!duration) return '18%'
  return `${Math.max(6, Math.min(100, (progress / duration) * 100))}%`
}

function goPlay(id) {
  if (!id) return
  router.push(`/play/${id}`)
}

function goTheater(type = '', sort = '') {
  router.push({ path: '/m/theater', query: { ...(type ? { type } : {}), ...(sort ? { sort } : {}) } })
}

function goSearch() {
  router.push('/m/search')
}

async function loadHome() {
  loading.value = true
  try {
    const sitePromise = api.site().then(data => { site.value = writeCachedSite(data) }).catch(() => {})
    const categoriesPromise = api.categories().then(data => {
      categories.value = writeCachedCategories(data).slice(0, 10)
    }).catch(() => {})
    const heroPromise = api.hot(10).then(data => { heroList.value = data || [] }).catch(() => {})
    const hotPromise = api.vods({ page: 1, size: 6, sort: 'hot' }).then(res => { hotItems.value = res.list || [] }).catch(() => {})
    const newPromise = api.vods({ page: 1, size: 6, sort: 'recent' }).then(res => { newItems.value = res.list || [] }).catch(() => {})
    const guessPromise = api.vods({ page: 1, size: 6, sort: 'rating' }).then(res => { guessItems.value = res.list || [] }).catch(() => {})
    const userPromise = refreshUser().then(async user => {
      if (!user && !currentUser.value) return
      const rows = await api.history(8)
      historyItems.value = Array.isArray(rows) ? rows.slice(0, 6) : []
    }).catch(() => {})
    await Promise.allSettled([sitePromise, categoriesPromise, heroPromise, hotPromise, newPromise, guessPromise, userPromise])
  } finally {
    loading.value = false
  }
}

onMounted(loadHome)
</script>

<style scoped>
.mh {
  min-height: 100dvh;
  padding: 0 14px calc(88px + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 22% 0%, rgba(255, 102, 79, .16), transparent 32%),
    linear-gradient(180deg, #fff4f1 0%, #f7f7f8 260px, #f7f7f8 100%);
  color: #191a20;
}
.mh-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: calc(env(safe-area-inset-top) + 12px);
}
.mh-brand {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  background: rgba(255, 255, 255, .92);
  color: #f04438;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0;
  box-shadow: 0 10px 26px rgba(43, 20, 18, .06);
}
.mh-brand img {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  object-fit: cover;
}
.mh-search {
  flex: 1;
  min-width: 0;
  height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, .92);
  color: #8b9098;
  box-shadow: 0 10px 26px rgba(43, 20, 18, .06);
  font-size: 14px;
  text-align: left;
}
.mh-search svg,
.mh-section-head svg,
.mh-kicker svg,
.mh-actions svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mh-hero {
  position: relative;
  min-height: 214px;
  margin-top: 14px;
  border-radius: 18px;
  overflow: hidden;
  background: #201210;
  box-shadow: 0 18px 46px rgba(88, 30, 20, .18);
}
.mh-hero-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mh-hero-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(12, 9, 8, .88) 0%, rgba(12, 9, 8, .56) 44%, rgba(12, 9, 8, .18) 100%),
    linear-gradient(0deg, rgba(12, 9, 8, .82) 0%, transparent 55%);
}
.mh-hero-content {
  position: relative;
  z-index: 1;
  min-height: 214px;
  padding: 18px 16px 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  color: #fff;
}
.mh-kicker {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: #ffd0c8;
  font-size: 12px;
  font-weight: 800;
}
.mh-hero h1 {
  max-width: 74%;
  margin: 0;
  font-size: 24px;
  line-height: 1.12;
  letter-spacing: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mh-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 9px 0 0;
}
.mh-meta span {
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .16);
  font-size: 11px;
  font-weight: 700;
}
.mh-desc {
  max-width: 86%;
  margin: 8px 0 0;
  color: rgba(255, 255, 255, .8);
  font-size: 12px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mh-actions {
  display: flex;
  gap: 9px;
  margin-top: 14px;
}
.mh-actions button {
  height: 36px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 900;
}
.mh-primary {
  color: #fff;
  background: linear-gradient(135deg, #ff6a4f, #f04438);
}
.mh-secondary {
  color: #fff;
  background: rgba(255, 255, 255, .18);
  backdrop-filter: blur(10px);
}
.mh-cats {
  margin: 16px -14px 0;
  padding: 0 14px 2px;
  display: flex;
  gap: 9px;
  overflow-x: auto;
  scrollbar-width: none;
}
.mh-cats::-webkit-scrollbar,
.mh-continue::-webkit-scrollbar {
  display: none;
}
.mh-cats button {
  flex: 0 0 auto;
  height: 32px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  color: #343741;
  background: #fff;
  font-weight: 800;
  box-shadow: 0 8px 22px rgba(17, 24, 39, .05);
}
.mh-section {
  margin-top: 22px;
}
.mh-section-head {
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.mh-section-head h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 18px;
  line-height: 1;
}
.mh-section-head h2 svg {
  color: #f04438;
}
.mh-section-head button {
  border: 0;
  padding: 0;
  background: transparent;
  color: #9a9fa8;
  font-size: 13px;
  font-weight: 800;
}
.mh-continue {
  margin: 0 -14px;
  padding: 0 14px 2px;
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scrollbar-width: none;
}
.mh-history {
  width: 122px;
  flex: 0 0 auto;
}
.mh-history-cover {
  position: relative;
  height: 70px;
  border-radius: 12px;
  overflow: hidden;
  background: #e9eaee;
}
.mh-history-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mh-progress {
  position: absolute;
  left: 7px;
  right: 7px;
  bottom: 6px;
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .38);
}
.mh-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #ff6048;
}
.mh-history strong,
.mh-card strong {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  -webkit-line-clamp: 2;
  margin-top: 7px;
  color: #1f232b;
  font-size: 13px;
  line-height: 1.25;
}
.mh-history span,
.mh-card p {
  margin: 4px 0 0;
  color: #8b9098;
  font-size: 11px;
  line-height: 1.2;
}
.mh-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 9px;
}
.mh-poster {
  position: relative;
  aspect-ratio: 3 / 4.25;
  border-radius: 10px;
  overflow: hidden;
  background: #e9eaee;
  box-shadow: 0 8px 22px rgba(17, 24, 39, .08);
}
.mh-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mh-mark,
.mh-score {
  position: absolute;
  z-index: 1;
  left: 6px;
  bottom: 6px;
  max-width: calc(100% - 12px);
  padding: 3px 6px;
  border-radius: 999px;
  color: #fff;
  background: rgba(0, 0, 0, .52);
  font-size: 10px;
  font-weight: 800;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mh-score {
  left: auto;
  right: 6px;
  top: 6px;
  bottom: auto;
  background: #ff6048;
}
.mh-skeleton {
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
  background: #fff;
}
.sk {
  border-radius: 999px;
  background: linear-gradient(90deg, #eceef2, #f7f7f9, #eceef2);
  background-size: 200% 100%;
  animation: sk 1.1s infinite linear;
}
.sk-badge { width: 92px; height: 18px; }
.sk-title { width: 62%; height: 28px; }
.sk-text { width: 84%; height: 14px; }
.sk-actions { width: 148px; height: 36px; }
@keyframes sk {
  to { background-position: -200% 0; }
}
@media (max-width: 360px) {
  .mh-grid {
    gap: 12px 8px;
  }
  .mh-hero h1 {
    font-size: 22px;
  }
}
</style>
