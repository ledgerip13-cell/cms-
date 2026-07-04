<template>
  <div class="site-wrap">
    <div class="card">
      <div class="toolbar">
        <div class="sec-title">站点设置</div>
        <el-button type="primary" :icon="Check" :loading="saving" @click="save">保存设置</el-button>
      </div>

      <el-tabs v-model="activeSettingTab" class="site-tabs">
        <el-tab-pane label="基础设置" name="basic">
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
              <el-input v-model="form.footer" placeholder="页脚文字" style="max-width:520px" />
            </el-form-item>

            <el-form-item label="站点公告">
              <el-input v-model="form.announcement" type="textarea" :rows="2"
                placeholder="可选，展示在前端顶部（留空不显示）" style="max-width:520px" />
            </el-form-item>

            <el-divider content-position="left">前台用户注册</el-divider>

            <el-form-item label="开放注册">
              <el-switch v-model="form.allowRegister" active-text="允许" inactive-text="关闭" />
              <div class="hint inline">关闭后，新用户无法注册，已有用户仍可登录。</div>
            </el-form-item>

            <el-alert type="info" :closable="false" title="邀请码已迁移到「权限访问 / 邀请码池」统一管理。" style="max-width:520px" />
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="主题设置" name="theme">
          <div class="theme-layout">
            <div class="theme-panel">
              <el-tabs v-model="activeThemeScope" class="theme-tabs">
                <el-tab-pane v-for="s in themeScopes" :key="s.key" :label="s.label" :name="s.key">
                  <div class="scope-note" v-if="s.key !== 'global'">
                    当前页面默认继承全局颜色；修改任意字段后只覆盖该页面。
                  </div>
                  <div class="edit-status">
                    <div>
                      <b>正在编辑：{{ s.label }}主题</b>
                      <span>{{ s.key === 'global' ? '全站默认颜色' : '只覆盖当前页面，不影响其他页面' }}</span>
                    </div>
                    <el-tag size="small" :type="overrideCount(s.key) ? 'success' : 'info'" effect="plain">
                      {{ s.key === 'global' ? '全局基准' : (overrideCount(s.key) ? `已覆盖 ${overrideCount(s.key)} 项` : '继承全局') }}
                    </el-tag>
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
                          <em v-if="isInherited(s.key, f.key)">继承全局</em>
                          <em v-else>{{ (f.impacts || []).join(' / ') }}</em>
                        </div>

                        <template v-if="f.type === 'alpha'">
                          <el-slider
                            :model-value="themeValue(s.key, f.key)"
                            :min="0"
                            :max="100"
                            :step="1"
                            @update:model-value="setThemeValue(s.key, f.key, $event)"
                          />
                          <el-input-number
                            :model-value="themeValue(s.key, f.key)"
                            :min="0"
                            :max="100"
                            :step="1"
                            size="small"
                            controls-position="right"
                            @update:model-value="setThemeValue(s.key, f.key, $event)"
                          />
                          <span class="percent">%</span>
                        </template>

                        <template v-else-if="f.type === 'raw'">
                          <el-input
                            class="raw-input"
                            :model-value="themeValue(s.key, f.key)"
                            size="small"
                            @update:model-value="setThemeValue(s.key, f.key, $event)"
                          />
                        </template>

                        <template v-else>
                          <el-color-picker
                            :model-value="themeValue(s.key, f.key)"
                            :show-alpha="!!f.alpha"
                            :color-format="f.alpha ? 'rgba' : 'hex'"
                            @update:model-value="setThemeValue(s.key, f.key, $event)"
                          />
                          <el-input
                            :model-value="themeValue(s.key, f.key)"
                            size="small"
                            @update:model-value="setThemeValue(s.key, f.key, $event)"
                          />
                        </template>
                      </div>
                    </div>
                  </div>
                  <div class="theme-actions">
                    <el-button size="small" @click="resetTheme(s.key)">恢复{{ s.label }}默认</el-button>
                    <el-button v-if="s.key !== 'global'" size="small" @click="clearScope(s.key)">清空页面覆盖</el-button>
                    <span class="hint">主色透明度影响前台高亮底色；标签透明度影响标签辅助底色。</span>
                  </div>
                </el-tab-pane>
              </el-tabs>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <div class="card preview-card">
      <template v-if="activeSettingTab === 'basic'">
        <div class="sec-title" style="margin-bottom:14px">基础信息预览</div>
        <div class="preview-nav">
          <div class="pv-brand">
            <img v-if="form.logo" :src="form.logo" class="pv-logo" />
            <span>{{ form.siteName || '网站名称' }}</span>
          </div>
          <div class="pv-search">搜索影片</div>
        </div>
        <p class="pv-desc">{{ form.description || '（网站描述）' }}</p>
        <p class="pv-foot">{{ form.footer || '（页脚文字）' }}</p>
        <p class="pv-foot">注册：{{ form.allowRegister ? (form.inviteRequired ? '开放 · 需邀请码池' : '开放') : '关闭' }}</p>
      </template>

      <template v-else>
        <div class="preview-head">
          <div>
            <div class="sec-title">影响预览</div>
            <div class="preview-sub">
              {{ currentThemeLabel }} · 当前字段：{{ currentField.label }}
            </div>
          </div>
          <el-tag v-if="scopeInherited" size="small" effect="plain">继承全局</el-tag>
        </div>
        <div class="impact-tags">
          <el-tag v-for="x in currentImpacts" :key="x" size="small" effect="plain">{{ x }}</el-tag>
        </div>

        <div class="theme-preview" :style="previewVars">
          <div class="focus-grid">
            <div v-for="block in currentPreviewBlocks" :key="block" class="focus-card">
              <div class="focus-label">{{ previewBlockLabel(block) }}</div>

              <div v-if="block === 'surface'" class="pv-surface">
                <div class="pv-surface-card">
                  <b>页面与卡片</b>
                  <span>正文文字 / 次级文字 / 弱文字</span>
                </div>
              </div>

              <div v-else-if="block === 'nav'" class="pv-nav-demo">
                <div class="tp-nav on">精选</div>
                <div class="tp-nav">动漫</div>
                <div class="tp-nav">电影</div>
              </div>

              <div v-else-if="block === 'search'" class="pv-search-demo">
                <div class="tp-search">搜索影片</div>
                <button class="tp-search-button">搜索</button>
              </div>

              <div v-else-if="block === 'rank'" class="pv-rank-demo">
                <span class="r1">1</span><span class="r2">2</span><span class="r3">3</span>
              </div>

              <div v-else-if="block === 'button'" class="pv-button-demo">
                <button class="tp-primary">主按钮</button>
                <button class="tp-ghost">次按钮</button>
                <button class="tp-hover">悬停态</button>
              </div>

              <div v-else-if="block === 'hero'" class="tp-hero">
                <div class="tp-badge">热门推荐</div>
                <div class="tp-title">首页推荐</div>
                <div class="tp-meta"><span>2026</span><span>动漫</span><b>8.7</b></div>
                <button>立即播放</button>
              </div>

              <div v-else-if="block === 'chip'" class="tp-filters compact">
                <span class="on">全部</span>
                <span>热播</span>
                <span>新番</span>
              </div>

              <div v-else-if="block === 'section'" class="pv-section-demo">
                <div class="section-line"></div>
                <b>每日更新</b>
              </div>

              <div v-else-if="block === 'poster'" class="tp-row compact">
                <div class="tp-poster score-poster">
                  <em>8.7</em>
                  <span></span>
                </div>
                <div class="tp-poster"><span></span></div>
              </div>

              <div v-else-if="block === 'play'" class="pv-play-demo">
                <div class="tp-line-tabs">
                  <span class="on">线路一</span><span>线路二</span>
                </div>
                <div class="tp-channel-tabs">
                  <span class="on">推荐</span><span>备用</span>
                </div>
                <div class="tp-eps">
                  <span v-for="i in 5" :key="i" :class="{on: i === 1}">{{ i }}</span>
                </div>
              </div>

              <div v-else-if="block === 'gallery'" class="pv-gallery-demo">
                <div class="still on"></div><div class="still"></div><div class="still"></div>
              </div>

              <div v-else-if="block === 'user'" class="pv-user-demo">
                <b>注册成功</b>
                <span>选择喜欢的类型，推荐会马上变化。</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { Check, Upload, Picture } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api, DEFAULT_THEME, normalizeTheme, readCachedSite, writeCachedSite } from '../api'

