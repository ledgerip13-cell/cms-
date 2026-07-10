<template>
  <main class="ms" :class="{ 'full-mode': fullMode, 'clear-mode': clearScreen }" :style="shortsVars">
    <section
      v-if="!disabled && units.length"
      ref="feedEl"
      class="ms-feed"
      :class="{ frozen: filterOpen || episodeDrawerOpen || toolMenuOpen }"
      @scroll.passive="onScroll"
    >
      <article v-for="(unit, index) in displayUnits" :key="unit.key" class="ms-card">
        <div class="ms-bg" :style="posterStyle(unit)"></div>
        <img class="ms-poster" :src="poster(unit)" :alt="unit.vod.name" loading="lazy" @error="hideBrokenImg" />
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

        <div class="ms-top" :class="{ full: fullMode }">
          <template v-if="fullMode">
            <button type="button" aria-label="返回刷剧" @click="exitFullContent">
              <svg viewBox="0 0 24 24" v-html="icon('back')"></svg>
            </button>
            <span class="ms-episode-title">{{ unit.epName || `第${unit.epIndex + 1}集` }}</span>
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
        <button
          v-if="isActiveDisplay(index) && soundPrompt && !accessBlock"
          class="ms-sound"
          type="button"
          aria-label="打开声音"
          @click="openSound"
        >
          <svg viewBox="0 0 24 24" v-html="icon('volume')"></svg>
          <span>轻触开启声音</span>
        </button>

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

        <button
          v-if="isActiveDisplay(index) && fullMode && videoReady && videoLandscape && !clearScreen"
          class="ms-landscape-btn"
          type="button"
          @click="requestFullscreen"
        >全屏观看</button>

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
      <button type="button" aria-label="返回漫游" @click="exitFullContent">
        <svg viewBox="0 0 24 24" v-html="icon('wander')"></svg>
      </button>
    </div>
    <button v-if="fullMode && clearScreen" class="ms-clear-exit" type="button" @click="toggleClearScreen">退出清屏</button>

    <div v-if="filterOpen" class="ms-filter-mask" @click="filterOpen = false"></div>
    <aside v-if="filterOpen" class="ms-filter open">
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

    <div v-if="episodeDrawerOpen" class="ms-drawer-mask" @click="episodeDrawerOpen = false"></div>
    <aside v-if="episodeDrawerOpen && activeUnit" class="ms-episode-drawer">
      <div class="ms-drag"></div>
      <header class="ms-drawer-head">
        <img :src="poster(activeUnit)" :alt="activeUnit.vod.name" @error="hideBrokenImg" />
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
            :class="{ on: episode.index === activeUnit.epIndex }"
            @click="jumpEpisode(episode.index)"
          >
            {{ episode.index + 1 }}
          </button>
        </div>
      </section>
      <section v-else class="ms-drawer-body">
        <div v-if="relatedLoading" class="ms-related-state">加载中</div>
        <div v-else-if="!relatedItems.length" class="ms-related-state">暂无相关推荐</div>
        <div v-else class="ms-related-grid">
          <article v-for="vod in relatedItems" :key="vod.id" @click="openRelated(vod)">
            <img :src="vodPoster(vod)" :alt="vod.name" @error="hideBrokenImg" />
            <strong>{{ vod.name }}</strong>
            <span>{{ vod.typeName || '影片' }}</span>
          </article>
        </div>
      </section>
      <button class="ms-drawer-follow" type="button" :class="{ on: followed }" @click="toggleFollow(activeUnit)">
        {{ followed ? '已追剧' : '追剧' }}
      </button>
    </aside>
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
import { currentUser } from '../userStore'
import { icon } from './icons'

const SHORTS_MUTED_KEY = 'vcms.mobile.shorts.muted'
const SHORTS_SESSION_KEY = 'vcms.mobile.shorts.session.v1'
const SHORTS_SESSION_TTL = 30 * 60 * 1000
const RESOLVE_CACHE_TTL = 20 * 60 * 1000
const RESOLVE_CACHE_LIMIT = 80
const LANDSCAPE_OBJECT_Y = '36%'
const LANDSCAPE_CENTER_RATIO = 0.36
const FULL_SCROLL_SETTLE_MS = 160

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
const videoReady = ref(false)
const accessBlock = ref(null)
const currentSec = ref(0)
const durationSec = ref(0)
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
const relatedItems = ref([])
const relatedLoading = ref(false)

