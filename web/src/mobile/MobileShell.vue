<template>
  <div
    class="mshell"
    :class="{
      'shorts-shell': route.path.startsWith('/m/shorts'),
      'shorts-full-shell': route.path.startsWith('/m/shorts') && route.query.mode === 'full',
      'search-shell': route.path.startsWith('/m/search'),
      'play-shell': route.path.startsWith('/m/play'),
      'chrome-ready': chromeReady,
    }"
  >
    <div class="m-route-stage">
      <router-view v-slot="{ Component, route: viewRoute }">
        <transition :name="pageTransitionName">
          <keep-alive :max="4">
            <component :is="Component" :key="viewRoute.path" />
          </keep-alive>
        </transition>
      </router-view>
    </div>
    <template v-if="blockEdgeSwipe">
      <div class="m-edge-guard m-edge-guard-left" aria-hidden="true" @touchstart.prevent @touchmove.prevent @pointerdown.prevent></div>
      <div class="m-edge-guard m-edge-guard-right" aria-hidden="true" @touchstart.prevent @touchmove.prevent @pointerdown.prevent></div>
    </template>
    <nav v-if="!route.path.startsWith('/m/search') && !route.path.startsWith('/m/play')" class="mtab" aria-label="移动端模板导航">
      <button v-for="item in tabs" :key="item.path" type="button" :class="{ on: active(item) }" @click="router.push(item.path)">
        <svg viewBox="0 0 24 24" v-html="icon(item.icon)"></svg>
        <span>{{ item.label }}</span>
      </button>
    </nav>
    <AuthModal />
    <ToastStack />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthModal from '../components/AuthModal.vue'
import ToastStack from '../components/ToastStack.vue'
import { icon } from './icons'

const route = useRoute()
const router = useRouter()
const pageTransitionName = ref('m-page-none')
const chromeReady = ref(false)
const tabs = [
  { path: '/m', label: '首页', icon: 'home' },
  { path: '/m/theater', label: '剧场', icon: 'theater' },
  { path: '/m/shorts', label: '刷剧', icon: 'shorts' },
  { path: '/m/me', label: '我的', icon: 'user' },
]
function active(item) {
  return item.path === '/m' ? route.path === '/m' : route.path.startsWith(item.path)
}
function secondaryLevel(path) {
  return path.startsWith('/m/play') || path.startsWith('/m/search')
}
function primaryLevel(path) {
  return path === '/m' || path === '/m/theater' || path === '/m/shorts' || path === '/m/me'
}
const blockEdgeSwipe = computed(() => primaryLevel(route.path))
let previousPath = route.path
// —— 方案B：手势返回判定（边缘触摸 + 横向位移 + popstate），命中则本次导航跳过 transition ——
let edgeSwipeTracking = false
let edgeSwipeStartX = 0
let gestureSwipeAt = 0
let pendingGestureBack = false
let pendingGestureBackTimer = 0

function onGestureTouchStart(event) {
  edgeSwipeTracking = false
  if (!secondaryLevel(route.path)) return
  const touch = event.touches?.[0]
  if (!touch) return
  const width = window.innerWidth || document.documentElement.clientWidth || 0
  const x = Number(touch.pageX ?? touch.clientX) || 0
  const edgeWidth = 30
  if (x <= edgeWidth || (width > 0 && x >= width - edgeWidth)) {
    edgeSwipeTracking = true
    edgeSwipeStartX = x
  }
}
function onGestureTouchMove(event) {
  if (!edgeSwipeTracking) return
  const touch = event.touches?.[0]
  if (!touch) return
  const x = Number(touch.pageX ?? touch.clientX) || 0
  if (Math.abs(x - edgeSwipeStartX) > 12) {
    gestureSwipeAt = Date.now()
  }
}
function onGesturePopstate() {
  if (Date.now() - gestureSwipeAt < 1500) {
    pendingGestureBack = true
    window.clearTimeout(pendingGestureBackTimer)
    pendingGestureBackTimer = window.setTimeout(() => { pendingGestureBack = false }, 900)
  }
}

function syncPageTransition(nextPath, prevPath = previousPath) {
  if (pendingGestureBack) {
    // 系统已播过快照动画，这次导航不再播 transition，同步换页压掉空窗闪动
    pendingGestureBack = false
    window.clearTimeout(pendingGestureBackTimer)
    pageTransitionName.value = 'm-page-none'
    previousPath = nextPath
    return
  }
  if (nextPath.startsWith('/m/shorts') || prevPath.startsWith('/m/shorts')) {
    pageTransitionName.value = 'm-page-none'
  } else if (secondaryLevel(nextPath) && !secondaryLevel(prevPath)) {
    pageTransitionName.value = 'm-push'
  } else if (!secondaryLevel(nextPath) && secondaryLevel(prevPath)) {
    pageTransitionName.value = 'm-pop'
  } else {
    pageTransitionName.value = 'm-page-none'
  }
  previousPath = nextPath
}

