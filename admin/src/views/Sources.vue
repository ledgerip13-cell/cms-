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
      <el-table-column label="回源" width="72">
        <template #default="{ row }">
          <el-tag size="small" :type="row.proxyMode==='proxy'?'warning':(row.proxyMode==='key'?'success':'info')" effect="plain">{{ {inherit:'跟随',direct:'直连',key:'key',proxy:'中转'}[row.proxyMode||'inherit'] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="采集 API" min-width="160">
        <template #default="{ row }">
          <div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ row.apiUrl }}</div>
          <el-tag v-if="apiUrlCount(row)>1" size="small" type="success" style="margin-top:3px">{{ apiUrlCount(row) }}个入口(已failover)</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="播放域名" width="130">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDomainManage(row)">管理播放域名</el-button>
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
          <div v-if="row.autoSync" style="font-size:11px;color:#9aa4b2">
            {{ row.cronExpr }} · {{ row.syncHours }}h · {{ autoTypeSummary(row) }}
          </div>
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
      <el-form-item label="采集驱动">
        <el-select v-model="form.driver" style="width:260px">
          <el-option v-for="d in drivers" :key="d.value" :label="d.label" :value="d.value" />
        </el-select>
        <small style="margin-left:8px;color:#9aa4b2">iCloud 源 API 填如 https://api.nbflix.com</small>
      </el-form-item>
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
      <el-form-item label="回源模式" v-if="form.driver !== 'nbflix'">
        <el-select v-model="form.proxyMode" style="width:260px">
          <el-option label="跟随全局（默认）" value="inherit" />
          <el-option label="direct 直连源站（不吃带宽）" value="direct" />
          <el-option label="key 仅代理密钥（加密源用，TS直连）" value="key" />
          <el-option label="proxy TS全中转（藏源/防盗链，吃带宽）" value="proxy" />
        </el-select>
        <small style="margin-left:8px;color:#9aa4b2">默认不下载；加密源选 key</small>
      </el-form-item>
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
        <el-form-item label="增量窗口" v-if="form.driver !== 'nbflix'"><el-input-number v-model="form.syncHours" :min="1" :max="720" /><small style="margin-left:8px;color:#9aa4b2">拉近N小时更新</small></el-form-item>
        <el-form-item label="采集分类">
          <el-select v-model="form.autoTypeIds" multiple clearable collapse-tags collapse-tags-tooltip
            :placeholder="autoClassLoading ? '分类加载中...' : '全部分类'" style="width:360px"
            filterable :loading="autoClassLoading" :disabled="autoClassLoading || !form.id">
            <template v-if="autoClassTree.length">
              <el-option-group v-for="p in autoClassTree" :key="p.typeId"
                :label="p.children.length ? `${p.typeName}（父类·含${p.children.length}子类）` : p.typeName">
                <el-option :label="`${p.typeName}（展开全部子类）`" :value="p.typeId" v-if="p.children.length" />
                <el-option v-for="c in p.children" :key="c.typeId" :label="c.typeName" :value="c.typeId" />
                <el-option v-if="!p.children.length" :label="p.typeName" :value="p.typeId" />
              </el-option-group>
            </template>
            <el-option v-else v-for="t in autoSrcTypes" :key="t.typeId" :label="`${t.typeName} (${t.typeId})`" :value="t.typeId" />
          </el-select>
          <small style="margin-left:8px;color:#9aa4b2">不选=全部；可多选；选父类会自动展开子类。新增源需保存后再选。</small>
        </el-form-item>
        <div v-if="form.driver === 'nbflix'" style="font-size:12px;color:#9aa4b2;margin:-6px 0 6px 90px">iCloud 源目录小且无时间/分类筛选，自动采集每次均全量过一遍（靠去重），建议频率不低于6小时</div>
      </template>
    </el-form>
    <template #footer><el-button @click="dlg=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
  </el-dialog>

  <!-- 播放域名管理 -->
  <el-dialog v-model="domainManageDlg" :title="`播放域名 - ${domainManageSource?.name || ''}`" width="640">
    <div class="domain-manage-bar">
      <el-input v-model="domainKeyword" clearable placeholder="搜索播放域名" />
      <span class="muted">共 {{ manageDomains.length }} 个</span>
    </div>
    <el-table :data="filteredManageDomains" max-height="420" stripe style="width:100%">
      <el-table-column label="播放域名" min-width="240">
        <template #default="{ row }">
          <div class="domain-host">{{ row.host }}</div>
          <div class="muted">{{ row.origin }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="count" label="播放地址" width="100" sortable />
      <el-table-column prop="playCount" label="线路" width="90" sortable />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDomainReplace(domainManageSource, row)">更改</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>

  <!-- 播放域名更换 -->
  <el-dialog v-model="domainDlg" title="更换播放域名" width="520">
    <el-alert type="warning" :closable="false" show-icon
      title="只替换当前采集源已入库播放地址里的域名，不会修改采集 API 地址。" />
    <el-form :model="domainForm" label-width="100px" style="margin-top:16px">
      <el-form-item label="采集源">
        <el-input :model-value="domainForm.sourceName" disabled />
      </el-form-item>
      <el-form-item label="当前域名">
        <el-input v-model="domainForm.oldOrigin" disabled />
      </el-form-item>
      <el-form-item label="新播放域名">
        <el-input v-model="domainForm.newOrigin" placeholder="https://new-cdn.example.com" />
        <div class="form-help">只替换域名，路径、文件名和参数都会保留。</div>
      </el-form-item>
      <el-form-item label="影响范围">
        <div class="muted">约 {{ domainForm.count || 0 }} 个播放地址，{{ domainForm.playCount || 0 }} 条线路</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="domainDlg=false">取消</el-button>
      <el-button type="primary" :loading="domainReplacing" @click="replaceDomain">确认更换</el-button>
    </template>
  </el-dialog>

  <!-- 采集 -->
  <el-dialog v-model="syncDlg" title="执行采集" width="560">
    <el-form :model="syncForm" label-width="90px">
      <div v-if="isNbflixSync" style="font-size:12px;color:#e6a23c;background:#fdf6ec;border:1px solid #f5dab1;border-radius:4px;padding:8px 12px;margin-bottom:12px">
        iCloud 源：目录小且无服务端分页/时间过滤，每次均自动全量采集（靠去重，不会重复入库）。以下不适用项已隐藏/禁用。
      </div>
      <el-form-item label="采集模式" v-if="!isNbflixSync">
        <el-radio-group v-model="syncForm.mode">
          <el-radio value="incr">增量</el-radio>
          <el-radio value="full">全量</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="增量窗口" v-if="!isNbflixSync && syncForm.mode==='incr'">
        <el-input-number v-model="syncForm.hours" :min="1" :max="720" />
        <small style="margin-left:8px;color:#9aa4b2">只拉近N小时更新(不重复旧片)</small>
      </el-form-item>
      <el-form-item label="采集分类">
        <el-select v-model="syncForm.typeIds" multiple clearable collapse-tags collapse-tags-tooltip
          :placeholder="classLoading ? '分类加载中...' : '全部分类'" style="width:360px"
          filterable :loading="classLoading" :disabled="classLoading" @change="onTypeChange">
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
          v-if="selectedSyncTypeIds.length" @click="estimate">预估可采</el-button>
        <div style="font-size:12px;color:#9aa4b2">
          留空=全部；可多选；选父类会自动展开其所有子类。
          <span v-if="estText" style="color:#67c23a">{{ estText }}</span>
        </div>
      </el-form-item>
      <el-form-item label="年份筛选" v-if="!isNbflixSync">
        <div class="year-filter">
          <el-select v-model="syncForm.yearMode" placeholder="不限" style="width:120px">
            <el-option label="不限" value="" />
            <el-option label="等于" value="eq" />
            <el-option label="大于" value="gt" />
            <el-option label="大于等于" value="gte" />
            <el-option label="小于" value="lt" />
            <el-option label="小于等于" value="lte" />
            <el-option label="区间" value="range" />
          </el-select>
          <template v-if="syncForm.yearMode && syncForm.yearMode !== 'range'">
            <el-input-number v-model="syncForm.year" :min="1900" :max="2100" controls-position="right" />
          </template>
          <template v-else-if="syncForm.yearMode === 'range'">
            <el-input-number v-model="syncForm.yearStart" :min="1900" :max="2100" controls-position="right" />
            <span class="muted">至</span>
            <el-input-number v-model="syncForm.yearEnd" :min="1900" :max="2100" controls-position="right" />
          </template>
          <span v-else class="muted">不过滤年份</span>
        </div>
      </el-form-item>
      <el-form-item label="最大页数" v-if="!isNbflixSync">
        <el-input-number v-model="syncForm.maxPages" :min="1" :max="2000" />
        <small style="margin-left:8px;color:#9aa4b2">{{ syncForm.mode==='full' ? '全量建议调大' : '安全上限' }}</small>
      </el-form-item>
      <el-form-item label="详情并发">
        <el-input-number v-model="syncForm.detailConcurrency" :min="1" :max="5" />
        <small style="margin-left:8px;color:#9aa4b2">同一源详情批次并发，推荐 3；源不稳时调 1</small>
      </el-form-item>
      <el-form-item label="封面图片">
        <div class="image-options">
          <el-checkbox v-model="syncForm.localizeImages" @change="onLocalizeImagesChange">下载到本地</el-checkbox>
          <el-checkbox v-model="syncForm.encryptLocalImages" :disabled="!syncForm.localizeImages">本地图片加密</el-checkbox>
          <small style="color:#9aa4b2">下载失败不保留远程坏图；加密后磁盘不保存明文，前台由后端解密输出。</small>
        </div>
      </el-form-item>
      <el-form-item label="后置动作">
        <div class="post-actions">
          <el-checkbox v-model="syncForm.metaAfterCollect">采集后豆瓣匹配</el-checkbox>
          <el-checkbox v-model="syncForm.cleanAfterCollect" :disabled="isNbflixSync" :title="isNbflixSync ? 'iCloud 客户端解析链无法清洗' : ''">采集后HLS清洗{{ isNbflixSync ? '（iCloud源不适用）' : '' }}</el-checkbox>
          <div class="form-help">HLS 清洗只在这里勾选时提交；全局自动清洗仅用于定时自动更新采集。</div>
        </div>
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
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Refresh, Close } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
const router = useRouter()

