<template>
  <div class="card">
    <div class="bar">
      <div class="sec-title">影片库 <small>去重后 {{ total }} 部</small></div>
      <div class="filters">
        <el-input v-model="q.kw" placeholder="搜索片名" clearable style="width:180px" @keyup.enter="load" :prefix-icon="Search" />
        <el-select v-model="q.type" placeholder="全部分类" clearable style="width:140px" @change="load">
          <el-option v-for="t in types" :key="t.name" :label="`${t.name||'未分类'}(${t.count})`" :value="t.name" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
        <el-button type="success" :icon="Plus" @click="kwDlg=true">按片名采集</el-button>
        <el-button type="warning" :icon="MagicStick" @click="metaBatch">
          豆瓣匹配<span v-if="mstat.none" style="margin-left:2px">（{{ mstat.none }} 待匹）</span>
        </el-button>
        <el-button :icon="CollectionTag" @click="backfillSubs">补全小类</el-button>
      </div>
    </div>

    <!-- 按片名采集（两步：搜索预览 → 勾选确认） -->
    <el-dialog v-model="kwDlg" title="按片名采集" width="640" @close="resetKwDlg">
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <el-input v-model="kwInput" placeholder="输入片名，如：龙珠、师兄啊师兄" clearable @keyup.enter="searchKeyword" :disabled="kwSearching" />
        <el-button type="primary" :loading="kwSearching" @click="searchKeyword">搜索</el-button>
      </div>

      <div v-if="kwSearching" style="text-align:center;color:#9aa4b2;padding:30px 0">正在遍历所有采集源搜索…</div>

      <template v-else-if="kwCandidates.length">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:13px;color:#9aa4b2">共找到 {{ kwCandidates.length }} 个候选，选中后只采集所选项</span>
          <div>
            <el-button size="small" link @click="kwChecked = kwCandidates.map(c=>c.fingerprint)">全选</el-button>
            <el-button size="small" link @click="kwChecked = []">清空</el-button>
          </div>
        </div>
        <el-checkbox-group v-model="kwChecked" style="max-height:360px;overflow-y:auto;display:block">
          <div v-for="c in kwCandidates" :key="c.fingerprint"
            style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid #e4e7ed;border-radius:8px;margin-bottom:8px">
            <el-checkbox :value="c.fingerprint" style="flex:1;min-width:0">
              <span style="font-weight:600">{{ c.name }}</span>
              <span v-if="c.year" style="color:#9aa4b2;margin-left:6px">({{ c.year }})</span>
            </el-checkbox>
            <div style="flex-shrink:0;display:flex;gap:6px;align-items:center">
              <el-tag size="small" type="success">{{ c.sources.length }} 个源</el-tag>
              <el-tooltip :content="c.sources.map(s=>s.sourceName+' x'+s.hits).join('\n')" placement="top">
                <span style="font-size:12px;color:#9aa4b2;cursor:help">详情</span>
              </el-tooltip>
            </div>
          </div>
        </el-checkbox-group>
      </template>

      <div v-else-if="kwSearched" style="text-align:center;color:#9aa4b2;padding:30px 0">没有搜到相关影片</div>
      <el-alert v-else type="info" :closable="false"
        title="输入片名先搜索预览，按片名+年份分组展示命中源数，选中后再采集，不会误采不相关的同名片。" />

      <template #footer>
        <el-button @click="kwDlg=false">取消</el-button>
        <el-button type="primary" :disabled="!kwChecked.length" :loading="kwSubmitting" @click="confirmKeyword">
          采集选中项（{{ kwChecked.length }}）
        </el-button>
      </template>
    </el-dialog>

    <div v-if="selected.length" class="batch-bar">
      <span>已选 {{ selected.length }} 项</span>
      <el-button size="small" type="warning" @click="batchAction('offline')">批量下架</el-button>
      <el-button size="small" type="success" @click="batchAction('online')">批量上架</el-button>
      <el-button size="small" type="danger" @click="batchAction('delete')">批量删除</el-button>
      <el-button size="small" link @click="tableRef?.clearSelection()">取消选择</el-button>
    </div>

    <el-table ref="tableRef" :data="list" v-loading="loading" stripe @row-click="openDetail" @selection-change="v => selected = v">
      <el-table-column type="selection" width="42" @click.stop />
      <el-table-column label="封面" width="70">
        <template #default="{ row }">
          <el-image v-if="row.officialPic || row.pic" :src="row.officialPic || row.pic" fit="cover" style="width:44px;height:60px;border-radius:4px" lazy>
            <template #error><div class="noimg">无图</div></template>
          </el-image>
          <div v-else class="noimg">无图</div>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="片名" min-width="180">
        <template #default="{ row }">
          <span style="font-weight:600">{{ row.name }}</span>
          <el-tag v-if="row.pinned" size="small" type="warning" style="margin-left:6px">置顶</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="year" label="年份" width="70" />
      <el-table-column prop="typeName" label="分类" width="110">
        <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.typeName || '未分类' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="线路数" width="80">
        <template #default="{ row }"><el-tag type="success" size="small">{{ row._count.plays }} 条</el-tag></template>
      </el-table-column>
      <el-table-column label="豆瓣评分" width="110">
        <template #default="{ row }">
          <span v-if="row.rating" class="rating"><el-icon><StarFilled /></el-icon>{{ row.rating }}</span>
          <el-tag v-else-if="row.metaMatched==='failed'" size="small" type="info">无收录</el-tag>
          <span v-else style="color:#c0c4cc">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="remarks" label="更新状态" width="110" show-overflow-tooltip />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status==='online'?'success':'info'" size="small">{{ row.status==='online'?'在线':'下架' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="292" fixed="right" align="center">
        <template #default="{ row }">
          <div class="vod-actions">
            <el-button size="small" @click.stop="openDetail(row)">线路</el-button>
            <el-button size="small" type="primary" plain @click.stop="openEdit(row)">编辑</el-button>
            <el-button size="small" :loading="row._refreshing" @click.stop="refreshOne(row)">采集更新</el-button>
            <el-button size="small" :type="row.status==='online'?'warning':'success'" @click.stop="toggleStatus(row)">
              {{ row.status==='online'?'下架':'上架' }}
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination class="pager" background layout="total, prev, pager, next, sizes"
      :total="total" :page-size="q.size" :current-page="q.page" :page-sizes="[20,50,100]"
      @current-change="p=>{q.page=p;load()}" @size-change="s=>{q.size=s;q.page=1;load()}" />
  </div>

  <!-- 影片线路详情 -->
  <el-drawer v-model="drawer" :title="cur.name" size="620">
    <div v-if="cur.id">
      <div class="detail-head">
        <el-image v-if="cur.pic" :src="cur.pic" fit="cover" style="width:110px;height:150px;border-radius:8px" />
        <div class="meta">
          <p><b>年份:</b> {{ cur.year || '—' }} · <b>分类:</b> {{ cur.typeName || '—' }}</p>
          <p><b>地区:</b> {{ cur.area || '—' }} · <b>语言:</b> {{ cur.lang || '—' }}</p>
          <p><b>主演:</b> <span class="ellip">{{ cur.actor || '—' }}</span></p>
          <p><b>指纹:</b> <code>{{ cur.fingerprint }}</code></p>
          <p><b>更新:</b> {{ cur.remarks }}</p>
          <p>
            <b>豆瓣:</b>
            <span v-if="cur.rating" class="rating"><el-icon><StarFilled /></el-icon>{{ cur.rating }}</span>
            <span v-else style="color:#9aa4b2">{{ cur.metaMatched==='failed'?'无收录':'未匹配' }}</span>
            <el-button size="small" text type="primary" @click="matchOne(cur.id)">
              {{ cur.rating ? '重新匹配' : '匹配豆瓣' }}
            </el-button>
            <a v-if="cur.doubanId" :href="`https://movie.douban.com/subject/${cur.doubanId}/`" target="_blank"
              style="font-size:12px;color:#409eff">查看豆瓣页 ↗</a>
          </p>
          <p v-if="cur.genres"><b>豆瓣类型:</b> {{ cur.genres }}</p>
        </div>
      </div>
      <p class="blurb" v-if="cur.officialIntro" style="border-left:3px solid #409eff;padding-left:10px">
        <b style="color:#409eff">豆瓣简介:</b> {{ cur.officialIntro }}
      </p>
      <p class="blurb" v-if="cur.blurb">{{ cur.blurb }}</p>

      <div style="display:flex;gap:10px;margin:8px 0 4px">
        <el-button type="primary" plain :icon="EditPen" @click="openEdit(cur)">编辑资料</el-button>
        <el-button type="success" plain :icon="Refresh" :loading="refreshing" @click="refreshOne(cur)">采集更新（刷新剧集）</el-button>
        <el-button :type="cur.pinned?'warning':'default'" plain @click="togglePin(cur)">{{ cur.pinned?'取消置顶':'置顶' }}</el-button>
      </div>
      <div class="sec-title" style="margin:16px 0 10px">播放线路 · {{ cur.lines?.length }} 条(按源优先级)</div>
      <el-collapse v-model="active">
        <el-collapse-item v-for="l in cur.lines" :key="l.id" :name="l.id">
          <template #title>
            <el-tag size="small" type="success">{{ l.sourceName }}</el-tag>
            <span style="margin:0 10px">flag={{ l.flag }}</span>
            <span style="color:#9aa4b2">{{ l.epCount }} 集</span>
          </template>
          <div class="eps">
            <el-tag v-for="(e,i) in l.episodes.slice(0,60)" :key="i" size="small" effect="plain" class="ep"
              @click="copy(e.url)" :title="e.url">{{ e.name }}</el-tag>
            <span v-if="l.episodes.length>60" style="color:#9aa4b2">…共{{ l.episodes.length }}集</span>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </el-drawer>

  <!-- 编辑影片资料 -->
  <el-dialog v-model="editDlg" title="编辑影片资料" width="600">
    <el-form :model="editForm" label-width="80px">
      <el-form-item label="片名" required>
        <el-input v-model="editForm.name" />
      </el-form-item>
      <div style="display:flex;gap:12px">
        <el-form-item label="年份" style="flex:1"><el-input v-model="editForm.year" /></el-form-item>
        <el-form-item label="分类" style="flex:1"><el-input v-model="editForm.typeName" /></el-form-item>
      </div>
      <div style="display:flex;gap:12px">
        <el-form-item label="地区" style="flex:1"><el-input v-model="editForm.area" /></el-form-item>
        <el-form-item label="语言" style="flex:1"><el-input v-model="editForm.lang" /></el-form-item>
      </div>
      <el-form-item label="主演"><el-input v-model="editForm.actor" /></el-form-item>
      <el-form-item label="导演"><el-input v-model="editForm.director" /></el-form-item>
      <div style="display:flex;gap:12px">
        <el-form-item label="更新状态" style="flex:1"><el-input v-model="editForm.remarks" placeholder="如：更新至20集" /></el-form-item>
        <el-form-item label="豆瓣评分" style="flex:1"><el-input v-model="editForm.rating" placeholder="如 8.5，空=无" /></el-form-item>
      </div>
      <el-form-item label="封面图">
        <el-input v-model="editForm.pic" placeholder="封面 URL">
          <template #append><el-image v-if="editForm.pic" :src="editForm.pic" style="width:28px;height:38px" fit="cover" /></template>
        </el-input>
      </el-form-item>
      <el-form-item label="简介"><el-input v-model="editForm.blurb" type="textarea" :rows="3" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="editDlg=false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Search, MagicStick, StarFilled, EditPen, Refresh, CollectionTag, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { api } from '../api'
