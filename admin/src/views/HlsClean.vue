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
        <el-form-item label="自动更新后清洗">
          <el-switch v-model="cfg.autoOnCollect" active-text="开启" inactive-text="关闭" />
          <span class="unit">仅定时自动更新采集触发，手动采集请在采集弹窗勾选</span>
        </el-form-item>
        <el-form-item label="播放缺失时排队">
          <el-switch v-model="cfg.autoQueueOnMiss" active-text="开启" inactive-text="关闭" />
          <span class="unit">缺少 clean 结果时仍先回退原始源</span>
        </el-form-item>
        <el-form-item label="默认策略链">
          <el-select v-model="cfg.defaultStrategies" multiple collapse-tags collapse-tags-tooltip style="width:360px">
            <el-option v-for="s in strategies" :key="s.id" :label="s.label" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="最低置信度">
          <div class="confidence-field">
            <el-input-number v-model="cfg.minConfidence" :min="0" :max="100" />
            <el-tag size="small" :type="confidenceAdvice.type">{{ confidenceAdvice.label }}</el-tag>
          </div>
          <div class="confidence-note">
            <b>作用：</b>清洗策略会给疑似广告段打 0-100 分，只有达到这个分数的广告段才会被删除并生成可用于播放的 clean 结果。低于门槛会保留原片，不会替换播放源。
            <br />
            <b>建议：</b>默认 80。误删正片就调高到 90；广告漏清就调低到 70-75；低于 70 风险较高，建议先用“只检测不用于播放”观察结果。
          </div>
        </el-form-item>
        <el-form-item label="清洗 worker">
          <el-input-number v-model="cfg.workerConcurrency" :min="1" :max="12" />
          <span class="unit">单个清洗任务内并发处理集数</span>
        </el-form-item>
        <el-form-item label="同源并发">
          <el-input-number v-model="cfg.sourceConcurrency" :min="1" :max="4" />
          <span class="unit">同一采集源同时探测上限</span>
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
          <el-form-item label="策略链">
            <el-select v-model="job.strategyIds" multiple collapse-tags collapse-tags-tooltip style="width:360px">
              <el-option v-for="s in strategies" :key="s.id" :label="s.label" :value="s.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="输出模式">
            <el-radio-group v-model="job.runMode">
              <el-radio-button value="clean">生成 clean</el-radio-button>
              <el-radio-button value="dry_run">只检测不用于播放</el-radio-button>
            </el-radio-group>
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
            <el-table-column label="策略链" width="360">
              <template #default="{ row }">
                <el-select v-model="row.strategyIds" multiple clearable collapse-tags collapse-tags-tooltip placeholder="继承全局" @change="savePolicy('source', row)">
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
            <el-table-column label="策略链" width="360">
              <template #default="{ row }">
                <el-select v-model="row.strategyIds" multiple clearable collapse-tags collapse-tags-tooltip placeholder="继承全局" @change="savePolicy('category', row)">
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
          <div class="sec-title">清洗结果（按影片+源聚合）</div>
          <div class="hint">clean 可用于播放；dry_run / failed / no_ads 不会替换原始源。点展开看逐集明细。</div>
        </div>
        <div class="stat-line">
          <el-tag type="success">clean {{ stats.clean || 0 }}</el-tag>
          <el-tag>no_ads {{ stats.no_ads || 0 }}</el-tag>
          <el-tag type="warning">dry_run {{ stats.dry_run || 0 }}</el-tag>
          <el-tag type="danger">failed {{ stats.failed || 0 }}</el-tag>
        </div>
      </div>
      <div class="result-filters">
        <el-input v-model="resultFilter.kw" clearable placeholder="搜影片名" style="width:200px" @keyup.enter="loadResults(1)" @clear="loadResults(1)" />
        <el-select v-model="resultFilter.sourceId" clearable placeholder="全部源" style="width:150px" @change="loadResults(1)">
          <el-option v-for="s in sources" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-select v-model="resultFilter.status" clearable placeholder="全部状态" style="width:140px" @change="loadResults(1)">
          <el-option label="clean" value="clean" />
          <el-option label="no_ads" value="no_ads" />
          <el-option label="dry_run" value="dry_run" />
          <el-option label="failed" value="failed" />
          <el-option label="uncertain" value="uncertain" />
        </el-select>
        <el-button :icon="Refresh" @click="loadResults(1)">刷新</el-button>
        <span class="muted">共 {{ resultTotal }} 条线路</span>
      </div>
      <el-table :data="grouped" v-loading="resultLoading" stripe row-key="playId" @expand-change="onExpand">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="ep-detail" v-loading="row._loading">
              <el-table :data="row._episodes || []" size="small" stripe>
                <el-table-column prop="epName" label="集数" width="120" show-overflow-tooltip />
                <el-table-column label="策略" min-width="220" show-overflow-tooltip>
                  <template #default="{ row: e }">{{ strategyChainLabel(e.strategyId) }}</template>
                </el-table-column>
                <el-table-column label="状态" width="90">
                  <template #default="{ row: e }"><el-tag size="small" :type="statusType(e.status)">{{ e.status }}</el-tag></template>
                </el-table-column>
                <el-table-column prop="confidence" label="置信度" width="80" />
                <el-table-column label="广告段" min-width="160">
                  <template #default="{ row: e }">
                    <span v-if="e.adRanges?.length">{{ e.adRanges.map(r => `${r.start}-${r.end}s`).join(' / ') }}</span>
                    <span v-else class="muted">—</span>
                  </template>
                </el-table-column>
                <el-table-column label="时间" width="160">
                  <template #default="{ row: e }">{{ fmt(e.checkedAt) }}</template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="影片" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.vodName }}</span>
            <el-tag v-if="row.vodStatus && row.vodStatus !== 'online'" size="small" type="info" style="margin-left:6px">{{ row.vodStatus }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sourceName" label="源" width="120" show-overflow-tooltip />
        <el-table-column prop="playId" label="线路" width="90" />
        <el-table-column prop="episodes" label="集数" width="80" />
        <el-table-column label="清洗分布" min-width="200">
          <template #default="{ row }">
            <el-tag v-if="row.statusCounts.clean" size="small" type="success">clean {{ row.statusCounts.clean }}</el-tag>
            <el-tag v-if="row.statusCounts.no_ads" size="small" style="margin-left:4px">no_ads {{ row.statusCounts.no_ads }}</el-tag>
            <el-tag v-if="row.statusCounts.dry_run" size="small" type="warning" style="margin-left:4px">dry_run {{ row.statusCounts.dry_run }}</el-tag>
            <el-tag v-if="row.statusCounts.failed" size="small" type="danger" style="margin-left:4px">failed {{ row.statusCounts.failed }}</el-tag>
            <el-tag v-if="row.statusCounts.uncertain" size="small" type="info" style="margin-left:4px">uncertain {{ row.statusCounts.uncertain }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近清洗" width="160">
          <template #default="{ row }">{{ fmt(row.lastCheckedAt) }}</template>
        </el-table-column>
      </el-table>
      <div class="result-pager">
        <el-pagination
          layout="prev, pager, next"
          :total="resultTotal"
          :page-size="resultFilter.size"
          :current-page="resultFilter.page"
          @current-change="loadResults"
        />
      </div>
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
const DEFAULT_STRATEGIES = ['discontinuity_profile_v1']
const cfg = ref({ enabled: false, autoOnCollect: false, autoQueueOnMiss: false, minConfidence: 80, workerConcurrency: 3, sourceConcurrency: 1, defaultStrategies: [...DEFAULT_STRATEGIES] })
const strategies = ref([])
const sources = ref([])
const categories = ref([])
const policies = ref([])
const stats = ref({})
const recent = ref([])
const grouped = ref([])
const resultLoading = ref(false)
const resultTotal = ref(0)
const resultFilter = ref({ kw: '', sourceId: '', status: '', page: 1, size: 30 })
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
  strategyIds: [...DEFAULT_STRATEGIES],
  runMode: 'clean',
})

