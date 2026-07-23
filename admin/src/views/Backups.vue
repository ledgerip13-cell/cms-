<template>
  <div class="backup-page">
    <div class="backup-grid">
      <div class="card backup-create">
        <div class="toolbar">
          <div>
            <div class="sec-title">创建备份</div>
            <div class="hint">导出文件仅保存在服务端备份目录，可下载到本地归档。</div>
          </div>
        </div>

        <el-form label-width="88px">
          <el-form-item label="备份类型">
            <el-segmented v-model="form.kind" :options="kindOptions" />
          </el-form-item>
          <el-form-item v-if="form.kind === 'selective'" label="数据包">
            <el-checkbox-group v-model="form.packages" class="pkg-group">
              <el-checkbox v-for="item in packages" :key="item.key" :label="item.key" border>
                <strong>{{ item.label }}</strong>
                <span>{{ item.description }}</span>
              </el-checkbox>
            </el-checkbox-group>
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model.trim="form.remark" type="textarea" :rows="3" maxlength="300" show-word-limit placeholder="可写用途、改动前后、来源说明" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="creating" :icon="Download" @click="createBackup">开始备份</el-button>
            <el-button :icon="Refresh" @click="load">刷新列表</el-button>
          </el-form-item>
        </el-form>

        <el-alert type="warning" :closable="false" show-icon>
          <template #title>选择性备份默认不导出用户、日志、观看历史、收藏、评论、评分、风控、token/session 类敏感数据。</template>
        </el-alert>
      </div>

      <div class="card">
        <div class="toolbar">
          <div>
            <div class="sec-title">备份文件</div>
            <div class="hint">{{ backupDir || '—' }}</div>
          </div>
          <div class="actions">
            <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
          </div>
        </div>

        <el-table :data="list" v-loading="loading" row-key="filename" empty-text="暂无备份">
          <el-table-column label="文件" min-width="230" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="file-cell">
                <strong>{{ row.filename }}</strong>
                <span>{{ formatSize(row.size) }} · {{ formatTime(row.createdAt) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="110">
            <template #default="{ row }">
              <el-tag :type="row.kind === 'full' ? 'success' : 'primary'">{{ row.kind === 'full' ? '全量' : '选择性' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="数据包" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ packageText(row) }}</template>
          </el-table-column>
          <el-table-column label="备注" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" plain :icon="Download" @click="download(row)">下载</el-button>
              <el-button size="small" plain :icon="EditPen" @click="editRemark(row)">备注</el-button>
              <el-button size="small" type="danger" plain :icon="Delete" @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <el-dialog v-model="remarkDlg" title="编辑备份备注" width="460">
      <el-input v-model.trim="remarkText" type="textarea" :rows="4" maxlength="300" show-word-limit />
      <template #footer>
        <el-button @click="remarkDlg = false">取消</el-button>
        <el-button type="primary" :loading="savingRemark" @click="saveRemark">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Delete, Download, EditPen, Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'

const kindOptions = [
  { label: '全量备份', value: 'full' },
  { label: '选择性备份', value: 'selective' },
]
const form = ref({ kind: 'full', packages: [], remark: '' })
const packages = ref([])
const list = ref([])
const backupDir = ref('')
const loading = ref(false)
const creating = ref(false)
const remarkDlg = ref(false)
const remarkText = ref('')
const remarkRow = ref(null)
const savingRemark = ref(false)

function formatSize(bytes) {
  const n = Number(bytes) || 0
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—'
}

function packageText(row) {
  if (row.kind === 'full') return '全库结构 + 数据'
  const labels = Array.isArray(row.packageLabels) ? row.packageLabels : []
  return labels.length ? labels.join(' / ') : '—'
}

async function loadPackages() {
  const res = await api.backupPackages()
  packages.value = Array.isArray(res.packages) ? res.packages : []
}

async function load() {
  loading.value = true
  try {
    const res = await api.backups()
    list.value = Array.isArray(res.list) ? res.list : []
    backupDir.value = res.dir || ''
  } finally {
    loading.value = false
  }
}

async function createBackup() {
  if (form.value.kind === 'selective' && !form.value.packages.length) {
    ElMessage.warning('请选择至少一个数据包')
    return
  }
  const label = form.value.kind === 'full' ? '全量备份' : '选择性备份'
  await ElMessageBox.confirm(`确认创建${label}？备份期间数据库会被读取，可能持续数十秒。`, '创建备份', { type: 'warning' })
  creating.value = true
  try {
    const res = await api.createBackup(form.value)
    ElMessage.success(`备份完成：${res.backup?.filename || ''}`)
    form.value.remark = ''
    await load()
  } finally {
    creating.value = false
  }
}

async function download(row) {
  const blob = await api.downloadBackup(row.filename)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = row.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function editRemark(row) {
  remarkRow.value = row
  remarkText.value = row.remark || ''
  remarkDlg.value = true
}

async function saveRemark() {
  if (!remarkRow.value?.filename) return
  savingRemark.value = true
  try {
    await api.updateBackup(remarkRow.value.filename, { remark: remarkText.value })
    ElMessage.success('备注已保存')
    remarkDlg.value = false
    await load()
  } finally {
    savingRemark.value = false
  }
}

async function remove(row) {
  await ElMessageBox.confirm(`确认删除备份文件 ${row.filename}？`, '删除备份', { type: 'warning' })
  await api.deleteBackup(row.filename)
  ElMessage.success('已删除')
  await load()
}

onMounted(async () => {
  await Promise.all([loadPackages(), load()])
})
</script>

<style scoped>
.backup-page { display: flex; flex-direction: column; gap: 16px; }
.backup-grid { display: grid; grid-template-columns: minmax(320px, 420px) minmax(0, 1fr); gap: 16px; align-items: start; }
.backup-create { position: sticky; top: 18px; }
.toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.actions { display: flex; gap: 8px; align-items: center; }
.hint { color: #8b95a7; font-size: 12px; margin-top: 4px; word-break: break-all; }
.pkg-group { display: grid; grid-template-columns: 1fr; gap: 8px; width: 100%; }
.pkg-group :deep(.el-checkbox) { height: auto; padding: 10px 12px; margin: 0; align-items: flex-start; }
.pkg-group :deep(.el-checkbox__label) { display: flex; flex-direction: column; gap: 3px; line-height: 1.35; white-space: normal; }
.pkg-group span { color: #8b95a7; font-size: 12px; }
.file-cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.file-cell strong { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.file-cell span { color: #8b95a7; font-size: 12px; }
@media (max-width: 1100px) {
  .backup-grid { grid-template-columns: 1fr; }
  .backup-create { position: static; }
}
</style>