let previousThemeColor = ''
let previousAppleStatusBar = ''
let previousHtmlBg = ''
let previousBodyBg = ''
let previousHtmlBgColor = ''
let previousBodyBgColor = ''
let previousColorScheme = ''
let chromeObserver = null
let chromeSnapshotTaken = false

function isStandalonePwa() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true
}

function onDocumentEdgeTouchStart(event) {
  if (!blockEdgeSwipe.value || !isStandalonePwa()) return
  const touch = event.touches?.[0]
  if (!touch) return
  const edgeWidth = 25
  const width = window.innerWidth || document.documentElement.clientWidth || 0
  const x = Number(touch.pageX ?? touch.clientX) || 0
  if (x <= edgeWidth || (width > 0 && x >= width - edgeWidth)) {
    event.preventDefault()
  }
}

function ensureMeta(name) {
  let tag = document.querySelector(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  return tag
}

function mobileChromeSettings() {
  if (route.path.startsWith('/m/shorts')) {
    return {
      themeColor: '#050505',
      appleStatusBar: 'black-translucent',
      htmlBg: '#050505',
      bodyBg: '#050505',
      colorScheme: 'dark',
    }
  }
  if (route.path === '/m') {
    return {
      themeColor: '#fff4f1',
      appleStatusBar: 'black-translucent',
      htmlBg: '#fff4f1',
      bodyBg: '#f7f7f8',
      colorScheme: 'light',
    }
  }
  if (route.path.startsWith('/m/play')) {
    return {
      themeColor: '#08090d',
      appleStatusBar: 'black-translucent',
      htmlBg: '#08090d',
      bodyBg: '#f7f7f8',
      colorScheme: 'light',
    }
  }
  if (route.path.startsWith('/m/search') || route.path.startsWith('/m/theater')) {
    return {
      themeColor: '#fff4f1',
      appleStatusBar: 'black-translucent',
      htmlBg: '#fff4f1',
      bodyBg: route.path.startsWith('/m/search') ? '#fffefe' : '#f7f7f8',
      colorScheme: 'light',
    }
  }
  return {
    themeColor: '#fff4f1',
    appleStatusBar: 'black-translucent',
    htmlBg: '#f7f7f8',
    bodyBg: '#f7f7f8',
    colorScheme: 'light',
  }
}

function applyMobileChrome() {
  const theme = ensureMeta('theme-color')
  const apple = ensureMeta('apple-mobile-web-app-status-bar-style')
  if (!chromeSnapshotTaken) {
    previousThemeColor = theme.getAttribute('content') || ''
    previousAppleStatusBar = apple.getAttribute('content') || ''
    previousHtmlBg = document.documentElement.style.background || ''
    previousBodyBg = document.body.style.background || ''
    previousHtmlBgColor = document.documentElement.style.backgroundColor || ''
    previousBodyBgColor = document.body.style.backgroundColor || ''
    previousColorScheme = document.documentElement.style.colorScheme || ''
    chromeSnapshotTaken = true
  }
  const settings = mobileChromeSettings()
  theme.setAttribute('content', settings.themeColor)
  apple.setAttribute('content', settings.appleStatusBar)
  document.documentElement.style.background = settings.htmlBg
  document.body.style.background = settings.bodyBg
  document.documentElement.style.backgroundColor = settings.htmlBg
  document.body.style.backgroundColor = settings.bodyBg
  document.documentElement.style.colorScheme = settings.colorScheme
}

function restoreChrome() {
  if (chromeObserver) {
    chromeObserver.disconnect()
    chromeObserver = null
  }
  const theme = document.querySelector('meta[name="theme-color"]')
  const apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  if (theme) theme.setAttribute('content', previousThemeColor || '#0a0b0f')
  if (apple) apple.setAttribute('content', previousAppleStatusBar || 'black')
  document.documentElement.style.background = previousHtmlBg
  document.body.style.background = previousBodyBg
  document.documentElement.style.backgroundColor = previousHtmlBgColor
  document.body.style.backgroundColor = previousBodyBgColor
  document.documentElement.style.colorScheme = previousColorScheme
}

onMounted(() => {
  applyMobileChrome()
  document.addEventListener('touchstart', onDocumentEdgeTouchStart, { passive: false, capture: true })
  document.addEventListener('touchstart', onGestureTouchStart, { passive: true, capture: true })
  document.addEventListener('touchmove', onGestureTouchMove, { passive: true, capture: true })
  window.addEventListener('popstate', onGesturePopstate)
  chromeObserver = new MutationObserver(() => {
    const theme = document.querySelector('meta[name="theme-color"]')
    if (theme?.getAttribute('content') !== mobileChromeSettings().themeColor) applyMobileChrome()
  })
  chromeObserver.observe(document.head, { attributes: true, childList: true, subtree: true })
  window.setTimeout(applyMobileChrome, 0)
  window.setTimeout(applyMobileChrome, 400)
  window.setTimeout(() => { chromeReady.value = true }, 220)
})
watch(() => route.path, () => {
  syncPageTransition(route.path)
  applyMobileChrome()
  window.setTimeout(applyMobileChrome, 0)
})
onBeforeUnmount(() => {
  document.removeEventListener('touchstart', onDocumentEdgeTouchStart, true)
  document.removeEventListener('touchstart', onGestureTouchStart, true)
  document.removeEventListener('touchmove', onGestureTouchMove, true)
  window.removeEventListener('popstate', onGesturePopstate)
  window.clearTimeout(pendingGestureBackTimer)
  restoreChrome()
})
</script>

<style scoped>
.mshell {
  --mobile-tab-height: calc(62px + env(safe-area-inset-bottom));
  min-height: 100dvh;
  background: #f7f7f8;
}
.m-route-stage {
  position: relative;
  min-height: 100dvh;
  overflow-x: hidden;
}
.search-shell,
.play-shell {
  background: #f7f7f8;
}
.search-shell {
  background: #fffefe;
}
.shorts-shell {
  background: #050505;
}
.m-edge-guard {
  position: fixed;
  z-index: 2147483647;
  top: 0;
  bottom: 0;
  width: 24px;
  touch-action: none;
  pointer-events: auto;
  background: transparent;
}
.m-edge-guard-left {
  left: 0;
}
.m-edge-guard-right {
  right: 0;
}
.m-push-enter-active,
.m-push-leave-active,
.m-pop-enter-active,
.m-pop-leave-active {
  transition: opacity .22s cubic-bezier(.22, .61, .36, 1), transform .22s cubic-bezier(.22, .61, .36, 1);
  will-change: transform, opacity;
  backface-visibility: hidden;
}
.m-push-leave-active,
.m-pop-leave-active {
  position: absolute;
  inset: 0;
  width: 100%;
  pointer-events: none;
}
.m-push-enter-from {
  opacity: .98;
  transform: translate3d(100%, 0, 0);
}
.m-push-enter-to,
.m-push-leave-from,
.m-pop-enter-to,
.m-pop-leave-from {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}
.m-push-leave-to {
  opacity: .92;
  transform: translate3d(-18%, 0, 0);
}
.m-pop-enter-from {
  opacity: .96;
  transform: translate3d(-18%, 0, 0);
}
.m-pop-leave-to {
  opacity: .98;
  transform: translate3d(100%, 0, 0);
}
.mtab {
  position: fixed;
  z-index: 50;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--mobile-tab-height);
  min-height: var(--mobile-tab-height);
  padding: 6px 14px calc(6px + env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  background: rgba(255, 255, 255, .94);
  border-top: 1px solid rgba(18, 20, 26, .08);
  backdrop-filter: blur(18px);
  transition: opacity .12s ease, transform .12s ease;
}
.mshell:not(.chrome-ready) .mtab {
  opacity: 0;
  pointer-events: none;
  transform: translate3d(0, 10px, 0);
}
.mtab button {
  min-width: 0;
  border: 0;
  padding: 4px 0;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: transparent;
  color: #8a8f99;
  font-size: 11px;
  line-height: 1.1;
  font-weight: var(--small-text-max-weight);
}
.mtab svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mtab button.on {
  color: #f04438;
}
.shorts-shell .mtab {
  background: rgba(8, 8, 10, .72);
  border-top-color: rgba(255, 255, 255, .08);
}
.shorts-shell .mtab button {
  color: rgba(255, 255, 255, .62);
}
.shorts-shell .mtab button.on {
  color: #ff5a49;
}
.shorts-full-shell .mtab {
  display: none;
}
</style>
