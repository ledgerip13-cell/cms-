<template>
  <div class="shorts-page" :class="{ 'immersive-mode': immersiveMode }">
    <div class="shorts-bg"></div>
    <main class="shorts-shell">
      <header v-if="!immersiveMode" class="shorts-top">
        <button class="icon-btn" type="button" aria-label="返回" @click="goBack">
          <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div class="shorts-title">
          <strong>刷短剧</strong>
          <span>{{ feedMode === 'series' ? '全集观看' : (activeUnit ? '短剧漫游' : '热门短剧') }}</span>
        </div>
        <div class="shorts-top-actions">
          <button v-if="shortsConfig.enableSearch" class="icon-btn" type="button" aria-label="搜索短剧" @click="openSearchSheet">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </button>
          <button class="icon-btn" type="button" aria-label="继续看和追剧" @click="openLibrarySheet">
            <svg viewBox="0 0 24 24"><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v13l-7-3.8-7 3.8z"/><path d="M9 9h6M9 12.5h4"/></svg>
          </button>
        </div>
      </header>

      <div v-if="shortsDisabled" class="shorts-empty">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16" rx="3"/><path d="M10 9l5 3-5 3z"/></svg>
        </div>
        <strong>刷短剧入口已关闭</strong>
        <button type="button" @click="goBack">返回</button>
      </div>
      <div v-else-if="loading && !units.length" class="shorts-loading">
        <div class="shorts-spinner"></div>
        <span>正在加载短剧</span>
      </div>
      <div v-else-if="!units.length" class="shorts-empty">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16" rx="3"/><path d="M10 9l5 3-5 3z"/></svg>
        </div>
        <strong>暂无可刷短剧</strong>
        <button v-if="shortsConfig.enableSearch" type="button" @click="openSearchSheet">搜索短剧</button>
        <button v-else type="button" @click="goBack">返回</button>
      </div>

      <section
        v-else
        ref="feedEl"
        class="shorts-feed"
        :class="{ frozen: layerOpen }"
        @scroll.passive="onFeedScroll"
      >
        <article v-for="(unit, i) in units" :key="unit.key" class="short-card" :class="{ locked: i === activeIndex && accessBlock }">
          <div class="short-media" @click="i === activeIndex && onMediaClick()">
            <div class="short-poster-bg" :style="posterStyle(unit)"></div>
            <img class="short-poster" :src="poster(unit)" :alt="unit.vod.name" loading="lazy" @error="onImgError($event, fallbackPoster(unit))" />
            <video
              v-if="i === activeIndex && playingKey === unit.key && playUrl && !accessBlock"
              ref="videoEl"
              class="short-video"
              :class="{landscape: videoLandscape, ready: videoReady}"
              autoplay
              playsinline
              webkit-playsinline
              :muted="muted"
              @loadedmetadata="onVideoMeta"
              @canplay="onVideoCanPlay"
              @timeupdate="onVideoTimeUpdate"
              @ended="nextItem"
              @error="onVideoError"
            ></video>
            <div class="short-dim"></div>

            <div v-if="i === activeIndex && resolving" class="center-state">
              <div class="shorts-spinner small"></div>
              <span>解析中</span>
            </div>
            <div v-if="i === activeIndex && needsTap && !accessBlock" class="center-state play-state" @click.stop="playNow">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <div v-if="i === activeIndex && paused && !needsTap && !accessBlock" class="center-state play-state" @click.stop="playNow">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <div v-if="i === activeIndex && accessBlock" class="short-lock">
              <div class="lock-icon">
                <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
              </div>
              <strong>{{ accessBlock.title }}</strong>
              <p>{{ accessBlock.desc }}</p>
              <div class="short-lock-actions">
                <button type="button" @click.stop="handleAccessAction">{{ accessBlock.actionText }}</button>
                <button v-if="immersiveMode" class="lock-ghost-btn" type="button" @click.stop="immersiveMode = false">退出沉浸</button>
              </div>
            </div>
            <div
              v-if="feedMode === 'series' && i === activeIndex && playingKey === unit.key && playUrl && !accessBlock"
              class="short-progress"
              :class="{ active: seeking || progressActive }"
              @click.stop
            >
              <input
                type="range"
                min="0"
                max="1000"
                step="1"
                :value="seekValue"
                :style="{ '--progress': `${progressPercent}%` }"
                aria-label="播放进度"
                @pointerdown.stop="startSeek"
                @pointermove.stop="touchProgressControls"
                @pointerup.stop="commitSeek"
                @pointercancel.stop="cancelSeek"
                @touchstart.stop="startSeek"
                @touchend.stop="commitSeek"
                @input.stop="onSeekInput"
                @change.stop="commitSeek"
              />
              <div class="progress-time">
                <span>{{ formatTime(currentSec) }}</span>
                <span>{{ formatTime(durationSec) }}</span>
              </div>
            </div>
          </div>

          <aside v-if="i === activeIndex && !accessBlock" class="short-actions" :class="{ compact: immersiveMode }">
            <template v-if="!immersiveMode">
              <button type="button" class="action-btn" :class="{on: isFollowed(unit.vod.id)}" aria-label="追剧" @click="toggleFollow(unit)">
                <svg viewBox="0 0 24 24"><path d="M12 21s-7-4.35-9.2-8.18C.75 9.25 2.7 5 6.7 5c2.05 0 3.35 1.12 4.05 2.08C11.45 6.12 12.75 5 14.8 5c4 0 5.95 4.25 3.9 7.82C16.5 16.65 12 21 12 21z"/></svg>
                <span>{{ isFollowed(unit.vod.id) ? '已追' : '追剧' }}</span>
              </button>
              <button v-if="feedMode === 'series'" type="button" class="action-btn" aria-label="选集" @click="openEpisodeSheet">
                <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8M8 13h5"/></svg>
                <span>选集</span>
              </button>
              <button type="button" class="action-btn" aria-label="声音" @click="toggleMute">
                <svg v-if="muted" viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M18 9l3 3-3 3M21 9l-3 3 3 3"/></svg>
                <svg v-else viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/></svg>
                <span>{{ muted ? '静音' : '声音' }}</span>
              </button>
              <button v-if="shortsConfig.showImmersiveButton" type="button" class="action-btn" aria-label="沉浸观看" @click="enterImmersive(unit)">
                <svg viewBox="0 0 24 24"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/></svg>
                <span>沉浸</span>
              </button>
            </template>
            <template v-else>
              <button type="button" class="action-btn" aria-label="选集" @click="openEpisodeSheet">
                <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8M8 13h5"/></svg>
                <span>选集</span>
              </button>
              <button type="button" class="action-btn subtle" aria-label="退出沉浸观看" @click="immersiveMode = false">
                <svg viewBox="0 0 24 24"><path d="M9 4H5a1 1 0 0 0-1 1v4M20 9V5a1 1 0 0 0-1-1h-4M15 20h4a1 1 0 0 0 1-1v-4M4 15v4a1 1 0 0 0 1 1h4"/></svg>
                <span>退出</span>
              </button>
            </template>
          </aside>

          <div v-if="i === activeIndex && !immersiveMode" class="short-meta">
            <div v-if="feedMode === 'wander'" class="watch-full-row">
              <button class="watch-full-btn" type="button" @click="enterSeriesMode(unit)">观看全集</button>
            </div>
            <div class="short-meta-main">
              <div class="episode-pill">{{ unit.epName }} / 共{{ unit.total }}集</div>
              <h1 class="short-title" tabindex="0" @click.stop="openDetailSheet" @keydown.enter.prevent="openDetailSheet" @keydown.space.prevent="openDetailSheet">{{ unit.vod.name }}</h1>
              <div class="meta-tags">
                <span>{{ unit.vod.typeName || '短剧' }}</span>
                <span v-if="unit.vod.year">{{ unit.vod.year }}</span>
                <span v-if="unit.vod.rating">★ {{ unit.vod.rating }}</span>
                <span v-if="unit.vod.remarks">{{ unit.vod.remarks }}</span>
              </div>
              <p>{{ unit.vod.officialIntro || unit.vod.blurb || '精彩短剧，滑动继续观看。' }}</p>
            </div>
          </div>
        </article>
        <div v-if="loadingMore" class="feed-tail">加载更多短剧...</div>
      </section>

      <transition name="episode-sheet">
        <div
          v-if="episodeSheetOpen"
          class="episode-mask"
          @click="closeEpisodeSheet({ resume: true })"
        >
          <div class="episode-sheet-panel" @click.stop>
            <div class="episode-sheet-head">
              <div>
                <strong>{{ activeUnit?.vod?.name || '当前短剧' }}</strong>
                <span>播放到第{{ currentEpisodeNumber }}集 / 共{{ currentEpisodeTotal }}集</span>
              </div>
              <button type="button" aria-label="关闭选集" @click="closeEpisodeSheet({ resume: true })">
                <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="episode-grid">
              <button
                v-for="item in episodeOptions"
                :key="item.key"
                type="button"
                :class="{on: item.index === currentSeriesEpIndex}"
                @click="jumpEpisode(item.index)"
              >
                <span>{{ item.name }}</span>
                <em v-if="item.index === currentSeriesEpIndex">播放中</em>
              </button>
            </div>
          </div>
        </div>
      </transition>

      <transition name="episode-sheet">
        <div
          v-if="detailSheetOpen"
          class="episode-mask"
          @click="detailSheetOpen = false"
        >
          <div class="detail-sheet-panel" @click.stop>
            <div class="episode-sheet-head">
              <div>
                <strong>{{ activeUnit?.vod?.name || '当前短剧' }}</strong>
                <span>{{ activeUnit?.vod?.year || '年份未知' }} · {{ activeUnit?.vod?.remarks || `共${activeUnit?.total || 0}集` }}</span>
              </div>
              <button type="button" aria-label="关闭详情" @click="detailSheetOpen = false">
                <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="detail-body">
              <img v-if="activeUnit" :src="poster(activeUnit)" :alt="activeUnit.vod.name" @error="onImgError($event, fallbackPoster(activeUnit))" />
              <div>
                <div class="meta-tags detail-tags">
                  <span>{{ activeUnit?.vod?.typeName || shortsConfig.defaultType }}</span>
                  <span v-if="activeUnit?.vod?.rating">★ {{ activeUnit.vod.rating }}</span>
                  <span>{{ activeUnit?.epName || '第1集' }}</span>
                </div>
                <p>{{ activeUnit?.vod?.officialIntro || activeUnit?.vod?.blurb || '暂无简介。' }}</p>
              </div>
            </div>
            <div class="detail-actions">
              <button type="button" @click="enterSeriesMode(activeUnit)">观看全集</button>
              <button v-if="shortsConfig.showImmersiveButton" type="button" @click="enterImmersive(activeUnit)">沉浸观看</button>
            </div>
          </div>
        </div>
      </transition>

      <transition name="episode-sheet">
        <div
          v-if="searchSheetOpen"
          class="episode-mask"
          @click="closeSearchSheet"
        >
          <div class="search-sheet-panel" :class="{ 'with-history': searchHistory.length }" @click.stop>
            <div class="episode-sheet-head">
              <div>
                <strong>短剧搜索</strong>
                <span>搜索和进入全集都留在刷短剧框架内</span>
              </div>
              <button type="button" aria-label="关闭搜索" @click="closeSearchSheet">
                <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <form class="short-search-box" @submit.prevent="runShortSearch">
              <input v-model.trim="searchKw" type="search" placeholder="搜索短剧名、演员、导演" autocomplete="off" />
              <button type="submit">搜索</button>
            </form>
            <div v-if="searchHistory.length" class="search-history">
              <div class="search-history-head">
                <span>最近搜索</span>
                <button type="button" @click="clearSearchHistory">清空</button>
              </div>
              <div class="search-history-list">
                <button v-for="term in searchHistory" :key="term" type="button" @click="pickSearchHistory(term)">{{ term }}</button>
              </div>
            </div>
            <div v-if="searchLoading" class="search-state">
              <div class="shorts-spinner small"></div>
              <span>搜索中</span>
            </div>
            <div v-else-if="!searchResults.length" class="search-state">暂无结果</div>
            <div v-else class="short-search-results">
              <button v-for="item in searchResults" :key="item.id" type="button" @click="openSearchResult(item)">
                <img :src="imgUrl(item.officialPic || item.pic || item.localPic || '')" :alt="item.name" @error="onImgError($event, imgUrl(item.localPic || ''))" />
                <span>
                  <b>{{ item.name }}</b>
                  <em>{{ item.year || '年份未知' }} · {{ item.remarks || item.typeName || shortsConfig.defaultType }}</em>
                </span>
              </button>
            </div>
          </div>
        </div>
      </transition>

      <transition name="episode-sheet">
        <div
          v-if="librarySheetOpen"
          class="episode-mask"
          @click="closeLibrarySheet"
        >
          <div class="library-sheet-panel" @click.stop>
            <div class="episode-sheet-head">
              <div>
                <strong>我的短剧</strong>
                <span>继续看和追剧</span>
              </div>
              <button type="button" aria-label="关闭我的短剧" @click="closeLibrarySheet">
                <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="library-tabs">
              <button type="button" :class="{on: libraryTab === 'history'}" @click="libraryTab = 'history'">
                继续看 <span>{{ libraryHistories.length }}</span>
              </button>
              <button type="button" :class="{on: libraryTab === 'follow'}" @click="libraryTab = 'follow'">
                我的追剧 <span>{{ libraryFollows.length }}</span>
              </button>
            </div>

            <div v-if="libraryLoading" class="library-state">
              <div class="shorts-spinner small"></div>
              <span>加载中</span>
            </div>
            <div v-else-if="libraryError" class="library-state">
              <span>{{ libraryError }}</span>
              <button type="button" @click="loadLibrary(true)">重试</button>
            </div>
            <template v-else-if="libraryTab === 'history'">
              <div v-if="libraryHistories.length" class="library-list">
                <button v-for="item in libraryHistories" :key="item.id" type="button" class="library-item" @click="openLibraryHistory(item)">
                  <img :src="imgUrl(item.vod.officialPic || item.vod.pic || item.vod.localPic || '')" :alt="item.vod.name" @error="onImgError($event, imgUrl(item.vod.localPic || ''))" />
                  <span class="library-info">
                    <b>{{ item.vod.name }}</b>
                    <em>{{ historySubText(item) }}</em>
                    <i v-if="historyProgressText(item)">{{ historyProgressText(item) }}</i>
                  </span>
                </button>
              </div>
              <div v-else class="library-state">暂无观看记录</div>
            </template>
            <template v-else>
              <div v-if="libraryFollows.length" class="library-list">
                <button v-for="item in libraryFollows" :key="item.id" type="button" class="library-item" @click="openLibraryFollow(item)">
                  <img :src="imgUrl(item.vod.officialPic || item.vod.pic || item.vod.localPic || '')" :alt="item.vod.name" @error="onImgError($event, imgUrl(item.vod.localPic || ''))" />
                  <span class="library-info">
                    <b>{{ item.vod.name }}</b>
                    <em>{{ item.vod.year || '年份未知' }} · {{ item.vod.remarks || item.vod.typeName || shortsConfig.defaultType }}</em>
                  </span>
                </button>
              </div>
              <div v-else class="library-state">暂无追剧</div>
            </template>
          </div>
        </div>
      </transition>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Hls from 'hls.js'