const form = ref(readCachedSite())
const saving = ref(false)
const activeSettingTab = ref('basic')
const activeThemeScope = ref('global')
const activeFieldKey = ref('accent')
const themeScopes = [
  { key: 'global', label: '全局' },
  { key: 'home', label: '首页' },
  { key: 'play', label: '播放页' },
  { key: 'list', label: '列表页' },
]
const themeGroups = [
  {
    key: 'base',
    label: '基础色',
    desc: '页面、卡片、文字的底层颜色',
    fields: [
      { key: 'bg', label: '页面背景' },
      { key: 'bgSoft', label: '浅背景' },
      { key: 'card', label: '卡片背景' },
      { key: 'cardHi', label: '高亮卡片' },
      { key: 'text', label: '主文字' },
      { key: 'muted', label: '弱文字' },
      { key: 'muted2', label: '次级文字' },
    ],
  },
  {
    key: 'brand',
    label: '品牌色',
    desc: '通用强调、评分、透明辅助色',
    fields: [
      { key: 'accent', label: '品牌主色' },
      { key: 'accentLt', label: '品牌浅色' },
      { key: 'accent2', label: '辅助色' },
      { key: 'gold', label: '评分色' },
      { key: 'rose', label: '标签基础色' },
      { key: 'accentSoftAlpha', label: '主色透明度', type: 'alpha' },
      { key: 'roseSoftAlpha', label: '标签透明度', type: 'alpha' },
    ],
  },
  {
    key: 'button',
    label: '按钮',
    desc: '主按钮、次按钮和按钮 hover',
    fields: [
      { key: 'btnPrimaryBg', label: '主按钮背景' },
      { key: 'btnPrimaryText', label: '主按钮文字' },
      { key: 'btnGhostBg', label: '次按钮背景', alpha: true },
      { key: 'btnGhostText', label: '次按钮文字' },
      { key: 'btnHoverBorder', label: '按钮悬停边框' },
      { key: 'btnHoverText', label: '按钮悬停文字' },
    ],
  },
  {
    key: 'navSearch',
    label: '导航与搜索',
    desc: '侧边栏、搜索框、榜单高亮',
    fields: [
      { key: 'navActiveBg', label: '导航选中背景', alpha: true },
      { key: 'navActiveText', label: '导航选中文字' },
      { key: 'searchBg', label: '搜索框背景', alpha: true },
      { key: 'searchFocusBorder', label: '搜索聚焦边框', alpha: true },
      { key: 'searchFocusShadow', label: '搜索聚焦阴影', alpha: true },
      { key: 'searchButtonBg', label: '搜索按钮背景' },
      { key: 'searchButtonText', label: '搜索按钮文字' },
      { key: 'rankFirstText', label: '榜单第一' },
      { key: 'rankSecondText', label: '榜单第二' },
      { key: 'rankThirdText', label: '榜单第三' },
    ],
  },
  {
    key: 'home',
    label: '首页组件',
    desc: 'Hero、筛选 chip、分区标题',
    fields: [
      { key: 'heroBadgeBg', label: 'Hero徽标背景', alpha: true },
      { key: 'heroBadgeText', label: 'Hero徽标文字' },
      { key: 'heroPrimaryButtonBg', label: 'Hero主按钮背景' },
      { key: 'heroPrimaryButtonText', label: 'Hero主按钮文字' },
      { key: 'heroSecondaryButtonBg', label: 'Hero次按钮背景', alpha: true },
      { key: 'heroSecondaryButtonText', label: 'Hero次按钮文字' },
      { key: 'chipActiveBg', label: '筛选选中背景' },
      { key: 'chipActiveText', label: '筛选选中文字' },
      { key: 'sectionAccentBg', label: '分区标题强调', type: 'raw' },
    ],
  },
  {
    key: 'card',
    label: '卡片与徽标',
    desc: '海报卡片遮罩和角标',
    fields: [
      { key: 'badgeScoreBg', label: '评分角标背景' },
      { key: 'badgeScoreText', label: '评分角标文字' },
      { key: 'posterOverlayBg', label: '卡片遮罩', type: 'raw' },
    ],
  },
  {
    key: 'play',
    label: '播放页组件',
    desc: '线路、通道、选集和剧照',
    fields: [
      { key: 'playLineActiveBg', label: '线路选中背景', type: 'raw' },
      { key: 'playLineActiveText', label: '线路选中文字' },
      { key: 'playChannelActiveBg', label: '通道选中背景' },
      { key: 'playChannelActiveText', label: '通道选中文字' },
      { key: 'playEpisodeActiveBg', label: '选集选中背景' },
      { key: 'playEpisodeActiveText', label: '选集选中文字' },
      { key: 'playLinkText', label: '播放页链接' },
      { key: 'galleryActiveBorder', label: '剧照边框' },
    ],
  },
  {
    key: 'user',
    label: '用户模块',
    desc: '登录、个人中心、引导面板',
    fields: [
      { key: 'onboardingBg', label: '引导面板背景', type: 'raw' },
    ],
  },
]

