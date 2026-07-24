<template>
  <main class="mp">
    <section class="mp-player" :class="{ landscape: playerLandscape, portrait: playerLandscape && fullscreenPortrait }" :style="heroStyle" @click="onPlayerTap" @pointerup="onPlayerPointerUp" @touchstart="onPlayerTouchStart" @touchmove="onPlayerTouchMove" @touchend="onPlayerTouchEnd" @touchcancel="onPlayerTouchEnd">
      <div class="mp-topbar">
        <button class="mp-icon-btn m-back-btn" type="button" aria-label="返回" @click.stop="goBack">
          <svg viewBox="0 0 24 24" v-html="icon('back')"></svg>
        </button>
        <strong>{{ playerTitle }}</strong>
        <button v-if="mode === 'hls' && curUrl && !accessBlock" class="mp-icon-btn mp-landscape-btn" type="button" :aria-label="playerLandscape ? '退出横屏' : '横屏播放'" @click.stop="toggleLandscape">
          <svg viewBox="0 0 24 24" :class="{ 'mp-ratio-icon': !playerLandscape }" v-html="icon(playerLandscape ? 'close' : 'ratio')"></svg>
        </button>
      </div>
      <div class="mp-bg"></div>
      <video
        v-if="mode === 'hls' && !accessBlock"
        ref="videoEl"
        class="mp-video"
        :style="subtitleStyleVars"
        autoplay
        preload="auto"
        :poster="poster(vod)"
        playsinline
        webkit-playsinline
        x-webkit-airplay="allow"
        airplay="allow"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @volumechange="syncVideoState"
        @loadedmetadata="onLoadedMetadata"
        @loadeddata="updateNativeQualityLabel"
        @canplay="updateNativeQualityLabel"
        @durationchange="syncVideoState"
        @timeupdate="onTimeUpdate"
        @error="handlePlaybackError"
        @click.stop="onPlayerTap"
        @pointerup.stop="onPlayerPointerUp"
      >
        <track v-for="(sub, index) in subtitleOptions" :key="sub.url" kind="subtitles" :src="sub.url" :srclang="sub.lang" :label="sub.label" :default="subtitleDefaultEnabled && index === 0" @load="applySubtitleMode" />
      </video>
      <iframe v-else-if="mode === 'iframe' && !accessBlock" class="mp-video" :src="curUrl" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>
      <div v-if="interactionConfig.danmakuEnabled && danmakuVisible" class="mp-danmaku-layer" :style="danmakuLayerStyle" aria-hidden="true">
        <span v-for="item in activeDanmakus" :key="`mp-dm-${item.id}-${item._nonce || 0}`" :class="`mode-${item.mode || 'scroll'}`" :style="danmakuItemStyle(item)">{{ item.content }}</span>
      </div>
      <div v-if="loading || resolving" class="mp-state">
        <div></div>
        <span>{{ loading ? '加载中' : '解析中' }}</span>
      </div>
      <div v-else-if="accessBlock" class="mp-lock">
        <strong>{{ accessBlock.title }}</strong>
        <p>{{ accessBlock.desc }}</p>
        <button type="button" @click="handleAccessAction">{{ accessBlock.actionText }}</button>
      </div>
      <button v-else-if="!curUrl" class="mp-play" type="button" aria-label="播放" @click="playCurrent">
        <svg viewBox="0 0 24 24" v-html="icon('play')"></svg>
      </button>
      <div v-if="!accessBlock && showCenterControls && mode === 'hls'" class="mp-center-controls">
        <button class="mp-round-btn" type="button" aria-label="上一集" :disabled="!hasPrevEp" @click.stop="playPrevEp">
          <svg viewBox="0 0 24 24" v-html="icon('skipBack')"></svg>
        </button>
        <button class="mp-round-btn mp-round-main" type="button" :aria-label="isPlaying ? '暂停' : '播放'" @click.stop="togglePlayback">
          <svg viewBox="0 0 24 24" v-html="icon(isPlaying ? 'pause' : 'play')"></svg>
        </button>
        <button class="mp-round-btn" type="button" aria-label="下一集" :disabled="!hasNextEp" @click.stop="playNextEp">
          <svg viewBox="0 0 24 24" v-html="icon('skipForward')"></svg>
        </button>
      </div>
      <div v-if="!accessBlock && controlsVisible" class="mp-bottom-controls" :class="{ iframe: mode === 'iframe' }" @click.stop="keepControlsVisible()">
        <div v-if="mode === 'hls'" class="mp-control-stack">
          <input
            class="mp-range"
            type="range"
            min="0"
            :max="duration || 0"
            step="0.1"
            :value="currentTime"
            :style="{ '--progress': progressPercent }"
            aria-label="播放进度"
            @pointerdown.stop="beginRangeSeek"
            @pointerup.stop="endRangeSeek"
            @pointercancel.stop="cancelRangeSeek"
            @touchstart.stop="beginRangeSeek"
            @touchend.stop="endRangeSeek"
            @touchcancel.stop="cancelRangeSeek"
            @mousedown.stop="beginRangeSeek"
            @mouseup.stop="endRangeSeek"
            @input="previewRangeSeek"
            @click.stop
          />
          <div class="mp-control-row">
            <button class="mp-control-btn mp-play-toggle" type="button" :aria-label="isPlaying ? '暂停' : '播放'" @click.stop="togglePlayback">
              <svg viewBox="0 0 24 24" v-html="icon(isPlaying ? 'pause' : 'play')"></svg>
            </button>
            <button class="mp-control-btn" type="button" :aria-label="isMuted ? '取消静音' : '静音'" @click.stop="toggleMuted">
              <svg viewBox="0 0 24 24" v-html="icon(isMuted ? 'volumeOff' : 'volume')"></svg>
            </button>
            <span class="mp-time mp-time-combo">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
            <span class="mp-control-spacer"></span>
            <button v-if="showQualityControl" class="mp-control-btn mp-quality-btn" type="button" aria-label="清晰度" @click.stop="cycleQuality">
              <span>{{ currentQualityLabel }}</span>
            </button>
            <span v-else-if="showQualityLabel" class="mp-quality-readonly">{{ currentQualityLabel }}</span>
            <button v-if="showPictureInPicture" class="mp-control-btn" type="button" aria-label="小窗播放" @click.stop="togglePictureInPicture">
              <svg viewBox="0 0 24 24" v-html="icon('pip')"></svg>
            </button>
            <button class="mp-control-btn" type="button" aria-label="播放设置" @click.stop="togglePlayerMenu">
              <svg viewBox="0 0 24 24" v-html="icon('more')"></svg>
            </button>
            <button class="mp-control-btn" type="button" aria-label="全屏播放" @click.stop="enterFullscreen">
              <svg viewBox="0 0 24 24" v-html="icon('expand')"></svg>
            </button>
          </div>
        </div>
        <button v-else class="mp-control-btn mp-iframe-full" type="button" aria-label="全屏播放" @click.stop="enterFullscreen">
          <svg viewBox="0 0 24 24" v-html="icon('expand')"></svg>
        </button>
        <Teleport to="body" :disabled="playerLandscape">
          <div v-if="menuOpen && mode === 'hls'" class="mp-menu-sheet-mask" @click.self="closePlayerMenu">
            <div class="mp-menu" @click.stop>
              <header>
                <strong>播放设置</strong>
                <button type="button" aria-label="关闭" @click="closePlayerMenu">
                  <svg viewBox="0 0 24 24" v-html="icon('close')"></svg>
                </button>
              </header>
              <section>
                <h3>倍速</h3>
          <div class="mp-menu-speeds">
            <button v-for="rate in speedOptions" :key="rate" type="button" :class="{ on: playbackRate === rate }" @click.stop="setSpeed(rate)">
              {{ rate === 1 ? '1x' : `${rate}x` }}
            </button>
          </div>
              </section>
              <section>
                <h3>跳过</h3>
          <label class="mp-menu-toggle">
            <span>跳过片头片尾</span>
            <input v-model="skipIntroOutro" type="checkbox" @change="saveSkipPreference" />
            <i></i>
          </label>
          <div class="mp-skip-grid">
            <label>
              <span>片头</span>
              <input v-model.number="skipIntroDraft" type="number" min="0" max="600" step="5" @change="saveSkipPreference" />
            </label>
            <label>
              <span>片尾</span>
              <input v-model.number="skipOutroDraft" type="number" min="0" max="600" step="5" @change="saveSkipPreference" />
            </label>
          </div>
          <button class="mp-menu-reset" type="button" @click.stop="resetSkipPreference">恢复默认</button>
              </section>
              <section v-if="subtitleOptions.length">
                <h3>字幕</h3>
          <div v-if="subtitleOptions.length" class="mp-menu-subtitles">
            <button type="button" :class="{ on: selectedSubtitle === 'off' }" @click.stop="selectSubtitle('off')">字幕关</button>
            <button v-for="(sub, index) in subtitleOptions" :key="sub.url" type="button" :class="{ on: selectedSubtitle === String(index) }" @click.stop="selectSubtitle(String(index))">{{ sub.label }}</button>
          </div>
              </section>
          <button class="mp-menu-cast" type="button" @click.stop="openCast">
            <svg viewBox="0 0 24 24" v-html="icon('cast')"></svg>
            投屏
          </button>
            </div>
        </div>
        </Teleport>
      </div>
      <div v-if="playNotice" class="mp-notice">{{ playNotice }}</div>
      <div v-if="playFailure.open" class="mp-failure" @click.stop>
        <strong>{{ playFailure.title }}</strong>
        <p>{{ playFailure.message }}</p>
        <div>
          <button type="button" @click.stop="retryCurrentPlayback">重试</button>
          <button v-if="hasNextEp" type="button" @click.stop="playFailureNext">下一集</button>
          <button type="button" @click.stop="manualSwitchLine">换线</button>
        </div>
      </div>
      <div v-if="seeking" class="mp-seek-preview">{{ formatTime(seekPreviewTime) }} / {{ formatTime(duration) }}</div>
    </section>

    <section v-if="vod.id && !playerLandscape" class="mp-toolbar-panel">
      <div v-if="interactionConfig.danmakuEnabled" class="mp-toolbar-danmaku">
        <button class="mp-danmaku-icon-btn mp-danmaku-toggle-btn" type="button" :class="{ on: danmakuVisible }" :aria-label="danmakuVisible ? '关闭弹幕' : '打开弹幕'" @click="danmakuVisible = !danmakuVisible">
          <svg viewBox="0 0 24 24" v-html="icon('danmaku')"></svg>
        </button>
        <button class="mp-danmaku-icon-btn" type="button" :class="{ on: danmakuSettingsOpen }" aria-label="弹幕设置" @click="toggleDanmakuSettings">
          <svg viewBox="0 0 24 24" v-html="icon('settings')"></svg>
        </button>
        <input v-model.trim="danmakuText" maxlength="80" :placeholder="danmakuInputPlaceholder" @keyup.enter="submitDanmaku" />
        <button class="mp-danmaku-send" type="button" :disabled="danmakuSubmitting" @click="submitDanmaku">{{ danmakuSendLabel }}</button>
        <Teleport to="body">
          <div v-if="danmakuSettingsOpen" class="mp-danmaku-settings-mask" @click.self="closeDanmakuSettings">
            <div class="mp-danmaku-settings" @click.stop>
              <header>
                <strong>弹幕设置</strong>
                <button type="button" aria-label="关闭" @click="closeDanmakuSettings">
                  <svg viewBox="0 0 24 24" v-html="icon('close')"></svg>
                </button>
              </header>
              <div v-for="group in danmakuOptionGroups" :key="group.key" class="mp-danmaku-setting-group">
                <span>{{ group.label }}</span>
                <div>
                  <button v-for="option in group.options" :key="`${group.key}-${option.value}`" type="button" :class="{ on: isDanmakuOptionOn(group.key, option.value) }" @click="setDanmakuOption(group.key, option.value)">
                    {{ option.label }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Teleport>
      </div>
    </section>

    <section v-if="vod.id" class="mp-info">
      <div class="mp-title-row">
        <div>
          <h1>{{ vod.name }}</h1>
          <p>
            <span v-if="vod.typeName">{{ vod.typeName }}</span>
            <span v-if="vod.year">{{ vod.year }}</span>
            <span v-if="vod.remarks">{{ vod.remarks }}</span>
            <span v-if="vod.rating">豆瓣 {{ vod.rating }}</span>
          </p>
        </div>
        <div class="mp-title-actions">
          <button class="mp-follow" type="button" :class="{ on: followed }" @click="toggleFollow">
            <svg viewBox="0 0 24 24"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z" /></svg>
            <span>{{ followed ? '追剧中' : '追剧' }}</span>
          </button>
          <button v-if="interactionConfig.ratingsEnabled" class="mp-like" type="button" :class="{ on: myRating >= 10 }" @click="submitRating(10)">
            <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h4v11Zm2 0V10.5l4.1-7.2a1.7 1.7 0 0 1 3.1.95V9h2.2a2.6 2.6 0 0 1 2.55 3.1l-1.2 6.2A3.4 3.4 0 0 1 18.4 21H11Z" /></svg>
            <span>点赞</span>
          </button>
        </div>
      </div>
      <div v-if="mobileCreditRows.length" class="mp-credit-list">
        <p v-for="row in mobileCreditRows" :key="row.label">
          <span>{{ row.label }}</span>
          <b>{{ row.value }}</b>
        </p>
      </div>
      <p v-if="vod.officialIntro || vod.blurb" class="mp-intro" :class="{ folded: !introOpen }" @click="introOpen = !introOpen">
        {{ vod.officialIntro || vod.blurb }}
      </p>
    </section>

    <section v-if="vod.id && !playerLandscape" class="mp-action-panel">
      <div class="mp-action-strip">
        <button v-if="interactionConfig.reportsEnabled" type="button" @click="openReport">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.3 3.7 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
          <span>报错</span>
        </button>
        <button type="button" @click="shareCurrentVod">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.6 6.8-4.2" /><path d="m8.6 13.4 6.8 4.2" /></svg>
          <span>分享</span>
        </button>
      </div>
    </section>

    <section v-if="vod.lines?.length" class="mp-panel mp-lines-panel">
      <header>
        <h2>播放线路</h2>
        <span>{{ currentLineLabel }}</span>
      </header>
      <div ref="lineTabsEl" class="mp-line-tabs">
        <button v-for="(line, index) in vod.lines" :key="line.id || index" type="button" :class="{ on: lineIdx === index }" @click="selectLine(index)">
          {{ lineLabel(line, index) }}
        </button>
      </div>
      <div v-if="channelOptions.length > 1" ref="channelTabsEl" class="mp-channel-tabs">
        <button v-for="(channel, index) in channelOptions" :key="channel.id || index" type="button" :class="{ on: chanIdx === index }" @click="selectChannel(index)">
          {{ channelLabel(channel, index) }}
        </button>
      </div>
    </section>

    <section v-if="episodes.length" ref="episodePanelEl" class="mp-panel">
      <header>
        <h2>选集</h2>
        <span>{{ epIdx + 1 }} / {{ episodes.length }}</span>
      </header>
      <div v-if="episodeRanges.length > 1" class="mp-episode-ranges">
        <button v-for="range in episodeRanges" :key="range.start" type="button" :class="{ on: activeEpisodeRange.start === range.start }" @click="selectEpisodeRange(range.start)">
          {{ range.label }}
        </button>
      </div>
      <div class="mp-episode-grid">
        <button v-for="ep in visibleEpisodes" :key="ep.index" type="button" :class="{ on: epIdx === ep.index, resume: isHistoryEpisode(ep.index) }" @click="playEp(ep.index)">
          <span>{{ ep.name || ep.index + 1 }}</span>
          <em v-if="isHistoryEpisode(ep.index)">{{ historyProgressText }}</em>
          <i v-if="isHistoryEpisode(ep.index)" :style="{ width: historyProgressPercent }"></i>
        </button>
      </div>
    </section>

    <section v-if="gallery.length" class="mp-panel">
      <header>
        <h2>剧照</h2>
        <span>{{ gallery.length }} 张</span>
      </header>
      <div class="mp-stills">
        <img v-for="img in gallery" :key="img.id || img.url" class="m-img-fade" :src="imgUrl(img.url)" :alt="vod.name" loading="lazy" @load="onImgLoad" @error="hideBrokenImg" />
      </div>
    </section>

    <section v-if="related.length" class="mp-panel">
      <header>
        <h2>相关推荐</h2>
      </header>
      <div class="mp-related">
        <article v-for="item in related" :key="item.id" @click="router.push(`/m/play/${item.id}`)">
          <img class="m-img-fade" :src="poster(item)" :alt="item.name" loading="lazy" @load="onImgLoad" @error="hideBrokenImg" />
          <strong>{{ item.name }}</strong>
          <span>{{ item.typeName || '影片' }}<template v-if="item.year"> · {{ item.year }}</template></span>
        </article>
      </div>
    </section>
    <section v-if="interactionConfig.commentsEnabled" ref="commentSectionEl" class="mp-panel mp-comment-section">
      <header>
        <h2>评论区</h2>
        <span>{{ comments.length }}</span>
      </header>
      <div v-if="!user" class="mp-comment-login">
        <button type="button" @click="openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后可评论' })">您还未 <b>登录</b> 请登录后发表评论</button>
      </div>
      <div v-else class="mp-comment-compose">
        <div v-if="interactionConfig.ratingsEnabled" class="mp-rating">
          <button v-for="score in 5" :key="`mp-rate-${score}`" type="button" :class="{ on: myRating >= score * 2 }" @click="submitRating(score * 2)">★</button>
          <span>{{ ratingSummary }}</span>
        </div>
        <div class="mp-comment-input">
          <input ref="commentInputEl" v-model.trim="commentText" maxlength="500" placeholder="写下你的评论" @keyup.enter="submitComment" />
          <button type="button" :disabled="commentSubmitting" @click="submitComment">发送</button>
        </div>
      </div>
      <div class="mp-comment-tabs">
        <button type="button" class="active">全部评论</button>
      </div>
      <div v-if="comments.length" class="mp-comments">
        <article v-for="item in comments.slice(0, 20)" :key="`mp-comment-${item.id}`">
          <b>{{ item.user?.nickname || item.user?.username || '匿名用户' }}</b>
          <p>{{ item.content }}</p>
        </article>
      </div>
      <div v-else class="mp-comment-empty">暂无评论信息~</div>
    </section>
    <div v-if="reportOpen" class="mp-report-mask" @click.self="reportOpen = false">
      <div class="mp-report">
        <strong>提交举报</strong>
        <select v-model="reportReason">
          <option value="无法播放">无法播放</option>
          <option value="内容错误">内容错误</option>
          <option value="违规内容">违规内容</option>
          <option value="其他问题">其他问题</option>
        </select>
        <textarea v-model.trim="reportContent" maxlength="500" placeholder="补充说明"></textarea>
        <div>
          <button type="button" @click="reportOpen = false">取消</button>
          <button type="button" :disabled="reportSubmitting" @click="submitReport">提交</button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import Hls from 'hls.js'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { openAuthDialog } from '../authDialog'
import { apiErrorMessage, notifyError, notifySuccess, notifyWarning } from '../feedback'
import { normalizePlayConfig, readCachedSite, writeCachedSite } from '../siteConfig'
import { mergeSkipConfig, readLocalSkipPreference, writeLocalSkipPreference } from '../skipConfig'
import { currentUser } from '../userStore'
import { icon } from './icons'

const route = useRoute()
const router = useRouter()
const MOBILE_DANMAKU_SETTINGS_KEY = 'vcms.mobile.danmaku.settings.v1'
const MOBILE_DANMAKU_DEFAULTS = {
  opacity: 0.75,
  area: 50,
  mode: 'scroll',
  density: 'normal',
  speed: 7,
  fontSize: 16,
  width: 70,
}
function readMobileDanmakuSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(MOBILE_DANMAKU_SETTINGS_KEY) || 'null')
    return raw && typeof raw === 'object' ? { ...MOBILE_DANMAKU_DEFAULTS, ...raw } : { ...MOBILE_DANMAKU_DEFAULTS }
  } catch {
    return { ...MOBILE_DANMAKU_DEFAULTS }
  }
}
const user = currentUser
const videoEl = ref(null)
const lineTabsEl = ref(null)
const channelTabsEl = ref(null)
const episodePanelEl = ref(null)
const commentSectionEl = ref(null)
const commentInputEl = ref(null)
const vod = ref({})
const related = ref([])
const loading = ref(true)
const resolving = ref(false)
const introOpen = ref(false)
const followed = ref(false)
const accessBlock = ref(null)
const playNotice = ref('')
const playFailure = ref({ open: false, title: '', message: '', switching: false })
const curUrl = ref('')
const currentResolve = ref(null)
const playConfig = ref(normalizePlayConfig(readCachedSite()?.playConfig))
const interactionConfig = ref({
  commentsEnabled: true,
  ratingsEnabled: true,
  reportsEnabled: true,
  danmakuEnabled: true,
  commentRequireLogin: true,
  ratingRequireLogin: true,
  danmakuRequireLogin: true,
})
const userSkipPreference = ref(null)
const subtitles = ref([])
const selectedSubtitle = ref('off')
const mode = ref('hls')
const lineIdx = ref(0)
const chanIdx = ref(0)
const epIdx = ref(0)
const activeEpisodeRangeStart = ref(0)
const historyState = ref(null)
const historyLineStates = ref([])
const pendingSeekSec = ref(0)
const playingChannel = ref(null)
const playingEpIndex = ref(0)
const playingEpName = ref('')
const isPlaying = ref(false)
const isMuted = ref(false)
const controlsVisible = ref(false)
const centerControlsVisible = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const comments = ref([])
const commentText = ref('')
const commentSubmitting = ref(false)
const ratingState = ref({ avg: 0, count: 0, myScore: 0 })
const danmakuText = ref('')
const danmakuVisible = ref(true)
const danmakuSettingsOpen = ref(false)
const danmakuSettings = reactive(readMobileDanmakuSettings())
const danmakuRows = ref([])
const activeDanmakus = ref([])
const danmakuSubmitting = ref(false)
const reportOpen = ref(false)
const reportReason = ref('无法播放')
const reportContent = ref('')
const reportSubmitting = ref(false)
const playbackRate = ref(1)
const skipIntroOutro = ref(false)
const skipIntroDraft = ref(0)
const skipOutroDraft = ref(0)
const qualityLevel = ref(-1)
const currentQualityLevel = ref(-1)
const qualityOptions = ref([])
const nativeQualityLabel = ref('')
const menuOpen = ref(false)
const pipSupported = ref(false)
const playerLandscape = ref(false)
const fullscreenPortrait = ref(false)   // 全屏时的实际方向：true=竖屏全屏，false=横屏全屏
const speedOptions = [0.75, 1, 1.25, 1.5, 2]
const danmakuOptionGroups = [
  { key: 'opacity', label: '透明度', options: [{ label: '30%', value: 0.3 }, { label: '50%', value: 0.5 }, { label: '75%', value: 0.75 }, { label: '100%', value: 1 }] },
  { key: 'area', label: '区域', options: [{ label: '1/4', value: 25 }, { label: '1/2', value: 50 }, { label: '3/4', value: 75 }, { label: '全屏', value: 100 }] },
  { key: 'mode', label: '位置', options: [{ label: '滚动', value: 'scroll' }, { label: '顶部', value: 'top' }, { label: '底部', value: 'bottom' }] },
  { key: 'density', label: '密度', options: [{ label: '低', value: 'low' }, { label: '标准', value: 'normal' }, { label: '高', value: 'high' }, { label: '极限', value: 'max' }] },
  { key: 'speed', label: '速度', options: [{ label: '慢', value: 9 }, { label: '标准', value: 7 }, { label: '快', value: 5 }] },
  { key: 'fontSize', label: '字号', options: [{ label: '小', value: 14 }, { label: '标准', value: 16 }, { label: '大', value: 18 }] },
  { key: 'width', label: '宽度', options: [{ label: '50%', value: 50 }, { label: '70%', value: 70 }, { label: '90%', value: 90 }] },
]
const danmakuDensityMap = {
  low: { perTick: 2, max: 6 },
  normal: { perTick: 4, max: 12 },
  high: { perTick: 6, max: 20 },
  max: { perTick: 10, max: 36 },
}
const EPISODE_GROUP_SIZE = 30
const MOBILE_HISTORY_KEY = 'vcms.mobile.play.history.v1'
const AUTO_SWITCH_MAX_ROUNDS = 2
// 横滑调进度手势状态
const seeking = ref(false)
const seekPreviewTime = ref(0)
let touchStartX = 0
let touchStartY = 0
let touchBaseTime = 0
let touchAxis = ''   // '' 未定 | 'h' 横滑(进度) | 'v' 竖滑(不拦)
let touchActive = false
let touchMoved = false      // 本次触摸是否发生位移（用于区分点击/滑动）
let suppressTapUntil = 0    // 滑动结束后抑制随后合成 click 的截止时间戳
let hls = null
let noticeTimer = 0
let historyTimer = 0
let controlsTimer = 0
let retryingLine = false
let autoSwitchingLine = false
let selfHealTried = false
let bodyOverflowBeforeLandscape = ''
let pageActive = false
let loadSeq = 0
let danmakuLoadAt = 0
let danmakuNonce = 0
let playbackSeq = 0
let introSkippedUrl = ''
let outroSkippedUrl = ''

