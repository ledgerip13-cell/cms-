<template>
  <div class="container play-wrap" v-if="vod.id">
    <div class="player-col">
      <div class="player-box">
        <video v-show="mode==='hls'" ref="videoEl" controls autoplay playsinline class="video"></video>
        <iframe v-if="mode==='iframe'" :src="curUrl" class="video" frameborder="0"
          allowfullscreen allow="autoplay; fullscreen"></iframe>
        <div v-if="!curUrl" class="video-ph">选择线路和剧集开始播放</div>
        <div v-if="mode==='iframe'" class="iframe-note">该源为加密分享页，解析未命中，已回退内嵌播放器</div>
        <div v-if="resolving" class="video-ph">正在解析播放地址…</div>
      </div>
      <div class="now-playing" v-if="curEp">
        正在播放：<b>{{ vod.name }}</b> · {{ curLine?.sourceName }} · {{ curEp.name }}
      </div>

      <!-- 线路切换 -->
      <div class="lines-bar">
        <span class="lbl">线路</span>
        <span v-for="(l,i) in vod.lines" :key="l.id" class="line-btn" :class="{on: lineIdx===i}"
          @click="switchLine(i)">{{ l.sourceName }} <em>{{ l.epCount }}集</em></span>
      </div>

      <!-- 剧集列表 -->
      <div class="eps-box" v-if="curLine">
        <div class="eps-head">选集 <span>{{ curLine.episodes.length }} 集</span></div>
        <div class="eps-grid">
          <span v-for="(e,i) in curLine.episodes" :key="i" class="ep"
            :class="{on: epIdx===i}" @click="playEp(i)">{{ e.name }}</span>
        </div>
      </div>
    </div>

    <!-- 影片信息 -->
    <aside class="info-col">
      <div class="poster-lg">
        <img v-if="vod.officialPic || vod.pic" :src="vod.officialPic || vod.pic" :alt="vod.name" />
        <div v-else class="noimg" style="aspect-ratio:2/3">暂无封面</div>
      </div>
      <h1 class="title">{{ vod.name }}
        <span v-if="vod.rating" class="db-rating">⭐ {{ vod.rating }}</span>
      </h1>
      <div class="tags">
        <span class="t">{{ vod.year || '—' }}</span>
        <span class="t">{{ vod.typeName || '未分类' }}</span>
        <span class="t">{{ vod.area || '—' }}</span>
        <span class="t accent">{{ vod.lines.length }} 条线路</span>
      </div>
      <p class="meta" v-if="vod.remarks">更新：{{ vod.remarks }}</p>
      <p class="meta" v-if="vod.actor">主演：{{ vod.actor }}</p>
      <p class="meta" v-if="vod.director">导演：{{ vod.director }}</p>
      <p class="blurb" v-if="vod.officialIntro || vod.blurb">{{ vod.officialIntro || vod.blurb }}</p>
    </aside>
  </div>
  <div v-else class="loading container">加载中…</div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import Hls from 'hls.js'
import { api } from '../api'

const route = useRoute()
const vod = ref({})
const videoEl = ref(null)
const lineIdx = ref(0); const epIdx = ref(0); const curUrl = ref(''); const mode = ref('hls'); const resolving = ref(false)
let hls = null

function isDirectM3u8(url) { return /\.m3u8(\?|$)/i.test(url) }

const curLine = computed(() => vod.value.lines?.[lineIdx.value])
const curEp = computed(() => curLine.value?.episodes?.[epIdx.value])

function playHls(url) {
  mode.value = 'hls'
  curUrl.value = url
  const video = videoEl.value
  if (hls) { hls.destroy(); hls = null }
  if (Hls.isSupported()) {
    hls = new Hls({ maxBufferLength: 30 })
    hls.loadSource(url)
    hls.attachMedia(video)
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(()=>{}))
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url; video.play().catch(()=>{})
  }
}

