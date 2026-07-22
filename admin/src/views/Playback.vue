<template>
  <div class="card" v-loading="loading">
    <div class="toolbar">
      <div>
        <div class="sec-title">播放策略</div>
        <div class="hint">全局播放回源、转存清晰度、重复通道隐藏等策略。各采集源可单独覆盖。</div>
      </div>
      <el-button type="primary" :icon="Check" :loading="saving" @click="save">保存</el-button>
    </div>
    <el-form :model="form" label-width="140px" class="play-form">
      <el-form-item label="隐藏重复通道">
        <el-switch v-model="form.hideDuplicateSourceChannels" inline-prompt active-text="开启" inactive-text="关闭" />
        <div class="hint inline">同一采集源下，若 HLS 直链与 share/iframe 包装通道集数完全一致，观众端只显示直链通道。</div>
      </el-form-item>
      <el-form-item label="全局回源模式">
        <el-select v-model="form.proxyMode" style="width:300px">
          <el-option label="direct 直连源站（默认，不吃带宽）" value="direct" />
          <el-option label="key 仅代理密钥（加密源，TS直连）" value="key" />
          <el-option label="proxy TS全中转（藏源/防盗链，吃带宽）" value="proxy" />
        </el-select>
        <div class="hint inline">采集源回源模式选"跟随全局"时使用此默认值。</div>
      </el-form-item>
      <el-form-item label="本地转存清晰度">
        <el-select v-model="form.archiveResolution" style="width:300px">
          <el-option label="最高清（体积最大）" :value="0" />
          <el-option label="1080P 蓝光" :value="1080" />
          <el-option label="720P 高清（推荐）" :value="720" />
          <el-option label="480P 标清（最省盘）" :value="480" />
        </el-select>
        <div class="hint inline">金牌等源本地转存时下载的清晰度上限。降清晰度可成倍提速并省磁盘。</div>
      </el-form-item>
      <el-divider content-position="left">片头片尾</el-divider>
      <el-form-item label="跳过片头片尾">
        <el-switch v-model="form.skipIntroEnabled" inline-prompt active-text="开启" inactive-text="关闭" />
        <div class="hint inline">开启后前台播放器会按下方秒数自动跳过片头，片尾进入下一集。</div>
      </el-form-item>
      <el-form-item label="片头秒数">
        <el-input-number v-model="form.skipIntroSeconds" :min="0" :max="600" :step="5" controls-position="right" />
        <div class="hint inline">0 表示不跳片头。</div>
      </el-form-item>
      <el-form-item label="片尾秒数">
        <el-input-number v-model="form.skipOutroSeconds" :min="0" :max="600" :step="5" controls-position="right" />
        <div class="hint inline">距离结尾小于该秒数时触发片尾跳过；0 表示不跳片尾。</div>
      </el-form-item>
      <el-divider content-position="left">字幕</el-divider>
      <el-form-item label="默认字幕">
        <el-select v-model="form.subtitleDefault" style="width:220px">
          <el-option label="有字幕时自动开启" value="auto" />
          <el-option label="默认关闭" value="off" />
        </el-select>
      </el-form-item>
      <el-form-item label="字幕字号">
        <el-input-number v-model="form.subtitleFontSize" :min="14" :max="40" :step="1" controls-position="right" />
      </el-form-item>
      <el-form-item label="字幕颜色">
        <el-color-picker v-model="form.subtitleColor" />
        <el-color-picker v-model="form.subtitleBackground" show-alpha />
        <div class="hint inline">第一个为文字颜色，第二个为字幕背景色。</div>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Check } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api, normalizePlayConfig } from '../api'

const loading = ref(false)
const saving = ref(false)
const form = ref(normalizePlayConfig({}))

async function load() {
  loading.value = true
  try {
    const site = await api.adminSite()
    form.value = normalizePlayConfig(site.playConfig || {})
  } finally { loading.value = false }
}

async function save() {
  saving.value = true
  try {
    await api.updateSite({ playConfig: form.value })
    ElMessage.success('播放策略已保存')
  } catch (e) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
.sec-title { font-size: 16px; font-weight: 700; color: var(--text-1); }
.hint { color: var(--text-3); font-size: 12px; margin-top: 4px; }
.hint.inline { flex: 0 0 100%; }
.play-form :deep(.el-form-item__content) { flex-wrap: wrap; gap: 4px 8px; }
</style>
