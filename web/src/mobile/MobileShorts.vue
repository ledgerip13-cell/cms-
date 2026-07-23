<template>
  <main class="ms" :class="{ 'full-mode': fullMode, 'clear-mode': clearScreen, 'route-hidden': !shortsVisible }" :style="shortsVars">
    <section
      v-if="!disabled && units.length"
      ref="feedEl"
      class="ms-feed"
      :class="{ frozen: filterOpen || episodeDrawerOpen || toolMenuOpen }"
      @scroll.passive="onScroll"
      @scrollend.passive="onScrollEnd"
      @pointerdown.passive="onFullScrollStart"
      @pointerup.passive="onFullScrollRelease"
      @pointercancel.passive="onFullScrollRelease"
      @touchstart.passive="onFullScrollStart"
      @touchend.passive="onFullScrollRelease"
      @touchcancel.passive="onFullScrollRelease"
    >
      <article v-for="(unit, index) in displayUnits" :key="unit.key" class="ms-card">
        <div class="ms-bg" :style="posterStyle(unit)"></div>
        <img class="ms-poster m-img-fade" :src="poster(unit)" :alt="unit.vod.name" loading="lazy" @load="onImgLoad" @error="hideBrokenImg" />
        <video
          v-if="isActiveDisplay(index) && playingKey === unit.key && playUrl && !accessBlock"
          ref="videoEl"
          class="ms-video"
          :class="{ contain: videoContain, landscape: videoLandscape, ready: videoReady }"
          autoplay
          playsinline
          webkit-playsinline
          :muted="muted"
          @loadedmetadata="onVideoMeta"
          @canplay="onVideoCanPlay"
          @timeupdate="onTimeUpdate"
          @playing="onPlaying"
          @pause="onPause"
          @ended="nextItem"
          @error="onVideoError"
          @click="togglePlay"
        ></video>
        <div class="ms-vignette"></div>
        <div
          v-if="isActiveDisplay(index) && clearScreen && fullMode && videoLandscape && !accessBlock"
          class="ms-brightness-mask"
          :style="{ opacity: brightnessMaskOpacity }"
        ></div>
        <div
          v-if="isActiveDisplay(index) && clearScreen && fullMode && videoLandscape && !accessBlock"
          class="ms-clear-gesture-layer"
          @touchstart.stop="onClearGestureStart($event, index)"
          @touchmove.stop.prevent="onClearGestureMove($event, index)"
          @touchend.stop.prevent="onClearGestureEnd($event, index)"
          @touchcancel.stop.prevent="onClearGestureEnd($event, index)"
        ></div>
        <div v-if="isActiveDisplay(index) && clearGestureHud" class="ms-clear-hud">
          <strong>{{ clearGestureHud }}</strong>
          <span>{{ clearGestureValue }}</span>
        </div>

        <div v-if="isActiveDisplay(index)" class="ms-top" :class="{ full: fullMode }">
          <template v-if="fullMode">
            <div class="ms-top-left">
              <button class="m-back-btn" type="button" aria-label="返回刷剧" @click="exitFullContent">
                <svg viewBox="0 0 24 24" v-html="icon('back')"></svg>
              </button>
              <span class="ms-episode-title">{{ unit.epName || `第${unit.epIndex + 1}集` }}</span>
              <span v-if="qualityLabel && playingKey === unit.key" class="ms-quality-pill">{{ qualityLabel }}</span>
            </div>
            <div class="ms-top-right">
              <button type="button" aria-label="搜索" @click="goSearch">
                <svg viewBox="0 0 24 24" v-html="icon('search')"></svg>
              </button>
              <button type="button" aria-label="播放设置" @click="toolMenuOpen = !toolMenuOpen">
                <svg viewBox="0 0 24 24" v-html="icon('more')"></svg>
              </button>
            </div>
          </template>
          <template v-else>
            <button type="button" aria-label="筛选" @click="filterOpen = true">
              <svg viewBox="0 0 24 24" v-html="icon('filter')"></svg>
            </button>
            <button type="button" aria-label="搜索" @click="goSearch">
              <svg viewBox="0 0 24 24" v-html="icon('search')"></svg>
            </button>
          </template>
        </div>

        <div v-if="isActiveDisplay(index) && fullMode && toolMenuOpen" class="ms-tool-menu">
          <button type="button" @click="setPlaybackRate(0.75)">0.75x</button>
          <button type="button" @click="setPlaybackRate(1)">1.0x</button>
          <button type="button" @click="setPlaybackRate(1.25)">1.25x</button>
          <button type="button" @click="setPlaybackRate(1.5)">1.5x</button>
          <button type="button" @click="toggleClearScreen">
            <svg viewBox="0 0 24 24" v-html="icon('clean')"></svg>
            清屏播放
          </button>
          <button type="button" @click="requestPictureInPicture">
            <svg viewBox="0 0 24 24" v-html="icon('pip')"></svg>
            小窗模式
          </button>
          <button type="button" @click="requestRemotePlayback">
            <svg viewBox="0 0 24 24" v-html="icon('cast')"></svg>
            投屏
          </button>
        </div>

        <div v-if="isActiveDisplay(index) && resolving" class="ms-center">
          <div></div>
          <span>解析中</span>
        </div>
        <button v-else-if="isActiveDisplay(index) && needsTap && !accessBlock" class="ms-play" :class="{ landscape: videoLandscape }" type="button" aria-label="播放" @click="playNow">
          <svg viewBox="0 0 24 24" v-html="icon('play')"></svg>
        </button>
        <button v-else-if="isActiveDisplay(index) && paused && !accessBlock" class="ms-play" :class="{ landscape: videoLandscape }" type="button" aria-label="播放" @click="playNow">
          <svg viewBox="0 0 24 24" v-html="icon('play')"></svg>
        </button>
        <div
          v-if="isActiveDisplay(index) && !accessBlock && (soundPrompt || (fullMode && videoReady && videoLandscape && !clearScreen))"
          class="ms-prompt-row"
          :class="{ landscape: fullMode && videoLandscape }"
        >
          <button
            v-if="soundPrompt"
            class="ms-prompt-btn"
            type="button"
            aria-label="打开声音"
            @click="openSound"
          >
            <svg viewBox="0 0 24 24" v-html="icon('volume')"></svg>
            <span>开启声音</span>
          </button>
          <button
            v-if="fullMode && videoReady && videoLandscape && !clearScreen"
            class="ms-prompt-btn"
            type="button"
            aria-label="全屏观看"
            @click="requestFullscreen"
          >
            <svg viewBox="0 0 24 24" v-html="icon('clean')"></svg>
            <span>全屏观看</span>
          </button>
        </div>

        <div v-if="isActiveDisplay(index) && accessBlock" class="ms-lock">
          <strong>{{ accessBlock.title }}</strong>
          <p>{{ accessBlock.desc }}</p>
          <button type="button" @click="handleAccessAction">{{ accessBlock.actionText }}</button>
        </div>

        <aside v-if="isActiveDisplay(index) && !accessBlock" class="ms-actions">
          <button type="button" :class="{ on: followed }" @click="toggleFollow(unit)">
            <svg viewBox="0 0 24 24" v-html="icon('heart')"></svg>
            <span>{{ followed ? '已追' : '追剧' }}</span>
          </button>
          <button type="button" @click="liked = !liked" :class="{ on: liked }">
            <svg viewBox="0 0 24 24" v-html="icon('thumbs')"></svg>
            <span>点赞</span>
          </button>
          <button type="button" @click="shareCurrent(unit)">
            <svg viewBox="0 0 24 24" v-html="icon('share')"></svg>
            <span>分享</span>
          </button>
        </aside>

        <div v-if="isActiveDisplay(index)" class="ms-meta" :class="{ full: fullMode }">
          <h1>{{ unit.vod.name }}</h1>
          <div class="ms-tags">
            <span>{{ unit.vod.typeName || config.defaultType }}</span>
            <span v-if="unit.vod.year">{{ unit.vod.year }}</span>
            <span v-if="unit.vod.remarks">{{ unit.vod.remarks }}</span>
          </div>
          <p>{{ unit.epName }} · {{ intro(unit) }}</p>
        </div>

        <div v-if="isActiveDisplay(index) && fullMode && playUrl && !accessBlock" class="ms-progress" :class="{ active: seeking }">
          <input
            type="range"
            min="0"
            max="1000"
            step="1"
            :value="seekValue"
            :style="{ '--progress': `${progressPercent}%` }"
            aria-label="播放进度"
            @pointerdown.stop.prevent="startSeek"
            @pointermove.stop.prevent="moveSeek"
            @pointerup.stop="commitSeek"
            @pointercancel.stop="cancelSeek"
            @touchstart.stop.prevent="startSeek"
            @touchmove.stop.prevent="moveSeek"
            @touchend.stop.prevent="commitSeek"
            @click.stop
          />
        </div>
      </article>
      <div v-if="loadingMore" class="ms-tail">加载更多</div>
    </section>

    <section v-else class="ms-state">
      <div v-if="loading" class="ms-center standalone">
        <div></div>
        <span>正在加载</span>
      </div>
      <template v-else-if="disabled">
        <strong>刷剧入口已关闭</strong>
        <button type="button" @click="router.push('/m')">返回首页</button>
      </template>
      <template v-else>
        <strong>暂无可刷内容</strong>
        <button type="button" @click="reload">重新加载</button>
      </template>
    </section>

    <div v-if="!fullMode && activeUnit && !clearScreen && !accessBlock" class="ms-roam-bottom">
      <div class="ms-roam-card">
        <input
          v-if="playUrl"
          type="range"
          min="0"
          max="1000"
          step="1"
          :value="seekValue"
          :style="{ '--progress': `${progressPercent}%` }"
          aria-label="播放进度"
          @pointerdown.stop.prevent="startSeek"
          @pointermove.stop.prevent="moveSeek"
          @pointerup.stop="commitSeek"
          @pointercancel.stop="cancelSeek"
          @touchstart.stop.prevent="startSeek"
          @touchmove.stop.prevent="moveSeek"
          @touchend.stop.prevent="commitSeek"
          @click.stop
        />
        <button type="button" class="ms-roam-open" @click="openFullContent(activeUnit)">
          <strong>观看完整{{ activeUnit.vod.typeName || config.defaultType }} · 全{{ activeUnit.total || 1 }}集 · 免费观看</strong>
          <svg class="ms-roam-arrow" viewBox="0 0 24 24" v-html="icon('chevron')"></svg>
        </button>
      </div>
    </div>

    <div v-if="fullMode && activeUnit && !clearScreen" class="ms-full-bottom">
      <button type="button" @click="openEpisodeDrawer">
        <span>选集 · 全{{ activeUnit.total || 1 }}集 · 免费观看</span>
        <svg viewBox="0 0 24 24" v-html="icon('chevron')"></svg>
      </button>
      <button type="button" aria-label="清屏观看" @click="toggleClearScreen">
        <svg viewBox="0 0 24 24" v-html="icon('clean')"></svg>
      </button>
    </div>
    <button v-if="fullMode && clearScreen" class="ms-clear-exit" type="button" aria-label="退出清屏" @click="toggleClearScreen">
      <svg viewBox="0 0 24 24" v-html="icon('close')"></svg>
    </button>

    <transition name="ms-fade">
      <div v-if="filterOpen" class="ms-filter-mask" @click="filterOpen = false"></div>
    </transition>
    <transition name="ms-bottom-sheet">
    <aside v-if="filterOpen" class="ms-filter">
      <div class="ms-drag"></div>
      <div class="ms-filter-head">
        <h2>刷剧筛选</h2>
        <button type="button" aria-label="关闭筛选" @click="filterOpen = false">
          <svg viewBox="0 0 24 24" v-html="icon('close')"></svg>
        </button>
      </div>
      <div v-if="selectedFilterTags.length" class="ms-filter-tags">
        <button v-for="tag in selectedFilterTags" :key="tag.key" type="button" @click="removeFilterTag(tag)">
          {{ tag.label }}
          <svg viewBox="0 0 24 24" v-html="icon('close')"></svg>
        </button>
      </div>
      <div class="ms-filter-group">
        <label>内容范围</label>
        <div>
          <button type="button" :class="{ on: !selectedTypes.length }" @click="clearTypes">全部</button>
          <button v-for="cat in categories" :key="cat.name" type="button" :class="{ on: selectedTypes.includes(cat.name) }" @click="toggleType(cat.name)">
            {{ cat.name }}
          </button>
        </div>
      </div>
      <div v-if="availableSubtypes.length" class="ms-filter-group">
        <label>细分类</label>
        <div>
          <button type="button" :class="{ on: !selectedSubtypeKeys.length }" @click="selectedSubtypeKeys = []">全部</button>
          <button v-for="sub in availableSubtypes.slice(0, 36)" :key="sub.key" type="button" :class="{ on: selectedSubtypeKeys.includes(sub.key) }" @click="toggleSubtype(sub)">
            {{ sub.name }}<small v-if="selectedTypes.length > 1">{{ sub.type }}</small>
          </button>
        </div>
      </div>
      <div class="ms-filter-group">
        <label>排序</label>
        <div>
          <button v-for="item in sorts" :key="item.value" type="button" :class="{ on: sortMode === item.value }" @click="sortMode = item.value">
            {{ item.label }}
          </button>
        </div>
      </div>
      <div class="ms-filter-actions">
        <button type="button" @click="resetFilter">重置</button>
        <button type="button" @click="applyFilter">重新刷剧</button>
      </div>
    </aside>
    </transition>

    <transition name="ms-fade">
      <div v-if="episodeDrawerOpen" class="ms-drawer-mask" @click="episodeDrawerOpen = false"></div>
    </transition>
    <transition name="ms-bottom-sheet">
    <aside v-if="episodeDrawerOpen && activeUnit" class="ms-episode-drawer">
      <div class="ms-drag"></div>
      <header class="ms-drawer-head">
        <img class="m-img-fade" :src="poster(activeUnit)" :alt="activeUnit.vod.name" @load="onImgLoad" @error="hideBrokenImg" />
        <div>
          <h2>{{ activeUnit.vod.name }}</h2>
          <p>{{ activeUnit.vod.remarks || `共${activeUnit.total || 1}集` }}</p>
          <span>{{ activeUnit.vod.typeName || config.defaultType }}<template v-if="activeUnit.vod.year"> · {{ activeUnit.vod.year }}</template></span>
        </div>
      </header>
      <nav class="ms-drawer-tabs">
        <button type="button" :class="{ on: drawerTab === 'intro' }" @click="drawerTab = 'intro'">简介</button>
        <button type="button" :class="{ on: drawerTab === 'episodes' }" @click="drawerTab = 'episodes'">选集</button>
        <button type="button" :class="{ on: drawerTab === 'related' }" @click="drawerTab = 'related'">相关</button>
      </nav>
      <section v-if="drawerTab === 'intro'" class="ms-drawer-body">
        <p class="ms-intro-text">{{ intro(activeUnit) }}</p>
        <div class="ms-tags light">
          <span>{{ activeUnit.vod.typeName || config.defaultType }}</span>
          <span v-if="activeUnit.vod.subType">{{ activeUnit.vod.subType }}</span>
          <span v-if="activeUnit.vod.year">{{ activeUnit.vod.year }}</span>
        </div>
      </section>
      <section v-else-if="drawerTab === 'episodes'" class="ms-drawer-body">
        <div v-if="episodeRanges.length > 1" class="ms-episode-ranges">
          <button v-for="range in episodeRanges" :key="range.start" type="button" :class="{ on: activeRange.start === range.start }" @click="activeRangeStart = range.start">
            {{ range.label }}
          </button>
        </div>
        <div class="ms-episode-grid">
          <button
            v-for="episode in visibleEpisodes"
            :key="episode.index"
            type="button"
            :class="{ on: episode.index === activeUnit.epIndex, resume: isHistoryEpisode(episode.index) }"
            @click="jumpEpisode(episode.index)"
          >
            <span>{{ episode.index + 1 }}</span>
            <em v-if="isHistoryEpisode(episode.index)">{{ episodeHistoryText }}</em>
            <i v-if="isHistoryEpisode(episode.index)" :style="{ width: episodeHistoryPercent }"></i>
          </button>
        </div>
      </section>
      <section v-else class="ms-drawer-body">
        <div v-if="relatedLoading" class="ms-related-state">加载中</div>
        <div v-else-if="!relatedItems.length" class="ms-related-state">暂无相关推荐</div>
        <div v-else class="ms-related-grid">
          <article v-for="vod in relatedItems" :key="vod.id" @click="openRelated(vod)">
            <img class="m-img-fade" :src="vodPoster(vod)" :alt="vod.name" @load="onImgLoad" @error="hideBrokenImg" />
            <strong>{{ vod.name }}</strong>
            <span>{{ vod.typeName || '影片' }}</span>
          </article>
        </div>
      </section>
      <button class="ms-drawer-follow" type="button" :class="{ on: followed }" @click="toggleFollow(activeUnit)">
        {{ followed ? '已追剧' : '追剧' }}
      </button>
    </aside>
    </transition>
  </main>
