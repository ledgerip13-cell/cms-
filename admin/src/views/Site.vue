<template>
  <div class="site-wrap">
    <div class="card site-editor-card">
      <div class="toolbar">
        <div class="sec-title">站点设置</div>
        <el-button type="primary" :icon="Check" :loading="saving" :disabled="!siteLoaded" @click="save">保存设置</el-button>
      </div>

      <el-tabs v-model="activeSettingTab" class="site-tabs">
        <el-tab-pane label="基础设置" name="basic">
          <SiteBasicTab :form="form" :upload-logo="onLogo" />
        </el-tab-pane>

        <el-tab-pane label="首页设置" name="home">
          <SiteHomeTab :form="form" :category-options="categoryOptions" :category-label="categoryLabel" />
        </el-tab-pane>

        <el-tab-pane label="刷短剧" name="shorts">
          <SiteShortsTab
            :form="form"
            :category-options="categoryOptions"
            :category-label="categoryLabel"
            :subtype-groups="subtypeGroups"
            :sort-options="shortsSortOptions"
          />
        </el-tab-pane>

        <el-tab-pane label="PWA" name="pwa">
          <SitePwaTab :form="form" :upload-pwa-icon="onPwaIcon" />
        </el-tab-pane>

        <el-tab-pane label="主题设置" name="theme">
          <SiteThemeTab
            :visible-theme-groups="theme.visibleThemeGroups.value"
            :active-field-key="activeFieldKey"
            :theme-value="theme.themeValue"
            :set-theme-value="theme.setThemeValue"
            :set-active-field="theme.setActiveField"
            :reset-theme="theme.resetTheme"
          />
        </el-tab-pane>
      </el-tabs>
    </div>

    <SitePreview
      :active-tab="activeSettingTab"
      :form="form"
      :shorts-sort-label="shortsSortLabel"
      :shorts-scope-preview="shortsScopePreview"
      :current-field="theme.currentField.value"
      :current-impacts="theme.currentImpacts.value"
      :preview-vars="theme.previewVars.value"
      :preview-active="theme.previewActive"
    />
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { Check } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api, normalizeHomeConfig, normalizePlayConfig, normalizePwaConfig, normalizeShortsConfig, normalizeTheme, readCachedSite, writeCachedSite } from '../api'
import SiteBasicTab from './site/SiteBasicTab.vue'
import SiteHomeTab from './site/SiteHomeTab.vue'
import SitePwaTab from './site/SitePwaTab.vue'
import SitePreview from './site/SitePreview.vue'
import SiteShortsTab from './site/SiteShortsTab.vue'
import SiteThemeTab from './site/SiteThemeTab.vue'
import { useSiteTheme } from './site/siteTheme'

const form = ref(readCachedSite())
const saving = ref(false)
const siteLoaded = ref(false)
const activeSettingTab = ref('basic')
const activeFieldKey = ref('accent')
const categoryOptions = ref([])
const subtypeGroups = ref([])
const shortsSortOptions = [
  { value: 'smart', label: '智能' },
  { value: 'hot', label: '热度' },
  { value: 'recent', label: '最新' },
  { value: 'rating', label: '评分' },
]
const theme = useSiteTheme(form, activeFieldKey)

const shortsScopePreview = computed(() => {
  const types = Array.isArray(form.value.shortsConfig?.preferredTypes) ? form.value.shortsConfig.preferredTypes.filter(Boolean) : []
  const subtypes = Array.isArray(form.value.shortsConfig?.preferredSubtypes) ? form.value.shortsConfig.preferredSubtypes.filter(item => item?.type && item?.name) : []
  const rows = []
  if (types.length) rows.push(types.slice(0, 4).join('、') + (types.length > 4 ? ` 等${types.length}类` : ''))
  if (subtypes.length) rows.push(subtypes.slice(0, 3).map(item => `${item.type}/${item.name}`).join('、') + (subtypes.length > 3 ? ` 等${subtypes.length}项` : ''))
  return rows.length ? rows.join('；') : `默认 ${form.value.shortsConfig?.defaultType || '短剧'}`
})

function ensureTheme() {
  form.value.theme = normalizeTheme(form.value.theme)
  form.value.theme.home = {}
  form.value.theme.play = {}
  form.value.theme.list = {}
}
function ensureHomeConfig() { form.value.homeConfig = normalizeHomeConfig(form.value.homeConfig) }
function ensureShortsConfig() { form.value.shortsConfig = normalizeShortsConfig(form.value.shortsConfig) }
function ensurePlayConfig() { form.value.playConfig = normalizePlayConfig(form.value.playConfig) }
function ensurePwaConfig() { form.value.pwaConfig = normalizePwaConfig(form.value.pwaConfig) }

async function load() {
  form.value = writeCachedSite(await api.adminSite())
  siteLoaded.value = true
  ensureAll()
  await loadCategoryOptions()
}

function ensureAll() {
  ensureTheme()
  ensureHomeConfig()
  ensureShortsConfig()
  ensurePlayConfig()
  ensurePwaConfig()
}

function categoryLabel(item) {
  return item?.count ? `${item.name} (${item.count})` : item?.name || ''
}

async function loadCategoryOptions() {
  try {
    const categories = await api.categories()
    categoryOptions.value = Array.isArray(categories) ? categories.filter(item => item?.name) : []
    const rows = await Promise.all(categoryOptions.value.map(async (item) => {
      try {
        const children = await api.adminSubtypes(item.name)
        return { type: item.name, children: Array.isArray(children) ? children.filter(s => s?.name) : [] }
      } catch {
        return { type: item.name, children: [] }
      }
    }))
    subtypeGroups.value = rows
  } catch {
    categoryOptions.value = []
    subtypeGroups.value = []
  }
}

function shortsSortLabel(value) {
  return shortsSortOptions.find(x => x.value === value)?.label || '智能'
}

function onLogo(file) {
  if (file.size > 200 * 1024) { ElMessage.warning('图标建议小于 200KB'); return false }
  const reader = new FileReader()
  reader.onload = e => { form.value.logo = e.target.result }
  reader.readAsDataURL(file)
  return false
}

function onPwaIcon(file) {
  if (file.size > 512 * 1024) { ElMessage.warning('桌面图标建议小于 512KB'); return false }
  const reader = new FileReader()
  reader.onload = e => { form.value.pwaConfig.icon = e.target.result }
  reader.readAsDataURL(file)
  return false
}

async function save() {
  if (!siteLoaded.value) {
    ElMessage.warning('站点信息还未加载完成')
    return
  }
  saving.value = true
  try {
    ensureAll()
    form.value = writeCachedSite(await api.updateSite(form.value))
    ensureAll()
    ElMessage.success('站点设置已保存，前端刷新后生效')
  } catch (e) { ElMessage.error(e.message || '保存失败') } finally { saving.value = false }
}

onMounted(() => { ensureAll(); load() })
</script>

<style scoped>
.site-wrap { display: grid; grid-template-columns: minmax(560px, 1fr) minmax(320px, 420px); gap: 20px; align-items: start; }
.site-editor-card { min-width: 0; }
.site-tabs { margin-top: 8px; }
@media (max-width: 1180px) {
  .site-wrap { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 760px) {
  .site-wrap { gap: 14px; }
}
</style>
