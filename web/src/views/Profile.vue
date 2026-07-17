<template>
  <div class="x8-user-page">
    <div class="x8-user-shell">
      <aside class="x8-user-aside">
        <section class="x8-user-card">
          <div class="x8-user-avatar">
            <img v-if="avatarUrl" :src="avatarUrl" :alt="displayName" @error="onAvatarError" />
            <span v-else>{{ userInitial }}</span>
          </div>
          <div class="x8-user-meta">
            <strong>{{ displayName }}</strong>
            <span>已免费观影 <b>{{ watchDays }}</b> 天</span>
            <em v-if="user?.vipLevel" :style="levelTagStyle(user.vipLevel)">{{ user.vipLevel.name }}</em>
          </div>
        </section>

        <nav class="x8-user-menu" aria-label="用户中心">
          <button
            v-for="item in menuItems"
            :key="item.key"
            type="button"
            :class="{ active: activeTab === item.key }"
            @click="selectTab(item.key)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" v-html="item.icon"></svg>
            <span>{{ item.label }}</span>
            <i>›</i>
          </button>
        </nav>

        <button class="x8-user-logout" type="button" @click="logout">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" /></svg>
          <span>退出登录</span>
        </button>
      </aside>

      <main ref="libraryPanel" class="x8-user-main">
        <section class="x8-user-tabs">
          <button
            v-for="item in panelTabs"
            :key="item.key"
            type="button"
            :class="{ active: activeTab === item.key }"
            @click="selectTab(item.key, { scroll: false })"
          >
            {{ item.label }}
          </button>
          <div class="x8-user-actions"></div>
        </section>

        <section v-if="isNewUser" class="x8-user-notice">
          <div>
            <strong>注册成功</strong>
            <span>先选择喜欢的类型，推荐会马上跟着变化。</span>
          </div>
          <button v-if="nextPath" type="button" @click="goNext">稍后继续</button>
        </section>

        <section v-if="activeTab === 'userInfo'" class="x8-user-panel">
          <div class="x8-user-info-grid">
            <div class="x8-user-info-row">
              <span>账号</span>
              <strong>{{ user?.username || '-' }}</strong>
            </div>
            <div class="x8-user-info-row">
              <span>昵称</span>
              <strong>{{ user?.nickname || user?.username || '-' }}</strong>
            </div>
            <div class="x8-user-info-row">
              <span>账号类型</span>
              <strong>{{ user?.isVip ? '会员账号' : '普通账号' }}</strong>
            </div>
            <div class="x8-user-info-row">
              <span>到期时间</span>
              <strong>{{ vipExpireText }}</strong>
            </div>
          </div>

          <div class="x8-user-pref">
            <div class="x8-user-section-title">喜欢的类型</div>
            <div class="x8-user-chips">
              <button
                v-for="t in types"
                :key="t.name"
                type="button"
                :class="{ active: prefs.includes(t.name) }"
                @click="toggleType(t.name)"
              >
                {{ t.name || '未分类' }}<i>{{ t.count }}</i>
              </button>
            </div>
            <div class="x8-user-pref-actions">
              <button type="button" :disabled="saving" @click="savePrefs">{{ saving ? '保存中...' : '保存偏好' }}</button>
              <span v-if="msg">{{ msg }}</span>
            </div>
          </div>
        </section>

        <section v-else-if="activeTab === 'history'" class="x8-user-panel">
          <div v-if="pagedHistories.length" class="x8-history-records">
            <article v-for="h in pagedHistories" :key="h.id || `${h.vod?.id}-${h.epIndex}`" @click="goPlay(h.vod?.id)">
              <div class="x8-record-cover">
                <img v-if="poster(h.vod)" :src="poster(h.vod)" :alt="h.vod?.name || ''" @error="onImgError" />
                <span v-if="historyProgress(h)"><i :style="{ width: historyProgress(h) }"></i></span>
              </div>
              <div class="x8-record-copy">
                <strong>{{ h.vod?.name || '影片' }}</strong>
                <p>{{ historySub(h) }}</p>
                <em>{{ fmt(h.updatedAt) }}</em>
              </div>
              <button type="button">继续观看</button>
            </article>
          </div>
          <div v-else class="x8-user-empty">
            <strong>暂无历史记录</strong>
            <span>看过的影片会出现在这里</span>
          </div>
          <Pager v-if="historyPageCount > 1" :page="historyPage" :pages="historyPageCount" @prev="historyPage--" @next="historyPage++" />
        </section>

        <section v-else-if="activeTab === 'follows'" class="x8-user-panel">
          <div v-if="pagedFollows.length" class="x8-user-grid">
            <VodCard v-for="x in pagedFollows" :key="x.id" :vod="x.vod" @click="goPlay(x.vod?.id)" />
          </div>
          <div v-else class="x8-user-empty">
            <strong>暂无收藏记录</strong>
            <span>在详情页或播放页点击追剧后会保存到这里</span>
          </div>
          <Pager v-if="followPageCount > 1" :page="followPage" :pages="followPageCount" @prev="followPage--" @next="followPage++" />
        </section>

        <section v-else class="x8-user-panel">
          <div class="x8-user-empty">
            <strong>{{ activeLabel }}</strong>
            <span>当前功能暂未开放</span>
          </div>
        </section>
      </main>
    </div>

    <section v-if="recs.length" class="x8-user-recs">
      <div class="x8-user-recs-head">
        <strong>为你推荐</strong>
        <span>{{ recSource }}</span>
      </div>
      <div class="x8-user-grid">
        <VodCard v-for="v in recs.slice(0, 12)" :key="v.id" :vod="v" @click="goPlay(v.id)" />
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { openAuthDialog } from '../authDialog'
import { apiErrorMessage, notifyError, notifySuccess } from '../feedback'
import { levelTagStyle } from '../levelTag'
import { clearSession, currentUser, refreshUser } from '../userStore'

