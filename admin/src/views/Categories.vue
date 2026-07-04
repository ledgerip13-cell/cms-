<template>
  <el-row :gutter="16">
    <!-- 统一分类 -->
    <el-col :span="11">
      <div class="card">
        <div class="bar">
          <div class="sec-title">统一分类体系</div>
          <el-button type="primary" size="small" :icon="Plus" @click="openAdd">新增分类</el-button>
        </div>
        <el-table :data="cats" size="small">
          <el-table-column prop="sort" label="排序" width="60" />
          <el-table-column prop="name" label="分类名" min-width="100" />
          <el-table-column prop="count" label="影片数" width="70" />
          <el-table-column label="展示" width="92">
            <template #default="{ row }">
              <el-tag size="small" :type="accessTagType(row.displayMode)">{{ accessLabel(row.displayMode, 'display') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="观看" width="92">
            <template #default="{ row }">
              <el-tag size="small" :type="accessTagType(row.watchMode)">{{ accessLabel(row.watchMode, 'watch') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="前台显示" width="80">
            <template #default="{ row }">
              <el-switch v-model="row.enabled" @change="v => toggleEnabled(row, v)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="del(row)">删</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-col>

    <!-- 源分类映射 -->
    <el-col :span="13">
      <div class="card">
        <div class="bar">
          <div class="sec-title">源分类映射
            <el-tag v-if="unmapped" type="warning" size="small">{{ unmapped }} 项未映射</el-tag>
          </div>
          <el-select v-model="curSource" placeholder="选择源" size="small" style="width:160px" @change="loadMaps">
            <el-option v-for="s in sources" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </div>
        <el-table :data="maps" size="small" max-height="560">
          <el-table-column prop="sourceTypeId" label="源type" width="80" />
          <el-table-column prop="sourceTypeName" label="源分类名" />
          <el-table-column label="→ 映射到统一分类" width="200">
            <template #default="{ row }">
              <el-select v-model="row.categoryId" placeholder="未映射" clearable size="small"
                style="width:170px" @change="v => save(row, v)">
                <el-option v-for="c in cats" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-col>
  </el-row>

  <el-dialog v-model="dlg" :title="form.id ? '编辑分类' : '新增分类'" width="560">
    <el-form :model="form" label-width="90px">
      <el-form-item label="分类名"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="标识"><el-input v-model="form.slug" placeholder="英文，可选" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="form.sort" :min="1" :max="999" /></el-form-item>
      <el-form-item label="前台显示"><el-switch v-model="form.enabled" /></el-form-item>
      <el-form-item label="展示权限">
        <el-select v-model="form.displayMode" style="width:220px">
          <el-option v-for="m in displayModes" :key="m.value" :label="m.label" :value="m.value" />
        </el-select>
        <span class="hint">控制首页、列表、搜索、推荐是否出现</span>
      </el-form-item>
      <el-form-item v-if="needsGroupMode(form.displayMode)" label="展示分组">
        <el-select v-model="form.displayGroupIds" multiple filterable collapse-tags collapse-tags-tooltip style="width:360px">
          <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="观看权限">
        <el-select v-model="form.watchMode" :disabled="displayClosed(form)" style="width:220px">
          <el-option v-for="m in watchModes" :key="m.value" :label="m.label" :value="m.value" />
        </el-select>
        <span class="hint">{{ displayClosed(form) ? '隐藏或关闭时不可观看' : '只会在展示权限基础上继续收紧' }}</span>
      </el-form-item>
      <el-form-item v-if="!displayClosed(form) && needsGroupMode(form.watchMode)" label="观看分组">
        <el-select v-model="form.watchGroupIds" multiple filterable collapse-tags collapse-tags-tooltip style="width:360px">
          <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer><el-button @click="dlg=false">取消</el-button><el-button type="primary" @click="saveCat">保存</el-button></template>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'

const cats = ref([]); const sources = ref([]); const maps = ref([]); const groups = ref([])
const curSource = ref(null); const unmapped = ref(0)
const dlg = ref(false); const form = ref({})
const displayModes = [
  { value: 'public', label: '游客可见' },
  { value: 'login', label: '登录可见' },
  { value: 'vip', label: 'VIP权益可见' },
  { value: 'group', label: '指定分组可见' },
  { value: 'vip_or_group', label: 'VIP或指定分组可见' },
  { value: 'hidden', label: '隐藏' },
]
const watchModes = [
  { value: 'inherit', label: '跟随展示权限' },
  { value: 'login', label: '登录可观看' },
  { value: 'vip', label: 'VIP权益可观看' },
  { value: 'group', label: '指定分组可观看' },
  { value: 'vip_or_group', label: 'VIP或指定分组可观看' },
]

function parseIds(value) {
  try {
    const arr = Array.isArray(value) ? value : JSON.parse(value || '[]')
    return Array.isArray(arr) ? arr.map(Number).filter(Boolean) : []
  } catch { return [] }
}
function normalizeCat(row) {
  return {
    ...row,
    enabled: row.enabled !== false,
    displayMode: row.displayMode || 'public',
    displayGroupIds: parseIds(row.displayGroupIds),
    watchMode: row.watchMode === 'public' ? 'inherit' : (row.watchMode || 'inherit'),
    watchGroupIds: parseIds(row.watchGroupIds),
  }
}
async function loadCats() { cats.value = (await api.adminCategories()).map(normalizeCat) }
const accessLabel = (mode, kind) => {
  const rows = kind === 'display' ? displayModes : watchModes
  const normalized = kind === 'watch' && mode === 'public' ? 'inherit' : mode
  return rows.find(m => m.value === normalized)?.label || '游客'
}
const accessTagType = (mode) => ({ inherit: 'success', public: 'success', login: 'primary', vip: 'warning', group: 'danger', vip_or_group: 'warning', hidden: 'info' }[mode] || 'success')
function needsGroupMode(mode) { return ['group', 'vip_or_group'].includes(mode) }
function displayClosed(row) { return row?.enabled === false || row?.displayMode === 'hidden' }
async function toggleEnabled(row, v) {
  try {
    await api.updateCategory(row.id, { enabled: v })
    ElMessage.success(v ? '已在前台显示' : '已在前台隐藏')
  } catch (e) { row.enabled = !v; ElMessage.error(e.message) }
}
async function loadMaps() { if (curSource.value) maps.value = await api.typemaps(curSource.value) }
async function loadUnmapped() { unmapped.value = (await api.unmappedCount()).unmapped }

function openAdd() { form.value = { name:'', slug:'', sort:100, enabled:true, displayMode:'public', displayGroupIds:[], watchMode:'inherit', watchGroupIds:[] }; dlg.value = true }
function openEdit(row) { form.value = normalizeCat(row); dlg.value = true }
async function saveCat() {
  try {
    if (displayClosed(form.value)) {
      form.value.watchMode = 'inherit'
      form.value.watchGroupIds = []
    }
    const r = form.value.id ? await api.updateCategory(form.value.id, form.value) : await api.addCategory(form.value)
    ElMessage.success(r?.backfilled ? `已保存，已回刷 ${r.backfilled} 部影片` : '已保存')
    dlg.value = false; loadCats()
  } catch (e) { ElMessage.error(e.message) }
}
async function del(row) {
  await ElMessageBox.confirm(`删除分类「${row.name}」?`, '确认', { type:'warning' })
  await api.delCategory(row.id); ElMessage.success('已删除'); loadCats()
}
async function save(row, v) {
  const r = await api.setTypemap(row.id, v ?? null)
  ElMessage.success(r?.backfilled ? `映射已更新，已回刷 ${r.backfilled} 部影片` : '映射已更新')
  loadUnmapped()
  loadCats()
}
onMounted(async () => {
  await loadCats()
  const [sourceRows, groupRows] = await Promise.all([api.sources(), api.memberGroups()])
  sources.value = sourceRows
  groups.value = groupRows.filter(g => g.enabled !== false)
  if (sources.value.length) { curSource.value = sources.value[0].id; loadMaps() }
  loadUnmapped()
})
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.sec-title { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.hint { margin-left: 10px; color: #9aa4b2; font-size: 12px; }
</style>
