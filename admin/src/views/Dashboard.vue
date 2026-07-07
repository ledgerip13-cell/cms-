<template>
  <div>
    <el-row :gutter="16">
      <el-col :xs="24" :sm="12" :md="6" v-for="c in cards" :key="c.k" class="stat-col">
        <div class="card stat">
          <div class="stat-icon" :style="{background:c.bg}"><el-icon><component :is="c.icon" /></el-icon></div>
          <div>
            <div class="stat-num">{{ stat[c.k] ?? '-' }}</div>
            <div class="stat-label">{{ c.label }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="card" style="margin-top:16px">
      <div class="sec-title">分类分布</div>
      <div class="types">
        <el-tag v-for="t in types" :key="t.name" size="large" effect="plain" class="type-tag">
          {{ t.name || '未分类' }} <b>{{ t.count }}</b>
        </el-tag>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
const stat = ref({})
const types = ref([])
const cards = [
  { k: 'vods', label: '影片总数(去重后)', icon: 'Film', bg: '#409eff' },
  { k: 'plays', label: '播放线路总数', icon: 'VideoPlay', bg: '#67c23a' },
  { k: 'sources', label: '采集源', icon: 'Connection', bg: '#e6a23c' },
  { k: 'online', label: '在线影片', icon: 'View', bg: '#f56c6c' },
]
onMounted(async () => {
  stat.value = await api.stats()
  types.value = await api.types()
})
</script>

<style scoped>
.stat { display: flex; align-items: center; gap: 16px; }
.stat-col { margin-bottom: 16px; }
.stat-icon { width: 52px; height: 52px; border-radius: 12px; display: flex; align-items: center;
  justify-content: center; color: #fff; font-size: 24px; }
.stat-num { font-size: 28px; font-weight: 700; color: #1f2430; }
.stat-label { font-size: 13px; color: #9aa4b2; margin-top: 2px; }
.sec-title { font-size: 15px; font-weight: 600; margin-bottom: 14px; }
.types { display: flex; flex-wrap: wrap; gap: 10px; }
.type-tag b { color: #409eff; margin-left: 4px; }
@media (max-width: 640px) {
  .stat { min-height: 88px; }
  .stat-num { font-size: 24px; }
}
</style>