async function play(url) {
  if (hls) { hls.destroy(); hls = null }
  // 直链直接 hls 播
  if (isDirectM3u8(url)) { playHls(url); return }
  // 分享页：先尝试服务端解析成真实直链（无广告）
  resolving.value = true
  try {
    const r = await api.resolve(url)
    if (r.ok && r.kind === 'm3u8') { playHls(r.url); return }
  } catch {}
  finally { resolving.value = false }
  // 解析失败回退 iframe
  mode.value = 'iframe'; curUrl.value = url
}
function playEp(i) { epIdx.value = i; const u = curLine.value.episodes[i]?.url; if (u) play(u) }
function switchLine(i) {
  lineIdx.value = i
  // 尽量保持当前集号
  const n = Math.min(epIdx.value, curLine.value.episodes.length - 1)
  playEp(n < 0 ? 0 : n)
}

onMounted(async () => {
  vod.value = await api.vod(route.params.id)
  await nextTick()
  if (vod.value.lines?.length) playEp(0)
})
onBeforeUnmount(() => { if (hls) hls.destroy() })
</script>

<style scoped>
.play-wrap { display: grid; grid-template-columns: 1fr 300px; gap: 24px; padding-top: 24px; }
.player-box { position: relative; background: #000; border-radius: 12px; overflow: hidden; aspect-ratio: 16/9; }
.video { width: 100%; height: 100%; background: #000; }
.video-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #667; pointer-events: none; }
.iframe-note { position: absolute; left: 0; right: 0; bottom: 0; font-size: 12px; color: #cbd3e0;
  background: rgba(0,0,0,.6); padding: 6px 12px; text-align: center; pointer-events: none; }
.now-playing { margin: 12px 0; font-size: 14px; color: var(--muted); }
.now-playing b { color: var(--text); }
.lines-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 16px 0;
  padding: 14px; background: var(--card); border-radius: 10px; }
.lbl { color: var(--muted); font-size: 14px; }
.line-btn { padding: 6px 14px; border-radius: 8px; background: var(--bg2); border: 1px solid var(--line);
  font-size: 13px; cursor: pointer; transition: .2s; }
.line-btn em { color: var(--muted); font-style: normal; font-size: 12px; }
.line-btn:hover { border-color: var(--accent2); }
.line-btn.on { background: linear-gradient(90deg, var(--accent), var(--accent2)); border-color: transparent; color: #fff; }
.line-btn.on em { color: rgba(255,255,255,.8); }
.eps-box { background: var(--card); border-radius: 10px; padding: 16px; }
.eps-head { font-size: 15px; font-weight: 600; margin-bottom: 14px; }
.eps-head span { color: var(--muted); font-size: 13px; font-weight: 400; margin-left: 8px; }
.eps-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 8px;
  max-height: 320px; overflow-y: auto; }
.ep { text-align: center; padding: 8px 4px; background: var(--bg2); border: 1px solid var(--line);
  border-radius: 6px; font-size: 13px; cursor: pointer; transition: .15s; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.ep:hover { border-color: var(--accent2); color: #fff; }
.ep.on { background: var(--accent2); border-color: transparent; color: #fff; }
.poster-lg img { width: 100%; border-radius: 12px; }
.title { font-size: 22px; margin: 16px 0 12px; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.tags .t { font-size: 12px; padding: 3px 10px; background: var(--bg2); border-radius: 6px; color: var(--muted); }
.tags .t.accent { background: linear-gradient(90deg, var(--accent), var(--accent2)); color: #fff; }
.meta { font-size: 13px; color: var(--muted); margin: 6px 0; line-height: 1.6; }
.db-rating { font-size: 15px; color: #ff9900; font-weight: 700; margin-left: 10px; }
.blurb { font-size: 13px; color: #9aa4b7; margin-top: 12px; line-height: 1.8; max-height: 240px; overflow: auto; }
.noimg { display: flex; align-items: center; justify-content: center; background: #0f1420; color: #455068; border-radius: 12px; }
@media (max-width: 860px) { .play-wrap { grid-template-columns: 1fr; } }
</style>
