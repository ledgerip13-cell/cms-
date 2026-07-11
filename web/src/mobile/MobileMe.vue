<template>
  <main class="mme">
    <section class="mme-hero">
      <div class="mme-user">
        <div class="mme-avatar">
          <svg viewBox="0 0 24 24" v-html="icon('user')"></svg>
        </div>
        <div class="mme-user-copy">
          <h1>{{ user ? displayName : '登录后同步记录' }}</h1>
          <p>{{ user ? userLine : '继续观看、追剧和推荐会自动跟随账号保存' }}</p>
          <span v-if="user?.vipLevel" class="mme-level" :style="levelTagStyle(user.vipLevel)">{{ user.vipLevel.name }}</span>
        </div>
      </div>
      <button v-if="!user" class="mme-login" type="button" @click="login">登录 / 注册</button>
      <button v-else class="mme-logout" type="button" @click="logout">退出</button>
    </section>

    <section class="mme-vip">
      <div>
        <span>{{ user?.isVip ? '当前权益' : '会员权益' }}</span>
        <strong>{{ user?.isVip ? '高清播放 · 追剧同步' : '登录后查看账号权益' }}</strong>
        <p>{{ vipText }}</p>
      </div>
      <button type="button" @click="user ? goTheater() : login()">{{ user ? '去追剧' : '去登录' }}</button>
    </section>

    <section class="mme-stats" :class="{ muted: !user }">
      <button type="button" @click="user ? scrollTo('history') : login()">
        <strong>{{ histories.length }}</strong>
        <span>观看历史</span>
      </button>
      <button type="button" @click="user ? scrollTo('follows') : login()">
        <strong>{{ follows.length }}</strong>
        <span>我的追剧</span>
      </button>
      <button type="button" @click="user ? goTheater() : login()">
        <strong>{{ recs.length }}</strong>
        <span>为你推荐</span>
      </button>
    </section>

    <section class="mme-section" ref="historyEl">
      <div class="mme-section-head">
        <h2>继续观看</h2>
        <button v-if="histories.length > 3" type="button" @click="historyExpanded = !historyExpanded">
          {{ historyExpanded ? '收起' : '全部' }}
        </button>
      </div>
      <div v-if="loading" class="mme-watch-list">
        <div v-for="i in 3" :key="i" class="mme-watch mme-sk"><div></div><b></b><p></p></div>
      </div>
      <div v-else-if="!user" class="mme-empty">
        <strong>还没有登录</strong>
        <span>登录后会在这里显示最近观看</span>
      </div>
      <div v-else-if="!histories.length" class="mme-empty">
        <strong>暂无观看历史</strong>
        <span>去首页挑一部开始看</span>
      </div>
      <div v-else class="mme-watch-list">
        <article v-for="item in visibleHistories" :key="item.id || item.vodId" class="mme-watch" @click="goPlay(item.vod?.id || item.vodId)">
          <div class="mme-watch-cover">
            <img v-if="item.vod" :src="poster(item.vod)" :alt="item.vod.name" loading="lazy" @error="onImgError($event)" />
            <span>{{ item.epName || `第${Number(item.epIndex || 0) + 1}集` }}</span>
          </div>
          <div>
            <strong>{{ item.vod?.name || '继续观看' }}</strong>
            <p>{{ item.vod?.typeName || '影片' }}<template v-if="item.vod?.year"> · {{ item.vod.year }}</template></p>
            <i><em :style="{ width: progressWidth(item) }"></em></i>
          </div>
        </article>
      </div>
    </section>

    <section class="mme-section" ref="followsEl">
      <div class="mme-section-head">
        <h2>我的追剧</h2>
        <button v-if="follows.length > 6" type="button" @click="followExpanded = !followExpanded">
          {{ followExpanded ? '收起' : '全部' }}
        </button>
      </div>
      <div v-if="user && visibleFollows.length" class="mme-grid">
        <article v-for="row in visibleFollows" :key="row.id" class="mme-card" @click="goPlay(row.vod?.id)">
          <div>
            <img v-if="row.vod" :src="poster(row.vod)" :alt="row.vod.name" loading="lazy" @error="onImgError($event)" />
            <span v-if="row.vod?.remarks">{{ row.vod.remarks }}</span>
          </div>
          <strong>{{ row.vod?.name || '追剧内容' }}</strong>
          <p>{{ row.vod?.typeName || '影片' }}<template v-if="row.vod?.year"> · {{ row.vod.year }}</template></p>
        </article>
      </div>
      <div v-else class="mme-empty small">
        <strong>{{ user ? '暂无追剧' : '登录后查看追剧' }}</strong>
        <span>{{ user ? '在播放页点追剧后会出现在这里' : '追剧列表会跟随账号同步' }}</span>
      </div>
    </section>

    <section v-if="user && recs.length" class="mme-section">
      <div class="mme-section-head">
        <h2>为你推荐</h2>
        <button type="button" @click="goTheater">更多</button>
      </div>
      <div class="mme-grid">
        <article v-for="vod in recs.slice(0, 6)" :key="vod.id" class="mme-card" @click="goPlay(vod.id)">
          <div>
            <img :src="poster(vod)" :alt="vod.name" loading="lazy" @error="onImgError($event)" />
            <span v-if="vod.rating">{{ vod.rating }}</span>
          </div>
          <strong>{{ vod.name }}</strong>
          <p>{{ vod.typeName || '未分类' }}<template v-if="vod.year"> · {{ vod.year }}</template></p>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onActivated, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { openAuthDialog } from '../authDialog'
