<template>
  <div class="interactions-wrap">
    <div class="card">
      <div class="toolbar">
        <div>
          <div class="sec-title">互动开关</div>
          <p class="muted">全端统一生效：X8、PC默认、移动端共用同一套接口。</p>
        </div>
        <el-button type="primary" :loading="savingCfg" @click="saveConfig">保存开关</el-button>
      </div>
      <div class="switch-grid">
        <label v-for="item in switchItems" :key="item.key" class="switch-item">
          <span>{{ item.label }}</span>
          <el-switch v-model="cfg[item.key]" />
        </label>
      </div>
    </div>

    <div class="card">
      <el-tabs v-model="tab" @tab-change="loadTab">
        <el-tab-pane label="评论" name="comments">
          <DataToolbar v-model:kw="q.comments.kw" v-model:status="q.comments.status" :status-options="commentStatuses" @search="loadComments" />
          <el-table v-loading="loading" :data="rows" stripe>
            <el-table-column label="时间" width="180"><template #default="{ row }">{{ fmt(row.createdAt) }}</template></el-table-column>
            <el-table-column label="影片" min-width="170" show-overflow-tooltip><template #default="{ row }">{{ row.vod?.name || '—' }}</template></el-table-column>
            <el-table-column label="用户" width="130"><template #default="{ row }">{{ row.user?.username || '匿名' }}</template></el-table-column>
            <el-table-column prop="content" label="内容" min-width="260" show-overflow-tooltip />
            <el-table-column prop="ip" label="IP" width="145" />
            <el-table-column prop="source" label="来源" width="80" />
            <el-table-column label="状态" width="90"><template #default="{ row }">{{ row.status }}</template></el-table-column>
            <el-table-column label="操作" width="190" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="updateRow(row, 'comments', 'visible')">显示</el-button>
                <el-button size="small" @click="updateRow(row, 'comments', 'hidden')">隐藏</el-button>
                <el-button size="small" type="danger" plain @click="updateRow(row, 'comments', 'deleted')">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="评分" name="ratings">
          <DataToolbar v-model:kw="q.ratings.kw" :with-status="false" @search="loadRatings" />
          <el-table v-loading="loading" :data="rows" stripe>
            <el-table-column label="时间" width="180"><template #default="{ row }">{{ fmt(row.updatedAt) }}</template></el-table-column>
            <el-table-column label="影片" min-width="190" show-overflow-tooltip><template #default="{ row }">{{ row.vod?.name || '—' }}</template></el-table-column>
            <el-table-column label="用户" width="130"><template #default="{ row }">{{ row.user?.username || '—' }}</template></el-table-column>
            <el-table-column prop="score" label="评分" width="90" />
            <el-table-column prop="ip" label="IP" width="145" />
            <el-table-column prop="source" label="来源" width="80" />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="求片" name="requests">
          <DataToolbar v-model:kw="q.requests.kw" v-model:status="q.requests.status" :status-options="requestStatuses" @search="loadRequests" />
          <el-table v-loading="loading" :data="rows" stripe>
            <el-table-column label="时间" width="180"><template #default="{ row }">{{ fmt(row.createdAt) }}</template></el-table-column>
            <el-table-column prop="title" label="片名" min-width="180" show-overflow-tooltip />
            <el-table-column prop="authorName" label="求片作者" width="130" />
            <el-table-column prop="ip" label="IP" width="145" />
            <el-table-column prop="source" label="来源" width="80" />
            <el-table-column prop="note" label="备注" min-width="180" show-overflow-tooltip />
            <el-table-column label="状态" width="100"><template #default="{ row }">{{ requestStatusText(row.status) }}</template></el-table-column>
            <el-table-column label="操作" width="230" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="updateRow(row, 'requests', 'collecting')">处理中</el-button>
                <el-button size="small" type="success" plain @click="updateRow(row, 'requests', 'done')">已完成</el-button>
                <el-button size="small" type="danger" plain @click="updateRow(row, 'requests', 'rejected')">拒绝</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="举报" name="reports">
          <DataToolbar v-model:kw="q.reports.kw" v-model:status="q.reports.status" :status-options="reportStatuses" @search="loadReports" />
          <el-table v-loading="loading" :data="rows" stripe>
            <el-table-column label="时间" width="180"><template #default="{ row }">{{ fmt(row.createdAt) }}</template></el-table-column>
            <el-table-column prop="type" label="类型" width="90" />
            <el-table-column label="影片" min-width="160" show-overflow-tooltip><template #default="{ row }">{{ row.vod?.name || '—' }}</template></el-table-column>
            <el-table-column label="用户" width="130"><template #default="{ row }">{{ row.user?.username || '匿名' }}</template></el-table-column>
            <el-table-column prop="reason" label="原因" min-width="160" show-overflow-tooltip />
            <el-table-column prop="content" label="补充" min-width="180" show-overflow-tooltip />
            <el-table-column prop="ip" label="IP" width="145" />
            <el-table-column label="状态" width="100"><template #default="{ row }">{{ reportStatusText(row.status) }}</template></el-table-column>
            <el-table-column label="操作" width="210" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="updateRow(row, 'reports', 'handling')">处理中</el-button>
                <el-button size="small" type="success" plain @click="updateRow(row, 'reports', 'resolved')">解决</el-button>
                <el-button size="small" type="danger" plain @click="updateRow(row, 'reports', 'rejected')">驳回</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="站内消息" name="messages">
          <div class="toolbar">
            <DataToolbar v-model:kw="q.messages.kw" v-model:status="q.messages.status" :status-options="messageStatuses" @search="loadMessages" />
            <el-button type="primary" :icon="Plus" @click="messageOpen = true">发消息</el-button>
          </div>
          <el-table v-loading="loading" :data="rows" stripe>
            <el-table-column label="时间" width="180"><template #default="{ row }">{{ fmt(row.sentAt) }}</template></el-table-column>
            <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
            <el-table-column prop="content" label="内容" min-width="260" show-overflow-tooltip />
            <el-table-column label="接收人" width="130"><template #default="{ row }">{{ row.recipient?.username || '全站' }}</template></el-table-column>
            <el-table-column label="已读" width="80"><template #default="{ row }">{{ row._count?.reads || 0 }}</template></el-table-column>
            <el-table-column label="状态" width="100"><template #default="{ row }">{{ row.status }}</template></el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="updateRow(row, 'messages', row.status === 'archived' ? 'sent' : 'archived')">{{ row.status === 'archived' ? '恢复' : '归档' }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="弹幕" name="danmaku">
          <DataToolbar v-model:kw="q.danmaku.kw" v-model:status="q.danmaku.status" :status-options="commentStatuses" @search="loadDanmaku" />
          <el-table v-loading="loading" :data="rows" stripe>
            <el-table-column label="时间" width="180"><template #default="{ row }">{{ fmt(row.createdAt) }}</template></el-table-column>
            <el-table-column label="影片" min-width="170" show-overflow-tooltip><template #default="{ row }">{{ row.vod?.name || '—' }}</template></el-table-column>
            <el-table-column label="集数/秒" width="110"><template #default="{ row }">{{ row.epIndex + 1 }} / {{ row.timeSec }}s</template></el-table-column>
            <el-table-column label="用户" width="130"><template #default="{ row }">{{ row.user?.username || '匿名' }}</template></el-table-column>
            <el-table-column prop="content" label="内容" min-width="220" show-overflow-tooltip />
            <el-table-column prop="ip" label="IP" width="145" />
            <el-table-column label="操作" width="190" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="updateRow(row, 'danmaku', 'visible')">显示</el-button>
                <el-button size="small" @click="updateRow(row, 'danmaku', 'hidden')">隐藏</el-button>
                <el-button size="small" type="danger" plain @click="updateRow(row, 'danmaku', 'deleted')">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>

      <el-pagination class="pager" background layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="activeQ.page" v-model:page-size="activeQ.pageSize" :page-sizes="[10,30,50,100]" @change="loadTab" />
    </div>

    <el-dialog v-model="messageOpen" title="发送站内消息" width="520px">
      <el-form label-width="86px">
        <el-form-item label="接收人ID"><el-input-number v-model="messageForm.recipientUserId" :min="0" placeholder="0=全站" /></el-form-item>
        <el-form-item label="标题"><el-input v-model="messageForm.title" maxlength="120" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="messageForm.content" type="textarea" :rows="5" maxlength="1200" show-word-limit /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="messageOpen=false">取消</el-button>
        <el-button type="primary" :loading="savingMsg" @click="sendMessage">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { ElButton, ElInput, ElMessage, ElOption, ElSelect } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { api, DEFAULT_INTERACTION_CONFIG } from '../api'

