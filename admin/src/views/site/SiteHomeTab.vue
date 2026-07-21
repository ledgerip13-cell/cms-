<template>
  <el-form :model="form.homeConfig" label-width="130px" class="site-form">
    <el-form-item label="自适应首页模板">
      <el-radio-group v-model="form.homeConfig.adaptiveTemplate">
        <el-radio-button label="default">默认影视站</el-radio-button>
        <el-radio-button label="x8">X8 影院模板</el-radio-button>
      </el-radio-group>
      <div class="hint inline">PC/平板自适应模板；移动端选择“默认”时会跟随这里。</div>
    </el-form-item>

    <el-form-item label="首页显示图标">
      <el-switch v-model="form.homeConfig.showHomeLogo" inline-prompt active-text="显示" inactive-text="隐藏" />
      <div class="hint inline">关闭后，首页头部只显示网站名称，不显示基础设置里的网站图标。</div>
    </el-form-item>

    <el-form-item label="独立移动端">
      <el-radio-group v-model="form.homeConfig.mobileTemplate">
        <el-radio-button label="default">默认（跟随PC自适应）</el-radio-button>
        <el-radio-button label="shortDrama">短剧 App 模板</el-radio-button>
      </el-radio-group>
      <div class="hint inline">选择具体移动模板后，手机访问首页/搜索/分类会进入独立 <code>/m</code>；默认不单独切移动端。</div>
    </el-form-item>

    <el-form-item label="每日更新分类">
      <el-select
        v-model="form.homeConfig.dailyUpdateTypes"
        multiple
        filterable
        collapse-tags
        collapse-tags-tooltip
        clearable
        placeholder="不选则索引全部可展示分类"
        style="width:420px"
      >
        <el-option v-for="item in categoryOptions" :key="item.name" :label="categoryLabel(item)" :value="item.name" />
      </el-select>
      <div class="hint inline">限制首页“每日更新”只展示这些分类的内容；不选则使用全部可展示分类。</div>
    </el-form-item>
  </el-form>
</template>

<script setup>
defineProps({
  form: { type: Object, required: true },
  categoryOptions: { type: Array, required: true },
  categoryLabel: { type: Function, required: true },
})
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