const router = useRouter()
const route = useRoute()
const user = currentUser
const types = ref([])
const prefs = ref([])
const follows = ref([])
const histories = ref([])
const recs = ref([])
const recMeta = ref({ source: '', types: [] })
const saving = ref(false)
const msg = ref('')
const activeTab = ref(normalizeTab(route.query.tab || route.query.from))
const historyPage = ref(1)
const followPage = ref(1)
const libraryPanel = ref(null)
const avatarBroken = ref(false)
const HISTORY_PAGE_SIZE = 8
const FOLLOW_PAGE_SIZE = 12
let suppressRouteScroll = false

const menuItems = [
  { key: 'userInfo', label: '个人资料', icon: '<path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" />' },
  { key: 'messages', label: '我的消息', icon: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />' },
  { key: 'history', label: '历史记录', icon: '<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />' },
  { key: 'follows', label: '收藏记录', icon: '<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />' },
]
const panelTabs = [
  { key: 'userInfo', label: '个人资料' },
  { key: 'history', label: '历史记录' },
  { key: 'follows', label: '收藏记录' },
]

const isNewUser = computed(() => route.query.new === '1')
const nextPath = computed(() => {
  const raw = Array.isArray(route.query.next) ? route.query.next[0] : route.query.next
  if (!raw || typeof raw !== 'string' || /^(https?:)?\/\//i.test(raw)) return ''
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return path === '/auth' || path.startsWith('/auth?') ? '' : path
})
const displayName = computed(() => user.value?.nickname || user.value?.username || '我的')
const userInitial = computed(() => displayName.value.slice(0, 1).toUpperCase())
const avatarUrl = computed(() => {
  if (avatarBroken.value) return ''
  return user.value?.avatar || user.value?.portrait || user.value?.userPortrait || ''
})
const watchDays = computed(() => {
  const created = user.value?.createdAt || user.value?.createTime
  if (!created) return 0
  const start = new Date(created).getTime()
  if (!Number.isFinite(start)) return 0
  return Math.max(0, Math.ceil((Date.now() - start) / 86400000))
})
const vipExpireText = computed(() => {
  if (!user.value?.vipExpireAt) return user.value?.isVip ? '会员状态有效' : '暂无'
  return new Date(user.value.vipExpireAt).toLocaleDateString('zh-CN')
})
const recSource = computed(() => {
  if (recMeta.value.types?.length) return recMeta.value.types.join(' / ')
  return recMeta.value.source === 'hot' ? '热门内容' : '根据行为推荐'
})
const activeLabel = computed(() => menuItems.find(item => item.key === activeTab.value)?.label || '个人中心')
const historyPageCount = computed(() => Math.max(1, Math.ceil(histories.value.length / HISTORY_PAGE_SIZE)))
const followPageCount = computed(() => Math.max(1, Math.ceil(follows.value.length / FOLLOW_PAGE_SIZE)))
const pagedHistories = computed(() => paginate(histories.value, historyPage.value, HISTORY_PAGE_SIZE))
const pagedFollows = computed(() => paginate(follows.value, followPage.value, FOLLOW_PAGE_SIZE))

const Pager = defineComponent({
  props: { page: Number, pages: Number },
  emits: ['prev', 'next'],
  setup(props, { emit }) {
    return () => h('div', { class: 'x8-user-pager' }, [
      h('button', { type: 'button', disabled: props.page <= 1, onClick: () => emit('prev') }, '上一页'),
      h('span', `${props.page} / ${props.pages}`),
      h('button', { type: 'button', disabled: props.page >= props.pages, onClick: () => emit('next') }, '下一页'),
    ])
  },
})
const VodCard = defineComponent({
  props: { vod: { type: Object, required: true } },
  emits: ['click'],
  setup(props, { emit }) {
    return () => h('article', { class: 'x8-user-vod', onClick: () => emit('click') }, [
      h('div', { class: 'x8-user-vod-cover' }, [
        poster(props.vod)
          ? h('img', { src: poster(props.vod), alt: props.vod?.name || '', loading: 'lazy', onError: onImgError })
          : h('span', { class: 'x8-user-noimg' }, '暂无封面'),
        props.vod?.remarks ? h('em', props.vod.remarks) : null,
      ]),
      h('strong', props.vod?.name || '影片'),
      h('p', `${props.vod?.typeName || '未分类'} · ${props.vod?.year || '-'}`),
    ])
  },
})

function normalizeTab(tab) {
  const value = Array.isArray(tab) ? tab[0] : tab
  if (value === 'historyRecord' || value === 'history') return 'history'
  if (value === 'myCollect' || value === 'follows') return 'follows'
  if (value === 'reportRecord') return 'messages'
  return 'userInfo'
}
function poster(vod) {
  return imgUrl(vod?.officialPic || vod?.pic || vod?.localPic || vod?.heroImage || vod?.heroPic || '')
}
function paginate(list, page, size) {
  const start = (Math.max(1, page) - 1) * size
  return list.slice(start, start + size)
}
function onImgError(event) {
  if (event?.target) event.target.style.visibility = 'hidden'
}
function onAvatarError() {
  avatarBroken.value = true
}
function toggleType(name) {
  if (!name) return
  prefs.value = prefs.value.includes(name) ? prefs.value.filter(x => x !== name) : [...prefs.value, name]
}
function scrollToLibrary() {
  nextTick(() => {
    const el = libraryPanel.value
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 92
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  })
}
function tabQuery(tab) {
  if (tab === 'history') return 'history'
  if (tab === 'follows') return 'follows'
  return 'userInfo'
}
function selectTab(tab, opts = {}) {
  activeTab.value = normalizeTab(tab)
  if (activeTab.value === 'history') historyPage.value = 1
  if (activeTab.value === 'follows') followPage.value = 1
  if (!opts.fromRoute) {
    suppressRouteScroll = opts.scroll === false
    router.replace({ path: '/me', query: { ...route.query, tab: tabQuery(activeTab.value), from: undefined } })
  }
  if (opts.scroll !== false) scrollToLibrary()
}
function onProfileTab(e) {
  selectTab(e?.detail, { scroll: true })
}
function goPlay(id) {
  if (!id) return
  router.push('/x8/play/' + id)
}
function goNext() {
  if (nextPath.value) router.replace(nextPath.value)
}
function fmt(s) {
  if (!s) return ''
  return new Date(s).toLocaleString('zh-CN', { hour12: false })
}
function historySub(item) {
  const ep = item?.epName || `第${Number(item?.epIndex || 0) + 1}集`
  const type = item?.vod?.typeName || '未分类'
  return `${ep} · ${type}`
}
function historyProgress(item) {
  const progress = Number(item?.progressSec) || 0
  const duration = Number(item?.durationSec) || 0
  if (!duration) return ''
  return `${Math.max(6, Math.min(100, (progress / duration) * 100))}%`
}
async function savePrefs() {
  saving.value = true
  msg.value = ''
  try {
    const u = await api.updateUserProfile({ nickname: user.value?.nickname || user.value?.username, favoriteTypes: prefs.value })
    currentUser.value = u
    localStorage.setItem('vcms.user', JSON.stringify(u))
    msg.value = '已保存'
    notifySuccess('偏好已保存')
    await loadRecommendations()
    if (isNewUser.value) await router.replace(nextPath.value ? { path: '/me', query: { next: nextPath.value } } : '/me')
  } catch (e) {
    msg.value = apiErrorMessage(e, '保存失败')
    notifyError(msg.value)
  } finally {
    saving.value = false
  }
}
function logout() {
  clearSession()
  notifySuccess('已退出登录')
  router.replace('/x8')
}
async function loadRecommendations() {
  const r = await api.userRecommendations(24).catch(() => ({ list: [] }))
  recMeta.value = { source: r.source, types: r.types || [] }
  recs.value = r.list || []
}
async function load() {
  if (!await refreshUser()) {
    openAuthDialog({ mode: 'login', redirect: '/me', reason: '登录后进入个人中心' })
    router.replace('/x8/login')
    return
  }
  avatarBroken.value = false
  prefs.value = user.value?.favoriteTypes || []
  const [ts, fs, hs] = await Promise.all([
    api.categories().catch(() => []),
    api.follows(100).catch(() => []),
    api.history(100).catch(() => []),
  ])
  types.value = ts
  follows.value = fs
  histories.value = hs
  await loadRecommendations()
}

onMounted(() => {
  window.addEventListener('profile-tab', onProfileTab)
  load()
  if (route.query.tab || route.query.from) scrollToLibrary()
})
onBeforeUnmount(() => {
  window.removeEventListener('profile-tab', onProfileTab)
})
watch(() => [route.query.tab, route.query.from], ([tab, from]) => {
  const shouldScroll = !suppressRouteScroll
  suppressRouteScroll = false
  selectTab(tab || from, { fromRoute: true, scroll: shouldScroll })
})
watch([historyPageCount, followPageCount], () => {
  historyPage.value = Math.min(historyPage.value, historyPageCount.value)
  followPage.value = Math.min(followPage.value, followPageCount.value)
})
</script>

<style scoped>
.x8-user-page {
  min-height: 100vh;
  padding: 112px 24px 64px;
  background: #121212;
  color: #fff;
}
.x8-user-shell {
  width: min(1750px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 24px;
}
.x8-user-aside,
.x8-user-main,
.x8-user-recs {
  border-radius: 12px;
  background: #1a1a1a;
  box-shadow: 0 2px 10px rgba(0,0,0,.2);
}
.x8-user-aside {
  align-self: start;
  overflow: hidden;
}
.x8-user-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.x8-user-avatar {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  overflow: hidden;
  flex: 0 0 76px;
  display: grid;
  place-items: center;
  color: #111;
  background: #fff;
  font-size: 30px;
  font-weight: 700;
}
.x8-user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.x8-user-meta {
  min-width: 0;
  display: grid;
  gap: 8px;
}
.x8-user-meta strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #fff;
  font-size: 20px;
  font-weight: 700;
}
.x8-user-meta span {
  color: rgba(255,255,255,.56);
  font-size: 14px;
}
.x8-user-meta b {
  color: #fff;
  font-weight: 600;
}
.x8-user-meta em {
  width: fit-content;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  font-style: normal;
}
.x8-user-menu {
  display: grid;
  gap: 2px;
  padding: 10px 0;
}
.x8-user-menu button,
.x8-user-logout {
  border: 0;
  color: rgba(255,255,255,.72);
  background: transparent;
  cursor: pointer;
}
.x8-user-menu button {
  height: 56px;
  display: grid;
  grid-template-columns: 26px 1fr 16px;
  align-items: center;
  gap: 12px;
  padding: 0 22px;
  text-align: left;
  font-size: 16px;
}
.x8-user-menu button svg,
.x8-user-logout svg {
  width: 22px;
  height: 22px;
}
.x8-user-menu button i {
  color: rgba(255,255,255,.32);
  font-style: normal;
  font-size: 22px;
}
.x8-user-menu button:hover,
.x8-user-menu button.active {
  color: #fff;
  background: rgba(255,255,255,.07);
}
.x8-user-menu button.active span {
  font-weight: 600;
}
.x8-user-logout {
  width: calc(100% - 32px);
  height: 44px;
  margin: 10px 16px 18px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255,255,255,.08);
  font-size: 15px;
}
.x8-user-logout:hover {
  color: #fff;
  background: rgba(255,255,255,.12);
}
.x8-user-main {
  min-height: 520px;
  overflow: hidden;
}
.x8-user-tabs {
  height: 64px;
  display: flex;
  align-items: stretch;
  gap: 30px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.x8-user-tabs button {
  position: relative;
  border: 0;
  padding: 0;
  color: rgba(255,255,255,.55);
  background: transparent;
  cursor: pointer;
  font-size: 17px;
  font-weight: 500;
}
.x8-user-tabs button.active {
  color: #fff;
  font-weight: 600;
}
.x8-user-tabs button.active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  border-radius: 999px 999px 0 0;
  background: #fff;
}
.x8-user-actions {
  margin-left: auto;
}
.x8-user-notice {
  margin: 24px 24px 0;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  background: rgba(255,255,255,.05);
}
.x8-user-notice div {
  display: grid;
  gap: 6px;
}
.x8-user-notice strong {
  font-size: 16px;
}
.x8-user-notice span {
  color: rgba(255,255,255,.58);
  font-size: 14px;
}
.x8-user-notice button {
  border: 0;
  border-radius: 6px;
  padding: 0 14px;
  color: #111;
  background: #fff;
  cursor: pointer;
  font-weight: 600;
}
.x8-user-panel {
  padding: 24px;
}
.x8-user-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.x8-user-info-row {
  min-height: 58px;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  background: rgba(255,255,255,.05);
}
.x8-user-info-row span {
  color: rgba(255,255,255,.5);
  font-size: 13px;
}
.x8-user-info-row strong {
  color: #fff;
  font-size: 16px;
  font-weight: 500;
}
.x8-user-pref {
  margin-top: 26px;
}
.x8-user-section-title {
  margin-bottom: 14px;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}
.x8-user-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.x8-user-chips button {
  min-height: 34px;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 6px;
  padding: 0 12px;
  color: rgba(255,255,255,.68);
  background: rgba(255,255,255,.05);
  cursor: pointer;
  font-size: 14px;
}
.x8-user-chips button.active {
  color: #111;
  border-color: #fff;
  background: #fff;
}
.x8-user-chips i {
  margin-left: 6px;
  opacity: .55;
  font-style: normal;
}
.x8-user-pref-actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.x8-user-pref-actions button {
  height: 38px;
  border: 0;
  border-radius: 6px;
  padding: 0 18px;
  color: #111;
  background: #fff;
  cursor: pointer;
  font-weight: 600;
}
.x8-user-pref-actions button:disabled {
  opacity: .55;
  cursor: not-allowed;
}
.x8-user-pref-actions span {
  color: rgba(255,255,255,.55);
  font-size: 13px;
}
.x8-history-records {
  display: grid;
  gap: 12px;
}
.x8-history-records article {
  min-height: 94px;
  border-radius: 8px;
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 10px;
  background: rgba(255,255,255,.05);
  cursor: pointer;
}
.x8-history-records article:hover {
  background: rgba(255,255,255,.08);
}
.x8-record-cover {
  position: relative;
  width: 70px;
  aspect-ratio: 3 / 4;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255,255,255,.06);
}
.x8-record-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.x8-record-cover span {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: rgba(255,255,255,.18);
}
.x8-record-cover i {
  display: block;
  height: 100%;
  background: #fff;
}
.x8-record-copy {
  min-width: 0;
  display: grid;
  gap: 8px;
}
.x8-record-copy strong,
.x8-record-copy p,
.x8-record-copy em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.x8-record-copy strong {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}
.x8-record-copy p,
.x8-record-copy em {
  color: rgba(255,255,255,.52);
  font-size: 13px;
  font-style: normal;
}
.x8-history-records article > button {
  height: 34px;
  border: 0;
  border-radius: 6px;
  padding: 0 14px;
  color: #111;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
.x8-user-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(142px, 1fr));
  gap: 16px;
}
.x8-user-vod {
  min-width: 0;
  cursor: pointer;
}
.x8-user-vod-cover {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  aspect-ratio: 2 / 3;
  background: rgba(255,255,255,.06);
}
.x8-user-vod-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .25s ease;
}
.x8-user-vod:hover img {
  transform: scale(1.05);
}
.x8-user-vod-cover em {
  position: absolute;
  right: 6px;
  bottom: 6px;
  max-width: calc(100% - 12px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 4px;
  padding: 3px 6px;
  color: #fff;
  background: rgba(0,0,0,.58);
  font-size: 11px;
  font-style: normal;
}
.x8-user-noimg {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: rgba(255,255,255,.4);
  font-size: 13px;
}
.x8-user-vod strong {
  display: block;
  margin-top: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}
.x8-user-vod p {
  margin: 5px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255,255,255,.48);
  font-size: 13px;
}
.x8-user-empty {
  min-height: 360px;
  display: grid;
  place-content: center;
  gap: 10px;
  text-align: center;
}
.x8-user-empty strong {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}
.x8-user-empty span {
  color: rgba(255,255,255,.48);
  font-size: 14px;
}
.x8-user-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
}
.x8-user-pager button {
  height: 34px;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 6px;
  padding: 0 14px;
  color: rgba(255,255,255,.78);
  background: rgba(255,255,255,.06);
  cursor: pointer;
}
.x8-user-pager button:disabled {
  opacity: .42;
  cursor: not-allowed;
}
.x8-user-pager span {
  min-width: 56px;
  color: rgba(255,255,255,.5);
  text-align: center;
  font-size: 13px;
}
.x8-user-recs {
  width: min(1750px, 100%);
  margin: 24px auto 0;
  padding: 24px;
}
.x8-user-recs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.x8-user-recs-head strong {
  font-size: 20px;
  font-weight: 600;
}
.x8-user-recs-head span {
  color: rgba(255,255,255,.48);
  font-size: 14px;
}
@media (max-width: 900px) {
  .x8-user-page {
    padding: 88px 14px 42px;
  }
  .x8-user-shell {
    grid-template-columns: 1fr;
  }
  .x8-user-menu {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 10px;
  }
  .x8-user-menu button {
    border-radius: 8px;
    padding: 0 12px;
  }
  .x8-user-info-grid {
    grid-template-columns: 1fr;
  }
  .x8-user-tabs {
    overflow-x: auto;
  }
  .x8-history-records article {
    grid-template-columns: 58px minmax(0, 1fr);
  }
  .x8-history-records article > button {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
