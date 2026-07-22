<template>
  <main class="mdetail" :style="{ '--md-head-bg': headBg }">
    <header class="md-head">
      <button type="button" aria-label="返回" @click="goBack">
        <svg viewBox="0 0 24 24" v-html="icon('back')"></svg>
      </button>
      <button class="md-search-pill" type="button" @click="router.push('/m/search')">
        <span>{{ vod.name || '搜索' }}</span>
        <svg viewBox="0 0 24 24" v-html="icon('search')"></svg>
      </button>
      <button type="button" aria-label="我的" @click="router.push('/m/me')">
        <svg viewBox="0 0 24 24" v-html="icon('user')"></svg>
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
            <span v-for="tag in detailTags" :key="tag">{{ tag }}</span>
          </div>
          <div class="md-meta-list">
            <p v-for="row in metaRows" :key="row.label"><span>{{ row.label }}：</span>{{ row.value }}</p>
          </div>
        </div>
      </section>

      <section class="md-action-row">
        <button class="primary" type="button" @click="playSelected()">
          <svg viewBox="0 0 24 24" v-html="icon('play')"></svg>
          立即播放
        </button>
        <button type="button" :class="{ on: followed }" aria-label="收藏" @click="toggleFollow">
          <svg viewBox="0 0 24 24" v-html="icon('heart')"></svg>
        </button>
        <button type="button" aria-label="添加" @click="toggleFollow">
          <svg viewBox="0 0 24 24" v-html="icon('plus')"></svg>
        </button>
        <button type="button" aria-label="分享" @click="shareVod">
          <svg viewBox="0 0 24 24" v-html="icon('share')"></svg>
        </button>
      </section>

      <section class="md-stats">
        <div v-for="item in statRows" :key="item.label">
          <b>{{ item.value }}</b>
          <span>{{ item.label }}</span>
        </div>
      </section>

      <section v-if="intro" class="md-intro-block">
        <p class="md-intro" :class="{ folded: !introOpen }">简介：{{ intro }}</p>
        <button v-if="intro.length > 88" type="button" @click="introOpen = !introOpen">{{ introOpen ? '收起' : '展开全部' }}</button>
      </section>

      <section v-if="lines.length" class="md-section">
        <header>
          <h2>金牌影院播放器</h2>
          <span>{{ selectedLineName }}</span>
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
        <header><h2>猜你喜欢</h2></header>
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
const detailTags = computed(() => {
  const tags = []
  const genreNames = splitNames(vod.value.genres).slice(0, 2)
  if (vod.value.typeName) tags.push(vod.value.typeName)
  for (const name of genreNames) if (!tags.includes(name)) tags.push(name)
  if (!tags.length && vod.value.subType) tags.push(vod.value.subType)
  return tags.slice(0, 3)
})
const metaRows = computed(() => [
  { label: '导演', value: directorsFallback.value.map(item => item.name).join('、') },
  { label: '主演', value: actorsFallback.value.map(item => item.name).join('、') },
  { label: '别名', value: vod.value.aliasName || vod.value.aliasNames?.join('、') || vod.value.enName || '' },
  { label: '语言', value: vod.value.lang || vod.value.area || '' },
].filter(item => item.value))
const selectedLineName = computed(() => lineLabel(selectedLine.value, selectedLineIndex.value))
const episodeSummary = computed(() => {
  if (vod.value.remarks) return vod.value.remarks
  const total = episodes.value.length || Number(selectedLine.value?.epCount || 0)
  return total ? `${total}集` : '待更新'
})
const statRows = computed(() => [
  { label: '评分', value: vod.value.rating ? String(vod.value.rating) : '暂无' },
  { label: '热度', value: heatText(vod.value.heatValue || vod.value.heatScore || vod.value.ratingCount) || '暂无' },
  { label: '上映时间', value: vod.value.year || '未知' },
  { label: '集数', value: episodeSummary.value },
])

