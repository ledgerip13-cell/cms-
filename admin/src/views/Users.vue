<template>
  <div class="users-wrap">
    <div class="card">
      <div class="toolbar">
        <div class="sec-title">前台用户</div>
        <div class="ops">
          <el-input v-model="q.kw" clearable placeholder="账号 / 昵称" style="width:220px" @keyup.enter="load" />
          <el-select v-model="q.status" style="width:130px" @change="load">
            <el-option label="全部状态" value="" />
            <el-option label="正常" value="enabled" />
            <el-option label="禁用" value="disabled" />
          </el-select>
          <el-button :icon="Search" type="primary" @click="load">查询</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="用户">
          <template #default="{ row }">
            <div class="user-cell">
              <b>{{ row.username }}</b>
              <span>{{ row.nickname || '未设置昵称' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '正常' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="权益等级" width="140">
          <template #default="{ row }">
            <div class="level-cell">
              <el-tag class="level-preview-tag" :style="levelTagStyle(row.vipLevel)" effect="plain">{{ row.vipLevel?.name || '普通会员' }}</el-tag>
            </div>
            <div v-if="row.isVip && row.vipExpireAt" class="muted">至 {{ fmtDate(row.vipExpireAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="偏好类型" min-width="170">
          <template #default="{ row }">
            <div class="tags">
              <el-tag v-for="t in row.favoriteTypes" :key="t" size="small" effect="plain">{{ t }}</el-tag>
              <span v-if="!row.favoriteTypes.length" class="muted">未设置</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="followCount" label="追剧" width="90" />
        <el-table-column prop="historyCount" label="历史" width="90" />
        <el-table-column label="最近登录" width="180">
          <template #default="{ row }">{{ fmt(row.lastLogin) }}</template>
        </el-table-column>
        <el-table-column label="注册时间" width="180">
          <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">详情</el-button>
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" :type="row.enabled ? 'warning' : 'success'" @click="toggle(row)">
              {{ row.enabled ? '禁用' : '启用' }}
            </el-button>
            <el-button size="small" type="danger" plain @click="openPwd(row)">重置密码</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination background layout="total, prev, pager, next, sizes" :total="total"
          v-model:current-page="q.page" v-model:page-size="q.pageSize" :page-sizes="[10,20,50,100]" @change="load" />
      </div>
    </div>

    <el-drawer v-model="detailOpen" size="520px" title="用户详情">
      <template v-if="detail">
        <div class="detail-head">
          <div>
            <h3>{{ detail.username }}</h3>
            <p>{{ detail.nickname || '未设置昵称' }}</p>
          </div>
          <el-tag :type="detail.enabled ? 'success' : 'info'">{{ detail.enabled ? '正常' : '禁用' }}</el-tag>
        </div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="偏好类型">{{ detail.favoriteTypes.join('、') || '未设置' }}</el-descriptions-item>
          <el-descriptions-item label="VIP等级">
            <el-tag class="level-preview-tag" size="small" :style="levelTagStyle(detail.vipLevel)" effect="plain">{{ detail.vipLevel?.name || '普通会员' }}</el-tag>
            <span v-if="detail.isVip && detail.vipExpireAt" class="level-expire">至 {{ fmt(detail.vipExpireAt) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="追剧数量">{{ detail.followCount }}</el-descriptions-item>
          <el-descriptions-item label="历史数量">{{ detail.historyCount }}</el-descriptions-item>
          <el-descriptions-item label="最近登录">{{ fmt(detail.lastLogin) }}</el-descriptions-item>
        </el-descriptions>

        <div class="asset-title">最近追剧</div>
        <div v-if="detail.follows?.length" class="vod-list">
          <button v-for="x in detail.follows" :key="x.id" type="button" class="vod-line" @click="goVod(x.vod)">
            <span class="vod-name">{{ x.vod?.name }}</span><span>{{ x.vod?.typeName }}</span>
          </button>
        </div>
        <el-empty v-else description="暂无追剧" :image-size="72" />

        <div class="asset-title">最近观看</div>
        <div v-if="detail.histories?.length" class="vod-list">
          <button v-for="x in detail.histories" :key="x.id" type="button" class="vod-line" @click="goVod(x.vod)">
            <span class="vod-name">{{ x.vod?.name }}</span><span>{{ x.epName || `第 ${x.epIndex + 1} 集` }}</span>
          </button>
        </div>
        <el-empty v-else description="暂无观看历史" :image-size="72" />
      </template>
    </el-drawer>

    <el-dialog v-model="editOpen" title="编辑用户" width="460px">
      <el-form label-width="88px">
        <el-form-item label="账号"><el-input v-model="edit.username" disabled /></el-form-item>
        <el-form-item label="昵称"><el-input v-model="edit.nickname" maxlength="32" /></el-form-item>
        <el-form-item label="状态"><el-switch v-model="edit.enabled" active-text="正常" inactive-text="禁用" /></el-form-item>
        <el-form-item label="VIP等级">
          <el-select v-model="edit.vipLevelId" filterable style="width:100%">
            <el-option v-for="level in levelOptions" :key="level.id" :label="level.name" :value="level.id">
              <span class="level-option">
                <el-tag class="level-preview-tag" size="small" :style="levelTagStyle(level)" effect="plain">{{ level.name }}</el-tag>
                <span>{{ level.isVip ? 'VIP权益' : '普通权益' }}</span>
              </span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item v-if="selectedEditLevel?.isVip" label="权益到期">
          <el-date-picker v-model="edit.vipExpireAt" type="datetime" clearable value-format="YYYY-MM-DD HH:mm:ss" placeholder="不填=长期有效" style="width:100%" />
        </el-form-item>
        <el-form-item label="偏好类型">
          <el-select v-model="edit.favoriteTypes" multiple filterable allow-create default-first-option placeholder="输入后回车添加" style="width:100%">
            <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editOpen=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pwdOpen" title="重置密码" width="420px">
      <el-form label-width="88px">
        <el-form-item label="用户"><el-input v-model="pwd.username" disabled /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="pwd.password" type="password" show-password placeholder="至少 6 位" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdOpen=false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="savePwd">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { levelTagStyle } from '../levelTag'

const router = useRouter()
const q = ref({ kw: '', status: '', page: 1, pageSize: 20 })
const rows = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const detailOpen = ref(false)
const editOpen = ref(false)
const pwdOpen = ref(false)
const detail = ref(null)
const edit = ref({ id: 0, username: '', nickname: '', enabled: true, vipLevelId: null, vipExpireAt: '', favoriteTypes: [] })
const pwd = ref({ id: 0, username: '', password: '' })
const typeOptions = ref([])
const levelOptions = ref([])
const selectedEditLevel = computed(() => levelOptions.value.find(level => level.id === edit.value.vipLevelId))

function fmt(v) {
  if (!v) return '—'
  return new Date(v).toLocaleString('zh-CN', { hour12: false })
}
function fmtDate(v) {
  if (!v) return ''
  return new Date(v).toLocaleDateString('zh-CN')
}

async function load() {
  loading.value = true
  try {
    const r = await api.adminUsers(q.value)
    rows.value = r.list || []
    total.value = r.total || 0
  } catch (e) { ElMessage.error(e.message || '加载失败') } finally { loading.value = false }
}

async function loadTypes() {
  try {
    const list = await api.types()
    typeOptions.value = [...new Set((list || []).map(x => x.name || x.typeName || x).filter(Boolean))]
  } catch {}
}

async function loadLevels() {
  try { levelOptions.value = (await api.vipLevels()).filter(level => level.enabled) } catch {}
}

async function openDetail(row) {
  detailOpen.value = true
  detail.value = await api.adminUser(row.id)
}

function openEdit(row) {
  edit.value = {
    ...row,
    vipLevelId: row.vipLevel?.id || levelOptions.value.find(level => level.isDefault)?.id || null,
    vipExpireAt: row.vipExpireAt ? fmt(row.vipExpireAt) : '',
    favoriteTypes: [...(row.favoriteTypes || [])],
  }
  editOpen.value = true
}

function openPwd(row) {
  pwd.value = { id: row.id, username: row.username, password: '' }
  pwdOpen.value = true
}
function goVod(vod) {
  const kw = String(vod?.name || '').trim()
  if (!kw) return
  detailOpen.value = false
  router.push({ path: '/vods', query: { kw } })
}

async function saveEdit() {
  saving.value = true
  try {
    await api.updateAdminUser(edit.value.id, {
      nickname: edit.value.nickname,
      enabled: edit.value.enabled,
      vipLevelId: edit.value.vipLevelId,
      vipExpireAt: selectedEditLevel.value?.isVip ? (edit.value.vipExpireAt || null) : null,
      favoriteTypes: edit.value.favoriteTypes,
    })
    ElMessage.success('用户已更新')
    editOpen.value = false
    await load()
  } catch (e) { ElMessage.error(e.message || '保存失败') } finally { saving.value = false }
}

async function toggle(row) {
  const text = row.enabled ? '禁用' : '启用'
  const ok = await ElMessageBox.confirm(`确认${text}用户「${row.username}」？`, '提示', { type: 'warning' })
    .then(() => true)
    .catch(() => false)
  if (!ok) return
  try {
    await api.updateAdminUser(row.id, { enabled: !row.enabled })
    ElMessage.success(`${text}成功`)
    await load()
  } catch (e) { ElMessage.error(e.message || `${text}失败`) }
}

async function savePwd() {
  if (!pwd.value.password || pwd.value.password.length < 6) return ElMessage.warning('密码至少 6 位')
  saving.value = true
  try {
    await api.resetAdminUserPassword(pwd.value.id, { password: pwd.value.password })
    ElMessage.success('密码已重置')
    pwdOpen.value = false
  } catch (e) { ElMessage.error(e.message || '重置失败') } finally { saving.value = false }
}

onMounted(() => { load(); loadTypes(); loadLevels() })
</script>

<style scoped>
.users-wrap { display: flex; flex-direction: column; gap: 18px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
.ops { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.user-cell { display: flex; flex-direction: column; gap: 3px; }
.user-cell span, .muted { color: var(--text-3); font-size: 12px; }
.level-cell { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.level-cell span { color: var(--text-2); font-size: 12px; font-weight: 700; }
.level-option { display: inline-flex; align-items: center; gap: 8px; }
.level-preview-tag { border-radius: 7px; font-weight: 800; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
.level-expire { margin-left: 8px; color: var(--text-3); font-size: 12px; }
.tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.detail-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.detail-head h3 { margin: 0; font-size: 20px; color: var(--text-1); }
.detail-head p { margin: 4px 0 0; color: var(--text-3); }
.asset-title { font-size: 14px; font-weight: 700; color: var(--text-1); margin: 20px 0 10px; }
.vod-list { display: flex; flex-direction: column; gap: 8px; }
.vod-line { display: flex; justify-content: space-between; gap: 12px; border: 1px solid var(--border);
  border-radius: 8px; padding: 10px 12px; color: var(--text-1); background: #fff; cursor: pointer; text-align: left; }
.vod-line:hover { border-color: var(--el-color-primary-light-5); color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.vod-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vod-line span { color: var(--text-3); font-size: 12px; flex-shrink: 0; }
.vod-line .vod-name { color: inherit; font-size: 13px; flex: 1 1 auto; min-width: 0; }
@media (max-width: 900px) { .toolbar { align-items: flex-start; flex-direction: column; } }
</style>
