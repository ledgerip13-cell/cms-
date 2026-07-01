<template>
  <header class="nav">
    <div class="container nav-in">
      <div class="brand" @click="goHome">
        <img v-if="site.logo" :src="site.logo" class="brand-logo" alt="logo" />
        {{ site.siteName || '次元港' }}
      </div>

      <!-- 桌面分类导航 -->
      <nav class="tabs desktop-only">
        <span class="tab" :class="{on: !curType}" @click="pick('')">全部</span>
        <span v-for="t in types.slice(0,10)" :key="t.name" class="tab"
          :class="{on: curType===t.name}" @click="pick(t.name)">{{ t.name || '未分类' }}</span>
      </nav>

      <!-- 搜索 -->
      <div class="search-box">
        <div class="search" @click="openSearch">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
          <input ref="searchInput" v-model="kw" placeholder="搜索影片…"
            @focus="openSearch" @keyup.enter="doSearch" />
          <span v-if="kw" class="clear" @click.stop="kw=''">×</span>
        </div>

        <!-- 搜索下拉：热门推荐 / 结果提示 -->
        <transition name="fade">
          <div v-if="searchOpen" class="search-panel" v-click-outside="closeSearch">
            <div class="sp-title">热门影片</div>
            <div class="hot-list">
              <div v-for="(h,i) in hot" :key="h.id" class="hot-item" @click="goPlay(h.id)">
                <span class="hot-rank" :class="{top:i<3}">{{ i+1 }}</span>
                <span class="hot-name">{{ h.name }}</span>
                <span v-if="h.rating" class="hot-score">{{ h.rating }}</span>
              </div>
            </div>
            <div class="sp-foot" @click="doSearch" v-if="kw">搜索“{{ kw }}” →</div>
          </div>
        </transition>
      </div>

      <!-- 移动端分类切换 -->
      <button class="menu-btn mobile-only" @click="drawer=!drawer" aria-label="menu">
        <span></span><span></span><span></span>
      </button>
    </div>

    <!-- 移动端分类抽屉 -->
    <transition name="slide">
      <div v-if="drawer" class="m-drawer">
        <span class="tab" :class="{on: !curType}" @click="pick('')">全部</span>
        <span v-for="t in types" :key="t.name" class="tab"
          :class="{on: curType===t.name}" @click="pick(t.name)">{{ t.name || '未分类' }}</span>
      </div>
    </transition>
  </header>

  <router-view :key="$route.fullPath" />

  <footer class="foot">{{ site.footer || '次元港 · 多源聚合' }} · 仅供技术演示</footer>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from './api'

const router = useRouter()
const types = ref([]); const curType = ref(''); const kw = ref('')
const searchOpen = ref(false); const drawer = ref(false); const hot = ref([])
const site = ref({ siteName:'次元港', logo:'', footer:'' })
const searchInput = ref(null)

function goHome() { curType.value=''; kw.value=''; drawer.value=false; router.push('/') }
function pick(t) { curType.value = t; kw.value=''; drawer.value=false; router.push({ path:'/', query: t?{type:t}:{} }) }
function doSearch() { searchOpen.value=false; if(kw.value) router.push({ path:'/', query:{kw:kw.value} }) }
function goPlay(id) { searchOpen.value=false; router.push('/play/'+id) }
async function openSearch() {
  searchOpen.value = true
  if (!hot.value.length) hot.value = await api.hot(10)
}
function closeSearch() { searchOpen.value = false }

// 简易 click-outside 指令
const vClickOutside = {
  mounted(el, binding) {
    el._handler = (e) => { if (!el.contains(e.target)) binding.value() }
    setTimeout(() => document.addEventListener('click', el._handler), 0)
  },
  unmounted(el) { document.removeEventListener('click', el._handler) }
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

<style>
.desktop-only { display: flex; }
.mobile-only { display: none; }
@media (max-width: 820px) {
  .desktop-only { display: none !important; }
  .mobile-only { display: flex !important; }
}
</style>
