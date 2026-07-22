<template>
  <div class="risk-wrap">
    <div class="stat-grid">
      <div class="stat-card"><span>待处理风险</span><b>{{ overview.openEvents || 0 }}</b></div>
      <div class="stat-card warn"><span>高危事件</span><b>{{ overview.highEvents || 0 }}</b></div>
      <div class="stat-card danger"><span>封禁用户</span><b>{{ overview.bannedUsers || 0 }}</b></div>
      <div class="stat-card"><span>登录设备</span><b>{{ overview.deviceCount || 0 }}</b></div>
    </div>

    <div class="card">
      <el-tabs v-model="tab" @tab-change="load">
        <el-tab-pane label="风险事件" name="events">
          <div class="toolbar">
            <div class="sec-title">风险事件</div>
            <div class="actions">
              <el-input v-model="eventQ.kw" clearable placeholder="账号 / IP / 原因" style="width:220px" @keyup.enter="loadEvents" />
              <el-select v-model="eventQ.status" style="width:130px" @change="loadEvents">
                <el-option label="全部状态" value="" />
                <el-option label="待处理" value="open" />
                <el-option label="已确认" value="confirmed" />
                <el-option label="误报" value="ignored" />
                <el-option label="已解决" value="resolved" />
              </el-select>
              <el-button :icon="Refresh" :loading="eventLoading" @click="loadEvents">刷新</el-button>
            </div>
          </div>
          <el-table v-loading="eventLoading" :data="events" stripe>
            <el-table-column label="时间" width="180"><template #default="{ row }">{{ fmt(row.createdAt) }}</template></el-table-column>
            <el-table-column prop="title" label="事件" min-width="180" />
            <el-table-column label="等级" width="90">
              <template #default="{ row }"><el-tag :type="riskType(row.severity)">{{ levelText(row.severity) }}</el-tag></template>
            </el-table-column>
            <el-table-column label="用户" min-width="150"><template #default="{ row }">{{ row.user?.username || row.username || '—' }}</template></el-table-column>
            <el-table-column prop="ip" label="IP" width="150" />
            <el-table-column prop="reason" label="原因" min-width="240" show-overflow-tooltip />
            <el-table-column label="状态" width="100"><template #default="{ row }">{{ statusText(row.status) }}</template></el-table-column>
            <el-table-column label="操作" width="210" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="markEvent(row, 'confirmed')">确认</el-button>
                <el-button size="small" @click="markEvent(row, 'ignored')">误报</el-button>
                <el-button size="small" type="primary" plain @click="markEvent(row, 'resolved')">解决</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination class="pager" background layout="total, prev, pager, next, sizes" :total="eventTotal"
            v-model:current-page="eventQ.page" v-model:page-size="eventQ.pageSize" :page-sizes="[10,30,50,100]" @change="loadEvents" />
        </el-tab-pane>

        <el-tab-pane label="登录设备" name="devices">
          <div class="toolbar">
            <div class="sec-title">登录设备</div>
            <div class="actions">
              <el-input v-model="deviceQ.kw" clearable placeholder="账号 / IP / 设备指纹" style="width:260px" @keyup.enter="loadDevices" />
              <el-button :icon="Refresh" :loading="deviceLoading" @click="loadDevices">刷新</el-button>
            </div>
          </div>
          <el-table v-loading="deviceLoading" :data="devices" stripe>
            <el-table-column label="最近登录" width="180"><template #default="{ row }">{{ fmt(row.lastSeenAt) }}</template></el-table-column>
            <el-table-column label="用户" width="150"><template #default="{ row }">{{ row.user?.username || '—' }}</template></el-table-column>
            <el-table-column prop="label" label="设备" width="110" />
            <el-table-column prop="browser" label="浏览器" width="100" />
            <el-table-column prop="lastIp" label="最近IP" width="150" />
            <el-table-column prop="loginCount" label="次数" width="80" />
            <el-table-column prop="deviceHash" label="设备指纹" min-width="260" show-overflow-tooltip />
            <el-table-column prop="userAgent" label="客户端" min-width="280" show-overflow-tooltip />
          </el-table>
          <el-pagination class="pager" background layout="total, prev, pager, next, sizes" :total="deviceTotal"
            v-model:current-page="deviceQ.page" v-model:page-size="deviceQ.pageSize" :page-sizes="[10,30,50,100]" @change="loadDevices" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { api } from '../api'

const tab = ref('events')
const overview = ref({})
const events = ref([])
const eventTotal = ref(0)
const eventLoading = ref(false)
const eventQ = ref({ page: 1, pageSize: 30, kw: '', status: 'open' })
const devices = ref([])
const deviceTotal = ref(0)
const deviceLoading = ref(false)
const deviceQ = ref({ page: 1, pageSize: 30, kw: '' })

function fmt(v) { return v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '—' }
function levelText(v) { return ({ high: '高危', medium: '中危', low: '低危' })[v] || v || '—' }
function riskType(v) { return v === 'high' ? 'danger' : v === 'low' ? 'info' : 'warning' }
function statusText(v) { return ({ open: '待处理', confirmed: '已确认', ignored: '误报', resolved: '已解决' })[v] || v || '—' }

async function loadOverview() {
  try { overview.value = await api.riskOverview() } catch {}
}
async function loadEvents() {
  eventLoading.value = true
  try {
    const r = await api.riskEvents(eventQ.value)
    events.value = r.list || []
    eventTotal.value = r.total || 0
  } catch (e) { ElMessage.error(e.message || '加载失败') } finally { eventLoading.value = false }
}
async function loadDevices() {
  deviceLoading.value = true
  try {
    const r = await api.riskDevices(deviceQ.value)
    devices.value = r.list || []
    deviceTotal.value = r.total || 0
  } catch (e) { ElMessage.error(e.message || '加载失败') } finally { deviceLoading.value = false }
}
async function markEvent(row, status) {
  try {
    await api.updateRiskEvent(row.id, { status })
    ElMessage.success('已更新')
    await Promise.all([loadOverview(), loadEvents()])
  } catch (e) { ElMessage.error(e.message || '更新失败') }
}
function load() {
  if (tab.value === 'devices') loadDevices()
  else loadEvents()
}

onMounted(async () => {
  await Promise.all([loadOverview(), loadEvents()])
})
</script>

<style scoped>
.risk-wrap { display: flex; flex-direction: column; gap: 18px; }
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.stat-card { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 18px; box-shadow: var(--shadow-card); }
.stat-card span { display: block; color: var(--text-3); font-size: 13px; margin-bottom: 8px; }
.stat-card b { color: var(--text-1); font-size: 28px; line-height: 1; }
.stat-card.warn b { color: var(--el-color-warning); }
.stat-card.danger b { color: var(--el-color-danger); }
.toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 14px; }
.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pager { margin-top: 14px; display: flex; justify-content: flex-end; }
@media (max-width: 1100px) {
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .toolbar { align-items: stretch; flex-direction: column; }
}
</style>