import { api, imgUrl } from '../api'
import { openAuthDialog } from '../authDialog'
import { apiErrorMessage, notifyError, notifySuccess, notifyWarning } from '../feedback'
import { normalizeShortsConfig, readCachedSite, writeCachedSite } from '../siteConfig'
import { currentUser } from '../userStore'

defineOptions({ name: 'Shorts' })

const SHORTS_MUTED_KEY = 'vcms.shorts.muted'
const SHORTS_SEARCH_HISTORY_KEY = 'vcms.shorts.search.history'
const SEARCH_HISTORY_LIMIT = 6
const RESOLVE_CACHE_TTL = 20 * 60 * 1000
const RESOLVE_CACHE_LIMIT = 80
const SERIES_PLAY_SETTLE_MS = 240
const SERIES_SCROLL_SETTLE_MS = 90
const SERIES_SNAP_EPSILON = 0.03
const WANDER_PLAY_SETTLE_MS = 120
const SCROLL_SUPPRESS_MS = 260
const HISTORY_MIN_PROGRESS_SEC = 20
const HISTORY_SAVE_INTERVAL_MS = 60 * 1000

function readMutedPreference() {
  try {
    const raw = localStorage.getItem(SHORTS_MUTED_KEY)
    return raw === null ? true : raw !== '0'
  } catch {
    return true
  }
}

function writeMutedPreference(value) {
  try {
    localStorage.setItem(SHORTS_MUTED_KEY, value ? '1' : '0')
  } catch {}
}

function readSearchHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(SHORTS_SEARCH_HISTORY_KEY) || '[]')
    return Array.isArray(rows)
      ? rows.map(item => String(item || '').trim()).filter(Boolean).slice(0, SEARCH_HISTORY_LIMIT)
      : []
  } catch {
    return []
  }
}

function writeSearchHistory(rows) {
  try {
    localStorage.setItem(SHORTS_SEARCH_HISTORY_KEY, JSON.stringify(rows.slice(0, SEARCH_HISTORY_LIMIT)))
  } catch {}
}

const router = useRouter()
const route = useRoute()
const feedEl = ref(null)
const videoEl = ref(null)
const loading = ref(true)
const loadingMore = ref(false)
const units = ref([])
const activeIndex = ref(0)
const feedMode = ref('wander')
const resolving = ref(false)
const playUrl = ref('')
const playingKey = ref('')
const accessBlock = ref(null)
const needsTap = ref(false)
const paused = ref(false)
const muted = ref(readMutedPreference())
const videoLandscape = ref(false)
const videoReady = ref(false)
const episodeSheetOpen = ref(false)
const detailSheetOpen = ref(false)
const searchSheetOpen = ref(false)
const librarySheetOpen = ref(false)
const immersiveMode = ref(false)
const site = ref(readCachedSite())
const searchKw = ref('')
const searchResults = ref([])
const searchLoading = ref(false)
const searchHistory = ref(readSearchHistory())
const libraryTab = ref('history')
const libraryLoading = ref(false)
const libraryError = ref('')
const libraryHistories = ref([])
const libraryFollows = ref([])
const currentSec = ref(0)
const durationSec = ref(0)
const seekValue = ref(0)
const seeking = ref(false)
const progressActive = ref(false)
const seriesState = ref(null)
const followState = reactive({})