const router = useRouter()

const kwDlg = ref(false); const kwInput = ref('')
const kwSearching = ref(false); const kwSearched = ref(false)
const kwCandidates = ref([]); const kwChecked = ref([]); const kwSubmitting = ref(false)

function resetKwDlg() {
  kwInput.value = ''; kwSearching.value = false; kwSearched.value = false
  kwCandidates.value = []; kwChecked.value = []
}
async function searchKeyword() {
  const kw = kwInput.value.trim()
  if (!kw) { ElMessage.warning('请输入片名'); return }
  kwSearching.value = true; kwSearched.value = false; kwChecked.value = []
  try {
    const r = await api.previewKeyword(kw)
    if (r.ok) {
      kwCandidates.value = r.candidates
      kwSearched.value = true
    } else {
      ElMessage.error(r.error || '搜索失败'); kwCandidates.value = []
    }
  } catch (e) { ElMessage.error('搜索失败: ' + e.message) } finally { kwSearching.value = false }
}
async function confirmKeyword() {
  if (!kwChecked.value.length) return
  kwSubmitting.value = true
  try {
    const picked = kwCandidates.value.filter(c => kwChecked.value.includes(c.fingerprint))
    // 展平为 { sourceId, vodIds } 列表传给后端
    const candidates = []
    for (const c of picked) for (const s of c.sources) candidates.push({ sourceId: s.sourceId, vodIds: s.vodIds })
    const r = await api.confirmKeyword(kwInput.value.trim(), candidates)
    if (r.ok) {
      ElMessage.success('已提交，去「采集任务」页看进度')
      kwDlg.value = false
      ElMessageBox.confirm('采集在后台运行中，是否前往「采集任务」页查看进度？', '已提交', {
        confirmButtonText: '去看进度', cancelButtonText: '留在本页', type: 'success'
      }).then(() => router.push('/tasks')).catch(() => {})
    } else {
      ElMessage.error(r.error || '提交失败')
    }
  } catch (e) { ElMessage.error('提交失败: ' + e.message) } finally { kwSubmitting.value = false }
}