const curLine = computed(() => vod.value.lines?.[lineIdx.value] || null)
const curChannel = computed(() => curLine.value?.channels?.[chanIdx.value] || curLine.value)
const channelOptions = computed(() => curLine.value?.channels?.length ? curLine.value.channels : [])
const episodes = computed(() => curChannel.value?.episodes || [])
const hasPrevEp = computed(() => epIdx.value > 0)
const hasNextEp = computed(() => epIdx.value < episodes.value.length - 1)
const episodeRanges = computed(() => {
  const total = episodes.value.length
  const ranges = []
  for (let start = 0; start < total; start += EPISODE_GROUP_SIZE) {
    const end = Math.min(total, start + EPISODE_GROUP_SIZE)
    ranges.push({ start, end, label: `${start + 1}-${end}` })
  }
  return ranges
})
const activeEpisodeRange = computed(() => episodeRanges.value.find(item => item.start === activeEpisodeRangeStart.value) || episodeRanges.value[0] || { start: 0, end: episodes.value.length })
const visibleEpisodes = computed(() => episodes.value.slice(activeEpisodeRange.value.start, activeEpisodeRange.value.end).map((ep, offset) => ({
  ...ep,
  index: activeEpisodeRange.value.start + offset,
})))
const gallery = computed(() => (vod.value.images || []).filter(img => img.type !== 'poster').slice(0, 10))
const effectivePlayConfig = computed(() => mergeSkipConfig(
  playConfig.value,
  vod.value?.skipConfig,
  userSkipPreference.value || readLocalSkipPreference(vod.value?.id),
))
const progressPercent = computed(() => duration.value ? `${Math.max(0, Math.min(100, (currentTime.value / duration.value) * 100))}%` : '0%')
const myRating = computed(() => Number(ratingState.value.myScore || 0))
const ratingSummary = computed(() => ratingState.value.count ? `${Number(ratingState.value.avg || 0).toFixed(1)}分 · ${ratingState.value.count}人` : '暂无评分')
const historyMatchesCurrentLine = computed(() => {
  const h = activeLineHistory()
  return Boolean(h?.lineId && curChannel.value?.id && Number(h.lineId) === Number(curChannel.value.id))
})
const historyProgressText = computed(() => {
  const h = activeLineHistory()
  if (!h || !historyMatchesCurrentLine.value) return ''
  const progress = Number(h.progressSec) || 0
  const total = Number(h.durationSec) || 0
  if (progress < 20) return ''
  if (total > 0) return `${Math.max(1, Math.min(99, Math.round((progress / total) * 100)))}%`
  return formatTime(progress)
})
const historyProgressPercent = computed(() => {
  const h = activeLineHistory()
  if (!h || !historyMatchesCurrentLine.value) return '0%'
  const progress = Number(h.progressSec) || 0
  const total = Number(h.durationSec) || 0
  return total > 0 ? `${Math.max(2, Math.min(100, (progress / total) * 100))}%` : '2px'
})
const showQualityControl = computed(() => qualityOptions.value.length > 1)
const showQualityLabel = computed(() => mode.value === 'hls' && currentQualityLabel.value && currentQualityLabel.value !== '清晰度')
const showPictureInPicture = computed(() => mode.value === 'hls' && pipSupported.value)
const subtitleOptions = computed(() => (Array.isArray(subtitles.value) ? subtitles.value : [])
  .map((item, index) => ({
    url: String(item?.url || '').trim(),
    lang: String(item?.lang || 'zh').trim() || 'zh',
    label: String(item?.label || item?.lang || `字幕${index + 1}`).trim() || `字幕${index + 1}`,
  }))
  .filter(item => item.url))