const unitKeys = new Set()
const unitVodIds = new Set()
const resolveCache = new Map()
const resolveInflight = new Map()
const MORE_THRESHOLD = 5

let feedCursor = 0
let hasMoreFeed = true
let hls = null
let playSeq = 0
let historySaveAt = 0
let scrollRaf = 0
let wanderState = null
let feedSeed = 0
let previousViewportContent = null
let previousBodyOverflow = ''
let suppressActiveIndexWatch = false
let resumeAfterEpisodeSheet = false
let playingUnit = null
let progressIdleTimer = 0
let playSettleTimer = 0
let seriesCommitTimer = 0
let seriesScrollSettleTimer = 0
let ignoreScrollUntil = 0
let lastSavedHistoryKey = ''
let lastSavedHistoryAt = 0

const user = currentUser
const activeUnit = computed(() => units.value[activeIndex.value] || null)
const shortsConfig = computed(() => normalizeShortsConfig(site.value?.shortsConfig))
const shortsDisabled = computed(() => shortsConfig.value.enabled === false)
const feedBatchSize = computed(() => Math.max(4, Math.min(20, Number(shortsConfig.value.feedLimit) || 10)))
const layerOpen = computed(() => episodeSheetOpen.value || detailSheetOpen.value || searchSheetOpen.value || librarySheetOpen.value)
const currentSeriesEpIndex = computed(() => {
  if (feedMode.value !== 'series') return -1
  return Math.max(0, Number(seriesState.value?.epIndex) || 0)
})
const currentEpisodeNumber = computed(() => feedMode.value === 'series' ? currentSeriesEpIndex.value + 1 : activeIndex.value + 1)
const currentEpisodeTotal = computed(() => {
  if (feedMode.value === 'series') return Math.max(1, Number(seriesState.value?.total) || 1)
  return activeUnit.value?.total || units.value.length || 1
})
const episodeOptions = computed(() => {
  const state = seriesState.value
  if (feedMode.value !== 'series' || !state) {
    return units.value.map((unit, index) => ({
      key: unit.key || `feed:${index}`,
      index,
      name: unit.epName || `第${index + 1}集`,
    }))
  }
  return state.episodes.map((ep, index) => ({
    key: `ep:${state.baseUnit?.vod?.id || 'v'}:${state.baseUnit?.channel?.id || 'p'}:${index}`,
    index,
    name: ep?.name || `第${index + 1}集`,
  }))
})
const progressPercent = computed(() => {
  if (!durationSec.value) return 0
  return Math.max(0, Math.min(100, (currentSec.value / durationSec.value) * 100))
})

function goBack() {
  if (searchSheetOpen.value) {
    closeSearchSheet()
    return
  }
  if (librarySheetOpen.value) {
    closeLibrarySheet()
    return
  }
  if (detailSheetOpen.value) {
    detailSheetOpen.value = false
    return
  }
  if (episodeSheetOpen.value) {
    closeEpisodeSheet({ resume: true })
    return
  }
  if (immersiveMode.value) {
    immersiveMode.value = false
    return
  }
  if (feedMode.value === 'series') {
    exitSeriesMode()
    return
  }
  if (window.history.length > 1) router.back()
  else router.push('/')
}

function poster(unit) {
  return imgUrl(unit?.vod?.officialPic || unit?.vod?.pic || unit?.vod?.localPic || '')
}

function fallbackPoster(unit) {
  return imgUrl(unit?.vod?.localPic || '')
}

function posterStyle(unit) {
  const url = poster(unit)
  return url ? { backgroundImage: `url(${url})` } : {}
}

function onImgError(event, fallback = '') {
  const img = event?.target
  if (fallback && img && img.dataset.localFallbackApplied !== '1' && img.getAttribute('src') !== fallback) {
    img.dataset.localFallbackApplied = '1'
    img.src = fallback
    return
  }
  if (img) img.style.visibility = 'hidden'
}

function isDirectM3u8(url) {
  return /\.m3u8(\?|$)/i.test(url)
}

function buildUnit(item) {
  const vod = item?.vod || {}
  const play = item?.play || {}
  const epIndex = Math.max(0, Number(play.epIndex) || 0)
  const episodes = Array.isArray(play.episodes) ? play.episodes : []
  const ep = episodes[epIndex] || {}
  const channel = {
    id: play.id,
    sourceName: play.sourceName || '',
    epCount: Number(play.epCount) || episodes.length,
    alive: play.alive !== false,
    score: Number(play.score) || 0,
    playKind: play.playKind || '',
    episodes,
  }
  return {
    key: `${vod.id}:${channel.id || 'p'}:${epIndex}`,
    vod,
    line: channel,
    channel,
    epIndex,
    epName: play.epName || ep.name || `第${epIndex + 1}集`,
    total: Number(play.epCount) || episodes.length || 1,
  }
}

function buildUnitFromVodDetail(vod, options = {}) {
  const lines = Array.isArray(vod?.lines) ? vod.lines : []
  const preferredLineId = Number(options?.lineId)
  const line = lines.find(item => Number(item?.id) === preferredLineId) || lines[0]
  if (!vod?.id || !line?.id) return null
  const episodes = Array.isArray(line.episodes) ? line.episodes : []
  const total = line.epCount || episodes.length || 1
  const epIndex = clampIndex(options?.epIndex, total)
  const ep = episodes[epIndex] || {}
  return buildUnit({
    vod,
    play: {
      id: line.id,
      sourceName: line.sourceName || '',
      epCount: line.epCount || line.episodes?.length || 1,
      alive: line.alive !== false,
      score: Number(line.score) || 0,
      playKind: line.playKind || '',
      epIndex,
      epName: ep.name || `第${epIndex + 1}集`,
      episodes,
    },
  })
}

function clampIndex(value, total) {
  const max = Math.max(0, Number(total) - 1)
  const next = Math.floor(Number(value) || 0)
  return Math.max(0, Math.min(max, next))
}

function buildSeriesUnit(index) {
  const state = seriesState.value
  if (!state?.baseUnit) return null
  const total = Math.max(1, Number(state.total) || state.episodes.length || 1)
  const epIndex = clampIndex(index, total)
  const ep = state.episodes[epIndex] || {}
  const base = state.baseUnit
  return {
    ...base,
    key: `series:${base.vod.id}:${base.channel.id}:${epIndex}`,
    epIndex,
    epName: ep.name || `第${epIndex + 1}集`,
    total,
  }
}

function buildSeriesWindow(epIndex) {
  const state = seriesState.value
  const total = Math.max(1, Number(state?.total) || state?.episodes?.length || 1)
  const current = clampIndex(epIndex, total)
  const size = Math.min(3, total)
  const start = Math.max(0, Math.min(current - 1, total - size))
  return Array.from({ length: size }, (_, offset) => buildSeriesUnit(start + offset)).filter(Boolean)
}

async function showSeriesEpisode(index, options = {}) {
  const state = seriesState.value
  if (!state) return
  clearSeriesScrollSettleTimer()
  if (options.play !== false) {
    cancelPendingPlayback({ stop: true })
    historySaveAt = 0
  }
  const total = Math.max(1, Number(state.total) || state.episodes.length || 1)
  const epIndex = clampIndex(index, total)
  const nextUnits = buildSeriesWindow(epIndex)
  const nextActive = Math.max(0, nextUnits.findIndex(unit => unit.epIndex === epIndex))
  suppressActiveIndexWatch = true
  state.epIndex = epIndex
  units.value = nextUnits
  activeIndex.value = nextActive
  await nextTick()
  ignoreScrollUntil = Date.now() + SCROLL_SUPPRESS_MS
  scrollToIndex(nextActive, options.behavior || 'auto')
  suppressActiveIndexWatch = false
  ensureMoreAhead()
  if (options.play !== false) schedulePlayActive(Number(options.settleMs) || 0)
}

function appendFeedItems(items) {
  const list = []
  for (const item of items || []) {
    const unit = buildUnit(item)
    if (!unit.vod?.id || !unit.channel?.id || unitKeys.has(unit.key) || unitVodIds.has(unit.vod.id)) continue
    unitKeys.add(unit.key)
    unitVodIds.add(unit.vod.id)
    list.push(unit)
  }
  if (list.length) units.value = [...units.value, ...list]
  return list.length
}

async function loadFollowState(vodId) {
  if (!vodId || followState[vodId] !== undefined || !user.value) return
  try {
    const state = await api.userVodState(vodId)
    followState[vodId] = Boolean(state.followed)
  } catch {
    followState[vodId] = false
  }
}

async function loadNextFeed(limit = feedBatchSize.value) {
  if (shortsDisabled.value) return
  if (loadingMore.value || !hasMoreFeed) return
  loadingMore.value = true
  try {
    let addedTotal = 0
    for (let attempt = 0; attempt < 3 && hasMoreFeed && addedTotal < limit; attempt += 1) {
      const exclude = [...unitVodIds].slice(-500).join(',')
      const result = await api.shortFeed({
        cursor: feedCursor,
        limit: Math.max(limit, limit - addedTotal),
        type: shortsConfig.value.defaultType,
        sort: shortsConfig.value.sortMode,
        seed: feedSeed,
        exclude,
      })
      if (result?.disabled) {
        units.value = []
        hasMoreFeed = false
        return
      }
      const items = result?.list || []
      const added = appendFeedItems(items)
      addedTotal += added
      const nextCursor = Number(result?.nextCursor)
      feedCursor = Number.isFinite(nextCursor) ? nextCursor : feedCursor + items.length
      hasMoreFeed = Boolean(result?.hasMore)
      if (!items.length || (!added && !hasMoreFeed)) break
    }
  } finally {
    loadingMore.value = false
  }
}

