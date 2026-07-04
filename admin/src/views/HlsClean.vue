<template>
  <div class="hls-wrap">
    <div class="card">
      <div class="toolbar">
        <div>
          <div class="sec-title">HLS 广告清洗</div>
          <div class="hint">采集期预清洗，播放时只返回 clean m3u8，TS 仍直连源站。</div>
        </div>
        <div class="actions">
          <el-button :icon="Refresh" @click="load" :loading="loading">刷新</el-button>
          <el-button type="primary" :icon="Check" @click="saveConfig" :loading="saving">保存配置</el-button>
        </div>
      </div>

      <el-form :model="cfg" label-width="132px" class="cfg-form">
        <el-form-item label="总开关">
          <el-switch v-model="cfg.enabled" active-text="开启清洗返回" inactive-text="关闭返回原始源" />
        </el-form-item>
        <el-form-item label="采集后自动清洗">
          <el-switch v-model="cfg.autoOnCollect" active-text="开启" inactive-text="关闭" />
        </el-form-item>
        <el-form-item label="播放缺失时排队">
          <el-switch v-model="cfg.autoQueueOnMiss" active-text="开启" inactive-text="关闭" />
          <span class="unit">缺少 clean 结果时仍先回退原始源</span>
        </el-form-item>
        <el-form-item label="默认策略">
          <el-select v-model="cfg.defaultStrategy" style="width:300px">
            <el-option v-for="s in strategies" :key="s.id" :label="s.label" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="最低置信度">
          <el-input-number v-model="cfg.minConfidence" :min="0" :max="100" />
        </el-form-item>
      </el-form>
    </div>

    <div class="card">
      <div class="toolbar">
        <div>
          <div class="sec-title">手动清洗</div>
          <div class="hint">可以按源、分类、精确影片、线路或单集发起清洗；未命中 clean 时播放自动回退原始源。</div>
        </div>
        <el-button type="success" :icon="VideoPlay" @click="startTask" :loading="starting">开始清洗</el-button>
      </div>
      <el-form :model="job" label-width="90px" class="manual-form">
        <el-form-item label="清洗范围">
          <el-radio-group v-model="job.rangeMode" @change="onRangeModeChange">
            <el-radio-button value="vod">精确影片</el-radio-button>
            <el-radio-button value="line">单线路</el-radio-button>
            <el-radio-button value="batch">批量范围</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <template v-if="job.rangeMode === 'vod'">
          <el-form-item label="精确影片">
            <el-select v-model="job.vodId" clearable filterable remote reserve-keyword
              placeholder="输入片名搜索并选择" :remote-method="searchVods" :loading="vodSearching"
              style="width:420px" @change="loadVodLines">
              <el-option v-for="v in vodOptions" :key="v.id" :label="vodLabel(v)" :value="v.id">
                <div class="vod-option">
                  <span>{{ v.name }}</span>
                  <em>{{ v.typeName || '未分类' }} · {{ v.year || '—' }} · {{ v._count?.plays || 0 }} 条线路</em>
                </div>
              </el-option>
            </el-select>
          </el-form-item>

          <div v-if="selectedVod" class="line-panel">
            <div class="line-panel-head">
              <div>
                <b>{{ selectedVod.name }}</b>
                <span>{{ selectedVod.typeName || '未分类' }} · {{ selectedVod.year || '—' }} · 已选 {{ selectedPlayIds.length }} 条线路</span>
              </div>
              <div>
                <el-button size="small" @click="selectAllLines">全选线路</el-button>
                <el-button size="small" @click="clearSelectedLines">清空</el-button>
              </div>
            </div>
            <el-table ref="lineTableRef" :data="vodLines" stripe class="line-table"
              @selection-change="onLineSelectionChange">
              <el-table-column type="selection" width="46" />
              <el-table-column prop="id" label="线路ID" width="82" />
              <el-table-column prop="sourceName" label="来源" min-width="140" />
              <el-table-column prop="flag" label="标识" width="110" show-overflow-tooltip />
              <el-table-column prop="epCount" label="集数" width="76" />
              <el-table-column label="状态" width="88">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.alive ? 'success' : 'info'">{{ row.alive ? '可用' : '失效' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="score" label="评分" width="72" />
            </el-table>
          </div>
        </template>

        <template v-else-if="job.rangeMode === 'line'">
          <el-form-item label="线路ID">
            <el-input v-model="job.playId" clearable placeholder="输入单条线路ID" style="width:260px" />
          </el-form-item>
        </template>

        <template v-else>
          <div class="job-form">
            <el-form-item label="采集源">
              <el-select v-model="job.sourceId" clearable filterable placeholder="全部源" style="width:260px">
                <el-option v-for="s in sources" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="分类">
              <el-select v-model="job.categoryName" clearable filterable placeholder="全部分类" style="width:220px">
                <el-option v-for="c in categories" :key="c.name" :label="c.name" :value="c.name" />
              </el-select>
            </el-form-item>
            <el-form-item label="任务上限">
              <el-input-number v-model="job.limit" :min="1" :max="2000" />
            </el-form-item>
          </div>
        </template>

        <div class="job-form">
          <el-form-item label="集数范围">
            <el-radio-group v-model="job.episodeMode">
              <el-radio-button value="first">首集</el-radio-button>
              <el-radio-button value="all">全部集数</el-radio-button>
              <el-radio-button value="one">指定集</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="job.episodeMode === 'one'" label="集数">
            <el-input v-model="job.epIndex" clearable placeholder="0=第一集" style="width:160px" />
          </el-form-item>
          <el-form-item label="策略">
            <el-select v-model="job.strategyId" style="width:300px">
              <el-option v-for="s in strategies" :key="s.id" :label="s.label" :value="s.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="只检测">
            <el-switch v-model="job.dryRun" active-text="不用于播放" inactive-text="生成 clean" />
          </el-form-item>
        </div>
      </el-form>
    </div>

    <div class="card">
      <div class="toolbar">
        <div>
          <div class="sec-title">源 / 分类策略</div>
          <div class="hint">优先级：单线路策略 > 源策略 > 分类策略 > 全局配置。</div>
        </div>
      </div>
      <el-tabs>
        <el-tab-pane label="按源">
          <el-table :data="sourceRows" stripe>
            <el-table-column prop="name" label="源" min-width="180" />
            <el-table-column label="模式" width="170">
              <template #default="{ row }"><PolicyMode v-model="row.mode" @change="savePolicy('source', row)" /></template>
            </el-table-column>
            <el-table-column label="策略" width="280">
              <template #default="{ row }">
                <el-select v-model="row.strategyId" clearable placeholder="继承全局" @change="savePolicy('source', row)">
                  <el-option v-for="s in strategies" :key="s.id" :label="s.label" :value="s.id" />
                </el-select>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="按分类">
          <el-table :data="categoryRows" stripe>
            <el-table-column prop="name" label="分类" min-width="180" />
            <el-table-column label="模式" width="170">
              <template #default="{ row }"><PolicyMode v-model="row.mode" @change="savePolicy('category', row)" /></template>
            </el-table-column>
            <el-table-column label="策略" width="280">
              <template #default="{ row }">
                <el-select v-model="row.strategyId" clearable placeholder="继承全局" @change="savePolicy('category', row)">
                  <el-option v-for="s in strategies" :key="s.id" :label="s.label" :value="s.id" />
                </el-select>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <div class="card">
      <div class="toolbar">
        <div>
          <div class="sec-title">最近清洗结果</div>
          <div class="hint">clean 可用于播放；dry_run / failed / no_ads 不会替换原始源。</div>
        </div>
        <div class="stat-line">
          <el-tag type="success">clean {{ stats.clean || 0 }}</el-tag>
          <el-tag>no_ads {{ stats.no_ads || 0 }}</el-tag>
          <el-tag type="warning">dry_run {{ stats.dry_run || 0 }}</el-tag>
          <el-tag type="danger">failed {{ stats.failed || 0 }}</el-tag>
        </div>
      </div>
      <el-table :data="recent" v-loading="loading" stripe>
        <el-table-column prop="id" label="#" width="70" />
        <el-table-column prop="playId" label="线路" width="80" />
        <el-table-column prop="epName" label="集数" min-width="120" show-overflow-tooltip />
        <el-table-column prop="strategyId" label="策略" width="190" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><el-tag size="small" :type="statusType(row.status)">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="confidence" label="置信度" width="90" />
        <el-table-column label="广告段" min-width="170">
          <template #default="{ row }">
            <span v-if="row.adRanges?.length">{{ row.adRanges.map(r => `${r.start}-${r.end}s`).join(' / ') }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ fmt(row.checkedAt) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, ref, resolveComponent } from 'vue'
