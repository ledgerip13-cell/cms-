<template>
  <el-form :model="form" label-width="100px" class="site-form">
    <el-form-item label="网站名称">
      <el-input v-model="form.siteName" placeholder="网站名称" maxlength="30" show-word-limit style="max-width:360px" />
    </el-form-item>

    <el-form-item label="网站图标">
      <div class="logo-row">
        <div class="logo-preview">
          <img v-if="form.logo" :src="form.logo" alt="logo" />
          <el-icon v-else :size="24" color="#c0c4cc"><Picture /></el-icon>
        </div>
        <div class="logo-actions">
          <el-upload :show-file-list="false" :before-upload="uploadLogo" accept="image/*">
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
      <el-input v-model="form.footer" placeholder="页脚文字" style="max-width:520px" />
    </el-form-item>

    <el-form-item label="站点公告">
      <el-input v-model="form.announcement" type="textarea" :rows="2"
        placeholder="可选，展示在前端顶部（留空不显示）" style="max-width:520px" />
    </el-form-item>

    <el-divider content-position="left">前台用户注册</el-divider>

    <el-form-item label="开放注册">
      <el-switch v-model="form.allowRegister" inline-prompt active-text="允许" inactive-text="关闭" />
      <div class="hint inline">关闭后，新用户无法注册，已有用户仍可登录。</div>
    </el-form-item>

    <el-form-item label="邀请码注册">
      <el-switch v-model="form.registerInviteRequired" :disabled="!form.allowRegister" inline-prompt active-text="需要" inactive-text="不需要" />
      <div class="hint inline">{{ form.registerInviteRequired ? '注册时必须填写邀请码池中的有效邀请码。' : '注册时不校验邀请码。' }}</div>
    </el-form-item>

    <el-alert
      :type="form.registerInviteRequired && !form.invitePoolAvailable ? 'warning' : 'info'"
      :closable="false"
      :title="form.registerInviteRequired && !form.invitePoolAvailable
        ? '当前已要求邀请码注册，但邀请码池没有可用邀请码。请到「权限访问 / 邀请码池」生成。'
        : '邀请码在「权限访问 / 邀请码池」统一管理。'"
      style="max-width:520px"
    />
  </el-form>
</template>

<script setup>
import { Picture, Upload } from '@element-plus/icons-vue'

defineProps({
  form: { type: Object, required: true },
  uploadLogo: { type: Function, required: true },
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