</template>

<script setup>
import Hls from 'hls.js'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { openAuthDialog } from '../authDialog'
import { apiErrorMessage, notifySuccess, notifyWarning } from '../feedback'
import { normalizeShortsConfig, readCachedSite, writeCachedSite } from '../siteConfig'
import { currentUser, refreshUser } from '../userStore'
import { icon } from './icons'

const SHORTS_MUTED_KEY = 'vcms.mobile.shorts.muted'
const SHORTS_SESSION_KEY = 'vcms.mobile.shorts.session.v1'
const SHORTS_FILTER_KEY = 'vcms.mobile.shorts.filter.v1'
const MOBILE_HISTORY_KEY = 'vcms.mobile.play.history.v1'
const SHORTS_SESSION_TTL = 30 * 60 * 1000
const RESOLVE_CACHE_TTL = 20 * 60 * 1000
const RESOLVE_CACHE_LIMIT = 80
const LANDSCAPE_OBJECT_Y = '36%'
const LANDSCAPE_CENTER_RATIO = 0.36
const LANDSCAPE_PROMPT_GAP = 18
const FULL_SCROLL_IDLE_MS = 90
const FULL_SCROLL_SNAP_TOLERANCE = 0.08
const FULL_RESIZE_SUPPRESS_MS = 420

function readMutedPreference() {
  try {
    const raw = localStorage.getItem(SHORTS_MUTED_KEY)
    return raw === null ? false : raw !== '0'
  } catch {
    return false
  }
}

function writeMutedPreference(value) {
  try {
    localStorage.setItem(SHORTS_MUTED_KEY, value ? '1' : '0')
  } catch {}
}

function createFeedSeed() {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1)
    window.crypto.getRandomValues(values)
    return values[0]
  }
  return Date.now()
}

const router = useRouter()
const route = useRoute()
const user = currentUser
const feedEl = ref(null)
const videoEl = ref(null)
const site = ref(readCachedSite())
const categories = ref([])
const shortOptions = ref({ types: [], subtypes: {} })
const units = ref([])
const activeIndex = ref(0)
const loading = ref(true)
const shortsVisible = ref(true)
const loadingMore = ref(false)
const filterOpen = ref(false)
const resolving = ref(false)
const playUrl = ref('')
const playingKey = ref('')
const needsTap = ref(false)
const paused = ref(false)
const muted = ref(readMutedPreference())
const soundPrompt = ref(false)
const videoContain = ref(true)
const videoLandscape = ref(false)
const landscapePlayY = ref('')
const landscapePromptY = ref('')
const videoReady = ref(false)
const accessBlock = ref(null)
const currentSec = ref(0)
const durationSec = ref(0)
const qualityLabel = ref('')
const seekValue = ref(0)
const seeking = ref(false)
const followed = ref(false)
const liked = ref(false)
const selectedTypes = ref([])
const selectedSubtypeKeys = ref([])
const sortMode = ref('smart')
const episodeDrawerOpen = ref(false)
const drawerTab = ref('intro')
const activeRangeStart = ref(0)
const toolMenuOpen = ref(false)
const clearScreen = ref(false)
const brightnessLevel = ref(1)
const clearGestureHud = ref('')
const clearGestureValue = ref('')
const relatedItems = ref([])
const relatedLoading = ref(false)
const vodHistoryState = ref({})

let hls = null
let playSeq = 0
let feedCursor = 0
let feedSeed = Date.now()
let hasMoreFeed = true
let scrollRaf = 0
let activeTimer = 0
let fullCommitTimer = 0
let pendingFullEpIndex = null
let fullScrollActive = false
let fullNextPrefetchKey = ''
let historySaveAt = 0
let playingUnit = null
let pendingUnmute = false
let resizeRaf = 0
let clearGestureHudTimer = 0
let fullResizeIgnoreUntil = 0
let resumeAfterActivate = false
let resumePlaybackAfterLogin = false
let routePlayRequestId = 0
let consumedRoutePlay = ''
const unitKeys = new Set()
const unitVodIds = new Set()
const resolveCache = new Map()
const resolveInflight = new Map()
const vodDetailCache = new Map()
const playbackLineFailures = new Map()
const clearGesture = {
  active: false,
  axis: '',
  side: '',
  startX: 0,
  startY: 0,
  startTime: 0,
  startVolume: 1,
  startBrightness: 1,
  nextTime: 0,
}
const jinpaiSelfHealTried = new Set()
const warmedManifests = new Set()
const preloadedPosters = new Set()

const config = computed(() => normalizeShortsConfig(site.value?.shortsConfig))
const disabled = computed(() => config.value.enabled === false)
const activeUnit = computed(() => units.value[activeIndex.value] || null)
const fullMode = computed(() => route.query.mode === 'full')
const displayUnits = computed(() => {
  if (!fullMode.value || !activeUnit.value) return units.value
  const current = activeUnit.value
  const list = []
  const prevIndex = Number(current.epIndex || 0) - 1
  if (prevIndex >= 0) list.push(seriesUnit(prevIndex))
  list.push(current)
  const nextIndex = Number(current.epIndex || 0) + 1
  if (nextIndex < (current.total || 1)) list.push(seriesUnit(nextIndex))
  return list.filter(Boolean)
})
const fullActiveDisplayIndex = computed(() => {
  if (!fullMode.value || !activeUnit.value) return activeIndex.value
  const currentEp = Number(activeUnit.value.epIndex || 0)
  const index = displayUnits.value.findIndex(unit => Number(unit?.epIndex || 0) === currentEp)
  return index >= 0 ? index : 0
})
const progressPercent = computed(() => {
  if (seeking.value) return Math.max(0, Math.min(100, (seekValue.value / 1000) * 100))
  return durationSec.value ? Math.max(0, Math.min(100, (currentSec.value / durationSec.value) * 100)) : 0
})
const brightnessMaskOpacity = computed(() => Math.max(0, Math.min(0.72, (1 - brightnessLevel.value) * 0.72)).toFixed(2))
const shortsVars = computed(() => ({
  '--ms-landscape-object-y': LANDSCAPE_OBJECT_Y,
  ...(landscapePlayY.value ? { '--ms-landscape-play-y': landscapePlayY.value } : {}),
  ...(landscapePromptY.value ? { '--ms-landscape-prompt-y': landscapePromptY.value } : {}),
}))
const episodeList = computed(() => {
  const episodes = Array.isArray(activeUnit.value?.channel?.episodes) ? activeUnit.value.channel.episodes : []
  const total = Math.max(1, Number(activeUnit.value?.total) || episodes.length || 1)
  return Array.from({ length: total }, (_, index) => ({
    index,
    name: episodes[index]?.name || `第${index + 1}集`,
  }))
})
const episodeRanges = computed(() => {
  const total = episodeList.value.length
  const size = 30
  const ranges = []
  for (let start = 0; start < total; start += size) {
    const end = Math.min(total, start + size)
    ranges.push({ start, end, label: `${start + 1}-${end}` })
  }
  return ranges.length ? ranges : [{ start: 0, end: 1, label: '1-1' }]
})
const activeRange = computed(() => episodeRanges.value.find(item => item.start === activeRangeStart.value) || episodeRanges.value[0])
const visibleEpisodes = computed(() => episodeList.value.slice(activeRange.value.start, activeRange.value.end))
const activeLineHistory = computed(() => {
  const unit = activeUnit.value
  const history = vodHistoryState.value?.[unit?.vod?.id]
  const histories = Array.isArray(history?.lineHistories) ? history.lineHistories : (history ? [history] : [])
  if (!unit?.channel?.id) return null
  return histories.find(item => Number(item?.lineId || 0) === Number(unit.channel.id)) || null
})
const episodeHistoryText = computed(() => {
  const h = activeLineHistory.value
  const progress = Number(h?.progressSec) || 0
  const total = Number(h?.durationSec) || 0
  if (!h || progress < 20) return ''
  if (total > 0) return `${Math.max(1, Math.min(99, Math.round((progress / total) * 100)))}%`
  return formatEpisodeTime(progress)
})
const episodeHistoryPercent = computed(() => {
  const h = activeLineHistory.value
  const progress = Number(h?.progressSec) || 0
  const total = Number(h?.durationSec) || 0
  return total > 0 ? `${Math.max(2, Math.min(100, (progress / total) * 100))}%` : '2px'
})
const availableSubtypes = computed(() => {
  const scopeTypes = selectedTypes.value.length
    ? selectedTypes.value
    : categories.value.map(cat => cat.name).filter(Boolean)
  const rows = []
  for (const type of scopeTypes) {
    const list = Array.isArray(shortOptions.value.subtypes?.[type]) ? shortOptions.value.subtypes[type] : []
    for (const sub of list) {
      const name = String(sub?.name || '').trim()
      if (!name) continue
      rows.push({ ...sub, type, name, key: `${type}::${name}` })
    }
  }
  return rows
})
const selectedFilterTags = computed(() => {
  const tags = selectedTypes.value.map(type => ({ key: `type:${type}`, type: 'type', value: type, label: type }))
  for (const key of selectedSubtypeKeys.value) {
    const item = parseSubtypeKey(key)
    if (item) tags.push({ key: `sub:${key}`, type: 'subtype', value: key, label: selectedTypes.value.length > 1 ? `${item.type} · ${item.name}` : item.name })
  }
  return tags
})
const sorts = [
  { value: 'smart', label: '智能推荐' },
  { value: 'hot', label: '热门优先' },
  { value: 'recent', label: '最新更新' },
  { value: 'rating', label: '高分优先' },
]

function isActiveDisplay(index) {
  return fullMode.value ? index === fullActiveDisplayIndex.value : index === activeIndex.value
}

function poster(unit) {
  return imgUrl(unit?.vod?.officialPic || unit?.vod?.pic || unit?.vod?.localPic || '')
}

function vodPoster(vod) {
  return imgUrl(vod?.officialPic || vod?.pic || vod?.localPic || vod?.heroImage || '')
}

function posterStyle(unit) {
  const url = poster(unit)
  return url ? { backgroundImage: `url(${url})` } : {}
}

function isDirectM3u8(url) {
  return /\.m3u8(\?|$)/i.test(String(url || ''))
}