const list = ref([]); const loading = ref(false)
const drivers = ref([{ value: 'maccms', label: '苹果CMS (MacCMS 标准)' }])
const dlg = ref(false); const form = ref({}); const formRef = ref(null)
const domainDlg = ref(false)
const domainManageDlg = ref(false)
const domainManageSource = ref(null)
const domainKeyword = ref('')
const domainReplacing = ref(false)
const domainForm = ref({ sourceId: 0, sourceName: '', oldOrigin: '', newOrigin: '', count: 0, playCount: 0 })
const formRules = {
  name: [{ required: true, message: '源名称不能为空', trigger: 'blur' }],
  apiUrls: [{ validator: (_, v, cb) => {
    const has = (v || []).some(u => (u||'').trim())
    has ? cb() : cb(new Error('至少填写一个采集API地址'))
  }, trigger: 'blur' }],
}
const syncDlg = ref(false); const syncing = ref(false)
const syncForm = ref({ mode: 'incr', hours: 24, maxPages: 5, detailConcurrency: 3, localizeImages: false, encryptLocalImages: true, typeIds: [] })
const syncTarget = ref(null)
const isNbflixSync = computed(() => syncTarget.value?.driver === 'nbflix')
const selectedSyncTypeIds = computed(() => {
  const ids = Array.isArray(syncForm.value.typeIds)
    ? syncForm.value.typeIds.map(v => String(v || '').trim()).filter(Boolean)
    : syncForm.value.typeId ? [String(syncForm.value.typeId)] : []
  return [...new Set(ids)]
})
const currentYear = new Date().getFullYear()
const autoSrcTypes = ref([])
const autoClassTree = ref([])
const autoClassLoading = ref(false)