const DataToolbar = defineComponent({
  props: {
    kw: { type: String, default: '' },
    status: { type: String, default: '' },
    statusOptions: { type: Array, default: () => [] },
    withStatus: { type: Boolean, default: true },
  },
  emits: ['update:kw', 'update:status', 'search'],
  setup(props, { emit }) {
    return () => h('div', { class: 'actions' }, [
      h(ElInput, {
        modelValue: props.kw,
        clearable: true,
        placeholder: '关键词 / IP / 用户',
        style: 'width:220px',
        'onUpdate:modelValue': v => emit('update:kw', v),
        onKeyup: e => { if (e.key === 'Enter') emit('search') },
      }),
      props.withStatus ? h(ElSelect, {
        modelValue: props.status,
        style: 'width:130px',
        'onUpdate:modelValue': v => emit('update:status', v),
        onChange: () => emit('search'),
      }, () => [
        h(ElOption, { label: '全部状态', value: '' }),
        ...props.statusOptions.map(item => h(ElOption, { label: item.label, value: item.value })),
      ]) : null,
      h(ElButton, { onClick: () => emit('search') }, () => '查询'),
    ])
  },
})

const switchItems = [
  { key: 'commentsEnabled', label: '评论' },
  { key: 'commentRequireLogin', label: '评论需登录' },
  { key: 'ratingsEnabled', label: '评分' },
  { key: 'ratingRequireLogin', label: '评分需登录' },
  { key: 'requestsEnabled', label: '求片' },
  { key: 'requestRequireLogin', label: '求片需登录' },
  { key: 'reportsEnabled', label: '举报' },
  { key: 'reportRequireLogin', label: '举报需登录' },
  { key: 'messagesEnabled', label: '站内消息' },
  { key: 'danmakuEnabled', label: '弹幕' },
  { key: 'danmakuRequireLogin', label: '弹幕需登录' },
]
const commentStatuses = [{ label: '显示', value: 'visible' }, { label: '隐藏', value: 'hidden' }, { label: '删除', value: 'deleted' }]
const requestStatuses = [{ label: '待处理', value: 'pending' }, { label: '处理中', value: 'collecting' }, { label: '已完成', value: 'done' }, { label: '已拒绝', value: 'rejected' }]
const reportStatuses = [{ label: '待处理', value: 'pending' }, { label: '处理中', value: 'handling' }, { label: '已解决', value: 'resolved' }, { label: '已驳回', value: 'rejected' }]
const messageStatuses = [{ label: '已发送', value: 'sent' }, { label: '已归档', value: 'archived' }, { label: '草稿', value: 'draft' }]