let hls = null
let playSeq = 0
let feedCursor = 0
let feedSeed = Date.now()
let hasMoreFeed = true
let scrollRaf = 0
let activeTimer = 0
let fullCommitTimer = 0
let pendingFullEpIndex = null
let historySaveAt = 0
let playingUnit = null
let pendingUnmute = false
let resizeRaf = 0
let resumeAfterActivate = false
const unitKeys = new Set()
const unitVodIds = new Set()
const resolveCache = new Map()
const resolveInflight = new Map()
const vodDetailCache = new Map()
const playbackLineFailures = new Map()
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
const shortsVars = computed(() => ({
  '--ms-landscape-object-y': LANDSCAPE_OBJECT_Y,
  ...(landscapePlayY.value ? { '--ms-landscape-play-y': landscapePlayY.value } : {}),
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

function hideBrokenImg(event) {
  if (event?.target) event.target.style.visibility = 'hidden'
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
  needsTap.value = false
  paused.value = false
  soundPrompt.value = false
  videoContain.value = true
  videoLandscape.value = false
  videoReady.value = false
  currentSec.value = 0
  durationSec.value = 0
  seekValue.value = 0
  seeking.value = false
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
  applyShortsLineSwitch(nextUnit)
  notifyWarning(`当前线路不可用，已切换到 ${nextUnit.channel.sourceName || '备用线路'}`)
  await nextTick()
  return activeUnit.value?.channel?.id === nextUnit.channel.id ? activeUnit.value : nextUnit
}

async function recoverShortsPlaybackLine(reason = '当前线路播放失败') {
  const unit = activeUnit.value || playingUnit
  if (!unit?.vod?.id || !unit?.channel?.id) return false
  rememberLineFailure(unit)
  const tried = new Set([Number(unit.channel.id)])
  try {
    const nextUnit = await tryNextShortsLine(unit, tried)
    if (!nextUnit) {
      notifyWarning(reason)
      stopVideo()
      return false
    }
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
        await attachVideo(result.url, result.kind || '', seq, unit)
        if (seq !== playSeq) return
        return
      }
      const nextUnit = await tryNextShortsLine(unit, triedLineIds)
      if (seq !== playSeq) return
      if (!nextUnit) {
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
  await nextTick()
  if (seq !== playSeq || activeUnit.value?.key !== attachedUnit.key) return
  const video = getVideo()
  if (!video) return
  video.muted = muted.value
  video.autoplay = true
  video.playsInline = true
  if (hls) hls.destroy()
  hls = null
  if ((kind === 'm3u8' || /\.m3u8(\?|$)/i.test(url)) && Hls.isSupported()) {
    hls = new Hls({ maxBufferLength: 12, maxMaxBufferLength: 20, backBufferLength: 8 })
    const currentHls = hls
    hls.loadSource(url)
    hls.attachMedia(video)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (seq !== playSeq || hls !== currentHls || activeUnit.value?.key !== attachedUnit.key) return
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

function updateLandscapeMetrics(video = getVideo()) {
  const width = Number(video?.videoWidth || 0)
  const height = Number(video?.videoHeight || 0)
  const rect = video?.getBoundingClientRect?.()
  if (!videoLandscape.value || !width || !height || !rect?.width || !rect?.height) {
    landscapePlayY.value = ''
    return
  }
  const renderedHeight = Math.min(rect.height, rect.width * (height / width))
  const freeY = Math.max(0, rect.height - renderedHeight)
  const centerY = freeY * LANDSCAPE_CENTER_RATIO + renderedHeight / 2
  landscapePlayY.value = `${Math.round(centerY)}px`
}

function scheduleLandscapeMetrics() {
  if (resizeRaf) cancelAnimationFrame(resizeRaf)
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0
    updateLandscapeMetrics()
  })
}

function onVideoMeta(event) {
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
      const el = feedEl.value
      if (!el || !activeUnit.value) return
      const raw = el.scrollTop / Math.max(1, el.clientHeight)
      const currentSlot = fullActiveDisplayIndex.value
      if (raw > currentSlot + 0.55) {
        scheduleFullEpisodeCommit((activeUnit.value.epIndex || 0) + 1)
      } else if (raw < currentSlot - 0.55) {
        scheduleFullEpisodeCommit((activeUnit.value.epIndex || 0) - 1)
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

function scheduleFullEpisodeCommit(index) {
  const unit = activeUnit.value
  if (!fullMode.value || !unit?.vod?.id || !unit.channel?.id) return
  const total = Math.max(1, Number(unit.total) || 1)
  const epIndex = Math.max(0, Math.min(total - 1, Number(index) || 0))
  if (epIndex === Number(unit.epIndex || 0)) return
  if (pendingFullEpIndex === epIndex) return
  clearFullCommitTimer()
  pendingFullEpIndex = epIndex
  cancelPendingPlayback({ stop: true })
  saveHistory(true)
  fullCommitTimer = window.setTimeout(() => {
    fullCommitTimer = 0
    const current = activeUnit.value
    if (!fullMode.value || !current?.vod?.id || !current.channel?.id) {
      pendingFullEpIndex = null
      return
    }
    const target = pendingFullEpIndex
    pendingFullEpIndex = null
    if (target === null || target === Number(current.epIndex || 0)) return
    jumpEpisode(target, { fromScroll: true })
  }, FULL_SCROLL_SETTLE_MS)
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
  router.replace({ path: '/m/shorts', query: { ...route.query, mode: 'full' } })
  activeRangeStart.value = Math.floor((Number(unit.epIndex) || 0) / 30) * 30
  nextTick(() => scrollToFullCurrent('auto'))
}

function exitFullContent() {
  clearFullCommitTimer()
  episodeDrawerOpen.value = false
  toolMenuOpen.value = false
  clearScreen.value = false
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
  router.push(`/play/${vod.id}`)
}

function goSearch() {
  router.push('/m/search')
}

function setPlaybackRate(rate) {
  const video = getVideo()
  if (video) video.playbackRate = Number(rate) || 1
  toolMenuOpen.value = false
}

function toggleClearScreen() {
  clearScreen.value = !clearScreen.value
  toolMenuOpen.value = false
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
  if (!user.value || !unit?.vod?.id || !playUrl.value) return
  const video = getVideo()
  const progressSec = Math.floor(Number(video?.currentTime) || currentSec.value || 0)
  if (!force && progressSec < 20) return
  api.saveHistory({
    vodId: unit.vod.id,
    lineId: unit.channel.id,
    epIndex: unit.epIndex,
    epName: unit.epName,
    progressSec,
    durationSec: Math.floor(Number(video?.duration) || durationSec.value || 0),
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
}

function applyFilter() {
  filterOpen.value = false
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

async function refreshForViewerChange() {
  cancelPendingPlayback({ stop: true })
  accessBlock.value = null
  resolveCache.clear()
  resolveInflight.clear()
  vodDetailCache.clear()
  playbackLineFailures.clear()
  await loadSite()
  await loadShortOptions()
  await reload({ force: true })
}

watch(activeIndex, () => {
  saveHistory(true)
  writeShortsSession()
  ensureMoreAhead()
  schedulePlay(80)
  void refreshFollowState()
})

watch(() => route.query.mode, () => {
  toolMenuOpen.value = false
  episodeDrawerOpen.value = false
  clearScreen.value = false
  if (fullMode.value && activeUnit.value) activeRangeStart.value = Math.floor((Number(activeUnit.value.epIndex) || 0) / 30) * 30
  nextTick(() => {
    if (fullMode.value) scrollToFullCurrent('auto')
    else scrollTo(activeIndex.value, 'auto')
    updateLandscapeMetrics()
  })
})

watch(drawerTab, (tab) => {
  if (tab === 'related' && !relatedItems.value.length) void loadRelated()
})

watch(episodeDrawerOpen, (open) => {
  if (open && drawerTab.value === 'related' && !relatedItems.value.length) void loadRelated()
})

watch(viewerKey, () => {
  void refreshForViewerChange()
})

onMounted(async () => {
  window.addEventListener('resize', scheduleLandscapeMetrics)
  await loadSite()
  sortMode.value = config.value.sortMode
  await loadShortOptions()
  await reload()
})

onDeactivated(() => {
  saveHistory(true)
  writeShortsSession()
  cancelPendingPlayback()
  clearFullCommitTimer()
  const video = getVideo()
  resumeAfterActivate = Boolean(video && !video.paused && !accessBlock.value)
  if (video) {
    try { video.pause() } catch {}
  }
})

onActivated(() => {
  nextTick(() => {
    if (fullMode.value) scrollToFullCurrent('auto')
    else scrollTo(activeIndex.value, 'auto')
    updateLandscapeMetrics()
    if (resumeAfterActivate && playUrl.value && !accessBlock.value) schedulePlay(80)
    resumeAfterActivate = false
  })
})

onBeforeUnmount(() => {
  saveHistory(true)
  writeShortsSession()
  cancelPendingPlayback()
  clearFullCommitTimer()
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
  height: calc(100dvh - 56px - env(safe-area-inset-bottom));
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
}
.ms-poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ms-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  background: #000;
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
.ms-sound {
  position: absolute;
  z-index: 12;
  left: 50%;
  bottom: calc(172px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
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
  font-weight: 900;
  box-shadow: 0 14px 34px rgba(0, 0, 0, .28);
}
.ms-sound svg {
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
.ms-top {
  position: absolute;
  z-index: 8;
  top: calc(env(safe-area-inset-top) + 10px);
  left: 14px;
  right: 14px;
  display: flex;
  justify-content: space-between;
}
.ms-top.full {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}
.ms-top.full .ms-top-right {
  display: flex;
  gap: 8px;
}
.ms-episode-title {
  min-width: 0;
  color: rgba(255,255,255,.94);
  font-size: 15px;
  font-weight: 900;
  text-shadow: 0 2px 12px rgba(0,0,0,.62);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ms-top button,
.ms-play,
.ms-actions button,
.ms-filter-head button {
  border: 0;
  color: inherit;
  background: transparent;
}
.ms-top button {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, .28);
  backdrop-filter: blur(12px);
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease;
}
.ms-top svg,
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
  font-weight: 800;
  text-align: left;
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease;
}
.ms-tool-menu button:hover {
  background: rgba(255,255,255,.1);
}
.ms-landscape-btn {
  position: absolute;
  z-index: 14;
  left: 50%;
  bottom: calc(190px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  height: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 16px;
  background: rgba(255,255,255,.18);
  color: #fff;
  font-weight: 900;
  backdrop-filter: blur(14px);
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease;
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
  width: 70px;
  height: 70px;
  margin: -35px 0 0 -35px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(0,0,0,.34);
  backdrop-filter: blur(14px);
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease;
}
.ms-play.landscape {
  top: var(--ms-landscape-play-y, 50%);
}
.ms-play svg {
  width: 34px;
  height: 34px;
  fill: currentColor;
  stroke: none;
  margin-left: 4px;
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
  bottom: calc(158px + env(safe-area-inset-bottom));
  display: grid;
  gap: 16px;
}
.ms-actions button {
  min-width: 46px;
  display: grid;
  justify-items: center;
  gap: 5px;
  color: rgba(255,255,255,.94);
  font-size: 11px;
  font-weight: 800;
  text-shadow: 0 2px 8px rgba(0,0,0,.45);
  touch-action: manipulation;
  transition: transform .16s ease, color .16s ease;
}
.ms-actions svg {
  width: 30px;
  height: 30px;
  padding: 8px;
  border-radius: 50%;
  background: rgba(0,0,0,.24);
  backdrop-filter: blur(10px);
}
.ms-actions button.on {
  color: #ff5747;
}
.ms-meta {
  position: absolute;
  z-index: 9;
  left: 16px;
  right: 78px;
  bottom: calc(144px + env(safe-area-inset-bottom));
}
.full-mode .ms-meta {
  bottom: calc(24px + env(safe-area-inset-bottom));
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
  font-weight: 700;
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
  bottom: calc(62px + env(safe-area-inset-bottom));
}
.ms-roam-card {
  position: relative;
  width: 100%;
  min-width: 0;
  height: 54px;
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
  font-weight: 950;
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
.ms-landscape-btn:active,
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
  top: 0;
  bottom: auto;
  height: calc(8px + env(safe-area-inset-top));
  align-items: flex-end;
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
  bottom: 0;
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
  height: calc(72px + env(safe-area-inset-bottom));
  padding: 10px 14px calc(12px + env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px;
  gap: 10px;
  background: linear-gradient(180deg, rgba(5,5,5,.08), #050505 22%);
}
.ms-full-bottom button {
  min-width: 0;
  border: 0;
  border-radius: 999px;
  background: #101012;
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
.ms-full-bottom button span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ms-full-bottom button:last-child {
  border-radius: 50%;
  background: rgba(255,255,255,.12);
  backdrop-filter: blur(14px);
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
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(255,255,255,.16);
  color: #fff;
  font-weight: 900;
  backdrop-filter: blur(14px);
}
.clear-mode .ms-top,
.clear-mode .ms-actions,
.clear-mode .ms-meta,
.clear-mode .ms-progress,
.clear-mode .ms-full-bottom,
.clear-mode .ms-roam-bottom,
.clear-mode .ms-landscape-btn,
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
  transform: translateY(105%);
  transition: transform .22s ease;
  overflow-y: auto;
  box-shadow: 0 -18px 48px rgba(0,0,0,.28);
}
.ms-filter.open {
  transform: translateY(0);
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
  font-weight: 900;
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
  font-weight: 800;
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
  font-weight: 900;
}
.ms-filter-actions {
  position: sticky;
  bottom: 0;
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 10px;
  padding-top: 12px;
  background: linear-gradient(180deg, rgba(255,255,255,0), #fff 22%);
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
  font-weight: 800;
}
.ms-drawer-head span {
  color: #8a9099;
  font-size: 12px;
  font-weight: 700;
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
  min-width: 0;
  height: 38px;
  border: 0;
  border-radius: 10px;
  background: #f3f4f6;
  color: #303641;
  font-size: 13px;
  font-weight: 900;
  touch-action: manipulation;
  transition: transform .16s ease, background .16s ease, color .16s ease;
}
.ms-episode-grid button.on {
  background: linear-gradient(120deg, #ff4d3d, #ff7a38);
  color: #fff;
}
.ms-related-state {
  min-height: 120px;
  display: grid;
  place-items: center;
  color: #858c96;
  font-size: 13px;
  font-weight: 800;
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
  display: -webkit-box;
  margin-top: 6px;
  color: #252a33;
  font-size: 12px;
  line-height: 1.28;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