const subtitleDefaultEnabled = computed(() => playConfig.value.subtitleDefault !== 'off')
const subtitleStyleVars = computed(() => ({
  '--mp-subtitle-color': String(playConfig.value.subtitleColor || '#fff'),
  '--mp-subtitle-bg': String(playConfig.value.subtitleBackground || 'rgba(0,0,0,.55)'),
  '--mp-subtitle-size': `${Math.max(14, Math.min(40, Number(playConfig.value.subtitleFontSize) || 22))}px`,
}))
const showCenterControls = computed(() => controlsVisible.value && centerControlsVisible.value && !seeking.value)
const qualityLabel = computed(() => {
  return qualityOptions.value.find(item => item.level === qualityLevel.value)?.label || currentQualityLabel.value || '清晰度'
})
const currentQualityLabel = computed(() => {
  const current = qualityOptions.value.find(item => item.level === currentQualityLevel.value)?.label || nativeQualityLabel.value
  return qualityOptions.value.find(item => item.level === qualityLevel.value)?.label || current || qualityOptions.value[0]?.label || '清晰度'
})
const danmakuSendLabel = computed(() => (
  interactionConfig.value.danmakuRequireLogin && !user.value ? '登录' : (danmakuSubmitting.value ? '...' : '发送')
))
const danmakuInputPlaceholder = computed(() => (
  interactionConfig.value.danmakuRequireLogin && !user.value ? '登录后发弹幕' : '来发表弹幕吧~'
))
const danmakuLayerStyle = computed(() => ({
  '--mp-danmaku-opacity': String(danmakuSettings.opacity),
  '--mp-danmaku-font-size': `${Number(danmakuSettings.fontSize) || 16}px`,
  '--mp-danmaku-duration': `${Number(danmakuSettings.speed) || 7}s`,
  '--mp-danmaku-width': `${Number(danmakuSettings.width) || 70}vw`,
}))
const currentEpisodeName = computed(() => {
  const ep = episodes.value[epIdx.value]
  return ep?.name || (episodes.value.length ? `第 ${epIdx.value + 1} 集` : '')
})
const playerTitle = computed(() => {
  const name = vod.value?.name || '播放'
  return currentEpisodeName.value ? `${name} · ${currentEpisodeName.value}` : name
})
const currentLineLabel = computed(() => {
  const line = curLine.value
  if (!line) return '默认线路'
  const base = lineLabel(line, lineIdx.value)
  return channelOptions.value.length > 1 ? `${base} · ${channelLabel(curChannel.value, chanIdx.value)}` : base
})
const heroStyle = computed(() => {
  const url = poster(vod.value)
  return url ? { backgroundImage: `url(${url})` } : {}
})
const mobileActors = computed(() => peopleByRole('actor').slice(0, 8))
const mobileDirectors = computed(() => peopleByRole('director').slice(0, 4))
const mobileActorNames = computed(() => (
  mobileActors.value.length ? mobileActors.value.map(item => item.name) : splitNames(vod.value.actor).slice(0, 8)
))
const mobileDirectorNames = computed(() => (
  mobileDirectors.value.length ? mobileDirectors.value.map(item => item.name) : splitNames(vod.value.director).slice(0, 4)
))
const mobileCreditRows = computed(() => [
  { label: '导演', value: mobileDirectorNames.value.join('、') },
  { label: '主演', value: mobileActorNames.value.join('、') },
].filter(row => row.value))

function splitNames(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean)
  return String(value || '').split(/[,，/、\s]+/).map(item => item.trim()).filter(Boolean)
}

function peopleByRole(role) {
  return (vod.value?.people || [])
    .filter(item => item.role === role && item.person?.name)
    .map(item => ({ id: Number(item.person?.id || 0), name: item.person.name }))
    .filter(item => item.name)
}

function poster(row) {
  return imgUrl(row?.officialPic || row?.heroImage || row?.heroPic || row?.pic || row?.localPic || '')
}

function lineLabel(line, index = 0) {
  return line?.sourceName || line?.flag || `线路 ${index + 1}`
}

function channelLabel(channel, index = 0) {
  return channel?.name || channel?.flag || channel?.sourceName || `通道 ${index + 1}`
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

function hideBrokenImg(event) {
  if (event?.target) event.target.style.visibility = 'hidden'
}

function onImgLoad(event) {
  event?.target?.classList?.add('is-loaded')
}

function goBack() {
  stopPlayback()
  resetLandscape()
  if (window.history.length > 1) router.back()
  else router.push('/m')
}

function showNotice(message) {
  playNotice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => { playNotice.value = '' }, 3600)
}

function showPlayFailure(title, message, switching = false) {
  playFailure.value = { open: true, title, message, switching }
}

function closePlayFailure() {
  playFailure.value.open = false
}

async function refreshPlayConfig() {
  try {
    const site = await api.site()
    writeCachedSite(site)
    playConfig.value = normalizePlayConfig(site?.playConfig)
    interactionConfig.value = { ...interactionConfig.value, ...(site?.interactionConfig || {}) }
    syncSkipDrafts()
    resetSubtitleSelection()
  } catch {
    syncSkipDrafts()
  }
}

function playbackLineLabel(line = curLine.value, li = lineIdx.value) {
  return lineLabel(line, li)
}

function playbackChannelLabel(channel = curChannel.value, ci = chanIdx.value) {
  return channelOptions.value.length > 1 ? channelLabel(channel, ci) : ''
}

function playbackErrorPayload(message, failures = [], override = {}) {
  return {
    vodId: vod.value?.id,
    vodName: vod.value?.name,
    playId: override.playId ?? curChannel.value?.id,
    lineName: override.lineName ?? [playbackLineLabel(), playbackChannelLabel()].filter(Boolean).join(' · '),
    sourceName: override.sourceName ?? curLine.value?.sourceName ?? curChannel.value?.sourceName ?? '',
    epIndex: override.epIndex ?? epIdx.value,
    epName: override.epName ?? episodes.value?.[epIdx.value]?.name ?? '',
    url: override.url ?? currentResolve.value?.url ?? curUrl.value,
    rule: override.rule ?? currentResolve.value?.rule ?? '',
    proxyMode: override.proxyMode ?? currentResolve.value?.proxyMode ?? '',
    cleanId: override.cleanId ?? currentResolve.value?.cleanId ?? null,
    fallbackUrl: override.fallbackUrl ?? currentResolve.value?.fallbackUrl ?? '',
    hlsErrorData: override.hlsErrorData ?? {},
    page: location.href,
    message,
    detail: {
      failures,
      event: override.event || '',
      current: {
        lineIndex: lineIdx.value,
        channelIndex: chanIdx.value,
        playId: curChannel.value?.id,
        url: curUrl.value,
        rule: currentResolve.value?.rule || '',
        proxyMode: currentResolve.value?.proxyMode || '',
        cleanId: currentResolve.value?.cleanId || null,
        fallbackUrl: currentResolve.value?.fallbackUrl || '',
      },
    },
  }
}

function reportPlaybackError(message, failures = [], override = {}) {
  void api.reportPlaybackError(playbackErrorPayload(message, failures, override))
}

function isPlayRoute() {
  return String(route.path || '').startsWith('/m/play')
}

function isPlaybackCurrent(seq) {
  return pageActive && isPlayRoute() && seq === playbackSeq
}

function nextPlaybackSeq() {
  playbackSeq += 1
  return playbackSeq
}

function clearPlaybackMedia() {
  if (hls) {
    hls.destroy()
    hls = null
  }
  const video = videoEl.value
  if (video) {
    try { video.pause() } catch {}
    video.removeAttribute('src')
    try { video.load() } catch {}
  }
  curUrl.value = ''
  isPlaying.value = false
  resolving.value = false
  currentTime.value = 0
  duration.value = 0
  isMuted.value = false
  controlsVisible.value = false
  menuOpen.value = false
  qualityLevel.value = -1
  currentQualityLevel.value = -1
  qualityOptions.value = []
  nativeQualityLabel.value = ''
  introSkippedUrl = ''
  outroSkippedUrl = ''
  retryingLine = false
  if (controlsTimer) clearTimeout(controlsTimer)
}

function stopPlayback() {
  nextPlaybackSeq()
  clearPlaybackMedia()
}

function startVideo(video, seq) {
  if (!video || !isPlaybackCurrent(seq) || video !== videoEl.value) return
  const play = () => {
    window.requestAnimationFrame(() => {
      if (!isPlaybackCurrent(seq) || video !== videoEl.value) return
      video.play().catch(() => {})
    })
  }
  if (video.readyState >= 2) {
    play()
    return
  }
  video.addEventListener('loadeddata', play, { once: true })
  video.addEventListener('canplay', play, { once: true })
  window.setTimeout(() => {
    if (!isPlaybackCurrent(seq) || video !== videoEl.value) return
    if (video.readyState >= 1) play()
  }, 700)
}

function showControls(timeout = 5000, options = {}) {
  if (accessBlock.value) return
  const showCenter = options.center !== false
  controlsVisible.value = true
  centerControlsVisible.value = showCenter
  if (controlsTimer) clearTimeout(controlsTimer)
  controlsTimer = window.setTimeout(() => {
    controlsVisible.value = false
    centerControlsVisible.value = false
    menuOpen.value = false
    danmakuSettingsOpen.value = false
    controlsTimer = 0
  }, timeout)
}

function keepControlsVisible(timeout = 4200) {
  showControls(timeout, { center: false })
}

function hideControls() {
  controlsVisible.value = false
  centerControlsVisible.value = false
  menuOpen.value = false
  danmakuSettingsOpen.value = false
  if (controlsTimer) { clearTimeout(controlsTimer); controlsTimer = 0 }
}

// 触点是否落在控件上（顶栏/中央/底部/菜单，含进度条滑块），是则不触发播放器级手势与显隐
function isControlTarget(e) {
  const t = e?.target
  if (!t || !t.closest) return false
  return !!t.closest('.mp-topbar, .mp-center-controls, .mp-bottom-controls, .mp-menu')
}

// 点击播放器：显隐切换（区分滑动——滑动后短时间内抑制合成 click）
function onPlayerTap(e) {
  if (accessBlock.value) return
  if (Date.now() < suppressTapUntil) return
  if (isControlTarget(e)) return
  if (controlsVisible.value) hideControls()
  else showControls()
}

function onPlayerPointerUp(e) {
  if (accessBlock.value || touchMoved || seeking.value) return
  if (Date.now() < suppressTapUntil) return
  if (isControlTarget(e)) return
  e?.preventDefault?.()
  suppressTapUntil = Date.now() + 350
  if (controlsVisible.value) hideControls()
  else showControls()
}

function bindVideoTapEvents() {
  const video = videoEl.value
  if (!video || video.__mpTapBound) return
  video.__mpTapBound = true
  video.addEventListener('click', onPlayerTap)
  video.addEventListener('pointerup', onPlayerPointerUp, { passive: false })
}

async function toggleLandscape() {
  playerLandscape.value = !playerLandscape.value
  danmakuSettingsOpen.value = false
  if (playerLandscape.value) {
    // 根据视频实际宽高判定横/竖：竖片锁竖屏全屏，横片锁横屏全屏
    const video = videoEl.value
    const vw = Number(video?.videoWidth) || 0
    const vh = Number(video?.videoHeight) || 0
    fullscreenPortrait.value = vw > 0 && vh > 0 && vh > vw
    bodyOverflowBeforeLandscape = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    try { await screen.orientation?.lock?.(fullscreenPortrait.value ? 'portrait' : 'landscape') } catch {}
  } else {
    document.body.style.overflow = bodyOverflowBeforeLandscape
    fullscreenPortrait.value = false
    try { screen.orientation?.unlock?.() } catch {}
  }
  showControls(3200)
}

function resetLandscape() {
  if (!playerLandscape.value) return
  playerLandscape.value = false
  fullscreenPortrait.value = false
  document.body.style.overflow = bodyOverflowBeforeLandscape
  try { screen.orientation?.unlock?.() } catch {}
}

function enterFullscreen() {
  const target = mode.value === 'hls' ? videoEl.value : document.querySelector('.mp-player iframe')
  const box = document.querySelector('.mp-player')
  try {
    if (target?.webkitEnterFullscreen) {
      target.webkitEnterFullscreen()
      return
    }
    const fullscreenTarget = target || box
    if (fullscreenTarget?.requestFullscreen) {
      fullscreenTarget.requestFullscreen()
      return
    }
    if (fullscreenTarget?.webkitRequestFullscreen) {
      fullscreenTarget.webkitRequestFullscreen()
    }
  } catch {
    showNotice('当前浏览器暂不支持全屏')
  }
}