function splitNames(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean)
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
function heatText(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  const n = Math.max(0, Math.round(Number(value) || 0))
  if (!n) return ''
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`
  return String(n)
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
  padding: calc(env(safe-area-inset-top) + 70px) 14px 38px;
  background: #191919;
  color: #f4f4f4;
}
.md-head {
  position: fixed;
  z-index: 30;
  left: 0;
  right: 0;
  top: 0;
  height: calc(env(safe-area-inset-top) + 58px);
  padding: env(safe-area-inset-top) 12px 0;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 38px;
  align-items: center;
  gap: 10px;
  background: rgb(13 13 13 / var(--md-head-bg));
  backdrop-filter: blur(14px);
}
.md-head button,
.md-action-row button,
.md-line-tabs button,
.md-episodes button,
.md-intro-block button,
.md-empty button {
  border: 0;
}
.md-head > button:not(.md-search-pill) {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: transparent;
  color: #fff;
}
.md-search-pill {
  min-width: 0;
  height: 38px;
  border-radius: 999px;
  padding: 0 10px 0 15px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: rgba(255,255,255,.5);
  background: #242424;
}
.md-search-pill span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
.md-head svg,
.md-action-row svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.md-hero {
  display: grid;
  grid-template-columns: 106px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.md-cover {
  width: 106px;
  aspect-ratio: 3 / 4;
  border-radius: 9px;
  object-fit: cover;
  background: #2b2b2b;
  box-shadow: 0 0 0 1px rgba(255,255,255,.08);
}
.md-info h1 {
  margin: 3px 0 12px;
  color: #fff;
  font-size: 24px;
  line-height: 1.16;
  letter-spacing: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.md-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 16px;
}
.md-tags span {
  padding: 4px 9px;
  border-radius: 6px;
  color: rgba(255,255,255,.76);
  background: rgba(255,255,255,.08);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
  font-size: 13px;
}
.md-meta-list {
  display: grid;
  gap: 9px;
}
.md-meta-list p {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: rgba(255,255,255,.76);
  font-size: 15px;
  line-height: 1.34;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-meta-list span {
  color: rgba(255,255,255,.55);
}
.md-action-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, 52px);
  gap: 12px;
  margin-top: 24px;
}
.md-action-row button {
  height: 52px;
  min-width: 0;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #fff;
  background: transparent;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.76);
  font-size: 18px;
  font-weight: 600;
}
.md-action-row button.primary {
  color: #111;
  background: #fff;
  box-shadow: none;
}
.md-action-row button.primary svg {
  fill: currentColor;
  stroke: none;
}
.md-action-row button.on {
  color: #fff;
  background: rgba(255,255,255,.12);
}
.md-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 24px;
}
.md-stats div {
  min-width: 0;
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 0 7px;
  border-left: 1px solid rgba(255,255,255,.12);
}
.md-stats div:first-child {
  border-left: 0;
}
.md-stats b,
.md-stats span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-stats b {
  color: rgba(255,255,255,.82);
  font-size: 15px;
  line-height: 1.1;
}
.md-stats span {
  color: rgba(255,255,255,.58);
  font-size: 13px;
}
.md-intro-block {
  position: relative;
  margin-top: 24px;
}
.md-section {
  margin-top: 28px;
  border-radius: 12px;
  overflow: hidden;
  background: #242424;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
}
.md-section header {
  min-height: 58px;
  padding: 0 16px;
  margin-bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.md-section h2 {
  margin: 0;
  color: #fff;
  font-size: 19px;
  line-height: 1;
}
.md-section header span {
  min-width: 0;
  overflow: hidden;
  color: rgba(255,255,255,.56);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-intro {
  margin: 0;
  color: rgba(255,255,255,.88);
  font-size: 17px;
  line-height: 1.62;
}
.md-intro.folded {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.md-intro-block button {
  position: absolute;
  right: 0;
  bottom: 1px;
  height: 31px;
  border-radius: 7px;
  padding: 0 10px;
  color: #fff;
  background: #242424;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.78);
  font-size: 14px;
}
.md-line-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 14px 16px 2px;
}
.md-line-tabs button {
  flex: 0 0 auto;
  height: 34px;
  border-radius: 8px;
  padding: 0 13px;
  background: rgba(255,255,255,.08);
  color: rgba(255,255,255,.72);
  font-size: 13px;
}
.md-line-tabs button.on {
  background: rgba(255,255,255,.14);
  color: #fff;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.72);
}
.md-episodes {
  padding: 14px 16px 18px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.md-episodes button {
  height: 50px;
  border-radius: 8px;
  background: rgba(255,255,255,.04);
  color: rgba(255,255,255,.86);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.1);
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-related {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 9px;
  padding: 0 14px 16px;
}
.md-related article {
  min-width: 0;
}
.md-related img {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 8px;
  object-fit: cover;
  background: #303030;
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
  color: #f5f5f5;
  font-size: 14px;
  font-weight: 500;
}
.md-related span {
  margin-top: 3px;
  color: rgba(255,255,255,.52);
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
  background: #fff;
  color: #111;
}
.md-skeleton {
  min-height: 178px;
}
.md-skeleton > div,
.md-skeleton b,
.md-skeleton p {
  border-radius: 8px;
  background: linear-gradient(110deg, #252525 8%, #303030 18%, #252525 33%);
  background-size: 200% 100%;
  animation: md-shimmer 1.2s linear infinite;
}
.md-skeleton > div {
  width: 106px;
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
