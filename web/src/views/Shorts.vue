<template>
  <div
    class="shorts-page"
    :class="{
      'immersive-mode': immersiveMode,
      'portrait-locked': portraitLockVisible,
      'landscape-theater-mode': landscapeTheaterMode,
      'theater-rotated': landscapeTheaterMode && viewportPortrait,
    }"
  >
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
        :class="{ frozen: layerOpen, 'series-feed': feedMode === 'series' }"
        @scroll.passive="onFeedScroll"
      >
        <article
          v-for="(unit, i) in units"
          :key="unit.key"
          class="short-card"
          :class="{ locked: i === activeIndex && accessBlock, theater: i === activeIndex && landscapeTheaterMode }"
        >
          <div class="short-media" @click="i === activeIndex && onMediaClick()">
            <div class="short-poster-bg" :style="posterStyle(unit)"></div>
            <img class="short-poster" :src="poster(unit)" :alt="unit.vod.name" loading="lazy" @error="onImgError($event, fallbackPoster(unit))" />
            <video
              v-if="i === activeIndex && playingKey === unit.key && playUrl && !accessBlock"
              ref="videoEl"
              class="short-video"
              :class="{contain: videoContain, portrait: !videoContain, ready: videoReady}"
              autoplay
              playsinline
              webkit-playsinline
              :muted="muted"
              @loadedmetadata="onVideoMeta"
              @loadeddata="onVideoResize"
              @resize="onVideoResize"
              @canplay="onVideoCanPlay"
              @pause="onVideoPauseEvent"
              @playing="onVideoPlayingEvent"
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
              :class="{ active: seeking || progressActive, 'controls-hidden': landscapeTheaterMode && !theaterControlsVisible }"
              @click.stop="seekFromProgressClick"
            >
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
                @input.stop="onSeekInput"
                @change.stop="commitSeek"
              />
              <div class="progress-time">
                <span>{{ formatTime(currentSec) }}</span>
                <span>{{ formatTime(durationSec) }}</span>
              </div>
            </div>

            <div v-if="i === activeIndex && landscapeTheaterMode && !accessBlock" class="theater-controls" :class="{ 'controls-hidden': !theaterControlsVisible }" @click.stop="showTheaterControls">
              <div class="theater-topbar">
                <button class="theater-icon-btn" type="button" aria-label="退出横屏" @click="exitLandscapeTheater">
                  <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <div class="theater-now">
                  <strong>{{ unit.vod.name }}</strong>
                  <span>{{ unit.epName }} · {{ currentEpisodeNumber }}/{{ currentEpisodeTotal }}</span>
                </div>
                <div class="theater-top-actions">
                  <button class="theater-icon-btn" type="button" :aria-label="muted ? '开声' : '静音'" @click="toggleMute">
                    <svg v-if="muted" viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M18 9l3 3-3 3M21 9l-3 3 3 3"/></svg>
                    <svg v-else viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/></svg>
                  </button>
                  <button class="theater-icon-btn" type="button" aria-label="选集" :disabled="feedMode !== 'series'" @click="openEpisodeSheet">
                    <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8M8 13h5"/></svg>
                  </button>
                </div>
              </div>
              <div class="theater-center-controls">
                <button class="theater-skip-btn" type="button" aria-label="上一集" :disabled="!canGoPreviousTheater" @click="previousTheaterEpisode">
                  <svg viewBox="0 0 24 24"><path d="M6 5v14"/><path d="M18 6l-8 6 8 6z"/></svg>
                </button>
                <button class="theater-play-btn" type="button" :aria-label="paused ? '播放' : '暂停'" @click="togglePause">
                  <svg v-if="paused" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  <svg v-else viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>
                </button>
                <button class="theater-skip-btn" type="button" aria-label="下一集" :disabled="!canGoNextTheater" @click="nextTheaterEpisode">
                  <svg viewBox="0 0 24 24"><path d="M18 5v14"/><path d="M6 6l8 6-8 6z"/></svg>
                </button>
              </div>
            </div>
          </div>

          <aside v-if="i === activeIndex && !accessBlock && !landscapeTheaterMode" class="short-actions" :class="{ compact: immersiveMode }">
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

          <div v-if="i === activeIndex && !immersiveMode && !landscapeTheaterMode" class="short-meta">
            <div v-if="feedMode === 'wander' || videoLandscape" class="watch-full-row">
              <button v-if="feedMode === 'wander'" class="watch-full-btn" type="button" @click="enterSeriesMode(unit)">观看全集</button>
              <button
                v-if="videoLandscape && playingKey === unit.key && playUrl"
                class="watch-full-btn landscape-full-btn"
                type="button"
                @click.stop="enterLandscapeTheater"
              >横屏观看</button>
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

      <div v-if="portraitLockVisible" class="portrait-lock-mask">
        <div class="rotate-icon">
          <svg viewBox="0 0 24 24"><path d="M7 4h7a4 4 0 0 1 4 4v1"/><path d="M20 7l-2-2-2 2"/><rect x="6" y="9" width="12" height="9" rx="2"/><path d="M10 21h4"/></svg>
        </div>
        <strong>竖屏观看短剧</strong>
        <span>{{ canEnterLandscapeTheater ? '当前为横屏片源，可直接进入站内横屏观看' : '短剧流保持竖屏，转回竖屏后继续播放' }}</span>
        <button v-if="canEnterLandscapeTheater" type="button" @click.stop="enterLandscapeTheater">进入横屏观看</button>
      </div>

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
                <em v-if="item.index === currentSeriesEpIndex">{{ item.resumeText ? `播放中 · ${item.resumeText}` : '播放中' }}</em>
                <em v-else-if="item.resumeText">{{ item.resumeText }}</em>
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
const SERIES_WINDOW_RADIUS = 3
const SERIES_PLAY_SETTLE_MS = 240
const SERIES_SCROLL_SETTLE_MS = 90
const SERIES_SNAP_EPSILON = 0.03
const WANDER_PLAY_SETTLE_MS = 120
const SCROLL_SUPPRESS_MS = 260
const INSTANT_SCROLL_SUPPRESS_MS = 120
const SMOOTH_SCROLL_SUPPRESS_MS = 520
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
const videoContain = ref(true)
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
const viewportLandscape = ref(false)
const viewportPortrait = ref(true)
const theaterControlsVisible = ref(true)
let theaterControlsTimer = 0
const landscapeTheaterMode = ref(false)
const followState = reactive({})
const vodHistoryState = reactive({})

const unitKeys = new Set()
const unitVodIds = new Set()
const resolveCache = new Map()
const resolveInflight = new Map()
const vodDetailCache = new Map()
const playbackLineFailures = new Map()
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
let portraitLockIndex = -1
let pendingUnmute = false
let resumeAfterEpisodeSheet = false
let playingUnit = null
let progressIdleTimer = 0
let playSettleTimer = 0
let seriesCommitTimer = 0
let seriesScrollSettleTimer = 0
let seriesPlayFallbackTimer = 0
let ignoreScrollUntil = 0
let lastSavedHistoryKey = ''
let lastSavedHistoryAt = 0
let restoringShortsRoute = false
let pendingResumeSeek = null
let orientationQuery = null
let portraitQuery = null