const groupScopes = {
  base: ['global', 'home', 'play', 'list'],
  brand: ['global', 'home', 'play', 'list'],
  button: ['global', 'home', 'play', 'list'],
  navSearch: ['global', 'home', 'play', 'list'],
  home: ['global', 'home'],
  card: ['global', 'home', 'list'],
  play: ['global', 'play'],
  user: ['global'],
}

const fieldMeta = {
  bg: { impacts: ['页面背景'], previews: ['surface'] },
  bgSoft: { impacts: ['浅背景块', 'Hero兜底背景'], previews: ['surface', 'hero'] },
  card: { impacts: ['卡片背景', '筛选面板', '播放信息块'], previews: ['surface', 'poster', 'play'] },
  cardHi: { impacts: ['高亮卡片', '用户头像占位', '播放页封面块'], previews: ['surface', 'play'] },
  text: { impacts: ['主文字'], previews: ['surface'] },
  muted: { impacts: ['弱文字', '占位线条'], previews: ['surface', 'poster'] },
  muted2: { impacts: ['次级文字', '导航普通项'], previews: ['surface', 'nav'] },
  accent: { impacts: ['品牌主色', '导航选中', '筛选选中', '按钮悬停', '分区强调'], previews: ['nav', 'chip', 'button', 'section'] },
  accentLt: { impacts: ['品牌浅色', '按钮悬停文字', '渐变终点'], previews: ['button', 'section'] },
  accent2: { impacts: ['辅助色', '播放页链接', '选集默认强调'], previews: ['play'] },
  gold: { impacts: ['评分文字', '评分角标'], previews: ['poster', 'rank'] },
  rose: { impacts: ['标签基础色', '第三名榜单', 'Hero辅助光'], previews: ['rank', 'hero'] },
  accentSoftAlpha: { impacts: ['主色透明底', '导航选中背景'], previews: ['nav', 'chip'] },
  roseSoftAlpha: { impacts: ['标签透明辅助底色', 'Hero辅助光'], previews: ['hero'] },
  btnPrimaryBg: { impacts: ['通用主按钮背景'], previews: ['button'] },
  btnPrimaryText: { impacts: ['通用主按钮文字'], previews: ['button'] },
  btnGhostBg: { impacts: ['通用次按钮背景'], previews: ['button'] },
  btnGhostText: { impacts: ['通用次按钮文字'], previews: ['button'] },
  btnHoverBorder: { impacts: ['按钮悬停边框'], previews: ['button'] },
  btnHoverText: { impacts: ['按钮悬停文字'], previews: ['button'] },
  navActiveBg: { impacts: ['侧边栏选中背景'], previews: ['nav'] },
  navActiveText: { impacts: ['侧边栏选中文字'], previews: ['nav'] },
  searchBg: { impacts: ['顶部搜索框背景'], previews: ['search'] },
  searchFocusBorder: { impacts: ['搜索聚焦边框'], previews: ['search'] },
  searchFocusShadow: { impacts: ['搜索聚焦阴影'], previews: ['search'] },
  searchButtonBg: { impacts: ['搜索按钮背景'], previews: ['search'] },
  searchButtonText: { impacts: ['搜索按钮文字'], previews: ['search'] },
  rankFirstText: { impacts: ['榜单第一名'], previews: ['rank'] },
  rankSecondText: { impacts: ['榜单第二名'], previews: ['rank'] },
  rankThirdText: { impacts: ['榜单第三名'], previews: ['rank'] },
  heroBadgeBg: { impacts: ['首页 Hero 徽标背景'], previews: ['hero'], scopes: ['global', 'home'] },
  heroBadgeText: { impacts: ['首页 Hero 徽标文字'], previews: ['hero'], scopes: ['global', 'home'] },
  heroPrimaryButtonBg: { impacts: ['首页立即播放按钮背景'], previews: ['hero'], scopes: ['global', 'home'] },
  heroPrimaryButtonText: { impacts: ['首页立即播放按钮文字'], previews: ['hero'], scopes: ['global', 'home'] },
  heroSecondaryButtonBg: { impacts: ['首页详情按钮背景'], previews: ['hero'], scopes: ['global', 'home'] },
  heroSecondaryButtonText: { impacts: ['首页详情按钮文字'], previews: ['hero'], scopes: ['global', 'home'] },
  chipActiveBg: { impacts: ['分类/筛选选中背景'], previews: ['chip'], scopes: ['global', 'home', 'list'] },
  chipActiveText: { impacts: ['分类/筛选选中文字'], previews: ['chip'], scopes: ['global', 'home', 'list'] },
  sectionAccentBg: { impacts: ['首页分区标题强调条'], previews: ['section'], scopes: ['global', 'home', 'list'] },
  badgeScoreBg: { impacts: ['影片评分角标背景'], previews: ['poster'], scopes: ['global', 'home', 'list'] },
  badgeScoreText: { impacts: ['影片评分角标文字'], previews: ['poster'], scopes: ['global', 'home', 'list'] },
  posterOverlayBg: { impacts: ['海报 hover 遮罩'], previews: ['poster'], scopes: ['global', 'home', 'list'] },
  playLineActiveBg: { impacts: ['播放页线路选中背景'], previews: ['play'], scopes: ['global', 'play'] },
  playLineActiveText: { impacts: ['播放页线路选中文字'], previews: ['play'], scopes: ['global', 'play'] },
  playChannelActiveBg: { impacts: ['播放页通道选中背景'], previews: ['play'], scopes: ['global', 'play'] },
  playChannelActiveText: { impacts: ['播放页通道选中文字'], previews: ['play'], scopes: ['global', 'play'] },
  playEpisodeActiveBg: { impacts: ['播放页选集选中背景'], previews: ['play'], scopes: ['global', 'play'] },
  playEpisodeActiveText: { impacts: ['播放页选集选中文字'], previews: ['play'], scopes: ['global', 'play'] },
  playLinkText: { impacts: ['播放页链接文字'], previews: ['play'], scopes: ['global', 'play'] },
  galleryActiveBorder: { impacts: ['剧照选中边框'], previews: ['gallery'], scopes: ['global', 'play'] },
  onboardingBg: { impacts: ['用户引导面板背景'], previews: ['user'], scopes: ['global'] },
}

