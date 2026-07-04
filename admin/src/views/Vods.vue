<template>
  <div class="card">
    <div class="bar">
      <div class="filters">
        <el-input v-model="q.kw" placeholder="搜索片名" clearable style="width:180px" @keyup.enter="applyFilters" :prefix-icon="Search" />
        <el-select v-model="q.type" placeholder="全部分类" clearable style="width:140px" @change="applyFilters">
          <el-option v-for="t in types" :key="t.name" :label="`${t.name||'未分类'}(${t.count})`" :value="t.name" />
        </el-select>
        <el-select v-model="q.status" placeholder="全部状态" clearable style="width:120px" @change="applyFilters">
          <el-option label="在线" value="online" />
          <el-option label="下架" value="offline" />
        </el-select>
        <el-select v-model="q.sourceId" placeholder="全部源" clearable filterable style="width:160px" @change="applyFilters">
          <el-option v-for="s in sourceOptions" :key="s.id" :label="`${s.name}${s.enabled ? '' : '（已禁用）'}`" :value="s.id" />
        </el-select>
        <el-button type="primary" @click="applyFilters">查询</el-button>
        <el-button type="success" :icon="Plus" @click="kwDlg=true">按片名采集</el-button>
        <el-button type="warning" :icon="MagicStick" @click="metaBatch">
          豆瓣匹配<span v-if="mstat.none || mstat.pending" style="margin-left:2px">（{{ mstat.none }} 待匹 / {{ mstat.pending || 0 }} 待确认）</span>
        </el-button>
        <el-button :icon="CollectionTag" @click="backfillSubs">补全小类</el-button>
        <el-button type="danger" plain @click="cleanupDlg=true">影片清理</el-button>
      </div>
      <div class="vod-count">去重后 {{ total }} 部</div>
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

      <el-divider content-position="left">采集后动作</el-divider>
      <div class="kw-post-actions">
        <el-checkbox v-model="kwOptions.metaAfterCollect">采集后豆瓣匹配</el-checkbox>
        <el-checkbox v-model="kwOptions.cleanAfterCollect">采集后HLS清洗</el-checkbox>
      </div>

      <template #footer>
        <el-button @click="kwDlg=false">取消</el-button>
        <el-button type="primary" :disabled="!kwChecked.length" :loading="kwSubmitting" @click="confirmKeyword">
          采集选中项（{{ kwChecked.length }}）
        </el-button>
      </template>
    </el-dialog>

    <div v-if="selected.length" class="batch-bar">
      <span>已选 {{ selected.length }} 项</span>
      <el-button size="small" type="primary" plain @click="batchMetaMatch">批量匹配豆瓣</el-button>
      <el-button size="small" type="warning" @click="batchAction('offline')">批量下架</el-button>
      <el-button size="small" type="success" @click="batchAction('online')">批量上架</el-button>
      <el-button size="small" type="danger" @click="batchAction('delete')">批量删除</el-button>
      <el-button size="small" link @click="tableRef?.clearSelection()">取消选择</el-button>
    </div>

    <el-table ref="tableRef" :data="list" v-loading="loading" stripe @row-click="openDetail" @selection-change="v => selected = v">
      <el-table-column type="selection" width="42" @click.stop />
      <el-table-column label="封面" width="70">
        <template #default="{ row }">
          <el-image v-if="row.officialPic || row.pic" :src="coverUrl(row)" fit="cover" style="width:44px;height:60px;border-radius:4px" lazy @error="fallbackCover(row)">
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
          <el-tag v-else-if="row.metaMatched==='pending'" size="small" type="warning">待确认 {{ row.metaScore || '' }}</el-tag>
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
        <el-image v-if="cur.officialPic || cur.pic" :src="coverUrl(cur)" fit="cover" style="width:110px;height:150px;border-radius:8px" @error="fallbackCover(cur)" />
        <div class="meta">
          <p><b>年份:</b> {{ cur.year || '—' }} · <b>分类:</b> {{ cur.typeName || '—' }}</p>
          <p><b>地区:</b> {{ cur.area || '—' }} · <b>语言:</b> {{ cur.lang || '—' }}</p>
          <p><b>主演:</b> <span class="ellip">{{ cur.actor || '—' }}</span></p>
          <p><b>指纹:</b> <code>{{ cur.fingerprint }}</code></p>
          <p><b>更新:</b> {{ cur.remarks }}</p>
          <p v-if="cur.heroPic"><b>首页图:</b> 已设置</p>
          <p>
            <b>豆瓣:</b>
            <span v-if="cur.rating" class="rating"><el-icon><StarFilled /></el-icon>{{ cur.rating }}</span>
            <el-tag v-else-if="cur.metaMatched==='pending'" size="small" type="warning">待确认 {{ cur.metaScore || '' }}</el-tag>
            <span v-else style="color:#9aa4b2">{{ cur.metaMatched==='failed'?'无收录':'未匹配' }}</span>
            <el-button size="small" text type="primary" @click="matchOne(cur.id)">
              {{ cur.rating ? '重新匹配' : '匹配豆瓣' }}
            </el-button>
            <a v-if="cur.doubanId" :href="`https://movie.douban.com/subject/${cur.doubanId}/`" target="_blank"
              style="font-size:12px;color:#409eff">查看豆瓣页 ↗</a>
          </p>
          <p v-if="cur.matchedTitle || cur.metaScore">
            <b>置信:</b> {{ cur.metaScore || 0 }}<span v-if="cur.matchedTitle"> · {{ cur.matchedTitle }} {{ cur.matchedYear ? '(' + cur.matchedYear + ')' : '' }}</span>
          </p>
          <p v-if="cur.genres"><b>豆瓣类型:</b> {{ cur.genres }}</p>
        </div>
      </div>
      <div v-if="pendingCandidates(cur).length" class="meta-candidates">
        <div class="cand-title">低置信候选 · 请人工确认</div>
        <div v-for="c in pendingCandidates(cur)" :key="c.id" class="cand-item">
          <div class="cand-main">
            <el-image v-if="c.img" :src="imgUrl(c.img)" fit="cover" class="cand-img" />
            <div class="cand-info">
              <div><b>{{ c.title }}</b><span v-if="c.year" class="cand-year">({{ c.year }})</span></div>
              <div class="cand-sub">{{ c.subTitle || c.type || '—' }}</div>
              <div class="cand-sub">分数 {{ c.score }} · {{ reasonText(c.reasons) }}</div>
            </div>
          </div>
          <div class="cand-actions">
            <el-button size="small" type="primary" @click="confirmDouban(cur.id, c)">确认此项</el-button>
            <a :href="`https://movie.douban.com/subject/${c.id}/`" target="_blank">打开</a>
          </div>
        </div>
      </div>
      <p class="blurb" v-if="cur.officialIntro" style="border-left:3px solid #409eff;padding-left:10px">
        <b style="color:#409eff">豆瓣简介:</b> {{ cur.officialIntro }}
      </p>
      <div v-if="cur.people?.length" class="asset-box">
        <div class="asset-title">人物资产</div>
        <el-tag v-for="p in cur.people" :key="p.id" size="small" effect="plain" style="margin:0 6px 6px 0">
          {{ p.role === 'director' ? '导演' : '演员' }} · {{ p.person.name }}
        </el-tag>
      </div>
      <div v-if="cur.images?.length" class="asset-box">
        <div class="asset-title">图片资产</div>
        <div class="asset-imgs">
          <el-image v-for="img in cur.images.slice(0, 12)" :key="img.id" :src="imgUrl(img.url)" fit="cover" class="asset-img">
            <template #error><div class="noimg">无图</div></template>
          </el-image>
        </div>
      </div>
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
          <template #append><el-image v-if="editForm.pic" :src="imgUrl(editForm.pic)" style="width:28px;height:38px" fit="cover" /></template>
        </el-input>
      </el-form-item>
      <el-form-item label="首页图">
        <el-input v-model="editForm.heroPic" placeholder="横版剧照/背景图 URL，首页 Hero 优先使用">
          <template #append><el-image v-if="editForm.heroPic" :src="imgUrl(editForm.heroPic)" style="width:48px;height:28px" fit="cover" /></template>
        </el-input>
      </el-form-item>
      <el-form-item label="简介"><el-input v-model="editForm.blurb" type="textarea" :rows="3" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="editDlg=false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="cleanupDlg" title="影片清理" width="760">
    <el-form :model="cleanupForm" label-width="100px">
      <el-form-item label="清理规则">
        <el-select v-model="cleanupForm.rule" style="width:260px" @change="cleanupPreview=null">
          <el-option label="没有任何播放线路" value="empty_plays" />
          <el-option label="全部线路失效" value="all_dead" />
          <el-option label="只剩禁用源线路" value="disabled_source_only" />
          <el-option label="下架超过 N 天" value="offline_old" />
          <el-option label="按源清退线路" value="source_lines" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="cleanupForm.rule === 'source_lines'" label="采集源">
        <el-select v-model="cleanupForm.sourceId" filterable style="width:260px">
          <el-option v-for="s in sourceOptions" :key="s.id" :label="`${s.name}${s.enabled ? '' : '（已禁用）'}`" :value="s.id" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="cleanupForm.rule === 'offline_old'" label="下架天数">
        <el-input-number v-model="cleanupForm.days" :min="1" :max="3650" />
      </el-form-item>
      <el-form-item label="年份筛选">
        <div class="year-filter">
          <el-select v-model="cleanupForm.yearMode" placeholder="不限" style="width:120px" @change="cleanupPreview=null">
            <el-option label="不限" value="" />
            <el-option label="等于" value="eq" />
            <el-option label="大于" value="gt" />
            <el-option label="大于等于" value="gte" />
            <el-option label="小于" value="lt" />
            <el-option label="小于等于" value="lte" />
            <el-option label="区间" value="range" />
          </el-select>
          <template v-if="cleanupForm.yearMode && cleanupForm.yearMode !== 'range'">
            <el-input-number v-model="cleanupForm.year" :min="1900" :max="2100" controls-position="right" @change="cleanupPreview=null" />
          </template>
          <template v-else-if="cleanupForm.yearMode === 'range'">
            <el-input-number v-model="cleanupForm.yearStart" :min="1900" :max="2100" controls-position="right" @change="cleanupPreview=null" />
            <span class="muted">至</span>
            <el-input-number v-model="cleanupForm.yearEnd" :min="1900" :max="2100" controls-position="right" @change="cleanupPreview=null" />
          </template>
          <span v-else class="muted">不过滤年份</span>
        </div>
      </el-form-item>
      <el-form-item label="执行上限">
        <el-input-number v-model="cleanupForm.limit" :min="1" :max="5000" />
      </el-form-item>
      <el-form-item v-if="cleanupForm.rule === 'source_lines'" label="孤片处理">
        <el-checkbox v-model="cleanupForm.deleteOrphans">清退线路后，顺手删除无线路影片</el-checkbox>
      </el-form-item>
    </el-form>
    <div class="cleanup-actions">
      <el-button type="primary" plain :loading="cleanupLoading" @click="previewCleanup">预检</el-button>
      <el-button type="danger" :disabled="!cleanupPreview?.total && !cleanupPreview?.playCount" :loading="cleanupLoading" @click="executeCleanup">确认执行</el-button>
    </div>
    <el-alert v-if="cleanupPreview" type="warning" :closable="false" show-icon
      :title="cleanupPreview.mode === 'delete_lines'
        ? `将删除 ${cleanupPreview.playCount || 0} 条线路，涉及 ${cleanupPreview.total || 0} 部影片`
        : `将删除 ${cleanupPreview.total || 0} 部影片`" />
    <el-table v-if="cleanupPreview?.samples?.length" :data="cleanupPreview.samples" size="small" style="margin-top:12px" max-height="260">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="片名" min-width="180" />
      <el-table-column prop="year" label="年份" width="80" />
      <el-table-column prop="typeName" label="分类" width="100" />
      <el-table-column label="线路" width="80">
        <template #default="{ row }">{{ row._count?.plays || 0 }}</template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">{{ row.status === 'online' ? '在线' : '下架' }}</template>
      </el-table-column>
    </el-table>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Search, MagicStick, StarFilled, EditPen, Refresh, CollectionTag, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
