<template>
  <main class="mme" :class="{ settings: settingsOpen }">
    <template v-if="settingsOpen">
      <header class="mme-subhead">
        <button class="m-back-btn" type="button" aria-label="返回" @click="settingsOpen = false">
          <svg viewBox="0 0 24 24" v-html="icon('back')"></svg>
        </button>
        <strong>账号设置</strong>
      </header>

      <section class="mme-setting-section">
        <h2>账号信息</h2>
        <div class="mme-setting-list">
          <div class="mme-setting-row">
            <span>账号</span>
            <strong>{{ user?.username || '-' }}</strong>
          </div>
          <div class="mme-setting-row">
            <span>邮箱</span>
            <strong>{{ user?.email || '未绑定' }}</strong>
          </div>
          <div class="mme-setting-row">
            <span>会员等级</span>
            <strong>{{ accountLevelText }}</strong>
          </div>
        </div>
      </section>

      <section class="mme-setting-section">
        <h2>安全</h2>
        <div class="mme-form-block">
          <label>
            <span>{{ user?.email ? '邮箱地址' : '绑定邮箱' }}</span>
            <input v-model.trim="emailForm.email" type="email" autocomplete="email" maxlength="120" placeholder="请输入邮箱地址" @input="emailMsg = ''" />
          </label>
          <button type="button" :disabled="emailSaving || !user" @click="saveEmail">{{ emailSaving ? '保存中' : (user?.email ? '保存邮箱' : '绑定邮箱') }}</button>
          <p v-if="emailMsg">{{ emailMsg }}</p>
        </div>
        <div class="mme-form-block">
          <label>
            <span>当前密码</span>
            <input v-model="passwordForm.oldPassword" type="password" autocomplete="current-password" placeholder="请输入当前密码" @input="passwordMsg = ''" />
          </label>
          <label>
            <span>新密码</span>
            <input v-model="passwordForm.newPassword" type="password" autocomplete="new-password" placeholder="至少6位" @input="passwordMsg = ''" />
          </label>
          <label>
            <span>确认密码</span>
            <input v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入新密码" @input="passwordMsg = ''" />
          </label>
          <button type="button" :disabled="passwordSaving || !user" @click="changePassword">{{ passwordSaving ? '保存中' : '修改密码' }}</button>
          <p v-if="passwordMsg">{{ passwordMsg }}</p>
        </div>
      </section>

      <section class="mme-setting-section">
        <h2>本地</h2>
        <button class="mme-list-action" type="button" @click="clearMobileCache">
          <span>清理缓存</span>
          <svg viewBox="0 0 24 24" v-html="icon('chevron')"></svg>
        </button>
      </section>

      <button v-if="user" class="mme-logout-wide" type="button" @click="logout">退出登录</button>
      <button v-else class="mme-logout-wide login" type="button" @click="login">登录 / 注册</button>
    </template>

    <template v-else>
      <header class="mme-topbar">
        <button type="button" aria-label="账号设置" @click="settingsOpen = true">
          <svg viewBox="0 0 24 24" v-html="icon('settings')"></svg>
        </button>
      </header>

      <section class="mme-user-panel">
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
        <div class="mme-stats" :class="{ muted: !user }">
          <button type="button" @click="scrollTo('history')">
            <strong>{{ histories.length }}</strong>
            <span>观看记录</span>
          </button>
          <button type="button" @click="user ? scrollTo('follows') : login()">
            <strong>{{ follows.length }}</strong>
            <span>我的追剧</span>
          </button>
        </div>
      </section>

      <section class="mme-quick">
        <button type="button" @click="scrollTo('history')">
          <svg viewBox="0 0 24 24" v-html="icon('clock')"></svg>
          <span>观看历史</span>
        </button>
        <button type="button" @click="user ? scrollTo('follows') : login()">
          <svg viewBox="0 0 24 24" v-html="icon('heart')"></svg>
          <span>我的追剧</span>
        </button>
        <button type="button" @click="settingsOpen = true">
          <svg viewBox="0 0 24 24" v-html="icon('mail')"></svg>
          <span>绑定邮箱</span>
        </button>
        <button type="button" @click="settingsOpen = true">
          <svg viewBox="0 0 24 24" v-html="icon('lock')"></svg>
          <span>修改密码</span>
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
      <div v-else-if="!histories.length" class="mme-empty">
        <strong>暂无观看历史</strong>
        <span>{{ user ? '去首页挑一部开始看' : '游客记录会保存在本机' }}</span>
      </div>
      <div v-else class="mme-watch-list">
        <article v-for="item in visibleHistories" :key="item.id || item.vodId" class="mme-watch" @click="goPlay(item)">
          <div class="mme-watch-cover">
            <img v-if="item.vod" class="m-img-fade" :src="poster(item.vod)" :alt="item.vod.name" loading="lazy" @load="onImgLoad" @error="onImgError($event)" />
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
            <img v-if="row.vod" class="m-img-fade" :src="poster(row.vod)" :alt="row.vod.name" loading="lazy" @load="onImgLoad" @error="onImgError($event)" />
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
            <img class="m-img-fade" :src="poster(vod)" :alt="vod.name" loading="lazy" @load="onImgLoad" @error="onImgError($event)" />
            <span v-if="vod.rating">{{ vod.rating }}</span>
          </div>
          <strong>{{ vod.name }}</strong>
          <p>{{ vod.typeName || '未分类' }}<template v-if="vod.year"> · {{ vod.year }}</template></p>
        </article>
      </div>
    </section>
    </template>
  </main>