const previewLabels = {
  surface: '页面/卡片底色',
  nav: '侧边导航',
  search: '顶部搜索',
  rank: '热门榜单',
  button: '通用按钮',
  hero: '首页 Hero',
  chip: '分类/筛选标签',
  section: '分区标题',
  poster: '影片卡片',
  play: '播放页控件',
  gallery: '剧照缩略图',
  user: '用户引导',
}

const currentThemeLabel = computed(() => themeScopes.find(s => s.key === activeThemeScope.value)?.label || '全局')
const scopeInherited = computed(() => activeThemeScope.value !== 'global' && !Object.keys(form.value.theme?.[activeThemeScope.value] || {}).length)
const previewColors = computed(() => effectiveTheme(activeThemeScope.value))
const visibleThemeGroups = computed(() => {
  const scope = activeThemeScope.value
  return themeGroups
    .filter(group => (groupScopes[group.key] || ['global']).includes(scope))
    .map(group => ({
      ...group,
      fields: group.fields
        .map(f => ({ ...f, ...(fieldMeta[f.key] || {}) }))
        .filter(f => (f.scopes || groupScopes[group.key] || ['global']).includes(scope)),
    }))
    .filter(group => group.fields.length)
})
const allThemeFields = computed(() => themeGroups.flatMap(group => group.fields.map(f => ({ ...f, ...(fieldMeta[f.key] || {}) }))))
const currentField = computed(() => allThemeFields.value.find(f => f.key === activeFieldKey.value) || allThemeFields.value[0] || { label: '主题字段', impacts: [], previews: ['surface'] })
const currentImpacts = computed(() => currentField.value.impacts?.length ? currentField.value.impacts : ['当前字段影响的组件'])
const currentPreviewBlocks = computed(() => currentField.value.previews?.length ? currentField.value.previews : ['surface'])
const previewVars = computed(() => {
  const c = previewColors.value
  const vars = {}
  for (const [key, value] of Object.entries(c)) {
    if (value !== undefined && value !== null && value !== '') vars['--tp-' + cssVarName(key)] = value
  }
  return {
    ...vars,
    '--tp-bg': c.bg,
    '--tp-soft': c.bgSoft,
    '--tp-card': c.card,
    '--tp-card-hi': c.cardHi,
    '--tp-text': c.text,
    '--tp-muted': c.muted,
    '--tp-muted2': c.muted2,
    '--tp-accent': c.accent,
    '--tp-accent-lt': c.accentLt,
    '--tp-accent2': c.accent2,
    '--tp-gold': c.gold,
    '--tp-rose': c.rose,
    '--tp-accent-soft': rgba(c.accent, alphaPercent(c.accentSoftAlpha, .15)),
    '--tp-rose-soft': rgba(c.rose, alphaPercent(c.roseSoftAlpha, .16)),
    '--tp-grad': `linear-gradient(120deg, ${c.accent}, ${c.accentLt})`,
  }
})