function canUsePictureInPicture(video = videoEl.value) {
  if (!video || mode.value !== 'hls') return false
  const webkitPip = typeof video.webkitSupportsPresentationMode === 'function' &&
    video.webkitSupportsPresentationMode('picture-in-picture') &&
    typeof video.webkitSetPresentationMode === 'function'
  const standardPip = typeof document !== 'undefined' &&
    document.pictureInPictureEnabled !== false &&
    typeof video.requestPictureInPicture === 'function'
  return standardPip || webkitPip
}

function updatePictureInPictureSupport() {
  pipSupported.value = canUsePictureInPicture()
}

async function togglePictureInPicture() {
  const video = videoEl.value
  if (!video || mode.value !== 'hls') return
  try {
    if (video.webkitSupportsPresentationMode?.('picture-in-picture') && typeof video.webkitSetPresentationMode === 'function') {
      if (video.webkitPresentationMode === 'picture-in-picture') {
        video.webkitSetPresentationMode('inline')
        showControls(2600)
        return
      }
      if (video.paused || video.readyState < 2) await video.play()
      video.webkitSetPresentationMode('picture-in-picture')
      showNotice('已开启小窗播放')
      showControls(2600)
      return
    }
    if (document.pictureInPictureElement === video) {
      await document.exitPictureInPicture()
      showControls(2600)
      return
    }
    if (document.pictureInPictureEnabled !== false && typeof video.requestPictureInPicture === 'function') {
      if (video.paused || video.readyState < 2) await video.play()
      await new Promise(resolve => requestAnimationFrame(resolve))
      await video.requestPictureInPicture()
      showNotice('已开启小窗播放')
      showControls(2600)
      return
    }
    showNotice('当前视频暂无法开启小窗')
  } catch (error) {
    const name = String(error?.name || '')
    if (name === 'NotAllowedError') showNotice('请先点一下播放画面后再开小窗')
    else if (name === 'InvalidStateError') showNotice('视频准备中，稍后再试')
    else if (name === 'NotSupportedError') showNotice('当前浏览器不允许网页小窗')
    else showNotice('小窗开启失败')
  }
}

async function openCast() {
  const video = videoEl.value
  menuOpen.value = false
  showControls()
  if (!video || mode.value !== 'hls') {
    showNotice('当前播放源暂不支持 AirPlay')
    return
  }
  video.setAttribute('x-webkit-airplay', 'allow')
  video.setAttribute('airplay', 'allow')
  try {
    if (video?.webkitShowPlaybackTargetPicker) {
      video.webkitShowPlaybackTargetPicker()
      return
    }
    if (!/iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent || '') && video?.remote?.prompt) {
      await video.remote.prompt()
      return
    }
    showNotice('当前浏览器暂不支持 AirPlay')
  } catch {
    showNotice('AirPlay 未开启')
  }
}

function syncVideoState() {
  const video = videoEl.value
  if (!video) return
  applySkipRanges()
  currentTime.value = Number(video.currentTime) || 0
  duration.value = Number.isFinite(video.duration) ? Number(video.duration) || 0 : 0
  isPlaying.value = !video.paused
  isMuted.value = video.muted || Number(video.volume) === 0
  video.playbackRate = playbackRate.value
}

function onLoadedMetadata() {
  bindVideoTapEvents()
  updateNativeQualityLabel()
  updatePictureInPictureSupport()
  syncVideoState()
  applySubtitleMode()
  applySkipIntro()
}
function updateNativeQualityLabel() {
  const video = videoEl.value
  const height = Math.floor(Number(video?.videoHeight) || 0)
  nativeQualityLabel.value = height > 0 ? `${height}P` : ''
}

function defaultSubtitleValue() {
  return subtitleDefaultEnabled.value && subtitleOptions.value.length ? '0' : 'off'
}

function resetSubtitleSelection() {
  selectedSubtitle.value = defaultSubtitleValue()
  nextTick(() => {
    applySubtitleMode()
    window.setTimeout(applySubtitleMode, 180)
  })
}

function applySubtitleMode() {
  const tracks = videoEl.value?.textTracks
  if (!tracks) return
  for (let i = 0; i < tracks.length; i++) {
    tracks[i].mode = selectedSubtitle.value === String(i) ? 'showing' : 'disabled'
  }
}

function selectSubtitle(value) {
  selectedSubtitle.value = String(value)
  applySubtitleMode()
  showControls(2600, { center: false })
}

function skipIntroSeconds() {
  return Math.max(0, Math.min(600, Number(skipIntroDraft.value) || 0))
}

function skipOutroSeconds() {
  return Math.max(0, Math.min(600, Number(skipOutroDraft.value) || 0))
}

function skipEnabled() {
  return Boolean(skipIntroOutro.value)
}

function syncSkipDrafts() {
  const cfg = effectivePlayConfig.value
  skipIntroOutro.value = cfg.skipIntroEnabled === true
  skipIntroDraft.value = Math.max(0, Math.min(600, Number(cfg.skipIntroSeconds) || 0))
  skipOutroDraft.value = Math.max(0, Math.min(600, Number(cfg.skipOutroSeconds) || 0))
}

async function saveSkipPreference() {
  if (!vod.value?.id) return
  const pref = writeLocalSkipPreference(vod.value.id, {
    enabled: Boolean(skipIntroOutro.value),
    introSeconds: skipIntroSeconds(),
    outroSeconds: skipOutroSeconds(),
  })
  userSkipPreference.value = pref
  if (user.value) {
    try {
      const r = await api.saveVodSkipPreference(vod.value.id, pref)
      userSkipPreference.value = r?.skipPreference || pref
      showNotice('已保存本片跳过设置')
    } catch {
      showNotice('已保存到本机，登录同步失败')
    }
  } else {
    showNotice('已保存本机本片跳过设置')
  }
}
async function resetSkipPreference() {
  if (!vod.value?.id) return
  writeLocalSkipPreference(vod.value.id, null)
  userSkipPreference.value = null
  syncSkipDrafts()
  if (user.value) {
    try {
      await api.resetVodSkipPreference(vod.value.id)
      showNotice('已恢复后台默认跳过设置')
    } catch {
      showNotice('已恢复本机默认，登录同步失败')
    }
  } else {
    showNotice('已恢复后台默认跳过设置')
  }
}

function applySkipIntro() {
  const video = videoEl.value
  const intro = skipIntroSeconds()
  const total = Number(video?.duration) || 0
  if (!video || !skipEnabled() || !intro || introSkippedUrl === curUrl.value) return
  if (total && intro >= total - 8) return
  if ((Number(video.currentTime) || 0) < Math.max(1, intro - 0.5)) {
    introSkippedUrl = curUrl.value
    try {
      video.currentTime = intro
      currentTime.value = intro
    } catch {}
  }
}

function applySkipRanges() {
  const video = videoEl.value
  if (!video || !skipEnabled()) return
  applySkipIntro()
  const outro = skipOutroSeconds()
  const total = Number(video.duration) || 0
  const now = Number(video.currentTime) || 0
  if (!outro || !total || total < 30 || now < total - outro || outroSkippedUrl === curUrl.value) return
  outroSkippedUrl = curUrl.value
  if (hasNextEp.value) playNextEp()
  else {
    try {
      video.currentTime = Math.max(0, total - 0.3)
      video.pause()
    } catch {}
  }
}

function onTimeUpdate() {
  syncVideoState()
  saveProgressSoon()
  void loadDanmakuWindow(false)
  tickDanmaku()
}

async function loadVodInteractions(id = vod.value?.id) {
  if (!id) return
  const [commentRows, rating] = await Promise.all([
    interactionConfig.value.commentsEnabled ? api.vodComments(id, 20).catch(() => []) : Promise.resolve([]),
    interactionConfig.value.ratingsEnabled ? api.vodRating(id).catch(() => ({ avg: 0, count: 0, myScore: 0 })) : Promise.resolve({ avg: 0, count: 0, myScore: 0 }),
  ])
  comments.value = Array.isArray(commentRows) ? commentRows : []
  ratingState.value = { avg: Number(rating?.avg || 0), count: Number(rating?.count || 0), myScore: Number(rating?.myScore || 0) }
}

function requireInteractionLogin(reason) {
  if (user.value) return true
  openAuthDialog({ mode: 'login', redirect: route.fullPath, reason })
  return false
}

async function submitComment() {
  if (!vod.value?.id || !commentText.value || commentSubmitting.value) return
  if (interactionConfig.value.commentRequireLogin && !requireInteractionLogin('登录后可评论')) return
  commentSubmitting.value = true
  try {
    const row = await api.postVodComment(vod.value.id, { content: commentText.value, source: 'mobile' })
    comments.value = [row, ...comments.value]
    commentText.value = ''
    notifySuccess('评论已发送')
  } catch (error) { notifyError(apiErrorMessage(error, '评论发送失败')) } finally { commentSubmitting.value = false }
}

async function submitRating(score) {
  if (!vod.value?.id) return
  if (interactionConfig.value.ratingRequireLogin && !requireInteractionLogin('登录后可评分')) return
  try {
    ratingState.value = await api.rateVod(vod.value.id, { score, source: 'mobile' })
    notifySuccess('评分已保存')
  } catch (error) { notifyError(apiErrorMessage(error, '评分失败')) }
}

function scrollToComments() {
  nextTick(() => {
    commentSectionEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => commentInputEl.value?.focus?.(), 260)
  })
}

async function shareCurrentVod() {
  const title = vod.value?.name || playerTitle.value || '正在观看'
  const url = window.location.href
  try {
    if (navigator.share) {
      await navigator.share({ title, url })
      return
    }
    await navigator.clipboard?.writeText(url)
    notifySuccess('分享链接已复制')
  } catch {
    notifyWarning('分享已取消')
  }
}

function openMyList() {
  if (!user.value) {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后可同步片单' })
    return
  }
  router.push('/m/me')
}

async function loadDanmakuWindow(force = false) {
  if (!interactionConfig.value.danmakuEnabled || !vod.value?.id) return
  const now = Math.floor(Number(currentTime.value) || 0)
  if (!force && Math.abs(now - danmakuLoadAt) < 45) return
  danmakuLoadAt = now
  const rows = await api.danmaku(vod.value.id, {
    playId: curChannel.value?.id || undefined,
    epIndex: epIdx.value,
    from: Math.max(0, now - 5),
    to: now + 120,
  }).catch(() => [])
  danmakuRows.value = Array.isArray(rows) ? rows : []
}

function saveDanmakuSettings() {
  try {
    localStorage.setItem(MOBILE_DANMAKU_SETTINGS_KEY, JSON.stringify({ ...danmakuSettings }))
  } catch {}
}

function setDanmakuOption(key, value) {
  danmakuSettings[key] = value
  saveDanmakuSettings()
}

function isDanmakuOptionOn(key, value) {
  return String(danmakuSettings[key]) === String(value)
}

function toggleDanmakuSettings() {
  danmakuSettingsOpen.value = !danmakuSettingsOpen.value
}

function closeDanmakuSettings() {
  danmakuSettingsOpen.value = false
}

function danmakuDensity() {
  return danmakuDensityMap[danmakuSettings.density] || danmakuDensityMap.normal
}

function danmakuTop(index) {
  const area = Math.max(25, Math.min(100, Number(danmakuSettings.area) || 50))
  const lanes = Math.max(2, Math.round(area / 10))
  const step = area / (lanes + 1)
  const lane = (danmakuNonce + index) % lanes
  if (danmakuSettings.mode === 'bottom') return `${100 - area + step * (lane + 1)}%`
  return `${Math.max(5, step * (lane + 1))}%`
}

function danmakuItemStyle(item) {
  return { top: item.top, color: item.color || '#fff' }
}

function tickDanmaku() {
  if (!danmakuVisible.value || !danmakuRows.value.length) return
  const now = Math.floor(Number(currentTime.value) || 0)
  const density = danmakuDensity()
  const due = danmakuRows.value.filter(item => !item._shown && Math.abs(Number(item.timeSec || 0) - now) <= 1).slice(0, density.perTick)
  if (!due.length) return
  for (const item of due) item._shown = true
  activeDanmakus.value = [
    ...activeDanmakus.value,
    ...due.map((item, index) => ({ ...item, _nonce: ++danmakuNonce, mode: danmakuSettings.mode, top: danmakuTop(index) })),
  ].slice(-density.max)
  window.setTimeout(() => {
    activeDanmakus.value = activeDanmakus.value.filter(item => !due.some(x => x.id === item.id))
  }, Math.max(4, Number(danmakuSettings.speed) || 7) * 1000)
}

async function submitDanmaku() {
  if (!vod.value?.id || danmakuSubmitting.value) return
  if (interactionConfig.value.danmakuRequireLogin && !requireInteractionLogin('登录后可发弹幕')) return
  if (!danmakuText.value) return
  danmakuSubmitting.value = true
  try {
    const row = await api.sendDanmaku(vod.value.id, {
      playId: curChannel.value?.id || undefined,
      epIndex: epIdx.value,
      timeSec: Math.floor(Number(currentTime.value) || 0),
      content: danmakuText.value,
      source: 'mobile',
    })
    danmakuRows.value = [...danmakuRows.value, row]
    danmakuText.value = ''
    notifySuccess('弹幕已发送')
  } catch (error) { notifyError(apiErrorMessage(error, '弹幕发送失败')) } finally { danmakuSubmitting.value = false }
}

function openReport() {
  reportReason.value = '无法播放'
  reportContent.value = ''
  reportOpen.value = true
}

