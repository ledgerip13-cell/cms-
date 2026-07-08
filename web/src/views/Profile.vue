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

    <section class="row" v-if="recs.length">
      <div class="row-head">
        <div class="row-title">为你推荐</div>
        <div class="row-more">{{ recSource }}</div>
      </div>
      <div class="row-scroll">
        <VodCard v-for="v in recs" :key="v.id" :vod="v" @click="goPlay(v.id)" />
      </div>
    </section>

    <section id="follows" class="row">
      <div class="row-head"><div class="row-title">我的追剧</div></div>
      <div v-if="follows.length" class="row-scroll follow-row">
        <VodCard v-for="x in follows" :key="x.id" :vod="x.vod" @click="goPlay(x.vod.id)" />
      </div>
      <div v-else class="empty small">暂无追剧</div>
    </section>

    <section id="history" class="row">
      <div class="row-head"><div class="row-title">观看历史</div></div>
      <div v-if="histories.length" class="history-list">
        <div v-for="h in histories" :key="h.id" class="history-item" @click="goPlay(h.vod.id)">
          <div class="history-name">{{ h.vod.name }}</div>
          <div class="history-sub">{{ h.epName || ('第' + (h.epIndex + 1) + '集') }} · {{ h.vod.typeName || '未分类' }} · {{ fmt(h.updatedAt) }}</div>
        </div>
      </div>
      <div v-else class="empty small">暂无观看历史</div>
    </section>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, nextTick, onMounted, ref, watch } from 'vue'
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
        h('div', { class: 'poster-hover' }, [h('span', { class: 'play-ic' }, [h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [h('path', { d: 'M8 5v14l11-7z' })])])]),
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
  const [ts, fs, hs] = await Promise.all([api.categories(), api.follows(50), api.history(50)])
  types.value = ts
  follows.value = fs
  histories.value = hs
  await loadRecommendations()
  await scrollToHash()
}
async function scrollToHash() {
  const id = String(route.hash || '').replace(/^#/, '')
  if (!id) return
  await nextTick()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
onMounted(load)
watch(() => route.hash, () => { void scrollToHash() })
</script>

<style scoped>
.follow-row { grid-auto-columns: 176px; }

@media (max-width: 640px) {
  .follow-row { grid-auto-columns: 128px; }
}
</style>
