<template>
  <div class="hot-wrap">
    <div class="card">
      <div class="toolbar">
        <div>
          <div class="sec-title">热门推荐算法</div>
          <div class="hint">保存规则后，首页热门推荐和热搜榜会按算法动态计算，不手动维护影片池。</div>
        </div>
        <div class="actions">
          <el-button :icon="Refresh" @click="load" :loading="loading">刷新</el-button>
          <el-button type="primary" :icon="Check" @click="save" :loading="saving">保存配置</el-button>
        </div>
      </div>

      <el-form :model="cfg" label-width="110px" class="hot-form">
        <el-form-item label="推荐分类">
          <el-select v-model="cfg.typeNames" multiple clearable collapse-tags collapse-tags-tooltip
            placeholder="全部启用分类" style="width:360px">
            <el-option v-for="t in types" :key="t.name" :label="`${t.name} (${t.count})`" :value="t.name" />
          </el-select>
          <span class="unit">留空=全部启用分类</span>
        </el-form-item>

        <el-form-item label="排序算法">
          <el-radio-group v-model="cfg.sortMode">
            <el-radio-button v-for="s in sortModes" :key="s.value" :value="s.value">{{ s.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="时间范围">
          <el-select v-model="cfg.timeWindowDays" style="width:180px">
            <el-option v-for="t in timeOptions" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>

        <div class="inline-fields">
          <el-form-item label="最低评分">
            <el-input-number v-model="cfg.minRating" :min="0" :max="10" :step="0.1" :precision="1" />
          </el-form-item>
          <el-form-item label="最低热度值">
            <el-input-number v-model="cfg.minRatingCount" :min="0" :max="100000000" :step="100" />
          </el-form-item>
          <el-form-item label="推荐数量">
            <el-input-number v-model="cfg.limit" :min="1" :max="20" />
          </el-form-item>
        </div>
      </el-form>
    </div>

    <div class="card preview-card">
      <div class="toolbar">
        <div>
          <div class="sec-title">当前推荐预览</div>
          <div class="hint">预览使用已保存配置，前台 `/api/hot` 与这里一致。</div>
        </div>
        <el-tag type="success" effect="plain">{{ preview.length }} 部</el-tag>
      </div>
      <el-table :data="preview" v-loading="loading" stripe>
        <el-table-column type="index" label="#" width="52" />
        <el-table-column label="封面" width="72">
          <template #default="{ row }">
            <el-image v-if="row.officialPic || row.pic || row.localPic" :src="coverUrl(row)" fit="cover" class="poster" @error="fallbackCover(row)">
              <template #error><div class="noimg">无图</div></template>
            </el-image>
            <div v-else class="noimg">无图</div>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="片名" min-width="220" show-overflow-tooltip />
        <el-table-column prop="typeName" label="分类" width="90" />
        <el-table-column prop="year" label="年份" width="80" />
        <el-table-column label="评分" width="90">
          <template #default="{ row }"><span class="rating">{{ row.rating || '—' }}</span></template>
        </el-table-column>
        <el-table-column label="热度值" width="110">
          <template #default="{ row }">{{ row.heatValue || row.heatScore || '—' }}</template>
        </el-table-column>
        <el-table-column label="热度来源" width="120">
          <template #default="{ row }">{{ heatSourceText(row.heatSource) }}</template>
        </el-table-column>
        <el-table-column prop="remarks" label="更新" width="110" show-overflow-tooltip />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Check, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api, imgUrl } from '../api'

const loading = ref(false)
const saving = ref(false)
const types = ref([])
const preview = ref([])
const cfg = ref({ typeNames: [], sortMode: 'hot', timeWindowDays: 0, minRating: 0, minRatingCount: 0, limit: 12 })

const sortModes = [
  { value: 'hot', label: '热度优先' },
  { value: 'popularity', label: 'TMDB热度' },
  { value: 'rating', label: '高分优先' },
  { value: 'recent', label: '最新更新' },
  { value: 'created', label: '最近入库' },
  { value: 'pinned', label: '置顶优先' },
]
const timeOptions = [
  { value: 0, label: '不限制' },
  { value: 1, label: '近 1 天' },
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
]

async function load() {
  loading.value = true
  try {
    const [ts, c, p] = await Promise.all([api.categories(), api.hotConfig(), api.hotPreview()])
    types.value = ts
    cfg.value = { ...cfg.value, ...c, typeNames: c.typeNames || [] }
    preview.value = p.list || []
  } catch (e) { ElMessage.error(e.message || '加载失败') }
  finally { loading.value = false }
}

async function save() {
  saving.value = true
  try {
    cfg.value = await api.updateHotConfig(cfg.value)
    const p = await api.hotPreview()
    preview.value = p.list || []
    ElMessage.success('热门推荐算法已保存')
  } catch (e) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

onMounted(load)

function coverUrl(row) {
  if (row?._coverStage === 'local') return imgUrl(row.localPic || '')
  if (row?._coverStage === 'pic') return imgUrl(row.pic || row.localPic || '')
  return imgUrl(row?.officialPic || row?.pic || row?.localPic || '')
}
function heatSourceText(source) {
  if (source === 'tmdb_popularity') return 'TMDB热度'
  if (source === 'rating_count') return '评分人数'
  return '—'
}

function fallbackCover(row) {
  if (!row) return
  if (row._coverStage !== 'pic' && row.officialPic && row.pic) {
    row._coverStage = 'pic'
    return
  }
  if (row._coverStage !== 'local' && row.localPic) row._coverStage = 'local'
}
</script>

<style scoped>
.hot-wrap { display: flex; flex-direction: column; gap: 18px; }
.hint { color: var(--text-3); font-size: 12px; margin-top: 6px; }
.hot-form { max-width: 980px; }
.inline-fields { display: flex; flex-wrap: wrap; gap: 8px 20px; }
.unit { margin-left: 10px; font-size: 12px; color: var(--text-3); }
.preview-card { min-height: 360px; }
.poster, .noimg { width: 44px; height: 60px; border-radius: 4px; overflow: hidden; }
.noimg { background:#f0f2f5; color:#b8c0cc; font-size:12px; display:flex; align-items:center; justify-content:center; }
.rating { color: #f7a23b; font-weight: 700; }
@media (max-width: 900px) { .inline-fields { display: block; } }
</style>