function intro(unit) {
  return unit?.vod?.officialIntro || unit?.vod?.blurb || '精彩内容，继续上滑观看。'
}

function formatEpisodeTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  const mins = Math.floor(total / 60)
  const secs = String(total % 60).padStart(2, '0')
  return `${mins}:${secs}`
}

function readLocalHistory(vodId) {
  try {
    const raw = localStorage.getItem(MOBILE_HISTORY_KEY)
    const data = raw ? JSON.parse(raw) : {}
    const entry = data?.[vodId]
    return entry?.latest || entry || null
  } catch {
    return null
  }
}

function readLocalLineHistories(vodId) {
  try {
    const raw = localStorage.getItem(MOBILE_HISTORY_KEY)
    const data = raw ? JSON.parse(raw) : {}
    const entry = data?.[vodId]
    if (Array.isArray(entry?.lineHistories)) return entry.lineHistories
    return entry ? [entry] : []
  } catch {
    return []
  }
}

function writeLocalHistory(history) {
  if (!history?.vodId) return
  try {
    const raw = localStorage.getItem(MOBILE_HISTORY_KEY)
    const data = raw ? JSON.parse(raw) : {}
    const previous = data[history.vodId]
    const existingLines = Array.isArray(previous?.lineHistories) ? previous.lineHistories : (previous ? [previous] : [])
    const updated = { ...history, updatedAt: Date.now() }
    const lineHistories = [
      updated,
      ...existingLines.filter(item => Number(item?.lineId || 0) !== Number(updated.lineId || 0)),
    ].slice(0, 20)
    data[history.vodId] = { ...updated, latest: updated, lineHistories }
    const rows = Object.entries(data).sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0)).slice(0, 120)
    localStorage.setItem(MOBILE_HISTORY_KEY, JSON.stringify(Object.fromEntries(rows)))
  } catch {}
}

function isHistoryEpisode(index) {
  const h = activeLineHistory.value
  return Boolean(h && episodeHistoryText.value && Number(h.epIndex) === Number(index))
}

function updateVodHistory(unit, progressSec, durationSecValue) {
  if (!unit?.vod?.id || !unit?.channel?.id) return
  const previous = vodHistoryState.value?.[unit.vod.id]
  const existingLines = Array.isArray(previous?.lineHistories) ? previous.lineHistories : (previous ? [previous] : [])
  const current = {
    vodId: unit.vod.id,
    lineId: unit.channel.id,
    epIndex: unit.epIndex,
    epName: unit.epName || '',
    progressSec: Math.max(0, Math.floor(Number(progressSec) || 0)),
    durationSec: Math.max(0, Math.floor(Number(durationSecValue) || 0)),
  }
  const lineHistories = [
    current,
    ...existingLines.filter(item => Number(item?.lineId || 0) !== Number(current.lineId || 0)),
  ]
  vodHistoryState.value = {
    ...vodHistoryState.value,
    [unit.vod.id]: {
      ...current,
      latest: current,
      lineHistories,
    },
  }
  writeLocalHistory(current)
}

function applyShortsHistorySeek(video, unit) {
  const state = vodHistoryState.value?.[unit?.vod?.id]
  const histories = Array.isArray(state?.lineHistories) ? state.lineHistories : (state ? [state] : [])
  const h = histories.find(item => Number(item?.lineId || 0) === Number(unit?.channel?.id || 0))
  if (!video || !h) return
  if (Number(h.lineId) !== Number(unit?.channel?.id) || Number(h.epIndex) !== Number(unit?.epIndex)) return
  const seek = Number(h.progressSec) || 0
  if (seek < 20) return
  const total = Number(video.duration) || 0
  const target = total > 0 ? Math.min(Math.max(0, total - 8), seek) : seek
  try {
    video.currentTime = Math.max(0, target)
    currentSec.value = Math.max(0, Math.floor(target))
  } catch {}
}

function hideBrokenImg(event) {
  if (event?.target) event.target.style.visibility = 'hidden'
}

function onImgLoad(event) {
  event?.target?.classList?.add('is-loaded')
}

function buildUnit(item) {
  const vod = item?.vod || {}
  const play = item?.play || {}
  const episodes = Array.isArray(play.episodes) ? play.episodes : []
  const epIndex = Math.max(0, Number(play.epIndex) || 0)
  const ep = episodes[epIndex] || {}
  const channel = {
    id: Number(play.id) || 0,
    sourceName: play.sourceName || '',
    episodes,
    epCount: Number(play.epCount) || episodes.length || 1,
  }
  return {
    key: `${vod.id}:${channel.id}:${epIndex}`,
    vod,
    channel,
    epIndex,
    epName: play.epName || ep.name || `第${epIndex + 1}集`,
    total: channel.epCount,
  }
}

function clampIndex(value, total) {
  const max = Math.max(0, Number(total) - 1)
  const next = Math.floor(Number(value) || 0)
  return Math.max(0, Math.min(max, next))
}

function normalizeLineChannel(line, channel = line) {
  const episodes = Array.isArray(channel?.episodes) ? channel.episodes : Array.isArray(line?.episodes) ? line.episodes : []
  return {
    id: Number(channel?.id || line?.id) || 0,
    sourceId: Number(channel?.sourceId || line?.sourceId) || 0,
    sourceName: channel?.sourceName || line?.sourceName || '',
    priority: Number(channel?.priority ?? line?.priority ?? 100),
    flag: channel?.flag || line?.flag || '',
    epCount: Number(channel?.epCount || line?.epCount) || episodes.length,
    alive: channel?.alive !== false,
    score: Number(channel?.score ?? line?.score ?? 0),
    playKind: channel?.playKind || line?.playKind || '',
    episodes,
  }
}

function vodLineCandidates(vod) {
  const lines = Array.isArray(vod?.lines) ? vod.lines : []
  return lines.flatMap(line => {
    const channels = Array.isArray(line?.channels) && line.channels.length ? line.channels : [line]
    return channels.map(channel => normalizeLineChannel(line, channel))
  }).filter(channel => channel.id && channel.episodes.length)
}

function playableLineCandidates(vod, epIndex = 0) {
  const index = Math.max(0, Number(epIndex) || 0)
  return vodLineCandidates(vod).filter(channel => channel.alive !== false && channel.episodes[index])
}

function buildUnitFromChannel(vod, channel, options = {}) {
  if (!vod?.id || !channel?.id) return null
  const total = channel.epCount || channel.episodes?.length || 1
  const epIndex = clampIndex(options?.epIndex, total)
  const ep = channel.episodes?.[epIndex] || {}
  return buildUnit({
    vod,
    play: {
      id: channel.id,
      sourceName: channel.sourceName || '',
      epCount: channel.epCount || channel.episodes?.length || 1,
      alive: channel.alive !== false,
      score: Number(channel.score) || 0,
      playKind: channel.playKind || '',
      epIndex,
      epName: ep.name || `第${epIndex + 1}集`,
      episodes: channel.episodes || [],
    },
  })
}

function seriesUnit(index) {
  const unit = activeUnit.value
  if (!unit?.vod?.id || !unit.channel?.id) return null
  const total = Math.max(1, Number(unit.total) || unit.channel.episodes?.length || 1)
  const epIndex = Math.max(0, Math.min(total - 1, Number(index) || 0))
  const ep = unit.channel.episodes?.[epIndex] || {}
  return {
    ...unit,
    key: `${unit.vod.id}:${unit.channel.id}:${epIndex}`,
    epIndex,
    epName: ep.name || `第${epIndex + 1}集`,
  }
}

function scopeParams() {
  const selectedTypeNames = selectedTypes.value.filter(Boolean)
  const selectedSubs = selectedSubtypeKeys.value.filter(Boolean)
  if (selectedTypeNames.length || selectedSubs.length) {
    return {
      ...(selectedTypeNames.length ? { types: selectedTypeNames.join(',') } : {}),
      ...(selectedSubs.length ? { subKeys: selectedSubs.join('|') } : {}),
    }
  }
  const configTypes = Array.isArray(config.value.preferredTypes) ? config.value.preferredTypes.filter(Boolean) : []
  const configSubs = (Array.isArray(config.value.preferredSubtypes) ? config.value.preferredSubtypes : [])
    .filter(item => item?.type && item?.name && !configTypes.includes(item.type))
  if (configTypes.length || configSubs.length) {
    return {
      ...(configTypes.length ? { types: configTypes.join(',') } : {}),
      ...(configSubs.length ? { subKeys: configSubs.map(item => `${item.type}::${item.name}`).join('|') } : {}),
    }
  }
  return { type: config.value.defaultType }
}

function appendUnits(items) {
  const next = []
  for (const item of items || []) {
    const unit = buildUnit(item)
    if (!unit.vod?.id || !unit.channel?.id || unitKeys.has(unit.key) || unitVodIds.has(unit.vod.id)) continue
    unitKeys.add(unit.key)
    unitVodIds.add(unit.vod.id)
    next.push(unit)
  }
  if (next.length) units.value = [...units.value, ...next]
}

function insertPlaybackUnit(unit, index = activeIndex.value) {
  if (!unit?.vod?.id || !unit?.channel?.id) return false
  const target = Math.max(0, Math.min(Number(index) || 0, Math.max(0, units.value.length)))
  units.value = [
    ...units.value.filter(row => row?.vod?.id !== unit.vod.id),
  ]
  const nextIndex = Math.max(0, Math.min(target, units.value.length))
  units.value.splice(nextIndex, 0, unit)
  activeIndex.value = nextIndex
  rebuildUnitIndexes()
  return true
}

function rebuildUnitIndexes() {
  unitKeys.clear()
  unitVodIds.clear()
  for (const unit of units.value) {
    if (unit?.key) unitKeys.add(unit.key)
    if (unit?.vod?.id) unitVodIds.add(unit.vod.id)
  }
}

function sessionScopeKey() {
  return JSON.stringify({
    types: selectedTypes.value,
    subtypes: selectedSubtypeKeys.value,
    sort: sortMode.value || config.value.sortMode || 'smart',
    configTypes: Array.isArray(config.value.preferredTypes) ? config.value.preferredTypes : [],
    configSubs: Array.isArray(config.value.preferredSubtypes) ? config.value.preferredSubtypes : [],
  })
}

function readShortsSession() {
  try {
    const raw = localStorage.getItem(SHORTS_SESSION_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || Date.now() - Number(data.savedAt || 0) > SHORTS_SESSION_TTL) return null
    if (data.scopeKey !== sessionScopeKey()) return null
    if (!Array.isArray(data.units) || !data.units.length) return null
    return data
  } catch {
    return null
  }
}

function writeShortsSession() {
  if (!units.value.length) return
  try {
    localStorage.setItem(SHORTS_SESSION_KEY, JSON.stringify({
      savedAt: Date.now(),
      scopeKey: sessionScopeKey(),
      units: units.value.slice(0, 40),
      activeIndex: activeIndex.value,
      feedCursor,
      feedSeed,
      hasMoreFeed,
      selectedTypes: selectedTypes.value,
      selectedSubtypeKeys: selectedSubtypeKeys.value,
      sortMode: sortMode.value,
    }))
  } catch {}
}

function restoreShortsSession(data) {
  if (!data) return false
  units.value = data.units
  activeIndex.value = Math.max(0, Math.min(Number(data.activeIndex) || 0, units.value.length - 1))
  feedCursor = Math.max(0, Number(data.feedCursor) || 0)
  feedSeed = Math.max(1, Number(data.feedSeed) || createFeedSeed())
  hasMoreFeed = data.hasMoreFeed !== false
  rebuildUnitIndexes()
  return true
}