async function submitReport() {
  if (!vod.value?.id || reportSubmitting.value) return
  reportSubmitting.value = true
  try {
    await api.reportContent({ type: 'play', targetId: curChannel.value?.id || vod.value.id, vodId: vod.value.id, reason: reportReason.value, content: reportContent.value, source: 'mobile' })
    reportOpen.value = false
    notifySuccess('举报已提交')
  } catch (error) { notifyError(apiErrorMessage(error, '举报失败')) } finally { reportSubmitting.value = false }
}

function togglePlayback() {
  const video = videoEl.value
  if (!video || mode.value !== 'hls') return
  showControls()
  if (video.paused) video.play().catch(() => {})
  else video.pause()
}

function toggleMuted() {
  const video = videoEl.value
  if (!video) return
  video.muted = !video.muted
  isMuted.value = video.muted
  showControls()
}

function previewRangeSeek(event) {
  const next = Number(event?.target?.value) || 0
  currentTime.value = next
  seekPreviewTime.value = next
  keepControlsVisible(3600)
}

function beginRangeSeek(event) {
  if (mode.value !== 'hls' || accessBlock.value || !curUrl.value) return
  event?.stopPropagation?.()
  seeking.value = true
  seekPreviewTime.value = currentTime.value
  menuOpen.value = false
  controlsVisible.value = true
  centerControlsVisible.value = false
  if (controlsTimer) { clearTimeout(controlsTimer); controlsTimer = 0 }
}

function endRangeSeek(event) {
  event?.stopPropagation?.()
  if (!seeking.value) return
  const video = videoEl.value
  if (video && duration.value) {
    video.currentTime = Math.max(0, Math.min(duration.value, seekPreviewTime.value))
  }
  seeking.value = false
  suppressTapUntil = Date.now() + 400
  keepControlsVisible(1800)
}

function cancelRangeSeek(event) {
  event?.stopPropagation?.()
  seeking.value = false
  suppressTapUntil = Date.now() + 400
  keepControlsVisible(1200)
}

// 播放器区域横滑调进度：横滑预览、松手才 seek；竖滑不拦（交给页面滚动）
function onPlayerTouchStart(e) {
  touchMoved = false
  touchActive = false
  if (mode.value !== 'hls' || accessBlock.value || !curUrl.value) return
  if (isControlTarget(e)) return // 落在控件(如进度条滑块)上，交给控件自身处理，不启用播放器手势
  const t = e.touches?.[0]
  if (!t) return
  touchActive = true
  touchAxis = ''
  touchStartX = t.clientX
  touchStartY = t.clientY
  touchBaseTime = currentTime.value
}

function onPlayerTouchMove(e) {
  if (!touchActive) return
  const video = videoEl.value
  const t = e.touches?.[0]
  if (!video || !t || !duration.value) return
  const dx = t.clientX - touchStartX
  const dy = t.clientY - touchStartY
  const cssRotatedLandscape = playerLandscape.value && !fullscreenPortrait.value && window.matchMedia?.('(orientation: portrait)')?.matches
  const seekDelta = cssRotatedLandscape ? dy : dx
  const crossDelta = cssRotatedLandscape ? dx : dy
  if (Math.abs(seekDelta) > 10 || Math.abs(crossDelta) > 10) touchMoved = true
  // 方向判定：首次位移超 10px 才锁轴，横>竖认为调进度
  if (!touchAxis) {
    if (Math.abs(seekDelta) < 10 && Math.abs(crossDelta) < 10) return
    touchAxis = Math.abs(seekDelta) > Math.abs(crossDelta) ? 'h' : 'v'
    // 横滑调进度时隐藏菜单：seek 预览与操作菜单不同时出现
    if (touchAxis === 'h') { seeking.value = true; hideControls() }
  }
  if (touchAxis !== 'h') return // 竖滑不拦截，让页面正常滚动
  e.preventDefault() // 横滑时阻止页面横向滑动/选中
  // 全屏宽度对应整段时长（一屏横滑 = 全片长），最少按 90s 基准避免短片太敏感
  const w = window.innerWidth || 360
  const span = Math.max(duration.value, 90)
  const next = Math.max(0, Math.min(duration.value, touchBaseTime + (seekDelta / w) * span))
  seekPreviewTime.value = next
  currentTime.value = next // 实时更新进度条 UI（不动 video.currentTime，避免频繁 seek 卡顿）
}

function onPlayerTouchEnd(e) {
  if (!touchActive) return
  touchActive = false
  const cancelled = e?.type === 'touchcancel'
  if (touchAxis === 'h' && seeking.value) {
    const video = videoEl.value
    if (!cancelled && video && duration.value) {
      video.currentTime = seekPreviewTime.value
    }
    seeking.value = false
  }
  // 发生过位移=滑动手势，抑制随后合成的 click，避免误触发菜单显隐
  if (touchMoved) suppressTapUntil = Date.now() + 400
  touchAxis = ''
}

function playPrevEp() {
  if (!hasPrevEp.value) {
    showControls(2200)
    return
  }
  playEp(epIdx.value - 1)
  showControls(2200)
}

function playNextEp() {
  if (!hasNextEp.value) {
    showControls(2200)
    return
  }
  playEp(epIdx.value + 1)
  showControls(2200)
}

function setSpeed(rate) {
  playbackRate.value = rate
  const video = videoEl.value
  if (video) video.playbackRate = playbackRate.value
  showNotice(playbackRate.value === 1 ? '已恢复正常速度' : `已切换 ${playbackRate.value}x`)
  menuOpen.value = false
  showControls(3200)
}

function togglePlayerMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) {
    controlsVisible.value = true
    centerControlsVisible.value = false
    if (controlsTimer) { clearTimeout(controlsTimer); controlsTimer = 0 }
    return
  }
  showControls(2600)
}

function closePlayerMenu() {
  menuOpen.value = false
  showControls(2400, { center: false })
}

function refreshQualityOptions() {
  if (!hls?.levels?.length) {
    qualityOptions.value = []
    return
  }
  qualityOptions.value = hls.levels
    .map((level, index) => ({
      level: index,
      height: Number(level.height) || 0,
      bitrate: Number(level.bitrate) || 0,
      label: level.height ? `${level.height}P` : `${Math.round((Number(level.bitrate) || 0) / 1000)}K`,
    }))
    .filter(item => item.label && item.label !== '0K')
    .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)
}

function cycleQuality() {
  if (!hls || !qualityOptions.value.length) return
  menuOpen.value = false
  const order = qualityOptions.value.map(item => item.level)
  const active = qualityLevel.value >= 0 ? qualityLevel.value : currentQualityLevel.value
  const current = order.indexOf(active)
  qualityLevel.value = order[(current + 1) % order.length] ?? order[0]
  hls.currentLevel = qualityLevel.value
  showNotice(`清晰度：${qualityLabel.value}`)
  showControls(3200)
}

function formatTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  const mins = Math.floor(total / 60)
  const secs = String(total % 60).padStart(2, '0')
  return `${mins}:${secs}`
}

function isHistoryEpisode(index) {
  const h = activeLineHistory()
  return Boolean(historyMatchesCurrentLine.value && historyProgressText.value && Number(h?.epIndex) === Number(index))
}

function alignEpisodeRange(index = epIdx.value) {
  const total = episodes.value.length
  if (!total) {
    activeEpisodeRangeStart.value = 0
    return
  }
  const start = Math.floor(Math.max(0, Number(index) || 0) / EPISODE_GROUP_SIZE) * EPISODE_GROUP_SIZE
  activeEpisodeRangeStart.value = Math.min(start, Math.floor((total - 1) / EPISODE_GROUP_SIZE) * EPISODE_GROUP_SIZE)
}

function selectEpisodeRange(start) {
  activeEpisodeRangeStart.value = Math.max(0, Number(start) || 0)
}

function focusActiveButton(container) {
  const button = container?.querySelector?.('button.on')
  if (button && container) {
    const left = button.offsetLeft - (container.clientWidth - button.clientWidth) / 2
    container.scrollTo?.({ left: Math.max(0, left), behavior: 'smooth' })
  }
  button?.focus?.({ preventScroll: true })
}

function focusPlaybackContext(kind = 'line') {
  nextTick(() => {
    focusActiveButton(lineTabsEl.value)
    if (kind === 'channel') focusActiveButton(channelTabsEl.value)
  })
}

function applyHistorySeek(video) {
  const seek = Number(pendingSeekSec.value) || 0
  if (!video || seek < 20) return
  const total = Number(video.duration) || 0
  const target = total > 0 ? Math.min(Math.max(0, total - 8), seek) : seek
  try {
    video.currentTime = Math.max(0, target)
    currentTime.value = Math.max(0, target)
    pendingSeekSec.value = 0
    if (target > 0) showNotice(`已续播到 ${formatTime(target)}`)
  } catch {}
}

function syncPendingHistorySeek() {
  const h = activeLineHistory()
  pendingSeekSec.value = historyMatchesCurrentLine.value && Number(h?.epIndex) === Number(epIdx.value)
    ? Math.max(0, Number(h?.progressSec) || 0)
    : 0
}

function activeLineHistory(lineId = curChannel.value?.id) {
  const histories = Array.isArray(historyLineStates.value) ? historyLineStates.value : []
  const hit = histories.find(item => Number(item?.lineId || 0) === Number(lineId || 0))
  if (hit) return hit
  const h = historyState.value
  if (!h) return null
  if (h.lineId && lineId && Number(h.lineId) !== Number(lineId)) return null
  return h
}

function updateLocalHistory(progressSec, durationSecValue, options = {}) {
  const channel = options.channel || curChannel.value
  const historyEpIndex = Math.max(0, Number(options.epIndex ?? epIdx.value) || 0)
  if (!vod.value?.id || !channel?.id) return
  const ep = channel?.episodes?.[historyEpIndex]
  historyState.value = {
    ...(historyState.value || {}),
    vodId: vod.value.id,
    lineId: channel.id,
    epIndex: historyEpIndex,
    epName: options.epName || ep?.name || '',
    progressSec: Math.max(0, Math.floor(Number(progressSec) || 0)),
    durationSec: Math.max(0, Math.floor(Number(durationSecValue) || 0)),
  }
  historyLineStates.value = [
    historyState.value,
    ...historyLineStates.value.filter(item => Number(item?.lineId || 0) !== Number(historyState.value?.lineId || 0)),
  ]
  writeLocalHistory(historyState.value)
}

function applyHistorySelection(history, lineHistories = []) {
  historyState.value = history || null
  historyLineStates.value = Array.isArray(lineHistories) && lineHistories.length ? lineHistories : (history ? [history] : [])
  const h = historyState.value
  if (h?.lineId && vod.value.lines?.length) {
    for (let li = 0; li < vod.value.lines.length; li++) {
      const line = vod.value.lines[li]
      const channels = line?.channels?.length ? line.channels : [line]
      const ci = channels.findIndex(c => Number(c?.id) === Number(h.lineId))
      if (ci >= 0) {
        lineIdx.value = li
        chanIdx.value = ci
        break
      }
    }
  }
  epIdx.value = Math.max(0, Math.min(Number(h?.epIndex) || 0, episodes.value.length - 1))
  alignEpisodeRange(epIdx.value)
  syncPendingHistorySeek()
}

function applyRoutePlaybackSelection() {
  const requestedLineId = Number(route.query.line || 0)
  if (requestedLineId && vod.value.lines?.length) {
    for (let li = 0; li < vod.value.lines.length; li++) {
      const line = vod.value.lines[li]
      const channels = line?.channels?.length ? line.channels : [line]
      const directLineHit = Number(line?.id || 0) === requestedLineId
      const ci = directLineHit ? 0 : channels.findIndex(c => Number(c?.id || 0) === requestedLineId)
      if (ci >= 0) {
        lineIdx.value = li
        chanIdx.value = Math.max(0, ci)
        break
      }
    }
  }
  if (route.query.ep !== undefined || route.query.epIndex !== undefined) {
    const requestedEp = Math.max(0, Number(route.query.ep ?? route.query.epIndex) || 0)
    epIdx.value = Math.max(0, Math.min(requestedEp, Math.max(0, episodes.value.length - 1)))
  }
  alignEpisodeRange(epIdx.value)
  syncPendingHistorySeek()
}

function playDirect(url, kind = '', seq = nextPlaybackSeq()) {
  if (!isPlaybackCurrent(seq)) return
  clearPlaybackMedia()
  curUrl.value = url
  mode.value = kind === 'iframe' ? 'iframe' : 'hls'
  if (mode.value === 'iframe') return
  nextTick(() => {
    const video = videoEl.value
    if (!video || !isPlaybackCurrent(seq)) return
    resetSubtitleSelection()
    const isM3u8 = kind === 'm3u8' || /\.m3u8(\?|$)/i.test(url)
    const nativeHls = isM3u8 && video.canPlayType('application/vnd.apple.mpegurl')
    video.addEventListener('loadedmetadata', () => applyHistorySeek(video), { once: true })
    if (nativeHls) {
      video.src = url
      try { video.load() } catch {}
      video.playbackRate = playbackRate.value
      startVideo(video, seq)
    } else if (isM3u8 && Hls.isSupported()) {
      const hlsInstance = new Hls({ maxBufferLength: 180, maxMaxBufferLength: 180, capLevelToPlayerSize: true })
      hls = hlsInstance
      hlsInstance.attachMedia(video)
      hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (!isPlaybackCurrent(seq) || hls !== hlsInstance) return
        hlsInstance.loadSource(url)
      })
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!isPlaybackCurrent(seq) || hls !== hlsInstance) return
        refreshQualityOptions()
        if (qualityLevel.value >= 0) hlsInstance.currentLevel = qualityLevel.value
        video.playbackRate = playbackRate.value
        startVideo(video, seq)
      })
      hlsInstance.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        if (!isPlaybackCurrent(seq) || hls !== hlsInstance) return
        if (Number.isInteger(data?.level)) currentQualityLevel.value = data.level
        if (hlsInstance.autoLevelEnabled) qualityLevel.value = -1
        else if (Number.isInteger(data?.level)) qualityLevel.value = data.level
      })
      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (!isPlaybackCurrent(seq) || hls !== hlsInstance) return
        if (!data?.fatal) return
        handlePlaybackError()
      })
    } else {
      if (!isPlaybackCurrent(seq)) return
      video.src = url
      try { video.load() } catch {}
      video.playbackRate = playbackRate.value
      startVideo(video, seq)
    }
  })
}

