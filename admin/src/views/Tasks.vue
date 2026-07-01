<template>
  <div class="card">
    <div class="bar">
      <div class="sec-title">采集任务
        <el-tag v-if="active" type="warning" size="small">{{ active }} 个进行中</el-tag>
        <span class="live" :class="{on: connected}">
          <i class="dot"></i>{{ connected ? '实时已连接' : '连接中…' }}
        </span>
      </div>
      <div>
        <el-button @click="load" :icon="Refresh">刷新</el-button>
        <el-button type="danger" plain @click="cleanup">清理已完成</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="id" label="#" width="60" />
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.type==='collect'?'primary':row.type==='meta'?'success':'info'">
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
            页 {{ row.pageNow }}/{{ row.pageTotal }} · 新增{{ row.added }} 更新{{ row.updated }} 合并{{ row.merged }}
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="耗时" width="90">
        <template #default="{ row }">{{ duration(row) }}</template>
      </el-table-column>
      <el-table-column label="提交时间" width="160">
        <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="信息" min-width="180" show-overflow-tooltip>
        <template #default="{ row }"><span style="font-size:12px;color:#8a94a7">{{ row.message }}</span></template>
      </el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button v-if="['running','pending'].includes(row.status)" size="small" type="warning"
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
import { ref, onMounted, onUnmounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'

const list = ref([]); const total = ref(0); const page = ref(1); const size = 20
const loading = ref(false); const active = ref(0); const connected = ref(false)
let es = null

const typeLabel = (t) => ({ collect:'采集', probe:'探活', meta:'元数据' }[t] || t)
const statusLabel = (s) => ({ pending:'排队', running:'进行中', done:'完成', failed:'失败', canceled:'取消' }[s] || s)
const statusType = (s) => ({ done:'success', failed:'danger', running:'warning', pending:'info' }[s] || 'info')
const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : '—'
function duration(r) {
  if (!r.startedAt) return '—'
  const end = r.finishedAt ? new Date(r.finishedAt) : new Date()
  return Math.round((end - new Date(r.startedAt)) / 1000) + 's'
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
.pager { margin-top: 16px; justify-content: flex-end; }
.live { display:inline-flex; align-items:center; gap:5px; font-size:12px; color:#9aa4b2; font-weight:400; }
.live .dot { width:7px; height:7px; border-radius:50%; background:#c0c4cc; }
.live.on { color:#67c23a; }
.live.on .dot { background:#67c23a; box-shadow:0 0 0 3px rgba(103,194,58,.18); animation:pulse 1.6s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
</style>
