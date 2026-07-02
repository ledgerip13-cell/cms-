<template>
  <div class="layout">
    <!-- 移动端遮罩 -->
    <div v-if="drawer" class="sb-backdrop" @click="drawer=false"></div>

    <!-- 左侧导航栏 -->
    <aside class="sidebar" :class="{open: drawer}">
      <div class="sb-brand" @click="goHome">
        <img v-if="site.logo" :src="site.logo" alt="logo" />
        <span v-else class="dot"></span>
        {{ site.siteName || '次元港' }}
      </div>
      <nav class="sb-nav">
        <div class="sb-item" :class="{on: !curType && !isSearch}" @click="pick('')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z"/></svg>
          <span>首页</span>
        </div>
        <div class="sb-sep"></div>
        <div class="sb-label">分类</div>
        <div v-for="t in types" :key="t.name" class="sb-item"
          :class="{on: curType===t.name}" @click="pick(t.name)">
          <span v-html="iconFor(t.name)"></span>
          <span>{{ t.name || '未分类' }}</span>
        </div>
      </nav>
    </aside>

    <!-- 主区 -->
    <div class="main">
      <header class="topbar">
        <button class="menu-btn" @click="drawer=!drawer" aria-label="menu">
          <span></span><span></span><span></span>
        </button>
        <div class="search-box">
          <div class="search" @click="openSearch">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
            </svg>
            <input ref="searchInput" v-model="kw" placeholder="搜索你想看的影片、演员…"
              @focus="openSearch" @keyup.enter="doSearch" />
            <span v-if="kw" class="clear" @click.stop="kw=''">×</span>
            <button class="search-btn" @click.stop="doSearch">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              搜索
            </button>
          </div>
          <transition name="fade">
            <div v-if="searchOpen" class="search-panel" v-click-outside="closeSearch" @mousedown.stop>
              <div class="sp-head">
                <span v-for="t in rankTabs" :key="t.cat" class="sp-tab" :class="{on: rankCat===t.cat}"
                  @click="switchRank(t.cat)">{{ t.label }}</span>
              </div>
              <div class="sp-grid" v-if="!rankLoading">
                <div v-for="(h,i) in hot" :key="h.id" class="sp-item" @click="goPlay(h.id)">
                  <span class="sp-rank" :class="['r'+(i+1), {top:i<3}]">{{ i+1 }}</span>
                  <div class="sp-thumb">
                    <img v-if="h.officialPic || h.pic" :src="pic(h)" :alt="h.name" loading="lazy" @error="onErr" />
                    <div v-else class="noimg"></div>
                    <span class="sp-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
                  </div>
                  <div class="sp-info">
                    <div class="sp-name">{{ h.name }}</div>
                    <div class="sp-sub">
                      <span v-if="h.rating" class="sp-score">★{{ h.rating }}</span>
                      <span>{{ h.typeName || '未分类' }}</span>
                      <span v-if="h.year">{{ h.year }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="sp-loading">加载中…</div>
              <div v-if="!rankLoading && !hot.length" class="sp-empty">该榜单暂无数据</div>
              <div class="sp-foot" @click="doSearch" v-if="kw">搜索“{{ kw }}” →</div>
            </div>
          </transition>
        </div>
      </header>

      <router-view v-slot="{ Component }">
        <keep-alive :include="['Home']" :max="1">
          <component :is="Component" />
        </keep-alive>
      </router-view>

      <footer class="foot">{{ site.footer || '次元港 · 多源聚合' }} · 仅供技术演示</footer>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api, imgUrl } from './api'

const router = useRouter()
const route = useRoute()
const types = ref([]); const kw = ref('')
const searchOpen = ref(false); const drawer = ref(false); const hot = ref([])
const rankTabs = [
  { cat: 'hot', label: '热搜榜' },
  { cat: 'guoman', label: '国漫榜' },
  { cat: 'anime', label: '动漫榜' },
  { cat: 'shortplay', label: '短剧榜' },
]
const rankCat = ref('hot'); const rankLoading = ref(false)
const rankCache = new Map()
const site = ref({ siteName:'次元港', logo:'', footer:'' })
const searchInput = ref(null)

const curType = computed(() => route.query.type || '')
const isSearch = computed(() => !!route.query.kw)

function pic(v) { return imgUrl(v.officialPic || v.pic || '') }
function onErr(e) { e.target.style.visibility='hidden' }
function goHome() { kw.value=''; drawer.value=false; router.push('/') }
function pick(t) { kw.value=''; drawer.value=false; router.push({ path:'/', query: t?{type:t}:{} }) }
function doSearch() { searchOpen.value=false; if(kw.value) router.push({ path:'/', query:{kw:kw.value} }) }
function goPlay(id) { searchOpen.value=false; router.push('/play/'+id) }
async function loadRank(cat) {
  if (rankCache.has(cat)) { hot.value = rankCache.get(cat); return }
  rankLoading.value = true
  try {
    const r = await api.hot(10, cat === 'hot' ? undefined : cat)
    rankCache.set(cat, r); hot.value = r
  } catch { hot.value = [] } finally { rankLoading.value = false }
}
function switchRank(cat) { rankCat.value = cat; loadRank(cat) }
async function openSearch() {
  if (searchOpen.value) return
  searchOpen.value = true
  if (!hot.value.length) await loadRank(rankCat.value)
}
function closeSearch() { searchOpen.value = false }

// 分类图标映射
const ICONS = {
  '电影': '<path d="M4 4h16v16H4z"/><path d="M4 9h16M4 15h16M9 4v16M15 4v16"/>',
  '电视剧': '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M12 3v3"/>',
  '综艺': '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z"/>',
  '动漫': '<circle cx="9" cy="12" r="6"/><path d="M15 8a5 5 0 0 1 0 8"/><circle cx="9" cy="11" r="1.2" fill="currentColor"/>',
  '漫剧': '<path d="M4 5h16v11H8l-4 4z"/>',
  '短剧': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 9l5 3-5 3z"/>',
  '解说': '<path d="M12 3a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  '体育': '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18"/>',
  '纪录片': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
}
function iconFor(name) {
  const inner = ICONS[name] || '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/>'
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}

// 用 mousedown 而非延迟绑定的 click：避免与当次点击事件时序冲突导致“点一下消失”
const vClickOutside = {
  mounted(el, binding) {
    el._handler = (e) => { if (!el.contains(e.target)) binding.value() }
    document.addEventListener('mousedown', el._handler)
  },
  unmounted(el) { document.removeEventListener('mousedown', el._handler) }
}

function applySite(s) {
  document.title = s.siteName || '次元港'
  if (s.logo) {
    let link = document.querySelector("link[rel~='icon']")
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
    link.href = s.logo
  }
}
onMounted(async () => {
  types.value = (await api.categories()).filter(t=>t.count>0)
  try { site.value = await api.site(); applySite(site.value) } catch {}
})
</script>