async function loadFeed() {
  loading.value = true
  suppressActiveIndexWatch = true
  clearSeriesCommitTimer()
  clearSeriesScrollSettleTimer()
  cancelPendingPlayback({ stop: true })
  try {
    if (shortsDisabled.value) {
      units.value = []
      return
    }
    immersiveMode.value = false
    detailSheetOpen.value = false
    searchSheetOpen.value = false
    librarySheetOpen.value = false
    feedMode.value = 'wander'
    seriesState.value = null
    activeIndex.value = 0
    wanderState = null
    units.value = []
    unitKeys.clear()
    unitVodIds.clear()
    feedCursor = 0
    feedSeed = createFeedSeed()
    hasMoreFeed = true
    await loadNextFeed(feedBatchSize.value)
  } catch (error) {
    notifyError(apiErrorMessage(error, '短剧加载失败'))
  } finally {
    loading.value = false
    suppressActiveIndexWatch = false
  }
  await nextTick()
  scrollToIndex(0, 'auto')
  ensureMoreAhead()
  schedulePlayActive(WANDER_PLAY_SETTLE_MS)
}

function onFeedScroll() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    if (suppressActiveIndexWatch || Date.now() < ignoreScrollUntil) return
    const el = feedEl.value
    if (!el) return
    const h = Math.max(1, el.clientHeight)
    const raw = el.scrollTop / h
    const next = Math.max(0, Math.min(units.value.length - 1, Math.round(raw)))
    if (feedMode.value === 'series') {
      const distance = Math.abs(raw - next)
      if (distance > SERIES_SNAP_EPSILON) {
        scheduleSeriesScrollSettle()
        return
      }
      clearSeriesScrollSettleTimer()
    }
    if (next !== activeIndex.value) activeIndex.value = next
  })
}

function scrollToIndex(index, behavior = 'smooth') {
  const el = feedEl.value
  if (!el) return
  const next = Math.max(0, Math.min(units.value.length - 1, index))
  el.scrollTo({ top: next * el.clientHeight, behavior })
}

function ensureMoreAhead() {
  if (feedMode.value === 'wander' && units.value.length - activeIndex.value <= MORE_THRESHOLD) {
    void loadNextFeed(feedBatchSize.value)
  }
  const current = activeUnit.value
  const next = units.value[activeIndex.value + 1]
  const prev = units.value[activeIndex.value - 1]
  if (current?.vod?.id) void loadFollowState(current.vod.id)
  if (next?.vod?.id) void loadFollowState(next.vod.id)
  preloadPoster(prev)
  preloadPoster(next)
}

const preloadedPosters = new Set()
function preloadPoster(unit) {
  const url = poster(unit)
  if (!url || preloadedPosters.has(url)) return
  preloadedPosters.add(url)
  const img = new Image()
  img.decoding = 'async'
  img.src = url
}

function stopPlayback() {
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
  needsTap.value = false
  paused.value = false
  videoLandscape.value = false
  videoReady.value = false
  currentSec.value = 0
  durationSec.value = 0
  seekValue.value = 0
  seeking.value = false
  progressActive.value = false
  clearProgressIdleTimer()
}

function getVideo() {
  return Array.isArray(videoEl.value) ? videoEl.value[0] : videoEl.value
}

function clearPlaySettleTimer() {
  if (playSettleTimer) {
    window.clearTimeout(playSettleTimer)
    playSettleTimer = 0
  }
}

function clearSeriesCommitTimer() {
  if (seriesCommitTimer) {
    window.clearTimeout(seriesCommitTimer)
    seriesCommitTimer = 0
  }
}

function clearSeriesScrollSettleTimer() {
  if (seriesScrollSettleTimer) {
    window.clearTimeout(seriesScrollSettleTimer)
    seriesScrollSettleTimer = 0
  }
}

function cancelPendingPlayback(options = {}) {
  clearPlaySettleTimer()
  playSeq += 1
  resolving.value = false
  if (options.stop) stopPlayback()
}

function schedulePlayActive(delay = 0) {
  clearPlaySettleTimer()
  playSeq += 1
  resolving.value = false
  const ms = Math.max(0, Number(delay) || 0)
  if (!ms) {
    void playActive()
    return
  }
  playSettleTimer = window.setTimeout(() => {
    playSettleTimer = 0
    void playActive()
  }, ms)
}

function scheduleSeriesCommit(epIndex) {
  const state = seriesState.value
  if (!state) return
  const total = Math.max(1, Number(state.total) || state.episodes.length || 1)
  const targetEp = clampIndex(epIndex, total)
  clearSeriesCommitTimer()
  cancelPendingPlayback({ stop: true })
  historySaveAt = 0
  state.epIndex = targetEp
  void showSeriesEpisode(targetEp, { behavior: 'auto', play: false })
  seriesCommitTimer = window.setTimeout(() => {
    seriesCommitTimer = 0
    if (feedMode.value !== 'series' || !seriesState.value) return
    if (currentSeriesEpIndex.value !== targetEp) return
    schedulePlayActive(0)
  }, SERIES_PLAY_SETTLE_MS)
}

function scheduleSeriesScrollSettle() {
  clearSeriesScrollSettleTimer()
  seriesScrollSettleTimer = window.setTimeout(() => {
    seriesScrollSettleTimer = 0
    commitSettledSeriesScroll()
  }, SERIES_SCROLL_SETTLE_MS)
}

function commitSettledSeriesScroll() {
  if (feedMode.value !== 'series' || suppressActiveIndexWatch || Date.now() < ignoreScrollUntil) return
  const el = feedEl.value
  if (!el) return
  const h = Math.max(1, el.clientHeight)
  const raw = el.scrollTop / h
  const next = Math.max(0, Math.min(units.value.length - 1, Math.round(raw)))
  if (Math.abs(raw - next) > SERIES_SNAP_EPSILON) {
    scheduleSeriesScrollSettle()
    return
  }
  if (next !== activeIndex.value) activeIndex.value = next
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

function accessTitle(result) {
  const req = result?.requirement || {}
  const label = req.label || (req.kind === 'vip' ? 'VIP会员' : '指定会员等级')
  if (result?.code === 'login_required') {
    if (req.kind === 'vip' || req.kind === 'level' || req.kind === 'vip_or_level') return `当前短剧需要登录后以${label}身份观看`
    return '当前短剧需要登录后才能观看'
  }
  if (result?.code === 'vip_required') return `当前短剧需要${label}才能观看`
  if (result?.code === 'level_required' || result?.code === 'vip_or_level_required') return `当前短剧需要${label}才能观看`
  return result?.error || '当前短剧暂无观看权限'
}

function showAccessBlock(result) {
  stopPlayback()
  const loginRequired = result?.code === 'login_required'
  accessBlock.value = {
    code: result?.code || 'access_denied',
    title: accessTitle(result),
    desc: loginRequired ? '登录成功后会自动继续播放当前集。' : '当前账号权限不足，请切换符合权限的会员等级后再观看。',
    actionText: loginRequired ? '登录观看' : '查看会员',
    retryAfterLogin: loginRequired,
  }
}

function handleAccessAction() {
  if (accessBlock.value?.code === 'login_required') {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: accessBlock.value.title })
    return
  }
  notifyWarning('当前账号权限不足，请返回后到个人中心处理会员权限')
}

async function playActive() {
  const unit = activeUnit.value
  const seq = ++playSeq
  stopPlayback()
  historySaveAt = 0
  accessBlock.value = null
  playingUnit = unit || null
  if (!unit?.vod?.id || !unit?.channel?.id) return
  resolving.value = true
  try {
    const result = await resolveUnitPlayback(unit)
    if (seq !== playSeq) return
    if (['login_required', 'vip_required', 'level_required', 'vip_or_level_required'].includes(result?.code)) {
      showAccessBlock(result)
      return
    }
    if (!result?.ok || !result.url) {
      notifyWarning(result?.error || '当前集暂时无法播放')
      return
    }
    await attachVideo(result.url, result.kind || '')
  } catch (error) {
    if (seq === playSeq) notifyError(apiErrorMessage(error, '播放解析失败'))
  } finally {
    if (seq === playSeq) resolving.value = false
  }
}

async function attachVideo(url, kind) {
  playingKey.value = activeUnit.value?.key || ''
  videoReady.value = false
  playUrl.value = url
  await nextTick()
  const video = getVideo()
  if (!video) return
  video.muted = muted.value
  video.autoplay = true
  video.playsInline = true
  if (hls) {
    hls.destroy()
    hls = null
  }
  if (kind === 'm3u8' || isDirectM3u8(url)) {
    if (Hls.isSupported()) {
      hls = new Hls({
        maxBufferLength: 12,
        maxMaxBufferLength: 20,
        backBufferLength: 8,
        lowLatencyMode: false,
      })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, playNow)
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data?.fatal || !hls) return
        notifyWarning('当前线路播放失败，已暂停')
        stopPlayback()
      })
      return
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = url
  } else {
    video.src = url
  }
  playNow()
}

