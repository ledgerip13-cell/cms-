<template>
  <div class="access-page">
    <el-tabs v-model="tab">
      <el-tab-pane label="邀请码池" name="invites">
        <div class="card">
          <div class="toolbar">
            <div class="sec-title">邀请码池</div>
            <div class="actions">
              <el-input-number v-model="inviteForm.count" :min="1" :max="200" size="small" />
              <el-input-number v-model="inviteForm.maxUses" :min="1" :max="9999" size="small" />
              <el-input v-model="inviteForm.remark" placeholder="备注" size="small" style="width:180px" />
              <el-button type="primary" @click="createInvites">生成</el-button>
            </div>
          </div>
          <el-table :data="invites" height="520">
            <el-table-column prop="code" label="邀请码" width="150" />
            <el-table-column prop="remark" label="备注" />
            <el-table-column label="使用" width="100">
              <template #default="{row}">{{ row.usedCount }} / {{ row.maxUses }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{row}"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template>
            </el-table-column>
            <el-table-column label="使用者" width="140">
              <template #default="{row}">{{ row.usedBy?.username || '-' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="180">
              <template #default="{row}">
                <el-button size="small" @click="toggleInvite(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
                <el-button size="small" type="danger" plain @click="deleteInvite(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="用户分组" name="groups">
        <div class="card">
          <div class="toolbar">
            <div class="sec-title">用户分组</div>
            <div class="actions">
              <el-input v-model="groupForm.name" placeholder="分组名称" size="small" style="width:160px" />
              <el-input v-model="groupForm.remark" placeholder="备注" size="small" style="width:220px" />
              <el-button type="primary" @click="createGroup">新增分组</el-button>
            </div>
          </div>
          <el-table :data="groups" height="520">
            <el-table-column prop="name" label="分组名称" width="180" />
            <el-table-column prop="remark" label="备注" />
            <el-table-column label="成员数" width="100">
              <template #default="{row}">{{ row._count?.members || 0 }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{row}"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{row}">
                <el-button size="small" @click="toggleGroup(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="操作审计" name="audit">
        <div class="card">
          <div class="toolbar">
            <div class="sec-title">操作审计</div>
            <el-button @click="load">刷新</el-button>
          </div>
          <el-table :data="logs" height="560">
            <el-table-column prop="createdAt" label="时间" width="190" />
            <el-table-column prop="actor" label="操作人" width="120" />
            <el-table-column prop="action" label="动作" width="160" />
            <el-table-column prop="target" label="对象" width="180" />
            <el-table-column prop="detail" label="详情" show-overflow-tooltip />
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'

const tab = ref('invites')
const invites = ref([])
const groups = ref([])
const logs = ref([])
const inviteForm = ref({ count: 10, maxUses: 1, remark: '' })
const groupForm = ref({ name: '', remark: '' })

async function load() {
  const [is, gs, ls] = await Promise.all([api.invites(), api.memberGroups(), api.auditLogs(100)])
  invites.value = is
  groups.value = gs
  logs.value = ls
}
async function createInvites() {
  await api.createInvites(inviteForm.value)
  ElMessage.success('邀请码已生成')
  inviteForm.value.remark = ''
  load()
}
async function toggleInvite(row) {
  await api.updateInvite(row.id, { enabled: !row.enabled })
  load()
}
async function deleteInvite(row) {
  const ok = await ElMessageBox.confirm(`确认删除邀请码「${row.code}」？已使用的邀请码会自动改为停用。`, '删除邀请码', { type: 'warning' })
    .then(() => true).catch(() => false)
  if (!ok) return
  await api.deleteInvite(row.id)
  ElMessage.success('已处理')
  load()
}
async function createGroup() {
  if (!groupForm.value.name.trim()) return ElMessage.warning('请输入分组名称')
  await api.createMemberGroup(groupForm.value)
  ElMessage.success('分组已新增')
  groupForm.value = { name: '', remark: '' }
  load()
}
async function toggleGroup(row) {
  await api.updateMemberGroup(row.id, { enabled: !row.enabled })
  load()
}
onMounted(load)
</script>

<style scoped>
.access-page { display: flex; flex-direction: column; gap: 16px; }
.actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.toolbar { gap: 12px; }
</style>
