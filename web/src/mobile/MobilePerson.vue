<template>
  <main class="mperson">
    <header class="mps-head">
      <button class="m-back-btn" type="button" aria-label="返回" @click="goBack">
        <svg viewBox="0 0 24 24" v-html="icon('back')"></svg>
      </button>
      <strong>{{ person.name || '人物作品' }}</strong>
      <span></span>
    </header>

    <section v-if="loading" class="mps-grid">
      <div v-for="i in 8" :key="i" class="mps-card mps-sk">
        <div></div>
        <b></b>
        <p></p>
      </div>
    </section>

    <template v-else-if="person.id">
      <section class="mps-title">
        <h1>{{ person.name }}</h1>
        <p>{{ roleText }} · {{ items.length }} 部作品</p>
      </section>
      <section v-if="items.length" class="mps-grid">
        <article v-for="vod in items" :key="vod.id" class="mps-card" @click="goDetail(vod.id)">
          <div class="mps-poster">
            <img class="m-img-fade" :src="poster(vod)" :alt="vod.name" loading="lazy" @load="onImgLoad" @error="hideBrokenImg" />
            <span v-if="posterTag(vod)">{{ posterTag(vod) }}</span>
          </div>
          <strong>{{ vod.name }}</strong>
          <p>{{ [vod.typeName, vod.year, vod.area].filter(Boolean).join(' · ') || '影片' }}</p>
        </article>
      </section>
      <section v-else class="mps-empty">
        <strong>暂无可播放作品</strong>
      </section>
    </template>

    <section v-else class="mps-empty">
      <strong>人物不存在</strong>
      <button type="button" @click="router.replace('/m')">返回首页</button>
    </section>
  </main>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
import { icon } from './icons'

const route = useRoute()
const router = useRouter()
const person = ref({})
const items = ref([])
const roles = ref([])
const loading = ref(true)
let loadSeq = 0

const roleText = computed(() => {
  const map = { actor: '演员', director: '导演', writer: '编剧' }
  const labels = roles.value.map(role => map[role] || role).filter(Boolean)
  return labels.length ? [...new Set(labels)].join(' / ') : '演职员'
})

function poster(vod) {
  return imgUrl(vod?.officialPic || vod?.pic || vod?.localPic || vod?.heroImage || vod?.heroPic || '')
}
function posterTag(vod) {
  return String(vod?.remarks || '').trim()
}
function onImgLoad(event) {
  event?.target?.classList?.add('is-loaded')
}
function hideBrokenImg(event) {
  const img = event?.target
  if (img) img.style.visibility = 'hidden'
}
function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/m')
}
function goDetail(id) {
  if (id) router.push(`/m/detail/${id}`)
}
async function loadPerson(id) {
  const seq = ++loadSeq
  loading.value = true
  person.value = {}
  items.value = []
  roles.value = []
  try {
    const data = await api.person(id)
    if (seq !== loadSeq) return
    person.value = data?.person || {}
    roles.value = Array.isArray(data?.roles) ? data.roles : []
    items.value = Array.isArray(data?.list) ? data.list : []
    if (person.value.name) document.title = `${person.value.name} - 作品`
  } catch {
    if (seq === loadSeq) person.value = {}
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(() => route.params.id, (id) => {
  if (id) loadPerson(id)
}, { immediate: true })
</script>

<style scoped>
.mperson {
  min-height: 100dvh;
  padding: calc(env(safe-area-inset-top) + 62px) 14px 34px;
  background: #f7f7f8;
  color: #1f232b;
}
.mps-head {
  position: fixed;
  z-index: 24;
  left: 0;
  right: 0;
  top: 0;
  height: calc(env(safe-area-inset-top) + 54px);
  padding: env(safe-area-inset-top) 12px 0;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: 4px;
  background: rgb(247 247 248 / .96);
  backdrop-filter: blur(10px);
}
.mps-empty button {
  border: 0;
}
.mps-head button { color: #1f232b; }
.mps-head strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
}
.mps-title {
  margin: 4px 0 15px;
}
.mps-title h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: 0;
}
.mps-title p {
  margin: 6px 0 0;
  color: #7b8390;
  font-size: 13px;
}
.mps-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 9px;
}
.mps-card {
  min-width: 0;
}
.mps-poster {
  position: relative;
  overflow: hidden;
  aspect-ratio: 3 / 4.1;
  border-radius: 8px;
  background: #e6e8ee;
}
.mps-poster::after {
  content: "";
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  bottom: 0;
  height: 36%;
  background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.34));
  pointer-events: none;
}
.mps-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mps-poster span {
  position: absolute;
  z-index: 3;
  left: 6px;
  bottom: 6px;
  max-width: calc(100% - 12px);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  text-shadow: 0 1px 4px rgba(0,0,0,.5);
}
.mps-card strong,
.mps-card p {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mps-card strong {
  margin-top: 7px;
  color: #20242c;
  font-size: 14px;
  font-weight: 500;
}
.mps-card p {
  margin: 4px 0 0;
  color: #8b929f;
  font-size: 12px;
}
.mps-empty {
  min-height: 52vh;
  display: grid;
  place-content: center;
  gap: 14px;
  text-align: center;
  color: #8b929f;
}
.mps-empty strong {
  color: #303642;
}
.mps-empty button {
  height: 38px;
  border-radius: 999px;
  padding: 0 16px;
  background: #111318;
  color: #fff;
}
.mps-sk div,
.mps-sk b,
.mps-sk p {
  display: block;
  border-radius: 8px;
  background: linear-gradient(90deg, #eceef2, #f8f8fa, #eceef2);
  background-size: 200% 100%;
  animation: mps-sk 1.1s infinite linear;
}
.mps-sk div {
  aspect-ratio: 3 / 4.1;
}
.mps-sk b {
  height: 13px;
  margin-top: 8px;
}
.mps-sk p {
  width: 74%;
  height: 10px;
}
@keyframes mps-sk {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}
</style>
