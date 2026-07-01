<template>
  <div class="site-wrap">
    <div class="card">
      <div class="toolbar">
        <div class="sec-title">站点基础信息</div>
        <el-button type="primary" :icon="Check" :loading="saving" @click="save">保存设置</el-button>
      </div>

      <el-form :model="form" label-width="100px" class="site-form">
        <el-form-item label="网站名称">
          <el-input v-model="form.siteName" placeholder="如：次元港" maxlength="30" show-word-limit style="max-width:360px" />
        </el-form-item>

        <el-form-item label="网站图标">
          <div class="logo-row">
            <div class="logo-preview">
              <img v-if="form.logo" :src="form.logo" alt="logo" />
              <el-icon v-else :size="24" color="#c0c4cc"><Picture /></el-icon>
            </div>
            <div class="logo-actions">
              <el-upload :show-file-list="false" :before-upload="onLogo" accept="image/*">
                <el-button :icon="Upload">上传图标</el-button>
              </el-upload>
              <el-input v-model="form.logo" placeholder="或粘贴图片 URL" style="width:320px;margin-top:8px" />
              <div class="hint">支持 PNG/JPG/SVG，建议正方形，&lt; 200KB（作为 Logo 与浏览器图标）</div>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="网站描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="120" show-word-limit
            placeholder="一句话介绍网站" style="max-width:520px" />
        </el-form-item>

        <el-form-item label="SEO 关键词">
          <el-input v-model="form.keywords" placeholder="逗号分隔，如：动漫,在线观看,追剧" style="max-width:520px" />
        </el-form-item>

        <el-form-item label="页脚文字">
          <el-input v-model="form.footer" placeholder="如：次元港 · 多源聚合" style="max-width:520px" />
        </el-form-item>

        <el-form-item label="站点公告">
          <el-input v-model="form.announcement" type="textarea" :rows="2"
            placeholder="可选，展示在前端顶部（留空不显示）" style="max-width:520px" />
        </el-form-item>
      </el-form>
    </div>

    <!-- 前端预览 -->
    <div class="card preview-card">
      <div class="sec-title" style="margin-bottom:14px">前端效果预览</div>
      <div class="preview-nav">
        <div class="pv-brand">
          <img v-if="form.logo" :src="form.logo" class="pv-logo" />
          <span>{{ form.siteName || '次元港' }}</span>
        </div>
        <div class="pv-search">搜索影片…</div>
      </div>
      <p class="pv-desc">{{ form.description || '（网站描述）' }}</p>
      <p class="pv-foot">{{ form.footer || '（页脚文字）' }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Check, Upload, Picture } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'

const form = ref({ siteName:'', logo:'', description:'', keywords:'', footer:'', announcement:'' })
const saving = ref(false)

async function load() { form.value = await api.site() }

function onLogo(file) {
  if (file.size > 200 * 1024) { ElMessage.warning('图标建议小于 200KB'); return false }
  const reader = new FileReader()
  reader.onload = e => { form.value.logo = e.target.result }
  reader.readAsDataURL(file)
  return false // 阻止自动上传，转 base64 存 DB
}

async function save() {
  saving.value = true
  try {
    await api.updateSite(form.value)
    ElMessage.success('站点设置已保存，前端刷新后生效')
  } catch (e) { ElMessage.error(e.message || '保存失败') } finally { saving.value = false }
}
onMounted(load)
</script>

<style scoped>
.site-wrap { display: grid; grid-template-columns: 1fr 340px; gap: 20px; align-items: start; }
.site-form { margin-top: 8px; }
.logo-row { display: flex; gap: 16px; align-items: flex-start; }
.logo-preview { width: 64px; height: 64px; border-radius: 12px; border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fafbfc; flex-shrink: 0; }
.logo-preview img { width: 100%; height: 100%; object-fit: cover; }
.hint { font-size: 12px; color: var(--text-3); margin-top: 6px; }
.preview-card { position: sticky; top: 24px; }
.preview-nav { display: flex; align-items: center; justify-content: space-between;
  background: #0b0e14; border-radius: 10px; padding: 12px 14px; }
.pv-brand { display: flex; align-items: center; gap: 8px; color: #ff5c8a; font-weight: 800; font-size: 18px; }
.pv-logo { width: 24px; height: 24px; border-radius: 6px; object-fit: cover; }
.pv-search { font-size: 12px; color: #8a94a7; background: #141925; padding: 6px 12px; border-radius: 14px; }
.pv-desc { color: var(--text-2); font-size: 13px; margin: 14px 4px 6px; }
.pv-foot { color: var(--text-3); font-size: 12px; margin: 0 4px; }
@media (max-width: 1100px) { .site-wrap { grid-template-columns: 1fr; } .preview-card { position: static; } }
</style>