function ensureTheme() { form.value.theme = normalizeTheme(form.value.theme) }
async function load() {
  form.value = writeCachedSite(await api.adminSite())
  ensureTheme()
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key)
}

function effectiveTheme(scope) {
  const theme = form.value.theme || {}
  return {
    ...DEFAULT_THEME.global,
    ...(theme.global || {}),
    ...(scope !== 'global' ? (theme[scope] || {}) : {}),
  }
}

function themeValue(scope, key) {
  if (hasOwn(form.value.theme?.[scope], key)) return form.value.theme[scope][key]
  if (scope !== 'global' && hasOwn(form.value.theme?.global, key)) return form.value.theme.global[key]
  return DEFAULT_THEME.global[key]
}

function setThemeValue(scope, key, value) {
  setActiveField(key)
  if (!form.value.theme[scope]) form.value.theme[scope] = {}
  form.value.theme[scope][key] = value
}

function setActiveField(key) {
  activeFieldKey.value = key
}

function previewBlockLabel(block) {
  return previewLabels[block] || block
}

function isInherited(scope, key) {
  return scope !== 'global' && !hasOwn(form.value.theme?.[scope], key)
}

function resetTheme(scope) {
  form.value.theme[scope] = scope === 'global' ? { ...DEFAULT_THEME.global } : {}
}

