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
        <el-button type="warning" :icon="MagicStick" @click="metaBatch">
          豆瓣匹配<span v-if="mstat.none" style="margin-left:2px">（{{ mstat.none }} 待匹）</span>
        </el-button>
        <el-button :icon="CollectionTag" @click="backfillSubs">补全小类</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" stripe @row-click="openDetail">
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
import { Search, MagicStick, StarFilled, EditPen, Refresh, CollectionTag } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'

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
const q = reactive({ page: 1, size: 20, kw: '', type: '' })
const drawer = ref(false); const cur = ref({}); const active = ref([])

async function load() {
  loading.value = true
  try { const r = await api.vods(q); list.value = r.list; total.value = r.total } finally { loading.value = false }
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
</style>
