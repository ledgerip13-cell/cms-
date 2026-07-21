<template>
  <div class="ops-page">
    <el-tabs v-model="tab">
      <el-tab-pane label="QC问题队列" name="qc">
        <div class="card">
          <div class="toolbar">
            <div class="sec-title">QC问题队列</div>
            <div class="actions">
              <el-select v-model="qcFilter.type" clearable placeholder="问题类型" style="width:160px" @change="loadQc(1)">
                <el-option v-for="item in issueTypes" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-select v-model="qcFilter.status" clearable placeholder="状态" style="width:130px" @change="loadQc(1)">
                <el-option v-for="item in issueStatuses" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-input v-model="qcFilter.keyword" clearable placeholder="影片 / 源 / 备注" style="width:220px" @keyup.enter="loadQc(1)" @clear="loadQc(1)" />
              <el-button :loading="qcLoading" @click="scanQc">扫描</el-button>
              <el-button :loading="qcLoading" @click="loadQc()">刷新</el-button>
            </div>
          </div>
          <div class="metric-row">
            <div v-for="item in qcSummaryCards" :key="item.key" class="metric">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
          <el-table :data="qcList" height="560" v-loading="qcLoading">
            <el-table-column label="类型" width="140"><template #default="{row}">{{ issueTypeLabel(row.type) }}</template></el-table-column>
            <el-table-column label="级别" width="90"><template #default="{row}"><el-tag :type="severityTag(row.severity)" effect="plain">{{ row.severity }}</el-tag></template></el-table-column>
            <el-table-column prop="targetName" label="对象" min-width="180" show-overflow-tooltip />
            <el-table-column prop="sourceName" label="源" width="140" show-overflow-tooltip />
            <el-table-column label="状态" width="110"><template #default="{row}"><el-tag>{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
            <el-table-column prop="assignee" label="负责人" width="110" />
            <el-table-column prop="note" label="备注" min-width="180" show-overflow-tooltip />
            <el-table-column label="最近发现" width="170"><template #default="{row}">{{ fmtTime(row.lastSeenAt) }}</template></el-table-column>
            <el-table-column label="操作" width="260" fixed="right">
              <template #default="{row}">
                <el-button size="small" @click="actQc(row, 'claim')">认领</el-button>
                <el-button size="small" @click="actQc(row, 'handle')">处理</el-button>
                <el-button size="small" type="success" plain @click="actQc(row, 'close')">关闭</el-button>
                <el-button size="small" type="warning" plain @click="actQc(row, 'review')">复核</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination class="pager" background layout="total, prev, pager, next, sizes"
            :total="qcTotal" :current-page="qcFilter.page" :page-size="qcFilter.size" :page-sizes="[50,100,200]"
            @current-change="loadQc"
            @size-change="s=>{qcFilter.size=s;loadQc(1)}" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="源SLA面板" name="sla">
        <div class="card">
          <div class="toolbar">
            <div class="sec-title">源SLA面板</div>
            <div class="actions">
              <el-radio-group v-model="slaDays" @change="loadSla">
                <el-radio-button :label="7">近7天</el-radio-button>
                <el-radio-button :label="30">近30天</el-radio-button>
              </el-radio-group>
              <el-button :loading="slaLoading" @click="loadSla">刷新</el-button>
            </div>
          </div>
          <el-table :data="slaList" height="650" v-loading="slaLoading">
            <el-table-column label="排名" width="70"><template #default="{ $index }">{{ $index + 1 }}</template></el-table-column>
            <el-table-column prop="name" label="源" min-width="160" show-overflow-tooltip />
            <el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.enabled && row.status !== 'fail' ? 'success' : 'danger'">{{ row.enabled ? row.status : 'disabled' }}</el-tag></template></el-table-column>
            <el-table-column prop="qualityScore" label="质量分" width="90" sortable />
            <el-table-column prop="successRate" label="成功率%" width="100" sortable />
            <el-table-column prop="avgMs" label="平均耗时ms" width="120" sortable />
            <el-table-column label="线路" width="120"><template #default="{row}">{{ row.aliveCount }} / {{ row.playCount }}</template></el-table-column>
            <el-table-column label="成功/失败" width="120"><template #default="{row}">{{ row.success }} / {{ row.failure }}</template></el-table-column>
            <el-table-column prop="syncCount7Or30" :label="`近${slaDays}天采集`" width="120" />
            <el-table-column label="最近失败" min-width="220" show-overflow-tooltip><template #default="{row}">{{ row.lastFailureReason || '—' }}</template></el-table-column>
            <el-table-column label="7/30趋势" width="130">
              <template #default="{row}">
                <span>{{ trendRate(row.id, 7) }} / {{ trendRate(row.id, 30) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'

const tab = ref('qc')
const qcLoading = ref(false)
const qcList = ref([])
const qcTotal = ref(0)
const qcSummary = ref([])
const qcFilter = ref({ page: 1, size: 50, type: '', status: '', keyword: '' })
const slaLoading = ref(false)
const slaDays = ref(7)
const slaList = ref([])
const slaTrends = ref({ 7: [], 30: [] })

const issueTypes = [
  { value: 'no_lines', label: '无线路' },
  { value: 'all_dead', label: '全死链' },
  { value: 'no_cover', label: '无封面' },
  { value: 'meta_pending', label: '元数据待确认' },
  { value: 'hls_failed', label: 'HLS清洗失败' },
  { value: 'playback_hot', label: '播放错误高发' },
]
const issueStatuses = [
  { value: 'open', label: '待处理' },
  { value: 'claimed', label: '已认领' },
  { value: 'handling', label: '处理中' },
  { value: 'closed', label: '已关闭' },
  { value: 'reviewing', label: '复核中' },
]
const qcSummaryCards = computed(() => {
  const byStatus = new Map()
  for (const row of qcSummary.value) byStatus.set(row.status, (byStatus.get(row.status) || 0) + (row._count?._all || 0))
  return issueStatuses.map(item => ({ key: item.value, label: item.label, value: byStatus.get(item.value) || 0 }))
})

function fmtTime(t) {
  return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '—'
}
function issueTypeLabel(type) {
  return issueTypes.find(item => item.value === type)?.label || type
}
function statusLabel(status) {
  return issueStatuses.find(item => item.value === status)?.label || status
}
function severityTag(severity) {
  if (severity === 'critical') return 'danger'
  if (severity === 'high') return 'warning'
  return 'info'
}
function trendRate(sourceId, days) {
  const row = (slaTrends.value[String(days)] || []).find(item => item.id === sourceId)
  return row ? `${row.successRate}%` : '—'
}
async function loadQc(page) {
  if (page) qcFilter.value.page = page
  qcLoading.value = true
  try {
    const res = await api.qcIssues({ ...qcFilter.value })
    qcList.value = res.list || []
    qcTotal.value = res.total || 0
    qcSummary.value = res.summary || []
  } finally {
    qcLoading.value = false
  }
}
async function scanQc() {
  qcLoading.value = true
  try {
    const res = await api.scanQcIssues()
    ElMessage.success(`已扫描 ${res.scanned || 0} 个问题`)
    await loadQc(1)
  } finally {
    qcLoading.value = false
  }
}
async function actQc(row, action) {
  const note = await ElMessageBox.prompt('处理备注', statusLabel(action === 'claim' ? 'claimed' : action === 'handle' ? 'handling' : action === 'close' ? 'closed' : 'reviewing'), {
    inputValue: row.note || '',
    inputType: 'textarea',
    confirmButtonText: '保存',
    cancelButtonText: '取消',
  }).then(({ value }) => value).catch(() => null)
  if (note === null) return
  await api.updateQcIssue(row.id, action, { note })
  ElMessage.success('已更新')
  await loadQc()
}
async function loadSla() {
  slaLoading.value = true
  try {
    const res = await api.sourceSla(slaDays.value)
    slaList.value = res.list || []
    slaTrends.value = res.trends || { 7: [], 30: [] }
  } finally {
    slaLoading.value = false
  }
}

watch(tab, (value) => {
  if (value === 'qc') loadQc()
  if (value === 'sla') loadSla()
})
onMounted(async () => {
  await Promise.allSettled([loadQc(), loadSla()])
})
</script>

<style scoped>
.ops-page { display: flex; flex-direction: column; gap: 16px; }
.card { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 18px; box-shadow: var(--shadow-card); }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
.sec-title { font-size: 16px; font-weight: 700; color: var(--text-1); }
.metric-row { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 10px; margin-bottom: 14px; }
.metric { border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: #fafbff; }
.metric span { display: block; color: var(--text-3); font-size: 12px; }
.metric strong { display: block; margin-top: 6px; color: var(--text-1); font-size: 22px; line-height: 1; }
.pager { justify-content: flex-end; margin-top: 14px; }
</style>