function clearScope(scope) {
  if (scope !== 'global') form.value.theme[scope] = {}
}

function overrideCount(scope) {
  return Object.keys(form.value.theme?.[scope] || {}).length
}

function cssVarName(key) {
  return key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '').trim()
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function rgba(hex, alpha) {
  const c = hexToRgb(hex)
  return c ? `rgba(${c.r},${c.g},${c.b},${alpha})` : hex
}

function alphaPercent(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, n)) / 100
}

function onLogo(file) {
  if (file.size > 200 * 1024) { ElMessage.warning('图标建议小于 200KB'); return false }
  const reader = new FileReader()
  reader.onload = e => { form.value.logo = e.target.result }
  reader.readAsDataURL(file)
  return false
}

async function save() {
  saving.value = true
  try {
    ensureTheme()
    form.value = writeCachedSite(await api.updateSite(form.value))
    ensureTheme()
    ElMessage.success('站点设置已保存，前端刷新后生效')
  } catch (e) { ElMessage.error(e.message || '保存失败') } finally { saving.value = false }
}
watch(activeThemeScope, () => {
  const keys = visibleThemeGroups.value.flatMap(g => g.fields.map(f => f.key))
  if (!keys.includes(activeFieldKey.value)) activeFieldKey.value = keys[0] || 'accent'
})
onMounted(() => { ensureTheme(); load() })
</script>

