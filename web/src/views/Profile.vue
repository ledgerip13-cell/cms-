<template>
  <div class="page profile-page">
    <section class="profile-head">
      <div>
        <div class="profile-title">{{ user?.nickname || user?.username }}</div>
        <div class="profile-sub">
          <span>{{ isNewUser ? '选择喜欢的类型，推荐会马上跟着变化' : '追剧、历史记录和个性化推荐' }}</span>
          <span v-if="user?.vipLevel" class="member-level-label" :style="levelTagStyle(user.vipLevel)">{{ user.vipLevel.name }}</span>
        </div>
      </div>
      <button class="profile-logout" @click="logout">退出登录</button>
    </section>

    <section v-if="isNewUser" class="onboarding-panel">
      <div>
        <div class="onboarding-title">注册成功</div>
        <div class="onboarding-sub">先点选几个喜欢的类型，保存后就能得到更准的推荐。</div>
      </div>
      <button v-if="nextPath" class="mini-btn" @click="goNext">稍后继续</button>
    </section>

    <section class="pref-panel">
      <div class="row-head"><div class="row-title">喜欢的类型</div></div>
      <div class="chips pref-chips">
        <span v-for="t in types" :key="t.name" class="chip sm" :class="{on: prefs.includes(t.name)}" @click="toggleType(t.name)">
          {{ t.name || '未分类' }}<i class="cc">{{ t.count }}</i>
        </span>
      </div>
      <div class="pref-actions">
        <button class="mini-btn primary" :disabled="saving" @click="savePrefs">{{ saving ? '保存中…' : '保存偏好' }}</button>
        <span v-if="msg" class="pref-msg">{{ msg }}</span>
      </div>
    </section>

    <section ref="libraryPanel" class="profile-library">
      <div class="profile-tabs">
        <button type="button" :class="{on: activeTab==='history'}" @click="selectTab('history', { scroll: false })">
          最近观看 <span>{{ histories.length }}</span>
        </button>
        <button type="button" :class="{on: activeTab==='follows'}" @click="selectTab('follows', { scroll: false })">
          我的追剧 <span>{{ follows.length }}</span>
        </button>
      </div>

      <div v-if="activeTab==='history'" class="profile-tab-panel">
        <div v-if="pagedHistories.length" class="history-list">
          <div v-for="h in pagedHistories" :key="h.id" class="history-item" @click="goPlay(h.vod.id)">
            <div class="history-name">{{ h.vod.name }}</div>
            <div class="history-sub">{{ h.epName || ('第' + (h.epIndex + 1) + '集') }} · {{ h.vod.typeName || '未分类' }} · {{ fmt(h.updatedAt) }}</div>
          </div>
        </div>
        <div v-else class="empty small">暂无观看历史</div>
        <div v-if="historyPageCount > 1" class="pager">
          <button type="button" :disabled="historyPage===1" @click="historyPage--">上一页</button>
          <span>{{ historyPage }} / {{ historyPageCount }}</span>
          <button type="button" :disabled="historyPage===historyPageCount" @click="historyPage++">下一页</button>
        </div>
      </div>

      <div v-else class="profile-tab-panel">
        <div v-if="pagedFollows.length" class="profile-card-grid">
          <VodCard v-for="x in pagedFollows" :key="x.id" :vod="x.vod" @click="goPlay(x.vod.id)" />
        </div>
        <div v-else class="empty small">暂无追剧</div>
        <div v-if="followPageCount > 1" class="pager">
          <button type="button" :disabled="followPage===1" @click="followPage--">上一页</button>
          <span>{{ followPage }} / {{ followPageCount }}</span>
          <button type="button" :disabled="followPage===followPageCount" @click="followPage++">下一页</button>
        </div>
      </div>
    </section>

    <section class="row" v-if="recs.length">
      <div class="row-head">
        <div class="row-title">为你推荐</div>
        <div class="row-more">{{ recSource }}</div>
      </div>
      <div class="row-scroll">
        <VodCard v-for="v in recs" :key="v.id" :vod="v" @click="goPlay(v.id)" />
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { openAuthDialog } from '../authDialog'
import { apiErrorMessage, notifySuccess, notifyError } from '../feedback'
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
const activeTab = ref(normalizeTab(route.query.tab))
const historyPage = ref(1)
const followPage = ref(1)
const libraryPanel = ref(null)
const HISTORY_PAGE_SIZE = 8
const FOLLOW_PAGE_SIZE = 12
let suppressRouteScroll = false
const isNewUser = computed(() => route.query.new === '1')
const nextPath = computed(() => {
  const raw = Array.isArray(route.query.next) ? route.query.next[0] : route.query.next
  if (!raw || typeof raw !== 'string' || /^(https?:)?\/\//i.test(raw)) return ''
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return path === '/auth' || path.startsWith('/auth?') ? '' : path
})
const recSource = computed(() => {
  if (recMeta.value.types?.length) return recMeta.value.types.join(' / ')
  return recMeta.value.source === 'hot' ? '热门内容' : '根据行为推荐'
})
const historyPageCount = computed(() => Math.max(1, Math.ceil(histories.value.length / HISTORY_PAGE_SIZE)))
const followPageCount = computed(() => Math.max(1, Math.ceil(follows.value.length / FOLLOW_PAGE_SIZE)))
const pagedHistories = computed(() => paginate(histories.value, historyPage.value, HISTORY_PAGE_SIZE))
const pagedFollows = computed(() => paginate(follows.value, followPage.value, FOLLOW_PAGE_SIZE))

const VodCard = defineComponent({
  props: { vod: { type: Object, required: true } },
  emits: ['click'],
  setup(props, { emit }) {
    return () => h('div', { class: 'card2', onClick: () => emit('click') }, [
      h('div', { class: 'poster' }, [
        props.vod.officialPic || props.vod.pic || props.vod.localPic
          ? h('img', {
            src: imgUrl(props.vod.officialPic || props.vod.pic || props.vod.localPic),
            alt: props.vod.name,
            loading: 'lazy',
            onError: (e) => {
              const img = e.target
              const fallback = imgUrl(props.vod.localPic || '')
              if (fallback && img.dataset.localFallbackApplied !== '1' && img.getAttribute('src') !== fallback) {
                img.dataset.localFallbackApplied = '1'
                img.src = fallback
              } else {
                img.style.visibility = 'hidden'
              }
            }
          })
          : h('div', { class: 'noimg' }, '暂无封面'),
        props.vod.rating ? h('span', { class: 'badge score' }, props.vod.rating) : null,
        h('div', { class: 'poster-hover' }, [h('span', { class: 'play-ic' }, [h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [h('path', { d: 'M8.5 5.8v12.4a1.15 1.15 0 0 0 1.78.96l8.8-6.2a1.16 1.16 0 0 0 0-1.92l-8.8-6.2a1.15 1.15 0 0 0-1.78.96Z' })])])]),
      ]),
      h('div', { class: 'c-info' }, [
        h('div', { class: 'c-name' }, props.vod.name),
        h('div', { class: 'c-sub' }, `${props.vod.typeName || '未分类'} · ${props.vod.year || '—'}`),
      ]),
    ])
  },
})

