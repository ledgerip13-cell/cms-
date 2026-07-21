<template>
  <el-form :model="form.pwaConfig" label-width="130px" class="site-form">
    <el-form-item label="桌面安装">
      <el-switch v-model="form.pwaConfig.enabled" inline-prompt active-text="开启" inactive-text="关闭" />
      <div class="hint inline">开启后支持添加到手机桌面；新版本发布后前台会弹出升级提示。</div>
    </el-form-item>

    <el-form-item label="应用名称">
      <el-input v-model="form.pwaConfig.name" placeholder="默认使用网站名称" maxlength="60" show-word-limit style="max-width:360px" />
    </el-form-item>

    <el-form-item label="短名称">
      <el-input v-model="form.pwaConfig.shortName" placeholder="桌面图标下显示，默认取网站名称" maxlength="24" show-word-limit style="max-width:260px" />
    </el-form-item>

    <el-form-item label="桌面图标">
      <div class="logo-row">
        <div class="logo-preview">
          <img v-if="form.pwaConfig.icon || form.logo" :src="form.pwaConfig.icon || form.logo" alt="pwa icon" />
          <el-icon v-else :size="24" color="#c0c4cc"><Picture /></el-icon>
        </div>
        <div class="logo-actions">
          <el-upload :show-file-list="false" :before-upload="uploadPwaIcon" accept="image/*">
            <el-button :icon="Upload">上传桌面图标</el-button>
          </el-upload>
          <el-input v-model="form.pwaConfig.icon" placeholder="留空则使用网站图标，或粘贴图片 URL" style="width:360px;margin-top:8px" />
          <div class="hint">建议 512×512 PNG，留空时使用基础设置里的网站图标。</div>
        </div>
      </div>
    </el-form-item>

    <el-form-item label="主题色">
      <el-color-picker v-model="form.pwaConfig.themeColor" />
      <el-input v-model="form.pwaConfig.themeColor" style="width:140px;margin-left:10px" />
    </el-form-item>

    <el-form-item label="启动背景色">
      <el-color-picker v-model="form.pwaConfig.backgroundColor" />
      <el-input v-model="form.pwaConfig.backgroundColor" style="width:140px;margin-left:10px" />
    </el-form-item>
  </el-form>
</template>

<script setup>
import { Picture, Upload } from '@element-plus/icons-vue'

defineProps({
  form: { type: Object, required: true },
  uploadPwaIcon: { type: Function, required: true },
})
</script>

<style scoped>
.site-form { margin-top: 8px; max-width: 820px; }
.logo-row { display: flex; gap: 16px; align-items: flex-start; }
.logo-preview { width: 64px; height: 64px; border-radius: 12px; border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fafbfc; flex-shrink: 0; }
.logo-preview img { width: 100%; height: 100%; object-fit: cover; }
.hint { font-size: 12px; color: var(--text-3); margin-top: 6px; }
.hint.inline { margin: 0 0 0 12px; }
@media (max-width: 760px) {
  .logo-row { flex-direction: column; align-items: flex-start; }
  .logo-actions, .logo-actions .el-input { width: 100% !important; }
  .site-form :deep(.el-select), .site-form :deep(.el-cascader) { width: 100% !important; }
  .hint.inline { display: block; margin: 6px 0 0; }
}
</style>
