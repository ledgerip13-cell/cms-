<template>
  <div class="page play-wrap" v-if="vod.id">
    <!-- 左：播放器 + 选集 + 信息 -->
    <div class="player-col">
      <div class="player-box">
        <video v-show="mode==='hls'" ref="videoEl" controls autoplay playsinline class="video"></video>
        <iframe v-if="mode==='iframe'" :src="curUrl" class="video" frameborder="0"
          allowfullscreen allow="autoplay; fullscreen"></iframe>
        <div v-if="mode==='iframe'" class="iframe-note">该源为加密分享页，解析未命中，已回退内嵌播放器</div>
        <div v-if="resolving" class="video-ph">正在解析播放地址…</div>
      </div>

      <!-- 标题信息条 -->
      <div class="pv-head">
        <div class="pv-poster" v-if="vod.officialPic || vod.pic">
          <img :src="pic(vod)" :alt="vod.name" @error="onErr" />
        </div>
        <div class="pv-meta">
          <h1 class="pv-title">{{ vod.name }}
            <span v-if="vod.rating" class="db-rating">⭐ {{ vod.rating }}</span>
          </h1>
          <div class="pv-tags">
            <span class="t">{{ vod.year || '—' }}</span>
            <span class="t">{{ vod.typeName || '未分类' }}</span>
            <span class="t" v-if="vod.area">{{ vod.area }}</span>
            <span class="t accent">{{ vod.lines.length }} 条线路</span>
          </div>
          <p class="pv-line" v-if="vod.remarks">更新：{{ vod.remarks }}</p>
          <p class="pv-line" v-if="vod.actor">主演：{{ vod.actor }}</p>
          <p class="pv-line" v-if="vod.director">导演：{{ vod.director }}</p>
          <div class="pv-intro" v-if="vod.officialIntro || vod.blurb">
            <p :class="{fold: !introOpen}">{{ vod.officialIntro || vod.blurb }}</p>
            <span class="intro-toggle" @click="introOpen=!introOpen">{{ introOpen ? '收起' : '展开' }}</span>
          </div>
        </div>
      </div>

      <div class="now-playing" v-if="curEp">
        正在播放：<b>{{ vod.name }}</b> · {{ curLine?.sourceName }}<span v-if="curLine?.channels?.length>1"> · {{ chanIdx===0?'推荐通道':'线路'+(chanIdx+1) }}</span> · {{ curEp.name }}
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
        <div class="eps-head">选集 <span>{{ curChannel.episodes.length }} 集</span></div>
        <div class="eps-grid">
          <span v-for="(e,i) in curChannel.episodes" :key="i" class="ep"
            :class="{on: epIdx===i}" @click="playEp(i)">{{ e.name }}</span>
        </div>
      </div>
    </div>

    <!-- 右：相关推荐 -->
    <aside class="rec-col">
      <div class="rec-head">相关推荐</div>
      <div v-if="related.length" class="rec-list">
        <div v-for="r in related" :key="r.id" class="rec-item" @click="goPlay(r.id)">
          <div class="rec-poster">
            <img v-if="r.officialPic || r.pic" :src="pic(r)" :alt="r.name" loading="lazy" @error="onErr" />
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
import Hls from 'hls.js'
import { api, imgUrl } from '../api'
defineOptions({ name: 'Play' })

const route = useRoute()
const router = useRouter()
const vod = ref({})
const related = ref([])
const introOpen = ref(false)
const videoEl = ref(null)
const lineIdx = ref(0); const chanIdx = ref(0); const epIdx = ref(0); const curUrl = ref(''); const mode = ref('hls'); const resolving = ref(false)
let hls = null

function isDirectM3u8(url) { return /\.m3u8(\?|$)/i.test(url) }
function onErr(e) { e.target.style.visibility='hidden' }
function pic(v) { return imgUrl(v.officialPic || v.pic || '') }
function goPlay(id) { router.push('/play/'+id) }

const curLine = computed(() => vod.value.lines?.[lineIdx.value])
// 当前选中的具体通道(flag)：有channels则取chanIdx对应项，否则回退用line本身(兼容旧数据)
const curChannel = computed(() => curLine.value?.channels?.[chanIdx.value] || curLine.value)
const curEp = computed(() => curChannel.value?.episodes?.[epIdx.value])

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
  if (isDirectM3u8(url)) { playHls(url); return }
  resolving.value = true
  try {
    const r = await api.resolve(url)
    if (r.ok && r.kind === 'm3u8') { playHls(r.url); return }
  } catch {}
  finally { resolving.value = false }
  mode.value = 'iframe'; curUrl.value = url
}
function playEp(i) { epIdx.value = i; const u = curChannel.value?.episodes?.[i]?.url; if (u) play(u) }
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
  vod.value = await api.vod(id)
  await nextTick()
  if (vod.value.lines?.length) playEp(0)
  // 相关推荐
  try {
    related.value = await api.related({ id, type: vod.value.typeName, sub: vod.value.subType, limit: 12 })
  } catch { related.value = [] }
  window.scrollTo({ top: 0 })
}

onMounted(() => loadVod(route.params.id))
watch(() => route.params.id, (id) => { if (id) loadVod(id) })
onBeforeUnmount(() => { if (hls) hls.destroy() })
</script>