function toggleType(name) {
  if (!name) return
  prefs.value = prefs.value.includes(name) ? prefs.value.filter(x => x !== name) : [...prefs.value, name]
}
function normalizeTab(tab) {
  const value = Array.isArray(tab) ? tab[0] : tab
  return value === 'follows' ? 'follows' : 'history'
}
function paginate(list, page, size) {
  const start = (Math.max(1, page) - 1) * size
  return list.slice(start, start + size)
}
function scrollToLibrary() {
  nextTick(() => {
    const el = libraryPanel.value
    if (!el) return
    const offset = window.matchMedia?.('(max-width: 860px)').matches ? 132 : 86
    const top = el.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  })
}
function selectTab(tab, opts = {}) {
  activeTab.value = normalizeTab(tab)
  if (activeTab.value === 'history') historyPage.value = 1
  if (activeTab.value === 'follows') followPage.value = 1
  if (!opts.fromRoute) {
    suppressRouteScroll = opts.scroll === false
    router.replace({ path: '/me', query: { ...route.query, tab: activeTab.value } })
  }
  if (opts.scroll !== false) scrollToLibrary()
}
function onProfileTab(e) {
  selectTab(e?.detail, { scroll: true })
}
function goPlay(id) { router.push('/play/' + id) }
function goNext() { if (nextPath.value) router.replace(nextPath.value) }
function fmt(s) { return new Date(s).toLocaleString('zh-CN', { hour12: false }) }
async function savePrefs() {
  saving.value = true; msg.value = ''
  try {
    const u = await api.updateUserProfile({ nickname: user.value?.nickname || user.value?.username, favoriteTypes: prefs.value })
    currentUser.value = u
    localStorage.setItem('vcms.user', JSON.stringify(u))
    msg.value = '已保存'
    notifySuccess('偏好已保存')
    await loadRecommendations()
    if (isNewUser.value) {
      await router.replace(nextPath.value ? { path: '/me', query: { next: nextPath.value } } : '/me')
    }
  } catch (e) {
    msg.value = apiErrorMessage(e, '保存失败')
    notifyError(msg.value)
  } finally { saving.value = false }
}
function logout() { clearSession(); notifySuccess('已退出登录'); router.replace('/') }
async function loadRecommendations() {
  const r = await api.userRecommendations(24)
  recMeta.value = { source: r.source, types: r.types || [] }
  recs.value = r.list || []
}
async function load() {
  if (!await refreshUser()) {
    openAuthDialog({ mode: 'login', redirect: '/me', reason: '登录后进入个人中心' })
    router.replace('/')
    return
  }
  prefs.value = user.value?.favoriteTypes || []
  const [ts, fs, hs] = await Promise.all([api.categories(), api.follows(100), api.history(100)])
  types.value = ts
  follows.value = fs
  histories.value = hs
  await loadRecommendations()
}
onMounted(() => {
  window.addEventListener('profile-tab', onProfileTab)
  load()
  if (route.query.tab) scrollToLibrary()
})
onBeforeUnmount(() => {
  window.removeEventListener('profile-tab', onProfileTab)
})
watch(() => route.query.tab, (tab) => {
  const shouldScroll = !suppressRouteScroll
  suppressRouteScroll = false
  selectTab(tab, { fromRoute: true, scroll: shouldScroll })
})
watch([historyPageCount, followPageCount], () => {
  historyPage.value = Math.min(historyPage.value, historyPageCount.value)
  followPage.value = Math.min(followPage.value, followPageCount.value)
})
</script>