import { notifySuccess } from '../feedback'
import { levelTagStyle } from '../levelTag'
import { clearSession, currentUser, refreshUser } from '../userStore'
import { icon } from './icons'

const router = useRouter()
const route = useRoute()
const user = currentUser
const loading = ref(true)
const histories = ref([])
const follows = ref([])
const recs = ref([])
const historyExpanded = ref(false)
const followExpanded = ref(false)
const historyEl = ref(null)
const followsEl = ref(null)

const displayName = computed(() => user.value?.nickname || user.value?.username || '我的')
const userLine = computed(() => {
  const id = user.value?.id || user.value?.mid
  return id ? `ID ${id} · ${user.value?.isVip ? '会员账号' : '普通账号'}` : '账号已登录'
})
const vipText = computed(() => {
  if (!user.value) return '游客状态不会同步观看历史'
  if (!user.value?.vipExpireAt) return user.value?.isVip ? '会员状态有效' : '暂无到期时间'
  return `有效期至 ${new Date(user.value.vipExpireAt).toLocaleDateString('zh-CN')}`
})
const visibleHistories = computed(() => historyExpanded.value ? histories.value : histories.value.slice(0, 3))
const visibleFollows = computed(() => followExpanded.value ? follows.value : follows.value.slice(0, 6))