function readSavedFilter() {
  try {
    const raw = localStorage.getItem(SHORTS_FILTER_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return {
      selectedTypes: Array.isArray(data.selectedTypes) ? data.selectedTypes.map(String).filter(Boolean) : [],
      selectedSubtypeKeys: Array.isArray(data.selectedSubtypeKeys) ? data.selectedSubtypeKeys.map(String).filter(key => parseSubtypeKey(key)) : [],
      sortMode: sorts.some(item => item.value === data.sortMode) ? data.sortMode : '',
    }
  } catch {
    return null
  }
}

function normalizeSelectedFilter() {
  const allowedTypes = new Set(categories.value.map(item => item?.name).filter(Boolean))
  if (allowedTypes.size) selectedTypes.value = selectedTypes.value.filter(type => allowedTypes.has(type))
  const allowedSubtypes = new Set(availableSubtypes.value.map(item => item.key))
  if (allowedSubtypes.size) selectedSubtypeKeys.value = selectedSubtypeKeys.value.filter(key => allowedSubtypes.has(key))
}

function restoreSavedFilter() {
  const data = readSavedFilter()
  if (!data) return false
  selectedTypes.value = data.selectedTypes
  selectedSubtypeKeys.value = data.selectedSubtypeKeys
  sortMode.value = data.sortMode || config.value.sortMode
  normalizeSelectedFilter()
  return true
}

function writeSavedFilter() {
  try {
    localStorage.setItem(SHORTS_FILTER_KEY, JSON.stringify({
      selectedTypes: selectedTypes.value,
      selectedSubtypeKeys: selectedSubtypeKeys.value,
      sortMode: sortMode.value || config.value.sortMode,
    }))
  } catch {}
}

function preloadPoster(unit) {
  const url = poster(unit)
  if (!url || preloadedPosters.has(url)) return
  preloadedPosters.add(url)
  if (preloadedPosters.size > 80) {
    const first = preloadedPosters.values().next().value
    preloadedPosters.delete(first)
  }
  const img = new Image()
  img.decoding = 'async'
  img.src = url
}

function warmupManifest(url, kind) {
  if (!url || warmedManifests.has(url)) return
  if (kind !== 'm3u8' && !isDirectM3u8(url)) return
  warmedManifests.add(url)
  if (warmedManifests.size > 60) {
    const first = warmedManifests.values().next().value
    warmedManifests.delete(first)
  }
  try {
    fetch(url, { mode: 'cors', credentials: 'omit' }).catch(() => {})
  } catch {}
}

function prefetchUnitPlayback(unit) {
  if (!unit?.vod?.id || !unit?.channel?.id || accessBlock.value) return
  void resolveUnitPlayback(unit)
    .then((result) => {
      if (result?.ok && result.url) warmupManifest(result.url, result.kind || '')
    })
    .catch(() => {})
}

function prefetchFullNextPlayback() {
  if (!fullMode.value || accessBlock.value) return
  const unit = activeUnit.value
  const nextIndex = Number(unit?.epIndex || 0) + 1
  if (!unit || nextIndex >= (unit.total || 1)) return
  const next = seriesUnit(nextIndex)
  if (!next) return
  const key = resolveCacheKey(next)
  if (!key || key === fullNextPrefetchKey) return
  fullNextPrefetchKey = key
  prefetchUnitPlayback(next)
}

function ensureMoreAhead() {
  if (fullMode.value) return
  if (units.value.length - activeIndex.value <= 4) void loadMore()
  const prev = units.value[activeIndex.value - 1]
  const current = activeUnit.value
  const next = units.value[activeIndex.value + 1]
  preloadPoster(prev)
  preloadPoster(current)
  preloadPoster(next)
  prefetchUnitPlayback(next)
  if (current?.vod?.id) void refreshFollowState()
}

async function loadMore(limit = config.value.feedLimit || 10) {
  if (loadingMore.value || !hasMoreFeed || disabled.value) return
  loadingMore.value = true
  try {
    const result = await api.shortFeed({
      cursor: feedCursor,
      limit,
      seed: feedSeed,
      sort: sortMode.value || config.value.sortMode,
      exclude: [...unitVodIds].slice(-300).join(','),
      ...scopeParams(),
    })
    if (result?.disabled) {
      hasMoreFeed = false
      return
    }
    appendUnits(result?.list || [])
    const nextCursor = Number(result?.nextCursor)
    feedCursor = Number.isFinite(nextCursor) ? nextCursor : feedCursor + (result?.list?.length || 0)
    hasMoreFeed = Boolean(result?.hasMore)
  } catch (error) {
    notifyWarning(apiErrorMessage(error, '刷剧加载失败'))
    hasMoreFeed = false
  } finally {
    loadingMore.value = false
  }
}

async function reload(options = {}) {
  const force = Boolean(options?.force)
  cancelPendingPlayback({ stop: true })
  clearFullCommitTimer()
  loading.value = true
  accessBlock.value = null
  units.value = []
  activeIndex.value = 0
  feedCursor = 0
  feedSeed = createFeedSeed()
  hasMoreFeed = true
  unitKeys.clear()
  unitVodIds.clear()
  try {
    if (!force && restoreShortsSession(readShortsSession())) {
      loading.value = false
    } else {
      await loadMore(config.value.feedLimit || 10)
    }
  } finally {
    loading.value = false
  }
  await nextTick()
  feedEl.value?.scrollTo({ top: activeIndex.value * Math.max(1, feedEl.value?.clientHeight || 1), behavior: 'auto' })
  ensureMoreAhead()
  writeShortsSession()
  schedulePlay(160)
}

function stopVideo() {
  if (hls) {
    hls.destroy()
    hls = null
  }
  const video = getVideo()
  if (video) {
    try { video.pause() } catch {}
    video.removeAttribute('src')
    try { video.load() } catch {}
  }
  playUrl.value = ''
  playingKey.value = ''
  qualityLabel.value = ''
  needsTap.value = false
  paused.value = false
  soundPrompt.value = false
  videoContain.value = true
  videoLandscape.value = false
  landscapePlayY.value = ''
  landscapePromptY.value = ''
  videoReady.value = false
  currentSec.value = 0
  durationSec.value = 0
  seekValue.value = 0
  seeking.value = false
  brightnessLevel.value = 1
  resetClearGesture({ hideHud: true })
}

function getVideo() {
  return Array.isArray(videoEl.value) ? videoEl.value[0] : videoEl.value
}

function cancelPendingPlayback(options = {}) {
  if (activeTimer) {
    window.clearTimeout(activeTimer)
    activeTimer = 0
  }
  playSeq += 1
  resolving.value = false
  if (options.stop) stopVideo()
}

function clearFullCommitTimer() {
  if (fullCommitTimer) {
    window.clearTimeout(fullCommitTimer)
    fullCommitTimer = 0
  }
  pendingFullEpIndex = null
}

function targetSlotForEpisode(epIndex) {
  return displayUnits.value.findIndex(unit => Number(unit?.epIndex || 0) === Number(epIndex))
}

function fullScrollSlotDelta(slot) {
  const el = feedEl.value
  if (!el || slot < 0) return Infinity
  const raw = el.scrollTop / Math.max(1, el.clientHeight)
  return Math.abs(raw - slot)
}

function commitPendingFullEpisode() {
  if (fullCommitTimer) {
    window.clearTimeout(fullCommitTimer)
    fullCommitTimer = 0
  }
  const current = activeUnit.value
  const target = pendingFullEpIndex
  if (!fullMode.value || !current?.vod?.id || !current.channel?.id || target === null) {
    pendingFullEpIndex = null
    return
  }
  const targetSlot = targetSlotForEpisode(target)
  if (targetSlot < 0 || fullScrollSlotDelta(targetSlot) > FULL_SCROLL_SNAP_TOLERANCE) {
    armFullScrollCommit()
    return
  }
  pendingFullEpIndex = null
  if (target === Number(current.epIndex || 0)) return
  jumpEpisode(target, { fromScroll: true })
}

function armFullScrollCommit() {
  if (fullCommitTimer) window.clearTimeout(fullCommitTimer)
  if (pendingFullEpIndex === null || !fullMode.value || fullScrollActive) {
    fullCommitTimer = 0
    return
  }
  fullCommitTimer = window.setTimeout(commitPendingFullEpisode, FULL_SCROLL_IDLE_MS)
}

function schedulePlay(delay = 0) {
  cancelPendingPlayback()
  const ms = Math.max(0, Number(delay) || 0)
  if (!ms) {
    void playActive()
    return
  }
  activeTimer = window.setTimeout(() => {
    activeTimer = 0
    void playActive()
  }, ms)
}

function resolveCacheKey(unit) {
  const viewerId = user.value?.id || user.value?.mid || 0
  return `${viewerId || 'guest'}:${unit?.vod?.id || 0}:${unit?.channel?.id || 0}:${unit?.epIndex || 0}`
}

function pruneResolveCache() {
  while (resolveCache.size > RESOLVE_CACHE_LIMIT) {
    const first = resolveCache.keys().next().value
    if (!first) break
    resolveCache.delete(first)
  }
}

async function resolveUnitPlayback(unit, options = {}) {
  const fresh = Boolean(options?.fresh)
  const key = resolveCacheKey(unit)
  const now = Date.now()
  if (!fresh) {
    const hit = resolveCache.get(key)
    if (hit && now - hit.at < RESOLVE_CACHE_TTL) {
      resolveCache.delete(key)
      resolveCache.set(key, hit)
      return hit.result
    }
    if (hit) resolveCache.delete(key)
    if (resolveInflight.has(key)) return resolveInflight.get(key)
  }
  const promise = api.resolvePlay({
    vodId: unit.vod.id,
    playId: unit.channel.id,
    epIndex: unit.epIndex,
    context: 'shorts',
    ...(fresh ? { fresh: 1 } : {}),
  }).then((result) => {
    if (!fresh && result?.ok && result.url) {
      resolveCache.delete(key)
      resolveCache.set(key, { at: Date.now(), result })
      pruneResolveCache()
    }
    return result
  }).finally(() => {
    if (!fresh && resolveInflight.get(key) === promise) resolveInflight.delete(key)
  })
  if (!fresh) resolveInflight.set(key, promise)
  return promise
}

async function loadVodPlaybackDetail(vodId) {
  const id = Number(vodId) || 0
  if (!id) return null
  const cached = vodDetailCache.get(id)
  if (cached) return cached
  const detail = await api.vod(id)
  vodDetailCache.set(id, detail)
  if (vodDetailCache.size > 24) {
    const first = vodDetailCache.keys().next().value
    if (first) vodDetailCache.delete(first)
  }
  return detail
}

function playbackFailureKey(unit) {
  return `${unit?.vod?.id || 0}:${unit?.epIndex || 0}`
}

function failedLinesForUnit(unit) {
  const key = playbackFailureKey(unit)
  let failed = playbackLineFailures.get(key)
  if (!failed) {
    failed = new Set()
    playbackLineFailures.set(key, failed)
  }
  return failed
}

function rememberLineFailure(unit) {
  if (!unit?.channel?.id) return
  failedLinesForUnit(unit).add(Number(unit.channel.id))
  while (playbackLineFailures.size > 32) {
    const first = playbackLineFailures.keys().next().value
    if (!first) break
    playbackLineFailures.delete(first)
  }
}

function clearLineFailures(unit) {
  const key = playbackFailureKey(unit)
  if (key) playbackLineFailures.delete(key)
}

function clearJinpaiSelfHeal(unit) {
  const key = resolveCacheKey(unit)
  if (key) jinpaiSelfHealTried.delete(key)
}

function reportShortsPlaybackError(unit, message, failures = []) {
  if (!unit?.vod?.id) return
  void api.reportPlaybackError({
    vodId: unit.vod.id,
    vodName: unit.vod.name || '',
    playId: unit.channel?.id || null,
    lineName: unit.channel?.sourceName || unit.channel?.name || '',
    sourceName: unit.channel?.sourceName || '',
    epIndex: unit.epIndex,
    epName: unit.epName || '',
    url: unit.lastResolve?.url || '',
    rule: unit.lastResolve?.rule || '',
    proxyMode: unit.lastResolve?.proxyMode || '',
    cleanId: unit.lastResolve?.cleanId || null,
    fallbackUrl: unit.lastResolve?.fallbackUrl || '',
    page: location.href,
    message,
    detail: { context: 'shorts', failures, current: unit.lastResolve || {} },
  })
}

function applyShortsLineSwitch(unit) {
  if (!unit?.vod?.id || !unit?.channel?.id) return false
  const index = activeIndex.value
  if (units.value[index]?.vod?.id === unit.vod.id) {
    units.value.splice(index, 1, unit)
    return true
  }
  return false
}

async function tryNextShortsLine(unit, triedLineIds = new Set()) {
  if (!unit?.vod?.id) return null
  const detail = await loadVodPlaybackDetail(unit.vod.id)
  const failedLineIds = failedLinesForUnit(unit)
  const candidates = playableLineCandidates(detail, unit.epIndex)
  const next = candidates.find(channel => !triedLineIds.has(Number(channel.id)) && !failedLineIds.has(Number(channel.id)))
  if (!next) return null
  const nextUnit = buildUnitFromChannel(detail, next, { epIndex: unit.epIndex })
  if (!nextUnit) return null
  return nextUnit
}

async function recoverShortsPlaybackLine(reason = '当前线路播放失败') {
  const unit = activeUnit.value || playingUnit
  if (!unit?.vod?.id || !unit?.channel?.id) return false
  if (unit.lastResolve?.rule === 'jinpai_client') {
    const key = resolveCacheKey(unit)
    if (!jinpaiSelfHealTried.has(key)) {
      jinpaiSelfHealTried.add(key)
      try {
        const result = await resolveUnitPlayback(unit, { fresh: true })
        if (result?.ok && result.url && activeUnit.value?.key === unit.key) {
          unit.lastResolve = result
          const seq = ++playSeq
          playingUnit = unit
          notifyWarning('播放异常，正在重新签名')
          await attachVideo(result.url, result.kind || '', seq, unit)
          return true
        }
      } catch {}
    }
  }
  rememberLineFailure(unit)
  const tried = new Set([Number(unit.channel.id)])
  try {
    const nextUnit = await tryNextShortsLine(unit, tried)
    if (!nextUnit) {
      reportShortsPlaybackError(unit, reason, [{ lineName: unit.channel?.sourceName || unit.channel?.name || '', epName: unit.epName || '', message: reason }])
      notifyWarning(reason)
      stopVideo()
      return false
    }
    const result = await resolveUnitPlayback(nextUnit, { fresh: true })
    if (!result?.ok || !result.url) {
      rememberLineFailure(nextUnit)
      reportShortsPlaybackError(unit, result?.error || reason, [
        { lineName: unit.channel?.sourceName || unit.channel?.name || '', epName: unit.epName || '', message: reason },
        { lineName: nextUnit.channel?.sourceName || nextUnit.channel?.name || '', epName: nextUnit.epName || '', message: result?.error || '解析失败' },
      ])
      notifyWarning(reason)
      stopVideo()
      return false
    }
    applyShortsLineSwitch(nextUnit)
    notifyWarning(`当前线路不可用，已切换到 ${nextUnit.channel.sourceName || '备用线路'}`)
    schedulePlay(0)
    return true
  } catch {
    notifyWarning(reason)
    stopVideo()
    return false
  }
}

async function playActive() {
  let unit = activeUnit.value
  const seq = ++playSeq
  stopVideo()
  accessBlock.value = null
  playingUnit = unit
  if (!unit?.vod?.id || !unit?.channel?.id) return
  resolving.value = true
  const triedLineIds = new Set()
  try {
    while (unit?.vod?.id && unit?.channel?.id) {
      triedLineIds.add(Number(unit.channel.id))
      const result = await resolveUnitPlayback(unit, { fresh: triedLineIds.size > 1 })
      if (seq !== playSeq) return
      if (['login_required', 'vip_required', 'level_required', 'vip_or_level_required'].includes(result?.code)) {
        showAccessBlock(result)
        return
      }
      if (result?.ok && result.url) {
        unit.lastResolve = result
        clearJinpaiSelfHeal(unit)
        if (activeUnit.value?.key !== unit.key) {
          applyShortsLineSwitch(unit)
          notifyWarning(`当前线路不可用，已切换到 ${unit.channel.sourceName || '备用线路'}`)
          await nextTick()
        }
        await attachVideo(result.url, result.kind || '', seq, unit)
        if (seq !== playSeq) return
        return
      }
      const nextUnit = await tryNextShortsLine(unit, triedLineIds)
      if (seq !== playSeq) return
      if (!nextUnit) {
        reportShortsPlaybackError(unit, result?.error || '当前无可播放线路，请稍后重试', [{ lineName: unit.channel?.sourceName || unit.channel?.name || '', epName: unit.epName || '', message: result?.error || '解析失败' }])
        notifyWarning(result?.error || '当前集暂时无法播放')
        return
      }
      unit = nextUnit
      playingUnit = unit
    }
  } catch (error) {
    if (seq === playSeq) notifyWarning(apiErrorMessage(error, '播放解析失败'))
  } finally {
    if (seq === playSeq) resolving.value = false
  }
}

async function attachVideo(url, kind, seq = playSeq, unit = activeUnit.value) {
  const attachedUnit = unit || activeUnit.value
  if (seq !== playSeq || !attachedUnit?.key || activeUnit.value?.key !== attachedUnit.key) return
  playingKey.value = attachedUnit.key
  playUrl.value = url
  videoReady.value = false
  qualityLabel.value = ''
  await nextTick()
  if (seq !== playSeq || activeUnit.value?.key !== attachedUnit.key) return
  const video = getVideo()
  if (!video) return
  video.muted = muted.value
  video.autoplay = true
  video.playsInline = true
  video.addEventListener('loadedmetadata', () => applyShortsHistorySeek(video, attachedUnit), { once: true })
  if (hls) hls.destroy()
  hls = null
  if ((kind === 'm3u8' || /\.m3u8(\?|$)/i.test(url)) && Hls.isSupported()) {
    hls = new Hls({ maxBufferLength: 60, maxMaxBufferLength: 60, backBufferLength: 8 })
    const currentHls = hls
    hls.loadSource(url)
    hls.attachMedia(video)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (seq !== playSeq || hls !== currentHls || activeUnit.value?.key !== attachedUnit.key) return
      updateHlsQualityLabel()
      clearLineFailures(attachedUnit)
      playNow()
    })
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data?.fatal && hls === currentHls && seq === playSeq && activeUnit.value?.key === attachedUnit.key) {
        void recoverShortsPlaybackLine('当前线路播放失败，已暂停')
      }
    })
  } else {
    if (seq !== playSeq || activeUnit.value?.key !== attachedUnit.key) return
    video.src = url
    clearLineFailures(attachedUnit)
    playNow()
  }
}