function markNeedsTap() {
  needsTap.value = true
  paused.value = true
}

function playNow() {
  const video = getVideo()
  if (!video) return
  video.muted = muted.value
  video.play().then(() => {
    needsTap.value = false
    paused.value = false
  }).catch(() => {
    markNeedsTap()
  })
}

function togglePause() {
  const video = getVideo()
  if (!video || resolving.value || accessBlock.value) return
  if (video.paused) playNow()
  else {
    video.pause()
    paused.value = true
    needsTap.value = false
  }
}

function pauseCurrentVideo() {
  const video = getVideo()
  if (!video || video.paused) return false
  video.pause()
  paused.value = true
  needsTap.value = false
  return true
}

function onMediaClick() {
  togglePause()
}

function toggleMute() {
  muted.value = !muted.value
  writeMutedPreference(muted.value)
  const video = getVideo()
  if (video) video.muted = muted.value
}

function onVideoMeta(event) {
  const video = event.target
  videoLandscape.value = Number(video.videoWidth || 0) > Number(video.videoHeight || 0) * 1.18
  durationSec.value = Math.floor(Number(video.duration) || 0)
  currentSec.value = Math.floor(Number(video.currentTime) || 0)
  seekValue.value = durationSec.value ? Math.round((currentSec.value / durationSec.value) * 1000) : 0
}

function onVideoCanPlay() {
  videoReady.value = true
}

function onVideoError() {
  notifyWarning('当前集播放失败')
  paused.value = true
  videoReady.value = false
}

function saveWatchHistory(progressOverride = null, options = {}) {
  const unit = playingUnit || activeUnit.value
  if (!user.value || !unit?.vod?.id || !playUrl.value) return
  const video = getVideo()
  const progressSec = progressOverride === null ? Math.floor(Number(video?.currentTime) || 0) : progressOverride
  if (progressSec < HISTORY_MIN_PROGRESS_SEC) return
  const durationSec = Math.floor(Number(video?.duration) || 0)
  const key = `${unit.vod.id}:${unit.channel.id}:${unit.epIndex}`
  const now = Date.now()
  if (!options.force && key === lastSavedHistoryKey && now - lastSavedHistoryAt < HISTORY_SAVE_INTERVAL_MS) return
  lastSavedHistoryKey = key
  lastSavedHistoryAt = now
  api.saveHistory({
    vodId: unit.vod.id,
    lineId: unit.channel.id,
    epIndex: unit.epIndex,
    epName: unit.epName,
    progressSec,
    durationSec,
  }).catch(() => {})
}

function onVideoTimeUpdate() {
  const video = getVideo()
  if (video) {
    const nextDuration = Math.floor(Number(video.duration) || 0)
    const nextCurrent = Math.floor(Number(video.currentTime) || 0)
    durationSec.value = nextDuration
    if (!seeking.value) {
      currentSec.value = nextCurrent
      seekValue.value = nextDuration ? Math.round((nextCurrent / nextDuration) * 1000) : 0
    }
  }
  if (!user.value) return
  const now = Date.now()
  if (currentSec.value < HISTORY_MIN_PROGRESS_SEC || now - historySaveAt < HISTORY_SAVE_INTERVAL_MS) return
  historySaveAt = now
  saveWatchHistory()
}

function nextItem() {
  saveWatchHistory(null, { force: true })
  if (layerOpen.value || seeking.value) {
    paused.value = true
    return
  }
  if (feedMode.value === 'series') {
    if (!shortsConfig.value.autoPlayNext) {
      paused.value = true
      return
    }
    const nextEp = currentSeriesEpIndex.value + 1
    if (nextEp < currentEpisodeTotal.value) {
      void showSeriesEpisode(nextEp, { behavior: 'smooth', settleMs: WANDER_PLAY_SETTLE_MS })
    } else {
      paused.value = true
    }
    return
  }
  if (activeIndex.value < units.value.length - 1) scrollToIndex(activeIndex.value + 1)
  else if (feedMode.value === 'wander') void loadNextFeed(feedBatchSize.value).then(() => scrollToIndex(activeIndex.value + 1))
  else paused.value = true
}

function jumpEpisode(index) {
  if (feedMode.value !== 'series') return
  const isCurrent = index === currentSeriesEpIndex.value
  closeEpisodeSheet({ resume: isCurrent })
  if (isCurrent) return
  saveWatchHistory(null, { force: true })
  void showSeriesEpisode(index, { settleMs: SERIES_PLAY_SETTLE_MS })
}

function openEpisodeSheet() {
  if (feedMode.value !== 'series') return
  resumeAfterEpisodeSheet = pauseCurrentVideo()
  episodeSheetOpen.value = true
}

function closeEpisodeSheet(options = {}) {
  const shouldResume = Boolean(options?.resume && resumeAfterEpisodeSheet && !accessBlock.value)
  episodeSheetOpen.value = false
  resumeAfterEpisodeSheet = false
  if (shouldResume) void nextTick(() => playNow())
}

function clearProgressIdleTimer() {
  if (progressIdleTimer) {
    window.clearTimeout(progressIdleTimer)
    progressIdleTimer = 0
  }
}

function showProgressControls() {
  clearProgressIdleTimer()
  progressActive.value = true
}

function scheduleProgressIdle() {
  clearProgressIdleTimer()
  progressIdleTimer = window.setTimeout(() => {
    if (!seeking.value) progressActive.value = false
  }, 1200)
}

function touchProgressControls() {
  showProgressControls()
  if (!seeking.value) scheduleProgressIdle()
}

function startSeek() {
  showProgressControls()
  seeking.value = true
}

function onSeekInput(event) {
  showProgressControls()
  seeking.value = true
  const next = Math.max(0, Math.min(1000, Number(event?.target?.value) || 0))
  seekValue.value = next
  currentSec.value = durationSec.value ? Math.floor((durationSec.value * next) / 1000) : 0
}

function commitSeek(event) {
  const video = getVideo()
  const next = Math.max(0, Math.min(1000, Number(event?.target?.value ?? seekValue.value) || 0))
  seekValue.value = next
  if (video && durationSec.value) {
    const nextTime = (durationSec.value * next) / 1000
    video.currentTime = nextTime
    currentSec.value = Math.floor(nextTime)
    if (!paused.value) playNow()
  }
  seeking.value = false
  scheduleProgressIdle()
}

function cancelSeek() {
  seeking.value = false
  scheduleProgressIdle()
}

function formatTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function createFeedSeed() {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1)
    window.crypto.getRandomValues(values)
    return values[0]
  }
  return Date.now()
}

async function enterSeriesMode(unit = activeUnit.value) {
  if (!unit?.vod?.id || !unit?.channel?.id) return
  const wasSeries = feedMode.value === 'series'
  const current = activeUnit.value
  if (wasSeries && current?.vod?.id === unit.vod.id && current?.channel?.id === unit.channel.id) {
    detailSheetOpen.value = false
    searchSheetOpen.value = false
    librarySheetOpen.value = false
    episodeSheetOpen.value = false
    const nextEp = clampIndex(unit.epIndex || 0, currentEpisodeTotal.value)
    if (nextEp !== currentSeriesEpIndex.value) {
      saveWatchHistory(null, { force: true })
      await showSeriesEpisode(nextEp, { behavior: 'auto', settleMs: SERIES_PLAY_SETTLE_MS })
    }
    return
  }
  saveWatchHistory(null, { force: true })
  episodeSheetOpen.value = false
  resumeAfterEpisodeSheet = false
  detailSheetOpen.value = false
  searchSheetOpen.value = false
  librarySheetOpen.value = false
  suppressActiveIndexWatch = true
  if (!wasSeries || !wanderState) {
    wanderState = {
      units: units.value,
      activeIndex: activeIndex.value,
      feedCursor,
      feedSeed,
      hasMoreFeed,
    }
  }
  const episodes = Array.isArray(unit.channel.episodes) ? unit.channel.episodes : []
  const total = episodes.length || unit.total || 1
  seriesState.value = {
    baseUnit: {
      ...unit,
      key: `${unit.vod.id}:${unit.channel.id}:base`,
      epIndex: 0,
      epName: episodes[0]?.name || '第1集',
      total,
    },
    episodes,
    total,
    epIndex: clampIndex(unit.epIndex || 0, total),
  }
  feedMode.value = 'series'
  await showSeriesEpisode(seriesState.value.epIndex, { behavior: 'auto' })
}

async function enterImmersive(unit = activeUnit.value) {
  if (!unit?.vod?.id || !unit?.channel?.id) return
  immersiveMode.value = true
  if (feedMode.value === 'wander') {
    await enterSeriesMode(unit)
  }
}