const router = useRouter()

const kwDlg = ref(false); const kwInput = ref('')
const kwSearching = ref(false); const kwSearched = ref(false)
const kwCandidates = ref([]); const kwChecked = ref([]); const kwSubmitting = ref(false)
const kwOptions = ref({ metaAfterCollect: true, cleanAfterCollect: false })

function resetKwDlg() {
  kwInput.value = ''; kwSearching.value = false; kwSearched.value = false
  kwCandidates.value = []; kwChecked.value = []
  kwOptions.value = { metaAfterCollect: true, cleanAfterCollect: false }
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
    const r = await api.confirmKeyword(kwInput.value.trim(), candidates, kwOptions.value)
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

const list = ref([]); const total = ref(0); const loading = ref(false); const types = ref([]); const sourceOptions = ref([])
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
const q = reactive({ page: 1, size: 20, kw: '', type: '', status: '', sourceId: '', year: '' })
const drawer = ref(false); const cur = ref({}); const active = ref([])
const selected = ref([]); const tableRef = ref(null)
const cleanupDlg = ref(false)
const cleanupLoading = ref(false)
const cleanupPreview = ref(null)
const currentYear = new Date().getFullYear()
const cleanupForm = ref({
  rule: 'disabled_source_only',
  sourceId: '',
  days: 30,
  limit: 500,
  deleteOrphans: true,
  yearMode: '',
  year: currentYear,
  yearStart: currentYear,
  yearEnd: currentYear,
})

function coverUrl(row) {
  return imgUrl(row?._coverFallback ? row.pic : (row.officialPic || row.pic || ''))
}
function fallbackCover(row) {
  if (row?.officialPic && row?.pic && !row._coverFallback) row._coverFallback = true
}

async function load() {
  loading.value = true
  try { const r = await api.adminVods(q); list.value = r.list; total.value = r.total } finally { loading.value = false }
}
function applyFilters() {
  q.page = 1
  load()
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
async function batchMetaMatch() {
  if (!selected.value.length) return
  const ok = await ElMessageBox.confirm(`确认提交 ${selected.value.length} 部影片进行豆瓣匹配？`, '批量豆瓣匹配', { type: 'warning' })
    .then(() => true).catch(() => false)
  if (!ok) return
  try {
    const r = await api.metaBatch({ vodIds: selected.value.map(r => r.id), limit: selected.value.length, intervalMs: 2500, priority: 50, redo: true })
    ElMessage.success(r.message || `已提交任务 #${r.taskId}`)
    tableRef.value?.clearSelection()
  } catch (e) { ElMessage.error(e.message || '提交失败') }
}
async function previewCleanup() {
  cleanupLoading.value = true
  try {
    const r = await api.previewVodCleanup(cleanupForm.value)
    if (!r.ok) return ElMessage.error(r.error || '预检失败')
    cleanupPreview.value = r
  } catch (e) { ElMessage.error(e.message || '预检失败') } finally { cleanupLoading.value = false }
}
async function executeCleanup() {
  if (!cleanupPreview.value) return
  const msg = cleanupPreview.value.mode === 'delete_lines'
    ? `确认删除 ${cleanupPreview.value.playCount || 0} 条线路？`
    : `确认删除 ${cleanupPreview.value.total || 0} 部影片？`
  const ok = await ElMessageBox.confirm(msg, '确认清理', { type: 'warning' }).then(() => true).catch(() => false)
  if (!ok) return
  cleanupLoading.value = true
  try {
    const r = await api.executeVodCleanup(cleanupForm.value)
    if (!r.ok) return ElMessage.error(r.error || '清理失败')
    ElMessage.success(`清理完成：影片 ${r.deletedVods || r.deletedOrphans || 0}，线路 ${r.deletedLines || 0}`)
    cleanupPreview.value = null
    cleanupDlg.value = false
    load()
  } catch (e) { ElMessage.error(e.message || '清理失败') } finally { cleanupLoading.value = false }
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
    remarks: row.remarks, rating: row.rating ?? '', pic: row.pic, heroPic: row.heroPic, blurb: row.blurb,
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
    if (r.status === 'matched') ElMessage.success(`匹配成功，置信 ${r.score}`)
    else if (r.status === 'pending') ElMessage.warning(`低置信候选，已转待确认（${r.score}分）`)
    else ElMessage.warning('豆瓣未收录或置信过低')
    cur.value = await api.vod(id); load(); loadMeta()
  } catch (e) { ElMessage.error(e.message) }
}
function parseMetaReason(row) {
  try { return JSON.parse(row?.metaReason || '{}') } catch { return {} }
}
const reasonMap = {
  manual: '人工确认',
  no_suggest: '豆瓣无候选',
  detail_failed: '豆瓣详情获取失败',
  title_exact: '标题完全一致',
  title_contains: '标题互相包含',
  title_similar: '标题相似',
  title_weak: '标题弱相关',
  year_match: '年份一致',
  year_near: '年份接近',
  year_mismatch: '年份不一致',
  season_match: '季数一致',
  season_mismatch: '季数不一致',
  special_match: '特别篇标记一致',
  special_missing: '候选缺少特别篇标记',
  type_match: '分类匹配',
  type_mismatch: '分类不一致',
  director_match: '导演匹配',
  director_mismatch: '导演不一致',
  actors_match: '多名演员匹配',
  actor_match: '演员匹配',
  actors_mismatch: '演员不一致',
}
const reasonText = (reasons) => {
  const list = Array.isArray(reasons) ? reasons : []
  return list.length ? list.map(r => reasonMap[r] || '其他匹配信号').join(' / ') : '—'
}
function pendingCandidates(row) {
  if (row?.metaMatched !== 'pending') return []
  return Array.isArray(parseMetaReason(row).candidates) ? parseMetaReason(row).candidates : []
}
async function confirmDouban(id, c) {
  try {
    await ElMessageBox.confirm(`确认匹配豆瓣《${c.title}》${c.year ? '（' + c.year + '）' : ''}？`, '确认豆瓣候选', { type: 'warning' })
    const r = await api.metaSet(id, c.id)
    if (r.ok) {
      ElMessage.success('已确认豆瓣匹配')
      cur.value = await api.vod(id); load(); loadMeta()
    } else ElMessage.error(r.error || '确认失败')
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '确认失败') }
}
onMounted(async () => {
  const [catRows, sourceRows] = await Promise.all([api.categories(), api.sources()])
  types.value = catRows
  sourceOptions.value = sourceRows
  load()
  loadMeta()
})
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.sec-title { font-size: 16px; font-weight: 600; } .sec-title small { color:#9aa4b2; font-weight:400; margin-left:6px; }
.filters { display: flex; align-items: center; gap: 10px; flex: 1 1 760px; min-width: 0; flex-wrap: wrap; }
.filters :deep(.el-button + .el-button) { margin-left: 0; }
.vod-count { flex: 0 0 auto; color:#9aa4b2; font-size:13px; line-height:32px; white-space: nowrap; }
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
.cleanup-actions { display: flex; justify-content: flex-end; gap: 10px; margin: 6px 0 12px; }
.kw-post-actions { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.kw-post-actions :deep(.el-checkbox) { margin-right: 0; }
.year-filter { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.muted { color: #9aa4b2; font-size: 12px; }
.meta-candidates { margin: 14px 0; border: 1px solid #f5dab1; background: #fdf6ec; border-radius: 10px; padding: 12px; }
.cand-title { font-weight: 700; color: #b88230; margin-bottom: 10px; }
.cand-item { display:flex; align-items:center; justify-content:space-between; gap: 12px; padding: 10px; background:#fff; border-radius:8px; margin-bottom:8px; }
.cand-item:last-child { margin-bottom:0; }
.cand-main { display:flex; align-items:center; gap:10px; min-width:0; }
.cand-img { width:40px; height:56px; border-radius:4px; flex-shrink:0; }
.cand-info { min-width:0; font-size:13px; }
.cand-year { color:#98a1b0; margin-left:4px; }
.cand-sub { color:#98a1b0; font-size:12px; margin-top:3px; word-break:break-all; }
.cand-actions { display:flex; align-items:center; gap:10px; flex-shrink:0; }
.cand-actions a { color:#409eff; font-size:12px; text-decoration:none; }
.asset-box { margin: 14px 0; padding: 12px; border: 1px solid #e4e7ed; border-radius: 10px; background: #fafbfc; }
.asset-title { font-weight: 700; color: #4a5568; margin-bottom: 10px; }
.asset-imgs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.asset-img { width: 100%; aspect-ratio: 16/9; border-radius: 6px; overflow: hidden; background: #f0f2f5; }
</style>