async function playNow(options = {}) {
  const video = getVideo()
  if (!video) return
  const desiredMuted = muted.value
  video.muted = desiredMuted
  try {
    await video.play()
    if (!desiredMuted) pendingUnmute = false
    soundPrompt.value = false
    needsTap.value = false
    paused.value = false
    return true
  } catch {
    if (options.mutedFallback !== false && !desiredMuted) {
      try {
        video.muted = true
        await video.play()
        pendingUnmute = true
        soundPrompt.value = true
        needsTap.value = false
        paused.value = false
        return true
      } catch {
        video.muted = desiredMuted
      }
    }
  }
  needsTap.value = true
  paused.value = true
  return false
}

function togglePlay() {
  const video = getVideo()
  if (!video || accessBlock.value || resolving.value) return
  if (pendingUnmute) {
    pendingUnmute = false
    if (!muted.value) video.muted = false
  }
  if (video.paused) playNow()
  else {
    video.pause()
    paused.value = true
  }
}

async function openSound() {
  const video = getVideo()
  muted.value = false
  writeMutedPreference(false)
  soundPrompt.value = false
  pendingUnmute = false
  if (!video) return
  video.muted = false
  try {
    await video.play()
    needsTap.value = false
    paused.value = false
  } catch {
    soundPrompt.value = true
    notifyWarning('浏览器限制了自动开声，请再轻触一次')
  }
}

function toggleMute() {
  muted.value = !muted.value
  writeMutedPreference(muted.value)
  soundPrompt.value = false
  pendingUnmute = false
  const video = getVideo()
  if (video) video.muted = muted.value
}

function updateVideoFit(video) {
  const width = Number(video?.videoWidth || 0)
  const height = Number(video?.videoHeight || 0)
  const knownSize = width > 0 && height > 0
  const landscape = knownSize && width > height * 1.15
  videoLandscape.value = landscape
  videoContain.value = !knownSize || landscape
  updateLandscapeMetrics(video)
}
function updateNativeQualityLabel(video = getVideo()) {
  const height = Math.floor(Number(video?.videoHeight) || 0)
  if (height > 0) qualityLabel.value = `${height}P`
}
function updateHlsQualityLabel() {
  const heights = (hls?.levels || []).map(level => Number(level?.height) || 0).filter(Boolean)
  if (heights.length) qualityLabel.value = `${Math.max(...heights)}P`
}

function updateLandscapeMetrics(video = getVideo()) {
  const width = Number(video?.videoWidth || 0)
  const height = Number(video?.videoHeight || 0)
  const rect = video?.getBoundingClientRect?.()
  if (!videoLandscape.value || !width || !height || !rect?.width || !rect?.height) {
    landscapePlayY.value = ''
    landscapePromptY.value = ''
    return
  }
  const renderedHeight = Math.min(rect.height, rect.width * (height / width))
  const freeY = Math.max(0, rect.height - renderedHeight)
  const frameTop = freeY * LANDSCAPE_CENTER_RATIO
  const centerY = frameTop + renderedHeight / 2
  landscapePlayY.value = `${Math.round(centerY)}px`
  landscapePromptY.value = `${Math.round(frameTop + renderedHeight + LANDSCAPE_PROMPT_GAP)}px`
}

function scheduleLandscapeMetrics() {
  if (resizeRaf) cancelAnimationFrame(resizeRaf)
  if (fullMode.value) {
    fullResizeIgnoreUntil = Date.now() + FULL_RESIZE_SUPPRESS_MS
    clearFullCommitTimer()
  }
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0
    updateLandscapeMetrics()
    if (fullMode.value) scrollToFullCurrent('auto')
  })
}

function onVideoMeta(event) {
  updateNativeQualityLabel(event?.target)
  updateVideoFit(event?.target)
  durationSec.value = Math.floor(Number(event?.target?.duration) || 0)
}

function onVideoCanPlay(event) {
  updateVideoFit(event?.target)
}

function onTimeUpdate() {
  const video = getVideo()
  currentSec.value = Math.floor(Number(video?.currentTime) || 0)
  durationSec.value = Math.floor(Number(video?.duration) || 0)
  if (!seeking.value) seekValue.value = durationSec.value ? Math.round((currentSec.value / durationSec.value) * 1000) : 0
  saveHistoryTick()
}

function onPlaying() {
  videoReady.value = true
  paused.value = false
  needsTap.value = false
  prefetchFullNextPlayback()
}

function onPause(event) {
  if (!event?.target?.ended && !resolving.value) paused.value = true
}

function onVideoError() {
  void recoverShortsPlaybackLine('当前集播放失败')
  paused.value = true
  videoLandscape.value = false
  videoReady.value = false
}

function seekValueFromPointer(event) {
  const target = event?.currentTarget || event?.target
  const rect = target?.getBoundingClientRect?.()
  const point = event.touches?.[0] || event.changedTouches?.[0] || event
  if (!rect || !rect.width || point?.clientX === undefined) return null
  return Math.max(0, Math.min(1000, Math.round(((point.clientX - rect.left) / rect.width) * 1000)))
}

function startSeek(event) {
  if (!durationSec.value) return
  seeking.value = true
  const next = seekValueFromPointer(event)
  if (next !== null) seekValue.value = next
}

function moveSeek(event) {
  if (!durationSec.value || !seeking.value) return
  const next = seekValueFromPointer(event)
  if (next !== null) seekValue.value = next
}

function commitSeek(event) {
  if (!durationSec.value) {
    seeking.value = false
    return
  }
  const pointerValue = seekValueFromPointer(event)
  const next = pointerValue ?? Math.max(0, Math.min(1000, Number(event?.target?.value ?? seekValue.value) || 0))
  seekValue.value = next
  seeking.value = false
  const video = getVideo()
  if (!video) return
  const nextTime = Math.max(0, Math.min(durationSec.value, Math.round((next / 1000) * durationSec.value)))
  try {
    video.currentTime = nextTime
    currentSec.value = nextTime
    saveHistory(true)
  } catch {}
}

function cancelSeek() {
  seeking.value = false
  seekValue.value = durationSec.value ? Math.round((currentSec.value / durationSec.value) * 1000) : 0
}

function resetClearGesture(options = {}) {
  clearGesture.active = false
  clearGesture.axis = ''
  clearGesture.side = ''
  clearGesture.nextTime = 0
  seeking.value = false
  if (options.hideHud) {
    clearGestureHud.value = ''
    clearGestureValue.value = ''
  }
}

function showClearGestureHud(label, value) {
  clearGestureHud.value = label
  clearGestureValue.value = value
  if (clearGestureHudTimer) window.clearTimeout(clearGestureHudTimer)
  clearGestureHudTimer = window.setTimeout(() => {
    clearGestureHudTimer = 0
    clearGestureHud.value = ''
    clearGestureValue.value = ''
  }, 720)
}

function canUseClearGesture(index) {
  return fullMode.value && clearScreen.value && videoLandscape.value && isActiveDisplay(index) && !accessBlock.value && !!getVideo()
}

function clearGesturePoint(event) {
  return event?.touches?.[0] || event?.changedTouches?.[0] || null
}

function onClearGestureStart(event, index) {
  if (!canUseClearGesture(index)) return
  const point = clearGesturePoint(event)
  const video = getVideo()
  if (!point || !video) return
  clearGesture.active = true
  clearGesture.axis = ''
  clearGesture.side = point.clientX < window.innerWidth / 2 ? 'brightness' : 'volume'
  clearGesture.startX = point.clientX
  clearGesture.startY = point.clientY
  clearGesture.startTime = Number(video.currentTime) || currentSec.value || 0
  clearGesture.startVolume = Number.isFinite(video.volume) ? video.volume : (muted.value ? 0 : 1)
  clearGesture.startBrightness = brightnessLevel.value
  clearGesture.nextTime = clearGesture.startTime
}

function onClearGestureMove(event, index) {
  if (!clearGesture.active || !canUseClearGesture(index)) return
  const point = clearGesturePoint(event)
  const video = getVideo()
  if (!point || !video) return
  const dx = point.clientX - clearGesture.startX
  const dy = point.clientY - clearGesture.startY
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (!clearGesture.axis) {
    if (Math.max(absX, absY) < 10) return
    clearGesture.axis = absX >= absY ? 'seek' : 'vertical'
  }

  if (clearGesture.axis === 'seek') {
    if (!durationSec.value) return
    seeking.value = true
    const seekSpan = Math.max(durationSec.value, 90)
    const nextTime = Math.max(0, Math.min(durationSec.value, Math.round(clearGesture.startTime + (dx / Math.max(window.innerWidth, 1)) * seekSpan)))
    clearGesture.nextTime = nextTime
    currentSec.value = nextTime
    seekValue.value = Math.round((nextTime / durationSec.value) * 1000)
    showClearGestureHud('进度', `${formatEpisodeTime(nextTime)} / ${formatEpisodeTime(durationSec.value)}`)
    return
  }

  const delta = -dy / Math.max(window.innerHeight, 1)
  if (clearGesture.side === 'brightness') {
    const nextBrightness = Math.max(0.2, Math.min(1, clearGesture.startBrightness + delta))
    brightnessLevel.value = nextBrightness
    showClearGestureHud('亮度', `${Math.round(nextBrightness * 100)}%`)
    return
  }

  const nextVolume = Math.max(0, Math.min(1, clearGesture.startVolume + delta))
  video.volume = nextVolume
  muted.value = nextVolume <= 0.01
  video.muted = muted.value
  if (!muted.value) {
    soundPrompt.value = false
    pendingUnmute = false
  }
  writeMutedPreference(muted.value)
  showClearGestureHud('音量', `${Math.round(nextVolume * 100)}%`)
}

function onClearGestureEnd(event, index) {
  if (!clearGesture.active) return
  const video = getVideo()
  if (clearGesture.axis === 'seek' && canUseClearGesture(index) && video && durationSec.value) {
    try {
      const nextTime = Math.max(0, Math.min(durationSec.value, clearGesture.nextTime || currentSec.value || 0))
      video.currentTime = nextTime
      currentSec.value = nextTime
      seekValue.value = Math.round((nextTime / durationSec.value) * 1000)
      saveHistory(true)
    } catch {}
  } else if (!clearGesture.axis) {
    togglePlay()
  }
  resetClearGesture()
}

function nextItem() {
  saveHistory(true)
  if (fullMode.value) {
    const unit = activeUnit.value
    const next = Number(unit?.epIndex || 0) + 1
    if (unit && next < (unit.total || 1)) {
      jumpEpisode(next)
    } else {
      paused.value = true
    }
    return
  }
  if (activeIndex.value < units.value.length - 1) scrollTo(activeIndex.value + 1)
  else loadMore().then(() => scrollTo(activeIndex.value + 1))
}

