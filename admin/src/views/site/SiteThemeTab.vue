<template>
  <div class="theme-layout">
    <div class="theme-panel">
      <div class="scope-note">
        这里只配置全站通用主题；首页、播放页、列表页的结构和内容项回到各自设置里处理。
      </div>
      <div class="edit-status">
        <div>
          <b>正在编辑：全局主题</b>
          <span>全站默认设计系统，按钮/榜单/评分等组件角色色统一从这里生效。</span>
        </div>
        <el-tag size="small" type="info" effect="plain">全局基准</el-tag>
      </div>

      <div v-for="group in visibleThemeGroups" :key="group.key" class="theme-group">
        <div class="theme-group-head">
          <span>{{ group.label }}</span>
          <em>{{ group.desc }}</em>
        </div>
        <div class="theme-grid">
          <div v-for="f in group.fields" :key="f.key" class="theme-field"
            :class="{alpha: f.type === 'alpha', active: activeFieldKey === f.key}"
            @click="setActiveField(f.key)">
            <div class="field-label">
              <span>{{ f.label }}</span>
              <em>{{ (f.impacts || []).join(' / ') }}</em>
            </div>

            <template v-if="f.type === 'alpha'">
              <el-slider
                :model-value="themeValue(f.key)"
                :min="0"
                :max="100"
                :step="1"
                @update:model-value="setThemeValue(f.key, $event)"
              />
              <el-input-number
                :model-value="themeValue(f.key)"
                :min="0"
                :max="100"
                :step="1"
                size="small"
                controls-position="right"
                @update:model-value="setThemeValue(f.key, $event)"
              />
              <span class="percent">%</span>
            </template>

            <template v-else>
              <el-color-picker
                :model-value="themeValue(f.key)"
                :show-alpha="!!f.alpha"
                :color-format="f.alpha ? 'rgb' : 'hex'"
                @update:model-value="setThemeValue(f.key, $event)"
              />
              <el-input
                :model-value="themeValue(f.key)"
                size="small"
                @update:model-value="setThemeValue(f.key, $event)"
              />
            </template>
          </div>
        </div>
      </div>
      <div class="theme-actions">
        <el-button size="small" @click="resetTheme">恢复全局默认</el-button>
        <span class="hint">页面级颜色覆盖入口已收口，避免全局主题和页面设置混在一起。</span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  visibleThemeGroups: { type: Array, required: true },
  activeFieldKey: { type: String, required: true },
  themeValue: { type: Function, required: true },
  setThemeValue: { type: Function, required: true },
  setActiveField: { type: Function, required: true },
  resetTheme: { type: Function, required: true },
})
</script>

<style scoped>
.theme-layout { max-width: none; }
.scope-note { margin: 2px 0 14px; color: var(--text-3); font-size: 12px; }
.edit-status { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin: 2px 0 14px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: #fafbfc; }
.edit-status b { display: block; color: var(--text-1); font-size: 14px; }
.edit-status span { display: block; margin-top: 3px; color: var(--text-3); font-size: 12px; }
.theme-group { padding: 14px 0 16px; border-top: 1px solid var(--border); }
.theme-group:first-of-type { border-top: 0; padding-top: 0; }
.theme-group-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
.theme-group-head span { color: var(--text-1); font-weight: 800; font-size: 15px; }
.theme-group-head em { color: var(--text-3); font-style: normal; font-size: 12px; }
.theme-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; }
.theme-field { display: grid; grid-template-columns: 96px 42px minmax(0, 1fr); gap: 8px; align-items: center; min-width: 0; }
.theme-field.alpha { grid-template-columns: 96px minmax(120px, 1fr) 92px 18px; }
.theme-field { padding: 7px; border-radius: 10px; border: 1px solid transparent; cursor: pointer; }
.theme-field.active { border-color: #4f6ef7; background: #f4f7ff; box-shadow: 0 0 0 2px rgba(79,110,247,.08); }
.field-label { min-width: 0; }
.field-label span { display: block; color: var(--text-2); font-size: 13px; line-height: 1.3; }
.field-label em { display: block; margin-top: 2px; color: var(--text-3); font-size: 11px; font-style: normal; }
.percent { color: var(--text-3); font-size: 12px; }
.theme-actions { display: flex; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
.hint { font-size: 12px; color: var(--text-3); margin-top: 6px; }
@media (max-width: 760px) {
  .edit-status, .theme-group-head { flex-direction: column; align-items: flex-start; }
  .theme-grid { grid-template-columns: 1fr; }
  .theme-field, .theme-field.alpha { grid-template-columns: 1fr; }
}
</style>