function accessTitle(result) {
  const req = result?.requirement || {}
  const label = req.label || (req.kind === 'vip' ? 'VIP会员' : '指定会员等级')
  if (result?.code === 'login_required') return `登录后以${label}身份播放`
  if (result?.code === 'vip_required') return `需要${label}才能播放`
  if (result?.code === 'level_required' || result?.code === 'vip_or_level_required') return `需要${label}才能播放`
  return result?.error || '当前影片暂无观看权限'
}

function showAccessBlock(result) {
  stopPlayback()
  const loginRequired = result?.code === 'login_required'
  accessBlock.value = {
    code: result?.code || 'access_denied',
    title: accessTitle(result),
    desc: loginRequired ? '登录后会自动回到当前影片。' : '当前账号权限不足，请切换符合权限的会员等级。',
    actionText: loginRequired ? '登录后播放' : '查看会员',
  }
}

function handleAccessAction() {
  if (accessBlock.value?.code === 'login_required') {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: accessBlock.value.title })
    return
  }
  router.push('/m/me')
}

async function playCurrent(options = {}) {
  const channel = curChannel.value
  if (!vod.value?.id || !channel?.id) return
  const playEpIndex = Math.max(0, Math.min(epIdx.value, (channel.episodes || []).length - 1))
  const playEp = channel.episodes?.[playEpIndex]
  const seq = nextPlaybackSeq()
  const fresh = Boolean(options?.fresh)
  if (!fresh) selfHealTried = false
  resolving.value = true
  accessBlock.value = null
  closePlayFailure()
  subtitles.value = []
  comments.value = []
  ratingState.value = { avg: 0, count: 0, myScore: 0 }
  activeDanmakus.value = []
  danmakuRows.value = []
  danmakuLoadAt = 0
  resetSubtitleSelection()
  try {
    const result = await api.resolvePlay({ vodId: vod.value.id, playId: channel.id, epIndex: playEpIndex, ...(fresh ? { fresh: 1 } : {}) })
    if (!isPlaybackCurrent(seq)) return
    if (result?.ok && result.url) {
      currentResolve.value = result
      subtitles.value = Array.isArray(result.subtitles) ? result.subtitles : []
      resetSubtitleSelection()
      playingChannel.value = channel
      playingEpIndex.value = playEpIndex
      playingEpName.value = playEp?.name || ''
      playDirect(result.url, result.kind || '', seq)
      showControls(1800)
      saveHistory(0)
      return
    }
    if (['login_required', 'vip_required', 'level_required', 'vip_or_level_required'].includes(result?.code)) {
      showAccessBlock(result)
      return
    }
    await tryNextLine(result?.error || '当前集暂时无法播放')
  } catch {
    if (!isPlaybackCurrent(seq)) return
    await tryNextLine('解析播放地址失败')
  } finally {
    if (seq === playbackSeq) resolving.value = false
  }
}

function playEp(index) {
  pendingSeekSec.value = 0
  epIdx.value = Math.max(0, Math.min(index, episodes.value.length - 1))
  activeDanmakus.value = []
  danmakuRows.value = []
  danmakuLoadAt = 0
  alignEpisodeRange(epIdx.value)
  syncPendingHistorySeek()
  retryingLine = false
  selfHealTried = false
  playCurrent()
}

function selectLine(index) {
  const next = Math.max(0, Math.min(Number(index) || 0, (vod.value.lines || []).length - 1))
  if (lineIdx.value === next && chanIdx.value === 0) return
  saveHistory()
  lineIdx.value = next
  chanIdx.value = 0
  activeDanmakus.value = []
  danmakuRows.value = []
  danmakuLoadAt = 0
  epIdx.value = Math.max(0, Math.min(epIdx.value, episodes.value.length - 1))
  alignEpisodeRange(epIdx.value)
  syncPendingHistorySeek()
  retryingLine = false
  selfHealTried = false
  focusPlaybackContext('line')
}

function selectChannel(index) {
  const next = Math.max(0, Math.min(Number(index) || 0, channelOptions.value.length - 1))
  if (chanIdx.value === next) return
  saveHistory()
  chanIdx.value = next
  activeDanmakus.value = []
  danmakuRows.value = []
  danmakuLoadAt = 0
  epIdx.value = Math.max(0, Math.min(epIdx.value, episodes.value.length - 1))
  alignEpisodeRange(epIdx.value)
  syncPendingHistorySeek()
  retryingLine = false
  selfHealTried = false
  focusPlaybackContext('channel')
}

function tryJinpaiSelfHeal() {
  if (selfHealTried || currentResolve.value?.rule !== 'jinpai_client') return false
  selfHealTried = true
  const video = videoEl.value
  pendingSeekSec.value = Math.max(0, Math.floor(Number(video?.currentTime) || currentTime.value || 0))
  showNotice('播放异常，正在重新签名')
  void playCurrent({ fresh: true })
  return true
}

function handlePlaybackError() {
  if (tryJinpaiSelfHeal()) return
  void tryNextLine('播放失败')
}

function playbackSlots() {
  const slots = []
  for (let li = 0; li < (vod.value.lines || []).length; li++) {
    const line = vod.value.lines[li]
    const channels = line?.channels?.length ? line.channels : [line]
    for (let ci = 0; ci < channels.length; ci++) {
      const channel = channels[ci]
      if (!channel || channel.alive === false || !(channel.episodes || [])[epIdx.value]) continue
      slots.push({ li, ci, line, channel })
    }
  }
  return slots
}

async function probePlaybackUrl(url, kind = '') {
  if (!url || kind === 'iframe') return true
  if (!/\.m3u8(\?|$)/i.test(url)) return true
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    if (!/#EXTM3U/i.test(text.slice(0, 240))) throw new Error('非标准m3u8')
    return true
  } finally {
    window.clearTimeout(timer)
  }
}
function shouldProbeResolvedPlayback(result) {
  // 金牌源 m3u8 由客户端 IP 签名直连，预 fetch 会误判 403；交给播放器实际起播。
  return result?.rule !== 'jinpai_client'
}

async function tryNextLine(reason = '当前线路播放失败') {
  if (retryingLine || autoSwitchingLine) return false
  reportPlaybackError(reason, [{ playId: curChannel.value?.id, line: playbackLineLabel(), error: reason }], { event: 'current_line_failed' })
  showPlayFailure('线路异常', '当前线路播放失败，正在尝试备用线路。', true)
  const slots = playbackSlots()
  const failures = []
  const failMessage = '当前无可播放线路，请稍后重试'
  if (slots.length <= 1) {
    failures.push({ playId: curChannel.value?.id, line: playbackLineLabel(), error: reason })
    reportPlaybackError(failMessage, failures)
    showNotice(failMessage)
    showPlayFailure('播放失败', '当前影片没有可切换的备用线路，请稍后重试。')
    return false
  }
  retryingLine = true
  autoSwitchingLine = true
  const current = slots.findIndex(slot => slot.li === lineIdx.value && slot.ci === chanIdx.value)
  const seq = playbackSeq
  try {
    const totalAttempts = Math.max(0, slots.length * AUTO_SWITCH_MAX_ROUNDS)
    for (let step = 1; step <= totalAttempts; step++) {
      if (!isPlaybackCurrent(seq)) return false
      const next = slots[(Math.max(0, current) + step) % slots.length]
      if (!next?.channel || next.channel.alive === false || !next.channel.episodes?.length) continue
      if (next.li === lineIdx.value && next.ci === chanIdx.value) continue
      const nextEpIndex = Math.max(0, Math.min(epIdx.value, (next.channel.episodes || []).length - 1))
      const line = vod.value.lines?.[next.li]
      const label = [lineLabel(line, next.li), line?.channels?.length ? channelLabel(next.channel, next.ci) : ''].filter(Boolean).join(' · ')
      try {
        const result = await api.resolvePlay({ vodId: vod.value.id, playId: next.channel.id, epIndex: nextEpIndex, fresh: 1 })
        if (!isPlaybackCurrent(seq)) return false
        if (!result?.ok || !result.url) throw new Error(result?.error || '解析失败')
        currentResolve.value = result
        subtitles.value = Array.isArray(result.subtitles) ? result.subtitles : []
        resetSubtitleSelection()
        if (shouldProbeResolvedPlayback(result)) await probePlaybackUrl(result.url, result.kind || '')
        if (!isPlaybackCurrent(seq)) return false
        lineIdx.value = next.li
        chanIdx.value = next.ci
        epIdx.value = nextEpIndex
        alignEpisodeRange(epIdx.value)
        syncPendingHistorySeek()
        playingChannel.value = next.channel
        playingEpIndex.value = nextEpIndex
        playingEpName.value = next.channel.episodes?.[nextEpIndex]?.name || ''
        playDirect(result.url, result.kind || '', nextPlaybackSeq())
        focusPlaybackContext('line')
        showNotice(`已切换到可播放线路：${label}`)
        closePlayFailure()
        return true
      } catch (error) {
        const failure = {
          playId: next.channel.id,
          line: label,
          epIndex: nextEpIndex,
          error: error?.message || String(error || '播放失败'),
        }
        failures.push(failure)
        reportPlaybackError(failure.error, [failure], {
          playId: next.channel.id,
          lineName: label,
          sourceName: line?.sourceName || next.channel.sourceName || '',
          epIndex: nextEpIndex,
          epName: next.channel.episodes?.[nextEpIndex]?.name || '',
          event: 'fallback_line_failed',
        })
      }
    }
    reportPlaybackError(failMessage, failures)
    showNotice(failMessage)
    showPlayFailure('播放失败', failures.length ? `已尝试 ${failures.length} 条备用线路，仍无法播放。` : '当前无可播放线路，请稍后重试。')
    clearPlaybackMedia()
    return false
  } finally {
    retryingLine = false
    autoSwitchingLine = false
  }
}

function retryCurrentPlayback() {
  closePlayFailure()
  playCurrent()
}

function playFailureNext() {
  closePlayFailure()
  playNextEp()
}

function manualSwitchLine() {
  closePlayFailure()
  void tryNextLine('手动切换线路')
}

function saveHistory(progressOverride = null) {
  const historyChannel = playingChannel.value || curChannel.value
  const historyEpIndex = Math.max(0, Number(playingChannel.value ? playingEpIndex.value : epIdx.value) || 0)
  const historyEpName = playingChannel.value ? playingEpName.value : episodes.value[epIdx.value]?.name || ''
  if (!vod.value?.id || !historyChannel?.id || !curUrl.value) return
  const video = videoEl.value
  const progressSec = progressOverride === null ? Math.floor(Number(video?.currentTime) || 0) : progressOverride
  const durationSec = Math.floor(Number(video?.duration) || 0)
  if (Number(progressSec) >= 20 || Number(durationSec) > 0) {
    updateLocalHistory(progressSec, durationSec, { channel: historyChannel, epIndex: historyEpIndex, epName: historyEpName })
  }
  if (!user.value) return
  api.saveHistory({
    vodId: vod.value.id,
    lineId: historyChannel.id,
    epIndex: historyEpIndex,
    epName: historyEpName,
    progressSec,
    durationSec,
  }).catch(() => {})
}

function saveProgressSoon() {
  if (historyTimer) return
  historyTimer = window.setTimeout(() => {
    historyTimer = 0
    saveHistory()
  }, 15000)
}

async function toggleFollow() {
  if (!user.value) {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后追剧' })
    return
  }
  try {
    if (followed.value) await api.unfollowVod(vod.value.id)
    else await api.followVod(vod.value.id)
    followed.value = !followed.value
    notifySuccess(followed.value ? '已加入追剧' : '已取消追剧')
  } catch {
    notifyWarning('操作失败')
  }
}