const policyMap = computed(() => new Map(policies.value.map(p => [p.targetKey, p])))
const sourceRows = computed(() => sources.value.map(s => {
  const p = policyMap.value.get(`source:${s.id}`)
  return { ...s, mode: p?.mode || 'inherit', strategyIds: normalizeStrategyIds(p?.strategyIds || p?.strategyId, []), policyId: p?.id }
}))
const categoryRows = computed(() => categories.value.map(c => {
  const p = policyMap.value.get(`category:${c.name}`)
  return { ...c, mode: p?.mode || 'inherit', strategyIds: normalizeStrategyIds(p?.strategyIds || p?.strategyId, []), policyId: p?.id }
}))

const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : '—'
const statusType = (s) => ({ clean: 'success', failed: 'danger', dry_run: 'warning', no_ads: 'info' }[s] || 'info')
const vodLabel = (v) => `${v.name} #${v.id}${v.year ? ' · ' + v.year : ''}`
const confidenceAdvice = computed(() => {
  const n = Number(cfg.value.minConfidence) || 0
  if (n >= 90) return { label: '保守：少误删，可能漏广告', type: 'info' }
  if (n >= 80) return { label: '推荐：稳妥默认值', type: 'success' }
  if (n >= 70) return { label: '偏激进：更容易清掉广告', type: 'warning' }
  return { label: '高风险：建议只检测验证', type: 'danger' }
})