const list = ref([]); const total = ref(0); const loading = ref(false); const types = ref([])
const mstat = ref({})
async function loadMeta() { try { mstat.value = await api.metaStats() } catch {} }
async function backfillSubs() {
  try {
    await ElMessageBox.confirm('将从各采集源回拉详情，为缺小类的影片补全原始小类标签（供大类下钻）。后台任务，去「采集任务」看进度。继续？', '补全小类', { type: 'warning' })
    const r = await api.backfillSubtypes()
    ElMessage.success('已提交，任务#' + r.taskId)
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '提交失败') }
}
async function metaBatch() {
  try {
    await ElMessageBox.confirm('将对未匹配的影片批量抓豆瓣元数据(限速防封，约2.5秒/条)，任务后台运行。继续？', '豆瓣元数据匹配', { type: 'warning' })
    const r = await api.metaBatch({ limit: 50, intervalMs: 2500 })
    ElMessage.success(r.message || '已提交')
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '提交失败') }
}
const q = reactive({ page: 1, size: 20, kw: '', type: '', status: '', year: '' })
const drawer = ref(false); const cur = ref({}); const active = ref([])
const selected = ref([]); const tableRef = ref(null)

async function load() {
  loading.value = true
  try { const r = await api.adminVods(q); list.value = r.list; total.value = r.total } finally { loading.value = false }
}
async function batchAction(action) {
  if (!selected.value.length) return
  const label = { offline: '下架', online: '上架', delete: '删除' }[action]
  try {
    await ElMessageBox.confirm(`确认${label}选中的 ${selected.value.length} 部影片？${action==='delete'?'删除不可恢复，将同时删除其播放线路。':''}`, `批量${label}`, { type: 'warning' })
    const ids = selected.value.map(r => r.id)
    const r = await api.batchVods(ids, action)
    if (r.ok) { ElMessage.success(`已${label} ${r.count} 部`); tableRef.value?.clearSelection(); load() }
    else ElMessage.error(r.error || '操作失败')
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '操作失败') }
}
async function openDetail(row) {
  cur.value = await api.vod(row.id)
  active.value = cur.value.lines?.length ? [cur.value.lines[0].id] : []
  drawer.value = true
}
async function togglePin(row) {
  await api.patchVod(row.id, { pinned: !row.pinned })
  ElMessage.success('已更新'); if (cur.value.id === row.id) cur.value.pinned = !cur.value.pinned; load()
}