import { Check, Refresh, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'

const PolicyMode = defineComponent({
  props: { modelValue: { type: String, default: 'inherit' } },
  emits: ['update:modelValue', 'change'],
  setup(props, { emit }) {
    const ElSelect = resolveComponent('el-select')
    const ElOption = resolveComponent('el-option')
    return () => h(ElSelect, {
      modelValue: props.modelValue,
      'onUpdate:modelValue': (v) => emit('update:modelValue', v),
      onChange: () => emit('change'),
    }, () => [
      h(ElOption, { label: '继承', value: 'inherit' }),
      h(ElOption, { label: '开启', value: 'enabled' }),
      h(ElOption, { label: '关闭', value: 'disabled' }),
      h(ElOption, { label: '只检测', value: 'dry_run' }),
    ])
  },
})

const loading = ref(false)
const saving = ref(false)
const starting = ref(false)
const cfg = ref({ enabled: false, autoOnCollect: false, autoQueueOnMiss: false, minConfidence: 80, defaultStrategy: 'discontinuity_profile_v1' })
const strategies = ref([])
const sources = ref([])
const categories = ref([])
const policies = ref([])
const stats = ref({})
const recent = ref([])
const vodOptions = ref([])
const vodSearching = ref(false)
const lineTableRef = ref(null)
const selectedVod = ref(null)
const vodLines = ref([])
const selectedPlayIds = ref([])
const job = ref({
  rangeMode: 'vod',
  sourceId: null,
  categoryName: '',
  vodId: null,
  playId: '',
  epIndex: '',
  episodeMode: 'first',
  limit: 100,
  strategyId: 'discontinuity_profile_v1',
  dryRun: false,
})

const policyMap = computed(() => new Map(policies.value.map(p => [p.targetKey, p])))
const sourceRows = computed(() => sources.value.map(s => {
  const p = policyMap.value.get(`source:${s.id}`)
  return { ...s, mode: p?.mode || 'inherit', strategyId: p?.strategyId || '', policyId: p?.id }
}))
const categoryRows = computed(() => categories.value.map(c => {
  const p = policyMap.value.get(`category:${c.name}`)
  return { ...c, mode: p?.mode || 'inherit', strategyId: p?.strategyId || '', policyId: p?.id }
}))

const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : '—'
const statusType = (s) => ({ clean: 'success', failed: 'danger', dry_run: 'warning', no_ads: 'info' }[s] || 'info')
const vodLabel = (v) => `${v.name} #${v.id}${v.year ? ' · ' + v.year : ''}`

async function load() {
  loading.value = true
  try {
    const o = await api.hlsCleanOverview()
    cfg.value = { ...cfg.value, ...o.config }
    strategies.value = o.strategies || []
    sources.value = o.sources || []
    categories.value = o.categories || []
    policies.value = o.policies || []
    stats.value = o.stats || {}
    recent.value = o.recent || []
    if (!job.value.strategyId && strategies.value[0]) job.value.strategyId = strategies.value[0].id
  } catch (e) { ElMessage.error(e.message || '加载失败') }
  finally { loading.value = false }
}

async function saveConfig() {
  saving.value = true
  try {
    cfg.value = await api.updateHlsCleanConfig(cfg.value)
    ElMessage.success('清洗配置已保存')
  } catch (e) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

async function savePolicy(scope, row) {
  try {
    const targetId = scope === 'source' ? String(row.id) : row.name
    await api.updateHlsCleanPolicy({ scope, targetId, targetName: row.name, mode: row.mode, strategyId: row.strategyId || '' })
    ElMessage.success('策略已保存')
    load()
  } catch (e) { ElMessage.error(e.message || '保存失败') }
}

async function searchVods(keyword) {
  const kw = String(keyword || '').trim()
  if (!kw) { vodOptions.value = []; return }
  vodSearching.value = true
  try {
    const r = await api.adminVods({ page: 1, size: 20, kw })
    vodOptions.value = r.list || []
  } catch (e) {
    ElMessage.error(e.message || '影片搜索失败')
  } finally {
    vodSearching.value = false
  }
}

function resetVodLines() {
  selectedVod.value = null
  vodLines.value = []
  selectedPlayIds.value = []
  lineTableRef.value?.clearSelection?.()
}

function onRangeModeChange() {
  job.value.playId = ''
  job.value.sourceId = null
  job.value.categoryName = ''
  if (job.value.rangeMode !== 'vod') {
    job.value.vodId = null
    resetVodLines()
  }
}

function flattenVodLines(vod) {
  const out = []
  for (const line of vod?.lines || []) {
    const channels = Array.isArray(line.channels) && line.channels.length ? line.channels : [line]
    for (const c of channels) {
      out.push({
        id: c.id,
        sourceId: c.sourceId,
        sourceName: c.sourceName || line.sourceName || `源#${c.sourceId || '-'}`,
        flag: c.flag || line.flag || '',
        epCount: c.epCount || c.episodes?.length || 0,
        alive: c.alive !== false,
        score: c.score || 0,
      })
    }
  }
  return out
}

async function loadVodLines(vodId) {
  resetVodLines()
  if (!vodId) return
  loading.value = true
  try {
    const vod = await api.vod(vodId)
    selectedVod.value = vod
    vodLines.value = flattenVodLines(vod)
  } catch (e) {
    ElMessage.error(e.message || '影片线路加载失败')
  } finally {
    loading.value = false
  }
}

function onLineSelectionChange(rows) {
  selectedPlayIds.value = rows.map(r => r.id)
}

function selectAllLines() {
  for (const row of vodLines.value) lineTableRef.value?.toggleRowSelection?.(row, true)
}

function clearSelectedLines() {
  lineTableRef.value?.clearSelection?.()
  selectedPlayIds.value = []
}

async function startTask() {
  starting.value = true
  try {
    const common = {
      rangeMode: job.value.rangeMode,
      strategyId: job.value.strategyId,
      dryRun: job.value.dryRun,
    }
    let payload = {}
    if (job.value.rangeMode === 'vod') {
      if (!job.value.vodId) {
        ElMessage.warning('请先选择精确影片')
        return
      }
      if (!selectedPlayIds.value.length) {
        ElMessage.warning('请勾选要清洗的线路')
        return
      }
      payload = { ...common, vodId: job.value.vodId, playIds: selectedPlayIds.value }
    } else if (job.value.rangeMode === 'line') {
      const playId = String(job.value.playId || '').trim()
      if (!/^\d+$/.test(playId)) {
        ElMessage.warning('请输入线路ID')
        return
      }
      payload = { ...common, playId }
    } else {
      if (!job.value.sourceId && !job.value.categoryName) {
        ElMessage.warning('批量清洗请至少选择采集源或分类')
        return
      }
      payload = {
        ...common,
        sourceId: job.value.sourceId || undefined,
        categoryName: job.value.categoryName || undefined,
        limit: job.value.limit,
      }
    }
    if (job.value.episodeMode === 'one') {
      const rawEpIndex = String(job.value.epIndex || '').trim()
      if (!/^\d+$/.test(rawEpIndex)) {
        ElMessage.warning('指定集数必须是 0 或正整数')
        return
      }
      payload.epIndex = Number(rawEpIndex)
    } else {
      payload.episodeMode = job.value.episodeMode
    }
    const r = await api.createHlsCleanTask(payload)
    ElMessage.success('已提交清洗任务 #' + r.taskId)
  } catch (e) { ElMessage.error(e.message || '提交失败') }
  finally { starting.value = false }
}

onMounted(load)
</script>

<style scoped>
.hls-wrap { display: flex; flex-direction: column; gap: 18px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.sec-title { font-size: 16px; font-weight: 700; color: var(--text-1); }
.hint { color: var(--text-3); font-size: 12px; margin-top: 6px; }
.cfg-form, .job-form, .manual-form { max-width: 1080px; }
.job-form { display: grid; grid-template-columns: repeat(2, minmax(280px, 1fr)); gap: 0 20px; }
.unit { margin-left: 10px; font-size: 12px; color: var(--text-3); }
.stat-line { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.muted { color: var(--text-3); }
.vod-option { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.vod-option em { color: var(--text-3); font-style: normal; font-size: 12px; white-space: nowrap; }
.line-panel { margin: -2px 0 18px 90px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.line-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 14px; background: #fafbfc; }
.line-panel-head b { display: block; color: var(--text-1); font-size: 14px; margin-bottom: 4px; }
.line-panel-head span { color: var(--text-3); font-size: 12px; }
.line-table { width: 100%; }
@media (max-width: 980px) {
  .toolbar { align-items: flex-start; flex-direction: column; }
  .job-form { display: block; }
  .line-panel { margin-left: 0; }
  .line-panel-head { align-items: flex-start; flex-direction: column; }
}
</style>