async function loadVod(id) {
  const seq = ++loadSeq
  pageActive = true
  loading.value = true
  stopPlayback()
  vod.value = {}
  related.value = []
  accessBlock.value = null
  introOpen.value = false
  followed.value = false
  lineIdx.value = 0
  chanIdx.value = 0
  epIdx.value = 0
  activeEpisodeRangeStart.value = 0
  historyState.value = null
  historyLineStates.value = []
  userSkipPreference.value = null
  pendingSeekSec.value = 0
  playingChannel.value = null
  playingEpIndex.value = 0
  playingEpName.value = ''
  closePlayFailure()
  subtitles.value = []
  resetSubtitleSelection()
  try {
    const data = await api.vod(id)
    if (seq !== loadSeq || !pageActive || !isPlayRoute()) return
    vod.value = data || {}
    userSkipPreference.value = readLocalSkipPreference(id)
    applyHistorySelection(readLocalHistory(id), readLocalLineHistories(id))
    await nextTick()
    if (seq !== loadSeq || !pageActive || !isPlayRoute()) return
    if (user.value) {
      try {
        const state = await api.userVodState(id)
        if (seq !== loadSeq || !pageActive || !isPlayRoute()) return
        followed.value = Boolean(state?.followed)
        userSkipPreference.value = state?.skipPreference || readLocalSkipPreference(id)
        const h = state?.history
        if (h) applyHistorySelection(h, state?.lineHistories)
      } catch {}
    }
    applyRoutePlaybackSelection()
    alignEpisodeRange(epIdx.value)
    if (vod.value.lines?.length) playCurrent()
    await loadVodInteractions(vod.value.id)
    const items = await api.related({ id, type: vod.value.typeName, sub: vod.value.subType, limit: 8 }).catch(() => [])
    if (seq !== loadSeq || !pageActive || !isPlayRoute()) return
    related.value = items
  } catch {
    if (seq !== loadSeq || !pageActive || !isPlayRoute()) return
    showNotice('影片不存在或已下架')
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(() => route.params.id, (id) => {
  if (isPlayRoute() && id) loadVod(id)
})
watch(effectivePlayConfig, () => {
  syncSkipDrafts()
  resetSubtitleSelection()
}, { deep: true, immediate: true })
watch(() => route.path, (path) => {
  if (String(path || '').startsWith('/m/play')) return
  pageActive = false
  loadSeq += 1
  stopPlayback()
  resetLandscape()
})
onMounted(() => {
  pageActive = true
  nextTick(() => {
    bindVideoTapEvents()
    updatePictureInPictureSupport()
  })
  void refreshPlayConfig()
  if (isPlayRoute() && route.params.id) loadVod(route.params.id)
})
onActivated(() => {
  pageActive = true
  if (isPlayRoute() && route.params.id && !curUrl.value && !loading.value) {
    loadVod(route.params.id)
  }
})
onBeforeUnmount(() => {
  pageActive = false
  loadSeq += 1
  stopPlayback()
  resetLandscape()
  if (noticeTimer) clearTimeout(noticeTimer)
  if (historyTimer) clearTimeout(historyTimer)
  if (controlsTimer) clearTimeout(controlsTimer)
})
onDeactivated(() => {
  pageActive = false
  loadSeq += 1
  stopPlayback()
  resetLandscape()
})
</script>

<style scoped>
.mp {
  min-height: 100dvh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: calc(22px + env(safe-area-inset-bottom));
  background-color: #fff;
  background-image: linear-gradient(180deg, #000 0, #000 env(safe-area-inset-top), #fff env(safe-area-inset-top), #fff 100%);
  color: #15171d;
}
.mp-player {
  position: relative;
  aspect-ratio: 16 / 9;
  height: auto;
  min-height: 0;
  margin: 0;
  overflow: hidden;
  background-color: #08090d;
  background-size: cover;
  background-position: center;
  --mp-safe-top: 0px;
  --mp-safe-right: 0px;
  --mp-safe-bottom: 0px;
  --mp-safe-left: 0px;
  --mp-edge-x: clamp(8px, 2.3vmin, 18px);
  --mp-top-gap: clamp(5px, 1.7vmin, 12px);
  --mp-bottom-gap: clamp(3px, 1.2vmin, 8px);
  --mp-top-btn: clamp(34px, 8.6vmin, 42px);
  --mp-bottom-btn: clamp(28px, 7.2vmin, 36px);
  --mp-control-gap: clamp(3px, 1.1vmin, 6px);
}
.mp-player.landscape {
  position: fixed;
  z-index: 1000;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  aspect-ratio: auto;
  --mp-safe-top: env(safe-area-inset-top);
  --mp-safe-right: env(safe-area-inset-right);
  --mp-safe-bottom: env(safe-area-inset-bottom);
  --mp-safe-left: env(safe-area-inset-left);
  --mp-edge-x: clamp(10px, 2.5vmin, 24px);
  --mp-top-gap: clamp(6px, 1.8vmin, 16px);
  --mp-bottom-gap: clamp(2px, 1.1vmin, 10px);
  --mp-top-btn: clamp(36px, 7vmin, 46px);
  --mp-bottom-btn: clamp(30px, 6vmin, 38px);
}
/* 横片 + 手机处于竖屏且方向锁定未生效时，旋转整个播放器舞台，控制层跟随横屏坐标 */
@media (orientation: portrait) {
  .mp-player.landscape:not(.portrait) {
    inset: auto;
    top: 50%;
    left: 50%;
    width: 100dvh;
    height: 100vw;
    transform: translate(-50%, -50%) rotate(90deg);
    transform-origin: center center;
    --mp-safe-top: 0px;
    --mp-safe-right: env(safe-area-inset-top);
    --mp-safe-bottom: 0px;
    --mp-safe-left: env(safe-area-inset-bottom);
  }
}
.mp-bg {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,.46);
  backdrop-filter: blur(12px);
}
.mp-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}
.mp-video::cue {
  color: var(--mp-subtitle-color, #fff);
  background: var(--mp-subtitle-bg, rgba(0,0,0,.55));
  font-size: var(--mp-subtitle-size, 22px);
  line-height: 1.38;
  text-shadow: 0 2px 5px rgba(0,0,0,.9);
}
.mp-topbar {
  position: absolute;
  z-index: 10;
  top: calc(var(--mp-safe-top) + var(--mp-top-gap));
  left: calc(var(--mp-safe-left) + var(--mp-edge-x));
  right: calc(var(--mp-safe-right) + var(--mp-edge-x));
  display: grid;
  grid-template-columns: var(--mp-top-btn) minmax(0, 1fr) var(--mp-top-btn);
  align-items: center;
  gap: clamp(4px, 1.2vmin, 10px);
  color: #fff;
  pointer-events: none;
}
.mp-topbar strong {
  min-width: 0;
  overflow: hidden;
  color: rgba(255,255,255,.94);
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
  line-height: 1.2;
  text-overflow: ellipsis;
  text-shadow: 0 1px 8px rgba(0,0,0,.72);
  white-space: nowrap;
}
.mp-icon-btn {
  border: 0;
  background: transparent;
  box-shadow: none;
  color: #fff;
  pointer-events: auto;
}
.mp-icon-btn svg { filter: drop-shadow(0 1px 6px rgba(0,0,0,.72)); }
.mp-landscape-btn {
  padding: 0;
  display: grid;
  place-items: center;
}
.mp-landscape-btn svg {
  width: 23px;
  height: 23px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mp-landscape-btn .mp-ratio-icon {
  fill: currentColor;
  stroke: none;
}
.mp-state,
.mp-lock,
.mp-play {
  position: absolute;
  z-index: 6;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
.mp-state {
  display: grid;
  justify-items: center;
  gap: 10px;
  color: rgba(255,255,255,.9);
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
}
.mp-state div {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid rgba(255,255,255,.24);
  border-top-color: #fff;
  animation: mp-spin .8s linear infinite;
}
.mp-play {
  width: 72px;
  height: 72px;
  border: 0;
  background: transparent;
  color: #fff;
}
.mp-play svg {
  width: 60px;
  height: 60px;
  fill: currentColor;
  stroke: none;
  opacity: .8;
  margin-left: 4px;
  filter: drop-shadow(0 8px 18px rgba(0,0,0,.46));
}
.mp-center-controls {
  position: absolute;
  z-index: 9;
  left: 50%;
  top: 50%;
  display: grid;
  grid-template-columns: 46px 62px 46px;
  align-items: center;
  gap: 22px;
  transform: translate(-50%, -50%);
}
.mp-round-btn {
  width: 46px;
  height: 46px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(0,0,0,.26);
  backdrop-filter: blur(8px);
}
.mp-round-btn:disabled {
  opacity: .35;
}
.mp-round-btn svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mp-round-main {
  width: 62px;
  height: 62px;
  background: rgba(0,0,0,.34);
}
.mp-round-main svg {
  width: 34px;
  height: 34px;
  fill: currentColor;
  stroke: none;
  opacity: .86;
}
.mp-bottom-controls {
  position: absolute;
  z-index: 9;
  left: 0;
  right: 0;
  bottom: 0;
  min-height: 0;
  padding: var(--mp-bottom-gap) calc(var(--mp-safe-right) + var(--mp-edge-x)) calc(var(--mp-safe-bottom) + var(--mp-bottom-gap)) calc(var(--mp-safe-left) + var(--mp-edge-x));
  color: #fff;
  background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.76));
}
.mp-control-stack {
  display: grid;
  gap: var(--mp-control-gap);
  min-width: 0;
}
.mp-control-row {
  display: flex;
  align-items: center;
  gap: var(--mp-control-gap);
  min-width: 0;
}
.mp-control-btn {
  flex: 0 0 var(--mp-bottom-btn);
  width: var(--mp-bottom-btn);
  height: var(--mp-bottom-btn);
  border: 0;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #fff;
  background: transparent;
}
.mp-control-btn:disabled {
  opacity: .35;
}
.mp-control-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.1;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mp-play-toggle svg {
  width: 24px;
  height: 24px;
  fill: currentColor;
  stroke: none;
}
.mp-quality-btn {
  flex-basis: auto;
  width: auto;
  min-width: 42px;
  max-width: 58px;
  padding: 0 5px;
}
.mp-quality-btn span,
.mp-quality-readonly {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #fff;
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
  line-height: 1;
}
.mp-quality-readonly {
  flex: 0 1 auto;
  max-width: 58px;
  padding: 0 3px;
}
.mp-control-spacer {
  flex: 1 1 8px;
  min-width: 4px;
}
.mp-iframe-full {
  margin-left: auto;
}
.mp-range {
  min-width: 0;
  width: 100%;
  height: clamp(14px, 3.6vmin, 20px);
  margin: 0;
  appearance: none;
  background: transparent;
}
.mp-range::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, #f04438 var(--progress), rgba(255,255,255,.34) 0);
}
.mp-range::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4.5px;
  border-radius: 50%;
  background: #fff;
}
.mp-range::-moz-range-track {
  height: 3px;
  border-radius: 999px;
  background: rgba(255,255,255,.34);
}
.mp-range::-moz-range-progress {
  height: 3px;
  border-radius: 999px;
  background: #f04438;
}
.mp-range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 0;
  border-radius: 50%;
  background: #fff;
}
.mp-time {
  flex: 0 0 auto;
  color: rgba(255,255,255,.82);
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.mp-time-combo {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-menu-sheet-mask {
  position: fixed;
  z-index: 1300;
  inset: 0;
  display: flex;
  align-items: flex-end;
  padding: 18px 10px calc(10px + env(safe-area-inset-bottom));
  background: rgba(0,0,0,.46);
}
.mp-menu {
  width: 100%;
  max-height: min(72dvh, 520px);
  padding: 14px;
  border-radius: 18px 18px 12px 12px;
  display: grid;
  gap: 13px;
  overflow-y: auto;
  overscroll-behavior: contain;
  color: #fff;
  background: rgba(22,22,24,.98);
  backdrop-filter: blur(16px);
  box-shadow: 0 -16px 40px rgba(0,0,0,.36);
}
.mp-menu header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.mp-menu header strong {
  font-size: 16px;
  line-height: 1;
}
.mp-menu header button {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: rgba(255,255,255,.82);
  background: rgba(255,255,255,.1);
}
.mp-menu header svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
}
.mp-menu section {
  display: grid;
  gap: 8px;
}
.mp-menu h3 {
  margin: 0;
  color: rgba(255,255,255,.72);
  font-size: 12px;
  line-height: 1;
}
.mp-menu-speeds {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}
.mp-menu-speeds button,
.mp-menu-cast {
  height: 32px;
  border: 0;
  border-radius: 9px;
  color: rgba(255,255,255,.84);
  background: rgba(255,255,255,.1);
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-menu-speeds button.on {
  color: #fff;
  background: #f04438;
}
.mp-menu-toggle {
  min-height: 34px;
  border-radius: 10px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: rgba(255,255,255,.86);
  background: rgba(255,255,255,.08);
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-menu-toggle input {
  display: none;
}
.mp-menu-toggle i {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: rgba(255,255,255,.2);
  flex: 0 0 auto;
}
.mp-menu-toggle i::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform .16s ease;
}
.mp-menu-toggle input:checked + i {
  background: #f04438;
}
.mp-menu-toggle input:checked + i::after {
  transform: translateX(16px);
}
.mp-skip-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.mp-skip-grid label {
  min-width: 0;
  height: 34px;
  border-radius: 9px;
  padding: 0 7px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255,255,255,.82);
  background: rgba(255,255,255,.08);
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-skip-grid input {
  min-width: 0;
  width: 48px;
  height: 24px;
  margin-left: auto;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 7px;
  color: #fff;
  background: rgba(0,0,0,.24);
  text-align: center;
  outline: none;
}
.mp-skip-grid input::-webkit-outer-spin-button,
.mp-skip-grid input::-webkit-inner-spin-button {
  margin: 0;
}
.mp-menu-reset {
  width: 100%;
  height: 32px;
  border: 0;
  border-radius: 9px;
  color: rgba(255,255,255,.78);
  background: rgba(255,255,255,.08);
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-menu-subtitles {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.mp-menu-subtitles::-webkit-scrollbar {
  display: none;
}
.mp-menu-subtitles button {
  flex: 0 0 auto;
  max-width: 116px;
  height: 30px;
  border: 0;
  border-radius: 9px;
  padding: 0 9px;
  color: rgba(255,255,255,.8);
  background: rgba(255,255,255,.1);
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-menu-subtitles button.on {
  color: #fff;
  background: #f04438;
}
.mp-menu-cast {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.mp-menu-cast svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.1;
}
.mp-lock {
  width: min(320px, calc(100vw - 42px));
  padding: 22px;
  border-radius: 18px;
  display: grid;
  gap: 10px;
  color: #fff;
  text-align: center;
  background: rgba(10,10,12,.82);
  backdrop-filter: blur(18px);
}
.mp-lock strong {
  font-size: 17px;
  line-height: 1.35;
}
.mp-lock p {
  margin: 0;
  color: rgba(255,255,255,.72);
  font-size: 13px;
  line-height: 1.5;
}
.mp-lock button {
  height: 40px;
  border: 0;
  border-radius: 999px;
  color: #fff;
  background: #f04438;
  font-weight: 900;
}
.mp-notice {
  position: absolute;
  z-index: 8;
  left: 50%;
  bottom: calc(var(--mp-safe-bottom) + var(--mp-bottom-gap) + var(--mp-bottom-btn) + clamp(12px, 3vmin, 24px));
  transform: translateX(-50%);
  max-width: calc(100% - var(--mp-safe-left) - var(--mp-safe-right) - 32px);
  padding: 8px 12px;
  border-radius: 999px;
  color: #fff;
  background: rgba(0,0,0,.56);
  backdrop-filter: blur(12px);
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
  white-space: nowrap;
}
.mp-failure {
  position: absolute;
  z-index: 11;
  left: 50%;
  top: 50%;
  width: min(318px, calc(100vw - 42px));
  transform: translate(-50%, -50%);
  padding: 18px;
  border-radius: 18px;
  color: #fff;
  text-align: center;
  background: rgba(10,10,12,.86);
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 48px rgba(0,0,0,.36);
}
.mp-failure strong {
  display: block;
  font-size: 17px;
  line-height: 1.3;
}
.mp-failure p {
  margin: 8px 0 14px;
  color: rgba(255,255,255,.72);
  font-size: 13px;
  line-height: 1.5;
}
.mp-failure div {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}
.mp-failure button {
  min-width: 68px;
  height: 34px;
  border: 0;
  border-radius: 999px;
  color: #fff;
  background: rgba(255,255,255,.12);
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-failure button:first-child {
  background: #f04438;
}
.mp-seek-preview {
  position: absolute;
  z-index: 9;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 10px 18px;
  border-radius: 12px;
  color: #fff;
  background: rgba(0,0,0,.66);
  backdrop-filter: blur(12px);
  font-size: 16px;
  font-weight: 800;
  letter-spacing: .5px;
  white-space: nowrap;
  pointer-events: none;
}
.mp-info,
.mp-panel {
  margin: 0;
  border-radius: 0;
  background: #fff;
  box-shadow: none;
  border-top: 8px solid #f5f6f8;
}
.mp-info {
  padding: 14px 14px 16px;
  border-top: 0;
}
.mp-danmaku-layer {
  position: absolute;
  inset: 0;
  z-index: 7;
  overflow: hidden;
  pointer-events: none;
}
.mp-danmaku-layer span {
  position: absolute;
  max-width: var(--mp-danmaku-width, 70vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: max-content;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0,0,0,.24);
  color: #fff;
  opacity: var(--mp-danmaku-opacity, .75);
  font-size: var(--mp-danmaku-font-size, 16px);
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0,0,0,.85);
}
.mp-danmaku-layer span.mode-scroll {
  left: 100%;
  animation: mpDanmakuMove var(--mp-danmaku-duration, 7s) linear forwards;
}
.mp-danmaku-layer span.mode-top,
.mp-danmaku-layer span.mode-bottom {
  left: 50%;
  transform: translateX(-50%);
  animation: mpDanmakuHold var(--mp-danmaku-duration, 7s) linear forwards;
}
@keyframes mpDanmakuMove {
  from { transform: translateX(0); }
  to { transform: translateX(calc(-100vw - 100%)); }
}
@keyframes mpDanmakuHold {
  0% { opacity: 0; }
  12%, 88% { opacity: var(--mp-danmaku-opacity, .75); }
  100% { opacity: 0; }
}
.mp-toolbar-panel {
  padding: 8px 0 10px;
  background: #111216;
  border-top: 0;
  border-bottom: 8px solid #f5f6f8;
}
.mp-action-panel {
  padding: 10px 0 12px;
  background: #fff;
  border-bottom: 8px solid #f5f6f8;
}
.mp-action-strip {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 14px;
  overflow: visible;
}
.mp-action-strip button {
  flex: 0 0 58px;
  height: 44px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #535b68;
  font-size: 11px;
  font-weight: 800;
}
.mp-action-strip button.on {
  background: #f0f2f5;
  color: #11151d;
}
.mp-action-strip svg {
  width: 18px;
  height: 18px;
}
.mp-toolbar-danmaku {
  display: grid;
  grid-template-columns: 32px 32px minmax(0, 1fr) 50px;
  gap: 6px;
  align-items: center;
  padding: 0 10px;
}
.mp-toolbar-danmaku button,
.mp-comment-input button,
.mp-report button {
  height: 32px;
  border: 0;
  border-radius: 10px;
  padding: 0 12px;
  background: #1f232b;
  color: #fff;
  font-weight: 900;
}
.mp-toolbar-danmaku .mp-danmaku-icon-btn {
  width: 32px;
  padding: 0;
  display: grid;
  place-items: center;
  color: rgba(255,255,255,.68);
  background: rgba(255,255,255,.08);
}
.mp-toolbar-danmaku .mp-danmaku-icon-btn svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mp-toolbar-danmaku .mp-danmaku-toggle-btn svg {
  width: 21px;
  height: 21px;
}
.mp-toolbar-danmaku button.on {
  background: rgba(255,255,255,.18);
  color: #fff;
}
.mp-toolbar-danmaku button:disabled,
.mp-comment-input button:disabled {
  opacity: .55;
}
.mp-toolbar-danmaku input,
.mp-comment-input input,
.mp-report select,
.mp-report textarea {
  min-width: 0;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  background: #f7f8fa;
  color: #1f232b;
  outline: 0;
}
.mp-toolbar-danmaku input,
.mp-comment-input input {
  height: 34px;
  padding: 0 10px;
}
.mp-toolbar-danmaku input {
  border-color: rgba(255,255,255,.1);
  color: #fff;
  background: rgba(255,255,255,.08);
  font-size: 13px;
}
.mp-toolbar-danmaku input::placeholder {
  color: rgba(255,255,255,.42);
}
.mp-danmaku-send {
  min-width: 0;
  padding: 0 8px !important;
  font-size: 12px;
}
.mp-danmaku-settings-mask {
  position: fixed;
  z-index: 1300;
  inset: 0;
  display: flex;
  align-items: flex-end;
  padding: 18px 10px calc(10px + env(safe-area-inset-bottom));
  background: rgba(0,0,0,.46);
}
.mp-danmaku-settings {
  width: 100%;
  max-height: min(72dvh, 520px);
  padding: 14px;
  border-radius: 18px 18px 12px 12px;
  display: grid;
  gap: 12px;
  overflow-y: auto;
  color: #fff;
  background: rgba(22,22,24,.98);
  box-shadow: 0 -16px 40px rgba(0,0,0,.36);
  backdrop-filter: blur(16px);
}
.mp-danmaku-settings header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.mp-danmaku-settings header strong {
  font-size: 16px;
  line-height: 1;
}
.mp-danmaku-settings header button {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: rgba(255,255,255,.82);
  background: rgba(255,255,255,.1);
}
.mp-danmaku-settings header svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
}
.mp-danmaku-setting-group {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}
.mp-danmaku-setting-group > span {
  color: rgba(255,255,255,.62);
  font-size: 12px;
}
.mp-danmaku-setting-group > div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.mp-danmaku-setting-group button {
  height: 28px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  color: rgba(255,255,255,.78);
  background: rgba(255,255,255,.08);
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-danmaku-setting-group button.on {
  color: #111;
  background: #fff;
}
.mp-comment-section {
  border-bottom: 8px solid #f5f6f8;
}
.mp-comment-login {
  display: block;
  margin-bottom: 14px;
}
.mp-comment-login button {
  min-width: 0;
  min-height: 58px;
  border: 0;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 8px 10px;
  background: #f7f8fa;
  color: #697180;
  font-size: 12px;
  line-height: 1.35;
  flex-wrap: wrap;
}
.mp-comment-login b {
  display: inline-grid;
  place-items: center;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #1f232b;
  border-radius: 6px;
  color: #1f232b;
}
.mp-comment-compose {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}
.mp-rating {
  display: flex;
  align-items: center;
  gap: 3px;
}
.mp-rating button {
  border: 0;
  background: transparent;
  color: #d3d7df;
  font-size: 22px;
}
.mp-rating button.on {
  color: #ffc233;
}
.mp-rating span {
  min-width: 0;
  color: #7b8492;
  font-size: 12px;
}
.mp-comment-input {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px;
  gap: 7px;
}
.mp-comment-tabs { display: flex; gap: 22px; margin: 4px 0 14px; }
.mp-comment-tabs button { border: 0; background: transparent; color: #7b8492; font-size: 14px; font-weight: 800; }
.mp-comment-tabs button.active { color: #1f232b; }
.mp-comments {
  display: grid;
  gap: 8px;
}
.mp-comments article {
  display: grid;
  gap: 4px;
  padding: 9px;
  border-radius: 10px;
  background: #f7f8fa;
}
.mp-comments b {
  color: #1f232b;
  font-size: 12px;
}
.mp-comments p {
  margin: 0;
  color: #535b68;
  font-size: 13px;
  line-height: 1.45;
}
.mp-comment-empty {
  min-height: 96px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #f7f8fa;
  color: #7b8492;
  font-size: 12px;
}
.mp-report-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(0,0,0,.55);
}
.mp-report {
  width: 100%;
  max-width: 360px;
  display: grid;
  gap: 10px;
  padding: 16px;
  border-radius: 16px;
  background: #fff;
}
.mp-report strong {
  color: #1f232b;
}
.mp-report select {
  height: 36px;
  padding: 0 10px;
}
.mp-report textarea {
  min-height: 92px;
  padding: 10px;
}
.mp-report div {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.mp-title-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.mp-title-row > div {
  min-width: 0;
  flex: 1;
}
.mp-title-row h1 {
  margin: 0;
  font-size: 18px;
  line-height: 1.22;
  letter-spacing: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mp-title-row p {
  margin: 8px 0 0;
  display: flex;
  flex-wrap: nowrap;
  gap: 5px;
  max-width: 100%;
  overflow: hidden;
  color: #767b86;
  font-size: 11px;
  font-weight: var(--small-text-max-weight);
  white-space: nowrap;
}
.mp-title-row p span {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  padding: 4px 6px;
  border-radius: 8px;
  background: #f2f3f5;
  text-overflow: ellipsis;
}
.mp-title-actions {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.mp-credit-list {
  margin: 12px 0 0;
  display: grid;
  gap: 7px;
}
.mp-credit-list p {
  margin: 0;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  color: #535966;
  font-size: 13px;
  line-height: 1.5;
}
.mp-credit-list span {
  color: #8a909a;
  font-weight: var(--small-text-max-weight);
}
.mp-credit-list b {
  min-width: 0;
  color: #313641;
  font-weight: var(--small-text-max-weight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-follow {
  flex: 0 0 auto;
  min-width: 62px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #f04438;
  background: #fff0ed;
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-follow.on {
  color: #fff;
  background: #f04438;
}
.mp-follow svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
}
.mp-like {
  flex: 0 0 auto;
  min-width: 58px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #535b68;
  background: #f2f3f5;
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-like.on {
  color: #fff;
  background: #f04438;
}
.mp-like svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}
.mp-intro {
  margin: 10px 0 0;
  color: #535966;
  font-size: 14px;
  line-height: 1.72;
}
.mp-intro.folded {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mp-panel {
  padding: 16px 14px 18px;
}
.mp-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.mp-panel h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1;
}
.mp-panel header span {
  color: #8a8f99;
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-lines-panel {
  padding-bottom: 14px;
}
.mp-line-tabs,
.mp-channel-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.mp-line-tabs::-webkit-scrollbar,
.mp-channel-tabs::-webkit-scrollbar {
  display: none;
}
.mp-channel-tabs {
  margin-top: 10px;
}
.mp-line-tabs button,
.mp-channel-tabs button {
  flex: 0 0 auto;
  max-width: 128px;
  height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 13px;
  color: #4b515c;
  background: #f2f3f5;
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-line-tabs button.on,
.mp-channel-tabs button.on {
  color: #fff;
  background: #15171d;
}
.mp-episode-ranges {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 0 0 10px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.mp-episode-ranges::-webkit-scrollbar {
  display: none;
}
.mp-episode-ranges button {
  flex: 0 0 auto;
  height: 32px;
  border: 0;
  border-radius: 999px;
  padding: 0 12px;
  color: #606874;
  background: #f2f3f5;
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mp-episode-ranges button.on {
  color: #fff;
  background: #15171d;
}
.mp-episode-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.mp-episode-grid button {
  position: relative;
  min-width: 0;
  height: 42px;
  border: 0;
  border-radius: 11px;
  color: #4b515c;
  background: #f2f3f5;
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
  overflow: hidden;
}
.mp-episode-grid button span {
  position: relative;
  z-index: 1;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-episode-grid button em {
  position: relative;
  z-index: 1;
  display: block;
  margin-top: 2px;
  font-size: 10px;
  font-style: normal;
  line-height: 1;
  opacity: .86;
}
.mp-episode-grid button i {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  border-radius: 0 999px 999px 0;
  background: #f04438;
}
.mp-episode-grid button.resume:not(.on) {
  color: #f04438;
  background: #fff0ed;
}
.mp-episode-grid button.on {
  color: #fff;
  background: #f04438;
}
.mp-episode-grid button.on i {
  background: rgba(255,255,255,.72);
}
.mp-stills {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 74%;
  gap: 10px;
  overflow-x: auto;
}
.mp-stills img {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 13px;
  object-fit: cover;
  background: #eceef2;
}
.mp-related {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 9px;
}
.mp-related article {
  min-width: 0;
}
.mp-related img {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 12px;
  object-fit: cover;
  background: #eceef2;
}
.mp-related strong {
  display: block;
  margin-top: 7px;
  color: var(--mobile-vod-card-title-color);
  font-size: var(--mobile-vod-card-title-size);
  font-weight: var(--mobile-vod-card-title-weight);
  line-height: var(--mobile-vod-card-title-line);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-related span {
  display: block;
  margin-top: 3px;
  color: #8a8f99;
  font-size: 11px;
  font-weight: var(--small-text-max-weight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@keyframes mp-spin {
  to { transform: rotate(360deg); }
}
</style>
