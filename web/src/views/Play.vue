<template>
  <div class="page play-wrap" v-if="vod.id">
    <!-- 左：播放器 + 选集 + 信息 -->
    <div class="player-col">
      <div class="player-box" :class="{locked: accessBlock}">
        <div v-if="accessBlock" class="play-lock-bg" :style="playerBackdropStyle"></div>
        <div v-if="accessBlock" class="play-lock">
          <div class="play-lock-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
          </div>
          <div class="play-lock-title">{{ accessBlock.title }}</div>
          <div class="play-lock-desc">{{ accessBlock.desc }}</div>
          <button class="play-lock-btn" type="button" @click="handleAccessAction">{{ accessBlock.actionText }}</button>
        </div>
        <DesktopVideoPlayer
          v-if="!accessBlock"
          ref="playerRef"
          :src="curUrl"
          :kind="mode"
          :poster="pic(vod)"
          :title="currentPlayTitle"
          :qualities="qualities"
          :selected-quality="preferredRes"
          :subtitles="subtitles"
          :play-config="effectivePlayConfig"
          :resolving="resolving"
          :notice="playNotice"
          :can-next="canPlayNextEp"
          :seek-to="pendingSeekSec"
          @play="playResolvedEp(epIdx)"
          @next="playNextEp"
          @state="onPlayerState"
          @ended="onPlayerEnded"
          @error="onPlayerError"
          @quality-change="switchQuality"
          @skip-change="saveSkipPreference"
          @skip-reset="resetSkipPreference"
        />
        <div v-if="interactionConfig.danmakuEnabled && danmakuVisible" class="pc-danmaku-layer" aria-hidden="true">
          <span v-for="item in activeDanmakus" :key="`pc-dm-${item.id}-${item._nonce || 0}`" :style="{ top: item.top, color: item.color || '#fff' }">{{ item.content }}</span>
        </div>
        <div v-if="playFailure.open && !accessBlock" class="play-failure-dialog">
          <strong>{{ playFailure.title }}</strong>
          <p>{{ playFailure.message }}</p>
          <div>
            <button type="button" @click="retryCurrentPlayback">重试</button>
            <button v-if="canPlayNextEp" type="button" @click="playFailureNext">下一集</button>
            <button type="button" @click="playFailure.open = false">关闭</button>
          </div>
        </div>
      </div>
      <div class="pc-under-player-toolbar">
        <div class="pc-toolbar-left">
          <button v-if="interactionConfig.ratingsEnabled" type="button" :class="{ on: myRating >= 10 }" title="点赞" @click="submitRating(10)">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 21H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h4v11Zm2 0V10.5l4.1-7.2a1.7 1.7 0 0 1 3.1.95V9h2.2a2.6 2.6 0 0 1 2.55 3.1l-1.2 6.2A3.4 3.4 0 0 1 18.4 21H11Z" /></svg>
            <span>点赞</span>
          </button>
          <button v-if="interactionConfig.ratingsEnabled" type="button" :class="{ on: myRating > 0 && myRating <= 2 }" title="点踩" @click="submitRating(2)">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 3H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h4V3Zm2 0v10.5l4.1 7.2a1.7 1.7 0 0 0 3.1-.95V15h2.2a2.6 2.6 0 0 0 2.55-3.1l-1.2-6.2A3.4 3.4 0 0 0 18.4 3H11Z" /></svg>
            <span>点踩</span>
          </button>
          <button v-if="interactionConfig.commentsEnabled" type="button" title="评论" @click="scrollToComments">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>
            <span>评论</span>
          </button>
          <button type="button" :class="{ on: followed }" title="收藏" @click="toggleFollow">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5s-7.5-4.4-9.4-9A5.1 5.1 0 0 1 11.7 7l.3.4.3-.4a5.1 5.1 0 0 1 9.1 4.5c-1.9 4.6-9.4 9-9.4 9Z" /></svg>
            <span>收藏</span>
          </button>
          <button v-if="interactionConfig.reportsEnabled" type="button" title="报错" @click="openReport('play', curChannel?.id || vod.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.3 3.7 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
            <span>报错</span>
          </button>
          <button type="button" title="分享" @click="shareCurrentVod">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.6 6.8-4.2" /><path d="m8.6 13.4 6.8 4.2" /></svg>
            <span>分享</span>
          </button>
          <button type="button" title="添加" @click="openMyList">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
            <span>添加</span>
          </button>
        </div>
        <div v-if="interactionConfig.danmakuEnabled" class="pc-toolbar-danmaku">
          <button type="button" :class="{ on: danmakuVisible }" @click="danmakuVisible = !danmakuVisible">{{ danmakuVisible ? '弹幕开' : '弹幕关' }}</button>
          <input v-model.trim="danmakuText" maxlength="80" placeholder="发个弹幕..." @keyup.enter="submitDanmaku" />
          <button type="button" :disabled="danmakuSubmitting" @click="submitDanmaku">{{ danmakuSubmitting ? '发送中' : '发送' }}</button>
        </div>
      </div>

      <div class="now-playing" v-if="curEp">
        <div class="now-playing-text">
          正在播放：<b>{{ vod.name }}</b> · {{ curLine?.sourceName }}<span v-if="curLine?.channels?.length>1"> · {{ chanIdx===0?'推荐通道':'线路'+(chanIdx+1) }}</span> · {{ curEp.name }}
        </div>
        <div class="episode-nav">
          <button type="button" :disabled="!canPlayPrevEp" @click="playPrevEp">上一集</button>
          <button type="button" :disabled="!canPlayNextEp" @click="playNextEp">下一集</button>
        </div>
      </div>

      <!-- 标题信息条 -->
      <div class="pv-head">
        <div class="pv-poster" v-if="vod.officialPic || vod.pic || vod.localPic">
          <img :src="pic(vod)" :alt="vod.name" @error="onErr($event, fallbackPic(vod))" />
        </div>
        <div class="pv-meta">
          <h1 class="pv-title">{{ vod.name }}
            <span v-if="vod.rating" class="db-rating">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.6z"/></svg>
              {{ vod.rating }}
            </span>
          </h1>
          <div class="pv-tags">
            <span class="t">{{ vod.year || '—' }}</span>
            <span class="t">{{ vod.typeName || '未分类' }}</span>
            <span class="t" v-if="vod.area">{{ vod.area }}</span>
            <span class="t accent">{{ vod.lines.length }} 条线路</span>
          </div>
          <p class="pv-line update-line" v-if="vod.remarks">更新：{{ vod.remarks }}</p>
          <div class="people-line" v-if="directors.length">
            <span class="people-label">导演</span>
            <button v-for="p in directors" :key="'d'+p.id" class="person-chip" @click="searchPerson(p.person.name)">
              <img v-if="p.person.avatar" :src="imgUrl(p.person.avatar)" alt="" @error="onErr" />
              {{ p.person.name }}
            </button>
          </div>
          <p class="pv-line credit-line" v-else-if="vod.director">导演：{{ vod.director }}</p>
          <div class="people-line" v-if="actors.length">
            <span class="people-label">主演</span>
            <button v-for="p in actors" :key="'a'+p.id" class="person-chip" @click="searchPerson(p.person.name)">
              <img v-if="p.person.avatar" :src="imgUrl(p.person.avatar)" alt="" @error="onErr" />
              {{ p.person.name }}
            </button>
          </div>
          <p class="pv-line credit-line" v-else-if="vod.actor">主演：{{ vod.actor }}</p>
          <div class="pv-intro" v-if="vod.officialIntro || vod.blurb">
            <p :class="{fold: !introOpen}">{{ vod.officialIntro || vod.blurb }}</p>
            <span class="intro-toggle" @click="introOpen=!introOpen">{{ introOpen ? '收起' : '展开' }}</span>
          </div>
          <div class="still-section" v-if="gallery.length">
            <div class="still-head">
              <span>剧照</span>
              <em>{{ gallery.length }} 张</em>
            </div>
            <div class="still-strip">
              <div v-for="(img, i) in gallery" :key="img.id" class="still" @click="openGallery(i)">
                <img :src="imgUrl(img.url)" :alt="vod.name" loading="lazy" @error="onErr" />
              </div>
            </div>
          </div>
          <div class="pv-actions">
            <button class="mini-btn primary" @click="toggleFollow">{{ followed ? '已追剧' : '追剧' }}</button>
            <button class="mini-btn" v-if="user" @click="router.push('/me')">我的片单</button>
            <button class="mini-btn" v-if="interactionConfig.reportsEnabled" @click="openReport('vod', vod.id)">举报</button>
          </div>
        </div>
      </div>

      <!-- 线路切换（按源分组，不因多channel而膨胀） -->
      <div class="lines-bar">
        <span class="lbl">线路</span>
        <span v-for="(l,i) in vod.lines" :key="l.id" class="line-btn" :class="{on: lineIdx===i}"
          @click="switchLine(i)">{{ l.sourceName }} <em>{{ l.epCount }}集</em></span>
      </div>

      <!-- 备用通道：仅当前选中的源有≥2条flag才显示，单flag时完全不渲染(零侵入) -->
      <div class="channels-bar" v-if="curLine && curLine.channels && curLine.channels.length > 1">
        <span class="lbl">通道</span>
        <span v-for="(c,i) in curLine.channels" :key="c.id" class="chan-btn"
          :class="{on: chanIdx===i, dead: !c.alive}" @click="c.alive && switchChannel(i)">
          {{ i===0 ? '推荐' : ('线路'+(i+1)) }}
          <em v-if="!c.alive">失效</em>
        </span>
      </div>

      <!-- 剧集列表 -->
      <div class="eps-box" v-if="curChannel">
        <div class="eps-head">
          <span>选集 <em>{{ curChannel.episodes.length }} 集</em></span>

          <div v-if="episodeGroups.length > 1" class="eps-groups">
            <button v-for="(g, i) in episodeGroups" :key="g.start" type="button"
              :class="{on: activeEpGroupIndex===i}" @click="activeEpGroupIndex=i">
              {{ g.start + 1 }}-{{ g.end }}
            </button>
          </div>
        </div>
        <div class="eps-grid">
          <span v-for="item in visibleEpisodes" :key="item.index" class="ep"
            :class="{on: epIdx===item.index, watched: isHistoryEpisode(item.index)}"
            :style="episodeProgressStyle(item.index)"
            @click="playEp(item.index)">
            <span>{{ item.episode.name }}</span>
            <em v-if="isHistoryEpisode(item.index)">{{ historyProgressText }}</em>
          </span>
        </div>
      </div>
      <section v-if="interactionConfig.commentsEnabled" ref="commentSectionEl" class="pc-comment-section">
        <div class="pc-comment-title">
          <span></span>
          <strong>评论区</strong>
          <em>({{ comments.length }})</em>
        </div>
        <div v-if="!user" class="pc-comment-login">
          <button type="button" @click="openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后可评论' })">您还未 <b>登录</b> 请登录后发表评论</button>
          <button type="button" @click="openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后可评论' })"><i></i><span>写长文</span></button>
        </div>
        <div v-else class="pc-comment-compose">
          <div v-if="interactionConfig.ratingsEnabled" class="pc-rating">
            <button v-for="score in 5" :key="`pc-rate-${score}`" type="button" :class="{ on: myRating >= score * 2 }" @click="submitRating(score * 2)">★</button>
            <span>{{ ratingSummary }}</span>
          </div>
          <div class="pc-comment-input">
            <input ref="commentInputEl" v-model.trim="commentText" maxlength="500" placeholder="写下你的评论" @keyup.enter="submitComment" />
            <button type="button" :disabled="commentSubmitting" @click="submitComment">{{ commentSubmitting ? '发送中' : '发送' }}</button>
          </div>
        </div>
        <div class="pc-comment-tabs">
          <button type="button" class="active">全部评论</button>
          <button type="button">热门评论</button>
        </div>
        <div v-if="comments.length" class="pc-comments">
          <article v-for="item in comments.slice(0, 20)" :key="`pc-comment-${item.id}`">
            <b>{{ item.user?.nickname || item.user?.username || '匿名用户' }}</b>
            <p>{{ item.content }}</p>
          </article>
        </div>
        <div v-else class="pc-comment-empty">暂无评论信息~</div>
      </section>
    </div>

    <!-- 右：相关推荐 -->
    <aside class="rec-col">
      <div class="rec-head">相关推荐</div>
      <div v-if="related.length" class="rec-list">
        <div v-for="r in related" :key="r.id" class="rec-item" @click="goPlay(r.id)">
          <div class="rec-poster">
            <img v-if="r.officialPic || r.pic || r.localPic" :src="pic(r)" :alt="r.name" loading="lazy" @error="onErr($event, fallbackPic(r))" />
            <div v-else class="noimg">无封面</div>
            <span v-if="r.rating" class="rec-score">{{ r.rating }}</span>
          </div>
          <div class="rec-info">
            <div class="rec-name">{{ r.name }}</div>
            <div class="rec-sub">{{ r.typeName || '未分类' }} · {{ r.year || '—' }}</div>
            <div class="rec-sub" v-if="r.remarks">{{ r.remarks }}</div>
          </div>
        </div>
      </div>
      <div v-else class="rec-empty">暂无推荐</div>
    </aside>

    <div v-if="galleryOpen && activeGallery" class="gallery-viewer" @click="closeGallery">
      <button class="gv-close" type="button" @click.stop="closeGallery" aria-label="关闭">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <button class="gv-nav prev" type="button" @click.stop="prevGallery" aria-label="上一张">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <img :src="imgUrl(activeGallery.url)" :alt="vod.name" @click.stop />
      <button class="gv-nav next" type="button" @click.stop="nextGallery" aria-label="下一张">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      <div class="gv-count">{{ galleryIdx + 1 }} / {{ gallery.length }}</div>
    </div>
    <div v-if="reportOpen" class="pc-report-mask" @click.self="reportOpen = false">
      <div class="pc-report">
        <strong>提交举报</strong>
        <select v-model="reportForm.reason">
          <option value="无法播放">无法播放</option>
          <option value="内容错误">内容错误</option>
          <option value="违规内容">违规内容</option>
          <option value="其他问题">其他问题</option>
        </select>
        <textarea v-model.trim="reportForm.content" maxlength="500" placeholder="补充说明"></textarea>
        <div>
          <button type="button" @click="reportOpen = false">取消</button>
          <button type="button" :disabled="reportSubmitting" @click="submitReport">{{ reportSubmitting ? '提交中' : '提交' }}</button>
        </div>
      </div>
    </div>
  </div>
  <div v-else-if="notFound" class="page not-found">
    <div class="nf-box">
      <div class="nf-icon">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M9 9l4 4M13 9l-4 4"/>
        </svg>
      </div>
      <div class="nf-title">该影片不存在或已下架</div>
      <div class="nf-desc">可能链接有误、影片已被移除，或临时维护中</div>
      <div class="nf-actions">
        <button class="nf-btn primary" @click="$router.push('/')">返回首页</button>
        <button class="nf-btn" @click="loadVod(route.params.id)">重新加载</button>
      </div>
    </div>
  </div>
  <div v-else class="page play-wrap">
    <div class="player-col">
      <div class="sk" style="aspect-ratio:16/9;border-radius:14px"></div>
      <div class="sk" style="height:120px;border-radius:14px;margin:18px 0"></div>
      <div class="sk" style="height:56px;border-radius:12px;margin:16px 0"></div>
      <div class="sk" style="height:200px;border-radius:12px"></div>
    </div>
    <aside class="rec-col">
      <div class="sk" style="width:100px;height:18px;margin-bottom:16px"></div>
      <div v-for="i in 6" :key="i" style="display:flex;gap:11px;margin-bottom:14px">
        <div class="sk" style="width:68px;aspect-ratio:2/3;flex-shrink:0;border-radius:8px"></div>
        <div style="flex:1"><div class="sk" style="height:14px"></div><div class="sk" style="height:11px;width:60%;margin-top:8px"></div></div>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { openAuthDialog } from '../authDialog'