function scrollTo(index, behavior = 'smooth') {
  feedEl.value?.scrollTo({ top: index * feedEl.value.clientHeight, behavior })
}

function scrollToFullCurrent(behavior = 'auto') {
  const el = feedEl.value
  if (!el) return
  el.scrollTo({ top: fullActiveDisplayIndex.value * el.clientHeight, behavior })
}

function onScroll() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    if (fullMode.value) {
      if (Date.now() < fullResizeIgnoreUntil) return
      const el = feedEl.value
      if (!el || !activeUnit.value) return
      const raw = el.scrollTop / Math.max(1, el.clientHeight)
      const currentSlot = fullActiveDisplayIndex.value
      if (raw > currentSlot + 0.55) {
        scheduleFullEpisodeCommit((activeUnit.value.epIndex || 0) + 1)
      } else if (raw < currentSlot - 0.55) {
        scheduleFullEpisodeCommit((activeUnit.value.epIndex || 0) - 1)
      } else if (pendingFullEpIndex !== null && Math.abs(raw - currentSlot) < 0.35) {
        clearFullCommitTimer()
        if (!paused.value) schedulePlay(0)
      }
      return
    }
    const el = feedEl.value
    if (!el) return
    const next = Math.max(0, Math.min(units.value.length - 1, Math.round(el.scrollTop / Math.max(1, el.clientHeight))))
    if (next !== activeIndex.value) activeIndex.value = next
    if (units.value.length - next <= 4) void loadMore()
  })
}

function onScrollEnd() {
  if (!fullMode.value || pendingFullEpIndex === null) return
  fullScrollActive = false
  commitPendingFullEpisode()
}

function onFullScrollStart() {
  if (fullMode.value) fullScrollActive = true
}

function onFullScrollRelease() {
  if (!fullMode.value) return
  fullScrollActive = false
  armFullScrollCommit()
}

function scheduleFullEpisodeCommit(index) {
  const unit = activeUnit.value
  if (!fullMode.value || !unit?.vod?.id || !unit.channel?.id) return
  if (Date.now() < fullResizeIgnoreUntil) return
  const total = Math.max(1, Number(unit.total) || 1)
  const epIndex = Math.max(0, Math.min(total - 1, Number(index) || 0))
  if (epIndex === Number(unit.epIndex || 0)) return
  if (pendingFullEpIndex === epIndex) {
    armFullScrollCommit()
    return
  }
  clearFullCommitTimer()
  pendingFullEpIndex = epIndex
  cancelPendingPlayback({ stop: true })
  saveHistory(true)
  armFullScrollCommit()
}

function showAccessBlock(result) {
  stopVideo()
  const login = result?.code === 'login_required'
  accessBlock.value = {
    title: login ? '登录后继续观看' : (result?.error || '当前账号权限不足'),
    desc: login ? '游客暂不可观看此内容，登录后会回到当前刷剧页。' : '请切换符合权限的账号后再观看。',
    actionText: login ? '登录观看' : '查看会员',
    code: result?.code,
  }
}

function handleAccessAction() {
  if (accessBlock.value?.code === 'login_required') {
    resumePlaybackAfterLogin = true
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: accessBlock.value.title })
    return
  }
  notifyWarning('当前账号权限不足')
}

async function toggleFollow(unit) {
  if (!unit?.vod?.id) return
  if (!user.value) {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后可追剧' })
    return
  }
  try {
    const result = followed.value ? await api.unfollowVod(unit.vod.id) : await api.followVod(unit.vod.id)
    followed.value = Boolean(result.followed)
    notifySuccess(result.followed ? '已加入追剧' : '已取消追剧')
  } catch (error) {
    notifyWarning(apiErrorMessage(error, '操作失败'))
  }
}

function shareCurrent(unit) {
  const url = `${location.origin}${location.pathname}#/m/shorts`
  if (navigator.share) navigator.share({ title: unit?.vod?.name || '刷剧', url }).catch(() => {})
  else {
    navigator.clipboard?.writeText(url).then(() => notifySuccess('链接已复制')).catch(() => notifyWarning('当前浏览器不支持分享'))
  }
}

function openFullContent(unit) {
  if (!unit?.vod?.id) return
  clearFullCommitTimer()
  saveHistory(true)
  episodeDrawerOpen.value = false
  toolMenuOpen.value = false
  clearScreen.value = false
  brightnessLevel.value = 1
  resetClearGesture({ hideHud: true })
  router.replace({ path: '/m/shorts', query: { ...route.query, mode: 'full' } })
  activeRangeStart.value = Math.floor((Number(unit.epIndex) || 0) / 30) * 30
  nextTick(() => scrollToFullCurrent('auto'))
}

function exitFullContent() {
  clearFullCommitTimer()
  episodeDrawerOpen.value = false
  toolMenuOpen.value = false
  clearScreen.value = false
  brightnessLevel.value = 1
  resetClearGesture({ hideHud: true })
  const query = { ...route.query }
  delete query.mode
  router.replace({ path: '/m/shorts', query })
}

function openEpisodeDrawer() {
  drawerTab.value = 'episodes'
  activeRangeStart.value = Math.floor((Number(activeUnit.value?.epIndex) || 0) / 30) * 30
  episodeDrawerOpen.value = true
}

function jumpEpisode(index, options = {}) {
  const unit = activeUnit.value
  if (!unit?.vod?.id || !unit.channel?.id) return
  const epIndex = Math.max(0, Math.min((unit.total || 1) - 1, Number(index) || 0))
  clearFullCommitTimer()
  saveHistory(true)
  const ep = unit.channel.episodes?.[epIndex] || {}
  const nextUnit = {
    ...unit,
    key: `${unit.vod.id}:${unit.channel.id}:${epIndex}`,
    epIndex,
    epName: ep.name || `第${epIndex + 1}集`,
  }
  units.value.splice(activeIndex.value, 1, nextUnit)
  if (!options.fromScroll) episodeDrawerOpen.value = false
  nextTick(() => {
    scrollToFullCurrent('auto')
    schedulePlay(0)
  })
}

async function loadRelated() {
  const unit = activeUnit.value
  if (!unit?.vod?.id) return
  relatedLoading.value = true
  try {
    relatedItems.value = await api.related({
      id: unit.vod.id,
      type: unit.vod.typeName,
      sub: unit.vod.subType,
      limit: 12,
    }) || []
  } catch {
    relatedItems.value = []
  } finally {
    relatedLoading.value = false
  }
}

function openRelated(vod) {
  if (!vod?.id) return
  episodeDrawerOpen.value = false
  void playVodInShorts(vod.id)
}

function goSearch() {
  router.push({ path: '/m/search', query: { from: 'shorts' } })
}

async function playVodInShorts(vodId) {
  const id = Number(vodId) || 0
  if (!id) return
  const requestId = ++routePlayRequestId
  cancelPendingPlayback({ stop: true })
  clearFullCommitTimer()
  accessBlock.value = null
  episodeDrawerOpen.value = false
  toolMenuOpen.value = false
  clearScreen.value = false
  brightnessLevel.value = 1
  resetClearGesture({ hideHud: true })
  loading.value = !units.value.length
  try {
    const detail = await loadVodPlaybackDetail(id)
    if (requestId !== routePlayRequestId) return
    const history = user.value ? await api.userVodState(id).catch(() => null) : null
    if (requestId !== routePlayRequestId) return
    const resumeHistory = history?.history || readLocalHistory(id)
    const lineHistories = Array.isArray(history?.lineHistories) && history.lineHistories.length
      ? history.lineHistories
      : readLocalLineHistories(id)
    if (resumeHistory) {
      vodHistoryState.value = {
        ...vodHistoryState.value,
        [id]: { ...resumeHistory, latest: resumeHistory, lineHistories: lineHistories.length ? lineHistories : [resumeHistory] },
      }
    }
    const requestedEpIndex = Math.max(0, Number(resumeHistory?.epIndex) || 0)
    let candidates = playableLineCandidates(detail, requestedEpIndex)
    const epIndex = candidates.length ? requestedEpIndex : 0
    if (!candidates.length) candidates = playableLineCandidates(detail, 0)
    const historyLineId = Number(resumeHistory?.lineId || 0)
    const channel = candidates.find(item => Number(item.id) === historyLineId) || candidates[0]
    const unit = buildUnitFromChannel(detail, channel, { epIndex })
    if (!unit) {
      notifyWarning('当前影片暂无可播放线路')
      return
    }
    insertPlaybackUnit(unit)
    await nextTick()
    const query = { ...route.query }
    delete query.play
    delete query.mode
    if (String(route.query.play || '')) router.replace({ path: '/m/shorts', query })
    feedEl.value?.scrollTo({ top: activeIndex.value * Math.max(1, feedEl.value?.clientHeight || 1), behavior: 'auto' })
    ensureMoreAhead()
    writeShortsSession()
    schedulePlay(0)
  } catch (error) {
    notifyWarning(apiErrorMessage(error, '影片加载失败'))
  } finally {
    if (requestId === routePlayRequestId) loading.value = false
  }
}

function consumeRoutePlay(id) {
  const value = String(id || '').trim()
  if (!value) {
    consumedRoutePlay = ''
    return
  }
  if (consumedRoutePlay === value) return
  consumedRoutePlay = value
  void playVodInShorts(value)
}

function setPlaybackRate(rate) {
  const video = getVideo()
  if (video) video.playbackRate = Number(rate) || 1
  toolMenuOpen.value = false
}

function toggleClearScreen() {
  clearScreen.value = !clearScreen.value
  toolMenuOpen.value = false
  resetClearGesture({ hideHud: true })
  if (!clearScreen.value) brightnessLevel.value = 1
}

function requestPictureInPicture() {
  const video = getVideo()
  toolMenuOpen.value = false
  if (video?.requestPictureInPicture) {
    video.requestPictureInPicture().catch(() => notifyWarning('当前浏览器不支持小窗模式'))
  } else {
    notifyWarning('当前浏览器不支持小窗模式')
  }
}

function requestRemotePlayback() {
  const video = getVideo()
  toolMenuOpen.value = false
  if (video?.remote?.prompt) {
    video.remote.prompt().catch(() => notifyWarning('当前浏览器不支持投屏'))
  } else {
    notifyWarning('当前浏览器不支持投屏')
  }
}

function requestFullscreen() {
  const video = getVideo()
  const target = video || document.querySelector('.ms-card')
  try {
    if (video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen()
      return
    }
    if (video?.requestFullscreen) {
      video.requestFullscreen().catch(() => notifyWarning('当前浏览器不支持全屏'))
      return
    }
    if (target?.webkitRequestFullscreen) {
      target.webkitRequestFullscreen()
      return
    }
    if (target?.requestFullscreen) {
      target.requestFullscreen().catch(() => notifyWarning('当前浏览器不支持全屏'))
      return
    }
  } catch {}
  notifyWarning('当前浏览器不支持全屏')
}

function saveHistoryTick() {
  if (!user.value || currentSec.value < 20 || Date.now() - historySaveAt < 60000) return
  historySaveAt = Date.now()
  saveHistory()
}

function saveHistory(force = false) {
  const unit = playingUnit || activeUnit.value
  if (!unit?.vod?.id || !playUrl.value) return
  const video = getVideo()
  const progressSec = Math.floor(Number(video?.currentTime) || currentSec.value || 0)
  if (!force && progressSec < 20) return
  const historyDurationSec = Math.floor(Number(video?.duration) || durationSec.value || 0)
  updateVodHistory(unit, progressSec, historyDurationSec)
  if (!user.value) return
  api.saveHistory({
    vodId: unit.vod.id,
    lineId: unit.channel.id,
    epIndex: unit.epIndex,
    epName: unit.epName,
    progressSec,
    durationSec: historyDurationSec,
  }).catch(() => {})
}

async function refreshFollowState() {
  const id = activeUnit.value?.vod?.id
  followed.value = false
  liked.value = false
  if (!id || !user.value) return
  try {
    const state = await api.userVodState(id)
    followed.value = Boolean(state.followed)
  } catch {}
}

async function loadSite() {
  try {
    const data = await api.site()
    site.value = data
    writeCachedSite(data)
    sortMode.value = normalizeShortsConfig(data?.shortsConfig).sortMode
  } catch {}
}

async function loadShortOptions() {
  try {
    const data = await api.shortFeedOptions()
    shortOptions.value = {
      types: Array.isArray(data?.types) ? data.types : [],
      subtypes: data?.subtypes && typeof data.subtypes === 'object' ? data.subtypes : {},
    }
    categories.value = shortOptions.value.types
    normalizeSelectedFilter()
  } catch {}
}

function parseSubtypeKey(key) {
  const raw = String(key || '')
  const index = raw.indexOf('::')
  if (index <= 0) return null
  const type = raw.slice(0, index).trim()
  const name = raw.slice(index + 2).trim()
  return type && name ? { type, name } : null
}

function clearTypes() {
  selectedTypes.value = []
  selectedSubtypeKeys.value = []
}

function toggleType(type) {
  const name = String(type || '').trim()
  if (!name) return
  const selected = selectedTypes.value.includes(name)
  selectedTypes.value = selected ? selectedTypes.value.filter(item => item !== name) : [...selectedTypes.value, name]
  const allowedTypes = new Set(selectedTypes.value)
  selectedSubtypeKeys.value = selectedSubtypeKeys.value.filter(key => {
    const item = parseSubtypeKey(key)
    return item && (!selected || item.type !== name) && (!allowedTypes.size || allowedTypes.has(item.type))
  })
}