const cfg = ref({ ...DEFAULT_INTERACTION_CONFIG })
const savingCfg = ref(false)
const tab = ref('comments')
const rows = ref([])
const total = ref(0)
const loading = ref(false)
const q = ref({
  comments: { page: 1, pageSize: 30, kw: '', status: '' },
  ratings: { page: 1, pageSize: 30, kw: '' },
  requests: { page: 1, pageSize: 30, kw: '', status: 'pending' },
  reports: { page: 1, pageSize: 30, kw: '', status: 'pending' },
  messages: { page: 1, pageSize: 30, kw: '', status: 'sent' },
  danmaku: { page: 1, pageSize: 30, kw: '', status: '' },
})
const activeQ = computed(() => q.value[tab.value])
const messageOpen = ref(false)
const savingMsg = ref(false)
const messageForm = ref({ recipientUserId: 0, title: '', content: '' })

function fmt(v) { return v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '—' }
function requestStatusText(v) { return ({ pending: '待处理', collecting: '处理中', done: '已完成', rejected: '已拒绝' })[v] || v || '—' }
function reportStatusText(v) { return ({ pending: '待处理', handling: '处理中', resolved: '已解决', rejected: '已驳回' })[v] || v || '—' }

async function loadConfig() {
  try { cfg.value = { ...DEFAULT_INTERACTION_CONFIG, ...(await api.interactionConfig()) } } catch {}
}
async function saveConfig() {
  savingCfg.value = true
  try {
    cfg.value = { ...DEFAULT_INTERACTION_CONFIG, ...(await api.updateInteractionConfig(cfg.value)) }
    ElMessage.success('互动开关已保存')
  } catch (e) { ElMessage.error(e.message || '保存失败') } finally { savingCfg.value = false }
}
async function loadWith(fn) {
  loading.value = true
  try {
    const r = await fn(activeQ.value)
    rows.value = r.list || []
    total.value = r.total || 0
  } catch (e) { ElMessage.error(e.message || '加载失败') } finally { loading.value = false }
}
const loadComments = () => loadWith(api.interactionComments)
const loadRatings = () => loadWith(api.interactionRatings)
const loadRequests = () => loadWith(api.interactionRequests)
const loadReports = () => loadWith(api.interactionReports)
const loadMessages = () => loadWith(api.interactionMessages)
const loadDanmaku = () => loadWith(api.interactionDanmaku)
function loadTab() {
  const map = { comments: loadComments, ratings: loadRatings, requests: loadRequests, reports: loadReports, messages: loadMessages, danmaku: loadDanmaku }
  return map[tab.value]?.()
}
async function updateRow(row, kind, status) {
  const map = {
    comments: api.updateInteractionComment,
    requests: api.updateInteractionRequest,
    reports: api.updateInteractionReport,
    messages: api.updateInteractionMessage,
    danmaku: api.updateInteractionDanmaku,
  }
  try {
    await map[kind](row.id, { status })
    ElMessage.success('已更新')
    await loadTab()
  } catch (e) { ElMessage.error(e.message || '更新失败') }
}
async function sendMessage() {
  savingMsg.value = true
  try {
    await api.createInteractionMessage({
      title: messageForm.value.title,
      content: messageForm.value.content,
      recipientUserId: Number(messageForm.value.recipientUserId) || null,
    })
    ElMessage.success('消息已发送')
    messageOpen.value = false
    messageForm.value = { recipientUserId: 0, title: '', content: '' }
    if (tab.value === 'messages') await loadMessages()
  } catch (e) { ElMessage.error(e.message || '发送失败') } finally { savingMsg.value = false }
}

onMounted(async () => {
  await Promise.all([loadConfig(), loadTab()])
})
</script>

<style scoped>
.interactions-wrap { display: flex; flex-direction: column; gap: 18px; }
.toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 14px; }
.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.muted { color: var(--text-3); font-size: 13px; margin: 6px 0 0; }
.switch-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.switch-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 42px; padding: 0 12px; border: 1px solid var(--border); border-radius: 8px; background: #fafbff; }
.switch-item span { color: var(--text-2); font-size: 13px; }
.pager { margin-top: 14px; display: flex; justify-content: flex-end; }
@media (max-width: 1180px) {
  .switch-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .toolbar { align-items: stretch; flex-direction: column; }
}
</style>
