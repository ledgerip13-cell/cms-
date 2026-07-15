<template>
  <div class="dashboard" v-loading="loading">
    <el-row :gutter="16" class="metric-row">
      <el-col :xs="12" :sm="8" :lg="6" :xl="3" v-for="item in metrics" :key="item.key">
        <div class="card metric-card">
          <div class="metric-label">{{ item.label }}</div>
          <div class="metric-value">{{ num(item.value) }}</div>
          <div class="metric-note">{{ item.note }}</div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="14">
        <div class="card panel">
          <div class="panel-head">
            <div>
              <div class="sec-title">今日内容动态</div>
              <div class="muted">按入库时间和内容更新时间分开看</div>
            </div>
            <el-tag effect="plain" type="success">今日新增 {{ num(stat.todayAdded) }}</el-tag>
          </div>
          <el-tabs v-model="activityTab">
            <el-tab-pane label="今日新增" name="added">
              <div class="vod-list">
                <button v-for="vod in recentAdded" :key="vod.id" class="vod-row" @click="openVod(vod)">
                  <span class="vod-main">
                    <strong>{{ vod.name }}</strong>
                    <span>{{ vod.typeName }} · {{ vod.year || '年份未知' }} · {{ vod.sourceName || '未知源' }}</span>
                  </span>
                  <span class="vod-side">
                    <em>{{ vod.remarks || `${vod.playCount || 0} 线` }}</em>
                    <small>{{ fmt(vod.createdAt) }}</small>
                  </span>
                </button>
                <el-empty v-if="!recentAdded.length" description="今日暂无新增影片" :image-size="80" />
              </div>
            </el-tab-pane>
            <el-tab-pane label="今日更新" name="updated">
              <div class="vod-list">
                <button v-for="vod in recentUpdated" :key="vod.id" class="vod-row" @click="openVod(vod)">
                  <span class="vod-main">
                    <strong>{{ vod.name }}</strong>
                    <span>{{ vod.typeName }} · {{ vod.year || '年份未知' }} · {{ vod.sourceName || '未知源' }}</span>
                  </span>
                  <span class="vod-side">
                    <em>{{ vod.remarks || `${vod.playCount || 0} 线` }}</em>
                    <small>{{ fmt(vod.contentUpdatedAt || vod.createdAt) }}</small>
                  </span>
                </button>
                <el-empty v-if="!recentUpdated.length" description="今日暂无内容更新" :image-size="80" />
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </el-col>

      <el-col :xs="24" :lg="10">
        <div class="card panel">
          <div class="panel-head">
            <div>
              <div class="sec-title">待处理</div>
              <div class="muted">优先处理会影响前台体验的数据缺口</div>
            </div>
          </div>
          <div class="issue-grid">
            <button v-for="item in issues" :key="item.key" class="issue-item" @click="goIssue(item)">
              <span>{{ item.label }}</span>
              <strong>{{ num(item.value) }}</strong>
              <small>{{ item.hint }}</small>
            </button>
          </div>
          <div class="source-mini">
            <div class="source-pill">启用源 <b>{{ num(stat.sourceSummary?.enabled) }}</b></div>
            <div class="source-pill">异常源 <b>{{ num(stat.sourceSummary?.fail) }}</b></div>
            <div class="source-pill">仅清洗源 <b>{{ num(stat.sourceSummary?.cleanOnly) }}</b></div>
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="card panel">
      <div class="panel-head">
        <div>
          <div class="sec-title">分类分布</div>
          <div class="muted">总量、在线、可播放与今日变化</div>
        </div>
      </div>
      <el-table :data="categories" stripe table-layout="fixed" style="width:100%">
        <el-table-column prop="name" label="分类" min-width="120" show-overflow-tooltip />
        <el-table-column prop="total" label="总量" width="90" sortable />
        <el-table-column prop="online" label="在线" width="90" sortable />
        <el-table-column prop="playable" label="可播放" width="90" sortable />
        <el-table-column prop="todayAdded" label="今日新增" width="100" sortable />
        <el-table-column prop="todayUpdated" label="今日更新" width="100" sortable />
        <el-table-column label="可播放率" min-width="180" sortable :sort-method="sortByPlayableRate">
          <template #default="{ row }">
            <div class="rate-cell">
              <el-progress :percentage="Math.min(100, Number(row.playableRate) || 0)" :stroke-width="8" :show-text="false" />
              <span>{{ percent(row.playableRate) }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="card panel">
      <div class="panel-head">
        <div>
          <div class="sec-title">采集源贡献</div>
          <div class="muted">看每个源贡献的影片、线路和今日变化</div>
        </div>
      </div>
      <el-table :data="sourcesOverview" stripe table-layout="fixed" style="width:100%">
        <el-table-column prop="name" label="采集源" min-width="150" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="sourceStatusType(row)">{{ sourceStatusText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="vods" label="影片" width="90" sortable />
        <el-table-column prop="plays" label="线路" width="90" sortable />
        <el-table-column prop="todayAdded" label="今日新增" width="100" sortable />
        <el-table-column prop="todayUpdated" label="今日更新" width="100" sortable />
        <el-table-column label="策略" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.cleanOnly" size="small" type="success" effect="plain">仅清洗</el-tag>
            <span v-else class="muted">普通</span>
          </template>
        </el-table-column>
        <el-table-column label="最近采集" width="170">
          <template #default="{ row }">{{ fmt(row.lastSyncAt) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'

const router = useRouter()
const loading = ref(false)
const stat = ref({})
const activityTab = ref('added')

const metrics = computed(() => [
  { key: 'vods', label: '影片总数', value: stat.value.vods, note: '去重后片库规模' },
  { key: 'online', label: '在线影片', value: stat.value.online, note: '前台可展示基础量' },
  { key: 'playable', label: '可播放影片', value: stat.value.playable, note: '含仅清洗源过滤' },
  { key: 'plays', label: '播放线路', value: stat.value.plays, note: '全部入库线路' },
  { key: 'todayAdded', label: '今日新增', value: stat.value.todayAdded, note: '今日新入库影片' },
  { key: 'todayUpdated', label: '今日更新', value: stat.value.todayUpdated, note: '今日剧集/内容更新' },
  { key: 'weekAdded', label: '近7天新增', value: stat.value.weekAdded, note: '近7日入库趋势' },
  { key: 'weekUpdated', label: '近7天更新', value: stat.value.weekUpdated, note: '近7日更新趋势' },
])

const issues = computed(() => {
  const i = stat.value.issues || {}
  return [
    { key: 'emptyPlays', label: '无线路影片', value: i.emptyPlays, hint: '需要补采或删除', route: { path: '/vods', query: { cleanup: 'empty_plays' } } },
    { key: 'allDead', label: '全死链影片', value: i.allDead, hint: '建议探活后清理', route: { path: '/vods', query: { cleanup: 'all_dead' } } },
    { key: 'noCover', label: '无封面', value: i.noCover, hint: '影响卡片展示', route: { path: '/vods', query: { cleanup: 'no_cover' } } },
    { key: 'noOfficialPic', label: '无官方封面', value: i.noOfficialPic, hint: '可跑元数据', route: { path: '/meta' } },
    { key: 'metaPending', label: '元数据待处理', value: i.metaPending, hint: '未匹配/失败/排队', route: { path: '/meta' } },
    { key: 'hlsFailed', label: '清洗失败', value: i.hlsFailed, hint: '需要复核策略', route: { path: '/hls-clean' } },
  ]
})

const categories = computed(() => stat.value.categories || [])
const recentAdded = computed(() => stat.value.recentAdded || [])
const recentUpdated = computed(() => stat.value.recentUpdated || [])
const sourcesOverview = computed(() => stat.value.sourcesOverview || [])

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('zh-CN') : '0'
}

function percent(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toFixed(n % 1 === 0 ? 0 : 1)}%` : '0%'
}

function fmt(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function sortByPlayableRate(a, b) {
  return Number(a.playableRate) - Number(b.playableRate)
}

function sourceStatusType(row) {
  if (!row.enabled) return 'info'
  if (row.status === 'ok') return 'success'
  if (row.status === 'fail') return 'danger'
  return 'warning'
}

function sourceStatusText(row) {
  if (!row.enabled) return '停用'
  if (row.status === 'ok') return '正常'
  if (row.status === 'fail') return '失败'
  return '未知'
}

function openVod(vod) {
  router.push({ path: '/vods', query: { kw: vod?.name || '' } })
}

function goIssue(item) {
  router.push(item.route)
}

async function load() {
  loading.value = true
  try {
    stat.value = await api.stats()
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 16px; }
.metric-row { row-gap: 16px; }
.metric-card { min-height: 112px; display: flex; flex-direction: column; justify-content: center; }
.metric-label { font-size: 13px; color: #6b7280; }
.metric-value { margin-top: 6px; font-size: 28px; line-height: 1.15; font-weight: 700; color: #1f2937; }
.metric-note { margin-top: 8px; font-size: 12px; color: #9aa4b2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel { overflow: hidden; }
.panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.sec-title { font-size: 16px; font-weight: 700; color: #1f2937; }
.muted { color: #9aa4b2; font-size: 12px; }
.vod-list { display: flex; flex-direction: column; gap: 8px; min-height: 336px; }
.vod-row { width: 100%; border: 1px solid #edf0f5; background: #fff; border-radius: 8px; padding: 10px 12px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; text-align: left; cursor: pointer; transition: border-color .16s, background .16s; }
.vod-row:hover { border-color: #c7ddff; background: #f8fbff; }
.vod-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.vod-main strong { font-size: 14px; color: #1f2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vod-main span { font-size: 12px; color: #8b95a5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vod-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; color: #9aa4b2; }
.vod-side em { max-width: 120px; font-style: normal; font-size: 12px; color: #409eff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vod-side small { font-size: 11px; }
.issue-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.issue-item { border: 1px solid #edf0f5; background: #fff; border-radius: 8px; padding: 12px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 6px; min-height: 94px; }
.issue-item:hover { border-color: #ffd6a0; background: #fffaf2; }
.issue-item span { font-size: 13px; color: #596273; }
.issue-item strong { font-size: 24px; color: #1f2937; line-height: 1; }
.issue-item small { font-size: 12px; color: #9aa4b2; }
.source-mini { margin-top: 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.source-pill { border: 1px solid #edf0f5; border-radius: 8px; padding: 10px; color: #6b7280; font-size: 12px; background: #fafbfc; }
.source-pill b { margin-left: 4px; color: #1f2937; }
.rate-cell { display: grid; grid-template-columns: minmax(90px, 1fr) 48px; align-items: center; gap: 10px; }
.rate-cell span { color: #596273; font-size: 12px; text-align: right; }
@media (max-width: 760px) {
  .metric-value { font-size: 24px; }
  .vod-row { grid-template-columns: minmax(0, 1fr); }
  .vod-side { align-items: flex-start; }
  .issue-grid { grid-template-columns: 1fr; }
  .source-mini { grid-template-columns: 1fr; }
}
</style>