const user = currentUser
const activeUnit = computed(() => units.value[activeIndex.value] || null)
const shortsConfig = computed(() => normalizeShortsConfig(site.value?.shortsConfig))
const shortsDisabled = computed(() => shortsConfig.value.enabled === false)
const feedBatchSize = computed(() => Math.max(4, Math.min(20, Number(shortsConfig.value.feedLimit) || 10)))
const layerOpen = computed(() => episodeSheetOpen.value || detailSheetOpen.value || searchSheetOpen.value || librarySheetOpen.value)
const portraitLockVisible = computed(() => viewportLandscape.value && !landscapeTheaterMode.value)
const canEnterLandscapeTheater = computed(() => {
  const unit = activeUnit.value
  return Boolean(unit && videoLandscape.value && playingKey.value === unit.key && playUrl.value && !accessBlock.value)
})
const canGoPreviousTheater = computed(() => feedMode.value === 'series' && currentSeriesEpIndex.value > 0)
const canGoNextTheater = computed(() => feedMode.value === 'series' && currentSeriesEpIndex.value < currentEpisodeTotal.value - 1)
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
      resumeText: '',
    }))
  }
  const history = normalizeHistoryRecord(state.history)
  return state.episodes.map((ep, index) => ({
    key: `ep:${state.baseUnit?.vod?.id || 'v'}:${state.baseUnit?.channel?.id || 'p'}:${index}`,
    index,
    name: ep?.name || `第${index + 1}集`,
    resumeText: episodeResumeText(history, index),
  }))
})
const progressPercent = computed(() => {
  if (!durationSec.value) return 0
  return Math.max(0, Math.min(100, (currentSec.value / durationSec.value) * 100))
})

function shortsPreferredTypes(config = shortsConfig.value) {
  const rows = Array.isArray(config?.preferredTypes) ? config.preferredTypes : []
  return [...new Set(rows.map(item => String(item || '').trim()).filter(Boolean))]
}

function shortsPreferredSubtypes(config = shortsConfig.value) {
  const rows = Array.isArray(config?.preferredSubtypes) ? config.preferredSubtypes : []
  const seen = new Set()
  const out = []
  for (const item of rows) {
    const type = String(item?.type || '').trim()
    const name = String(item?.name || item?.subType || item?.sub || '').trim()
    const key = `${type}::${name}`
    if (!type || !name || seen.has(key)) continue
    seen.add(key)
    out.push({ type, name })
  }
  return out
}

function shortsScopeParams(config = shortsConfig.value) {
  const types = shortsPreferredTypes(config)
  const subtypes = shortsPreferredSubtypes(config)
  if (types.length || subtypes.length) {
    return {
      ...(types.length ? { types: types.join(',') } : {}),
      ...(subtypes.length ? { subs: JSON.stringify(subtypes) } : {}),
    }
  }
  return { type: config.defaultType }
}

function vodInShortsScope(vod, config = shortsConfig.value) {
  if (!vod) return false
  const types = shortsPreferredTypes(config)
  const subtypes = shortsPreferredSubtypes(config)
  if (!types.length && !subtypes.length) return !config.defaultType || vod.typeName === config.defaultType
  if (types.includes(vod.typeName)) return true
  return subtypes.some(item => item.type === vod.typeName && item.name === vod.subType)
}