const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : '—'

async function load() { loading.value = true; try { list.value = await api.sources() } finally { loading.value = false } }
function playDomains(row) {
  try {
    const rows = JSON.parse(row?.playDomains || '[]')
    return Array.isArray(rows) ? rows.filter(d => d?.origin && d?.host) : []
  } catch { return [] }
}
const manageDomains = computed(() => playDomains(domainManageSource.value))
const filteredManageDomains = computed(() => {
  const kw = domainKeyword.value.trim().toLowerCase()
  if (!kw) return manageDomains.value
  return manageDomains.value.filter(d => `${d.host} ${d.origin}`.toLowerCase().includes(kw))
})
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
function parseAutoTypeIds(value) {
  if (Array.isArray(value)) return [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))]
  const raw = String(value || '').trim()
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parseAutoTypeIds(parsed) : []
    } catch { return [] }
  }
  return [raw]
}
function autoTypeIds(row) {
  return parseAutoTypeIds(row?.autoTypeIds?.length ? row.autoTypeIds : row?.autoTypeId)
}
function autoTypeSummary(row) {
  const ids = autoTypeIds(row)
  if (!ids.length) return '全部分类'
  if (ids.length === 1) return `分类${ids[0]}`
  return `${ids.length}个分类`
}
function openAdd() {
  autoSrcTypes.value = []; autoClassTree.value = []
  form.value = { name:'', apiUrl:'', apiUrls:[''], driver:'maccms', flag:'', proxyMode:'inherit', priority:100, enabled:true, autoSync:false, autoTypeId:'', autoTypeIds:[], cronExpr:'0 * * * *', syncHours:24 }
  dlg.value = true
}
function openEdit(row) {
  const arr = parseApiUrls(row)
  form.value = { ...row, autoTypeIds: autoTypeIds(row), apiUrls: arr.length ? arr : [row.apiUrl || ''] }
  loadAutoTypes(row)
  dlg.value = true
}
async function loadAutoTypes(row) {
  autoSrcTypes.value = []; autoClassTree.value = []
  if (!row?.id) return
  autoClassLoading.value = true
  try {
    const [classRes, typeRes] = await Promise.allSettled([
      api.sourceClasses(row.id),
      api.sourceTypes(row.id),
    ])
    const classPayload = classRes.status === 'fulfilled' ? classRes.value : null
    autoClassTree.value = classPayload?.ok ? classPayload.tree : []
    autoSrcTypes.value = typeRes.status === 'fulfilled' ? typeRes.value : []
  } finally {
    autoClassLoading.value = false
  }
}
async function save() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    const payload = { ...form.value, apiUrls: (form.value.apiUrls || []).map(s => (s||'').trim()).filter(Boolean) }
    payload.autoTypeIds = parseAutoTypeIds(payload.autoTypeIds)
    payload.autoTypeId = payload.autoTypeIds.length ? JSON.stringify(payload.autoTypeIds) : ''
    if (!payload.apiUrl) payload.apiUrl = payload.apiUrls[0] || ''
    if (form.value.id) await api.updateSource(form.value.id, payload)
    else await api.addSource(payload)
    ElMessage.success('已保存'); dlg.value = false; load()
  } catch (e) { ElMessage.error('保存失败: ' + (e?.response?.data?.error || e.message)) }
}
async function toggle(row) {
  const payload = { ...row, autoTypeIds: autoTypeIds(row) }
  await api.updateSource(row.id, payload)
  ElMessage.success(row.enabled?'已启用':'已禁用')
}
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
function openDomainReplace(row, d) {
  if (!row || !d) return
  domainForm.value = {
    sourceId: row.id,
    sourceName: row.name,
    oldOrigin: d.origin,
    newOrigin: d.origin,
    count: d.count,
    playCount: d.playCount,
  }
  domainDlg.value = true
}
function openDomainManage(row) {
  domainManageSource.value = row
  domainKeyword.value = ''
  domainManageDlg.value = true
}
async function replaceDomain() {
  const f = domainForm.value
  if (!f.sourceId || !f.oldOrigin || !String(f.newOrigin || '').trim()) {
    ElMessage.error('请填写新播放域名')
    return
  }
  if (String(f.newOrigin).trim() === f.oldOrigin) {
    ElMessage.error('新旧播放域名不能相同')
    return
  }
  await ElMessageBox.confirm(
    `确认将「${f.sourceName}」下的播放域名从 ${f.oldOrigin} 更换为 ${String(f.newOrigin).trim()}？此操作会直接替换数据库里的播放地址，不会修改采集 API。`,
    '确认更换播放域名',
    { type: 'warning', confirmButtonText: '确认更换', cancelButtonText: '取消' }
  )
  domainReplacing.value = true
  try {
    const r = await api.replaceSourcePlayDomain(f.sourceId, {
      oldOrigin: f.oldOrigin,
      newOrigin: String(f.newOrigin).trim(),
    })
    ElMessage.success(`已更换：${r.affectedEpisodes} 个播放地址，${r.affectedPlays} 条线路`)
    domainDlg.value = false
    domainManageDlg.value = false
    await load()
  } catch (e) {
    ElMessage.error('更换失败: ' + e.message)
  } finally {
    domainReplacing.value = false
  }
}
const srcTypes = ref([])
const classTree = ref([])
const classLoading = ref(false)
const counting = ref(false)
const estText = ref('')
async function openSync(row) {
  syncTarget.value = row
  srcTypes.value = []
  classTree.value = []
  // 首次建库默认全量 + 大页数，避免增量窗口把全量过滤成个位数
  syncForm.value = {
    mode:'full',
    hours:24,
    maxPages:100,
    detailConcurrency:3,
    localizeImages:false,
    encryptLocalImages:true,
    typeIds:[],
    yearMode:'',
    year: currentYear,
    yearStart: currentYear,
    yearEnd: currentYear,
    metaAfterCollect: true,
    cleanAfterCollect: false,
  }
  if (row.driver === 'nbflix') syncForm.value.mode = 'full' // iCloud 源无增量概念，固定全量
  estText.value = ''
  syncDlg.value = true
  // 实时拉上游分类树（含父子），失败则回退已发现的 srcTypes
  classLoading.value = true
  try {
    const [classRes, typeRes] = await Promise.allSettled([
      api.sourceClasses(row.id),
      api.sourceTypes(row.id),
    ])
    const classPayload = classRes.status === 'fulfilled' ? classRes.value : null
    classTree.value = classPayload?.ok ? classPayload.tree : []
    srcTypes.value = typeRes.status === 'fulfilled' ? typeRes.value : []
  } finally {
    classLoading.value = false
  }
}
function onTypeChange() { estText.value = '' }
function onLocalizeImagesChange(value) {
  syncForm.value.encryptLocalImages = Boolean(value)
}
async function estimate() {
  const typeIds = selectedSyncTypeIds.value
  if (!typeIds.length) return
  counting.value = true; estText.value = ''
  try {
    const hours = syncForm.value.mode === 'incr' ? syncForm.value.hours : 0
    const r = await api.sourceTypeCount(syncTarget.value.id, typeIds, hours)
    if (r?.ok) {
      const parts = []
      if (r.selected > 1) parts.push(`已选${r.selected}类`)
      if (r.expanded) parts.push(`展开${r.expanded}个子类`)
      if (r.targets && r.targets !== r.selected) parts.push(`实际${r.targets}类`)
      estText.value = `预估可采 ${r.total} 部` + (parts.length ? `（${parts.join(' / ')}）` : '') + (hours ? `（近${hours}h）` : '（全量）')
    }
    else estText.value = '预估失败'
  } catch (e) { estText.value = '预估失败' } finally { counting.value = false }
}
async function doSync() {
  syncing.value = true
  try {
    const payload = { ...syncForm.value, typeIds: selectedSyncTypeIds.value }
    delete payload.typeId
    const r = await api.syncSource(syncTarget.value.id, payload)
    ElMessage.success('采集任务已提交，可去「采集任务」查看进度')
    syncDlg.value = false
    // 提示跳转任务页
    ElMessageBox.confirm('采集在后台运行中，是否前往「采集任务」页查看进度？', '已提交', {
      confirmButtonText: '去看进度', cancelButtonText: '留在本页', type: 'success'
    }).then(() => router.push('/tasks')).catch(() => {})
  } catch (e) { ElMessage.error('提交失败: ' + e.message) } finally { syncing.value = false }
}
onMounted(() => {
  load()
  api.drivers().then((d) => { if (Array.isArray(d) && d.length) drivers.value = d }).catch(() => {})
})
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.sec-title { font-size: 16px; font-weight: 600; }
.sec-title small { color: #9aa4b2; font-weight: 400; margin-left: 6px; }
:deep(.el-table) { overflow-x: auto; }
.muted { color: #9aa4b2; font-size: 12px; }
.domain-count { color: #9aa4b2; font-size: 12px; white-space: nowrap; }
.domain-manage-bar { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; margin-bottom: 12px; }
.domain-host { font-weight: 600; line-height: 1.5; }
.form-help { color: #9aa4b2; font-size: 12px; line-height: 1.6; }
.year-filter { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.image-options { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.post-actions { display: flex; flex-direction: column; gap: 4px; }
</style>