import { apiErrorMessage, notifyError, notifySuccess } from '../feedback'
import { serializeNativeMediaError, serializePlaybackWatchdog } from '../hlsErrorReport'
import { normalizePlayConfig, readCachedSite, writeCachedSite } from '../siteConfig'
import { mergeSkipConfig, readLocalSkipPreference, writeLocalSkipPreference } from '../skipConfig'
import { currentUser } from '../userStore'
import DesktopVideoPlayer from '../components/DesktopVideoPlayer.vue'
defineOptions({ name: 'Play' })

const route = useRoute()
const router = useRouter()
const vod = ref({})
const notFound = ref(false)
const related = ref([])
const introOpen = ref(false)
const galleryOpen = ref(false)
const galleryIdx = ref(0)
const playerRef = ref(null)
const commentSectionEl = ref(null)
const commentInputEl = ref(null)
const user = currentUser
const followed = ref(false)
const lineIdx = ref(0); const chanIdx = ref(0); const epIdx = ref(0); const curUrl = ref(''); const mode = ref('hls'); const resolving = ref(false)
const subtitles = ref([])
const playConfig = ref(normalizePlayConfig(readCachedSite()?.playConfig))
const interactionConfig = ref({
  commentsEnabled: true,
  ratingsEnabled: true,
  requestsEnabled: true,
  reportsEnabled: true,
  messagesEnabled: true,
  danmakuEnabled: true,
  commentRequireLogin: true,
  ratingRequireLogin: true,
  danmakuRequireLogin: true,
})
const userSkipPreference = ref(null)
const qualities = ref([]); const preferredRes = ref(0) // 0=自动(最高清)；用户选择跨集持续
const playNotice = ref('')
const playFailure = ref({ open: false, title: '', message: '', switching: false })
const accessBlock = ref(null)
const cleanFallbackUrl = ref('')
const currentResolve = ref(null)
const historyState = ref(null)
const historyLineStates = ref([])
let selfHealTried = false // 自愈：sign 过期(403)时重解析一次拿新地址
const pendingSeekSec = ref(0)
const playerState = ref({ currentTime: 0, duration: 0 })
const comments = ref([])
const commentText = ref('')
const commentSubmitting = ref(false)
const ratingState = ref({ avg: 0, count: 0, myScore: 0 })
const danmakuText = ref('')
const danmakuVisible = ref(true)
const danmakuRows = ref([])
const activeDanmakus = ref([])
const danmakuSubmitting = ref(false)
const reportOpen = ref(false)
const reportSubmitting = ref(false)
const reportForm = ref({ type: 'vod', targetId: 0, vodId: 0, reason: '无法播放', content: '' })
let lastHistorySaveAt = 0
let playNoticeTimer = 0
let playWatchdogTimer = 0
let autoSwitchingPlayback = false
let danmakuLoadAt = 0
let danmakuNonce = 0
const PLAY_LOCAL_HISTORY_KEY = 'vcms.play.local.history'
const effectivePlayConfig = computed(() => mergeSkipConfig(
  playConfig.value,
  vod.value?.skipConfig,
  userSkipPreference.value || readLocalSkipPreference(vod.value?.id),
))
const myRating = computed(() => Number(ratingState.value.myScore || 0))
const ratingSummary = computed(() => ratingState.value.count ? `用户评分 ${Number(ratingState.value.avg || 0).toFixed(1)} · ${ratingState.value.count} 人` : '暂无用户评分')

