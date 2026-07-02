<template>
  <div class="card">
    <div class="bar">
      <div class="sec-title">采集源管理 <small>共 {{ list.length }} 个</small></div>
      <div>
        <el-button @click="load" :icon="Refresh">刷新</el-button>
        <el-button type="warning" :loading="probing" @click="doProbe">探活线路</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd">新增采集源</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" stripe style="width:100%" table-layout="fixed">
      <el-table-column prop="priority" label="优先级" width="70" sortable />
      <el-table-column prop="name" label="源名称" width="110" show-overflow-tooltip />
      <el-table-column prop="flag" label="播放标识" width="90">
        <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.flag || '-' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="采集 API" min-width="160">
        <template #default="{ row }">
          <div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ row.apiUrl }}</div>
          <el-tag v-if="apiUrlCount(row)>1" size="small" type="success" style="margin-top:3px">{{ apiUrlCount(row) }}个入口(已failover)</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="70">
        <template #default="{ row }">
          <el-tag v-if="row.status==='ok'" type="success" size="small">正常</el-tag>
          <el-tag v-else-if="row.status==='fail'" type="danger" size="small">失败</el-tag>
          <el-tag v-else type="info" size="small">未知</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="60">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" @change="toggle(row)" />
        </template>
      </el-table-column>
      <el-table-column label="定时采集" width="110">
        <template #default="{ row }">
          <el-switch v-model="row.autoSync" @change="toggle(row)" />
          <div v-if="row.autoSync" style="font-size:11px;color:#9aa4b2">{{ row.cronExpr }} · {{ row.syncHours }}h</div>
        </template>
      </el-table-column>
      <el-table-column prop="syncCount" label="入库" width="70" />
      <el-table-column label="最近采集" width="110">
        <template #default="{ row }">{{ fmt(row.lastSyncAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="ping(row)" :loading="row._pinging">测活</el-button>
          <el-button size="small" type="success" @click="openSync(row)">采集</el-button>
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="del(row)">删</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>

  <!-- 新增/编辑 -->
  <el-dialog v-model="dlg" :title="form.id ? '编辑采集源' : '新增采集源'" width="520">
    <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
      <el-form-item label="源名称" prop="name"><el-input v-model="form.name" placeholder="如：如意资源网" /></el-form-item>
      <el-form-item label="采集API" prop="apiUrls">
        <div style="width:100%">
          <div v-for="(u,i) in form.apiUrls" :key="i" style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
            <el-input v-model="form.apiUrls[i]" placeholder="https://xxx/api.php/provide/vod/" />
            <el-tag v-if="i===0" size="small" type="primary">主</el-tag>
            <el-tag v-else size="small">备用{{ i }}</el-tag>
            <el-button :icon="Close" circle size="small" @click="form.apiUrls.splice(i,1)" v-if="form.apiUrls.length>1" />
          </div>
          <el-button :icon="Plus" size="small" @click="form.apiUrls.push('')">加备用入口</el-button>
          <div style="font-size:12px;color:#9aa4b2;margin-top:6px">多个入口时自动failover：主入口失败/超时自动切备用，下次优先试上次生效的入口。</div>
        </div>
      </el-form-item>
      <el-form-item label="播放标识"><el-input v-model="form.flag" placeholder="rym3u8（可留空）" /></el-form-item>
      <el-form-item label="优先级"><el-input-number v-model="form.priority" :min="1" :max="999" /><small style="margin-left:8px;color:#9aa4b2">越小线路越靠前</small></el-form-item>
      <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
      <el-divider>定时自动采集</el-divider>
      <el-form-item label="自动采集"><el-switch v-model="form.autoSync" /></el-form-item>
      <template v-if="form.autoSync">
        <el-form-item label="采集频率">
          <el-select v-model="form.cronExpr" style="width:220px">
            <el-option label="每 30 分钟" value="*/30 * * * *" />
            <el-option label="每小时" value="0 * * * *" />
            <el-option label="每 3 小时" value="0 */3 * * *" />
            <el-option label="每 6 小时" value="0 */6 * * *" />
            <el-option label="每 12 小时" value="0 */12 * * *" />
            <el-option label="每天凌晨2点" value="0 2 * * *" />
          </el-select>
        </el-form-item>
        <el-form-item label="增量窗口"><el-input-number v-model="form.syncHours" :min="1" :max="720" /><small style="margin-left:8px;color:#9aa4b2">拉近N小时更新</small></el-form-item>
      </template>
    </el-form>
    <template #footer><el-button @click="dlg=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
  </el-dialog>

  <!-- 采集 -->
  <el-dialog v-model="syncDlg" title="执行采集" width="480">
    <el-form :model="syncForm" label-width="90px">
      <el-form-item label="采集模式">
        <el-radio-group v-model="syncForm.mode">
          <el-radio value="incr">增量</el-radio>
          <el-radio value="full">全量</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="增量窗口" v-if="syncForm.mode==='incr'">
        <el-input-number v-model="syncForm.hours" :min="1" :max="720" />
        <small style="margin-left:8px;color:#9aa4b2">只拉近N小时更新(不重复旧片)</small>
      </el-form-item>
      <el-form-item label="采集分类">
        <el-select v-model="syncForm.typeId" clearable placeholder="全部分类" style="width:240px"
          filterable :loading="classLoading" @change="onTypeChange">
          <template v-if="classTree.length">
            <el-option-group v-for="p in classTree" :key="p.typeId"
              :label="p.children.length ? `${p.typeName}（父类·含${p.children.length}子类）` : p.typeName">
              <el-option :label="`${p.typeName}（展开全部子类）`" :value="p.typeId" v-if="p.children.length" />
              <el-option v-for="c in p.children" :key="c.typeId" :label="c.typeName" :value="c.typeId" />
              <el-option v-if="!p.children.length" :label="p.typeName" :value="p.typeId" />
            </el-option-group>
          </template>
          <el-option v-else v-for="t in srcTypes" :key="t.typeId" :label="`${t.typeName} (${t.typeId})`" :value="t.typeId" />
        </el-select>
        <el-button link type="primary" :loading="counting" style="margin-left:8px"
          v-if="syncForm.typeId" @click="estimate">预估可采</el-button>
        <div style="font-size:12px;color:#9aa4b2">
          留空=全部；选父类会自动展开其所有子类。
          <span v-if="estText" style="color:#67c23a">{{ estText }}</span>
        </div>
      </el-form-item>
      <el-form-item label="最大页数">
        <el-input-number v-model="syncForm.maxPages" :min="1" :max="2000" />
        <small style="margin-left:8px;color:#9aa4b2">{{ syncForm.mode==='full' ? '全量建议调大' : '安全上限' }}</small>
      </el-form-item>
    </el-form>
    <el-alert type="info" :closable="false"
      title="采集异步执行，提交后去「采集任务」看进度。重复的片不会重复入库(走更新)。" />
    <template #footer>
      <el-button @click="syncDlg=false">取消</el-button>
      <el-button type="success" :loading="syncing" @click="doSync">提交采集</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Refresh, Close } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