<style scoped>
.site-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; align-items: start; }
.site-tabs { margin-top: 8px; }
.site-form { margin-top: 8px; max-width: 760px; }
.logo-row { display: flex; gap: 16px; align-items: flex-start; }
.logo-preview { width: 64px; height: 64px; border-radius: 12px; border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fafbfc; flex-shrink: 0; }
.logo-preview img { width: 100%; height: 100%; object-fit: cover; }
.hint { font-size: 12px; color: var(--text-3); margin-top: 6px; }
.hint.inline { margin: 0 0 0 12px; }
.preview-card { position: sticky; top: 24px; }
.preview-nav { display: flex; align-items: center; justify-content: space-between;
  background: #0b0e14; border-radius: 10px; padding: 12px 14px; gap: 12px; }
.pv-brand { display: flex; align-items: center; gap: 8px; color: #ff5c8a; font-weight: 800; font-size: 18px; min-width: 0; }
.pv-brand span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv-logo { width: 24px; height: 24px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
.pv-search { flex-shrink: 0; font-size: 12px; color: #8a94a7; background: #141925; padding: 6px 12px; border-radius: 14px; }
.pv-desc { color: var(--text-2); font-size: 13px; margin: 14px 4px 6px; line-height: 1.6; }
.pv-foot { color: var(--text-3); font-size: 12px; margin: 0 4px; line-height: 1.7; }
.theme-layout { max-width: 860px; }
.theme-tabs { width: 100%; }
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
.raw-input { grid-column: 2 / -1; }
.theme-actions { display: flex; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
.preview-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.preview-sub { margin-top: 4px; color: var(--text-3); font-size: 12px; }
.impact-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: -4px 0 12px; }
.theme-preview { border-radius: 14px; overflow: hidden; background: var(--tp-bg); color: var(--tp-text);
  border: 1px solid rgba(255,255,255,.1); box-shadow: 0 12px 32px rgba(0,0,0,.12); padding: 14px; }
.focus-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
.focus-card { border-radius: 12px; background: color-mix(in srgb, var(--tp-bg) 78%, #fff); border: 1px solid rgba(255,255,255,.09); padding: 12px; }
.focus-label { color: var(--tp-muted2); font-size: 12px; font-weight: 800; margin-bottom: 10px; }
.pv-surface { background: var(--tp-bg); border-radius: 12px; padding: 12px; }
.pv-surface-card { background: var(--tp-card); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; padding: 14px; }
.pv-surface-card b { display: block; color: var(--tp-text); margin-bottom: 6px; }
.pv-surface-card span { color: var(--tp-muted); font-size: 12px; }
.pv-nav-demo { display: grid; gap: 6px; max-width: 160px; }
.pv-search-demo { display: flex; gap: 8px; align-items: center; }
.tp-search-button { border: 0; height: 30px; border-radius: 16px; padding: 0 14px; background: var(--tp-search-button-bg); color: var(--tp-search-button-text); font-weight: 800; }
.pv-rank-demo { display: flex; gap: 12px; align-items: center; font-size: 22px; font-weight: 900; font-style: italic; }
.pv-rank-demo .r1 { color: var(--tp-rank-first-text); }
.pv-rank-demo .r2 { color: var(--tp-rank-second-text); }
.pv-rank-demo .r3 { color: var(--tp-rank-third-text); }
.pv-button-demo { display: flex; gap: 8px; flex-wrap: wrap; }
.tp-primary, .tp-ghost, .tp-hover { border-radius: 10px; padding: 9px 13px; font-weight: 800; border: 1px solid transparent; }
.tp-primary { background: var(--tp-btn-primary-bg); color: var(--tp-btn-primary-text); }
.tp-ghost { background: var(--tp-btn-ghost-bg); color: var(--tp-btn-ghost-text); border-color: rgba(255,255,255,.1); }
.tp-hover { background: transparent; color: var(--tp-btn-hover-text); border-color: var(--tp-btn-hover-border); }
.tp-filters.compact { margin: 0; }
.pv-section-demo { display: flex; align-items: center; gap: 10px; color: var(--tp-text); }
.section-line { width: 5px; height: 28px; border-radius: 5px; background: var(--tp-section-accent-bg); }
.tp-row.compact { grid-template-columns: repeat(2, minmax(78px, 1fr)); margin-top: 0; max-width: 190px; }
.score-poster { position: relative; overflow: hidden; }
.score-poster::after { content: ''; position: absolute; inset: 0; background: var(--tp-poster-overlay-bg); }
.score-poster em { position: absolute; right: 6px; top: 6px; z-index: 2; font-style: normal; font-size: 12px; font-weight: 900; color: var(--tp-badge-score-text); background: var(--tp-badge-score-bg); border-radius: 7px; padding: 2px 6px; }
.pv-play-demo { display: grid; gap: 9px; }
.tp-line-tabs, .tp-channel-tabs { display: flex; gap: 7px; flex-wrap: wrap; }
.tp-line-tabs span, .tp-channel-tabs span { border-radius: 8px; padding: 6px 10px; background: var(--tp-card); color: var(--tp-muted2); border: 1px solid rgba(255,255,255,.08); font-size: 12px; }
.tp-line-tabs span.on { background: var(--tp-play-line-active-bg); color: var(--tp-play-line-active-text); border-color: transparent; font-weight: 800; }
.tp-channel-tabs span.on { background: var(--tp-play-channel-active-bg); color: var(--tp-play-channel-active-text); border-color: transparent; font-weight: 800; }
.pv-gallery-demo { display: flex; gap: 8px; }
.pv-gallery-demo .still { width: 74px; aspect-ratio: 16/9; border-radius: 8px; background: var(--tp-card); border: 1px solid rgba(255,255,255,.1); }
.pv-gallery-demo .still.on { border-color: var(--tp-gallery-active-border); box-shadow: 0 0 0 2px color-mix(in srgb, var(--tp-gallery-active-border) 24%, transparent); }
.pv-user-demo { border-radius: 12px; padding: 14px; background: var(--tp-onboarding-bg); border: 1px solid rgba(255,255,255,.1); }
.pv-user-demo b { display: block; color: var(--tp-text); margin-bottom: 6px; }
.pv-user-demo span { display: block; color: var(--tp-muted); font-size: 12px; }
.tp-shell { display: grid; grid-template-columns: 86px minmax(0, 1fr); min-height: 360px; background: var(--tp-bg); }
.tp-side { padding: 14px 10px; background: color-mix(in srgb, var(--tp-bg) 88%, #000); border-right: 1px solid rgba(255,255,255,.06); }
.tp-brand { display: flex; align-items: center; gap: 7px; color: var(--tp-text); font-weight: 900; font-size: 12px; margin-bottom: 16px; min-width: 0; }
.tp-brand span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tp-nav { height: 28px; display: flex; align-items: center; padding: 0 8px; color: var(--tp-muted2); border-radius: 8px; font-size: 12px; margin-bottom: 5px; }
.tp-nav.on { color: var(--tp-nav-active-text); background: var(--tp-nav-active-bg); font-weight: 800; }
.tp-main { min-width: 0; padding: 14px; }
.tp-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.tp-search { flex: 1; height: 30px; border-radius: 18px; background: var(--tp-search-bg); color: var(--tp-muted);
  border: 1px solid rgba(255,255,255,.08); display: flex; align-items: center; padding: 0 14px; font-size: 12px; }
.tp-user { width: 30px; height: 30px; border-radius: 50%; background: var(--tp-card-hi); border: 1px solid rgba(255,255,255,.1); flex-shrink: 0; }
.tp-hero { min-height: 160px; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end;
  background: linear-gradient(135deg, var(--tp-card-hi), var(--tp-soft)); position: relative; overflow: hidden; }
.tp-hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 72% 18%, var(--tp-rose-soft), transparent 34%); pointer-events: none; }
.tp-hero > * { position: relative; }
.tp-badge { display: inline-flex; color: var(--tp-hero-badge-text); background: var(--tp-hero-badge-bg);
  border-radius: 7px; padding: 4px 9px; font-size: 12px; font-weight: 800; margin-bottom: 9px; }
.tp-title { font-size: 24px; font-weight: 900; color: var(--tp-text); line-height: 1.15; }
.tp-title.sm { font-size: 18px; }
.tp-meta { display: flex; align-items: center; gap: 7px; color: var(--tp-muted); font-size: 12px; margin-top: 8px; flex-wrap: wrap; }
.tp-meta span { background: rgba(255,255,255,.06); border-radius: 6px; padding: 3px 7px; }
.tp-meta b { color: var(--tp-gold); }
.tp-hero button { margin-top: 14px; border: 0; border-radius: 10px; padding: 9px 15px; background: var(--tp-hero-primary-button-bg); color: var(--tp-hero-primary-button-text); font-weight: 800; }
.tp-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; margin-top: 12px; }
.tp-poster { aspect-ratio: 2/3; border-radius: 10px; background: var(--tp-card); border: 1px solid rgba(255,255,255,.08); padding: 8px; }
.tp-poster span { display: block; height: 8px; border-radius: 8px; background: var(--tp-muted); opacity: .35; margin-top: auto; }
.tp-player { aspect-ratio: 16/9; border-radius: 12px; background: #000; border: 1px solid rgba(255,255,255,.1); margin-bottom: 12px; }
.tp-play-info { display: flex; gap: 12px; background: var(--tp-card); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 12px; }
.tp-cover { width: 54px; aspect-ratio: 2/3; border-radius: 8px; background: var(--tp-card-hi); flex-shrink: 0; }
.tp-copy { min-width: 0; flex: 1; }
.tp-line { height: 9px; border-radius: 8px; background: var(--tp-muted); opacity: .32; margin-top: 12px; }
.tp-line.short { width: 64%; margin-top: 8px; }
.tp-eps { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 12px; }
.tp-eps span { width: 32px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center;
  background: var(--tp-card); color: var(--tp-muted2); border: 1px solid rgba(255,255,255,.08); font-size: 12px; }
.tp-eps span.on { color: var(--tp-play-episode-active-text); background: var(--tp-play-episode-active-bg); border-color: transparent; }
.tp-filters { display: flex; gap: 8px; padding: 12px; background: var(--tp-card); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; margin-bottom: 12px; }
.tp-filters span { height: 28px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 8px; color: var(--tp-muted2); background: rgba(255,255,255,.05); font-size: 12px; }
.tp-filters span.on { background: var(--tp-chip-active-bg); color: var(--tp-chip-active-text); font-weight: 800; }
.tp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.tp-list-card { min-width: 0; }
.tp-list-card div { aspect-ratio: 2/3; border-radius: 10px; background: var(--tp-card); border: 1px solid rgba(255,255,255,.08); }
.tp-list-card span { display: block; height: 8px; border-radius: 8px; background: var(--tp-muted); opacity: .35; margin-top: 8px; }
@media (max-width: 1180px) {
  .site-wrap { grid-template-columns: 1fr; }
  .preview-card { position: static; }
}
@media (max-width: 760px) {
  .theme-grid { grid-template-columns: 1fr; }
  .theme-field, .theme-field.alpha { grid-template-columns: 1fr; }
  .raw-input { grid-column: auto; }
  .hint.inline { margin-left: 0; }
  .tp-shell { grid-template-columns: 1fr; }
  .tp-side { display: none; }
}
</style>