// 编辑影片资料
const editDlg = ref(false); const saving = ref(false)
const editForm = ref({})
function openEdit(row) {
  editForm.value = {
    id: row.id, name: row.name, year: row.year, typeName: row.typeName,
    area: row.area, lang: row.lang, actor: row.actor, director: row.director,
    remarks: row.remarks, rating: row.rating ?? '', pic: row.pic, blurb: row.blurb,
  }
  editDlg.value = true
}
async function saveEdit() {
  if (!editForm.value.name?.trim()) return ElMessage.warning('片名不能为空')
  saving.value = true
  try {
    const r = await api.editVod(editForm.value.id, editForm.value)
    if (r.error) return ElMessage.error(r.error)
    ElMessage.success('已保存')
    editDlg.value = false
    if (cur.value.id === editForm.value.id) cur.value = await api.vod(editForm.value.id)
    load()
  } catch (e) { ElMessage.error(e.message || '保存失败') } finally { saving.value = false }
}

// 单片采集更新（刷新剧集）
const refreshing = ref(false)
async function refreshOne(row) {
  row._refreshing = true; refreshing.value = true
  try {
    const r = await api.refreshVod(row.id)
    if (!r.ok) return ElMessage.error(r.error || '更新失败')
    const changed = (r.lines || []).filter(l => l.ok && l.after !== l.before)
    const detail = (r.lines || []).map(l => l.ok ? `${l.source}:${l.before}→${l.after}集` : `${l.source}:${l.msg}`).join('；')
    const picMsg = r.pic === 'repaired' ? '；封面已重拓修复' : r.pic === 'broken_no_alt' ? '；⚠封面打不开且无可用替代图' : ''
    ElMessage({ message: `采集更新完成，${r.updated}/${r.total}条线路刷新。${detail}${picMsg}`, type: (changed.length || r.pic === 'repaired') ? 'success' : 'info', duration: 5000 })
    if (cur.value.id === row.id) cur.value = await api.vod(row.id)
    load()
  } catch (e) { ElMessage.error(e.message || '更新失败') } finally { row._refreshing = false; refreshing.value = false }
}
async function toggleStatus(row) {
  const s = row.status === 'online' ? 'offline' : 'online'
  await api.patchVod(row.id, { status: s }); ElMessage.success('已更新'); load()
}
function copy(url) { navigator.clipboard?.writeText(url); ElMessage.success('已复制播放地址') }
async function matchOne(id) {
  ElMessage.info('正在匹配豆瓣…')
  try {
    const r = await api.metaMatch(id)
    if (r.ok) { ElMessage.success('匹配成功'); cur.value = await api.vod(id); load(); loadMeta() }
    else ElMessage.warning('豆瓣未收录该片')
  } catch (e) { ElMessage.error(e.message) }
}
onMounted(async () => { types.value = await api.categories(); load(); loadMeta() })
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.sec-title { font-size: 16px; font-weight: 600; } .sec-title small { color:#9aa4b2; font-weight:400; margin-left:6px; }
.filters { display: flex; gap: 10px; }
.noimg { width:44px; height:60px; background:#f0f2f5; color:#b8c0cc; font-size:12px;
  display:flex; align-items:center; justify-content:center; border-radius:4px; }
.pager { margin-top: 16px; justify-content: flex-end; }
.detail-head { display: flex; gap: 16px; }
.meta p { margin: 4px 0; font-size: 13px; color: #4a5568; }
.meta code { background:#f0f2f5; padding:1px 6px; border-radius:4px; color:#409eff; }
.ellip { display:inline-block; max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:bottom; }
.blurb { margin-top:14px; font-size:13px; color:#667085; line-height:1.7; max-height:120px; overflow:auto; }
.eps { display: flex; flex-wrap: wrap; gap: 6px; }
.ep { cursor: pointer; }
.db-score { color: #ff9900; font-weight: 700; }
.vod-actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  width: 100%;
}
.vod-actions .el-button + .el-button {
  margin-left: 0;
}
.batch-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; margin-bottom: 12px;
  background: #fdf6ec; border: 1px solid #f5dab1; border-radius: 8px;
  font-size: 13px; color: #b88230;
}
</style>