function poster(vod) {
  return imgUrl(vod?.officialPic || vod?.pic || vod?.localPic || vod?.heroImage || vod?.heroPic || '')
}
function onImgError(event) {
  const img = event?.target
  if (img) img.style.visibility = 'hidden'
}
function progressWidth(item) {
  const progress = Number(item?.progressSec) || 0
  const duration = Number(item?.durationSec) || 0
  if (!duration) return '18%'
  return `${Math.max(8, Math.min(100, (progress / duration) * 100))}%`
}
function login() {
  openAuthDialog({ mode: 'login', redirect: route.fullPath, reason: '登录后进入个人中心' })
}
function logout() {
  clearSession()
  histories.value = []
  follows.value = []
  recs.value = []
  notifySuccess('已退出登录')
}
function goPlay(id) {
  if (!id) return
  router.push(`/m/play/${id}`)
}
function goTheater() {
  router.push('/m/theater')
}
function scrollTo(target) {
  const el = target === 'follows' ? followsEl.value : historyEl.value
  if (!el) return
  nextTick(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
async function load() {
  loading.value = true
  try {
    const fresh = await refreshUser()
    if (!fresh && !user.value) return
    const [historyRows, followRows, recData] = await Promise.all([
      api.history(50).catch(() => []),
      api.follows(50).catch(() => []),
      api.userRecommendations(18).catch(() => ({ list: [] })),
    ])
    histories.value = Array.isArray(historyRows) ? historyRows : []
    follows.value = Array.isArray(followRows) ? followRows : []
    recs.value = Array.isArray(recData?.list) ? recData.list : []
  } finally {
    loading.value = false
  }
}

onMounted(load)
onActivated(load)
</script>

<style scoped>
.mme {
  min-height: 100dvh;
  padding: calc(env(safe-area-inset-top) + 14px) 14px calc(88px + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 24% 0%, rgba(255, 94, 74, .16), transparent 34%),
    linear-gradient(180deg, #fff4f1 0%, #f7f7f8 250px, #f7f7f8 100%);
  color: #191a20;
}
.mme-hero {
  position: sticky;
  z-index: 24;
  top: calc(env(safe-area-inset-top) + 10px);
  border-radius: 24px;
  padding: 18px;
  background: linear-gradient(135deg, #ff6a4d, #ffb35d);
  color: #fff;
  box-shadow: 0 18px 42px rgba(228, 71, 48, .16);
}
.mme-user {
  display: flex;
  gap: 13px;
  align-items: center;
  min-width: 0;
}
.mme-avatar {
  width: 58px;
  height: 58px;
  border-radius: 22px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, .22);
  border: 1px solid rgba(255, 255, 255, .28);
  flex: 0 0 58px;
}
.mme-avatar svg {
  width: 30px;
  height: 30px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mme-user-copy {
  min-width: 0;
  flex: 1;
}
.mme-user-copy h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.15;
  letter-spacing: 0;
}
.mme-user-copy p {
  margin: 7px 0 0;
  color: rgba(255, 255, 255, .84);
  font-size: 13px;
  line-height: 1.45;
}
.mme-level {
  display: inline-flex;
  margin-top: 9px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
}
.mme-login,
.mme-logout {
  width: 100%;
  height: 44px;
  margin-top: 18px;
  border: 0;
  border-radius: 15px;
  background: #fff;
  color: #e84932;
  font-size: 15px;
  font-weight: 900;
}
.mme-logout {
  background: rgba(255, 255, 255, .18);
  color: #fff;
}
.mme-vip,
.mme-stats,
.mme-section {
  margin-top: 14px;
  border-radius: 22px;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 12px 32px rgba(32, 36, 46, .06);
}
.mme-vip {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 16px;
}
.mme-vip span {
  display: block;
  color: #9a6038;
  font-size: 12px;
  font-weight: 900;
}
.mme-vip strong {
  display: block;
  margin-top: 4px;
  font-size: 16px;
}
.mme-vip p {
  margin: 5px 0 0;
  color: #8a8f99;
  font-size: 12px;
}
.mme-vip button {
  flex: 0 0 auto;
  height: 36px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  background: #191a20;
  color: #fff;
  font-weight: 900;
}
.mme-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 8px;
}
.mme-stats button {
  min-width: 0;
  border: 0;
  border-radius: 16px;
  padding: 12px 4px;
  background: transparent;
  color: #191a20;
}
.mme-stats strong {
  display: block;
  font-size: 21px;
  line-height: 1;
}
.mme-stats span {
  display: block;
  margin-top: 7px;
  color: #808691;
  font-size: 12px;
  font-weight: 800;
}
.mme-stats.muted {
  opacity: .62;
}
.mme-section {
  padding: 16px;
  scroll-margin-top: 14px;
}
.mme-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 13px;
}
.mme-section-head h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
}
.mme-section-head button {
  border: 0;
  background: transparent;
  color: #f04438;
  font-size: 13px;
  font-weight: 900;
}
.mme-watch-list {
  display: grid;
  gap: 10px;
}
.mme-watch {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-height: 108px;
}
.mme-watch-cover {
  position: relative;
  width: 82px;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  border-radius: 14px;
  background: #eceef2;
}
.mme-watch-cover img,
.mme-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mme-watch-cover span {
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, .58);
  color: #fff;
  font-size: 11px;
  font-weight: 900;
  text-align: center;
}
.mme-watch strong,
.mme-card strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  line-height: 1.25;
}
.mme-watch p,
.mme-card p {
  margin: 7px 0 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #858b96;
  font-size: 12px;
}
.mme-watch i {
  display: block;
  height: 5px;
  margin-top: 14px;
  border-radius: 999px;
  overflow: hidden;
  background: #edf0f4;
}
.mme-watch em {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #ff654d, #ffb35d);
}
.mme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 9px;
}
.mme-card {
  min-width: 0;
}
.mme-card div {
  position: relative;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  border-radius: 14px;
  background: #eceef2;
}
.mme-card span {
  position: absolute;
  left: 6px;
  top: 6px;
  max-width: calc(100% - 12px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 999px;
  padding: 3px 6px;
  background: rgba(0, 0, 0, .58);
  color: #fff;
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
}
.mme-card strong {
  margin-top: 8px;
  font-size: 13px;
}
.mme-empty {
  display: grid;
  place-items: center;
  min-height: 118px;
  border-radius: 18px;
  background: #f5f6f8;
  text-align: center;
}
.mme-empty.small {
  min-height: 94px;
}
.mme-empty strong {
  display: block;
  font-size: 15px;
}
.mme-empty span {
  display: block;
  margin-top: 7px;
  color: #858b96;
  font-size: 12px;
}
.mme-sk div,
.mme-sk b,
.mme-sk p {
  display: block;
  border-radius: 12px;
  background: linear-gradient(90deg, #eef0f4, #f8f8fa, #eef0f4);
  background-size: 200% 100%;
  animation: mme-sk 1.15s infinite linear;
}
.mme-sk div {
  width: 82px;
  aspect-ratio: 3 / 4;
}
.mme-sk b {
  width: 70%;
  height: 16px;
}
.mme-sk p {
  width: 48%;
  height: 12px;
  margin-top: 10px;
}
@keyframes mme-sk {
  to { background-position: -200% 0; }
}
</style>
