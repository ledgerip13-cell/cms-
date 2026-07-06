<template>
  <div class="card">
    <div class="bar">
      <div class="sec-title">采集任务
        <el-tag v-if="active" type="warning" size="small">{{ active }} 个进行中</el-tag>
        <span class="live" :class="{on: connected}">
          <i class="dot"></i>{{ connected ? '实时已连接' : '连接中…' }}
        </span>
      </div>
      <div class="actions">
        <span v-if="selected.length" class="selected-count">已选 {{ selected.length }} 条</span>
        <el-button v-if="selected.length" :disabled="!canBatchPause" @click="batchAction('pause')">批量暂停</el-button>
        <el-button v-if="selected.length" type="success" plain :disabled="!canBatchResume" @click="batchAction('resume')">批量恢复</el-button>
        <el-button v-if="selected.length" type="primary" plain :disabled="!canBatchRetry" @click="batchAction('retry')">批量重试</el-button>
        <el-button v-if="selected.length" type="warning" :disabled="!canBatchCancel" @click="batchAction('cancel')">批量中止</el-button>
        <el-button @click="load" :icon="Refresh">刷新</el-button>
        <el-button type="danger" plain @click="cleanup">清理已完成</el-button>
      </div>
    </div>

    <el-table ref="tableRef" row-key="id" :data="list" v-loading="loading" stripe @selection-change="onSelectionChange">
      <el-table-column type="selection" width="44" :reserve-selection="true" />
      <el-table-column prop="id" label="#" width="60" />
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.type==='collect'?'primary':row.type==='meta'?'success':row.type==='keyword'?'warning':row.type==='hls_clean'?'danger':'info'">
            {{ typeLabel(row.type) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sourceName" label="源" width="130" />
      <el-table-column label="模式" width="80">
        <template #default="{ row }">{{ row.mode==='full'?'全量':'增量' }}</template>
      </el-table-column>
      <el-table-column label="进度" min-width="200">
        <template #default="{ row }">
          <el-progress :percentage="row.progress"
            :status="row.status==='done'?'success':row.status==='failed'?'exception':undefined"
            :stroke-width="14" />
          <div style="font-size:11px;color:#9aa4b2">
            {{ progressDetail(row) }}
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="优先级" width="108">
        <template #default="{ row }">
          <el-input-number v-if="['pending','paused'].includes(row.status)" v-model="row.priority" :min="1" :max="999" size="small" controls-position="right"
            style="width:88px" @change="v => setPriority(row, v)" @click.stop />
          <span v-else>{{ row.priority || 100 }}</span>
        </template>
      </el-table-column>
      <el-table-column label="耗时" width="90">
        <template #default="{ row }">{{ duration(row) }}</template>
      </el-table-column>
      <el-table-column label="提交时间" width="160">
        <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="信息" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <span style="font-size:12px;color:#8a94a7">{{ friendlyMessage(row) }}</span>
          <el-tag v-if="row.resumeCount" size="small" type="warning" effect="plain" style="margin-left:6px">恢复{{ row.resumeCount }}次</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button v-if="['running','pending'].includes(row.status)" size="small" plain
            :loading="row._acting" @click="pauseTask(row)">暂停</el-button>
          <el-button v-if="row.status==='paused'" size="small" type="success" plain
            :loading="row._acting" @click="resumeTask(row)">恢复</el-button>
          <el-button v-if="['running','pending','paused'].includes(row.status)" size="small" type="warning"
            :loading="row._acting" @click="cancelTask(row)">中止</el-button>
          <el-button v-if="['failed','canceled','done'].includes(row.status)" size="small" type="primary" plain
            :loading="row._acting" @click="retryTask(row)">重试</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination class="pager" background layout="total, prev, pager, next"
      :total="total" :page-size="size" :current-page="page"
      @current-change="p=>{page=p;load()}" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'

const list = ref([]); const total = ref(0); const page = ref(1); const size = 20
const loading = ref(false); const active = ref(0); const connected = ref(false)
const tableRef = ref(null)
const selected = ref([])
let es = null

const typeLabel = (t) => ({ collect:'采集', probe:'探活', meta:'元数据', keyword:'按片名', subtype:'补小类', hls_clean:'HLS清洗' }[t] || t)
const statusLabel = (s) => ({ pending:'排队', running:'进行中', paused:'已暂停', canceling:'中止中', done:'完成', failed:'失败', canceled:'已中止' }[s] || s)
const statusType = (s) => ({ done:'success', failed:'danger', running:'warning', canceling:'warning', paused:'info', pending:'info' }[s] || 'info')
const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : '—'
const batchStatus = {
  cancel: ['running', 'pending', 'paused'],
  pause: ['running', 'pending'],
  resume: ['paused'],
  retry: ['failed', 'canceled', 'done'],
}
const canBatchCancel = computed(() => selected.value.some((row) => batchStatus.cancel.includes(row.status)))
const canBatchPause = computed(() => selected.value.some((row) => batchStatus.pause.includes(row.status)))
const canBatchResume = computed(() => selected.value.some((row) => batchStatus.resume.includes(row.status)))
const canBatchRetry = computed(() => selected.value.some((row) => batchStatus.retry.includes(row.status)))
function onSelectionChange(rows) {
  selected.value = rows
}
function clearSelected() {
  tableRef.value?.clearSelection?.()
  selected.value = []
}
function duration(r) {
  if (!r.startedAt) return '—'
  const end = r.finishedAt ? new Date(r.finishedAt) : new Date()
  return Math.round((end - new Date(r.startedAt)) / 1000) + 's'
}
function progressDetail(row) {
  if (row.type === 'hls_clean') {
    return `处理 ${row.pageNow || 0}/${row.pageTotal || 0} · 可用${row.added || 0} 失败${row.updated || 0} 无广告${row.merged || 0}`
  }
  return `页 ${row.pageNow || 0}/${row.pageTotal || 0} · 新增${row.added || 0} 更新${row.updated || 0} 合并${row.merged || 0}`
}
function friendlyMessage(row) {
  const msg = String(row.message || '').replace(/\s*\[重启续跑\]/g, '').trim()
  if (msg) return msg
  return row.resumeCount ? '服务重启后自动恢复排队' : '—'
}

async function load() {
  loading.value = true
  try {
    const r = await api.tasks({ page: page.value, size })
    list.value = r.list; total.value = r.total
    active.value = (await api.taskActiveCount()).active
  } finally { loading.value = false }
}

// 行内原地更新（不重建整表，不闪不丢滚动）
function applySnapshot(snap) {
  active.value = snap.active || 0
  const incoming = snap.list || []
  const byId = new Map(list.value.map((t) => [t.id, t]))
  const next = incoming.map((t) => {
    const old = byId.get(t.id)
    if (old) { Object.assign(old, t); return old } // 保留原对象引用，平滑更新
    return t
  })
  list.value = next
  total.value = Math.max(total.value, next.length)
}

function connectSSE() {
  const token = localStorage.getItem('token')
  if (!token) return
  es = new EventSource(`/api/tasks/stream?token=${encodeURIComponent(token)}`)
  es.onopen = () => { connected.value = true }
  es.onmessage = (ev) => {
    try { applySnapshot(JSON.parse(ev.data)) } catch {}
  }
  es.onerror = () => {
    connected.value = false
    // EventSource 会自动重连；若彻底断开则 3s 后重建
    if (es && es.readyState === 2) {
      es.close(); es = null
      setTimeout(connectSSE, 3000)
    }
  }
}
async function cleanup() {
  const r = await api.cleanupTasks(); ElMessage.success(`已清理 ${r.removed} 条`)
  clearSelected()
  // SSE 会推送变更；兼顾分页完整性手动 load 一次
  load()
}
async function cancelTask(row) {
  row._acting = true
  try {
    const r = await api.cancelTask(row.id)
    r?.ok ? ElMessage.success('已中止') : ElMessage.error(r?.error || '中止失败')
  } catch (e) { ElMessage.error('中止失败: ' + e.message) } finally { row._acting = false }
}
async function pauseTask(row) {
  row._acting = true
  try {
    const r = await api.pauseTask(row.id)
    r?.ok ? ElMessage.success('已暂停') : ElMessage.error(r?.error || '暂停失败')
  } catch (e) { ElMessage.error('暂停失败: ' + e.message) } finally { row._acting = false }
}
async function resumeTask(row) {
  row._acting = true
  try {
    const r = await api.resumeTask(row.id)
    r?.ok ? ElMessage.success('已恢复排队') : ElMessage.error(r?.error || '恢复失败')
  } catch (e) { ElMessage.error('恢复失败: ' + e.message) } finally { row._acting = false }
}
async function batchAction(action) {
  const rows = selected.value.filter((row) => batchStatus[action]?.includes(row.status))
  if (!rows.length) return ElMessage.warning('当前选择里没有可操作任务')
  const labels = { cancel: '中止', pause: '暂停', resume: '恢复', retry: '重试' }
  try {
    if (['cancel', 'retry'].includes(action)) {
      await ElMessageBox.confirm(`确认批量${labels[action]} ${rows.length} 个任务？`, '批量操作', { type: action === 'cancel' ? 'warning' : 'info' })
    }
    const r = await api.batchTasks(rows.map((row) => row.id), action)
    if (r?.ok) {
      const skipped = r.skipped?.length ? `，跳过 ${r.skipped.length} 条` : ''
      ElMessage.success(`已${labels[action]} ${r.count || 0} 条${skipped}`)
      clearSelected()
      load()
    } else {
      ElMessage.error(r?.error || '批量操作失败')
    }
  } catch (e) {
    if (!['cancel', 'close'].includes(e)) ElMessage.error(e.message || '批量操作失败')
  }
}
async function setPriority(row, value) {
  try {
    const r = await api.updateTaskPriority(row.id, value)
    r?.ok ? ElMessage.success('优先级已更新') : ElMessage.error(r?.error || '更新失败')
  } catch (e) { ElMessage.error(e.message || '更新失败') }
}
async function retryTask(row) {
  row._acting = true
  try {
    const r = await api.retryTask(row.id)
    r?.ok ? ElMessage.success('已重新提交，任务#' + r.taskId) : ElMessage.error(r?.error || '重试失败')
  } catch (e) { ElMessage.error('重试失败: ' + e.message) } finally { row._acting = false }
}
onMounted(() => {
  load()
  connectSSE()
})
onUnmounted(() => { if (es) { es.close(); es = null } })
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.sec-title { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
.selected-count { font-size:12px; color:#8a94a7; }
.pager { margin-top: 16px; justify-content: flex-end; }
.live { display:inline-flex; align-items:center; gap:5px; font-size:12px; color:#9aa4b2; font-weight:400; }
.live .dot { width:7px; height:7px; border-radius:50%; background:#c0c4cc; }
.live.on { color:#67c23a; }
.live.on .dot { background:#67c23a; box-shadow:0 0 0 3px rgba(103,194,58,.18); animation:pulse 1.6s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
</style>
