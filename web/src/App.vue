<template>
  <X8Home v-if="isX8HomeRoute" />
  <router-view v-else-if="isShortsRoute || isMobileTemplateRoute || isX8PreviewRoute" />
  <div v-else class="layout" :class="{'home-cover-sidebar': isHomeRoot}">
    <!-- 移动端遮罩 -->
    <div v-if="drawer" class="sb-backdrop" @click="drawer=false"></div>

    <!-- 左侧导航栏 -->
    <aside class="sidebar" :class="{open: drawer}">
      <div class="sb-brand" @click="goHome">
        <img v-if="site.logo" :src="site.logo" alt="logo" />
        <span v-if="site.siteName">{{ site.siteName }}</span>
      </div>
      <nav class="sb-nav">
        <div class="sb-item" :class="{on: isHomeRoot}" @click="pick('')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z"/></svg>
          <span>全军出鸡</span>
        </div>
        <div v-if="shortsEnabled" class="sb-item" @click="goShorts">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="18" rx="3"/><path d="M11 9l4 3-4 3z"/></svg>
          <span>刷短剧</span>
        </div>
        <div class="sb-item" :class="{on: route.path==='/me' && (!route.query.tab || route.query.tab==='history')}" @click="goProfileSection('history')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>
          <span>最近观看</span>
        </div>
        <div class="sb-item" :class="{on: route.path==='/me' && route.query.tab==='follows'}" @click="goProfileSection('follows')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.35-9.2-8.18C.75 9.25 2.7 5 6.7 5c2.05 0 3.35 1.12 4.05 2.08C11.45 6.12 12.75 5 14.8 5c4 0 5.95 4.25 3.9 7.82C16.5 16.65 12 21 12 21z"/></svg>
          <span>我的追剧</span>
        </div>
        <div class="sb-sep"></div>
        <div class="sb-label">分类</div>
        <div v-for="t in types" :key="t.name" class="sb-item"
          :class="{on: isHomeRoute && curType===t.name}" @click="pick(t.name)">
          <span class="category-nav-icon" v-html="categoryIconSvg(t.icon, t.name)"></span>
          <span>{{ t.name || '未分类' }}</span>
        </div>
      </nav>
    </aside>

    <!-- 主区 -->
    <div class="main">
      <header class="topbar">
        <div class="mobile-tabs" aria-label="移动端分类导航">
          <button class="mobile-tab" :class="{on: isHomeRoot}" @click="pick('')">全军出鸡</button>
          <button v-if="shortsEnabled" class="mobile-tab" @click="goShorts">刷短剧</button>
          <button v-for="t in types" :key="t.name" class="mobile-tab" :class="{on: isHomeRoute && curType===t.name}" @click="pick(t.name)">
            {{ t.name || '未分类' }}
          </button>
        </div>
        <div class="topbar-main" :class="{searching: searchOpen}">
          <button class="menu-btn" @click="drawer=!drawer" aria-label="menu">
            <span></span><span></span><span></span>
          </button>
          <div class="search-box" :class="{open: searchOpen}">
            <div class="search-row">
              <div class="search" @click="openSearch">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
                </svg>
                <input ref="searchInput" v-model="kw" placeholder="搜索你想看的影片、演员…"
                  @focus="openSearch" @keyup.enter="doSearch" @keyup.esc="cancelSearch" />
                <span v-if="kw" class="clear" @click.stop="kw=''">×</span>
                <button class="search-btn" @click.stop="doSearch">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                  搜索
                </button>
              </div>
              <button v-if="searchOpen" class="search-cancel" aria-label="取消搜索" @mousedown.stop @click.stop="cancelSearch">取消</button>
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
                      <img v-if="h.officialPic || h.pic || h.localPic" :src="pic(h)" :alt="h.name" loading="lazy" @error="onErr($event, fallbackPic(h))" />
                      <div v-else class="noimg"></div>
                      <span class="sp-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 5.8v12.4a1.15 1.15 0 0 0 1.78.96l8.8-6.2a1.16 1.16 0 0 0 0-1.92l-8.8-6.2a1.15 1.15 0 0 0-1.78.96Z"/></svg></span>
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
          <div class="top-user">
            <button v-if="user" class="user-chip" @click="router.push('/me')" aria-label="个人中心">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
              <span class="user-chip-text">{{ user.nickname || user.username }}</span>
              <span v-if="user.vipLevel" class="user-level-label" :style="levelTagStyle(user.vipLevel)">{{ user.vipLevel.name }}</span>
            </button>
            <button v-else class="user-chip" @click="openLogin" aria-label="登录">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
              <span class="user-chip-text">登录</span>
            </button>
          </div>
        </div>
      </header>

      <router-view v-slot="{ Component }">
        <keep-alive :include="['Home']" :max="1">
          <component :is="Component" />
        </keep-alive>
      </router-view>

      <footer v-if="site.footer" class="foot">{{ site.footer }}</footer>
    </div>
  </div>
  <AuthModal />
  <ToastStack />
  <div v-if="pwaUpdateReady" class="pwa-update">
    <div>
      <b>发现新版本</b>
      <span>升级后可立即使用最新功能。</span>
    </div>
    <button type="button" @click="updatePwa">立即升级</button>
    <button class="ghost" type="button" @click="pwaUpdateReady = false" aria-label="稍后再说">稍后</button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AuthModal from './components/AuthModal.vue'
