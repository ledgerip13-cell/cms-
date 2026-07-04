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

      <el-tab-pane label="VIP设置" name="levels">
        <div class="card">
          <div class="toolbar">
            <div class="sec-title">VIP等级</div>
            <div class="actions">
              <el-button :icon="Refresh" @click="load">刷新</el-button>
              <el-button type="primary" :icon="Plus" @click="openLevelCreate">新增VIP等级</el-button>
            </div>
          </div>
          <el-table :data="levels" height="520">
            <el-table-column label="等级" width="190">
              <template #default="{row}">
                <div class="level-name">
                  <el-tag class="level-preview-tag" :style="levelTagStyle(row)" effect="plain">{{ row.name }}</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="权益" width="110">
              <template #default="{row}">
                <el-tag :type="row.isVip ? 'warning' : 'info'" effect="plain">{{ row.isVip ? 'VIP' : '普通' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" />
            <el-table-column prop="sort" label="排序" width="90" />
            <el-table-column label="成员数" width="100">
              <template #default="{row}">{{ row._count?.users || 0 }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{row}"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template>
            </el-table-column>
            <el-table-column label="操作" width="240">
              <template #default="{row}">
                <el-button size="small" :icon="EditPen" @click="openLevelEdit(row)">编辑</el-button>
                <el-button size="small" :disabled="row.isDefault" @click="toggleLevel(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
                <el-button size="small" type="danger" plain :icon="Delete" :disabled="row.isDefault || row._count?.users > 0" @click="deleteLevel(row)">删除</el-button>
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

    <el-dialog v-model="levelDialogOpen" :title="levelDialogTitle" width="520px" destroy-on-close @closed="resetLevelDialog">
      <el-form ref="levelFormRef" :model="levelForm" :rules="levelRules" label-width="92px">
        <el-form-item label="等级名称" prop="name"><el-input v-model="levelForm.name" maxlength="40" /></el-form-item>
        <el-form-item label="权益类型">
          <el-radio-group v-model="levelForm.isVip" :disabled="levelForm.isDefault">
            <el-radio-button :label="false">普通会员</el-radio-button>
            <el-radio-button :label="true">VIP会员</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="标签颜色">
          <div class="color-field">
            <el-color-picker v-model="levelForm.tagColor" color-format="hex" :predefine="tagColorPresets" />
            <el-tag class="level-preview-tag" :style="levelTagStyle(levelForm)" effect="plain">{{ levelForm.name || 'VIP等级' }}</el-tag>
          </div>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="levelForm.sort" :min="0" :max="999" /></el-form-item>
        <el-form-item label="状态"><el-switch v-model="levelForm.enabled" :disabled="levelForm.isDefault" active-text="启用" inactive-text="停用" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="levelForm.remark" type="textarea" :rows="3" maxlength="100" show-word-limit /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="levelDialogOpen=false">取消</el-button>
        <el-button type="primary" :loading="savingLevel" @click="saveLevel">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Delete, EditPen, Plus, Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import { DEFAULT_LEVEL_TAG_COLOR, LEVEL_TAG_COLOR_PRESETS, levelTagStyle } from '../levelTag'

const tab = ref('invites')
const invites = ref([])
const levels = ref([])
const logs = ref([])
const inviteForm = ref({ count: 10, maxUses: 1, remark: '' })
const levelDialogOpen = ref(false)
const levelDialogMode = ref('create')
const levelFormRef = ref(null)
const savingLevel = ref(false)
const levelForm = ref(defaultLevelForm())
const levelDialogTitle = computed(() => levelDialogMode.value === 'create' ? '新增VIP等级' : '编辑VIP等级')
const tagColorPresets = LEVEL_TAG_COLOR_PRESETS
const levelRules = {
  name: [{ required: true, message: '请输入等级名称', trigger: 'blur' }],
}

function defaultLevelForm() {
  return { id: null, name: '', tagColor: DEFAULT_LEVEL_TAG_COLOR, sort: 100, isVip: true, enabled: true, remark: '', isDefault: false }
}

async function load() {
  const [is, lv, ls] = await Promise.all([api.invites(), api.vipLevels(), api.auditLogs(100)])
  invites.value = is
  levels.value = lv
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
function openLevelCreate() {
  levelDialogMode.value = 'create'
  levelForm.value = defaultLevelForm()
  levelDialogOpen.value = true
}
function openLevelEdit(row) {
  levelDialogMode.value = 'edit'
  levelForm.value = {
    id: row.id,
    name: row.name,
    sort: row.sort ?? 100,
    tagColor: row.tagColor || DEFAULT_LEVEL_TAG_COLOR,
    isVip: Boolean(row.isVip),
    enabled: row.enabled !== false,
    remark: row.remark || '',
    isDefault: Boolean(row.isDefault),
  }
  levelDialogOpen.value = true
}
function resetLevelDialog() {
  levelFormRef.value?.clearValidate?.()
  levelForm.value = defaultLevelForm()
  savingLevel.value = false
}
async function saveLevel() {
  const valid = await levelFormRef.value?.validate?.().catch(() => false)
  if (!valid) return
  savingLevel.value = true
  try {
    const payload = {
      name: levelForm.value.name,
      tagColor: levelForm.value.tagColor,
      sort: levelForm.value.sort,
      isVip: levelForm.value.isVip,
      enabled: levelForm.value.enabled,
      remark: levelForm.value.remark,
    }
    if (levelDialogMode.value === 'create') await api.createVipLevel(payload)
    else await api.updateVipLevel(levelForm.value.id, payload)
    ElMessage.success(levelDialogMode.value === 'create' ? '等级已新增' : '等级已保存')
    levelDialogOpen.value = false
    await load()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    savingLevel.value = false
  }
}
async function toggleLevel(row) {
  await api.updateVipLevel(row.id, { enabled: !row.enabled })
  load()
}
async function deleteLevel(row) {
  const ok = await ElMessageBox.confirm(`确认删除VIP等级「${row.name}」？`, '删除VIP等级', { type: 'warning' })
    .then(() => true).catch(() => false)
  if (!ok) return
  await api.deleteVipLevel(row.id)
  ElMessage.success('等级已删除')
  load()
}
onMounted(load)
</script>

<style scoped>
.access-page { display: flex; flex-direction: column; gap: 16px; }
.actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.toolbar { gap: 12px; }
.toolbar .sec-title { white-space: nowrap; }
.level-name { display: flex; flex-direction: column; gap: 4px; }
.color-field { display: flex; align-items: center; gap: 12px; }
.level-preview-tag { border-radius: 7px; font-weight: 800; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
:deep(.el-dialog__body) { padding-top: 12px; }
</style>