async function exitSeriesMode() {
  episodeSheetOpen.value = false
  resumeAfterEpisodeSheet = false
  detailSheetOpen.value = false
  immersiveMode.value = false
  clearSeriesScrollSettleTimer()
  if (!wanderState) {
    feedMode.value = 'wander'
    seriesState.value = null
    await loadFeed()
    return
  }
  saveWatchHistory(null, { force: true })
  suppressActiveIndexWatch = true
  feedMode.value = 'wander'
  seriesState.value = null
  units.value = wanderState.units || []
  activeIndex.value = Math.max(0, Math.min(wanderState.activeIndex || 0, units.value.length - 1))
  feedCursor = Number(wanderState.feedCursor) || 0
  feedSeed = Number(wanderState.feedSeed) || createFeedSeed()
  hasMoreFeed = Boolean(wanderState.hasMoreFeed)
  unitKeys.clear()
  unitVodIds.clear()
  for (const item of units.value) {
    if (item?.key) unitKeys.add(item.key)
    if (item?.vod?.id) unitVodIds.add(item.vod.id)
  }
  wanderState = null
  await nextTick()
  scrollToIndex(activeIndex.value, 'auto')
  suppressActiveIndexWatch = false
  ensureMoreAhead()
  schedulePlayActive(WANDER_PLAY_SETTLE_MS)
}

function isFollowed(vodId) {
  return Boolean(followState[vodId])
}

async function toggleFollow(unit) {
  if (!unit?.vod?.id) return
  if (!user.value) {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后可追剧和同步片单' })
    return
  }
  try {
    const result = followState[unit.vod.id]
      ? await api.unfollowVod(unit.vod.id)
      : await api.followVod(unit.vod.id)
    followState[unit.vod.id] = Boolean(result.followed)
    notifySuccess(result.followed ? '已加入追剧' : '已取消追剧')
  } catch (error) {
    notifyError(apiErrorMessage(error, '操作失败'))
  }
}

function openSearchSheet() {
  if (!shortsConfig.value.enableSearch) return
  detailSheetOpen.value = false
  episodeSheetOpen.value = false
  librarySheetOpen.value = false
  searchSheetOpen.value = true
  if (!searchResults.value.length) void runShortSearch()
}

function closeSearchSheet() {
  searchSheetOpen.value = false
}

function rememberShortSearch(value) {
  const term = String(value || '').trim()
  if (!term) return
  const next = [term, ...searchHistory.value.filter(item => item !== term)].slice(0, SEARCH_HISTORY_LIMIT)
  searchHistory.value = next
  writeSearchHistory(next)
}

function pickSearchHistory(term) {
  searchKw.value = term
  void runShortSearch()
}

function clearSearchHistory() {
  searchHistory.value = []
  writeSearchHistory([])
}

async function runShortSearch() {
  if (searchLoading.value) return
  const kw = String(searchKw.value || '').trim()
  searchKw.value = kw
  if (kw) rememberShortSearch(kw)
  searchLoading.value = true
  try {
    const result = await api.vods({
      kw: kw || undefined,
      type: shortsConfig.value.defaultType,
      sort: kw ? 'hot' : shortsConfig.value.sortMode === 'recent' ? 'recent' : 'hot',
      size: 18,
    })
    searchResults.value = Array.isArray(result?.list) ? result.list : []
  } catch (error) {
    notifyError(apiErrorMessage(error, '短剧搜索失败'))
    searchResults.value = []
  } finally {
    searchLoading.value = false
  }
}

async function openSearchResult(item) {
  await openVodInShorts(item?.id, { errorText: '短剧打开失败' })
}

function isShortVod(vod) {
  const type = shortsConfig.value.defaultType
  return !type || !vod?.typeName || vod.typeName === type
}

async function loadLibrary(force = false) {
  if (!user.value || libraryLoading.value) return
  if (!force && (libraryHistories.value.length || libraryFollows.value.length)) return
  libraryLoading.value = true
  libraryError.value = ''
  try {
    const [histories, follows] = await Promise.all([api.history(50), api.follows(50)])
    libraryHistories.value = (Array.isArray(histories) ? histories : []).filter(item => item?.vod?.id && isShortVod(item.vod))
    libraryFollows.value = (Array.isArray(follows) ? follows : []).filter(item => item?.vod?.id && isShortVod(item.vod))
  } catch (error) {
    libraryError.value = apiErrorMessage(error, '我的短剧加载失败')
  } finally {
    libraryLoading.value = false
  }
}

function openLibrarySheet() {
  if (!user.value) {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后查看继续看和追剧' })
    return
  }
  searchSheetOpen.value = false
  detailSheetOpen.value = false
  episodeSheetOpen.value = false
  libraryTab.value = 'history'
  librarySheetOpen.value = true
  void loadLibrary(true)
}

function closeLibrarySheet() {
  librarySheetOpen.value = false
}

async function openVodInShorts(vodId, options = {}) {
  if (!vodId) return
  try {
    const vod = await api.vod(vodId)
    const unit = buildUnitFromVodDetail(vod, options)
    if (!unit) {
      notifyWarning('当前短剧暂无可用线路')
      return
    }
    closeSearchSheet()
    closeLibrarySheet()
    await enterSeriesMode(unit)
  } catch (error) {
    notifyError(apiErrorMessage(error, options?.errorText || '短剧打开失败'))
  }
}

function openLibraryHistory(item) {
  void openVodInShorts(item?.vod?.id, {
    epIndex: item?.epIndex,
    lineId: item?.lineId,
    errorText: '观看记录打开失败',
  })
}

function openLibraryFollow(item) {
  void openVodInShorts(item?.vod?.id, { epIndex: 0, errorText: '追剧打开失败' })
}

