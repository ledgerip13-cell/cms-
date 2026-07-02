<template>
  <el-row :gutter="16">
    <!-- 统一分类 -->
    <el-col :span="9">
      <div class="card">
        <div class="bar">
          <div class="sec-title">统一分类体系</div>
          <el-button type="primary" size="small" :icon="Plus" @click="openAdd">新增分类</el-button>
        </div>
        <el-table :data="cats" size="small">
          <el-table-column prop="sort" label="排序" width="60" />
          <el-table-column prop="name" label="分类名" />
          <el-table-column prop="count" label="影片数" width="70" />
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
    <el-col :span="15">
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

  <el-dialog v-model="dlg" :title="form.id ? '编辑分类' : '新增分类'" width="420">
    <el-form :model="form" label-width="70px">
      <el-form-item label="分类名"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="标识"><el-input v-model="form.slug" placeholder="英文，可选" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="form.sort" :min="1" :max="999" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="dlg=false">取消</el-button><el-button type="primary" @click="saveCat">保存</el-button></template>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'

const cats = ref([]); const sources = ref([]); const maps = ref([])
const curSource = ref(null); const unmapped = ref(0)
const dlg = ref(false); const form = ref({})

async function loadCats() { cats.value = await api.adminCategories() }
async function toggleEnabled(row, v) {
  try {
    await api.updateCategory(row.id, { enabled: v })
    ElMessage.success(v ? '已在前台显示' : '已在前台隐藏')
  } catch (e) { row.enabled = !v; ElMessage.error(e.message) }
}
async function loadMaps() { if (curSource.value) maps.value = await api.typemaps(curSource.value) }
async function loadUnmapped() { unmapped.value = (await api.unmappedCount()).unmapped }

function openAdd() { form.value = { name:'', slug:'', sort:100 }; dlg.value = true }
function openEdit(row) { form.value = { ...row }; dlg.value = true }
async function saveCat() {
  try {
    if (form.value.id) await api.updateCategory(form.value.id, form.value)
    else await api.addCategory(form.value)
    ElMessage.success('已保存'); dlg.value = false; loadCats()
  } catch (e) { ElMessage.error(e.message) }
}
async function del(row) {
  await ElMessageBox.confirm(`删除分类「${row.name}」?`, '确认', { type:'warning' })
  await api.delCategory(row.id); ElMessage.success('已删除'); loadCats()
}
async function save(row, v) {
  await api.setTypemap(row.id, v ?? null)
  ElMessage.success('映射已更新'); loadUnmapped()
}
onMounted(async () => {
  await loadCats()
  sources.value = await api.sources()
  if (sources.value.length) { curSource.value = sources.value[0].id; loadMaps() }
  loadUnmapped()
})
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.sec-title { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
</style>