function goBack() {
  if (landscapeTheaterMode.value) {
    exitLandscapeTheater()
    return
  }
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

function normalizeHistoryRecord(item) {
  if (!item) return null
  const epIndex = Math.max(0, Number(item.epIndex) || 0)
  const progressSec = Math.max(0, Math.floor(Number(item.progressSec) || 0))
  const durationSec = Math.max(0, Math.floor(Number(item.durationSec) || 0))
  const lineId = Number(item.lineId) || 0
  return {
    id: item.id,
    vodId: Number(item.vodId || item.vod?.id) || 0,
    lineId,
    epIndex,
    epName: item.epName || `第${epIndex + 1}集`,
    progressSec,
    durationSec,
    updatedAt: item.updatedAt || null,
  }
}

function historyFromOptions(options = {}) {
  if (options.history) return normalizeHistoryRecord(options.history)
  const hasProgress = options.resumeProgressSec !== undefined || options.resumeDurationSec !== undefined || options.resumeUpdatedAt
  if (!hasProgress) return null
  return normalizeHistoryRecord({
    lineId: options.lineId,
    epIndex: options.epIndex,
    epName: options.resumeEpName,
    progressSec: options.resumeProgressSec,
    durationSec: options.resumeDurationSec,
    updatedAt: options.resumeUpdatedAt,
  })
}

function episodeResumeText(history, index) {
  if (!history || history.epIndex !== index || history.progressSec < HISTORY_MIN_PROGRESS_SEC) return ''
  return `上次 ${formatTime(history.progressSec)}`
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
  const unit = buildUnit({
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
  unit.resumeHistory = normalizeHistoryRecord(options.resumeHistory)
  return unit
}

function buildUnitFromVodDetail(vod, options = {}) {
  const preferredLineId = Number(options?.lineId)
  const candidates = vodLineCandidates(vod)
  const playable = playableLineCandidates(vod, options?.epIndex)
  const preferred = preferredLineId ? playable.find(item => item.id === preferredLineId) : null
  const fallbackPreferred = preferredLineId ? candidates.find(item => item.id === preferredLineId) : null
  const channel = preferred || playable[0] || fallbackPreferred || candidates[0]
  return buildUnitFromChannel(vod, channel, options)
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
  const history = normalizeHistoryRecord(state.history)
  const resumeHistory = history?.epIndex === epIndex ? history : null
  return {
    ...base,
    key: `series:${base.vod.id}:${base.channel.id}:${epIndex}`,
    epIndex,
    epName: ep.name || `第${epIndex + 1}集`,
    total,
    resumeHistory,
  }
}

function buildSeriesWindow(epIndex) {
  const state = seriesState.value
  const total = Math.max(1, Number(state?.total) || state?.episodes?.length || 1)
  const current = clampIndex(epIndex, total)
  const size = Math.min(SERIES_WINDOW_RADIUS * 2 + 1, total)
  const start = Math.max(0, Math.min(current - SERIES_WINDOW_RADIUS, total - size))
  return Array.from({ length: size }, (_, offset) => buildSeriesUnit(start + offset)).filter(Boolean)
}

async function showSeriesEpisode(index, options = {}) {
  const state = seriesState.value
  if (!state) return
  clearSeriesScrollSettleTimer()
  clearSeriesPlayFallbackTimer()
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
  syncShortsRoute()
  units.value = nextUnits
  activeIndex.value = nextActive
  await nextTick()
  scrollToIndex(nextActive, options.behavior || 'auto', { suppress: true })
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
  if (!vodId || !user.value) return null
  if (followState[vodId] !== undefined && vodHistoryState[vodId] !== undefined) {
    return { followed: followState[vodId], history: vodHistoryState[vodId] }
  }
  try {
    const state = await api.userVodState(vodId)
    followState[vodId] = Boolean(state.followed)
    vodHistoryState[vodId] = normalizeHistoryRecord(state.history)
    return state
  } catch {
    followState[vodId] = false
    vodHistoryState[vodId] = null
    return null
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
        ...shortsScopeParams(),
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
  clearSeriesPlayFallbackTimer()
  cancelPendingPlayback({ stop: true })
  try {
    if (shortsDisabled.value) {
      units.value = []
      return
    }
    landscapeTheaterMode.value = false
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
  scrollToIndex(0, 'auto', { suppress: true })
  ensureMoreAhead()
  schedulePlayActive(WANDER_PLAY_SETTLE_MS)
}

function onFeedScroll() {
  if (landscapeTheaterMode.value || portraitLockVisible.value) return
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    if (suppressActiveIndexWatch || Date.now() < ignoreScrollUntil) return
    if (landscapeTheaterMode.value || portraitLockVisible.value) return
    const el = feedEl.value
    if (!el) return
    const h = Math.max(1, el.clientHeight)
    const raw = el.scrollTop / h
    const next = Math.max(0, Math.min(units.value.length - 1, Math.round(raw)))
    if (feedMode.value === 'series') {
      const distance = Math.abs(raw - next)
      if (distance > SERIES_SNAP_EPSILON) {
        scheduleSeriesScrollSettle()
        scheduleSeriesPlayFallback()
        return
      }
      clearSeriesScrollSettleTimer()
      scheduleSeriesPlayFallback()
    }
    if (next !== activeIndex.value) activeIndex.value = next
    else if (feedMode.value === 'series') scheduleSeriesPlayFallback()
  })
}

function scrollToIndex(index, behavior = 'smooth', options = {}) {
  const el = feedEl.value
  if (!el) return
  const next = Math.max(0, Math.min(units.value.length - 1, index))
  if (options.suppress) {
    clearSeriesScrollSettleTimer()
    const duration = behavior === 'smooth' ? SMOOTH_SCROLL_SUPPRESS_MS : INSTANT_SCROLL_SUPPRESS_MS
    ignoreScrollUntil = Math.max(ignoreScrollUntil, Date.now() + duration)
  }
  const previousScrollBehavior = el.style.scrollBehavior
  if (behavior !== 'smooth') el.style.scrollBehavior = 'auto'
  el.scrollTo({ top: next * el.clientHeight, behavior })
  if (behavior !== 'smooth') {
    window.requestAnimationFrame(() => {
      if (feedEl.value === el) el.style.scrollBehavior = previousScrollBehavior
    })
  }
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
  prefetchUnitPlayback(next)
}

// 预解析下一集播放地址（结果进 resolveCache LRU）+ 预热 m3u8 manifest 的 HTTP 缓存，
// 切集时省掉解析往返与 manifest 拉取。fire-and-forget，失败静默。
const warmedManifests = new Set()
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
  if (!unit?.vod?.id || !unit?.channel?.id) return
  if (accessBlock.value) return
  void resolveUnitPlayback(unit)
    .then((result) => {
      if (result?.ok && result.url) warmupManifest(result.url, result.kind || '')
    })
    .catch(() => {})
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
  pendingResumeSeek = null
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
  videoContain.value = true
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

function clearSeriesPlayFallbackTimer() {
  if (seriesPlayFallbackTimer) {
    window.clearTimeout(seriesPlayFallbackTimer)
    seriesPlayFallbackTimer = 0
  }
}

function cancelPendingPlayback(options = {}) {
  clearPlaySettleTimer()
  playSeq += 1
  resolving.value = false
  if (options.stop) stopPlayback()
}

function findSeriesUnitIndex(epIndex) {
  return units.value.findIndex(unit => Number(unit?.epIndex) === Number(epIndex))
}

function needsSeriesWindowRebase(epIndex) {
  const state = seriesState.value
  if (!state) return false
  const total = Math.max(1, Number(state.total) || state.episodes.length || 1)
  if (units.value.length >= total) return false
  const index = findSeriesUnitIndex(epIndex)
  return index < 0 || index <= 1 || index >= units.value.length - 2
}

function shortsQuerySignature(query) {
  return ['mode', 'vodId', 'lineId', 'ep']
    .map(key => `${key}:${query?.[key] ?? ''}`)
    .join('|')
}

function replaceShortsQuery(nextQuery) {
  if (restoringShortsRoute) return
  if (shortsQuerySignature(route.query) === shortsQuerySignature(nextQuery)) return
  router.replace({ path: route.path || '/shorts', query: nextQuery }).catch(() => {})
}

function syncShortsRoute(options = {}) {
  const query = { ...route.query }
  if (options.clear || feedMode.value !== 'series' || !seriesState.value?.baseUnit) {
    delete query.mode
    delete query.vodId
    delete query.lineId
    delete query.ep
    replaceShortsQuery(query)
    return
  }
  const state = seriesState.value
  query.mode = 'series'
  query.vodId = String(state.baseUnit.vod.id)
  query.lineId = String(state.baseUnit.channel.id)
  query.ep = String(clampIndex(state.epIndex, state.total))
  replaceShortsQuery(query)
}

function parseShortsRouteTarget() {
  if (route.query?.mode !== 'series' || !route.query?.vodId) return null
  const vodId = Number(route.query.vodId)
  if (!Number.isFinite(vodId) || vodId <= 0) return null
  return {
    vodId,
    lineId: Number(route.query.lineId) || undefined,
    epIndex: Number(route.query.ep) || 0,
  }
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
  clearSeriesPlayFallbackTimer()
  clearSeriesCommitTimer()
  cancelPendingPlayback({ stop: true })
  historySaveAt = 0
  state.epIndex = targetEp
  syncShortsRoute()
  seriesCommitTimer = window.setTimeout(async () => {
    seriesCommitTimer = 0
    if (feedMode.value !== 'series' || !seriesState.value) return
    if (currentSeriesEpIndex.value !== targetEp) return
    if (needsSeriesWindowRebase(targetEp)) {
      await showSeriesEpisode(targetEp, { behavior: 'auto', play: false })
      if (feedMode.value !== 'series' || currentSeriesEpIndex.value !== targetEp) return
    }
    schedulePlayActive(0)
  }, SERIES_PLAY_SETTLE_MS)
}

function ensureSeriesPlaybackAfterScroll() {
  if (feedMode.value !== 'series' || layerOpen.value || seeking.value || suppressActiveIndexWatch) return
  const unit = activeUnit.value
  if (!unit) return
  if (currentSeriesEpIndex.value !== unit.epIndex) {
    scheduleSeriesCommit(unit.epIndex)
    return
  }
  if (resolving.value) return
  if (playingKey.value !== unit.key || !playUrl.value) {
    schedulePlayActive(0)
    return
  }
  const video = getVideo()
  if (video && video.paused && !paused.value && !needsTap.value && !accessBlock.value) {
    void playNow({ mutedFallback: true })
  }
}

function scheduleSeriesPlayFallback() {
  if (feedMode.value !== 'series') return
  clearSeriesPlayFallbackTimer()
  seriesPlayFallbackTimer = window.setTimeout(() => {
    seriesPlayFallbackTimer = 0
    if (Date.now() < ignoreScrollUntil) {
      scheduleSeriesPlayFallback()
      return
    }
    commitSettledSeriesScroll()
    window.setTimeout(ensureSeriesPlaybackAfterScroll, 0)
  }, SERIES_PLAY_SETTLE_MS + SERIES_SCROLL_SETTLE_MS)
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
  if (landscapeTheaterMode.value || portraitLockVisible.value) return
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

function applyShortsLineSwitch(unit) {
  if (!unit?.vod?.id || !unit?.channel?.id) return false
  const state = seriesState.value
  if (feedMode.value === 'series' && state?.baseUnit?.vod?.id === unit.vod.id) {
    const episodes = Array.isArray(unit.channel.episodes) ? unit.channel.episodes : []
    const total = episodes.length || unit.total || 1
    state.baseUnit = {
      ...unit,
      key: `${unit.vod.id}:${unit.channel.id}:base`,
      epIndex: 0,
      epName: episodes[0]?.name || '第1集',
      total,
    }
    state.episodes = episodes
    state.total = total
    state.epIndex = clampIndex(unit.epIndex || 0, total)
    units.value = buildSeriesWindow(state.epIndex)
    const nextIndex = findSeriesUnitIndex(state.epIndex)
    activeIndex.value = nextIndex >= 0 ? nextIndex : 0
    syncShortsRoute()
    return true
  }
  const index = activeIndex.value
  if (units.value[index]?.vod?.id === unit.vod.id) {
    units.value.splice(index, 1, unit)
    return true
  }
  return false
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

async function tryNextShortsLine(unit, triedLineIds = new Set()) {
  if (!unit?.vod?.id) return null
  const detail = await loadVodPlaybackDetail(unit.vod.id)
  const failedLineIds = failedLinesForUnit(unit)
  const candidates = playableLineCandidates(detail, unit.epIndex)
  const next = candidates.find(channel => !triedLineIds.has(Number(channel.id)) && !failedLineIds.has(Number(channel.id)))
  if (!next) return null
  const nextUnit = buildUnitFromChannel(detail, next, {
    epIndex: unit.epIndex,
    resumeHistory: unit.resumeHistory,
  })
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
      stopPlayback()
      return false
    }
    schedulePlayActive(0)
    return true
  } catch {
    notifyWarning(reason)
    stopPlayback()
    return false
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

function buildResumeSeek(unit) {
  const history = normalizeHistoryRecord(unit?.resumeHistory)
  if (!history || history.epIndex !== unit?.epIndex || history.progressSec < HISTORY_MIN_PROGRESS_SEC) return null
  return {
    key: unit.key,
    progressSec: history.progressSec,
  }
}

function applyPendingResumeSeek(video) {
  const pending = pendingResumeSeek
  if (!pending || !video || pending.key !== playingKey.value) return
  const duration = Number(video.duration) || 0
  const maxTarget = duration > 8 ? duration - 6 : duration
  const target = Math.max(0, Math.min(pending.progressSec, maxTarget || pending.progressSec))
  if (target < HISTORY_MIN_PROGRESS_SEC) {
    pendingResumeSeek = null
    return
  }
  try {
    video.currentTime = target
    currentSec.value = Math.floor(target)
    seekValue.value = duration ? Math.round((target / duration) * 1000) : seekValue.value
    pendingResumeSeek = null
  } catch {}
}

async function playActive() {
  let unit = activeUnit.value
  const seq = ++playSeq
  stopPlayback()
  historySaveAt = 0
  accessBlock.value = null
  playingUnit = unit || null
  pendingResumeSeek = buildResumeSeek(unit)
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
        await attachVideo(result.url, result.kind || '')
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
      pendingResumeSeek = buildResumeSeek(unit)
    }
  } catch (error) {
    if (seq === playSeq) notifyError(apiErrorMessage(error, '播放解析失败'))
  } finally {
    if (seq === playSeq) resolving.value = false
  }
}

async function attachVideo(url, kind) {
  const attachedUnit = activeUnit.value
  playingKey.value = activeUnit.value?.key || ''
  videoReady.value = false
  playUrl.value = url
  await nextTick()
  const video = getVideo()
  if (!video) return
  video.muted = muted.value
  video.autoplay = true
  video.playsInline = true
  if (video.readyState >= 1) {
    updateVideoFit(video)
    applyPendingResumeSeek(video)
  }
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
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        clearLineFailures(attachedUnit)
        playNow({ mutedFallback: true })
      })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data?.fatal || !hls) return
        void recoverShortsPlaybackLine('当前线路播放失败，已暂停')
      })
      return
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = url
  } else {
    video.src = url
  }
  clearLineFailures(attachedUnit)
  playNow({ mutedFallback: true })
}

