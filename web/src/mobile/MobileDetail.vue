<template>
  <main class="mdetail" :style="{ '--md-head-bg': headBg }">
    <header class="md-head">
      <button type="button" aria-label="返回" @click="goBack">
        <svg viewBox="0 0 24 24" v-html="icon('back')"></svg>
      </button>
      <strong>{{ vod.name || '影片详情' }}</strong>
      <button type="button" aria-label="分享" @click="shareVod">
        <svg viewBox="0 0 24 24" v-html="icon('share')"></svg>
      </button>
    </header>

    <section v-if="loading" class="md-hero md-skeleton">
      <div></div>
      <b></b>
      <p></p>
    </section>

    <template v-else-if="vod.id">
      <section class="md-hero">
        <img class="md-cover m-img-fade" :src="poster(vod)" :alt="vod.name" @load="onImgLoad" @error="hideBrokenImg" />
        <div class="md-info">
          <h1>{{ vod.name }}</h1>
          <div class="md-tags">
            <span v-if="vod.typeName">{{ vod.typeName }}</span>
            <span v-if="vod.year">{{ vod.year }}</span>
            <span v-if="vod.area">{{ vod.area }}</span>
            <span v-if="vod.lang">{{ vod.lang }}</span>
            <span v-if="vod.rating">评分 {{ vod.rating }}</span>
          </div>
          <p v-if="vod.remarks" class="md-remark">{{ vod.remarks }}</p>
          <div class="md-actions">
            <button class="primary" type="button" @click="playSelected()">
              <svg viewBox="0 0 24 24" v-html="icon('play')"></svg>
              播放
            </button>
            <button type="button" :class="{ on: followed }" @click="toggleFollow">
              <svg viewBox="0 0 24 24" v-html="icon('heart')"></svg>
              {{ followed ? '已追' : '追剧' }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="intro" class="md-section">
        <header>
          <h2>简介</h2>
          <button v-if="intro.length > 88" type="button" @click="introOpen = !introOpen">{{ introOpen ? '收起' : '展开' }}</button>
        </header>
        <p class="md-intro" :class="{ folded: !introOpen }">{{ intro }}</p>
      </section>

      <section v-if="directors.length || actors.length || vod.director || vod.actor" class="md-section">
        <header><h2>演职员</h2></header>
        <div v-if="directors.length || vod.director" class="md-people">
          <span>导演</span>
          <button v-for="person in directorsFallback" :key="`d-${person.id || person.name}`" type="button" @click="openPerson(person)">{{ person.name }}</button>
        </div>
        <div v-if="actors.length || vod.actor" class="md-people">
          <span>主演</span>
          <button v-for="person in actorsFallback" :key="`a-${person.id || person.name}`" type="button" @click="openPerson(person)">{{ person.name }}</button>
        </div>
      </section>

      <section v-if="lines.length" class="md-section">
        <header>
          <h2>播放线路</h2>
          <span>{{ lines.length }} 条</span>
        </header>
        <div class="md-line-tabs">
          <button v-for="(line, index) in lines" :key="line.id || index" type="button" :class="{ on: selectedLineIndex === index }" @click="selectedLineIndex = index">
            {{ lineLabel(line, index) }}
          </button>
        </div>
        <div class="md-episodes">
          <button v-for="ep in visibleEpisodes" :key="ep.index" type="button" @click="playSelected(ep.index)">
            {{ ep.name || `第${ep.index + 1}集` }}
          </button>
        </div>
      </section>

      <section v-if="related.length" class="md-section">
        <header><h2>相关推荐</h2></header>
        <div class="md-related">
          <article v-for="item in related" :key="item.id" @click="goDetail(item.id)">
            <img class="m-img-fade" :src="poster(item)" :alt="item.name" loading="lazy" @load="onImgLoad" @error="hideBrokenImg" />
            <strong>{{ item.name }}</strong>
            <span>{{ item.typeName || '影片' }}<template v-if="item.year"> · {{ item.year }}</template></span>
          </article>
        </div>
      </section>
    </template>

    <section v-else class="md-empty">
      <strong>影片不存在</strong>
      <button type="button" @click="router.replace('/m')">返回首页</button>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { openAuthDialog } from '../authDialog'
import { notifySuccess, notifyWarning } from '../feedback'
import { currentUser } from '../userStore'
import { icon } from './icons'

const route = useRoute()
const router = useRouter()
const vod = ref({})
const related = ref([])
const loading = ref(true)
const followed = ref(false)
const introOpen = ref(false)
const selectedLineIndex = ref(0)
const headBg = ref('.78')
let headRaf = 0
let loadSeq = 0

const intro = computed(() => String(vod.value.officialIntro || vod.value.blurb || '').trim())
const lines = computed(() => Array.isArray(vod.value.lines) ? vod.value.lines : [])
const selectedLine = computed(() => lines.value[selectedLineIndex.value] || lines.value[0] || null)
const episodes = computed(() => {
  const line = selectedLine.value
  const channel = Array.isArray(line?.channels) && line.channels.length ? line.channels[0] : line
  return Array.isArray(channel?.episodes) ? channel.episodes : []
})
const visibleEpisodes = computed(() => episodes.value.map((ep, index) => ({ ...ep, index })).slice(0, 60))
const actors = computed(() => peopleByRole('actor').slice(0, 12))
const directors = computed(() => peopleByRole('director').slice(0, 6))
const actorsFallback = computed(() => actors.value.length ? actors.value : splitNames(vod.value.actor).slice(0, 12).map(name => ({ id: 0, name })))
const directorsFallback = computed(() => directors.value.length ? directors.value : splitNames(vod.value.director).slice(0, 6).map(name => ({ id: 0, name })))

function splitNames(value) {
  return String(value || '').split(/[,，/、\s]+/).map(item => item.trim()).filter(Boolean)
}
function peopleByRole(role) {
  return (vod.value.people || [])
    .filter(item => item.role === role && item.person?.name)
    .map(item => ({ id: Number(item.person?.id || 0), name: item.person.name }))
    .filter(item => item.name)
}
function poster(item) {
  return imgUrl(item?.officialPic || item?.pic || item?.localPic || item?.heroImage || item?.heroPic || '')
}
function onImgLoad(event) {
  event?.target?.classList?.add('is-loaded')
}
function hideBrokenImg(event) {
  const img = event?.target
  if (img) img.style.visibility = 'hidden'
}
function lineLabel(line, index = 0) {
  return line?.sourceName || line?.flag || `线路 ${index + 1}`
}
function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/m')
}
function goDetail(id) {
  if (id) router.push(`/m/detail/${id}`)
}
function playSelected(epIndex = 0) {
  if (!vod.value.id) return
  const line = selectedLine.value
  router.push({ path: `/m/play/${vod.value.id}`, query: { ...(line?.id ? { line: line.id } : {}), ep: Math.max(0, Number(epIndex) || 0) } })
}
function openPerson(person) {
  const id = Number(person?.id || 0)
  const name = String(person?.name || '').trim()
  if (id) {
    router.push(`/m/person/${id}`)
    return
  }
  if (name) router.push({ path: '/m/search', query: { kw: name } })
}
async function toggleFollow() {
  if (!vod.value.id) return
  if (!currentUser.value) {
    openAuthDialog('login')
    return
  }
  try {
    const res = followed.value ? await api.unfollowVod(vod.value.id) : await api.followVod(vod.value.id)
    followed.value = Boolean(res?.followed ?? !followed.value)
    notifySuccess(followed.value ? '已加入追剧' : '已取消追剧')
  } catch {
    notifyWarning('操作失败')
  }
}
async function shareVod() {
  const url = `${window.location.origin}/vod/${vod.value.id || route.params.id}`
  const title = vod.value.name || document.title
  try {
    if (navigator.share) await navigator.share({ title, url })
    else {
      await navigator.clipboard?.writeText(url)
      notifySuccess('链接已复制')
    }
  } catch {}
}
async function loadDetail(id) {
  const seq = ++loadSeq
  loading.value = true
  vod.value = {}
  related.value = []
  followed.value = false
  introOpen.value = false
  selectedLineIndex.value = 0
  try {
    const data = await api.vod(id)
    if (seq !== loadSeq) return
    vod.value = data || {}
    document.title = vod.value.name ? `${vod.value.name} - 详情` : document.title
    const [items, state] = await Promise.all([
      api.related({ id, type: vod.value.typeName, sub: vod.value.subType, limit: 8 }).catch(() => []),
      currentUser.value ? api.userVodState(id).catch(() => null) : Promise.resolve(null),
    ])
    if (seq !== loadSeq) return
    related.value = Array.isArray(items) ? items : []
    followed.value = Boolean(state?.followed)
  } catch {
    if (seq === loadSeq) vod.value = {}
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}
function syncHeadBg() {
  headRaf = 0
  headBg.value = Math.max(.78, Math.min(1, .78 + (window.scrollY / 96) * .22)).toFixed(3)
}
function onPageScroll() {
  if (headRaf) return
  headRaf = window.requestAnimationFrame(syncHeadBg)
}

watch(() => route.params.id, (id) => {
  if (id) loadDetail(id)
}, { immediate: true })
onMounted(() => {
  syncHeadBg()
  window.addEventListener('scroll', onPageScroll, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onPageScroll)
  if (headRaf) cancelAnimationFrame(headRaf)
})
</script>

<style scoped>
.mdetail {
  min-height: 100dvh;
  padding: calc(env(safe-area-inset-top) + 62px) 14px 34px;
  background: #f7f7f8;
  color: #1f232b;
}
.md-head {
  position: fixed;
  z-index: 30;
  left: 0;
  right: 0;
  top: 0;
  height: calc(env(safe-area-inset-top) + 54px);
  padding: env(safe-area-inset-top) 12px 0;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 38px;
  align-items: center;
  gap: 6px;
  background: rgb(247 247 248 / var(--md-head-bg));
  backdrop-filter: blur(10px);
}
.md-head button,
.md-actions button,
.md-line-tabs button,
.md-episodes button,
.md-section header button,
.md-people button,
.md-empty button {
  border: 0;
}
.md-head button {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: transparent;
  color: #1f232b;
}
.md-head svg,
.md-actions svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.md-head strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
}
.md-hero {
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.md-cover {
  width: 118px;
  aspect-ratio: 3 / 4;
  border-radius: 8px;
  object-fit: cover;
  background: #e6e8ee;
}
.md-info h1 {
  margin: 2px 0 9px;
  font-size: 22px;
  line-height: 1.18;
  letter-spacing: 0;
}
.md-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.md-tags span {
  padding: 4px 7px;
  border-radius: 999px;
  background: #eceef2;
  color: #59616f;
  font-size: 12px;
}
.md-remark {
  margin: 10px 0 0;
  color: #f04438;
  font-size: 13px;
}
.md-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.md-actions button {
  height: 36px;
  min-width: 78px;
  border-radius: 999px;
  padding: 0 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: #fff;
  color: #20242c;
  font-size: 14px;
  font-weight: 600;
}
.md-actions button.primary {
  background: #111318;
  color: #fff;
}
.md-actions button.on {
  color: #f04438;
}
.md-section {
  margin-top: 22px;
}
.md-section header {
  min-height: 30px;
  margin-bottom: 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.md-section h2 {
  margin: 0;
  font-size: 17px;
  line-height: 1;
}
.md-section header span,
.md-section header button {
  color: #8b929f;
  font-size: 13px;
  background: transparent;
}
.md-intro {
  margin: 0;
  color: #4b5563;
  font-size: 14px;
  line-height: 1.72;
}
.md-intro.folded {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.md-people {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  margin-top: 8px;
}
.md-people span {
  color: #8b929f;
  font-size: 13px;
  line-height: 32px;
}
.md-people button {
  min-height: 32px;
  margin: 0 6px 6px 0;
  border-radius: 999px;
  padding: 0 10px;
  background: #fff;
  color: #333946;
  font-size: 13px;
}
.md-line-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.md-line-tabs button {
  flex: 0 0 auto;
  height: 34px;
  border-radius: 999px;
  padding: 0 13px;
  background: #fff;
  color: #555e6e;
  font-size: 13px;
}
.md-line-tabs button.on {
  background: #111318;
  color: #fff;
}
.md-episodes {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.md-episodes button {
  height: 36px;
  border-radius: 8px;
  background: #fff;
  color: #343b48;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-related {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 9px;
}
.md-related article {
  min-width: 0;
}
.md-related img {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 8px;
  object-fit: cover;
  background: #e6e8ee;
}
.md-related strong,
.md-related span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-related strong {
  margin-top: 6px;
  color: #20242c;
  font-size: 14px;
  font-weight: 500;
}
.md-related span {
  margin-top: 3px;
  color: #8b929f;
  font-size: 12px;
}
.md-empty {
  min-height: 50vh;
  display: grid;
  place-content: center;
  gap: 14px;
  text-align: center;
}
.md-empty button {
  height: 38px;
  border-radius: 999px;
  padding: 0 16px;
  background: #111318;
  color: #fff;
}
.md-skeleton {
  min-height: 178px;
}
.md-skeleton > div,
.md-skeleton b,
.md-skeleton p {
  border-radius: 8px;
  background: linear-gradient(110deg, #eceef2 8%, #f8f8fa 18%, #eceef2 33%);
  background-size: 200% 100%;
  animation: md-shimmer 1.2s linear infinite;
}
.md-skeleton > div {
  width: 118px;
  aspect-ratio: 3 / 4;
}
.md-skeleton b {
  width: 70%;
  height: 24px;
}
.md-skeleton p {
  width: 90%;
  height: 80px;
}
@keyframes md-shimmer {
  to { background-position-x: -200%; }
}
</style>