</template>

<script setup>
import { computed, nextTick, onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { openAuthDialog } from '../authDialog'
import { notifySuccess } from '../feedback'
import { levelTagStyle } from '../levelTag'
import { USER_INFO_KEY, clearSession, currentUser, refreshUser } from '../userStore'
import { MOBILE_HISTORY_KEY, hydrateLocalHistoryRows, syncHistoryRowsToLocal } from '../historyStore'
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
const settingsOpen = ref(false)
const emailSaving = ref(false)
const passwordSaving = ref(false)
const emailMsg = ref('')
const passwordMsg = ref('')
const emailForm = reactive({ email: '' })
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
let loadSeq = 0

const displayName = computed(() => user.value?.nickname || user.value?.username || '我的')
const userLine = computed(() => {
  const id = user.value?.id || user.value?.mid
  return id ? `ID ${id} · ${user.value?.isVip ? '会员账号' : '普通账号'}` : '账号已登录'
})
const accountLevelText = computed(() => user.value?.vipLevel?.name || (user.value?.isVip ? 'VIP' : '普通用户'))
const visibleHistories = computed(() => historyExpanded.value ? histories.value : histories.value.slice(0, 3))
const visibleFollows = computed(() => followExpanded.value ? follows.value : follows.value.slice(0, 6))

function poster(vod) {
  return imgUrl(vod?.officialPic || vod?.pic || vod?.localPic || vod?.heroImage || vod?.heroPic || '')
}
function onImgError(event) {
  const img = event?.target
  if (img) img.style.visibility = 'hidden'
}

function onImgLoad(event) {
  event?.target?.classList?.add('is-loaded')
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
  settingsOpen.value = false
  notifySuccess('已退出登录')
}
function goPlay(item) {
  const id = typeof item === 'object' ? (item?.vod?.id || item?.vodId) : item
  if (!id) return
  const query = typeof item === 'object'
    ? {
        ...(item.lineId ? { line: item.lineId } : {}),
        ep: Math.max(0, Number(item.epIndex) || 0),
      }
    : {}
  router.push({ path: `/m/play/${id}`, query })
}
function goTheater() {
  router.push('/m/theater')
}
function scrollTo(target) {
  settingsOpen.value = false
  nextTick(() => {
    const el = target === 'follows' ? followsEl.value : historyEl.value
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}
function validateEmail() {
  const email = String(emailForm.email || '').trim()
  if (!email) return '请输入邮箱'
  if (email.length > 120) return '邮箱过长'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '邮箱格式不正确'
  return ''
}
async function saveEmail() {
  if (!user.value) return login()
  const error = validateEmail()
  if (error) {
    emailMsg.value = error
    return
  }
  emailSaving.value = true
  emailMsg.value = ''
  try {
    const updated = await api.updateUserProfile({
      nickname: user.value?.nickname || user.value?.username,
      email: emailForm.email,
      favoriteTypes: user.value?.favoriteTypes || [],
    })
    user.value = updated
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(updated))
    emailMsg.value = '邮箱已保存'
    notifySuccess('邮箱已保存')
  } catch (error) {
    emailMsg.value = error?.response?.data?.error || error?.message || '邮箱保存失败'
  } finally {
    emailSaving.value = false
  }
}
function validatePassword() {
  if (!passwordForm.oldPassword) return '请输入当前密码'
  if (!passwordForm.newPassword || passwordForm.newPassword.length < 6) return '新密码至少6位'
  if (passwordForm.newPassword !== passwordForm.confirmPassword) return '两次输入的新密码不一致'
  return ''
}
async function changePassword() {
  if (!user.value) return login()
  const error = validatePassword()
  if (error) {
    passwordMsg.value = error
    return
  }
  passwordSaving.value = true
  passwordMsg.value = ''
  try {
    await api.changeUserPassword({ oldPassword: passwordForm.oldPassword, newPassword: passwordForm.newPassword })
    passwordForm.oldPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
    passwordMsg.value = '密码已更新'
    notifySuccess('密码已更新')
  } catch (error) {
    passwordMsg.value = error?.response?.data?.error || error?.message || '密码修改失败'
  } finally {
    passwordSaving.value = false
  }
}
function clearMobileCache() {
  const keep = new Set(['vcms.user.token', 'vcms.user'])
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || keep.has(key)) continue
    if (key.startsWith('vcms.mobile.') || key.startsWith('vcms.short') || key.includes('.cache')) keys.push(key)
  }
  keys.forEach(key => localStorage.removeItem(key))
  notifySuccess(keys.length ? '缓存已清理' : '暂无可清理缓存')
}
async function loadLocalHistories(limit = 50) {
  return hydrateLocalHistoryRows(MOBILE_HISTORY_KEY, limit)
}
async function load() {
  const seq = ++loadSeq
  loading.value = true
  try {
    const localRows = await loadLocalHistories(50)
    if (seq !== loadSeq) return
    histories.value = localRows
    loading.value = false

    const fresh = await refreshUser().catch(() => null)
    if (seq !== loadSeq) return
    if (!fresh && !user.value) {
      follows.value = []
      recs.value = []
      return
    }

    const [followRows, recData] = await Promise.all([
      api.follows(50).catch(() => []),
      api.userRecommendations(18).catch(() => ({ list: [] })),
    ])
    if (seq !== loadSeq) return
    follows.value = Array.isArray(followRows) ? followRows : []
    recs.value = Array.isArray(recData?.list) ? recData.list : []

    api.history(50).then(async (historyRows) => {
      if (!Array.isArray(historyRows)) return
      syncHistoryRowsToLocal(historyRows, MOBILE_HISTORY_KEY)
      const mergedRows = await loadLocalHistories(50)
      if (seq === loadSeq) histories.value = mergedRows
    }).catch(() => {})
  } finally {
    loading.value = false
  }
}

