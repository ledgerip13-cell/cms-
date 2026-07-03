<template>
  <div class="meta-wrap">
    <!-- 统计 -->
    <div class="stat-row">
      <div class="stat-card" v-for="s in statCards" :key="s.k">
        <div class="stat-num" :style="{color:s.color}">{{ stat[s.k] ?? '—' }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color:#4f6ef7">{{ matchRate }}%</div>
        <div class="stat-label">匹配率</div>
      </div>
    </div>

    <div class="cols">
      <!-- 手动操作 -->
      <div class="card">
        <div class="sec-title" style="margin-bottom:16px">豆瓣元数据匹配</div>
        <el-alert type="info" :closable="false" style="margin-bottom:16px"
          title="从豆瓣抓取评分/简介/高清封面并落库。抓一次存库，前端读库不实时请求。短剧类豆瓣多无收录，属正常。" />
        <div class="ops">
          <el-button type="primary" :icon="MagicStick" @click="run(false)">
            匹配未处理（{{ stat.none || 0 }} 部）
          </el-button>
          <el-button :icon="RefreshRight" @click="run(true)">
            重刷失败/全部（{{ stat.failed || 0 }} 失败）
          </el-button>
        </div>
        <p class="tip">任务在后台运行，进度见「采集任务」页。低置信会进入待确认，不会自动写入豆瓣 ID。当前限速 {{ cfg.intervalMs }}ms/条、每批 {{ cfg.batchLimit }} 部。</p>
      </div>

      <!-- 参数设置 -->
      <div class="card">
        <div class="toolbar">
          <div class="sec-title">采集参数设置</div>
          <el-button type="primary" :icon="Check" :loading="saving" @click="save">保存</el-button>
        </div>
        <el-form :model="cfg" label-width="120px">
          <el-form-item label="限速间隔">
            <el-input-number v-model="cfg.intervalMs" :min="1000" :max="10000" :step="500" />
            <span class="unit">毫秒/条（越大越安全，防豆瓣封 IP）</span>
          </el-form-item>
          <el-form-item label="每批数量">
            <el-input-number v-model="cfg.batchLimit" :min="10" :max="500" :step="10" />
            <span class="unit">部/次</span>
          </el-form-item>
          <el-divider>定时自动匹配</el-divider>
          <el-form-item label="自动匹配">
            <el-switch v-model="cfg.autoMatch" />
          </el-form-item>
          <template v-if="cfg.autoMatch">
            <el-form-item label="匹配频率">
              <el-select v-model="cfg.cronExpr" style="width:220px">
                <el-option label="每 6 小时" value="0 */6 * * *" />
                <el-option label="每 12 小时" value="0 */12 * * *" />
                <el-option label="每天凌晨 4 点" value="0 4 * * *" />
                <el-option label="每天凌晨 2 点" value="0 2 * * *" />
              </el-select>
            </el-form-item>
            <el-form-item label="一并重试失败">
              <el-switch v-model="cfg.redoFailed" />
              <span class="unit">开启则定时任务也重刷之前失败的</span>
            </el-form-item>
          </template>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Check, MagicStick, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'

const stat = ref({}); const cfg = ref({ intervalMs:2500, batchLimit:50, autoMatch:false, cronExpr:'0 4 * * *', redoFailed:false })
const saving = ref(false)
const statCards = [
  { k:'total', label:'影片总数', color:'#1a1f2b' },
  { k:'matched', label:'已匹配', color:'#16a34a' },
  { k:'pending', label:'待确认', color:'#e6a23c' },
  { k:'failed', label:'无收录', color:'#98a1b0' },
  { k:'none', label:'待匹配', color:'#4f6ef7' },
]
const matchRate = computed(() => stat.value.total ? Math.round((stat.value.matched / stat.value.total) * 100) : 0)

async function load() { stat.value = await api.metaStats(); cfg.value = await api.metaConfig() }
async function run(redo) {
  try {
    const r = redo ? await api.metaBatchRedo() : await api.metaBatch({ limit: cfg.value.batchLimit, intervalMs: cfg.value.intervalMs })
    ElMessage.success(r.message || '任务已提交，去「采集任务」看进度')
  } catch (e) { ElMessage.error(e.message || '提交失败') }
}
async function save() {
  saving.value = true
  try { await api.updateMetaConfig(cfg.value); ElMessage.success('设置已保存' + (cfg.value.autoMatch ? '，定时匹配已启用' : '')) }
  catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}
onMounted(load)
</script>

<style scoped>
.stat-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; margin-bottom: 20px; }
.stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px;
  padding: 18px 20px; box-shadow: var(--shadow-card); }
.stat-num { font-size: 26px; font-weight: 750; }
.stat-label { font-size: 13px; color: var(--text-3); margin-top: 4px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
.ops { display: flex; gap: 12px; flex-wrap: wrap; }
.tip { font-size: 12px; color: var(--text-3); margin-top: 14px; }
.unit { margin-left: 10px; font-size: 12px; color: var(--text-3); }
@media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } .stat-row { grid-template-columns: repeat(2,1fr); } }
</style>