function isDirectM3u8(url) { return /\.m3u8(\?|$)/i.test(url) }
function onErr(e, fallback = '') {
  const img = e?.target
  if (fallback && img && img.dataset.localFallbackApplied !== '1' && img.getAttribute('src') !== fallback) {
    img.dataset.localFallbackApplied = '1'
    img.src = fallback
    return
  }
  if (img) img.style.visibility='hidden'
}
function pic(v) { return imgUrl(v.officialPic || v.pic || v.localPic || '') }
function fallbackPic(v) { return imgUrl(v.localPic || '') }
function goPlay(id) { router.push('/play/'+id) }
function searchPerson(name) { if (name) router.push({ path: '/', query: { kw: name } }) }
function showPlayNotice(message) {
  playNotice.value = message
  if (playNoticeTimer) clearTimeout(playNoticeTimer)
  playNoticeTimer = window.setTimeout(() => { playNotice.value = '' }, 5200)
}
function showPlayFailure(title, message, switching = false) {
  playFailure.value = { open: true, title, message, switching }
}
function closePlayFailure() {
  playFailure.value.open = false
}
async function loadPlayConfig() {
  try {
    const site = await api.site()
    writeCachedSite(site)
    playConfig.value = normalizePlayConfig(site?.playConfig)
    interactionConfig.value = { ...interactionConfig.value, ...(site?.interactionConfig || {}) }
  } catch {}
}
async function saveSkipPreference(value) {
  if (!vod.value?.id) return
  const pref = writeLocalSkipPreference(vod.value.id, value)
  userSkipPreference.value = pref
  if (user.value) {
    try {
      const r = await api.saveVodSkipPreference(vod.value.id, pref)
      userSkipPreference.value = r?.skipPreference || pref
      showPlayNotice('已保存本片跳过设置')
    } catch {
      showPlayNotice('已保存到本机，登录同步失败')
    }
  } else {
    showPlayNotice('已保存本机本片跳过设置')
  }
}
async function resetSkipPreference() {
  if (!vod.value?.id) return
  writeLocalSkipPreference(vod.value.id, null)
  userSkipPreference.value = null
  if (user.value) {
    try {
      await api.resetVodSkipPreference(vod.value.id)
      showPlayNotice('已恢复后台默认跳过设置')
    } catch {
      showPlayNotice('已恢复本机默认，登录同步失败')
    }
  } else {
    showPlayNotice('已恢复后台默认跳过设置')
  }
}
function reportPlayError(message, failures = [], override = {}) {
  void api.reportPlaybackError({
    vodId: vod.value?.id || null,
    vodName: vod.value?.name || '',
    playId: override.playId ?? curChannel.value?.id ?? null,
    lineName: override.lineName ?? curLine.value?.sourceName ?? curChannel.value?.sourceName ?? '',
    sourceName: override.sourceName ?? curChannel.value?.sourceName ?? '',
    epIndex: override.epIndex ?? epIdx.value,
    epName: override.epName ?? curEp.value?.name ?? '',
    url: override.url ?? currentResolve.value?.url ?? curUrl.value,
    rule: override.rule ?? currentResolve.value?.rule ?? '',
    proxyMode: override.proxyMode ?? currentResolve.value?.proxyMode ?? '',
    cleanId: override.cleanId ?? currentResolve.value?.cleanId ?? null,
    fallbackUrl: override.fallbackUrl ?? currentResolve.value?.fallbackUrl ?? '',
    hlsErrorData: override.hlsErrorData ?? {},
    page: location.href,
    message,
    detail: { context: 'desktop', failures, event: override.event || '', current: currentResolve.value || {} },
  })
}
function playbackErrorContext(url = curUrl.value) {
  const video = currentVideo()
  return {
    currentUrl: url,
    rule: currentResolve.value?.rule || '',
    proxyMode: currentResolve.value?.proxyMode || '',
    cleanId: currentResolve.value?.cleanId || null,
    fallbackUrl: currentResolve.value?.fallbackUrl || '',
    video,
  }
}
function clearPlayWatchdog() {
  if (playWatchdogTimer) clearTimeout(playWatchdogTimer)
  playWatchdogTimer = 0
}
function schedulePlayWatchdog(url) {
  clearPlayWatchdog()
  playWatchdogTimer = window.setTimeout(() => {
    const video = currentVideo()
    if (curUrl.value !== url || mode.value !== 'hls' || Number(video?.readyState || 0) > 0) return
    const hlsErrorData = serializePlaybackWatchdog('first_frame_timeout', { ...playbackErrorContext(url), event: 'play_watchdog' })
    showPlayNotice('连接超时或被当前网络拦截，已尝试切换线路')
    if (tryCleanFallback(url, hlsErrorData, '清洗线路起播超时')) return
    tryNextPlayback('当前线路播放失败', hlsErrorData)
  }, 9000)
}
function describePlaybackError(data) {
  const code = Number(data?.response?.code || 0)
  if (code === 403 || code === 451) return '限制当前地区或网络访问，已尝试切换线路'
  if (code === 404 || code === 410) return '播放地址已失效，已尝试切换线路'
  if (String(data?.details || '').toLowerCase().includes('timeout')) return '连接超时或被当前网络拦截，已尝试切换线路'
  return '当前网络无法访问，已尝试切换线路'
}
function tryCleanFallback(failedUrl, hlsErrorData = {}, reason = '清洗线路播放失败') {
  if (!cleanFallbackUrl.value || failedUrl !== curUrl.value) return false
  const raw = cleanFallbackUrl.value
  reportPlayError(reason, [{
    playId: curChannel.value?.id,
    lineName: curChannel.value?.sourceName || curLine.value?.sourceName || '',
    epName: curEp.value?.name || '',
    message: reason,
    url: curUrl.value,
    rule: currentResolve.value?.rule || '',
    cleanId: currentResolve.value?.cleanId || null,
    fallbackUrl: raw,
    hlsErrorData,
  }], {
    event: 'hls_clean_fallback',
    hlsErrorData,
    url: curUrl.value,
    rule: currentResolve.value?.rule || '',
    cleanId: currentResolve.value?.cleanId || null,
    fallbackUrl: raw,
  })
  cleanFallbackUrl.value = ''
  showPlayNotice('清洗线路播放失败，已回退原始线路')
  playDirectUrl(raw, 'm3u8')
  return true
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

const curLine = computed(() => vod.value.lines?.[lineIdx.value])
const actors = computed(() => (vod.value.people || []).filter(p => p.role === 'actor').slice(0, 12))
const directors = computed(() => (vod.value.people || []).filter(p => p.role === 'director').slice(0, 6))
const gallery = computed(() => (vod.value.images || []).filter(img => img.type !== 'poster').slice(0, 8))
const activeGallery = computed(() => gallery.value[galleryIdx.value])
// 当前选中的具体通道(flag)：有channels则取chanIdx对应项，否则回退用line本身(兼容旧数据)
const curChannel = computed(() => curLine.value?.channels?.[chanIdx.value] || curLine.value)
const curEp = computed(() => curChannel.value?.episodes?.[epIdx.value])
const canPlayPrevEp = computed(() => epIdx.value > 0)
const canPlayNextEp = computed(() => epIdx.value < (curChannel.value?.episodes?.length || 0) - 1)
const currentPlayTitle = computed(() => {
  const line = curLine.value?.sourceName || curLine.value?.flag || ''
  const channel = curLine.value?.channels?.length > 1 ? (chanIdx.value === 0 ? '推荐通道' : `线路${chanIdx.value + 1}`) : ''
  const ep = curEp.value?.name || ''
  return [vod.value?.name, line, channel, ep].filter(Boolean).join(' · ')
})
const historyProgressText = computed(() => {
  const h = activeLineHistory()
  if (!h) return ''
  const progress = Number(h.progressSec) || 0
  const total = Number(h.durationSec) || 0
  if (progress < 20) return ''
  if (total > 0) return `${Math.max(1, Math.min(99, Math.round((progress / total) * 100)))}%`
  return formatHistoryTime(progress)
})
const historyProgressPercent = computed(() => {
  const h = activeLineHistory()
  const progress = Number(h?.progressSec || 0)
  const total = Number(h?.durationSec || 0)
  return total > 0 ? `${Math.max(2, Math.min(100, (progress / total) * 100))}%` : '2px'
})
const EPISODE_GROUP_SIZE = 50
const activeEpGroupIndex = ref(0)
const episodeGroups = computed(() => {
  const total = curChannel.value?.episodes?.length || 0
  const groups = []
  for (let start = 0; start < total; start += EPISODE_GROUP_SIZE) {
    groups.push({ start, end: Math.min(start + EPISODE_GROUP_SIZE, total) })
  }
  return groups
})
const visibleEpisodes = computed(() => {
  const group = episodeGroups.value[activeEpGroupIndex.value] || episodeGroups.value[0]
  if (!group) return []
  return (curChannel.value?.episodes || [])
    .slice(group.start, group.end)
    .map((episode, offset) => ({ episode, index: group.start + offset }))
})
const playerBackdropStyle = computed(() => {
  const url = pic(vod.value)
  return url ? { backgroundImage: `url(${url})` } : {}
})

function formatHistoryTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
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

function isHistoryEpisode(index) {
  const h = activeLineHistory()
  return Boolean(h && historyProgressText.value && Number(h.epIndex) === Number(index))
}

function episodeProgressStyle(index) {
  if (!isHistoryEpisode(index)) return undefined
  return { '--play-episode-progress': historyProgressPercent.value }
}

function readLocalHistory(vodId) {
  try {
    const raw = localStorage.getItem(PLAY_LOCAL_HISTORY_KEY)
    const data = raw ? JSON.parse(raw) : {}
    const entry = data?.[vodId]
    return entry?.latest || entry || null
  } catch {
    return null
  }
}

function readLocalLineHistories(vodId) {
  try {
    const raw = localStorage.getItem(PLAY_LOCAL_HISTORY_KEY)
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
    const raw = localStorage.getItem(PLAY_LOCAL_HISTORY_KEY)
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
    localStorage.setItem(PLAY_LOCAL_HISTORY_KEY, JSON.stringify(Object.fromEntries(rows)))
  } catch {}
}

function applyHistorySelection(history, lineHistories = []) {
  historyState.value = history || null
  historyLineStates.value = Array.isArray(lineHistories) && lineHistories.length ? lineHistories : (history ? [history] : [])
  const h = historyState.value
  if (h?.lineId && vod.value.lines?.length) {
    for (let li = 0; li < vod.value.lines.length; li++) {
      const channels = vod.value.lines[li].channels || []
      const ci = channels.findIndex(c => Number(c.id) === Number(h.lineId))
      if (ci >= 0) { lineIdx.value = li; chanIdx.value = ci; break }
    }
  }
  epIdx.value = Math.max(0, Number(h?.epIndex) || 0)
  pendingSeekSec.value = Math.max(0, Number(h?.progressSec) || 0)
}

function stopPlayback() {
  clearPlayWatchdog()
  const video = currentVideo()
  if (video) {
    try { video.pause() } catch {}
    video.removeAttribute('src')
    try { video.load() } catch {}
  }
  curUrl.value = ''
  cleanFallbackUrl.value = ''
}

function accessTitle(result) {
  const req = result?.requirement || {}
  const label = req.label || (req.kind === 'vip' ? 'VIP会员' : '指定会员等级')
  if (result?.code === 'login_required') {
    if (req.kind === 'vip') return `当前影片需要登录后以${label}身份播放`
    if (req.kind === 'level' || req.kind === 'vip_or_level') return `当前影片需要登录后以${label}身份播放`
    return '当前影片需要登录后才能播放'
  }
  if (result?.code === 'vip_required') return `当前影片需要${label}才能播放`
  if (result?.code === 'level_required' || result?.code === 'vip_or_level_required') return `当前影片需要${label}才能播放`
  return result?.error || '当前影片暂无观看权限'
}

function showAccessBlock(result) {
  stopPlayback()
  const loginRequired = result?.code === 'login_required'
  accessBlock.value = {
    code: result?.code || 'access_denied',
    title: accessTitle(result),
    desc: loginRequired ? '登录成功后会自动重新尝试播放当前集。' : '当前账号权限不足，请切换符合权限的会员等级后再播放。',
    actionText: loginRequired ? '登录后播放' : '查看我的会员',
    retryAfterLogin: loginRequired,
  }
}

function handleAccessAction() {
  if (accessBlock.value?.code === 'login_required') {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: accessBlock.value.title })
    return
  }
  router.push('/me')
}