watch(user, (value) => {
  emailForm.email = value?.email || ''
}, { immediate: true })

onMounted(load)
onActivated(load)
</script>

<style scoped>
.mme {
  min-height: 100dvh;
  padding: calc(env(safe-area-inset-top) + 8px) 0 calc(82px + env(safe-area-inset-bottom));
  background: #fff;
  color: #191a20;
}
.mme.settings {
  padding-bottom: calc(28px + env(safe-area-inset-bottom));
  background: #fff;
}
.mme-topbar,
.mme-subhead {
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: 52px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  background: rgba(255,255,255,.92);
  backdrop-filter: blur(12px);
}
.mme-topbar {
  justify-content: flex-end;
}
.mme-topbar button,
.mme-subhead button {
  border: 0;
  display: grid;
  place-items: center;
  color: #1f232b;
  background: transparent;
}
.mme-topbar button {
  width: 38px;
  height: 38px;
}
.mme-topbar svg,
.mme-quick svg,
.mme-list-action svg {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mme-subhead {
  justify-content: flex-start;
  gap: 8px;
}
.mme-subhead strong {
  font-size: 17px;
  font-weight: 600;
}
.mme-user-panel,
.mme-quick,
.mme-section,
.mme-setting-section {
  border-top: 8px solid #f5f6f8;
  background: #fff;
}
.mme-user-panel {
  border-top: 0;
  padding: 8px 14px 18px;
}
.mme-user {
  display: flex;
  gap: 13px;
  align-items: center;
  min-width: 0;
}
.mme-avatar {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: #15171d;
  flex: 0 0 62px;
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
  color: #15171d;
  font-size: 22px;
  line-height: 1.15;
  letter-spacing: 0;
}
.mme-user-copy p {
  margin: 7px 0 0;
  color: #767d89;
  font-size: 13px;
  line-height: 1.45;
}
.mme-level {
  display: inline-flex;
  margin-top: 9px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: var(--small-text-max-weight);
}
.mme-login {
  width: 100%;
  height: 42px;
  margin-top: 16px;
  border: 0;
  border-radius: 0;
  background: #15171d;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}
.mme-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  margin-top: 18px;
  border-top: 1px solid #f0f1f4;
}
.mme-stats button {
  min-width: 0;
  border: 0;
  padding: 14px 4px 0;
  background: transparent;
  color: #191a20;
}
.mme-stats button + button {
  border-left: 1px solid #f0f1f4;
}
.mme-stats strong {
  display: block;
  font-size: 22px;
  line-height: 1;
}
.mme-stats span {
  display: block;
  margin-top: 7px;
  color: #808691;
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mme-stats.muted {
  opacity: .62;
}
.mme-quick {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  padding: 16px 8px;
}
.mme-quick button {
  min-width: 0;
  border: 0;
  display: grid;
  justify-items: center;
  gap: 8px;
  color: #1f232b;
  background: transparent;
  font-size: 12px;
  font-weight: var(--small-text-max-weight);
}
.mme-quick button span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mme-section {
  padding: 16px 14px 18px;
  scroll-margin-top: 8px;
}
.mme-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 13px;
}
.mme-section-head h2,
.mme-setting-section h2 {
  margin: 0;
  color: #15171d;
  font-size: 17px;
  line-height: 1.2;
  font-weight: 600;
}
.mme-section-head button {
  border: 0;
  background: transparent;
  color: #f04438;
  font-size: 13px;
  font-weight: var(--small-text-max-weight);
}
.mme-watch-list {
  display: grid;
  gap: 12px;
}
.mme-watch {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-height: 92px;
}
.mme-watch-cover {
  position: relative;
  width: 92px;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 0;
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
  left: 5px;
  right: 5px;
  bottom: 5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 6px;
  background: rgba(0,0,0,.58);
  color: #fff;
  font-size: 11px;
  font-weight: var(--small-text-max-weight);
  text-align: center;
}
.mme-watch strong,
.mme-card strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--mobile-vod-card-title-color);
  font-size: var(--mobile-vod-card-title-size);
  font-weight: var(--mobile-vod-card-title-weight);
  line-height: var(--mobile-vod-card-title-line);
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
  height: 4px;
  margin-top: 13px;
  overflow: hidden;
  background: #edf0f4;
}
.mme-watch em {
  display: block;
  height: 100%;
  background: #f04438;
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
  border-radius: 0;
  background: #eceef2;
}
.mme-card span {
  position: absolute;
  left: 5px;
  top: 5px;
  max-width: calc(100% - 10px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 3px 6px;
  background: rgba(0,0,0,.58);
  color: #fff;
  font-size: 10px;
  font-style: normal;
  font-weight: 600;
}
.mme-card strong {
  margin-top: 8px;
}
.mme-empty {
  display: grid;
  place-items: center;
  min-height: 112px;
  background: #f5f6f8;
  text-align: center;
}
.mme-empty.small {
  min-height: 92px;
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
.mme-setting-section {
  padding: 18px 14px;
}
.mme-setting-section h2 {
  margin-bottom: 13px;
}
.mme-setting-list,
.mme-form-block {
  display: grid;
  gap: 0;
}
.mme-setting-row,
.mme-list-action {
  min-height: 48px;
  border: 0;
  border-bottom: 1px solid #f0f1f4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 0;
  background: transparent;
  color: #15171d;
  text-align: left;
}
.mme-setting-row span,
.mme-list-action span,
.mme-form-block label span {
  color: #69707c;
  font-size: 14px;
  font-weight: var(--small-text-max-weight);
}
.mme-setting-row strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
}
.mme-form-block + .mme-form-block {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid #f0f1f4;
}
.mme-form-block label {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}
.mme-form-block input {
  width: 100%;
  height: 42px;
  box-sizing: border-box;
  border: 1px solid #e7e9ee;
  border-radius: 0;
  outline: 0;
  padding: 0 12px;
  color: #15171d;
  background: #fff;
  font-size: 14px;
}
.mme-form-block input:focus {
  border-color: #15171d;
}
.mme-form-block button,
.mme-logout-wide {
  width: 100%;
  height: 42px;
  border: 0;
  border-radius: 0;
  color: #fff;
  background: #15171d;
  font-size: 14px;
  font-weight: 600;
}
.mme-form-block button:disabled {
  opacity: .48;
}
.mme-form-block p {
  margin: 9px 0 0;
  color: #f04438;
  font-size: 12px;
  line-height: 1.4;
}
.mme-list-action svg {
  width: 18px;
  height: 18px;
  color: #a0a5ae;
}
.mme-logout-wide {
  margin: 18px 14px 0;
  width: calc(100% - 28px);
  color: #f04438;
  background: #fff1ef;
}
.mme-logout-wide.login {
  color: #fff;
  background: #15171d;
}
.mme-sk div,
.mme-sk b,
.mme-sk p {
  display: block;
  background: linear-gradient(90deg, #eef0f4, #f8f8fa, #eef0f4);
  background-size: 200% 100%;
  animation: mme-sk 1.15s infinite linear;
}
.mme-sk div {
  width: 92px;
  aspect-ratio: 16 / 10;
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