import ToastStack from './components/ToastStack.vue'
import X8Home from './x8/X8Home.vue'
import { api, imgUrl } from './api'
import { applySiteHead, applySiteTheme, readCachedCategories, readCachedSite, themePageFromRoute, writeCachedCategories, writeCachedSite } from './siteConfig'
import { openAuthDialog } from './authDialog'
import { currentUser, refreshUser } from './userStore'
import { levelTagStyle } from './levelTag'
import { applyPwaUpdate, enforcePwaViewportLock, setupPwaUpdates, setupPwaViewportLock } from './pwa'
import { categoryIconSvg } from './categoryIcons'

const router = useRouter()
const route = useRoute()
const types = ref(readCachedCategories()); const kw = ref('')
const searchOpen = ref(false); const drawer = ref(false); const hot = ref([])
const rankTabs = [
  { cat: 'hot', label: '热搜榜' },
  { cat: 'guoman', label: '国漫榜' },
  { cat: 'anime', label: '动漫榜' },
  { cat: 'shortplay', label: '短剧榜' },
]
const rankCat = ref('hot'); const rankLoading = ref(false)
const rankCache = new Map()
const site = ref(readCachedSite())
const searchInput = ref(null)
const user = currentUser
const pwaUpdateReady = ref(false)

const curType = computed(() => route.query.type || '')
const isSearch = computed(() => !!route.query.kw)
const isHomeRoute = computed(() => route.path === '/')
const isHomeRoot = computed(() => isHomeRoute.value && !curType.value && !isSearch.value)
const isShortsRoute = computed(() => route.path === '/shorts')
const isMobileTemplateRoute = computed(() => route.path === '/m' || route.path.startsWith('/m/'))
const isX8PreviewRoute = computed(() => route.path === '/x8' || route.path.startsWith('/x8/'))
const isX8HomeRoute = computed(() => site.value?.homeConfig?.adaptiveTemplate === 'x8' && (route.path === '/' || route.path.startsWith('/play/')))
const shortsEnabled = computed(() => site.value?.shortsConfig?.enabled !== false)
const mobileTemplateEnabled = computed(() => site.value?.homeConfig?.mobileTemplate === 'shortDrama')
const userAccessSignature = computed(() => [
  user.value?.id || 0,
  user.value?.isVip ? 1 : 0,
  user.value?.vipLevelId || 0,
].join(':'))

// 任何路由切换都强制关闭移动端侧边栏抽屉，避免从首页点开菜单后跳转到播放页时状态残留遮挡内容
watch(() => route.fullPath, () => {
  drawer.value = false
  enforcePwaViewportLock()
  applySiteTheme(site.value, themePageFromRoute(route))
  applyMobileTemplateRedirect()
})
watch(() => site.value?.homeConfig?.mobileTemplate, applyMobileTemplateRedirect)
watch(userAccessSignature, () => {
  void refreshMenuCategories()
})