function markNeedsTap() {
  needsTap.value = true
  paused.value = true
}

async function playNow(options = {}) {
  const video = getVideo()
  if (!video) return
  const desiredMuted = muted.value
  video.muted = desiredMuted
  try {
    await video.play()
    if (!desiredMuted) pendingUnmute = false
    needsTap.value = false
    paused.value = false
    return true
  } catch {}
  if (options.mutedFallback !== false && !desiredMuted) {
    try {
      video.muted = true
      await video.play()
      // 静音 autoplay 成功后不能立即 unmute：无手势 unmute 会被 Chrome/Safari 策略性暂停。
      // 保持静音继续播，等下一次用户手势（togglePause）再恢复声音。
      pendingUnmute = true
      needsTap.value = false
      paused.value = false
      return true
    } catch {
      video.muted = desiredMuted
    }
  }
  markNeedsTap()
  return false
}

function togglePause() {
  const video = getVideo()
  if (!video || resolving.value || accessBlock.value) return
  // 用户手势入口：补回因 autoplay 策略暂时降级的声音
  if (pendingUnmute) {
    pendingUnmute = false
    if (!muted.value) video.muted = false
  }
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
  if (landscapeTheaterMode.value) {
    // 剧场模式：点画面切换控件显隐，播放/暂停交给中央按钮
    if (theaterControlsVisible.value) hideTheaterControls()
    else showTheaterControls()
    return
  }
  togglePause()
}

function clearTheaterControlsTimer() {
  if (theaterControlsTimer) {
    window.clearTimeout(theaterControlsTimer)
    theaterControlsTimer = 0
  }
}

function hideTheaterControls() {
  clearTheaterControlsTimer()
  if (paused.value || seeking.value) return
  theaterControlsVisible.value = false
}

function showTheaterControls() {
  clearTheaterControlsTimer()
  theaterControlsVisible.value = true
  if (!landscapeTheaterMode.value) return
  theaterControlsTimer = window.setTimeout(() => {
    theaterControlsTimer = 0
    if (paused.value || seeking.value) {
      showTheaterControls()
      return
    }
    theaterControlsVisible.value = false
  }, 3000)
}

function toggleMute() {
  muted.value = !muted.value
  writeMutedPreference(muted.value)
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
}

