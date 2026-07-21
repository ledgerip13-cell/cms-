<template>
  <div class="meta-wrap">
    <!-- 统计 -->
    <div class="stat-row">
      <div class="stat-card" v-for="s in statCards" :key="s.k">
        <div class="stat-num" :style="{color:s.color}">{{ stat[s.k] ?? '—' }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color:#4f6ef7">{{ matchRate }}%</div>
        <div class="stat-label">匹配率</div>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="meta-tabs">
      <el-tab-pane label="概览" name="overview">
        <div class="overview-grid">
      <!-- 手动操作 -->
      <div class="card">
        <div class="sec-title" style="margin-bottom:16px">元数据匹配</div>
        <el-alert type="info" :closable="false" style="margin-bottom:16px"
          title="按已启用匹配源抓取评分/简介/高清封面并落库。抓一次存库，前端读库不实时请求；最终来源会在匹配记录中标注。" />
        <div class="ops">
          <el-button type="primary" :icon="MagicStick" @click="runUnprocessed">
            匹配未处理（{{ stat.none || 0 }} 部）
          </el-button>
          <el-button :icon="RefreshRight" @click="retryFailed">
            重试失败（{{ stat.failed || 0 }} 部）
          </el-button>
          <el-button type="warning" plain :icon="RefreshRight" @click="refreshAll">
            全量重刷
          </el-button>
        </div>
        <div class="manual-scope">
          <div class="scope-title">手动范围匹配</div>
          <div class="scope-row">
            <el-select v-model="q.provider" style="width:180px">
              <el-option v-for="item in providerModeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-select v-model="q.status" style="width:130px">
              <el-option label="待确认" value="pending" />
              <el-option label="待匹配" value="none" />
              <el-option label="失败/无候选" value="failed" />
              <el-option label="已匹配" value="matched" />
              <el-option label="全部" value="all" />
            </el-select>
            <el-select v-model="q.categoryName" clearable filterable placeholder="全部分类" style="width:150px">
              <el-option v-for="c in categories" :key="c.name" :label="c.name" :value="c.name" />
            </el-select>
            <el-select v-model="q.sourceId" clearable filterable placeholder="全部采集源" style="width:160px">
              <el-option v-for="s in sources" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
            <el-button type="success" plain @click="runFiltered">按范围提交</el-button>
          </div>
        </div>
        <p class="tip">任务在后台运行，进度见「采集任务」页。默认按启用源优先级执行；自动通过分/待确认分/限速按各源独立配置。</p>
      </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="匹配源配置" name="providers">
      <!-- 参数设置 -->
      <div class="card">
        <div class="toolbar">
          <div class="sec-title">匹配源配置</div>
          <el-button type="primary" :icon="Check" :loading="saving" @click="save">保存</el-button>
        </div>
        <div class="provider-list">
          <div v-for="provider in cfg.providersConfig.providers" :key="provider.key" class="provider-card">
            <div class="provider-head">
              <div>
                <b>{{ provider.name }}</b>
                <span>{{ provider.key === 'douban' ? '评分 / 简介 / 图片 / 别名' : '海报 / 剧照 / 国际化元数据' }}</span>
              </div>
              <el-switch v-model="provider.enabled" inline-prompt active-text="启用" inactive-text="停用" />
            </div>
            <el-form label-width="82px" class="provider-form">
              <el-form-item label="优先级">
                <el-input-number v-model="provider.priority" :min="1" :max="99" :step="1" controls-position="right" />
              </el-form-item>
              <el-form-item label="限速">
                <el-input-number v-model="provider.intervalMs" :min="500" :max="30000" :step="500" controls-position="right" />
                <span class="unit">毫秒/条</span>
              </el-form-item>
              <el-form-item v-if="provider.key !== 'tmdb'" label="任务上限">
                <el-input-number v-model="provider.batchLimit" :min="1" :max="500" :step="10" controls-position="right" />
                <span class="unit">部/任务</span>
              </el-form-item>
              <template v-if="provider.key === 'tmdb'">
                <el-form-item label="并发">
                  <el-input-number v-model="provider.matchConcurrency" :min="1" :max="10" :step="1" controls-position="right" />
                  <span class="unit">worker</span>
                </el-form-item>
                <el-form-item label="单工处理">
                  <el-input-number v-model="provider.concurrencyBatchSize" :min="1" :max="50" :step="1" controls-position="right" />
                  <span class="unit">部/轮</span>
                  <div class="field-help">单任务 {{ metaTaskLimit(provider) }} 部 = 并发 × 单工处理；超出自动拆任务。</div>
                </el-form-item>
              </template>
              <el-form-item label="通过分">
                <el-input-number v-model="provider.autoMatchScore" :min="0" :max="100" :step="1" controls-position="right" />
              </el-form-item>
              <el-form-item label="候选分">
                <el-input-number v-model="provider.pendingMatchScore" :min="0" :max="provider.autoMatchScore || 100" :step="1" controls-position="right" />
              </el-form-item>
              <template v-if="provider.key === 'tmdb'">
                <el-form-item label="访问密钥">
                  <el-input v-model.trim="provider.apiKey" placeholder="TMDB API Key" show-password clearable />
                </el-form-item>
                <el-form-item label="访问令牌">
                  <el-input v-model.trim="provider.accessToken" type="password" placeholder="TMDB API Read Access Token" show-password clearable maxlength="1200" />
                </el-form-item>
              </template>
            </el-form>
          </div>
        </div>
        <el-divider>通用策略</el-divider>
        <el-form :model="cfg" label-width="120px" class="global-meta-form">
          <el-form-item label="图片资产兜底">
            <el-switch v-model="cfg.saveImages" inline-prompt active-text="保存" inactive-text="不保存" />
            <span class="unit">保存元数据图片到本地，远程图失效时作为兜底</span>
          </el-form-item>
        </el-form>
        <el-collapse v-model="advancedActive" class="advanced-meta-collapse">
          <el-collapse-item title="自动化设置" name="auto">
            <el-form :model="cfg" label-width="120px" class="global-meta-form">
              <el-form-item label="自动匹配">
                <el-switch v-model="cfg.autoMatch" inline-prompt active-text="开启" inactive-text="关闭" />
                <span class="unit">所有启用源按优先级执行</span>
              </el-form-item>
              <template v-if="cfg.autoMatch">
                <el-form-item label="匹配频率">
                  <el-select v-model="cfg.cronExpr" style="width:220px">
                    <el-option label="每 6 小时" value="0 */6 * * *" />
                    <el-option label="每 12 小时" value="0 */12 * * *" />
                    <el-option label="每天凌晨 4 点" value="0 4 * * *" />
                    <el-option label="每天凌晨 2 点" value="0 2 * * *" />
                  </el-select>
                </el-form-item>
                <el-form-item label="一并重试失败">
                  <el-switch v-model="cfg.redoFailed" inline-prompt active-text="开启" inactive-text="关闭" />
                  <span class="unit">开启则定时任务也重刷之前失败的</span>
                </el-form-item>
              </template>
            </el-form>
          </el-collapse-item>
        </el-collapse>
      </div>
      </el-tab-pane>

      <el-tab-pane label="匹配记录" name="records">
    <div class="card">
      <div class="toolbar">
        <div class="sec-title">匹配记录</div>
        <div class="ops">
          <el-input v-model="q.kw" clearable placeholder="片名 / 命中标题" style="width:180px" @keyup.enter="loadRows" />
          <el-select v-model="q.status" style="width:130px" @change="applyRows">
            <el-option label="待确认" value="pending" />
            <el-option label="待匹配" value="none" />
            <el-option label="失败/无候选" value="failed" />
            <el-option label="已匹配" value="matched" />
            <el-option label="全部" value="all" />
          </el-select>
          <el-select v-model="q.sourceId" clearable filterable placeholder="全部源" style="width:160px" @change="applyRows">
            <el-option v-for="s in sources" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
          <el-select v-model="q.categoryName" clearable filterable placeholder="全部分类" style="width:150px" @change="applyRows">
            <el-option v-for="c in categories" :key="c.name" :label="c.name" :value="c.name" />
          </el-select>
          <el-button type="primary" @click="loadRows">查询</el-button>
          <el-button type="success" plain @click="runFiltered">按筛选提交匹配</el-button>
          <el-button v-if="selectedRows.length" type="danger" plain @click="clearSelected">清理所选（{{ selectedRows.length }}）</el-button>
        </div>
      </div>
      <el-table :data="rows" v-loading="rowLoading" stripe @selection-change="selectedRows = $event">
        <el-table-column type="selection" width="42" />
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="片名" min-width="180" />
        <el-table-column prop="typeName" label="分类" width="110" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><el-tag size="small" :type="metaType(row.metaMatched)">{{ metaLabel(row) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="命中" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.matchedTitle || '—' }} {{ row.matchedYear ? '(' + row.matchedYear + ')' : '' }}</template>
        </el-table-column>
        <el-table-column label="来源" width="90">
          <template #default="{ row }">{{ providerLabel(row.metaSource || reasonProvider(row) || 'douban') }}</template>
        </el-table-column>
        <el-table-column prop="metaScore" label="置信" width="80" />
        <el-table-column label="原因" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">{{ metaReasonText(row) }}</template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ fmt(row.metaAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.metaMatched==='pending'" size="small" @click="openCandidates(row)">候选</el-button>
            <el-button size="small" type="primary" plain @click="matchOne(row)">重匹配</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination class="pager" background layout="total, prev, pager, next"
        :total="rowTotal" :page-size="q.size" :current-page="q.page"
        @current-change="p=>{q.page=p;loadRows()}" />
    </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="candOpen" title="待确认候选" width="760">
      <div v-if="candRow" class="cand-title">{{ candRow.name }} · 当前置信 {{ candRow.metaScore || 0 }}</div>
      <el-table :data="candidates" stripe>
        <el-table-column label="候选" min-width="220">
          <template #default="{ row }">
            <b>{{ row.title }}</b><span v-if="row.year" class="muted">（{{ row.year }}）</span>
            <div class="muted">{{ providerLabel(row.source) }} · {{ row.subTitle || row.type || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="score" label="分数" width="80" />
        <el-table-column label="原因" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ reasonText(row.reasons) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="confirmCandidate(row)">确认</el-button>
            <el-button v-if="candidateUrl(row)" size="small" link type="primary" @click="openUrl(candidateUrl(row))">打开</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Check, MagicStick, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'

const DEFAULT_PROVIDERS_CONFIG = {
  providers: [
    { key: 'douban', name: '豆瓣', enabled: true, priority: 1, intervalMs: 2500, batchLimit: 50, autoMatchScore: 80, pendingMatchScore: 60 },
    { key: 'tmdb', name: 'TMDB', enabled: false, priority: 2, intervalMs: 1200, batchLimit: 50, matchConcurrency: 3, concurrencyBatchSize: 5, autoMatchScore: 80, pendingMatchScore: 60, apiKey: '', accessToken: '' },
  ],
}
const stat = ref({}); const cfg = ref({ intervalMs:2500, batchLimit:50, autoMatchScore:80, pendingMatchScore:60, autoMatch:false, cronExpr:'0 4 * * *', redoFailed:false, saveImages:false, providersConfig: JSON.parse(JSON.stringify(DEFAULT_PROVIDERS_CONFIG)) })
const saving = ref(false)
const activeTab = ref('overview')
const sources = ref([])
const categories = ref([])
const rows = ref([])
const rowTotal = ref(0)
const rowLoading = ref(false)
const selectedRows = ref([])
const advancedActive = ref([])
const q = ref({ page: 1, size: 20, provider: '', status: 'pending', sourceId: '', categoryName: '', kw: '' })
const candOpen = ref(false)
const candRow = ref(null)
const candidates = ref([])
const statCards = [
  { k:'total', label:'影片总数', color:'#1a1f2b' },
  { k:'matched', label:'已匹配', color:'#16a34a' },
  { k:'pending', label:'待确认', color:'#e6a23c' },
  { k:'failed', label:'失败/无候选', color:'#98a1b0' },
  { k:'none', label:'待匹配', color:'#4f6ef7' },
]
const matchRate = computed(() => stat.value.total ? Math.round((stat.value.matched / stat.value.total) * 100) : 0)
const primaryProvider = computed(() => cfg.value.providersConfig?.providers?.find(provider => provider.enabled) || providerByKey('douban'))
const providerModeOptions = [
  { label: '按优先级自动', value: '' },
  { label: '仅豆瓣', value: 'douban' },
  { label: '仅 TMDB', value: 'tmdb' },
]

function metaTaskLimit(provider = primaryProvider.value) {
  if (provider?.key === 'tmdb') {
    const concurrency = clampNumber(provider.matchConcurrency, 1, 1, 10)
    const perWorker = clampNumber(provider.concurrencyBatchSize, 1, 1, 50)
    return concurrency * perWorker
  }
  return clampNumber(provider?.batchLimit, cfg.value.batchLimit || 50, 1, 500)
}

function metaSourceSubmitLabel(payload) {
  return payload.provider ? providerLabel(payload.provider) : '按优先级自动'
}

function clampNumber(value, fallback, min, max) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function providerByKey(key) {
  return cfg.value.providersConfig?.providers?.find(provider => provider.key === key)
    || DEFAULT_PROVIDERS_CONFIG.providers.find(provider => provider.key === key)
    || DEFAULT_PROVIDERS_CONFIG.providers[0]
}

function normalizeProvidersConfig(value) {
  const rows = Array.isArray(value?.providers) ? value.providers : []
  const byKey = new Map(rows.map(row => [String(row?.key || ''), row]))
  return {
    providers: DEFAULT_PROVIDERS_CONFIG.providers.map(def => {
      const row = byKey.get(def.key) || {}
      return {
        ...def,
        enabled: typeof row.enabled === 'boolean' ? row.enabled : def.enabled,
        priority: clampNumber(row.priority, def.priority, 1, 99),
        intervalMs: clampNumber(row.intervalMs, def.intervalMs, 500, 30000),
        batchLimit: clampNumber(row.batchLimit, def.batchLimit, 1, 500),
        ...(def.key === 'tmdb' ? {
          matchConcurrency: clampNumber(row.matchConcurrency, def.matchConcurrency, 1, 10),
          concurrencyBatchSize: clampNumber(row.concurrencyBatchSize, def.concurrencyBatchSize, 1, 50),
        } : {}),
        autoMatchScore: clampNumber(row.autoMatchScore, def.autoMatchScore, 0, 100),
        pendingMatchScore: Math.min(
          clampNumber(row.autoMatchScore, def.autoMatchScore, 0, 100),
          clampNumber(row.pendingMatchScore, def.pendingMatchScore, 0, 100)
        ),
        ...(def.key === 'tmdb' ? {
          apiKey: String(row.apiKey || ''),
          accessToken: String(row.accessToken || ''),
        } : {}),
      }
    }).sort((a, b) => a.priority - b.priority),
  }
}

const fmt = (v) => v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '—'
const metaLabel = (rowOrStatus) => {
  const s = typeof rowOrStatus === 'string' ? rowOrStatus : rowOrStatus?.metaMatched
  if (s === 'failed' && typeof rowOrStatus === 'object') {
    const reasons = parseReason(rowOrStatus).reasons || []
    if (reasons.includes('no_suggest')) return '搜索无候选'
    if (reasons.includes('detail_failed')) return '详情获取失败'
    return Number(rowOrStatus?.metaScore || 0) > 0 ? '低置信' : '无收录'
  }
  return ({ none:'待匹配', matched:'已匹配', manual:'人工确认', pending:'待确认', failed:'失败/无候选', skip:'跳过' }[s] || s)
}
const metaType = (s) => ({ matched:'success', manual:'success', pending:'warning', failed:'info', none:'primary' }[s] || 'info')
const providerLabel = (source) => ({ douban: '豆瓣', tmdb: 'TMDB' }[source] || source || '—')
const reasonProvider = (row) => parseReason(row).provider || ''
const reasonMap = {
  manual: '人工确认',
  no_suggest: '无候选',
  detail_failed: '详情获取失败',
  title_exact: '标题完全一致',
  title_contains: '标题互相包含',
  title_similar: '标题相似',
  title_weak: '标题弱相关',
  year_match: '年份一致',
  year_near: '年份接近',
  year_mismatch: '年份不一致',
  season_match: '季数一致',
  season_mismatch: '季数不一致',
  special_match: '特别篇标记一致',
  special_missing: '候选缺少特别篇标记',
  type_match: '分类匹配',
  type_mismatch: '分类不一致',
  director_match: '导演匹配',
  director_mismatch: '导演不一致',
  actors_match: '多名演员匹配',
  actor_match: '演员匹配',
  actors_mismatch: '演员不一致',
}
const reasonText = (reasons) => {
  const list = Array.isArray(reasons) ? reasons : []
  return list.length ? list.map(r => reasonMap[r] || '其他匹配信号').join(' / ') : '—'
}
const metaReasonText = (row) => reasonText(parseReason(row).reasons)
function candidateUrl(c) {
  const source = c?.source || 'douban'
  if (source === 'douban') return `https://movie.douban.com/subject/${c.id}/`
  if (source === 'tmdb') {
    const [kind, id] = String(c.id || '').split(':')
    return id ? `https://www.themoviedb.org/${kind === 'tv' ? 'tv' : 'movie'}/${id}` : ''
  }
  return ''
}
function openUrl(url) {
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

async function load() {
  const [st, conf, ss, cs] = await Promise.all([api.metaStats(), api.metaConfig(), api.sources(), api.categories()])
  stat.value = st
  cfg.value = { ...cfg.value, ...conf }
  cfg.value.providersConfig = normalizeProvidersConfig(conf.providersConfig)
  sources.value = ss
  categories.value = cs
  await loadRows()
}
async function submitMetaBatch(payload, title) {
  try {
    const ok = await confirmMetaSubmit(payload, title)
    if (!ok) return
    const r = await api.metaBatch(payload)
    ElMessage.success(r.message || '任务已提交，去「采集任务」看进度')
  } catch (e) { ElMessage.error(e.message || '提交失败') }
}

async function runUnprocessed() {
  await submitMetaBatch(metaTaskPayload({ redo: false, split: true, status: 'none' }), '匹配未处理影片')
}

async function retryFailed() {
  await submitMetaBatch(metaTaskPayload({ redo: true, split: true, status: 'failed' }), '重试失败影片元数据')
}

async function refreshAll() {
  await submitMetaBatch(metaTaskPayload({ redo: true, split: true, status: 'all' }), '全量重刷影片元数据')
}
function applyRows() {
  q.value.page = 1
  loadRows()
}
async function loadRows() {
  rowLoading.value = true
  try {
    const r = await api.metaVods(q.value)
    rows.value = r.list || []
    rowTotal.value = r.total || 0
  } catch (e) { ElMessage.error(e.message || '加载失败') } finally { rowLoading.value = false }
}
async function runFiltered() {
  const payload = {
    ...metaTaskPayload({}, q.value.provider),
    status: q.value.status,
    sourceId: q.value.sourceId || undefined,
    categoryName: q.value.categoryName || undefined,
    kw: q.value.kw || undefined,
    redo: q.value.status === 'all',
    split: true,
  }
  const ok = await confirmMetaSubmit(payload, '按当前筛选提交元数据匹配')
  if (!ok) return
  try {
    const r = await api.metaBatch(payload)
    ElMessage.success(r.message || '任务已提交')
  } catch (e) { ElMessage.error(e.message || '提交失败') }
}
async function metaScopeTotal(payload) {
  const r = await api.metaVods({
    page: 1,
    size: 10,
    status: payload.status || (payload.redo ? 'all' : 'none'),
    sourceId: payload.sourceId || undefined,
    categoryName: payload.categoryName || undefined,
    kw: payload.kw || undefined,
  })
  return Number(r.total || 0)
}
async function confirmMetaSubmit(payload, title) {
  const total = await metaScopeTotal(payload)
  if (!total) {
    ElMessage.warning('当前条件没有可提交的影片')
    return false
  }
  const limit = Math.max(1, Number(payload.limit) || 50)
  const tasks = Math.ceil(total / limit)
  const provider = metaSourceSubmitLabel(payload)
  const concurrency = payload.matchConcurrency && payload.concurrencyBatchSize
    ? `\nTMDB 容量：${payload.matchConcurrency} worker × 单工 ${payload.concurrencyBatchSize} 部 = ${payload.matchConcurrency * payload.concurrencyBatchSize} 部/任务`
    : ''
  const message = `当前条件共 ${total} 部。\n单任务 ${limit} 部，将拆成 ${tasks} 个任务排队。\n匹配源：${provider}${concurrency}\n\n确认提交？`
  return ElMessageBox.confirm(message, title, {
    type: 'warning',
    confirmButtonText: `提交 ${tasks} 个任务`,
    cancelButtonText: '取消',
  }).then(() => true).catch(() => false)
}
async function clearSelected() {
  if (!selectedRows.value.length) return
  const ok = await ElMessageBox.confirm(`确认清理所选 ${selectedRows.value.length} 条匹配记录？清理后会回到待匹配，不删除影片和图片资产。`, '批量清理匹配记录', { type: 'warning' })
    .then(() => true).catch(() => false)
  if (!ok) return
  try {
    const r = await api.metaClear(selectedRows.value.map(row => row.id))
    ElMessage.success(`已清理 ${r.count || 0} 条`)
    selectedRows.value = []
    await Promise.all([loadRows(), load()])
  } catch (e) { ElMessage.error(e.message || '清理失败') }
}
function metaTaskPayload(extra = {}, providerKey = '') {
  const provider = providerKey ? providerByKey(providerKey) : primaryProvider.value
  const autoMatchScore = clampNumber(provider.autoMatchScore, cfg.value.autoMatchScore, 0, 100)
  const pendingMatchScore = Math.min(autoMatchScore, clampNumber(provider.pendingMatchScore, cfg.value.pendingMatchScore, 0, 100))
  return {
    limit: metaTaskLimit(provider),
    intervalMs: provider.intervalMs || cfg.value.intervalMs,
    ...(providerKey ? { provider: provider.key } : {}),
    ...(provider.key === 'tmdb' ? {
      matchConcurrency: provider.matchConcurrency,
      concurrencyBatchSize: provider.concurrencyBatchSize,
    } : {}),
    autoMatchScore,
    pendingMatchScore,
    ...extra,
  }
}
function parseReason(row) {
  try { return JSON.parse(row?.metaReason || '{}') } catch { return {} }
}
function openCandidates(row) {
  candRow.value = row
  candidates.value = Array.isArray(parseReason(row).candidates) ? parseReason(row).candidates : []
  candOpen.value = true
}
async function confirmCandidate(c) {
  if (!candRow.value) return
  try {
    const r = await api.metaSet(candRow.value.id, c)
    ElMessage.success(r.message || '已提交后台确认')
    candOpen.value = false
    setTimeout(() => { loadRows(); load() }, 1200)
  } catch (e) { ElMessage.error(e.message || '确认失败') }
}
async function matchOne(row) {
  try {
    const r = await api.metaMatch(row.id)
    ElMessage.success(r.message || `已提交元数据匹配任务 #${r.taskId}`)
    setTimeout(() => { loadRows(); load() }, 800)
  } catch (e) { ElMessage.error(e.message || '匹配失败') }
}
async function save() {
  saving.value = true
  try {
    const payload = {
      ...cfg.value,
      pendingMatchScore: Math.min(Number(cfg.value.pendingMatchScore) || 0, Number(cfg.value.autoMatchScore) || 0),
      providersConfig: normalizeProvidersConfig(cfg.value.providersConfig),
    }
    await api.updateMetaConfig(payload)
    cfg.value = { ...cfg.value, ...payload }
    ElMessage.success('设置已保存' + (cfg.value.autoMatch ? '，定时匹配已启用' : ''))
  }
  catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}
onMounted(load)
</script>

<style scoped>
.stat-row { grid-template-columns: repeat(6, 1fr); }
.meta-tabs { margin-top: 4px; }
.overview-grid { display: grid; grid-template-columns: minmax(360px, 560px); gap: 20px; align-items: start; }
.ops { display: flex; gap: 12px; flex-wrap: wrap; }
.manual-scope { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
.scope-title { font-size: 13px; font-weight: 700; color: var(--text-1); margin-bottom: 10px; }
.scope-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.advanced-meta-collapse { margin-top: 8px; border-top: 1px solid var(--border); border-bottom: none; }
.provider-list { display: grid; gap: 12px; margin-bottom: 18px; }
.global-meta-form { margin-bottom: 18px; }
.global-meta-form :deep(.el-form-item__content) { min-width: 0; flex-wrap: wrap; gap: 4px 8px; line-height: 1.4; }
.provider-card { border: 1px solid var(--border); border-radius: 12px; padding: 14px; background: var(--bg-soft); }
.provider-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.provider-head b { display: block; color: var(--text-1); font-size: 15px; }
.provider-head span { display: block; margin-top: 3px; color: var(--text-3); font-size: 12px; }
.provider-form { margin-top: 4px; }
.provider-form :deep(.el-form-item) { margin-bottom: 10px; }
.provider-form :deep(.el-form-item:last-child) { margin-bottom: 0; }
.provider-form :deep(.el-form-item__content) { min-width: 0; flex-wrap: wrap; gap: 4px 8px; line-height: 1.4; }
.provider-form :deep(.el-input-number) { width: 138px; max-width: 100%; }
.provider-form :deep(.el-input) { max-width: 100%; }
.field-help { flex: 0 0 100%; font-size: 12px; color: var(--text-3); line-height: 1.35; }
.tip { font-size: 12px; color: var(--text-3); margin-top: 14px; }
.unit { font-size: 12px; color: var(--text-3); white-space: nowrap; }
.pager { margin-top: 14px; justify-content: flex-end; }
.muted { color: var(--text-3); font-size: 12px; }
.cand-title { font-weight: 700; margin-bottom: 12px; color: var(--text-1); }
@media (max-width: 1000px) { .overview-grid { grid-template-columns: 1fr; } .stat-row { grid-template-columns: repeat(2,1fr); } }
</style>
