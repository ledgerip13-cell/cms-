<template>
  <div class="container home">
    <!-- 索引筛选栏 -->
    <div class="filter-bar">
      <!-- 小类标签下钻：仅当选中某大类且该大类有小类时显示 -->
      <div class="filter-row" v-if="curType && subs.length">
        <span class="f-label">标签</span>
        <div class="chips">
          <span class="chip" :class="{on: !sub}" @click="setSub('')">全部</span>
          <span v-for="s in subs" :key="s.name" class="chip" :class="{on: sub===s.name}" @click="setSub(s.name)">
            {{ s.name }}<i class="cc">{{ s.count }}</i>
          </span>
        </div>
      </div>
      <div class="filter-row">
        <span class="f-label">排序</span>
        <div class="chips">
          <span v-for="s in sorts" :key="s.v" class="chip" :class="{on: sort===s.v}" @click="setSort(s.v)">{{ s.t }}</span>
        </div>
      </div>
      <div class="filter-row">
        <span class="f-label">年份</span>
        <div class="chips">
          <span class="chip" :class="{on: !year}" @click="setYear('')">全部</span>
          <span v-for="y in years" :key="y.year" class="chip" :class="{on: year===y.year}" @click="setYear(y.year)">{{ y.year }}</span>
        </div>
      </div>
    </div>

    <div class="section-title">
      {{ title }} <span class="cnt">共 {{ total }} 部</span>
    </div>

    <div v-if="loading" class="loading">加载中…</div>
    <div v-else-if="!list.length" class="empty">没有找到相关影片</div>
    <div v-else class="grid">
      <div v-for="v in list" :key="v.id" class="card2" @click="$router.push('/play/'+v.id)">
        <div class="poster">
          <img v-if="v.officialPic || v.pic" :src="v.officialPic || v.pic" :alt="v.name" loading="lazy" @error="onErr" />
          <div v-else class="noimg">暂无封面</div>
          <span class="badge lines">{{ v._count.plays }}线路</span>
          <span v-if="v.rating" class="badge score">{{ v.rating }}</span>
          <span v-else class="badge">{{ v.remarks || v.year }}</span>
        </div>
        <div class="c-info">
          <div class="c-name">{{ v.name }}</div>
          <div class="c-sub">{{ v.typeName || '未分类' }} · {{ v.year || '—' }}</div>
        </div>
      </div>
    </div>

    <div class="pager" v-if="total > size">
      <button :disabled="page<=1" @click="go(page-1)">上一页</button>
      <button disabled>{{ page }} / {{ Math.ceil(total/size) }}</button>
      <button :disabled="page>=Math.ceil(total/size)" @click="go(page+1)">下一页</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
const route = useRoute()
const router = useRouter()
const curType = computed(() => route.query.type || '')
// 当前大类下的小类标签
const subs = ref([]); const sub = ref('')
function setSub(s) { sub.value = s; page.value = 1; load() }
async function loadSubs() {
  sub.value = ''
  if (!curType.value) { subs.value = []; return }
  try { subs.value = (await api.subtypes(curType.value)).filter(s => s.count > 0) } catch { subs.value = [] }
}
const list = ref([]); const total = ref(0); const page = ref(1); const size = 30; const loading = ref(true)
const title = ref('热门推荐'); const years = ref([]); const year = ref(''); const sort = ref('recent')
const sorts = [
  { v: 'recent', t: '最近更新' },
  { v: 'hot', t: '热门' },
  { v: 'rating', t: '高分' },
]

async function load() {
  loading.value = true
  const type = route.query.type || ''
  const kw = route.query.kw || ''
  title.value = kw ? `搜索“${kw}”` : (type || (sort.value==='hot'?'热门影片':sort.value==='rating'?'高分影片':'最近更新'))
  const r = await api.vods({ page: page.value, size, type, kw, year: year.value, sort: sort.value, sub: sub.value })
  list.value = r.list; total.value = r.total; loading.value = false
}
function go(p) { page.value = p; load(); window.scrollTo({top:0,behavior:'smooth'}) }
function setSort(v) { sort.value = v; page.value = 1; load() }
function setYear(y) { year.value = y; page.value = 1; load() }
function onErr(e) { e.target.style.display='none' }
watch(() => route.query, async () => { page.value = 1; year.value=''; await loadSubs(); load() })
onMounted(async () => {
  years.value = await api.years()
  await loadSubs()
  load()
})
</script>

<style scoped>
.home { padding-top: 20px; }
.filter-bar { background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 14px 16px; margin-bottom: 20px; }
.filter-row { display: flex; align-items: flex-start; gap: 12px; padding: 6px 0; }
.filter-row + .filter-row { border-top: 1px solid var(--line); }
.f-label { color: var(--muted); font-size: 13px; padding-top: 5px; width: 40px; flex-shrink: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 5px 13px; border-radius: 16px; font-size: 13px; color: var(--muted);
  cursor: pointer; transition: .15s; background: var(--bg2); }
.chip:hover { color: var(--text); }
.chip.on { color: #fff; background: linear-gradient(90deg, var(--accent), var(--accent2)); }
.chip .cc { font-style: normal; font-size: 11px; opacity: .6; margin-left: 4px; }
.chip.on .cc { opacity: .85; }
.section-title { font-size: 18px; font-weight: 700; margin: 22px 0 16px; display: flex; align-items: center; gap: 10px; }
.section-title::before { content: ''; width: 4px; height: 18px; border-radius: 2px;
  background: linear-gradient(var(--accent), var(--accent2)); }
.cnt { font-size: 13px; color: var(--muted); font-weight: 400; }
@media (max-width: 480px) {
  .grid { grid-template-columns: repeat(auto-fill, minmax(105px, 1fr)); gap: 12px; }
  .f-label { width: 34px; font-size: 12px; }
}
</style>