function onVideoMeta(event) {
  const video = event.target
  updateVideoFit(video)
  durationSec.value = Math.floor(Number(video.duration) || 0)
  applyPendingResumeSeek(video)
  currentSec.value = Math.floor(Number(video.currentTime) || 0)
  seekValue.value = durationSec.value ? Math.round((currentSec.value / durationSec.value) * 1000) : 0
}

function onVideoResize(event) {
  updateVideoFit(event?.target || getVideo())
}

function onVideoPauseEvent(event) {
  // 同步浏览器策略性暂停到 UI，避免“看似卡死但无播放按钮”
  const video = event?.target
  if (!video || resolving.value || seeking.value) return
  if (video.ended) return
  paused.value = true
}

function onVideoPlayingEvent() {
  paused.value = false
  needsTap.value = false
}

function onVideoCanPlay(event) {
  updateVideoFit(event?.target || getVideo())
  clearLineFailures(activeUnit.value)
  videoReady.value = true
}

function onVideoError() {
  void recoverShortsPlaybackLine('当前集播放失败')
  paused.value = true
  videoLandscape.value = false
  videoReady.value = false
}

function rememberLocalHistory(unit, progressSec, durationSec) {
  if (!unit?.vod?.id || progressSec < HISTORY_MIN_PROGRESS_SEC) return
  const record = normalizeHistoryRecord({
    vodId: unit.vod.id,
    lineId: unit.channel.id,
    epIndex: unit.epIndex,
    epName: unit.epName,
    progressSec,
    durationSec,
    updatedAt: new Date().toISOString(),
  })
  vodHistoryState[unit.vod.id] = record
  if (
    feedMode.value === 'series' &&
    seriesState.value?.baseUnit?.vod?.id === unit.vod.id &&
    Number(seriesState.value?.baseUnit?.channel?.id) === Number(unit.channel.id)
  ) {
    seriesState.value.history = record
  }
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
  rememberLocalHistory(unit, progressSec, durationSec)
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

function previousTheaterEpisode() {
  if (!canGoPreviousTheater.value) return
  saveWatchHistory(null, { force: true })
  void showSeriesEpisode(currentSeriesEpIndex.value - 1, { behavior: 'auto', settleMs: 0 })
}

function nextTheaterEpisode() {
  if (!canGoNextTheater.value) return
  saveWatchHistory(null, { force: true })
  void showSeriesEpisode(currentSeriesEpIndex.value + 1, { behavior: 'auto', settleMs: 0 })
}

function jumpEpisode(index) {
  if (feedMode.value !== 'series') return
  const isCurrent = index === currentSeriesEpIndex.value
  closeEpisodeSheet({ resume: isCurrent })
  if (isCurrent) return
  saveWatchHistory(null, { force: true })
  void showSeriesEpisode(index, { behavior: 'auto', settleMs: 0 })
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

function seekValueFromPointer(event) {
  const track = event.currentTarget?.matches?.('input')
    ? event.currentTarget
    : event.currentTarget?.querySelector?.('input')
  const rect = track?.getBoundingClientRect?.()
  if (!rect?.width) return null
  const point = event.touches?.[0] || event.changedTouches?.[0] || event
  const clientX = Number(point?.clientX)
  if (!Number.isFinite(clientX)) return null
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  return Math.round(ratio * 1000)
}

function startSeek(event) {
  showProgressControls()
  seeking.value = true
  event?.currentTarget?.setPointerCapture?.(event.pointerId)
  const next = seekValueFromPointer(event)
  if (next !== null) applySeekValue(next, { resume: false })
}

function moveSeek(event) {
  showProgressControls()
  if (!seeking.value) {
    scheduleProgressIdle()
    return
  }
  const next = seekValueFromPointer(event)
  if (next !== null) applySeekValue(next, { resume: false })
}

function onSeekInput(event) {
  showProgressControls()
  seeking.value = true
  const next = Math.max(0, Math.min(1000, Number(event?.target?.value) || 0))
  seekValue.value = next
  currentSec.value = durationSec.value ? Math.floor((durationSec.value * next) / 1000) : 0
}

function commitSeek(event) {
  const pointerValue = seekValueFromPointer(event)
  const next = pointerValue ?? Math.max(0, Math.min(1000, Number(event?.target?.value ?? seekValue.value) || 0))
  applySeekValue(next, { resume: true })
  seeking.value = false
  scheduleProgressIdle()
}

function cancelSeek() {
  seeking.value = false
  scheduleProgressIdle()
}

function applySeekValue(value, options = {}) {
  const video = getVideo()
  const next = Math.max(0, Math.min(1000, Number(value) || 0))
  seekValue.value = next
  if (!video || !durationSec.value) return
  const nextTime = (durationSec.value * next) / 1000
  video.currentTime = nextTime
  currentSec.value = Math.floor(nextTime)
  if (options.resume !== false && !paused.value) playNow()
}

function seekFromProgressClick(event) {
  if (seeking.value) return
  showProgressControls()
  const next = seekValueFromPointer(event)
  if (next === null) return
  applySeekValue(next, { resume: true })
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

async function enterSeriesMode(unit = activeUnit.value, options = {}) {
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
  if (options.rememberWander === false) {
    wanderState = null
  } else if (!wasSeries || !wanderState) {
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
  const history = normalizeHistoryRecord(unit.resumeHistory || vodHistoryState[unit.vod.id])
  const matchingHistory = history && (!history.lineId || Number(history.lineId) === Number(unit.channel.id)) ? history : null
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
    history: matchingHistory,
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
  landscapeTheaterMode.value = false
  episodeSheetOpen.value = false
  resumeAfterEpisodeSheet = false
  detailSheetOpen.value = false
  immersiveMode.value = false
  clearSeriesScrollSettleTimer()
  clearSeriesPlayFallbackTimer()
  if (!wanderState) {
    feedMode.value = 'wander'
    seriesState.value = null
    syncShortsRoute({ clear: true })
    await loadFeed()
    return
  }
  saveWatchHistory(null, { force: true })
  suppressActiveIndexWatch = true
  feedMode.value = 'wander'
  seriesState.value = null
  syncShortsRoute({ clear: true })
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
  scrollToIndex(activeIndex.value, 'auto', { suppress: true })
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
      ...shortsScopeParams(),
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
  return vodInShortsScope(vod)
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
    const [vod, userState] = await Promise.all([
      api.vod(vodId),
      options.useHistory === false || !user.value ? Promise.resolve(null) : loadFollowState(vodId),
    ])
    const optionHistory = historyFromOptions(options)
    const cachedHistory = options.useHistory === false ? null : normalizeHistoryRecord(userState?.history || vodHistoryState[vodId])
    const resumeHistory = optionHistory || cachedHistory
    const unit = buildUnitFromVodDetail(vod, {
      ...options,
      lineId: options.lineId ?? resumeHistory?.lineId,
      epIndex: options.epIndex ?? resumeHistory?.epIndex,
      resumeHistory,
    })
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
    history: item,
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

async function lockOrientation(type) {
  try {
    if (screen?.orientation?.lock) await screen.orientation.lock(type)
  } catch {}
}

function lockShortsPortrait() {
  return lockOrientation('portrait')
}

function unlockShortsOrientation() {
  try {
    if (screen?.orientation?.unlock) screen.orientation.unlock()
  } catch {}
}

async function enterLandscapeTheater() {
  const unit = activeUnit.value
  if (!unit || accessBlock.value) return
  if (!videoLandscape.value) {
    notifyWarning('当前视频不是横屏片源')
    return
  }
  void lockShortsPortrait()
  landscapeTheaterMode.value = true
  showTheaterControls()
  immersiveMode.value = false
  detailSheetOpen.value = false
  searchSheetOpen.value = false
  librarySheetOpen.value = false
  episodeSheetOpen.value = false
  resumeAfterEpisodeSheet = false
  if (feedMode.value === 'wander') {
    await enterSeriesMode(unit)
  }
  await nextTick()
  keepActiveCardInView()
  const video = getVideo()
  if (video?.paused || paused.value) {
    void playNow({ mutedFallback: true })
  }
}

function exitLandscapeTheater() {
  landscapeTheaterMode.value = false
  clearTheaterControlsTimer()
  theaterControlsVisible.value = true
  updateViewportOrientation()
  window.setTimeout(() => keepActiveCardInView(), 300)
}

async function refreshSiteConfig() {
  try {
    site.value = writeCachedSite(await api.site())
  } catch {}
}

async function restoreShortsRoute() {
  const target = parseShortsRouteTarget()
  if (!target || shortsDisabled.value) return false
  loading.value = true
  restoringShortsRoute = true
  let restored = false
  try {
    const vod = await api.vod(target.vodId)
    const unit = buildUnitFromVodDetail(vod, {
      lineId: target.lineId,
      epIndex: target.epIndex,
      useHistory: false,
    })
    if (!unit) return false
    await enterSeriesMode(unit, { rememberWander: false })
    restored = true
    return true
  } catch (error) {
    notifyError(apiErrorMessage(error, '短剧恢复失败'))
    return false
  } finally {
    restoringShortsRoute = false
    loading.value = false
    if (restored) syncShortsRoute()
  }
}

function lockViewportZoom() {
  const tag = document.querySelector('meta[name="viewport"]')
  if (!tag) return
  setupOrientationWatcher()
  void lockShortsPortrait()
  previousViewportContent = tag.getAttribute('content') || ''
  tag.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover')
  previousBodyOverflow = document.body.style.overflow || ''
  document.body.style.overflow = 'hidden'
  document.addEventListener('gesturestart', preventBrowserZoom, { passive: false })
  document.addEventListener('gesturechange', preventBrowserZoom, { passive: false })
  document.addEventListener('touchmove', preventMultiTouchZoom, { passive: false })
  window.addEventListener('resize', keepActiveCardInView)
  window.addEventListener('orientationchange', keepActiveCardInView)
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
  window.removeEventListener('orientationchange', keepActiveCardInView)
  cleanupOrientationWatcher()
  unlockShortsOrientation()
}

function preventBrowserZoom(event) {
  event.preventDefault()
}

function preventMultiTouchZoom(event) {
  if (event.touches?.length > 1) event.preventDefault()
}

function setupOrientationWatcher() {
  if (!window.matchMedia) {
    updateViewportOrientation()
    return
  }
  orientationQuery = window.matchMedia('(orientation: landscape) and (max-height: 520px)')
  portraitQuery = window.matchMedia('(orientation: portrait)')
  updateViewportOrientation()
  if (orientationQuery.addEventListener) orientationQuery.addEventListener('change', keepActiveCardInView)
  else if (orientationQuery.addListener) orientationQuery.addListener(keepActiveCardInView)
  if (portraitQuery.addEventListener) portraitQuery.addEventListener('change', keepActiveCardInView)
  else if (portraitQuery.addListener) portraitQuery.addListener(keepActiveCardInView)
}

function cleanupOrientationWatcher() {
  if (orientationQuery) {
    if (orientationQuery.removeEventListener) orientationQuery.removeEventListener('change', keepActiveCardInView)
    else if (orientationQuery.removeListener) orientationQuery.removeListener(keepActiveCardInView)
    orientationQuery = null
  }
  if (portraitQuery) {
    if (portraitQuery.removeEventListener) portraitQuery.removeEventListener('change', keepActiveCardInView)
    else if (portraitQuery.removeListener) portraitQuery.removeListener(keepActiveCardInView)
    portraitQuery = null
  }
}

function updateViewportOrientation() {
  // viewportLandscape：手机横屏信号（驱动竖屏遮罩），保持原判定不动
  // viewportPortrait：纯方向信号（驱动剧场 rotate 分支），桌面/平板横屏不再误旋转
  if (orientationQuery) {
    viewportLandscape.value = Boolean(orientationQuery.matches)
    viewportPortrait.value = portraitQuery ? Boolean(portraitQuery.matches) : !viewportLandscape.value
    return
  }
  const width = Number(window.innerWidth || document.documentElement.clientWidth || 0)
  const height = Number(window.innerHeight || document.documentElement.clientHeight || 0)
  viewportLandscape.value = width > height && height <= 520
  viewportPortrait.value = height >= width
}

function keepActiveCardInView() {
  updateViewportOrientation()
  if (portraitLockVisible.value) return
  window.requestAnimationFrame(() => scrollToIndex(activeIndex.value, 'auto', { suppress: true }))
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
    Object.keys(vodHistoryState).forEach(key => delete vodHistoryState[key])
  }
})

watch(portraitLockVisible, async (locked, wasLocked) => {
  if (locked) {
    // 锁定时记住当前集数，防旋转期间 scroll 事件污染 activeIndex
    portraitLockIndex = activeIndex.value
    pauseCurrentVideo()
    return
  }
  if (!wasLocked) return
  // 解锁：强制恢复锁定前的集数与滚动位置
  if (portraitLockIndex >= 0 && portraitLockIndex < units.value.length) {
    if (activeIndex.value !== portraitLockIndex) {
      suppressActiveIndexWatch = true
      activeIndex.value = portraitLockIndex
      await nextTick()
      suppressActiveIndexWatch = false
    }
    scrollToIndex(portraitLockIndex, 'auto', { suppress: true })
  }
  portraitLockIndex = -1
  if (playingKey.value && playUrl.value && !layerOpen.value && !accessBlock.value) {
    void nextTick(() => playNow({ mutedFallback: true }))
  }
})

onMounted(async () => {
  lockViewportZoom()
  await refreshSiteConfig()
  const restored = await restoreShortsRoute()
  if (!restored) {
    syncShortsRoute({ clear: true })
    loadFeed()
  }
})
onBeforeUnmount(() => {
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  clearTheaterControlsTimer()
  clearPlaySettleTimer()
  clearSeriesCommitTimer()
  clearSeriesScrollSettleTimer()
  clearSeriesPlayFallbackTimer()
  clearProgressIdleTimer()
  episodeSheetOpen.value = false
  detailSheetOpen.value = false
  searchSheetOpen.value = false
  librarySheetOpen.value = false
  landscapeTheaterMode.value = false
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
.shorts-shell { position: relative; width: min(100vw, 430px); height: 100%; margin: 0 auto; overflow: hidden;
  background: #05060a; box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 0 70px rgba(0,0,0,.72); }
.shorts-top { position: absolute; top: 0; left: 0; right: 0; z-index: 9; display: flex; align-items: center; justify-content: space-between;
  min-height: calc(50px + env(safe-area-inset-top)); padding: calc(12px + env(safe-area-inset-top)) 14px 10px;
  background: linear-gradient(180deg, rgba(0,0,0,.58), rgba(0,0,0,0)); pointer-events: none; }
.shorts-top > * { pointer-events: auto; }
.shorts-top-actions { display: flex; justify-content: flex-end; gap: 8px; min-width: 38px; }
.icon-btn { width: 38px; height: 38px; border: 1px solid rgba(255,255,255,.1); border-radius: 50%; background: rgba(14,16,22,.42);
  color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(12px); }
.icon-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.shorts-title { position: absolute; left: 50%; top: calc(12px + env(safe-area-inset-top)); width: min(180px, calc(100% - 156px));
  transform: translateX(-50%); min-width: 0; text-align: center; line-height: 1.15; pointer-events: none; }
.shorts-title strong { display: block; font-size: 17px; font-weight: 900; letter-spacing: 0; }
.shorts-title span { display: block; margin-top: 3px; font-size: 11px; color: rgba(255,255,255,.62); }
.shorts-feed { height: 100%; overflow-y: auto; overflow-x: hidden; scroll-snap-type: y mandatory; scrollbar-width: none; overscroll-behavior: contain; }
.shorts-feed.series-feed { scroll-snap-type: y mandatory; }
.shorts-feed.frozen { overflow: hidden; }
.landscape-theater-mode {
  --theater-safe-x: max(14px, env(safe-area-inset-left), env(safe-area-inset-right));
  --theater-safe-top: max(10px, env(safe-area-inset-top), env(safe-area-inset-left), env(safe-area-inset-right));
  --theater-safe-bottom: max(12px, env(safe-area-inset-bottom), env(safe-area-inset-left), env(safe-area-inset-right));
  touch-action: none;
}
.landscape-theater-mode .shorts-shell { width: 100vw; max-width: none; box-shadow: none; }
.landscape-theater-mode .shorts-feed { overflow: hidden; }
.shorts-feed::-webkit-scrollbar { display: none; }
.short-card { position: relative; height: 100%; scroll-snap-align: start; scroll-snap-stop: always; overflow: hidden; background: #05060a; }
.short-media { position: absolute; inset: 0; background: #05060a; }
.short-poster-bg { position: absolute; inset: -18px; background-size: cover; background-position: center; filter: blur(28px) brightness(.48) saturate(1.18); transform: scale(1.1); }
.short-poster, .short-video { position: absolute; inset: 0; width: 100%; height: 100%; background: #05060a; transform: translateZ(0); backface-visibility: hidden; }
.short-poster { z-index: 1; object-fit: cover; }
.short-video { z-index: 2; opacity: 0; object-fit: contain; object-position: center center; transition: opacity .16s ease; }
.short-video.ready { opacity: 1; }
.short-video.portrait { object-fit: cover; }
.short-dim { position: absolute; inset: 0; z-index: 3; pointer-events: none; background:
  linear-gradient(180deg, rgba(0,0,0,.6), transparent 22%, transparent 54%, rgba(0,0,0,.82)),
  linear-gradient(90deg, rgba(0,0,0,.48), transparent 42%, rgba(0,0,0,.24)); }
.short-card.theater .short-media {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 50;
  width: 100vw;
  height: 100vh;
  width: 100dvw;
  height: 100dvh;
  overflow: hidden;
  background: #000;
  transform: translate(-50%, -50%);
  transform-origin: center center;
}
.theater-rotated .short-card.theater .short-media {
  width: 100vh;
  height: 100vw;
  width: 100dvh;
  height: 100dvw;
  transform: translate(-50%, -50%) rotate(90deg);
}
.short-card.theater .short-poster-bg,
.short-card.theater .short-poster,
.short-card.theater .short-dim { display: none; }
.short-card.theater .short-video { inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; object-fit: contain; opacity: 1; transform: none; }
.short-card.theater .center-state.play-state { display: none; }
.short-card.theater .short-progress {
  position: absolute;
  left: var(--theater-safe-x);
  right: var(--theater-safe-x);
  bottom: var(--theater-safe-bottom);
  z-index: 62;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 48px;
  align-items: center;
  gap: 10px;
  padding: 0;
  opacity: 1;
}
.short-card.theater .short-progress::before { left: calc(-1 * var(--theater-safe-x)); right: calc(-1 * var(--theater-safe-x)); top: -48px; bottom: calc(-1 * var(--theater-safe-bottom)); background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.62)); }
.short-card.theater .short-progress input { grid-column: 2; grid-row: 1; height: 36px; margin: -16px 0; }
.short-card.theater .progress-time { display: contents; opacity: 1; transform: none; }
.short-card.theater .progress-time span { color: rgba(255,255,255,.86); font-size: 11px; line-height: 1; font-weight: 900; text-shadow: 0 2px 10px rgba(0,0,0,.78); }
.short-card.theater .progress-time span:first-child { grid-column: 1; grid-row: 1; text-align: left; }
.short-card.theater .progress-time span:last-child { grid-column: 3; grid-row: 1; text-align: right; }
.short-card.theater .short-lock { position: fixed; z-index: 60; }
.theater-controls { position: absolute; inset: 0; z-index: 61; pointer-events: none; color: #fff; opacity: 1; transition: opacity .28s ease; }
.theater-controls.controls-hidden { opacity: 0; }
.theater-controls.controls-hidden .theater-icon-btn,
.theater-controls.controls-hidden .theater-skip-btn,
.theater-controls.controls-hidden .theater-play-btn { pointer-events: none; }
.short-card.theater .short-progress { transition: opacity .28s ease; }
.short-card.theater .short-progress.controls-hidden { opacity: 0; pointer-events: none; }
.theater-topbar {
  position: absolute;
  left: var(--theater-safe-x);
  right: var(--theater-safe-x);
  top: var(--theater-safe-top);
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}
.theater-now { min-width: 0; display: grid; gap: 3px; text-shadow: 0 2px 12px rgba(0,0,0,.78); }
.theater-now strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 1.15; font-weight: 950; letter-spacing: 0; }
.theater-now span { color: rgba(255,255,255,.68); font-size: 11px; line-height: 1; font-weight: 850; }
.theater-top-actions { display: flex; gap: 8px; pointer-events: none; }
.theater-icon-btn,
.theater-skip-btn,
.theater-play-btn {
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 50%;
  background: rgba(9,11,16,.48);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(16px);
  box-shadow: 0 10px 28px rgba(0,0,0,.32);
  pointer-events: auto;
  touch-action: manipulation;
}
.theater-icon-btn { width: 42px; height: 42px; }
.theater-icon-btn svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.theater-center-controls {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 24px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.theater-skip-btn { width: 54px; height: 54px; }
.theater-skip-btn svg { width: 25px; height: 25px; fill: rgba(255,255,255,.12); stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.theater-play-btn { width: 70px; height: 70px; background: rgba(255,255,255,.9); color: #101218; border-color: rgba(255,255,255,.92); }
.theater-play-btn svg { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.theater-play-btn svg[fill="currentColor"] { fill: currentColor; stroke: none; margin-left: 3px; }
.theater-icon-btn:disabled,
.theater-skip-btn:disabled { opacity: .36; cursor: not-allowed; }
.landscape-theater-mode .shorts-top,
.landscape-theater-mode .short-actions,
.landscape-theater-mode .short-meta { display: none; }
.landscape-theater-mode .episode-mask {
  position: fixed;
  inset: auto;
  left: 50%;
  top: 50%;
  z-index: 70;
  width: 100vw;
  height: 100vh;
  width: 100dvw;
  height: 100dvh;
  align-items: stretch;
  justify-content: flex-end;
  background: rgba(0,0,0,.48);
  transform: translate(-50%, -50%);
  transform-origin: center center;
}
.theater-rotated .episode-mask {
  width: 100vh;
  height: 100vw;
  width: 100dvh;
  height: 100dvw;
  transform: translate(-50%, -50%) rotate(90deg);
}
/* rotate(90deg) 后 UI 坐标系与物理安全区映射：
   局部 left→物理 top(刘海)、局部 right→物理 bottom(手势条)、
   局部 top→物理 right、局部 bottom→物理 left */
.landscape-theater-mode.theater-rotated {
  --theater-safe-x: max(14px, env(safe-area-inset-top), env(safe-area-inset-bottom));
  --theater-safe-top: max(10px, env(safe-area-inset-right));
  --theater-safe-bottom: max(12px, env(safe-area-inset-left));
}
.landscape-theater-mode .episode-sheet-panel {
  width: min(340px, 42%);
  height: 100%;
  max-height: none;
  border-radius: 0;
  border-top: 0;
  border-left: 1px solid rgba(255,255,255,.12);
  padding: var(--theater-safe-top) var(--theater-safe-x) var(--theater-safe-bottom) 14px;
}
.landscape-theater-mode .episode-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); max-height: calc(100% - 56px); }
.immersive-mode .short-dim { background:
  linear-gradient(180deg, rgba(0,0,0,.22), transparent 28%, transparent 72%, rgba(0,0,0,.48)),
  linear-gradient(90deg, rgba(0,0,0,.16), transparent 48%, rgba(0,0,0,.16)); }
.center-state { position: absolute; left: 50%; top: 50%; z-index: 5; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: 9px;
  min-height: 42px; padding: 0 15px; border-radius: 999px; background: rgba(10,12,18,.58); color: #fff; font-size: 13px; font-weight: 800; backdrop-filter: blur(14px); }
.play-state { width: 68px; height: 68px; min-height: 68px; justify-content: center; padding: 0; background: rgba(255,255,255,.2); }
.play-state svg { width: 30px; height: 30px; margin-left: 3px; }
.portrait-lock-mask { position: absolute; inset: 0; z-index: 32; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 11px;
  padding: 24px; text-align: center; background: rgba(5,6,10,.94); color: #fff; backdrop-filter: blur(18px); }
.portrait-lock-mask .rotate-icon { width: 58px; height: 58px; border-radius: 18px; display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.1); }
.portrait-lock-mask svg { width: 31px; height: 31px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.portrait-lock-mask strong { font-size: 18px; line-height: 1.25; font-weight: 950; }
.portrait-lock-mask span { max-width: 260px; color: rgba(255,255,255,.68); font-size: 12px; line-height: 1.55; font-weight: 760; }
.portrait-lock-mask button { height: 38px; margin-top: 3px; border: 1px solid rgba(255,255,255,.76); border-radius: 999px; padding: 0 18px; background: rgba(255,255,255,.92); color: #101218; font-size: 13px; font-weight: 950; cursor: pointer; }
.shorts-spinner { width: 26px; height: 26px; border-radius: 50%; border: 3px solid rgba(255,255,255,.24); border-top-color: #fff; animation: spin .8s linear infinite; }
.shorts-spinner.small { width: 18px; height: 18px; border-width: 2px; }
@keyframes spin { to { transform: rotate(360deg); } }
.short-actions { position: absolute; right: 10px; bottom: calc(104px + env(safe-area-inset-bottom)); z-index: 7; display: flex; flex-direction: column; gap: 14px; align-items: center; }
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
.watch-full-row { display: flex; justify-content: center; gap: 9px; margin-bottom: 8px; padding-right: 0; pointer-events: none; }
.watch-full-btn { display: flex; align-items: center; justify-content: center; width: max-content; height: 31px; padding: 0 13px;
  border: 1px solid rgba(255,255,255,.72); border-radius: 999px; background: rgba(0,0,0,.16); color: #fff;
  font-size: 12px; font-weight: 900; cursor: pointer; backdrop-filter: blur(10px); text-shadow: 0 2px 8px rgba(0,0,0,.42); pointer-events: auto; }
.landscape-full-btn { background: rgba(255,255,255,.18); }
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
.episode-grid button em { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(255,255,255,.62); font-size: 10px; line-height: 1; font-style: normal; font-weight: 900; }
.episode-grid button.on em { color: rgba(255,255,255,.86); }
.detail-body { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 13px; align-items: start; }
.detail-body img { width: 92px; aspect-ratio: 3 / 4; border-radius: 10px; object-fit: cover; background: rgba(255,255,255,.08); }
.detail-tags { margin-top: 0; }
.detail-body p { margin-top: 10px; color: rgba(255,255,255,.74); font-size: 13px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
.detail-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 16px; }
.detail-actions button, .short-search-box button { height: 38px; min-width: 0; border: 0; border-radius: 11px; background: var(--btn-primary-bg); color: var(--btn-primary-text); font-weight: 900; cursor: pointer; }
.detail-actions button:nth-child(2) { background: rgba(255,255,255,.1); color: #fff; border: 1px solid rgba(255,255,255,.12); }
.short-search-box { display: grid; grid-template-columns: minmax(0, 1fr) 72px; gap: 9px; margin-bottom: 12px; }
.short-search-box input { height: 40px; min-width: 0; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; background: rgba(255,255,255,.08); color: #fff; padding: 0 12px; outline: none; font-size: 16px; }
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
.landscape-theater-mode .episode-sheet-enter-from .episode-sheet-panel,
.landscape-theater-mode .episode-sheet-leave-to .episode-sheet-panel { transform: translateX(18px); }
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
  .shorts-shell { width: min(100vw, 430px); box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 0 60px rgba(0,0,0,.76); }
  .landscape-theater-mode .shorts-shell { width: 100vw; max-width: none; box-shadow: none; }
  .shorts-top { padding-top: calc(8px + env(safe-area-inset-top)); }
  .short-actions { bottom: calc(92px + env(safe-area-inset-bottom)); gap: 10px; }
  .short-actions.compact { bottom: calc(52px + env(safe-area-inset-bottom)); }
  .short-card.locked .short-meta { display: none; }
  .short-meta h1 { font-size: 18px; -webkit-line-clamp: 1; }
  .short-meta p { -webkit-line-clamp: 1; }
}
</style>