function pic(v) { return imgUrl(v.officialPic || v.pic || v.localPic || '') }
function fallbackPic(v) { return imgUrl(v.localPic || '') }
function onErr(e, fallback = '') {
  const img = e?.target
  if (fallback && img && img.dataset.localFallbackApplied !== '1' && img.getAttribute('src') !== fallback) {
    img.dataset.localFallbackApplied = '1'
    img.src = fallback
    return
  }
  if (img) img.style.visibility='hidden'
}
function goHome() { kw.value=''; drawer.value=false; router.push('/') }
function pick(t) { kw.value=''; drawer.value=false; router.push({ path:'/', query: t?{type:t}:{} }) }
function goShorts() {
  if (!shortsEnabled.value) return
  kw.value=''; drawer.value=false; searchOpen.value=false; router.push('/shorts')
}
function goProfileSection(section) {
  kw.value=''; drawer.value=false; searchOpen.value=false
  router.push({ path: '/me', query: { tab: section } }).catch?.(() => {})
  window.dispatchEvent(new CustomEvent('profile-tab', { detail: section }))
}
function doSearch() { searchOpen.value=false; if(kw.value) router.push({ path:'/', query:{kw:kw.value} }) }
function goPlay(id) { searchOpen.value=false; router.push('/play/'+id) }
function openLogin() { openAuthDialog({ mode: 'login', redirect: route.fullPath }) }
function isPhoneDevice() {
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const touchPoints = navigator.maxTouchPoints || 0
  const isIpad = /iPad/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1)
  const isTablet = /Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))
  if (isIpad || isTablet) return false
  return /iPhone|iPod|Windows Phone|Android.*Mobile|Mobile.*Android/i.test(ua)
}
function mobileTemplateTarget() {
  if (!mobileTemplateEnabled.value || isMobileTemplateRoute.value || !isPhoneDevice()) return null
  const playMatch = route.path.match(/^\/play\/([^/?#]+)/)
  if (playMatch) return { path: `/m/play/${playMatch[1]}` }
  if (route.path !== '/') return null
  const kw = String(route.query.kw || '').trim()
  if (kw) return { path: '/m/search', query: { kw } }
  const type = String(route.query.type || '').trim()
  const sort = String(route.query.sort || '').trim()
  if (type || sort) return { path: '/m/theater', query: { ...(type ? { type } : {}), ...(sort ? { sort } : {}) } }
  return { path: '/m' }
}
function applyMobileTemplateRedirect() {
  const target = mobileTemplateTarget()
  if (target) router.replace(target).catch?.(() => {})
}
function cancelSearch() {
  searchOpen.value = false
  searchInput.value?.blur?.()
}
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
function updatePwa() {
  if (!applyPwaUpdate()) window.location.reload()
}

async function refreshMenuCategories() {
  try {
    const data = await api.categories()
    types.value = writeCachedCategories(Array.isArray(data) ? data : [])
  } catch {
    if (!types.value.length) types.value = []
  }
}

// 用 mousedown 而非延迟绑定的 click：避免与当次点击事件时序冲突导致“点一下消失”
const vClickOutside = {
  mounted(el, binding) {
    el._handler = (e) => { if (!el.contains(e.target)) binding.value() }
    document.addEventListener('mousedown', el._handler)
  },
  unmounted(el) { document.removeEventListener('mousedown', el._handler) }
}

onMounted(async () => {
  setupPwaViewportLock()
  applySiteHead(site.value)
  applySiteTheme(site.value, themePageFromRoute(route))
  void refreshUser()
  const sitePromise = api.site().then(data => {
    site.value = writeCachedSite(data)
    applySiteHead(site.value)
    applySiteTheme(site.value, themePageFromRoute(route))
    applyMobileTemplateRedirect()
  }).catch(() => {})
  const categoriesPromise = refreshMenuCategories()
  await Promise.allSettled([sitePromise, categoriesPromise])
  if (site.value?.pwaConfig?.enabled !== false) setupPwaUpdates(() => { pwaUpdateReady.value = true })
})
</script>