const router = useRouter()

const list = ref([]); const loading = ref(false)
const dlg = ref(false); const form = ref({}); const formRef = ref(null)
const formRules = {
  name: [{ required: true, message: '源名称不能为空', trigger: 'blur' }],
  apiUrls: [{ validator: (_, v, cb) => {
    const has = (v || []).some(u => (u||'').trim())
    has ? cb() : cb(new Error('至少填写一个采集API地址'))
  }, trigger: 'blur' }],
}
const syncDlg = ref(false); const syncing = ref(false)
const syncForm = ref({ mode: 'incr', hours: 24, maxPages: 5 }); let syncTarget = null

const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : '—'

async function load() { loading.value = true; try { list.value = await api.sources() } finally { loading.value = false } }
const probing = ref(false)
async function doProbe() {
  probing.value = true
  try { const r = await api.probe({ limit: 80 })
    ElMessage.success(`探活完成: 检测${r.checked} 存活${r.alive} 死链${r.dead}`); load()
  } catch (e) { ElMessage.error('探活失败: ' + e.message) } finally { probing.value = false }
}
function parseApiUrls(row) {
  try { const a = JSON.parse(row.apiUrls || '[]'); return Array.isArray(a) ? a.filter(Boolean) : [] } catch { return [] }
}
function apiUrlCount(row) {
  const a = parseApiUrls(row)
  return a.length || (row.apiUrl ? 1 : 0)
}
function openAdd() { form.value = { name:'', apiUrl:'', apiUrls:[''], flag:'', priority:100, enabled:true, autoSync:false, cronExpr:'0 * * * *', syncHours:24 }; dlg.value = true }
function openEdit(row) {
  const arr = parseApiUrls(row)
  form.value = { ...row, apiUrls: arr.length ? arr : [row.apiUrl || ''] }
  dlg.value = true
}
async function save() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    const payload = { ...form.value, apiUrls: (form.value.apiUrls || []).map(s => (s||'').trim()).filter(Boolean) }
    if (!payload.apiUrl) payload.apiUrl = payload.apiUrls[0] || ''
    if (form.value.id) await api.updateSource(form.value.id, payload)
    else await api.addSource(payload)
    ElMessage.success('已保存'); dlg.value = false; load()
  } catch (e) { ElMessage.error('保存失败: ' + (e?.response?.data?.error || e.message)) }
}
async function toggle(row) { await api.updateSource(row.id, row); ElMessage.success(row.enabled?'已启用':'已禁用') }
async function del(row) {
  await ElMessageBox.confirm(`删除采集源「${row.name}」? 其线路数据一并移除`, '确认', { type: 'warning' })
  await api.delSource(row.id); ElMessage.success('已删除'); load()
}
async function ping(row) {
  row._pinging = true
  try {
    const r = await api.pingSource(row.id)
    if (r.ok) {
      const extra = r.multi ? `（${r.results.filter(x=>x.ok).length}/${r.results.length}个入口存活）` : ''
      ElMessage.success(`正常 ${r.ms}ms · 总量${r.total} · 样本「${r.sample}」 ${extra}`)
    } else {
      ElMessage.error('全部入口失败: ' + r.error)
    }
    load()
  } finally { row._pinging = false }
}
const srcTypes = ref([])
const classTree = ref([])
const classLoading = ref(false)
const counting = ref(false)
const estText = ref('')
async function openSync(row) {
  syncTarget = row
  // 首次建库默认全量 + 大页数，避免增量窗口把全量过滤成个位数
  syncForm.value = { mode:'full', hours:24, maxPages:100, typeId:'' }
  estText.value = ''
  classTree.value = []
  syncDlg.value = true
  // 实时拉上游分类树（含父子），失败则回退已发现的 srcTypes
  classLoading.value = true
  try {
    const r = await api.sourceClasses(row.id)
    classTree.value = r?.ok ? r.tree : []
  } catch { classTree.value = [] }
  finally { classLoading.value = false }
  try { srcTypes.value = await api.sourceTypes(row.id) } catch { srcTypes.value = [] }
}
function onTypeChange() { estText.value = '' }
async function estimate() {
  if (!syncForm.value.typeId) return
  counting.value = true; estText.value = ''
  try {
    const hours = syncForm.value.mode === 'incr' ? syncForm.value.hours : 0
    const r = await api.sourceTypeCount(syncTarget.id, syncForm.value.typeId, hours)
    if (r?.ok) estText.value = `预估可采 ${r.total} 部` + (r.expanded ? `（已展开${r.expanded}个子类）` : '') + (hours ? `（近${hours}h）` : '（全量）')
    else estText.value = '预估失败'
  } catch (e) { estText.value = '预估失败' } finally { counting.value = false }
}
async function doSync() {
  syncing.value = true
  try {
    const r = await api.syncSource(syncTarget.id, syncForm.value)
    ElMessage.success('采集任务已提交，可去「采集任务」查看进度')
    syncDlg.value = false
    // 提示跳转任务页
    ElMessageBox.confirm('采集在后台运行中，是否前往「采集任务」页查看进度？', '已提交', {
      confirmButtonText: '去看进度', cancelButtonText: '留在本页', type: 'success'
    }).then(() => router.push('/tasks')).catch(() => {})
  } catch (e) { ElMessage.error('提交失败: ' + e.message) } finally { syncing.value = false }
}
onMounted(load)
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.sec-title { font-size: 16px; font-weight: 600; }
.sec-title small { color: #9aa4b2; font-weight: 400; margin-left: 6px; }
:deep(.el-table) { overflow-x: auto; }
</style>