function currentVideo() {
  return playerRef.value?.getVideo?.() || null
}

function currentPlayerState() {
  return playerRef.value?.getState?.() || playerState.value || { currentTime: 0, duration: 0 }
}

function playHls(url) {
  mode.value = 'hls'
  curUrl.value = url
  schedulePlayWatchdog(url)
}

function isIcloudUrl(u) { return typeof u === 'string' && u.includes('/iclouddrive/') }
async function waitForServiceWorker(timeoutMs = 4000) {
  if (!('serviceWorker' in navigator)) return
  try {
    // 已有 controller 控制当前页面则无需等待
    if (navigator.serviceWorker.controller) return
    await Promise.race([
      navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  } catch { /* SW 不可用时不阻塞播放，交给后续错误处理分支 */ }
}

function playDirectUrl(url, kind = '') {
  if (kind === 'm3u8' || isDirectM3u8(url)) { playHls(url); return }
  mode.value = 'hls'
  curUrl.value = url
}

function trySelfHeal() {
  if (selfHealTried) return false
  selfHealTried = true
  pendingSeekSec.value = Math.max(0, Math.floor(Number(currentPlayerState().currentTime) || 0))
  playResolvedEp(epIdx.value, { fresh: true })
  return true
}

async function playResolvedEp(i, opts = {}) {
  const channel = curChannel.value
  if (!channel?.id || !vod.value?.id) return
  if (!opts.fresh) selfHealTried = false // 正常起播重置自愈标记
  accessBlock.value = null
  closePlayFailure()
  subtitles.value = []
  resolving.value = true
  try {
    const r = await api.resolvePlay({ vodId: vod.value.id, playId: channel.id, epIndex: i, ...(opts.fresh ? { fresh: 1 } : {}) })
    if (r.ok && r.url && r.kind === 'iframe') {
      currentResolve.value = r
      cleanFallbackUrl.value = ''
      qualities.value = []
      mode.value = 'iframe'
      curUrl.value = r.url
      saveWatchHistory(i, pendingSeekSec.value || 0)
      return
    }
    if (r.ok && r.url && (r.kind === 'm3u8' || r.kind === 'mp4' || /\.m3u8(\?|$)/i.test(r.url))) {
      currentResolve.value = r
      cleanFallbackUrl.value = r.fallbackUrl || ''
      subtitles.value = Array.isArray(r.subtitles) ? r.subtitles : []
      // 多清晰度（金牌直连源）：记录可选档，按用户偏好选 URL
      const qs = Array.isArray(r.qualities) ? r.qualities : []
      qualities.value = qs
      let playUrl = r.url
      if (preferredRes.value && qs.length) {
        const hit = qs.find((q) => q.resolution === preferredRes.value)
        if (hit?.url) playUrl = hit.url
      }
      // iCloud 链必须等 Service Worker 接管页面后才能发起请求（否则请求会绕过 SW 直接打到 iCloud 拿到网页而非视频）；
      // 首次访问时 App.vue 的 SW 注册与本组件加载存在竞态，实测确认过这个时序问题。
      if (isIcloudUrl(playUrl)) await waitForServiceWorker()
      playDirectUrl(playUrl, r.kind)
      saveWatchHistory(i, pendingSeekSec.value || 0)
      return
    }
    if (['login_required', 'vip_required', 'level_required', 'vip_or_level_required'].includes(r.code)) {
      showAccessBlock(r)
      return
    }
  } catch {}
  finally { resolving.value = false }
  cleanFallbackUrl.value = ''
  void tryNextPlayback()
}

// 切换清晰度：保留当前播放位置重新加载选定档 URL
function switchQuality(payload) {
  const res = typeof payload === 'object' ? Number(payload?.resolution || 0) : Number(payload || 0)
  if (res === preferredRes.value) return
  preferredRes.value = res
  const qs = qualities.value || []
  const hit = res ? qs.find((q) => q.resolution === res) : qs[0]
  const url = hit?.url
  if (!url) return
  const current = typeof payload === 'object' ? Number(payload?.currentTime || 0) : Number(currentPlayerState().currentTime || 0)
  pendingSeekSec.value = Math.floor(current)
  playDirectUrl(url, 'm3u8')
}

async function tryNextPlayback(reason = '当前线路播放失败', hlsErrorData = {}) {
  if (autoSwitchingPlayback) return
  reportPlayError(reason, [{ playId: curChannel.value?.id, lineName: curChannel.value?.sourceName || curLine.value?.sourceName || '', epName: curEp.value?.name || '', message: reason, hlsErrorData }], { event: 'current_line_failed', hlsErrorData })
  showPlayFailure('线路异常', '当前线路播放失败，正在尝试备用线路。', true)
  const lines = vod.value.lines || []
  const slots = []
  lines.forEach((line, li) => {
    const channels = line.channels?.length ? line.channels : [line]
    channels.forEach((channel, ci) => {
      slots.push({ li, ci, channel })
    })
  })
  if (slots.length <= 1) {
    reportPlayError(reason)
    showPlayNotice('当前无可播放线路，请稍后重试')
    showPlayFailure('播放失败', '当前影片没有可切换的备用线路，请稍后重试。')
    return
  }
  autoSwitchingPlayback = true
  const failures = []
  const current = slots.findIndex(s => s.li === lineIdx.value && s.ci === chanIdx.value)
  const start = current < 0 ? -1 : current
  try {
    for (let step = 1; step < slots.length; step++) {
      const next = slots[(start + step) % slots.length]
      if (!next?.channel || next.channel.alive === false || !next.channel.episodes?.length) continue
      if (next.li === lineIdx.value && next.ci === chanIdx.value) continue
      const n = Math.min(epIdx.value, next.channel.episodes.length - 1)
      const nextEp = n < 0 ? 0 : n
      try {
        const r = await api.resolvePlay({ vodId: vod.value.id, playId: next.channel.id, epIndex: nextEp, fresh: 1 })
        if (r?.ok && r.url) {
          currentResolve.value = r
          if (shouldProbeResolvedPlayback(r)) await probePlaybackUrl(r.url, r.kind || '')
          lineIdx.value = next.li
          chanIdx.value = next.ci
          epIdx.value = nextEp
          cleanFallbackUrl.value = r.fallbackUrl || ''
          subtitles.value = Array.isArray(r.subtitles) ? r.subtitles : []
          qualities.value = Array.isArray(r.qualities) ? r.qualities : []
          if (r.kind === 'iframe') {
            mode.value = 'iframe'
            curUrl.value = r.url
          } else {
            playDirectUrl(r.url, r.kind || '')
          }
          saveWatchHistory(nextEp, pendingSeekSec.value || 0)
          showPlayNotice(`已切换到 ${next.channel.sourceName || '备用线路'}`)
          closePlayFailure()
          return
        }
        const failure = { lineName: next.channel.sourceName || next.channel.name || '', epName: next.channel.episodes?.[nextEp]?.name || '', message: r?.error || '解析失败' }
        failures.push(failure)
        reportPlayError(failure.message, [failure], {
          playId: next.channel.id,
          lineName: failure.lineName,
          sourceName: next.channel.sourceName || '',
          epIndex: nextEp,
          epName: failure.epName,
          event: 'fallback_line_failed',
        })
      } catch (e) {
        const failure = { lineName: next.channel.sourceName || next.channel.name || '', epName: next.channel.episodes?.[nextEp]?.name || '', message: apiErrorMessage(e, '解析失败') }
        failures.push(failure)
        reportPlayError(failure.message, [failure], {
          playId: next.channel.id,
          lineName: failure.lineName,
          sourceName: next.channel.sourceName || '',
          epIndex: nextEp,
          epName: failure.epName,
          event: 'fallback_line_failed',
        })
      }
    }
    reportPlayError('当前无可播放线路，请稍后重试', failures)
    showPlayNotice('当前无可播放线路，请稍后重试')
    showPlayFailure('播放失败', failures.length ? `已尝试 ${failures.length} 条备用线路，仍无法播放。` : '当前无可播放线路，请稍后重试。')
  } finally {
    autoSwitchingPlayback = false
  }
}
function retryCurrentPlayback() {
  closePlayFailure()
  playResolvedEp(epIdx.value, { fresh: true })
}
function playFailureNext() {
  closePlayFailure()
  playNextEp()
}

function saveWatchHistory(i, progressOverride = null) {
  if (!vod.value?.id || !curUrl.value) return
  const ep = curChannel.value?.episodes?.[i]
  const state = currentPlayerState()
  const progressSec = progressOverride === null ? Math.floor(Number(state.currentTime) || 0) : progressOverride
  const durationSec = Math.floor(Number(state.duration) || 0)
  const payload = {
    vodId: vod.value.id,
    lineId: curChannel.value?.id,
    epIndex: i,
    epName: ep?.name || '',
    progressSec,
    durationSec,
  }
  if (Number(progressSec) >= 20 || Number(durationSec) > 0) {
    historyState.value = { ...(historyState.value || {}), ...payload }
    historyLineStates.value = [
      historyState.value,
      ...historyLineStates.value.filter(item => Number(item?.lineId || 0) !== Number(payload.lineId || 0)),
    ]
    writeLocalHistory(payload)
  }
  if (user.value) api.saveHistory(payload).catch(() => {})
}
function onVideoTimeUpdate() {
  if (mode.value !== 'hls') return
  const now = Date.now()
  if (now - lastHistorySaveAt < 15000) return
  lastHistorySaveAt = now
  saveWatchHistory(epIdx.value)
}

function onPlayerState(state) {
  playerState.value = state || { currentTime: 0, duration: 0 }
  clearPlayWatchdog()
  onVideoTimeUpdate()
  void loadDanmakuWindow(false)
  tickDanmaku()
}

async function loadVodInteractions(id = vod.value?.id) {
  if (!id) return
  const [commentRows, rating] = await Promise.all([
    interactionConfig.value.commentsEnabled ? api.vodComments(id, 30).catch(() => []) : Promise.resolve([]),
    interactionConfig.value.ratingsEnabled ? api.vodRating(id).catch(() => ({ avg: 0, count: 0, myScore: 0 })) : Promise.resolve({ avg: 0, count: 0, myScore: 0 }),
  ])
  comments.value = Array.isArray(commentRows) ? commentRows : []
  ratingState.value = { avg: Number(rating?.avg || 0), count: Number(rating?.count || 0), myScore: Number(rating?.myScore || 0) }
}

async function submitComment() {
  if (!vod.value?.id || !commentText.value || commentSubmitting.value) return
  if (interactionConfig.value.commentRequireLogin && !user.value) {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后可评论' })
    return
  }
  commentSubmitting.value = true
  try {
    const row = await api.postVodComment(vod.value.id, { content: commentText.value, source: 'pc' })
    comments.value = [row, ...comments.value]
    commentText.value = ''
    notifySuccess('评论已发送')
  } catch (error) { notifyError(apiErrorMessage(error, '评论发送失败')) } finally { commentSubmitting.value = false }
}

async function submitRating(score) {
  if (!vod.value?.id) return
  if (interactionConfig.value.ratingRequireLogin && !user.value) {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后可评分' })
    return
  }
  try {
    ratingState.value = await api.rateVod(vod.value.id, { score, source: 'pc' })
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
  const title = vod.value?.name || currentPlayTitle.value || '正在观看'
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
  router.push('/me')
}

async function loadDanmakuWindow(force = false) {
  if (!interactionConfig.value.danmakuEnabled || !vod.value?.id) return
  const now = Math.floor(Number(playerState.value.currentTime) || 0)
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

function tickDanmaku() {
  if (!danmakuVisible.value || !danmakuRows.value.length) return
  const now = Math.floor(Number(playerState.value.currentTime) || 0)
  const due = danmakuRows.value.filter(item => !item._shown && Math.abs(Number(item.timeSec || 0) - now) <= 1).slice(0, 4)
  if (!due.length) return
  for (const item of due) item._shown = true
  activeDanmakus.value = [...activeDanmakus.value, ...due.map((item, index) => ({ ...item, _nonce: ++danmakuNonce, top: `${14 + ((danmakuNonce + index) % 7) * 10}%` }))].slice(-12)
  window.setTimeout(() => {
    activeDanmakus.value = activeDanmakus.value.filter(item => !due.some(x => x.id === item.id))
  }, 7600)
}

async function submitDanmaku() {
  if (!vod.value?.id || !danmakuText.value || danmakuSubmitting.value) return
  if (interactionConfig.value.danmakuRequireLogin && !user.value) {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后可发弹幕' })
    return
  }
  danmakuSubmitting.value = true
  try {
    const row = await api.sendDanmaku(vod.value.id, {
      playId: curChannel.value?.id || undefined,
      epIndex: epIdx.value,
      timeSec: Math.floor(Number(playerState.value.currentTime) || 0),
      content: danmakuText.value,
      source: 'pc',
    })
    danmakuRows.value = [...danmakuRows.value, row]
    danmakuText.value = ''
    notifySuccess('弹幕已发送')
  } catch (error) { notifyError(apiErrorMessage(error, '弹幕发送失败')) } finally { danmakuSubmitting.value = false }
}

function openReport(type, targetId) {
  reportForm.value = { type, targetId: Number(targetId) || vod.value.id, vodId: vod.value.id, reason: type === 'play' ? '无法播放' : '内容错误', content: '' }
  reportOpen.value = true
}

async function submitReport() {
  reportSubmitting.value = true
  try {
    await api.reportContent({ ...reportForm.value, source: 'pc' })
    reportOpen.value = false
    notifySuccess('举报已提交')
  } catch (error) { notifyError(apiErrorMessage(error, '举报失败')) } finally { reportSubmitting.value = false }
}

function onPlayerEnded(payload) {
  saveWatchHistory(epIdx.value)
  if (payload?.autoNext && canPlayNextEp.value) playNextEp()
}

function onPlayerError(data) {
  if (!curUrl.value) return
  clearPlayWatchdog()
  const hlsErrorData = data?.kind ? data : serializeNativeMediaError(data, { ...playbackErrorContext(curUrl.value), event: 'desktop_player_error' })
  if (tryCleanFallback(curUrl.value, hlsErrorData)) return
  if (trySelfHeal()) {
    reportPlayError('播放异常，正在刷新解析', [{ playId: curChannel.value?.id, lineName: curChannel.value?.sourceName || curLine.value?.sourceName || '', epName: curEp.value?.name || '', message: '播放异常，正在刷新解析', hlsErrorData }], { event: 'self_heal_refresh', hlsErrorData })
    return
  }
  const message = describePlaybackError(hlsErrorData)
  showPlayNotice(message)
  void tryNextPlayback(message, hlsErrorData)
}

function playEp(i, opts = {}) {
  epIdx.value = i
  activeDanmakus.value = []
  danmakuRows.value = []
  danmakuLoadAt = 0
  cleanFallbackUrl.value = ''
  if (!opts.keepResume) pendingSeekSec.value = 0
  playResolvedEp(i)
}
function playPrevEp() {
  if (!canPlayPrevEp.value) return
  playEp(epIdx.value - 1)
}
function playNextEp() {
  if (!canPlayNextEp.value) return
  playEp(epIdx.value + 1)
}
function switchLine(i) {
  lineIdx.value = i; chanIdx.value = 0
  const n = Math.min(epIdx.value, (curChannel.value?.episodes?.length || 1) - 1)
  playEp(n < 0 ? 0 : n)
}
function switchChannel(i) {
  chanIdx.value = i
  const n = Math.min(epIdx.value, (curLine.value.channels[i]?.episodes?.length || 1) - 1)
  playEp(n < 0 ? 0 : n)
}

async function loadVod(id) {
  introOpen.value = false; lineIdx.value = 0; chanIdx.value = 0; epIdx.value = 0; curUrl.value = ''
  galleryOpen.value = false; galleryIdx.value = 0
  notFound.value = false; vod.value = {}; followed.value = false; accessBlock.value = null
  historyState.value = null; historyLineStates.value = []; userSkipPreference.value = null
  comments.value = []; ratingState.value = { avg: 0, count: 0, myScore: 0 }; activeDanmakus.value = []; danmakuRows.value = []; danmakuLoadAt = 0
  try {
    vod.value = await api.vod(id)
  } catch (e) {
    // 404 或其他请求异常：降级为友好提示，不再永久卡骨架屏
    notFound.value = true; return
  }
  if (!vod.value?.id) { notFound.value = true; return }
  await nextTick()
  applyHistorySelection(readLocalHistory(id), readLocalLineHistories(id))
  userSkipPreference.value = readLocalSkipPreference(id)
  if (user.value) {
    try {
      const state = await api.userVodState(id)
      followed.value = state.followed
      if (state?.history) applyHistorySelection(state.history, state.lineHistories)
      userSkipPreference.value = state?.skipPreference || readLocalSkipPreference(id)
    } catch {}
  }
  if (vod.value.lines?.length) playEp(Math.min(epIdx.value, (curChannel.value?.episodes?.length || 1) - 1), { keepResume: true })
  await loadVodInteractions(vod.value.id)
  // 相关推荐
  try {
    related.value = await api.related({ id, type: vod.value.typeName, sub: vod.value.subType, limit: 12 })
  } catch { related.value = [] }
  window.scrollTo({ top: 0 })
}

function openGallery(i) {
  galleryIdx.value = i
  galleryOpen.value = true
}
function closeGallery() { galleryOpen.value = false }
function prevGallery() {
  if (!gallery.value.length) return
  galleryIdx.value = (galleryIdx.value - 1 + gallery.value.length) % gallery.value.length
}
function nextGallery() {
  if (!gallery.value.length) return
  galleryIdx.value = (galleryIdx.value + 1) % gallery.value.length
}

async function toggleFollow() {
  if (!vod.value?.id) return
  if (!user.value) {
    openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后可追剧和同步片单' })
    return
  }
  try {
    const r = followed.value ? await api.unfollowVod(vod.value.id) : await api.followVod(vod.value.id)
    followed.value = r.followed
    notifySuccess(r.followed ? '已加入追剧' : '已取消追剧')
  } catch (error) {
    notifyError(apiErrorMessage(error, '操作失败'))
  }
}

onMounted(() => { loadPlayConfig(); loadVod(route.params.id) })
watch(() => route.params.id, (id) => { if (id) loadVod(id) })
watch(user, (next) => {
  if (next && accessBlock.value?.retryAfterLogin) playEp(epIdx.value, { keepResume: true })
})
watch([epIdx, curChannel], () => {
  activeEpGroupIndex.value = Math.floor(epIdx.value / EPISODE_GROUP_SIZE)
})
onBeforeUnmount(() => {
  if (curUrl.value) saveWatchHistory(epIdx.value)
  clearPlayWatchdog()
})
</script>

<style scoped>
.play-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 24px; }
.player-col { min-width: 0; }
.player-box { position: relative; background: #000; border-radius: 14px 14px 0 0; overflow: hidden; aspect-ratio: 16/9; }
.player-box.locked { background: #11131b; }
.play-failure-dialog { position: absolute; z-index: 9; left: 50%; top: 50%; width: min(360px, calc(100% - 36px)); transform: translate(-50%, -50%); padding: 18px; border: 1px solid rgba(255,255,255,.16); border-radius: 14px; background: rgba(14,16,22,.88); color: #fff; text-align: center; box-shadow: 0 18px 52px rgba(0,0,0,.42); backdrop-filter: blur(16px); }
.play-failure-dialog strong { display: block; font-size: 18px; line-height: 1.25; }
.play-failure-dialog p { margin: 8px 0 14px; color: rgba(255,255,255,.76); font-size: 13px; line-height: 1.55; }
.play-failure-dialog div { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
.play-failure-dialog button { min-width: 78px; height: 34px; border: 0; border-radius: 9px; color: #fff; background: rgba(255,255,255,.12); cursor: pointer; font-weight: 800; }
.play-failure-dialog button:first-child { background: #e50914; }
.pc-danmaku-layer { position: absolute; inset: 0; z-index: 8; pointer-events: none; overflow: hidden; }
.pc-danmaku-layer span { position: absolute; left: 100%; min-width: max-content; padding: 3px 10px; border-radius: 999px; background: rgba(0,0,0,.28); color: #fff; font-size: 20px; font-weight: 800; text-shadow: 0 1px 2px rgba(0,0,0,.85); animation: pcDanmakuMove 7.6s linear forwards; }
@keyframes pcDanmakuMove { from { transform: translateX(0); } to { transform: translateX(calc(-100vw - 100%)); } }
.pc-under-player-toolbar { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 0 16px; border: 1px solid rgba(255,255,255,.08); border-top: 0; border-radius: 0 0 14px 14px; background: rgba(10,10,10,.92); }
.pc-toolbar-left { min-width: 0; display: flex; align-items: center; gap: 4px; overflow-x: auto; scrollbar-width: none; }
.pc-toolbar-left::-webkit-scrollbar { display: none; }
.pc-toolbar-left button { flex: 0 0 auto; min-width: 66px; height: 44px; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border: 0; background: transparent; color: rgba(255,255,255,.78); cursor: pointer; }
.pc-toolbar-left button:hover, .pc-toolbar-left button.on { color: #fff; background: rgba(255,255,255,.08); border-radius: 8px; }
.pc-toolbar-left svg { width: 19px; height: 19px; }
.pc-toolbar-left span { font-size: 12px; line-height: 1; }
.pc-toolbar-danmaku { flex: 0 1 430px; min-width: 280px; display: grid; grid-template-columns: 72px minmax(0, 1fr) 66px; gap: 8px; }
.pc-toolbar-danmaku button { height: 36px; border: 0; border-radius: 9px; padding: 0 12px; background: rgba(255,255,255,.12); color: #fff; font-weight: 900; cursor: pointer; }
.pc-toolbar-danmaku button.on { background: var(--btn-primary-bg); color: var(--btn-primary-text); }
.pc-toolbar-danmaku button:disabled { opacity: .55; cursor: not-allowed; }
.pc-toolbar-danmaku input { min-width: 0; height: 36px; padding: 0 12px; border: 1px solid rgba(255,255,255,.1); border-radius: 9px; background: rgba(255,255,255,.06); color: var(--text); outline: 0; }
.pc-comment-section { margin-top: 20px; }
.pc-comment-title { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; color: var(--text); }
.pc-comment-title > span { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,.14); position: relative; }
.pc-comment-title > span::before { content: ""; position: absolute; inset: 7px; border: 2px solid currentColor; border-top: 0; border-radius: 3px 3px 8px 8px; transform: skewX(-8deg); }
.pc-comment-title strong { font-size: 24px; font-weight: 800; }
.pc-comment-title em { color: var(--muted); font-style: normal; font-size: 16px; }
.pc-comment-login { display: grid; grid-template-columns: minmax(0, 1fr) 116px; gap: 12px; margin-bottom: 18px; }
.pc-comment-login button { min-width: 0; height: 70px; border: 0; border-radius: 8px; background: rgba(255,255,255,.045); color: var(--muted); cursor: pointer; }
.pc-comment-login button:first-child { display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 14px; }
.pc-comment-login b { display: inline-grid; place-items: center; height: 32px; padding: 0 12px; border: 1px solid rgba(255,255,255,.84); border-radius: 4px; color: var(--text); }
.pc-comment-login button:last-child { display: grid; place-items: center; align-content: center; gap: 4px; font-size: 13px; }
.pc-comment-login i { width: 22px; height: 22px; border-radius: 6px; background: rgba(255,255,255,.18); }
.pc-comment-compose { display: grid; gap: 12px; margin-bottom: 18px; }
.pc-rating { display: flex; align-items: center; gap: 5px; }
.pc-rating button { border: 0; background: transparent; color: rgba(255,255,255,.28); font-size: 22px; cursor: pointer; }
.pc-rating button.on, .pc-rating button:hover { color: #ffc233; }
.pc-rating span { margin-left: 8px; color: var(--muted2); font-size: 13px; }
.pc-comment-input { display: grid; grid-template-columns: minmax(0, 1fr) 72px; gap: 8px; }
.pc-comment-input input, .pc-report select, .pc-report textarea { min-width: 0; border: 1px solid rgba(255,255,255,.1); border-radius: 9px; background: rgba(255,255,255,.06); color: var(--text); outline: 0; }
.pc-comment-input input { height: 38px; padding: 0 12px; }
.pc-comment-input button, .pc-report button { height: 38px; border: 0; border-radius: 9px; padding: 0 14px; background: var(--btn-primary-bg); color: var(--btn-primary-text); font-weight: 900; cursor: pointer; }
.pc-comment-input button:disabled { opacity: .55; cursor: not-allowed; }
.pc-comment-tabs { display: flex; gap: 28px; margin: 4px 0 18px; }
.pc-comment-tabs button { border: 0; background: transparent; color: var(--muted2); font-size: 15px; cursor: pointer; }
.pc-comment-tabs button.active { color: var(--text); font-weight: 900; }
.pc-comments { display: grid; gap: 10px; }
.pc-comments article { display: grid; gap: 4px; padding: 10px; border-radius: 10px; background: rgba(255,255,255,.04); }
.pc-comments b { color: var(--text); font-size: 13px; }
.pc-comments p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.55; }
.pc-comment-empty { min-height: 120px; display: grid; place-items: center; border-radius: 8px; background: rgba(255,255,255,.035); color: var(--muted2); font-size: 13px; }
.pc-report-mask { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,.62); }
.pc-report { width: min(420px, 100%); display: grid; gap: 12px; padding: 18px; border-radius: 14px; background: var(--card); border: 1px solid rgba(255,255,255,.12); }
.pc-report strong { color: var(--text); font-size: 18px; }
.pc-report select { height: 38px; padding: 0 10px; }
.pc-report textarea { min-height: 108px; padding: 10px; resize: vertical; }
.pc-report div { display: flex; justify-content: flex-end; gap: 8px; }
.video { width: 100%; height: 100%; background: #000; object-fit: contain; }
.sub-toggle { position: absolute; left: 12px; top: 12px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.28); background: rgba(0,0,0,.5); color: rgba(255,255,255,.85); border-radius: 8px; cursor: pointer; z-index: 6; }
.sub-toggle:hover, .sub-toggle.on { background: rgba(0,0,0,.72); color: #fff; }
.sub-sync { position: absolute; left: 12px; top: 50px; display: flex; align-items: center; gap: 6px; padding: 5px 8px; background: rgba(0,0,0,.72); backdrop-filter: blur(8px); border-radius: 18px; font-size: 12px; z-index: 6; pointer-events: auto; }
.sub-sync .ss-tag { color: rgba(255,255,255,.72); margin-right: 2px; }
.sub-sync .ss-val { color: #fff; min-width: 40px; text-align: center; }
.sub-sync .ss-btn, .sub-sync .ss-reset { border: 1px solid rgba(255,255,255,.28); background: transparent; color: #fff; border-radius: 6px; padding: 3px 8px; cursor: pointer; font-size: 12px; }
.sub-sync .ss-btn:hover, .sub-sync .ss-reset:hover { background: rgba(255,255,255,.16); }
.video-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #667; pointer-events: none; }
.play-lock-bg { position: absolute; inset: 0; background-size: cover; background-position: center; filter: blur(16px) brightness(.42) saturate(1.08);
  transform: scale(1.08); opacity: .88; }
.play-lock-bg::after { content: ''; position: absolute; inset: 0; background:
  radial-gradient(circle at 50% 42%, rgba(20,22,29,.5), rgba(6,7,10,.9) 70%),
  linear-gradient(0deg, rgba(0,0,0,.78), rgba(0,0,0,.18)); }
.play-lock { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 24px; text-align: center; }
.play-lock-icon { width: 54px; height: 54px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.14); color: #fff; backdrop-filter: blur(8px); }
.play-lock-icon svg { width: 27px; height: 27px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.play-lock-title { max-width: 680px; color: #fff; font-size: 22px; line-height: 1.35; font-weight: 900; overflow-wrap: anywhere; }
.play-lock-desc { max-width: 520px; color: var(--muted2); font-size: 13.5px; line-height: 1.7; }
.play-lock-btn { height: 42px; padding: 0 24px; border: 0; border-radius: 11px; background: var(--btn-primary-bg);
  color: var(--btn-primary-text); cursor: pointer; font-size: 14px; font-weight: 900; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.play-lock-btn:hover { filter: brightness(1.06); }
.play-notice { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 3;
  border: 1px solid rgba(255,255,255,.18); border-radius: 10px; background: rgba(8,10,15,.82);
  color: #f6d7db; font-size: 13px; line-height: 1.45; padding: 9px 12px; backdrop-filter: blur(10px);
  pointer-events: none; }
.iframe-note { position: absolute; left: 0; right: 0; bottom: 0; font-size: 12px; color: var(--muted2);
  background: rgba(0,0,0,.6); padding: 6px 12px; text-align: center; pointer-events: none; }

/* 影片不存在 */
.not-found { display: flex; align-items: center; justify-content: center; min-height: 60vh; }
.nf-box { text-align: center; max-width: 360px; }
.nf-icon { color: var(--muted); margin-bottom: 20px; display: flex; justify-content: center; }
.nf-title { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
.nf-desc { font-size: 13px; color: var(--muted); margin-bottom: 26px; }
.nf-actions { display: flex; gap: 12px; justify-content: center; }
.nf-btn { padding: 10px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
  border: 1px solid var(--line); background: var(--card); color: var(--text); transition: .15s; }
.nf-btn:hover { border-color: var(--btn-hover-border); color: var(--btn-hover-text); }
.nf-btn.primary { background: var(--btn-primary-bg); border-color: transparent; color: var(--btn-primary-text); }
.nf-btn.primary:hover { opacity: .9; color: var(--btn-primary-text); }

/* 标题信息条 */
.pv-head { display: flex; align-items: flex-start; gap: 16px; margin: 18px 0; padding: 16px; background: var(--card);
  border: 1px solid var(--line); border-radius: 14px; }
.pv-poster { width: 108px; flex-shrink: 0; align-self: flex-start; aspect-ratio: 2/3; border-radius: 10px; overflow: hidden; }
.pv-poster img { width: 100%; height: 100%; object-fit: cover; }
.pv-meta { min-width: 0; flex: 1; }
.pv-title { font-size: 22px; margin-bottom: 10px; }
.db-rating { display: inline-flex; align-items: center; gap: 4px; font-size: 15px; color: var(--gold); font-weight: 800; margin-left: 10px; }
.db-rating svg { width: 16px; height: 16px; flex-shrink: 0; }
.pv-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.pv-tags .t { font-size: 12px; padding: 3px 10px; background: var(--bg2); border-radius: 6px; color: var(--muted); }
.pv-tags .t.accent { background: var(--play-line-active-bg); color: var(--play-line-active-text); }
.pv-line { font-size: 13px; color: var(--muted); margin: 5px 0; line-height: 1.6;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.people-line { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin: 8px 0; }
.people-label { color: var(--muted); font-size: 12px; margin-right: 2px; }
.person-chip { display: inline-flex; align-items: center; gap: 5px; min-height: 25px; max-width: 112px; padding: 3px 8px;
  border-radius: 999px; border: 1px solid var(--line); background: var(--bg2); color: var(--text);
  font-size: 12px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.person-chip:hover { border-color: var(--play-link-text); color: #fff; }
.person-chip img { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.pv-intro { margin-top: 10px; }
.pv-intro p { font-size: 13px; color: #9aa4b7; line-height: 1.75; }
.pv-intro p.fold { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.intro-toggle { font-size: 12px; color: var(--play-link-text); cursor: pointer; margin-top: 4px; display: inline-block; }
.still-section { margin-top: 14px; }
.still-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 9px; }
.still-head span { font-size: 14px; font-weight: 800; color: var(--text); }
.still-head em { font-style: normal; font-size: 12px; color: var(--muted); }
.still-strip { display: flex; gap: 10px; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity;
  padding: 0 2px 8px; scrollbar-width: thin; scroll-behavior: smooth; -webkit-overflow-scrolling: touch; }
.still { flex: 0 0 148px; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; background: #0f1420;
  border: 1px solid var(--line); cursor: zoom-in; scroll-snap-align: start; }
.still img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gallery-viewer { position: fixed; inset: 0; z-index: 120; background: rgba(0,0,0,.86);
  display: flex; align-items: center; justify-content: center; padding: 54px 70px; }
.gallery-viewer img { max-width: min(1180px, 100%); max-height: 82vh; object-fit: contain; border-radius: 10px; box-shadow: 0 18px 60px rgba(0,0,0,.65); }
.gv-close, .gv-nav { position: fixed; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255,255,255,.18); background: rgba(20,22,29,.72);
  color: #fff; cursor: pointer; backdrop-filter: blur(10px); line-height: 1; padding: 0; }
.gv-close svg, .gv-nav svg { display: block; width: 24px; height: 24px; stroke: currentColor; stroke-width: 2.2;
  stroke-linecap: round; stroke-linejoin: round; fill: none; }
.gv-close { top: 24px; right: 28px; width: 42px; height: 42px; border-radius: 50%; }
.gv-nav { top: 50%; transform: translateY(-50%); width: 48px; height: 64px; border-radius: 12px; }
.gv-nav svg { width: 30px; height: 30px; }
.gv-nav.prev { left: 24px; }
.gv-nav.next { right: 24px; }
.gv-count { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); color: #dfe5ef;
  font-size: 13px; background: rgba(20,22,29,.72); border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: 7px 14px; }

.now-playing { min-height: 42px; margin: 12px 0 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  font-size: 14px; color: var(--muted); }
.now-playing-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.now-playing b { color: var(--text); }
.episode-nav { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
.episode-nav button { height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--card); color: var(--text); cursor: pointer; font-size: 12.5px; font-weight: var(--small-text-max-weight); transition: .15s; }
.episode-nav button:not(:disabled):hover { border-color: var(--play-episode-active-bg); color: #fff; }
.episode-nav button:disabled { opacity: .38; cursor: not-allowed; }
.lines-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 16px 0;
  padding: 14px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
.channels-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: -6px 0 16px; padding: 10px 14px;
  background: rgba(255,255,255,.02); border: 1px dashed var(--line); border-radius: 10px; }
.chan-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 30px; padding: 5px 12px;
  border-radius: 7px; border: 0; background: var(--bg2); box-shadow: inset 0 0 0 1px var(--line);
  font-size: 12.5px; line-height: 1; cursor: pointer; transition: .15s; }
.chan-btn:hover { box-shadow: inset 0 0 0 1px var(--play-channel-active-bg); }
.chan-btn.on { background: var(--play-channel-active-bg); box-shadow: none; color: var(--play-channel-active-text); font-weight: 600; }
.chan-btn.dead { opacity: .4; cursor: not-allowed; text-decoration: line-through; }
.chan-btn em { font-style: normal; font-size: 11px; margin-left: 4px; opacity: .8; }
.lbl { color: var(--muted); font-size: 14px; }
.line-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 32px; padding: 6px 14px;
  border-radius: 8px; border: 0; background: var(--bg2); box-shadow: inset 0 0 0 1px var(--line);
  font-size: 13px; line-height: 1; cursor: pointer; transition: .2s; }
.line-btn em { color: var(--muted); font-style: normal; font-size: 12px; }
.line-btn:hover { box-shadow: inset 0 0 0 1px var(--play-link-text); }
.line-btn.on { background: var(--play-line-active-bg); box-shadow: none; color: var(--play-line-active-text); }
.line-btn.on em { color: rgba(255,255,255,.8); }
.eps-box { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.eps-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.eps-head > span { flex: 0 0 auto; font-size: 15px; font-weight: 700; }
.eps-head em { color: var(--muted); font-style: normal; font-size: 13px; font-weight: 400; margin-left: 8px; }
.eps-groups { min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 7px; overflow-x: auto; scrollbar-width: none; }
.eps-groups::-webkit-scrollbar { display: none; }
.quality-toggle { position: absolute; right: 12px; top: 12px; display: inline-flex; align-items: center; gap: 4px; padding: 0 10px; height: 30px; border: 1px solid rgba(255,255,255,.28); background: rgba(0,0,0,.5); color: rgba(255,255,255,.9); border-radius: 8px; cursor: pointer; z-index: 6; font-size: 12px; }
.quality-toggle:hover, .quality-toggle.on { background: rgba(0,0,0,.72); color: #fff; }
.quality-toggle .qt-label { line-height: 1; }
.quality-menu { position: absolute; right: 12px; top: 50px; display: flex; flex-direction: column; gap: 4px; padding: 6px; background: rgba(0,0,0,.82); backdrop-filter: blur(8px); border-radius: 10px; z-index: 6; min-width: 88px; }
.quality-menu button { border: 0; background: transparent; color: rgba(255,255,255,.85); border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px; text-align: center; }
.quality-menu button:hover { background: rgba(255,255,255,.16); color: #fff; }
.quality-menu button.on { background: var(--play-episode-active-bg); color: var(--play-episode-active-text); }
.eps-groups button { flex: 0 0 auto; height: 28px; padding: 0 10px; border-radius: 8px; border: 0; box-shadow: inset 0 0 0 1px var(--line);
  background: var(--bg2); color: var(--muted); cursor: pointer; font-size: 12px; font-weight: var(--small-text-max-weight); }
.eps-groups button:hover { box-shadow: inset 0 0 0 1px var(--play-episode-active-bg); color: var(--text); }
.eps-groups button.on { box-shadow: none; background: var(--play-episode-active-bg); color: var(--play-episode-active-text); }
.eps-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(66px, 1fr)); gap: 8px;
  max-height: 360px; overflow-y: auto; }
.ep { position: relative; display: grid; place-items: center; gap: 2px; text-align: center; min-height: 38px; padding: 7px 4px; background: var(--bg2); border: 0; box-shadow: inset 0 0 0 1px var(--line);
  border-radius: 7px; font-size: 13px; cursor: pointer; transition: .15s; overflow: hidden; }
.ep::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: var(--play-episode-progress, 0); background: rgba(255,255,255,.08); pointer-events: none; }
.ep > span, .ep > em { position: relative; z-index: 1; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ep > em { font-style: normal; font-size: 11px; line-height: 1; color: var(--muted); }
.ep:hover { box-shadow: inset 0 0 0 1px var(--play-episode-active-bg); color: #fff; }
.ep.on { background: var(--play-episode-active-bg); box-shadow: none; color: var(--play-episode-active-text); }
.ep.on > em { color: rgba(255,255,255,.82); }

/* 相关推荐 */
.rec-col { min-width: 0; }
.rec-head { font-size: 16px; font-weight: 800; margin-bottom: 14px; display: flex; align-items: center; gap: 9px; }
.rec-head::before { content: ''; width: 4px; height: 17px; border-radius: 2px; background: var(--section-accent-bg); }
.rec-list { display: flex; flex-direction: column; gap: 12px; }
.rec-item { display: flex; gap: 11px; cursor: pointer; padding: 6px; border-radius: 10px; transition: .15s; }
.rec-item:hover { background: var(--card); }
.rec-poster { width: 60px; flex-shrink: 0; aspect-ratio: 2/3; border-radius: 8px; overflow: hidden; position: relative; background: #0f1420; }
.rec-poster img { width: 100%; height: 100%; object-fit: cover; }
.rec-poster .noimg { width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#455068;font-size:11px; }
.rec-score { position: absolute; right: 3px; bottom: 3px; background: linear-gradient(90deg,#ff8a00,#ff5c8a);
  color: #fff; font-size: 11px; font-weight: var(--small-text-max-weight); padding: 1px 5px; border-radius: 5px; }
.rec-info { min-width: 0; flex: 1; padding-top: 3px; }
.rec-name { font-size: 14px; font-weight: 600; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rec-sub { font-size: 12px; color: var(--muted); margin-top: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rec-empty { color: var(--muted); font-size: 13px; padding: 20px 0; text-align: center; }

@media (max-width: 1024px) {
  .play-wrap { grid-template-columns: 1fr; }
  .rec-col { margin-top: 8px; }
  .rec-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
}
@media (max-width: 720px) {
  .pc-under-player-toolbar {
    min-height: 0;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 8px 10px 10px;
  }
  .pc-toolbar-left { padding-bottom: 2px; }
  .pc-toolbar-left button { min-width: 58px; }
  .pc-toolbar-danmaku {
    width: 100%;
    min-width: 0;
    flex: none;
    grid-template-columns: 68px minmax(0, 1fr) 58px;
  }
}
@media (max-width: 480px) {
  .play-wrap { gap: 14px; }
  .player-box { border-radius: 12px 12px 0 0; margin: 0 -12px; }
  .pc-under-player-toolbar { margin: 0 -12px; border-radius: 0 0 12px 12px; }
  .play-lock { gap: 10px; padding: 18px; }
  .play-lock-icon { width: 44px; height: 44px; }
  .play-lock-icon svg { width: 23px; height: 23px; }
  .play-lock-title { font-size: 17px; }
  .play-lock-desc { font-size: 12.5px; }
  .play-lock-btn { height: 38px; padding: 0 18px; }
  .pv-head {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 10px 13px;
    margin: 14px 0 12px;
    padding: 12px;
    border-radius: 13px;
    overflow: hidden;
  }
  .pv-poster {
    width: 92px;
    grid-column: 1;
    grid-row: 1 / span 4;
    max-height: 138px;
    border-radius: 9px;
  }
  .pv-meta { display: contents; }
  .pv-title {
    grid-column: 2;
    min-width: 0;
    margin: 0;
    font-size: 19px;
    line-height: 1.26;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .db-rating { margin-left: 6px; font-size: 14px; }
  .pv-tags {
    grid-column: 2;
    align-content: start;
    gap: 6px 7px;
    margin: 0;
  }
  .pv-tags .t {
    max-width: 100%;
    padding: 3px 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pv-line {
    margin: 0;
    line-height: 1.55;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .update-line {
    grid-column: 2;
    align-self: start;
  }
  .credit-line,
  .people-line,
  .still-section,
  .pv-actions {
    grid-column: 2;
  }
  .credit-line {
    color: var(--muted2);
    -webkit-line-clamp: 2;
  }
  .people-line {
    align-items: flex-start;
    gap: 7px;
    margin: 2px 0 0;
  }
  .people-label {
    flex: 0 0 auto;
    height: 26px;
    display: inline-flex;
    align-items: center;
  }
  .person-chip {
    max-width: 100%;
    min-height: 26px;
  }
  .pv-intro {
    grid-column: 1 / -1;
    margin-top: 2px;
    padding-top: 10px;
    border-top: 1px solid rgba(255,255,255,.045);
  }
  .pv-intro p {
    font-size: 13px;
    line-height: 1.68;
  }
  .pv-actions {
    gap: 8px;
    margin-top: 6px;
  }
  .pv-actions .mini-btn {
    height: 34px;
    padding: 0 12px;
    border-radius: 11px;
  }
  .now-playing {
    margin: 10px 0 12px;
    align-items: flex-start;
    font-size: 13px;
    line-height: 1.6;
  }
  .now-playing-text {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .episode-nav button {
    height: 30px;
    padding: 0 10px;
  }
  .lines-bar,
  .channels-bar,
  .eps-box {
    border-radius: 12px;
  }
  .eps-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .eps-groups {
    width: 100%;
    justify-content: flex-start;
  }
  .lines-bar {
    align-items: flex-start;
    gap: 9px;
    margin: 12px 0;
    padding: 12px;
  }
  .lines-bar .lbl,
  .channels-bar .lbl {
    width: 38px;
    padding-top: 7px;
  }
  .line-btn,
  .chan-btn {
    max-width: calc(100% - 48px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .still { flex-basis: 164px; }
  .gallery-viewer { padding: 62px 44px 54px; }
  .gv-close { top: 16px; right: 16px; width: 38px; height: 38px; }
  .gv-close svg { width: 22px; height: 22px; }
  .gv-nav { width: 36px; height: 52px; border-radius: 10px; }
  .gv-nav svg { width: 26px; height: 26px; }
  .gv-nav.prev { left: 8px; }
  .gv-nav.next { right: 8px; }
}
</style>
