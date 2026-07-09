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

    <div class="cols">
      <!-- 手动操作 -->
      <div class="card">
        <div class="sec-title" style="margin-bottom:16px">豆瓣元数据匹配</div>
        <el-alert type="info" :closable="false" style="margin-bottom:16px"
          title="从豆瓣抓取评分/简介/高清封面并落库。抓一次存库，前端读库不实时请求。短剧类豆瓣多无收录，属正常。" />
        <div class="ops">
          <el-button type="primary" :icon="MagicStick" @click="run(false)">
            匹配未处理（{{ stat.none || 0 }} 部）
          </el-button>
          <el-button :icon="RefreshRight" @click="run(true)">
            重刷失败/全部（{{ stat.failed || 0 }} 失败）
          </el-button>
        </div>
        <p class="tip">任务在后台运行，进度见「采集任务」页。达到自动通过分会写入豆瓣数据；低于自动通过但达到待确认分会进入候选确认。当前限速 {{ cfg.intervalMs }}ms/条、每批 {{ cfg.batchLimit }} 部，自动通过 {{ cfg.autoMatchScore }} 分，待确认 {{ cfg.pendingMatchScore }} 分。</p>
      </div>

      <!-- 参数设置 -->
      <div class="card">
        <div class="toolbar">
          <div class="sec-title">采集参数设置</div>
          <el-button type="primary" :icon="Check" :loading="saving" @click="save">保存</el-button>
        </div>
        <el-form :model="cfg" label-width="120px">
          <el-form-item label="限速间隔">
            <el-input-number v-model="cfg.intervalMs" :min="1000" :max="10000" :step="500" />
            <span class="unit">毫秒/条（越大越安全，防豆瓣封 IP）</span>
          </el-form-item>
          <el-form-item label="每批数量">
            <el-input-number v-model="cfg.batchLimit" :min="10" :max="500" :step="10" />
            <span class="unit">部/次</span>
          </el-form-item>
          <el-divider>置信分设置</el-divider>
          <el-form-item label="自动通过分">
            <el-input-number v-model="cfg.autoMatchScore" :min="0" :max="100" :step="1" />
            <span class="unit">达到该分即自动写入豆瓣元数据</span>
          </el-form-item>
          <el-form-item label="待确认分">
            <el-input-number v-model="cfg.pendingMatchScore" :min="0" :max="cfg.autoMatchScore || 100" :step="1" />
            <span class="unit">低于自动通过但达到该分进入待确认</span>
          </el-form-item>
          <el-divider>定时自动匹配</el-divider>
          <el-form-item label="自动匹配">
            <el-switch v-model="cfg.autoMatch" />
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
              <el-switch v-model="cfg.redoFailed" />
              <span class="unit">开启则定时任务也重刷之前失败的</span>
            </el-form-item>
          </template>
        </el-form>
      </div>
    </div>

    <div class="card">
      <div class="toolbar">
        <div class="sec-title">匹配记录</div>
        <div class="ops">
          <el-input v-model="q.kw" clearable placeholder="片名 / 命中标题" style="width:180px" @keyup.enter="loadRows" />
          <el-select v-model="q.status" style="width:130px" @change="applyRows">
            <el-option label="待确认" value="pending" />
            <el-option label="待匹配" value="none" />
            <el-option label="失败/无收录" value="failed" />
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
        </div>
      </div>
      <el-table :data="rows" v-loading="rowLoading" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="片名" min-width="180" />
        <el-table-column prop="typeName" label="分类" width="110" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><el-tag size="small" :type="metaType(row.metaMatched)">{{ metaLabel(row.metaMatched) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="命中" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.matchedTitle || '—' }} {{ row.matchedYear ? '(' + row.matchedYear + ')' : '' }}</template>
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

    <el-dialog v-model="candOpen" title="待确认候选" width="760">
      <div v-if="candRow" class="cand-title">{{ candRow.name }} · 当前置信 {{ candRow.metaScore || 0 }}</div>
      <el-table :data="candidates" stripe>
        <el-table-column label="候选" min-width="220">
          <template #default="{ row }">
            <b>{{ row.title }}</b><span v-if="row.year" class="muted">（{{ row.year }}）</span>
            <div class="muted">{{ row.subTitle || row.type || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="score" label="分数" width="80" />
        <el-table-column label="原因" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ reasonText(row.reasons) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110">
          <template #default="{ row }"><el-button size="small" type="primary" @click="confirmCandidate(row)">确认</el-button></template>
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

const stat = ref({}); const cfg = ref({ intervalMs:2500, batchLimit:50, autoMatchScore:80, pendingMatchScore:60, autoMatch:false, cronExpr:'0 4 * * *', redoFailed:false })
const saving = ref(false)
const sources = ref([])
const categories = ref([])
const rows = ref([])
const rowTotal = ref(0)
const rowLoading = ref(false)
const q = ref({ page: 1, size: 20, status: 'pending', sourceId: '', categoryName: '', kw: '' })
const candOpen = ref(false)
const candRow = ref(null)
const candidates = ref([])
const statCards = [
  { k:'total', label:'影片总数', color:'#1a1f2b' },
  { k:'matched', label:'已匹配', color:'#16a34a' },
  { k:'pending', label:'待确认', color:'#e6a23c' },
  { k:'failed', label:'无收录', color:'#98a1b0' },
  { k:'none', label:'待匹配', color:'#4f6ef7' },
]
const matchRate = computed(() => stat.value.total ? Math.round((stat.value.matched / stat.value.total) * 100) : 0)

const fmt = (v) => v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '—'
const metaLabel = (s) => ({ none:'待匹配', matched:'已匹配', manual:'人工确认', pending:'待确认', failed:'失败/无收录', skip:'跳过' }[s] || s)
const metaType = (s) => ({ matched:'success', manual:'success', pending:'warning', failed:'info', none:'primary' }[s] || 'info')
const reasonMap = {
  manual: '人工确认',
  no_suggest: '豆瓣无候选',
  detail_failed: '豆瓣详情获取失败',
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

async function load() {
  const [st, conf, ss, cs] = await Promise.all([api.metaStats(), api.metaConfig(), api.sources(), api.categories()])
  stat.value = st
  cfg.value = { ...cfg.value, ...conf }
  sources.value = ss
  categories.value = cs
  await loadRows()
}
async function run(redo) {
  try {
    const payload = metaTaskPayload({ redo })
    const r = await api.metaBatch(payload)
    ElMessage.success(r.message || '任务已提交，去「采集任务」看进度')
  } catch (e) { ElMessage.error(e.message || '提交失败') }
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
  const ok = await ElMessageBox.confirm('按当前筛选条件提交豆瓣匹配任务？', '豆瓣匹配', { type: 'warning' })
    .then(() => true).catch(() => false)
  if (!ok) return
  try {
    const r = await api.metaBatch({
      ...metaTaskPayload(),
      limit: cfg.value.batchLimit,
      intervalMs: cfg.value.intervalMs,
      status: q.value.status,
      sourceId: q.value.sourceId || undefined,
      categoryName: q.value.categoryName || undefined,
      redo: q.value.status === 'all',
    })
    ElMessage.success(r.message || '任务已提交')
  } catch (e) { ElMessage.error(e.message || '提交失败') }
}
function metaTaskPayload(extra = {}) {
  const autoMatchScore = Math.max(0, Math.min(100, Math.round(Number(cfg.value.autoMatchScore) || 0)))
  const pendingMatchScore = Math.max(0, Math.min(autoMatchScore, Math.round(Number(cfg.value.pendingMatchScore) || 0)))
  return {
    limit: cfg.value.batchLimit,
    intervalMs: cfg.value.intervalMs,
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
    await api.metaSet(candRow.value.id, c.id)
    ElMessage.success('已确认匹配')
    candOpen.value = false
    await Promise.all([loadRows(), load()])
  } catch (e) { ElMessage.error(e.message || '确认失败') }
}
async function matchOne(row) {
  try {
    await api.metaMatch(row.id)
    ElMessage.success('已重新匹配')
    await Promise.all([loadRows(), load()])
  } catch (e) { ElMessage.error(e.message || '匹配失败') }
}
async function save() {
  saving.value = true
  try {
    const payload = {
      ...cfg.value,
      pendingMatchScore: Math.min(Number(cfg.value.pendingMatchScore) || 0, Number(cfg.value.autoMatchScore) || 0),
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
.stat-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; margin-bottom: 20px; }
.stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px;
  padding: 18px 20px; box-shadow: var(--shadow-card); }
.stat-num { font-size: 26px; font-weight: 750; }
.stat-label { font-size: 13px; color: var(--text-3); margin-top: 4px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
.ops { display: flex; gap: 12px; flex-wrap: wrap; }
.tip { font-size: 12px; color: var(--text-3); margin-top: 14px; }
.unit { margin-left: 10px; font-size: 12px; color: var(--text-3); }
.pager { margin-top: 14px; justify-content: flex-end; }
.muted { color: var(--text-3); font-size: 12px; }
.cand-title { font-weight: 700; margin-bottom: 12px; color: var(--text-1); }
@media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } .stat-row { grid-template-columns: repeat(2,1fr); } }
</style>
