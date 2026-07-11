<template>
  <div
    class="mshell"
    :class="{
      'shorts-shell': route.path.startsWith('/m/shorts'),
      'shorts-full-shell': route.path.startsWith('/m/shorts') && route.query.mode === 'full',
      'search-shell': route.path.startsWith('/m/search'),
      'play-shell': route.path.startsWith('/m/play'),
    }"
  >
    <router-view v-slot="{ Component, route: viewRoute }">
      <transition name="m-page">
        <keep-alive :max="4">
          <component :is="Component" :key="viewRoute.path" />
        </keep-alive>
      </transition>
    </router-view>
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
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthModal from '../components/AuthModal.vue'
import ToastStack from '../components/ToastStack.vue'
import { icon } from './icons'

const route = useRoute()
const router = useRouter()
const tabs = [
  { path: '/m', label: '首页', icon: 'home' },
  { path: '/m/theater', label: '剧场', icon: 'theater' },
  { path: '/m/shorts', label: '刷剧', icon: 'shorts' },
  { path: '/m/me', label: '我的', icon: 'user' },
]
function active(item) {
  return item.path === '/m' ? route.path === '/m' : route.path.startsWith(item.path)
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
      themeColor: '#ffe1db',
      appleStatusBar: 'default',
      htmlBg: '#ffe1db',
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
      appleStatusBar: 'default',
      htmlBg: '#fff4f1',
      bodyBg: '#f7f7f8',
      colorScheme: 'light',
    }
  }
  return {
    themeColor: '#fff4f1',
    appleStatusBar: 'default',
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
  chromeObserver = new MutationObserver(() => {
    const theme = document.querySelector('meta[name="theme-color"]')
    if (theme?.getAttribute('content') !== mobileChromeSettings().themeColor) applyMobileChrome()
  })
  chromeObserver.observe(document.head, { attributes: true, childList: true, subtree: true })
  window.setTimeout(applyMobileChrome, 0)
  window.setTimeout(applyMobileChrome, 400)
})
watch(() => route.path, () => {
  applyMobileChrome()
  window.setTimeout(applyMobileChrome, 0)
})
onBeforeUnmount(restoreChrome)
</script>

<style scoped>
.mshell {
  min-height: 100dvh;
  background: #f7f7f8;
}
.m-page-enter-active,
.m-page-leave-active {
  transition: opacity .12s ease, transform .12s ease;
}
.m-page-enter-from {
  opacity: 0;
  transform: translateY(5px);
}
.m-page-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}
.shorts-shell .m-page-enter-from,
.shorts-shell .m-page-leave-to {
  transform: none;
}
.mtab {
  position: fixed;
  z-index: 50;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(62px + env(safe-area-inset-bottom));
  padding: 6px 14px calc(6px + env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  background: rgba(255, 255, 255, .94);
  border-top: 1px solid rgba(18, 20, 26, .08);
  backdrop-filter: blur(18px);
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
  font-weight: 700;
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
.shorts-shell {
  background: #050505;
}
.play-shell {
  background: #f7f7f8;
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