function toggleSubtype(sub) {
  const key = sub?.key || `${sub?.type || ''}::${sub?.name || ''}`
  if (!parseSubtypeKey(key)) return
  selectedSubtypeKeys.value = selectedSubtypeKeys.value.includes(key)
    ? selectedSubtypeKeys.value.filter(item => item !== key)
    : [...selectedSubtypeKeys.value, key]
}

function removeFilterTag(tag) {
  if (tag?.type === 'type') toggleType(tag.value)
  if (tag?.type === 'subtype') selectedSubtypeKeys.value = selectedSubtypeKeys.value.filter(item => item !== tag.value)
}

function resetFilter() {
  selectedTypes.value = []
  selectedSubtypeKeys.value = []
  sortMode.value = config.value.sortMode
  writeSavedFilter()
}

function applyFilter() {
  filterOpen.value = false
  writeSavedFilter()
  void reload({ force: true })
}

function viewerKey() {
  const value = user.value
  if (!value) return 'guest'
  return JSON.stringify({
    id: value.id || value.mid || 0,
    isVip: Boolean(value.isVip),
    vipLevelId: value.vipLevelId || value.levelId || null,
    vipExpireAt: value.vipExpireAt || value.vipUntil || '',
  })
}

async function refreshViewerRuntime(options = {}) {
  const resumePlayback = Boolean(options?.resumePlayback)
  cancelPendingPlayback({ stop: true })
  accessBlock.value = null
  fullNextPrefetchKey = ''
  resolveCache.clear()
  resolveInflight.clear()
  vodDetailCache.clear()
  playbackLineFailures.clear()
  jinpaiSelfHealTried.clear()
  await loadSite()
  await loadShortOptions()
  restoreSavedFilter()
  await reload({ force: true })
  if (resumePlayback) {
    await nextTick()
    if (fullMode.value) scrollToFullCurrent('auto')
    else scrollTo(activeIndex.value, 'auto')
    schedulePlay(120)
    void refreshFollowState()
  }
}

async function refreshForViewerChange() {
  await refreshViewerRuntime()
}

async function resumePlaybackForLoggedInViewer() {
  resumePlaybackAfterLogin = false
  await refreshUser().catch(() => null)
  await refreshViewerRuntime({ resumePlayback: true })
}

watch(activeIndex, () => {
  saveHistory(true)
  writeShortsSession()
  brightnessLevel.value = 1
  resetClearGesture({ hideHud: true })
  ensureMoreAhead()
  schedulePlay(80)
  void refreshFollowState()
})

watch(() => route.query.mode, () => {
  toolMenuOpen.value = false
  episodeDrawerOpen.value = false
  clearScreen.value = false
  brightnessLevel.value = 1
  resetClearGesture({ hideHud: true })
  if (fullMode.value && activeUnit.value) activeRangeStart.value = Math.floor((Number(activeUnit.value.epIndex) || 0) / 30) * 30
  nextTick(() => {
    if (fullMode.value) scrollToFullCurrent('auto')
    else scrollTo(activeIndex.value, 'auto')
    updateLandscapeMetrics()
  })
})

watch(() => route.query.play, (id) => {
  consumeRoutePlay(id)
})

watch(drawerTab, (tab) => {
  if (tab === 'related' && !relatedItems.value.length) void loadRelated()
})

watch(episodeDrawerOpen, (open) => {
  if (open && drawerTab.value === 'related' && !relatedItems.value.length) void loadRelated()
})

watch(viewerKey, (next, prev) => {
  if (resumePlaybackAfterLogin && prev === 'guest' && next !== 'guest') {
    void resumePlaybackForLoggedInViewer()
    return
  }
  void refreshForViewerChange()
})

onMounted(async () => {
  window.addEventListener('resize', scheduleLandscapeMetrics)
  await loadSite()
  await loadShortOptions()
  if (!restoreSavedFilter()) sortMode.value = config.value.sortMode
  await reload()
  consumeRoutePlay(route.query.play)
})

onDeactivated(() => {
  shortsVisible.value = false
  saveHistory(true)
  writeShortsSession()
  cancelPendingPlayback()
  clearFullCommitTimer()
  filterOpen.value = false
  episodeDrawerOpen.value = false
  toolMenuOpen.value = false
  resetClearGesture({ hideHud: true })
  const video = getVideo()
  resumeAfterActivate = Boolean(video && !video.paused && !accessBlock.value)
  if (video) {
    try { video.pause() } catch {}
  }
})

onActivated(() => {
  shortsVisible.value = true
  nextTick(() => {
    if (fullMode.value) scrollToFullCurrent('auto')
    else scrollTo(activeIndex.value, 'auto')
    updateLandscapeMetrics()
    if (route.query.play) {
      consumeRoutePlay(route.query.play)
      return
    }
    if (resumeAfterActivate && playUrl.value && !accessBlock.value) schedulePlay(80)
    resumeAfterActivate = false
  })
})

onBeforeUnmount(() => {
  saveHistory(true)
  writeShortsSession()
  cancelPendingPlayback()
  clearFullCommitTimer()
  if (clearGestureHudTimer) window.clearTimeout(clearGestureHudTimer)
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  if (resizeRaf) cancelAnimationFrame(resizeRaf)
  window.removeEventListener('resize', scheduleLandscapeMetrics)
  stopVideo()
})
</script>