function formatLibraryTime(value) {
  if (!value) return '刚刚'
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function historySubText(item) {
  const index = Math.max(0, Number(item?.epIndex) || 0)
  const ep = item?.epName || `第${index + 1}集`
  return `${ep} · ${formatLibraryTime(item?.updatedAt)}`
}

function historyProgressText(item) {
  const progress = Math.floor(Number(item?.progressSec) || 0)
  const duration = Math.floor(Number(item?.durationSec) || 0)
  if (progress <= 0) return ''
  if (duration > 0) return `看到 ${formatTime(progress)} / ${formatTime(duration)}`
  return `看到 ${formatTime(progress)}`
}

function openDetailSheet() {
  if (!activeUnit.value || immersiveMode.value) return
  searchSheetOpen.value = false
  episodeSheetOpen.value = false
  librarySheetOpen.value = false
  detailSheetOpen.value = true
}

async function refreshSiteConfig() {
  try {
    site.value = writeCachedSite(await api.site())
  } catch {}
}

function lockViewportZoom() {
  const tag = document.querySelector('meta[name="viewport"]')
  if (!tag) return
  previousViewportContent = tag.getAttribute('content') || ''
  tag.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover')
  previousBodyOverflow = document.body.style.overflow || ''
  document.body.style.overflow = 'hidden'
  document.addEventListener('gesturestart', preventBrowserZoom, { passive: false })
  document.addEventListener('gesturechange', preventBrowserZoom, { passive: false })
  document.addEventListener('touchmove', preventMultiTouchZoom, { passive: false })
  window.addEventListener('resize', keepActiveCardInView)
}

function restoreViewportZoom() {
  const tag = document.querySelector('meta[name="viewport"]')
  if (tag && previousViewportContent !== null) tag.setAttribute('content', previousViewportContent)
  previousViewportContent = null
  document.body.style.overflow = previousBodyOverflow
  document.removeEventListener('gesturestart', preventBrowserZoom)
  document.removeEventListener('gesturechange', preventBrowserZoom)
  document.removeEventListener('touchmove', preventMultiTouchZoom)
  window.removeEventListener('resize', keepActiveCardInView)
}

function preventBrowserZoom(event) {
  event.preventDefault()
}

function preventMultiTouchZoom(event) {
  if (event.touches?.length > 1) event.preventDefault()
}

function keepActiveCardInView() {
  window.requestAnimationFrame(() => scrollToIndex(activeIndex.value, 'auto'))
}

watch(activeIndex, async () => {
  if (suppressActiveIndexWatch) return
  saveWatchHistory(null, { force: true })
  historySaveAt = 0
  if (feedMode.value === 'series') {
    const unit = activeUnit.value
    if (!unit) return
    scheduleSeriesCommit(unit.epIndex)
    return
  }
  ensureMoreAhead()
  cancelPendingPlayback({ stop: true })
  await nextTick()
  schedulePlayActive(WANDER_PLAY_SETTLE_MS)
})

watch(user, (next) => {
  if (next && accessBlock.value?.retryAfterLogin) schedulePlayActive(0)
  if (next && activeUnit.value?.vod?.id) loadFollowState(activeUnit.value.vod.id)
  if (next && librarySheetOpen.value) void loadLibrary(true)
  if (!next) {
    libraryHistories.value = []
    libraryFollows.value = []
  }
})

onMounted(async () => {
  lockViewportZoom()
  await refreshSiteConfig()
  loadFeed()
})
onBeforeUnmount(() => {
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  clearPlaySettleTimer()
  clearSeriesCommitTimer()
  clearSeriesScrollSettleTimer()
  clearProgressIdleTimer()
  episodeSheetOpen.value = false
  detailSheetOpen.value = false
  searchSheetOpen.value = false
  librarySheetOpen.value = false
  restoreViewportZoom()
  saveWatchHistory(null, { force: true })
  stopPlayback()
})
</script>

<style scoped>
.shorts-page { position: fixed; inset: 0; z-index: 90; overflow: hidden; background: #05060a; color: #fff; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.shorts-bg { position: absolute; inset: 0; background:
  radial-gradient(circle at 50% 16%, rgba(255,94,108,.18), transparent 32%),
  linear-gradient(135deg, #05060a, #0e1017 58%, #05060a); }
.shorts-shell { position: relative; width: min(100vw, 430px); height: 100dvh; margin: 0 auto; overflow: hidden;
  background: #05060a; box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 0 70px rgba(0,0,0,.72); }
.shorts-top { position: absolute; top: 0; left: 0; right: 0; z-index: 9; display: grid; grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center; gap: 10px; padding: calc(12px + env(safe-area-inset-top)) 14px 10px;
  background: linear-gradient(180deg, rgba(0,0,0,.58), rgba(0,0,0,0)); pointer-events: none; }
.shorts-top > * { pointer-events: auto; }
.shorts-top-actions { display: flex; justify-content: flex-end; gap: 8px; min-width: 38px; }
.icon-btn { width: 38px; height: 38px; border: 1px solid rgba(255,255,255,.1); border-radius: 50%; background: rgba(14,16,22,.42);
  color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(12px); }
.icon-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.shorts-title { min-width: 0; text-align: center; line-height: 1.15; }
.shorts-title strong { display: block; font-size: 17px; font-weight: 900; letter-spacing: 0; }
.shorts-title span { display: block; margin-top: 3px; font-size: 11px; color: rgba(255,255,255,.62); }
.shorts-feed { height: 100%; overflow-y: auto; overflow-x: hidden; scroll-snap-type: y mandatory; scroll-behavior: smooth; scrollbar-width: none; overscroll-behavior: contain; }
.shorts-feed.frozen { overflow: hidden; }
.shorts-feed::-webkit-scrollbar { display: none; }
.short-card { position: relative; height: 100dvh; scroll-snap-align: start; scroll-snap-stop: always; overflow: hidden; background: #05060a; }
.short-media { position: absolute; inset: 0; background: #05060a; }
.short-poster-bg { position: absolute; inset: -18px; background-size: cover; background-position: center; filter: blur(28px) brightness(.48) saturate(1.18); transform: scale(1.1); }
.short-poster, .short-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #05060a; transform: translateZ(0); backface-visibility: hidden; }
.short-poster { z-index: 1; }
.short-video { z-index: 2; opacity: 0; transition: opacity .16s ease; }
.short-video.ready { opacity: 1; }
.short-video.landscape { object-fit: contain; }
.short-dim { position: absolute; inset: 0; z-index: 3; pointer-events: none; background:
  linear-gradient(180deg, rgba(0,0,0,.6), transparent 22%, transparent 54%, rgba(0,0,0,.82)),
  linear-gradient(90deg, rgba(0,0,0,.48), transparent 42%, rgba(0,0,0,.24)); }
.immersive-mode .short-dim { background:
  linear-gradient(180deg, rgba(0,0,0,.22), transparent 28%, transparent 72%, rgba(0,0,0,.48)),
  linear-gradient(90deg, rgba(0,0,0,.16), transparent 48%, rgba(0,0,0,.16)); }
.center-state { position: absolute; left: 50%; top: 50%; z-index: 5; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: 9px;
  min-height: 42px; padding: 0 15px; border-radius: 999px; background: rgba(10,12,18,.58); color: #fff; font-size: 13px; font-weight: 800; backdrop-filter: blur(14px); }
.play-state { width: 68px; height: 68px; min-height: 68px; justify-content: center; padding: 0; background: rgba(255,255,255,.2); }
.play-state svg { width: 30px; height: 30px; margin-left: 3px; }
.shorts-spinner { width: 26px; height: 26px; border-radius: 50%; border: 3px solid rgba(255,255,255,.24); border-top-color: #fff; animation: spin .8s linear infinite; }
.shorts-spinner.small { width: 18px; height: 18px; border-width: 2px; }
@keyframes spin { to { transform: rotate(360deg); } }
.short-actions { position: absolute; right: 10px; bottom: calc(128px + env(safe-area-inset-bottom)); z-index: 7; display: flex; flex-direction: column; gap: 14px; align-items: center; }
.short-actions.compact { bottom: calc(58px + env(safe-area-inset-bottom)); gap: 12px; }
.action-btn { width: 54px; border: 0; background: transparent; color: #fff; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 5px; text-shadow: 0 2px 10px rgba(0,0,0,.7); }
.action-btn svg { width: 30px; height: 30px; fill: rgba(255,255,255,.12); stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 4px 10px rgba(0,0,0,.55)); }
.action-btn.on svg { fill: var(--accent); stroke: var(--accent); }
.action-btn.subtle { opacity: .72; }
.action-btn span { font-size: 11px; font-weight: 850; }
.short-meta { position: absolute; left: 16px; right: 16px; bottom: calc(22px + env(safe-area-inset-bottom)); z-index: 6; min-width: 0; }
.short-meta-main { min-width: 0; padding-right: 66px; }
.episode-pill { display: inline-flex; align-items: center; min-height: 26px; padding: 0 10px; border-radius: 999px; background: rgba(255,255,255,.13);
  color: rgba(255,255,255,.88); font-size: 12px; line-height: 1; font-weight: 850; backdrop-filter: blur(10px); }
.short-meta h1 { margin-top: 10px; font-size: 21px; line-height: 1.22; font-weight: 950; letter-spacing: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.short-title { cursor: pointer; outline: none; }
.short-title:focus-visible { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.meta-tags { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.meta-tags span { display: inline-flex; align-items: center; justify-content: center; height: 23px; padding: 0 8px; border-radius: 7px;
  background: rgba(255,255,255,.1); color: rgba(255,255,255,.8); font-size: 11px; line-height: 1; font-weight: 750; backdrop-filter: blur(8px); }
.short-meta p { margin-top: 9px; color: rgba(255,255,255,.78); font-size: 13px; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.short-lock { position: absolute; left: 28px; right: 28px; top: 50%; z-index: 7; transform: translateY(-50%); text-align: center; padding: 24px 18px; border-radius: 18px;
  background: rgba(16,18,26,.68); border: 1px solid rgba(255,255,255,.1); box-shadow: 0 20px 70px rgba(0,0,0,.55); backdrop-filter: blur(22px); }
.lock-icon { width: 52px; height: 52px; margin: 0 auto 13px; border-radius: 50%; background: rgba(255,255,255,.1); display: flex; align-items: center; justify-content: center; }
.lock-icon svg { width: 27px; height: 27px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.short-lock strong { display: block; font-size: 17px; line-height: 1.45; font-weight: 950; }
.short-lock p { margin: 8px 0 16px; color: rgba(255,255,255,.68); font-size: 13px; line-height: 1.6; }
.short-lock-actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
.short-lock button, .shorts-empty button { height: 40px; border: 0; border-radius: 11px; padding: 0 22px; background: var(--btn-primary-bg); color: var(--btn-primary-text); font-weight: 900; cursor: pointer; }
.short-lock .lock-ghost-btn { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.1); color: #fff; }
.watch-full-row { display: flex; justify-content: center; margin-bottom: 8px; padding-right: 0; pointer-events: none; }
.watch-full-btn { display: flex; align-items: center; justify-content: center; width: max-content; height: 31px; padding: 0 13px;
  border: 1px solid rgba(255,255,255,.72); border-radius: 999px; background: rgba(0,0,0,.16); color: #fff;
  font-size: 12px; font-weight: 900; cursor: pointer; backdrop-filter: blur(10px); text-shadow: 0 2px 8px rgba(0,0,0,.42); pointer-events: auto; }
.short-progress { position: absolute; left: 13px; right: 13px; bottom: calc(2px + env(safe-area-inset-bottom)); z-index: 10; display: grid; gap: 0;
  padding: 11px 0 4px; opacity: .56; transition: opacity .16s ease; isolation: isolate; }
.short-progress.active, .short-progress:focus-within { opacity: .98; }
.short-progress::before { content: ""; position: absolute; left: -13px; right: -13px; top: -24px; bottom: calc(-8px - env(safe-area-inset-bottom)); z-index: -1;
  pointer-events: none; background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.18) 38%, rgba(0,0,0,.52)); }
.short-progress input { width: 100%; height: 40px; margin: -17px 0 -14px; appearance: none; -webkit-appearance: none; cursor: pointer; background: transparent; touch-action: none; }
.short-progress input::-webkit-slider-runnable-track { height: 3px; border-radius: 999px; background: linear-gradient(90deg, #fff var(--progress), rgba(255,255,255,.28) var(--progress)); }
.short-progress input::-webkit-slider-thumb { appearance: none; -webkit-appearance: none; width: 13px; height: 13px; margin-top: -5px; border-radius: 50%; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.45); }
.short-progress input::-moz-range-track { height: 3px; border-radius: 999px; background: rgba(255,255,255,.28); }
.short-progress input::-moz-range-progress { height: 3px; border-radius: 999px; background: #fff; }
.short-progress input::-moz-range-thumb { width: 13px; height: 13px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.45); }
.progress-time { display: flex; justify-content: space-between; color: rgba(255,255,255,.76); font-size: 10px; line-height: 1; font-weight: 800;
  opacity: 0; transform: translateY(2px); transition: opacity .16s ease, transform .16s ease; text-shadow: 0 2px 8px rgba(0,0,0,.6); }
.short-progress.active .progress-time, .short-progress:focus-within .progress-time { opacity: 1; transform: translateY(0); }
.episode-mask { position: absolute; inset: 0; z-index: 24; display: flex; align-items: flex-end; background: linear-gradient(180deg, transparent 30%, rgba(0,0,0,.54)); }
.episode-sheet-panel { width: 100%; max-height: min(62dvh, 520px); padding: 18px 16px calc(18px + env(safe-area-inset-bottom)); border-top: 1px solid rgba(255,255,255,.12);
  border-radius: 18px 18px 0 0; background: rgba(12,14,20,.84); box-shadow: 0 -28px 70px rgba(0,0,0,.46); backdrop-filter: blur(22px); }
.detail-sheet-panel, .search-sheet-panel, .library-sheet-panel { width: 100%; max-height: min(76dvh, 620px); padding: 18px 16px calc(18px + env(safe-area-inset-bottom)); border-top: 1px solid rgba(255,255,255,.12);
  border-radius: 18px 18px 0 0; background: rgba(12,14,20,.9); box-shadow: 0 -28px 70px rgba(0,0,0,.5); backdrop-filter: blur(22px); overflow: hidden; }
.episode-sheet-head { display: grid; grid-template-columns: minmax(0, 1fr) 36px; align-items: center; gap: 12px; margin-bottom: 14px; }
.episode-sheet-head strong { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; line-height: 1.25; font-weight: 950; }
.episode-sheet-head span { display: block; margin-top: 4px; color: rgba(255,255,255,.62); font-size: 12px; font-weight: 760; }
.episode-sheet-head button { width: 36px; height: 36px; border: 1px solid rgba(255,255,255,.12); border-radius: 50%; background: rgba(255,255,255,.08); color: #fff; cursor: pointer; }
.episode-sheet-head svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
.episode-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; max-height: calc(min(62dvh, 520px) - 86px); overflow: auto; scrollbar-width: none; }
.episode-grid::-webkit-scrollbar { display: none; }
.episode-grid button { height: 42px; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.84);
  font-size: 12px; font-weight: 850; cursor: pointer; overflow: hidden; }
.episode-grid button.on { border-color: rgba(255,255,255,.76); background: rgba(255,255,255,.22); color: #fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
.episode-grid button span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.1; }
.episode-grid button em { color: rgba(255,255,255,.62); font-size: 10px; line-height: 1; font-style: normal; font-weight: 900; }
.episode-grid button.on em { color: rgba(255,255,255,.86); }
.detail-body { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 13px; align-items: start; }
.detail-body img { width: 92px; aspect-ratio: 3 / 4; border-radius: 10px; object-fit: cover; background: rgba(255,255,255,.08); }
.detail-tags { margin-top: 0; }
.detail-body p { margin-top: 10px; color: rgba(255,255,255,.74); font-size: 13px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
.detail-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 16px; }
.detail-actions button, .short-search-box button { height: 38px; min-width: 0; border: 0; border-radius: 11px; background: var(--btn-primary-bg); color: var(--btn-primary-text); font-weight: 900; cursor: pointer; }
.detail-actions button:nth-child(2) { background: rgba(255,255,255,.1); color: #fff; border: 1px solid rgba(255,255,255,.12); }
.short-search-box { display: grid; grid-template-columns: minmax(0, 1fr) 72px; gap: 9px; margin-bottom: 12px; }
.short-search-box input { height: 40px; min-width: 0; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; background: rgba(255,255,255,.08); color: #fff; padding: 0 12px; outline: none; }
.short-search-box input::placeholder { color: rgba(255,255,255,.42); }
.search-history { margin: -2px 0 12px; display: grid; gap: 8px; }
.search-history-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: rgba(255,255,255,.58); font-size: 11px; font-weight: 850; }
.search-history-head button { border: 0; background: transparent; color: rgba(255,255,255,.48); font-size: 11px; font-weight: 850; cursor: pointer; }
.search-history-list { display: flex; gap: 7px; overflow-x: auto; scrollbar-width: none; }
.search-history-list::-webkit-scrollbar { display: none; }
.search-history-list button { flex: 0 0 auto; max-width: 132px; height: 28px; border: 1px solid rgba(255,255,255,.1); border-radius: 999px; padding: 0 10px;
  background: rgba(255,255,255,.07); color: rgba(255,255,255,.78); font-size: 12px; font-weight: 820; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.short-search-results { display: grid; gap: 8px; max-height: calc(min(76dvh, 620px) - 132px); overflow: auto; scrollbar-width: none; }
.search-sheet-panel.with-history .short-search-results { max-height: calc(min(76dvh, 620px) - 182px); }
.short-search-results::-webkit-scrollbar { display: none; }
.short-search-results button { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 10px; align-items: center; min-width: 0; min-height: 62px; padding: 7px;
  border: 1px solid rgba(255,255,255,.08); border-radius: 12px; background: rgba(255,255,255,.06); color: #fff; text-align: left; cursor: pointer; }
.short-search-results img { width: 48px; height: 48px; border-radius: 9px; object-fit: cover; background: rgba(255,255,255,.08); }
.short-search-results span { min-width: 0; display: grid; gap: 4px; }
.short-search-results b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 1.2; }
.short-search-results em { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(255,255,255,.58); font-size: 11px; line-height: 1.2; font-style: normal; }
.library-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; padding: 3px; border: 1px solid rgba(255,255,255,.1); border-radius: 13px; background: rgba(255,255,255,.06); }
.library-tabs button { min-width: 0; height: 34px; border: 0; border-radius: 10px; background: transparent; color: rgba(255,255,255,.68); font-size: 12px; font-weight: 900; cursor: pointer; }
.library-tabs button.on { background: rgba(255,255,255,.16); color: #fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
.library-tabs span { margin-left: 3px; color: rgba(255,255,255,.5); font-size: 11px; }
.library-list { display: grid; gap: 8px; max-height: calc(min(76dvh, 620px) - 142px); overflow: auto; scrollbar-width: none; }
.library-list::-webkit-scrollbar { display: none; }
.library-item { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 10px; align-items: center; min-width: 0; min-height: 72px; padding: 7px;
  border: 1px solid rgba(255,255,255,.08); border-radius: 12px; background: rgba(255,255,255,.06); color: #fff; text-align: left; cursor: pointer; }
.library-item img { width: 52px; height: 58px; border-radius: 9px; object-fit: cover; background: rgba(255,255,255,.08); }
.library-info { min-width: 0; display: grid; gap: 4px; }
.library-info b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 1.2; }
.library-info em, .library-info i { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(255,255,255,.58); font-size: 11px; line-height: 1.2; font-style: normal; }
.library-info i { color: rgba(255,255,255,.48); }
.library-state { min-height: 148px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; color: rgba(255,255,255,.62); font-size: 13px; font-weight: 800; text-align: center; }
.library-state button { height: 34px; border: 0; border-radius: 10px; padding: 0 16px; background: var(--btn-primary-bg); color: var(--btn-primary-text); font-weight: 900; cursor: pointer; }
.search-state { height: 120px; display: flex; align-items: center; justify-content: center; gap: 9px; color: rgba(255,255,255,.62); font-size: 13px; font-weight: 800; }
.episode-sheet-enter-active, .episode-sheet-leave-active { transition: opacity .18s ease; }
.episode-sheet-enter-active .episode-sheet-panel, .episode-sheet-leave-active .episode-sheet-panel,
.episode-sheet-enter-active .detail-sheet-panel, .episode-sheet-leave-active .detail-sheet-panel,
.episode-sheet-enter-active .search-sheet-panel, .episode-sheet-leave-active .search-sheet-panel,
.episode-sheet-enter-active .library-sheet-panel, .episode-sheet-leave-active .library-sheet-panel { transition: transform .18s ease; }
.episode-sheet-enter-from, .episode-sheet-leave-to { opacity: 0; }
.episode-sheet-enter-from .episode-sheet-panel, .episode-sheet-leave-to .episode-sheet-panel,
.episode-sheet-enter-from .detail-sheet-panel, .episode-sheet-leave-to .detail-sheet-panel,
.episode-sheet-enter-from .search-sheet-panel, .episode-sheet-leave-to .search-sheet-panel,
.episode-sheet-enter-from .library-sheet-panel, .episode-sheet-leave-to .library-sheet-panel { transform: translateY(18px); }
.shorts-loading, .shorts-empty { position: absolute; inset: 0; z-index: 4; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: rgba(255,255,255,.76); }
.shorts-empty strong { color: #fff; font-size: 18px; }
.empty-icon { width: 58px; height: 58px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.08); }
.empty-icon svg { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-width: 2; }
.feed-tail { height: 64px; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,.5); font-size: 12px; }
@media (max-width: 480px) {
  .shorts-shell { width: 100vw; box-shadow: none; }
  .shorts-top { padding-left: 12px; padding-right: 12px; }
  .short-meta { left: 14px; right: 14px; }
  .short-actions { right: 8px; }
}
@media (orientation: landscape) and (max-height: 520px) {
  .shorts-shell { width: min(100vw, calc(100dvh * .5625)); min-width: 220px; box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 0 60px rgba(0,0,0,.76); }
  .shorts-top { padding-top: calc(8px + env(safe-area-inset-top)); }
  .short-actions { bottom: calc(104px + env(safe-area-inset-bottom)); gap: 10px; }
  .short-actions.compact { bottom: calc(52px + env(safe-area-inset-bottom)); }
  .short-card.locked .short-meta { display: none; }
  .short-meta h1 { font-size: 18px; -webkit-line-clamp: 1; }
  .short-meta p { -webkit-line-clamp: 1; }
}
</style>