function normalizeStrategyIds(value, fallback = DEFAULT_STRATEGIES) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  const valid = new Set(strategies.value.map(s => s.id))
  const ids = raw.map(x => String(x || '').trim()).filter(x => x && (!valid.size || valid.has(x)))
  return [...new Set(ids)].length ? [...new Set(ids)] : [...fallback]
}

function normalizeConfig(config) {
  return {
    ...config,
    defaultStrategies: normalizeStrategyIds(config?.defaultStrategies || config?.defaultStrategy),
  }
}

function strategyChainLabel(value) {
  const map = new Map(strategies.value.map(s => [s.id, s.label]))
  const ids = normalizeStrategyIds(value, [])
  return ids.length ? ids.map(id => map.get(id) || id).join(' → ') : '继承全局'
}

async function load() {
  loading.value = true
  try {
    const o = await api.hlsCleanOverview()
    strategies.value = o.strategies || []
    cfg.value = normalizeConfig({ ...cfg.value, ...o.config })
    sources.value = o.sources || []
    categories.value = o.categories || []
    policies.value = o.policies || []
    stats.value = o.stats || {}
    recent.value = o.recent || []
    if (!job.value.strategyIds?.length && strategies.value[0]) job.value.strategyIds = [strategies.value[0].id]
  } catch (e) { ElMessage.error(e.message || '加载失败') }
  finally { loading.value = false }
}

async function loadResults(page = 1) {
  resultFilter.value.page = page
  resultLoading.value = true
  try {
    const r = await api.hlsCleanResults({
      mode: 'grouped',
      kw: resultFilter.value.kw || undefined,
      sourceId: resultFilter.value.sourceId || undefined,
      status: resultFilter.value.status || undefined,
      page,
      size: resultFilter.value.size,
    })
    grouped.value = (r.list || []).map(x => ({ ...x, _episodes: null, _loading: false }))
    resultTotal.value = r.total || 0
  } catch (e) { ElMessage.error(e.message || '加载结果失败') }
  finally { resultLoading.value = false }
}

async function onExpand(row, expanded) {
  const open = Array.isArray(expanded) ? expanded.includes(row) : expanded
  if (!open || row._episodes) return
  row._loading = true
  try {
    const r = await api.hlsCleanResults({ mode: 'flat', playId: row.playId, size: 100 })
    row._episodes = r.list || []
  } catch (e) { ElMessage.error(e.message || '加载明细失败') }
  finally { row._loading = false }
}

async function saveConfig() {
  saving.value = true
  try {
    cfg.value = normalizeConfig(await api.updateHlsCleanConfig(cfg.value))
    ElMessage.success('清洗配置已保存')
  } catch (e) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

async function savePolicy(scope, row) {
  try {
    const targetId = scope === 'source' ? String(row.id) : row.name
    await api.updateHlsCleanPolicy({ scope, targetId, targetName: row.name, mode: row.mode, strategyIds: row.strategyIds || [] })
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
      strategyIds: job.value.strategyIds,
      dryRun: job.value.runMode === 'dry_run',
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

onMounted(() => { load(); loadResults(1) })
</script>

<style scoped>
.hls-wrap { display: flex; flex-direction: column; gap: 18px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.sec-title { font-size: 16px; font-weight: 700; color: var(--text-1); }
.hint { color: var(--text-3); font-size: 12px; margin-top: 6px; }
.cfg-form, .job-form, .manual-form { max-width: 1080px; }
.job-form { display: grid; grid-template-columns: repeat(2, minmax(280px, 1fr)); gap: 0 20px; }
.unit { margin-left: 10px; font-size: 12px; color: var(--text-3); }
.confidence-field { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.confidence-note { width: min(760px, 100%); margin-top: 8px; color: var(--text-3); font-size: 12px; line-height: 1.75; }
.confidence-note b { color: var(--text-1); }
.stat-line { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.muted { color: var(--text-3); }
.result-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.result-pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.ep-detail { padding: 8px 16px; }
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