<style scoped>
.ms {
  min-height: 100dvh;
  background: #050505;
  color: #fff;
  overflow: visible;
  overflow-x: hidden;
}
.ms.route-hidden {
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}
.ms-feed {
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-snap-type: y mandatory;
  overscroll-behavior: contain;
  scrollbar-width: none;
  background: #050505;
}
.ms-feed::-webkit-scrollbar {
  display: none;
}
.ms-feed.frozen {
  overflow: hidden;
}
.full-mode .ms-feed,
.full-mode .ms-card {
  height: 100dvh;
}
.full-mode .ms-card {
  overflow: hidden;
}
.ms-card {
  position: relative;
  height: 100dvh;
  scroll-snap-align: start;
  overflow: hidden;
  background: #050505;
}
.ms-bg,
.ms-poster,
.ms-video,
.ms-vignette {
  position: absolute;
  inset: 0;
}
.ms-bg {
  background-position: center;
  background-size: cover;
  filter: blur(28px);
  transform: scale(1.12);
  opacity: .48;
  z-index: 0;
}
.ms-poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 1;
}
.ms-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  background: #000;
  z-index: 2;
}
.ms-video.contain {
  object-fit: contain;
}
.ms-video.landscape {
  object-position: center var(--ms-landscape-object-y, 36%);
}
.ms-video.ready {
  opacity: 1;
}
.ms-vignette {
  z-index: 3;
}
.ms-brightness-mask {
  position: absolute;
  inset: 0;
  z-index: 4;
  background: #000;
  pointer-events: none;
  transition: opacity .12s ease;
}
.ms-clear-gesture-layer {
  position: absolute;
  inset: 0;
  z-index: 70;
  touch-action: none;
  background: transparent;
}
.ms-clear-hud {
  position: absolute;
  z-index: 76;
  left: 50%;
  top: 50%;
  min-width: 108px;
  padding: 12px 16px;
  border-radius: 14px;
  transform: translate(-50%, -50%);
  display: grid;
  gap: 4px;
  place-items: center;
  color: #fff;
  background: rgba(0, 0, 0, .58);
  backdrop-filter: blur(16px);
  box-shadow: 0 16px 44px rgba(0, 0, 0, .38);
  pointer-events: none;
}
.ms-clear-hud strong {
  font-size: 13px;
  font-weight: 900;
}
.ms-clear-hud span {
  font-size: 12px;
  font-weight: 800;
  color: rgba(255, 255, 255, .78);
  white-space: nowrap;
}
.ms-prompt-row {
  position: absolute;
  z-index: 12;
  left: 50%;
  bottom: calc(238px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.full-mode .ms-prompt-row {
  bottom: calc(220px + env(safe-area-inset-bottom));
}
.full-mode .ms-prompt-row.landscape {
  top: var(--ms-landscape-prompt-y, calc(var(--ms-landscape-play-y, 50%) + 54px));
  bottom: auto;
}
.ms-prompt-btn {
  height: 40px;
  border: 1px solid rgba(255, 255, 255, .26);
  border-radius: 999px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #fff;
  background: rgba(0, 0, 0, .44);
  backdrop-filter: blur(14px);
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
  box-shadow: 0 14px 34px rgba(0, 0, 0, .28);
  touch-action: manipulation;
  white-space: nowrap;
}
.ms-prompt-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ms-vignette {
  background:
    linear-gradient(180deg, rgba(0,0,0,.34), transparent 24%, transparent 60%, rgba(0,0,0,.62)),
    linear-gradient(90deg, rgba(0,0,0,.18), transparent 48%, rgba(0,0,0,.2));
  pointer-events: none;
}
.full-mode .ms-vignette {
  background:
    linear-gradient(180deg, rgba(0,0,0,.14), transparent 22%, transparent 62%, rgba(0,0,0,.58)),
    linear-gradient(90deg, rgba(0,0,0,.12), transparent 48%, rgba(0,0,0,.14));
}
.ms-top {
  position: fixed;
  z-index: 58;
  top: calc(env(safe-area-inset-top) + 10px);
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: space-between;
}
.ms-top.full {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,.34));
}
.ms-top.full .ms-top-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0;
}
.ms-top.full .ms-top-right {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
}
.ms-episode-title {
  min-width: 0;
  color: #fffffff0;
  font-size: 16px;
  line-height: 1.2;
  font-weight: 900;
  text-shadow: 0 0 4px rgba(0, 0, 0, .34);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ms-quality-pill {
  flex: 0 0 auto;
  max-width: 82px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255,255,255,.78);
  font-size: 11px;
  font-weight: var(--small-text-max-weight);
}
.ms-top button,
.ms-play,
.ms-actions button,
.ms-filter-head button {
  border: 0;
  color: inherit;
  background: transparent;
}
.ms-top button { transition: transform .16s ease, color .16s ease; }
.ms-top button:not(.m-back-btn) {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: transparent;
  touch-action: manipulation;
}
.ms-top.full .ms-top-right button {
  width: 48px;
  height: 48px;
  margin: -7px -5px;
}
.ms-top.full .ms-top-right svg {
  width: 22px;
  height: 22px;
}
.ms-top button:not(.m-back-btn) svg,
.ms-play svg,
.ms-actions svg,
.ms-filter svg,
.ms-full-bottom svg,
.ms-tool-menu svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ms-tool-menu {
  position: absolute;
  z-index: 18;
  top: calc(env(safe-area-inset-top) + 58px);
  right: 14px;
  width: 174px;
  padding: 8px;
  border-radius: 16px;
  background: rgba(18,18,20,.86);
  color: #fff;
  backdrop-filter: blur(12px);
  box-shadow: 0 18px 40px rgba(0,0,0,.28);
}
.ms-tool-menu button {
  width: 100%;
  min-height: 34px;
  border: 0;
  border-radius: 10px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  color: rgba(255,255,255,.9);
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
  text-align: left;
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease;
}
.ms-tool-menu button:hover {
  background: rgba(255,255,255,.1);
}
.ms-center {
  position: absolute;
  z-index: 12;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  color: rgba(255,255,255,.9);
  font-size: 13px;
}
.ms-center div {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid rgba(255,255,255,.22);
  border-top-color: #fff;
  animation: ms-spin .8s linear infinite;
}
.ms-play {
  position: absolute;
  z-index: 12;
  left: 50%;
  top: 50%;
  width: 74px;
  height: 74px;
  margin: -37px 0 0 -37px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: transparent;
  touch-action: manipulation;
  transition: transform .16s ease, color .16s ease;
}
.ms-play.landscape {
  top: var(--ms-landscape-play-y, 50%);
}
.ms-play svg {
  width: 58px;
  height: 58px;
  color: #fff;
  fill: currentColor;
  stroke: none;
  opacity: .8;
  margin-left: 4px;
  filter: drop-shadow(0 6px 16px rgba(0,0,0,.42));
}
.ms-lock {
  position: absolute;
  z-index: 14;
  left: 24px;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  padding: 22px;
  border-radius: 18px;
  background: rgba(12,12,14,.82);
  backdrop-filter: blur(20px);
  text-align: center;
}
.ms-lock strong {
  display: block;
  font-size: 18px;
}
.ms-lock p {
  margin: 8px 0 16px;
  color: rgba(255,255,255,.72);
  font-size: 13px;
}
.ms-lock button,
.ms-filter-actions button:last-child {
  border: 0;
  border-radius: 999px;
  background: linear-gradient(120deg, #ff4d3d, #ff7a38);
  color: #fff;
  font-weight: 800;
}
.ms-lock button {
  height: 42px;
  padding: 0 24px;
  touch-action: manipulation;
}
.ms-actions {
  position: absolute;
  z-index: 9;
  right: 13px;
  bottom: calc(126px + env(safe-area-inset-bottom));
  display: grid;
  gap: 15px;
}
.full-mode .ms-actions {
  bottom: calc(82px + env(safe-area-inset-bottom));
}
.ms-actions button {
  min-width: 46px;
  display: grid;
  justify-items: center;
  gap: 5px;
  color: rgba(255,255,255,.94);
  font-size: 11px;
  font-weight: var(--small-text-max-weight);
  text-shadow: 0 2px 8px rgba(0,0,0,.45);
  touch-action: manipulation;
  transition: transform .16s ease, color .16s ease;
}
.ms-actions svg {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 0;
  background: transparent;
}
.ms-actions button.on {
  color: #ff5747;
}
.ms-meta {
  position: absolute;
  z-index: 9;
  left: 16px;
  text-shadow: 0 0 4px #000;
  right: 78px;
  bottom: calc(116px + env(safe-area-inset-bottom));
}
.full-mode .ms-meta {
  bottom: calc(70px + env(safe-area-inset-bottom));
}
.ms-meta.full {
  right: 76px;
}
.ms-meta h1 {
  margin: 0 0 8px;
  font-size: 20px;
  line-height: 1.2;
  letter-spacing: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ms-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.ms-tags span {
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: rgba(255,255,255,.16);
  color: rgba(255,255,255,.88);
  font-size: 11px;
  font-weight: var(--small-text-max-weight);
}
.ms-meta p {
  margin: 0 0 11px;
  color: rgba(255,255,255,.84);
  font-size: 13px;
  line-height: 1.42;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ms-roam-bottom {
  position: fixed;
  z-index: 55;
  left: 0;
  right: 0;
  bottom: var(--mobile-tab-height, calc(62px + env(safe-area-inset-bottom)));
}
.ms-roam-card {
  position: relative;
  width: 100%;
  min-width: 0;
  height: 46px;
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, .08);
  border-radius: 0;
  overflow: visible;
  background: rgba(8, 8, 10, .46);
  color: #fff;
  backdrop-filter: blur(12px);
  box-shadow: none;
}
.ms-roam-open {
  width: 100%;
  height: 100%;
  min-width: 0;
  border: 0;
  padding: 0 14px 0 16px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 22px;
  align-items: center;
  gap: 8px;
  background: transparent;
  color: inherit;
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease;
}
.ms-roam-card strong {
  min-width: 0;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ms-roam-arrow {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: .82;
}
.ms-roam-card input {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  top: -14px;
  width: 100%;
  height: 28px;
  margin: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  touch-action: none;
}
.ms-roam-card input::-webkit-slider-runnable-track {
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, #ff5547 var(--progress), rgba(255,255,255,.24) var(--progress));
}
.ms-roam-card input::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -5px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0,0,0,.45);
  opacity: 0;
  transition: opacity .18s ease;
}
.ms-roam-card input:active::-webkit-slider-thumb {
  opacity: 1;
}
.ms-roam-card input::-moz-range-track {
  height: 2px;
  border-radius: 999px;
  background: rgba(255,255,255,.24);
}
.ms-roam-card input::-moz-range-progress {
  height: 2px;
  border-radius: 999px;
  background: #ff5547;
}
.ms-roam-card input::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0,0,0,.45);
}
.ms-top button:active,
.ms-tool-menu button:active,
.ms-prompt-btn:active,
.ms-play:active,
.ms-lock button:active,
.ms-actions button:active,
.ms-roam-open:active,
.ms-full-bottom button:active,
.ms-clear-exit:active,
.ms-state button:active,
.ms-filter button:active,
.ms-drawer-tabs button:active,
.ms-episode-ranges button:active,
.ms-episode-grid button:active,
.ms-related-grid article:active,
.ms-drawer-follow:active {
  transform: scale(.98);
}
.ms-progress {
  position: absolute;
  z-index: 80;
  left: 0;
  right: 0;
  bottom: calc(62px + env(safe-area-inset-bottom));
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0;
}
.full-mode .ms-progress {
  position: fixed;
  top: auto;
  bottom: calc(62px + env(safe-area-inset-bottom));
  height: 20px;
  align-items: center;
}
.ms-progress input {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 28px;
  margin: 0;
  transform: translateY(13px);
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  background: transparent;
  touch-action: none;
}
.full-mode .ms-progress input {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -9px;
  height: 20px;
  transform: none;
}
.ms-progress input::-webkit-slider-runnable-track {
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, #ff5547 var(--progress), rgba(255,255,255,.24) var(--progress));
}
.ms-progress input::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -5px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0,0,0,.45);
  opacity: 0;
  transition: opacity .18s ease;
}
.ms-progress.active input::-webkit-slider-thumb,
.ms-progress input:active::-webkit-slider-thumb {
  opacity: 1;
}
.ms-progress input::-moz-range-track {
  height: 2px;
  border-radius: 999px;
  background: rgba(255,255,255,.24);
}
.ms-progress input::-moz-range-progress {
  height: 2px;
  border-radius: 999px;
  background: #ff5547;
}
.ms-progress input::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0,0,0,.45);
}
.ms-full-bottom {
  position: fixed;
  z-index: 60;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(62px + env(safe-area-inset-bottom));
  padding: 13px 16px calc(13px + env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: calc(100vw - 80px) 36px;
  gap: 12px;
  align-items: center;
  background: #050505;
}
.ms-full-bottom button {
  min-width: 0;
  height: 36px;
  border: 0;
  border-radius: 12px;
  background: #171717;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 900;
  box-shadow: 0 12px 28px rgba(0, 0, 0, .36);
  touch-action: manipulation;
}
.ms-full-bottom button:first-child {
  justify-content: space-between;
  padding: 0 14px 0 16px;
  text-align: left;
}
.ms-full-bottom button span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ms-full-bottom button:last-child {
  width: 36px;
  border-radius: 12px;
  background: #171717;
  backdrop-filter: none;
}
.ms-full-bottom button:first-child svg {
  transform: rotate(-90deg);
}
.ms-clear-exit {
  position: fixed;
  z-index: 80;
  right: 14px;
  bottom: calc(14px + env(safe-area-inset-bottom));
  border: 0;
  width: 40px;
  height: 36px;
  padding: 0;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(255,255,255,.16);
  color: #fff;
  backdrop-filter: blur(14px);
}
.ms-clear-exit svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.clear-mode .ms-vignette,
.clear-mode .ms-top,
.clear-mode .ms-actions,
.clear-mode .ms-meta,
.clear-mode .ms-progress,
.clear-mode .ms-full-bottom,
.clear-mode .ms-roam-bottom,
.clear-mode .ms-prompt-row,
.clear-mode .ms-tool-menu {
  display: none;
}
.ms-tail {
  height: 52px;
  display: grid;
  place-items: center;
  color: rgba(255,255,255,.55);
  font-size: 12px;
  background: #050505;
}
.ms-state {
  min-height: 100dvh;
  display: grid;
  place-content: center;
  gap: 14px;
  text-align: center;
  background: #050505;
}
.ms-state strong {
  font-size: 16px;
}
.ms-state p {
  margin: 0;
  color: rgba(255,255,255,.62);
  font-size: 12px;
}
.ms-state button {
  border: 0;
  height: 40px;
  padding: 0 20px;
  border-radius: 999px;
  background: #fff;
  color: #111;
  font-weight: 800;
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease;
}
.ms-filter-mask {
  position: fixed;
  z-index: 70;
  inset: 0;
  background: rgba(0,0,0,.42);
}
.ms-filter {
  position: fixed;
  z-index: 71;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: min(76dvh, 620px);
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom));
  border-radius: 22px 22px 0 0;
  background: #fff;
  color: #16181d;
  overflow-y: auto;
  box-shadow: 0 -18px 48px rgba(0,0,0,.28);
}
.ms-filter-head {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ms-filter-head h2 {
  margin: 0;
  font-size: 18px;
}
.ms-filter-head button {
  width: 36px;
  height: 36px;
  color: #6b7280;
  border-radius: 50%;
  background: #f3f4f6;
}
.ms-filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0 10px;
}
.ms-filter-tags button {
  border: 0;
  min-width: 0;
  height: 30px;
  padding: 0 9px 0 11px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #fff0ed;
  color: #f04438;
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
  touch-action: manipulation;
}
.ms-filter-tags svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ms-filter-group {
  padding: 12px 0;
}
.ms-filter-group label {
  display: block;
  margin-bottom: 10px;
  color: #6d7480;
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
}
.ms-filter-group div {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}
.ms-filter-group button {
  border: 0;
  min-height: 34px;
  padding: 0 13px;
  border-radius: 999px;
  background: #f2f3f5;
  color: #333843;
  font-weight: 800;
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease, color .16s ease;
}
.ms-filter-group button.on {
  background: #fff0ed;
  color: #f04438;
}
.ms-filter-group button small {
  margin-left: 5px;
  color: inherit;
  opacity: .6;
  font-size: 10px;
  font-weight: var(--small-text-max-weight);
}
.ms-filter-actions {
  position: sticky;
  bottom: calc(-16px - env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 10px;
  margin: 0 -16px calc(-16px - env(safe-area-inset-bottom));
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
  background: #ffffffba;
  backdrop-filter: blur(4px);
}
.ms-filter-actions button {
  border: 0;
  height: 44px;
  border-radius: 999px;
  background: #f2f3f5;
  color: #333843;
  font-weight: 900;
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease;
}
.ms-fade-enter-active,
.ms-fade-leave-active {
  transition: opacity .12s ease;
}
.ms-fade-enter-from,
.ms-fade-leave-to {
  opacity: 0;
}
.ms-bottom-sheet-enter-active,
.ms-bottom-sheet-leave-active {
  transition: transform .16s cubic-bezier(.2, .7, .2, 1);
}
.ms-bottom-sheet-enter-from,
.ms-bottom-sheet-leave-to {
  transform: translateY(105%);
}
.ms-drawer-mask {
  position: fixed;
  z-index: 80;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.46));
}
.ms-episode-drawer {
  position: fixed;
  z-index: 81;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: min(72dvh, 640px);
  padding: 8px 16px calc(14px + env(safe-area-inset-bottom));
  border-radius: 24px 24px 0 0;
  background: #fff;
  color: #17191f;
  overflow-y: auto;
  box-shadow: 0 -18px 48px rgba(0,0,0,.28);
}
.ms-drag {
  width: 38px;
  height: 4px;
  margin: 4px auto 12px;
  border-radius: 999px;
  background: #d6d8dd;
}
.ms-drawer-head {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}
.ms-drawer-head img {
  width: 76px;
  height: 102px;
  border-radius: 10px;
  object-fit: cover;
  background: #f1f2f4;
}
.ms-drawer-head h2 {
  margin: 0 0 8px;
  font-size: 18px;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ms-drawer-head p {
  margin: 0 0 6px;
  color: #4b5563;
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
}
.ms-drawer-head span {
  color: #8a9099;
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.ms-drawer-tabs {
  position: sticky;
  top: 0;
  z-index: 2;
  margin: 14px -2px 8px;
  padding-top: 8px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: #fff;
}
.ms-drawer-tabs button {
  border: 0;
  height: 38px;
  border-radius: 999px;
  background: transparent;
  color: #727985;
  font-weight: 900;
}
.ms-drawer-tabs button.on {
  background: #fff0ed;
  color: #f04438;
}
.ms-drawer-body {
  padding: 6px 0 68px;
}
.ms-intro-text {
  margin: 0 0 12px;
  color: #343946;
  font-size: 14px;
  line-height: 1.65;
}
.ms-tags.light span {
  background: #f2f3f5;
  color: #59606b;
}
.ms-episode-ranges {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 10px;
  scrollbar-width: none;
}
.ms-episode-ranges::-webkit-scrollbar {
  display: none;
}
.ms-episode-ranges button {
  flex: 0 0 auto;
  border: 0;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: #f2f3f5;
  color: #606874;
  font-weight: 900;
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease, color .16s ease;
}
.ms-episode-ranges button.on {
  background: #fff0ed;
  color: #f04438;
}
.ms-episode-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}
.ms-episode-grid button {
  position: relative;
  min-width: 0;
  height: 42px;
  border: 0;
  border-radius: 10px;
  background: #f3f4f6;
  color: #303641;
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease, color .16s ease;
  overflow: hidden;
}
.ms-episode-grid button span {
  position: relative;
  z-index: 1;
  display: block;
}
.ms-episode-grid button em {
  position: relative;
  z-index: 1;
  display: block;
  margin-top: 2px;
  font-size: 10px;
  font-style: normal;
  line-height: 1;
  opacity: .86;
}
.ms-episode-grid button i {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  border-radius: 0 999px 999px 0;
  background: #f04438;
}
.ms-episode-grid button.resume:not(.on) {
  background: #fff0ed;
  color: #f04438;
}
.ms-episode-grid button.on {
  background: linear-gradient(120deg, #ff4d3d, #ff7a38);
  color: #fff;
}
.ms-episode-grid button.on i {
  background: rgba(255,255,255,.72);
}
.ms-related-state {
  min-height: 120px;
  display: grid;
  place-items: center;
  color: #858c96;
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
}
.ms-related-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 9px;
}
.ms-related-grid article {
  min-width: 0;
  touch-action: manipulation;
  transition: transform .16s ease;
}
.ms-related-grid img {
  width: 100%;
  aspect-ratio: 3 / 4.1;
  border-radius: 10px;
  object-fit: cover;
  background: #f1f2f4;
}
.ms-related-grid strong {
  display: block;
  margin-top: 6px;
  color: var(--mobile-vod-card-title-color);
  font-size: var(--mobile-vod-card-title-size);
  font-weight: var(--mobile-vod-card-title-weight);
  line-height: var(--mobile-vod-card-title-line);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ms-related-grid span {
  display: block;
  margin-top: 3px;
  color: #8a9099;
  font-size: 11px;
}
.ms-drawer-follow {
  position: sticky;
  bottom: 0;
  width: 100%;
  height: 44px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(120deg, #ff4d3d, #ff7a38);
  color: #fff;
  font-size: 15px;
  font-weight: 950;
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease, color .16s ease;
}
.ms-drawer-follow.on {
  background: #f2f3f5;
  color: #f04438;
}
@keyframes ms-spin {
  to { transform: rotate(360deg); }
}
</style>