<style scoped>
.profile-library { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 16px; }
.profile-tabs { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.profile-tabs button { height: 36px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--line);
  background: var(--bg2); color: var(--muted); cursor: pointer; font-size: 14px; font-weight: 800; }
.profile-tabs button:hover { border-color: var(--btn-hover-border); color: var(--btn-hover-text); }
.profile-tabs button.on { border-color: transparent; background: var(--btn-primary-bg); color: var(--btn-primary-text); }
.profile-tabs span { margin-left: 5px; opacity: .72; font-size: 12px; }
.profile-tab-panel { min-height: 180px; }
.profile-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(136px, 1fr)); gap: 14px; }
.pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; }
.pager button { height: 32px; padding: 0 14px; border-radius: 9px; border: 1px solid var(--line);
  background: var(--bg2); color: var(--text); cursor: pointer; font-size: 12.5px; font-weight: var(--small-text-max-weight); }
.pager button:not(:disabled):hover { border-color: var(--btn-hover-border); color: var(--btn-hover-text); }
.pager button:disabled { opacity: .42; cursor: not-allowed; }
.pager span { color: var(--muted); font-size: 13px; min-width: 52px; text-align: center; }

@media (max-width: 640px) {
  .profile-library { padding: 12px; border-radius: 14px; }
  .profile-tabs { gap: 8px; }
  .profile-tabs button { flex: 1; padding: 0 10px; }
  .profile-card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .pager { margin-top: 14px; }
}
</style>
