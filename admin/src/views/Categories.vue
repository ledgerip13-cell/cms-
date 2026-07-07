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
          <el-table-column label="分类" min-width="130">
            <template #default="{ row }">
              <div class="cat-cell">
                <span class="cat-icon" v-html="categoryIconSvg(row.icon, row.name)"></span>
                <span>{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
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
        <div class="batch-map-bar">
          <el-button size="small" plain @click="selectUnmapped">选中未映射</el-button>
          <el-select v-model="batchCategoryId" placeholder="批量映射到" clearable filterable size="small" style="width:180px">
            <el-option v-for="c in cats" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-button size="small" type="primary" :disabled="!selectedMaps.length || !batchCategoryId" :loading="batchSaving" @click="batchMap">
            映射选中 {{ selectedMaps.length || '' }}
          </el-button>
          <el-button size="small" type="warning" plain :disabled="!selectedMaps.length" :loading="batchSaving" @click="batchClear">
            清空选中映射
          </el-button>
        </div>
        <el-table ref="mapTableRef" :data="maps" size="small" max-height="560" row-key="id" @selection-change="selectedMaps = $event">
          <el-table-column type="selection" width="42" />
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
          <el-table-column label="操作" width="60">
            <template #default="{ row }">
              <el-button size="small" type="danger" link @click="delMap(row)">删</el-button>
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
      <el-form-item label="图标">
        <div class="icon-picker">
          <div class="icon-field">
            <el-select v-model="form.icon" clearable filterable placeholder="自动匹配" style="width:240px">
              <el-option v-for="icon in categoryIconOptions" :key="icon.value" :label="icon.label" :value="icon.value">
                <span class="icon-option">
                  <span class="cat-icon" v-html="categoryIconSvg(icon.value)"></span>
                  <span>{{ icon.label }}</span>
                </span>
              </el-option>
            </el-select>
            <span class="icon-preview" v-html="categoryIconSvg(form.icon, form.name)"></span>
          </div>
          <div class="custom-icon-row">
            <el-input v-model="customSvgInput" type="textarea" :rows="3" placeholder="粘贴 iconfont SVG 代码" />
            <div class="custom-icon-actions">
              <el-button size="small" type="primary" plain @click="applyCustomIcon">新增SVG</el-button>
              <el-button v-if="isCustomIcon(form.icon)" size="small" @click="clearCustomIcon">清除自定义</el-button>
            </div>
          </div>
        </div>
      </el-form-item>
      <el-form-item label="排序"><el-input-number v-model="form.sort" :min="1" :max="999" /></el-form-item>
      <el-form-item label="前台显示"><el-switch v-model="form.enabled" /></el-form-item>
      <el-form-item label="展示权限">
        <el-select v-model="form.displayMode" style="width:220px">
          <el-option v-for="m in displayModes" :key="m.value" :label="m.label" :value="m.value" />
        </el-select>
        <span class="hint">控制首页、列表、搜索、推荐是否出现</span>
      </el-form-item>
      <el-form-item v-if="needsLevelMode(form.displayMode)" label="展示等级">
        <el-select v-model="form.displayLevelIds" multiple filterable collapse-tags collapse-tags-tooltip style="width:360px">
          <el-option v-for="level in levels" :key="level.id" :label="level.name" :value="level.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="观看权限">
        <el-select v-model="form.watchMode" :disabled="displayClosed(form)" style="width:220px">
          <el-option v-for="m in watchModes" :key="m.value" :label="m.label" :value="m.value" />
        </el-select>
        <span class="hint">{{ displayClosed(form) ? '隐藏或关闭时不可观看' : '只会在展示权限基础上继续收紧' }}</span>
      </el-form-item>
      <el-form-item v-if="!displayClosed(form) && needsLevelMode(form.watchMode)" label="观看等级">
        <el-select v-model="form.watchLevelIds" multiple filterable collapse-tags collapse-tags-tooltip style="width:360px">
          <el-option v-for="level in levels" :key="level.id" :label="level.name" :value="level.id" />
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
import { categoryIconOptions, categoryIconSvg, decodeCustomSvgIcon, encodeCustomSvgIcon, isCustomIcon, normalizeCategoryIcon } from '../categoryIcons'

const cats = ref([]); const sources = ref([]); const maps = ref([]); const levels = ref([])
const curSource = ref(null); const unmapped = ref(0)
const dlg = ref(false); const form = ref({})
const customSvgInput = ref('')
const mapTableRef = ref(null)
const selectedMaps = ref([])
const batchCategoryId = ref(null)
const batchSaving = ref(false)
const displayModes = [
  { value: 'public', label: '游客可见' },
  { value: 'login', label: '登录可见' },
  { value: 'vip', label: '任意VIP等级可见' },
  { value: 'level', label: '指定会员等级可见' },
  { value: 'hidden', label: '隐藏' },
]
const watchModes = [
  { value: 'inherit', label: '跟随展示权限' },
  { value: 'login', label: '登录可观看' },
  { value: 'vip', label: '任意VIP等级可观看' },
  { value: 'level', label: '指定会员等级可观看' },
]

function parseIds(value) {
  try {
    const arr = Array.isArray(value) ? value : JSON.parse(value || '[]')
    return Array.isArray(arr) ? arr.map(Number).filter(Boolean) : []
  } catch { return [] }
}
function normalizeCat(row) {
  const displayMode = row.displayMode === 'group' ? 'level' : (row.displayMode === 'vip_or_group' ? 'vip_or_level' : row.displayMode)
  const watchMode = row.watchMode === 'group' ? 'level' : (row.watchMode === 'vip_or_group' ? 'vip_or_level' : row.watchMode)
  const displayLevelIds = normalizeLevelSelection(displayMode, parseIds(row.displayLevelIds ?? row.displayGroupIds))
  const watchLevelIds = normalizeLevelSelection(watchMode, parseIds(row.watchLevelIds ?? row.watchGroupIds))
  return {
    ...row,
    icon: normalizeCategoryIcon(row.icon, row.name),
    enabled: row.enabled !== false,
    displayMode: normalizeAdminAccessMode(displayMode, 'public'),
    displayLevelIds,
    watchMode: watchMode === 'public' ? 'inherit' : normalizeAdminAccessMode(watchMode, 'inherit'),
    watchLevelIds,
  }
}
async function loadCats() { cats.value = (await api.adminCategories()).map(normalizeCat) }
const accessLabel = (mode, kind) => {
  const rows = kind === 'display' ? displayModes : watchModes
  const normalized = kind === 'watch' && mode === 'public' ? 'inherit' : normalizeAdminAccessMode(mode, kind === 'display' ? 'public' : 'inherit')
  return rows.find(m => m.value === normalized)?.label || '游客'
}
const accessTagType = (mode) => ({ inherit: 'success', public: 'success', login: 'primary', vip: 'warning', level: 'danger', vip_or_level: 'danger', hidden: 'info' }[normalizeAdminAccessMode(mode, mode)] || 'success')
function normalizeAdminAccessMode(mode, fallback) {
  if (mode === 'group' || mode === 'vip_or_group' || mode === 'vip_or_level') return 'level'
  return ['inherit', 'public', 'login', 'vip', 'level', 'hidden'].includes(mode) ? mode : fallback
}
function normalizeLevelSelection(mode, ids) {
  if (mode !== 'vip_or_level' && mode !== 'vip_or_group') return ids
  const vipIds = levels.value.filter(level => level.enabled !== false && level.isVip).map(level => level.id)
  return [...new Set([...ids, ...vipIds])]
}
function needsLevelMode(mode) { return normalizeAdminAccessMode(mode, mode) === 'level' }
function displayClosed(row) { return row?.enabled === false || row?.displayMode === 'hidden' }
async function toggleEnabled(row, v) {
  try {
    await api.updateCategory(row.id, { enabled: v })
    ElMessage.success(v ? '已在前台显示' : '已在前台隐藏')
  } catch (e) { row.enabled = !v; ElMessage.error(e.message) }
}
async function loadMaps() {
  selectedMaps.value = []
  mapTableRef.value?.clearSelection?.()
  if (curSource.value) maps.value = await api.typemaps(curSource.value)
}
async function loadUnmapped() { unmapped.value = (await api.unmappedCount()).unmapped }
function selectUnmapped() {
  mapTableRef.value?.clearSelection?.()
  for (const row of maps.value.filter(row => !row.categoryId)) mapTableRef.value?.toggleRowSelection?.(row, true)
}

function openAdd() {
  customSvgInput.value = ''
  form.value = { name:'', slug:'', icon:'', sort:100, enabled:true, displayMode:'public', displayLevelIds:[], watchMode:'inherit', watchLevelIds:[] }
  dlg.value = true
}
function openEdit(row) {
  form.value = normalizeCat(row)
  customSvgInput.value = isCustomIcon(form.value.icon) ? decodeCustomSvgIcon(form.value.icon) : ''
  dlg.value = true
}
function applyCustomIcon() {
  const icon = encodeCustomSvgIcon(customSvgInput.value)
  if (!icon) {
    ElMessage.warning('SVG无效，仅支持 path/rect/circle/line/polyline/polygon 等基础元素')
    return
  }
  form.value.icon = icon
  ElMessage.success('SVG图标已应用')
}
function clearCustomIcon() {
  form.value.icon = ''
  customSvgInput.value = ''
}
async function saveCat() {
  try {
    const payload = { ...form.value }
    if (!needsLevelMode(payload.displayMode)) payload.displayLevelIds = []
    if (!needsLevelMode(payload.watchMode)) payload.watchLevelIds = []
    if (displayClosed(payload)) {
      payload.watchMode = 'inherit'
      payload.watchLevelIds = []
    }
    const r = payload.id ? await api.updateCategory(payload.id, payload) : await api.addCategory(payload)
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
async function batchMap() {
  if (!selectedMaps.value.length || !batchCategoryId.value) return
  batchSaving.value = true
  try {
    const r = await api.batchTypemaps(selectedMaps.value.map(row => row.id), batchCategoryId.value)
    ElMessage.success(`已批量映射 ${r.updated} 项，回刷 ${r.backfilled || 0} 部影片`)
    await Promise.all([loadMaps(), loadUnmapped(), loadCats()])
  } catch (e) {
    ElMessage.error(e.message || '批量映射失败')
  } finally {
    batchSaving.value = false
  }
}
async function batchClear() {
  if (!selectedMaps.value.length) return
  const ok = await ElMessageBox.confirm(`确认清空选中的 ${selectedMaps.value.length} 项映射？`, '批量清空映射', { type:'warning' })
    .then(() => true).catch(() => false)
  if (!ok) return
  batchSaving.value = true
  try {
    const r = await api.batchTypemaps(selectedMaps.value.map(row => row.id), null)
    ElMessage.success(`已清空 ${r.updated} 项映射，回刷 ${r.backfilled || 0} 部影片`)
    await Promise.all([loadMaps(), loadUnmapped(), loadCats()])
  } catch (e) {
    ElMessage.error(e.message || '批量清空失败')
  } finally {
    batchSaving.value = false
  }
}
async function delMap(row) {
  await ElMessageBox.confirm(`删除源分类「${row.sourceTypeName || row.sourceTypeId}」？若该分类仍在采集范围内，下次采集会重新生成。`, '确认删除', { type:'warning' })
  await api.delTypemap(row.id); ElMessage.success('已删除'); loadMaps(); loadUnmapped()
}
onMounted(async () => {
  const [sourceRows, levelRows] = await Promise.all([api.sources(), api.vipLevels()])
  sources.value = sourceRows
  levels.value = levelRows.filter(level => level.enabled !== false)
  await loadCats()
  if (sources.value.length) { curSource.value = sources.value[0].id; loadMaps() }
  loadUnmapped()
})
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.batch-map-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: -2px 0 12px; }
.sec-title { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.hint { margin-left: 10px; color: #9aa4b2; font-size: 12px; }
.cat-cell, .icon-option, .icon-field { display: flex; align-items: center; gap: 8px; }
.icon-picker { width: 100%; display: flex; flex-direction: column; gap: 10px; }
.custom-icon-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: start; }
.custom-icon-actions { display: flex; flex-direction: column; gap: 8px; }
.cat-icon, .icon-preview { display: inline-flex; align-items: center; justify-content: center; color: var(--text-2); }
.cat-icon :deep(svg), .icon-preview :deep(svg) { width: 18px; height: 18px; display: block; }
.icon-preview { width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 8px; color: var(--text-1); }
</style>
