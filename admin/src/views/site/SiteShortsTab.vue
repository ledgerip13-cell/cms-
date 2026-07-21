<template>
  <el-form :model="form.shortsConfig" label-width="120px" class="site-form">
    <el-form-item label="显示入口">
      <el-switch v-model="form.shortsConfig.enabled" inline-prompt active-text="显示" inactive-text="隐藏" />
      <div class="hint inline">关闭后前台导航不显示“刷短剧”，直接访问也只显示停用提示。</div>
    </el-form-item>

    <el-form-item label="默认分类">
      <el-select v-model="form.shortsConfig.defaultType" filterable placeholder="选择分类" style="width:240px">
        <el-option v-for="item in categoryOptions" :key="item.name" :label="categoryLabel(item)" :value="item.name" />
      </el-select>
      <div class="hint inline">没有设置偏好时，刷短剧默认只取这个分类。</div>
    </el-form-item>

    <el-form-item label="偏好范围">
      <el-cascader
        v-model="shortsScopeKeys"
        :options="shortsSubtypeOptions"
        :props="subtypeCascaderProps"
        filterable
        clearable
        collapse-tags
        collapse-tags-tooltip
        placeholder="选择大类或大类下的小类"
        style="width:420px"
      />
      <div class="hint inline">可直接选大类，也可展开选择小类；不选则使用默认分类。</div>
    </el-form-item>

    <el-form-item label="推荐排序">
      <el-radio-group v-model="form.shortsConfig.sortMode">
        <el-radio-button v-for="item in sortOptions" :key="item.value" :label="item.value">{{ item.label }}</el-radio-button>
      </el-radio-group>
    </el-form-item>

    <el-form-item label="每次加载">
      <el-input-number v-model="form.shortsConfig.feedLimit" :min="4" :max="20" :step="1" controls-position="right" />
      <div class="hint inline">建议 8-12，过大会增加接口和首屏压力。</div>
    </el-form-item>

    <el-form-item label="游客试看">
      <el-input-number v-model="form.shortsConfig.guestPreviewEpisodes" :min="0" :max="20" :step="1" controls-position="right" />
      <div class="hint inline">0 表示不额外放行；实际播放仍受后端分类观看权限控制。</div>
    </el-form-item>

    <el-divider content-position="left">前台交互</el-divider>

    <el-form-item label="框架内搜索">
      <el-switch v-model="form.shortsConfig.enableSearch" inline-prompt active-text="开启" inactive-text="关闭" />
      <div class="hint inline">开启后搜索在短剧框架内完成，不跳回普通列表页。</div>
    </el-form-item>

    <el-form-item label="沉浸按钮">
      <el-switch v-model="form.shortsConfig.showImmersiveButton" inline-prompt active-text="显示" inactive-text="隐藏" />
    </el-form-item>

    <el-form-item label="自动下一集">
      <el-switch v-model="form.shortsConfig.autoPlayNext" inline-prompt active-text="开启" inactive-text="关闭" />
      <div class="hint inline">全集观看时当前集结束后自动滑到下一集。</div>
    </el-form-item>
  </el-form>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  form: { type: Object, required: true },
  categoryOptions: { type: Array, required: true },
  categoryLabel: { type: Function, required: true },
  subtypeGroups: { type: Array, required: true },
  sortOptions: { type: Array, required: true },
})

const subtypeCascaderProps = { multiple: true, emitPath: false, checkStrictly: true }

const shortsSubtypeOptions = computed(() => props.subtypeGroups.map(group => ({
  value: typeScopeKey(group.type),
  label: group.type,
  children: group.children.map(item => ({
    value: subtypeKey(group.type, item.name),
    label: `${item.name} (${item.count || 0})`,
  })),
})))

const shortsScopeKeys = computed({
  get() {
    const types = Array.isArray(props.form.shortsConfig?.preferredTypes) ? props.form.shortsConfig.preferredTypes : []
    const subtypes = Array.isArray(props.form.shortsConfig?.preferredSubtypes) ? props.form.shortsConfig.preferredSubtypes : []
    return [
      ...types.map(typeScopeKey).filter(Boolean),
      ...subtypes
        .map(item => subtypeKey(item?.type, item?.name || item?.subType || item?.sub))
        .filter(Boolean),
    ]
  },
  set(keys) {
    const types = []
    const subtypes = []
    ;(Array.isArray(keys) ? keys : []).forEach(key => {
      const type = parseTypeScopeKey(key)
      if (type) {
        if (!types.includes(type)) types.push(type)
        return
      }
      const subtype = parseSubtypeKey(key)
      if (subtype && !subtypes.some(item => item.type === subtype.type && item.name === subtype.name)) {
        subtypes.push(subtype)
      }
    })
    props.form.shortsConfig.preferredTypes = types
    props.form.shortsConfig.preferredSubtypes = subtypes
  },
})

function subtypeKey(type, name) {
  const t = String(type || '').trim()
  const n = String(name || '').trim()
  return t && n ? `${t}::${n}` : ''
}

function typeScopeKey(type) {
  const t = String(type || '').trim()
  return t ? `type:${t}` : ''
}

function parseTypeScopeKey(value) {
  const raw = String(value || '')
  return raw.startsWith('type:') ? raw.slice(5).trim() : ''
}

function parseSubtypeKey(value) {
  const [type, ...rest] = String(value || '').split('::')
  const name = rest.join('::')
  return type && name ? { type, name } : null
}
</script>

<style scoped>
.site-form { margin-top: 8px; max-width: 820px; }
.hint { font-size: 12px; color: var(--text-3); margin-top: 6px; }
.hint.inline { margin: 0 0 0 12px; }
@media (max-width: 760px) {
  .site-form :deep(.el-select), .site-form :deep(.el-cascader) { width: 100% !important; }
  .hint.inline { display: block; margin: 6px 0 0; }
}
</style>