<style scoped>
.play-wrap { display: grid; grid-template-columns: 1fr 316px; gap: 26px; }
.player-box { position: relative; background: #000; border-radius: 14px; overflow: hidden; aspect-ratio: 16/9; }
.video { width: 100%; height: 100%; background: #000; }
.video-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #667; pointer-events: none; }
.iframe-note { position: absolute; left: 0; right: 0; bottom: 0; font-size: 12px; color: #cbd3e0;
  background: rgba(0,0,0,.6); padding: 6px 12px; text-align: center; pointer-events: none; }

/* 标题信息条 */
.pv-head { display: flex; gap: 16px; margin: 18px 0; padding: 16px; background: var(--card);
  border: 1px solid var(--line); border-radius: 14px; }
.pv-poster { width: 108px; flex-shrink: 0; aspect-ratio: 2/3; border-radius: 10px; overflow: hidden; }
.pv-poster img { width: 100%; height: 100%; object-fit: cover; }
.pv-meta { min-width: 0; flex: 1; }
.pv-title { font-size: 22px; margin-bottom: 10px; }
.db-rating { font-size: 15px; color: #ff9900; font-weight: 800; margin-left: 10px; }
.pv-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.pv-tags .t { font-size: 12px; padding: 3px 10px; background: var(--bg2); border-radius: 6px; color: var(--muted); }
.pv-tags .t.accent { background: var(--grad); color: #fff; }
.pv-line { font-size: 13px; color: var(--muted); margin: 5px 0; line-height: 1.6;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pv-intro { margin-top: 10px; }
.pv-intro p { font-size: 13px; color: #9aa4b7; line-height: 1.75; }
.pv-intro p.fold { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.intro-toggle { font-size: 12px; color: var(--accent2); cursor: pointer; margin-top: 4px; display: inline-block; }

.now-playing { margin: 14px 0; font-size: 14px; color: var(--muted); }
.now-playing b { color: var(--text); }
.lines-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 16px 0;
  padding: 14px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
.channels-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: -6px 0 16px; padding: 10px 14px;
  background: rgba(255,255,255,.02); border: 1px dashed var(--line); border-radius: 10px; }
.chan-btn { padding: 5px 12px; border-radius: 7px; background: var(--bg2); border: 1px solid var(--line);
  font-size: 12.5px; cursor: pointer; transition: .15s; }
.chan-btn:hover { border-color: var(--accent); }
.chan-btn.on { background: var(--accent); border-color: transparent; color: #fff; font-weight: 600; }
.chan-btn.dead { opacity: .4; cursor: not-allowed; text-decoration: line-through; }
.chan-btn em { font-style: normal; font-size: 11px; margin-left: 4px; opacity: .8; }
.lbl { color: var(--muted); font-size: 14px; }
.line-btn { padding: 6px 14px; border-radius: 8px; background: var(--bg2); border: 1px solid var(--line);
  font-size: 13px; cursor: pointer; transition: .2s; }
.line-btn em { color: var(--muted); font-style: normal; font-size: 12px; }
.line-btn:hover { border-color: var(--accent2); }
.line-btn.on { background: var(--grad); border-color: transparent; color: #fff; }
.line-btn.on em { color: rgba(255,255,255,.8); }
.eps-box { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.eps-head { font-size: 15px; font-weight: 700; margin-bottom: 14px; }
.eps-head span { color: var(--muted); font-size: 13px; font-weight: 400; margin-left: 8px; }
.eps-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(66px, 1fr)); gap: 8px;
  max-height: 360px; overflow-y: auto; }
.ep { text-align: center; padding: 9px 4px; background: var(--bg2); border: 1px solid var(--line);
  border-radius: 7px; font-size: 13px; cursor: pointer; transition: .15s; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.ep:hover { border-color: var(--accent2); color: #fff; }
.ep.on { background: var(--accent2); border-color: transparent; color: #fff; }

/* 相关推荐 */
.rec-col { min-width: 0; }
.rec-head { font-size: 16px; font-weight: 800; margin-bottom: 14px; display: flex; align-items: center; gap: 9px; }
.rec-head::before { content: ''; width: 4px; height: 17px; border-radius: 2px; background: var(--grad); }
.rec-list { display: flex; flex-direction: column; gap: 12px; }
.rec-item { display: flex; gap: 11px; cursor: pointer; padding: 6px; border-radius: 10px; transition: .15s; }
.rec-item:hover { background: var(--card); }
.rec-poster { width: 68px; flex-shrink: 0; aspect-ratio: 2/3; border-radius: 8px; overflow: hidden; position: relative; background: #0f1420; }
.rec-poster img { width: 100%; height: 100%; object-fit: cover; }
.rec-poster .noimg { width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#455068;font-size:11px; }
.rec-score { position: absolute; right: 3px; bottom: 3px; background: linear-gradient(90deg,#ff8a00,#ff5c8a);
  color: #fff; font-size: 11px; font-weight: 700; padding: 1px 5px; border-radius: 5px; }
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
@media (max-width: 480px) {
  .pv-poster { width: 84px; }
  .pv-title { font-size: 18px; }
}
</style>
