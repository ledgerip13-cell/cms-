<template>
  <div class="site-wrap">
    <div class="card site-editor-card">
      <div class="toolbar">
        <div class="sec-title">站点设置</div>
        <el-button type="primary" :icon="Check" :loading="saving" :disabled="!siteLoaded" @click="save">保存设置</el-button>
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
              <el-switch v-model="form.allowRegister" inline-prompt active-text="允许" inactive-text="关闭" />
              <div class="hint inline">关闭后，新用户无法注册，已有用户仍可登录。</div>
            </el-form-item>

            <el-alert type="info" :closable="false" title="邀请码已迁移到「权限访问 / 邀请码池」统一管理。" style="max-width:520px" />
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="首页设置" name="home">
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
        </el-tab-pane>

        <el-tab-pane label="刷短剧" name="shorts">
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
                <el-radio-button v-for="item in shortsSortOptions" :key="item.value" :label="item.value">{{ item.label }}</el-radio-button>
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
        </el-tab-pane>

        <el-tab-pane label="播放策略" name="playback">
          <el-form :model="form.playConfig" label-width="140px" class="site-form">
            <el-form-item label="隐藏重复通道">
              <el-switch v-model="form.playConfig.hideDuplicateSourceChannels" inline-prompt active-text="开启" inactive-text="关闭" />
              <div class="hint inline">同一采集源下，若 HLS 直链与 share/iframe 包装通道集数完全一致，观众端只显示直链通道。</div>
            </el-form-item>
            <el-form-item label="全局回源模式">
              <el-select v-model="form.playConfig.proxyMode" style="width:300px">
                <el-option label="direct 直连源站（默认，不吃带宽）" value="direct" />
                <el-option label="key 仅代理密钥（加密源，TS直连）" value="key" />
                <el-option label="proxy TS全中转（藏源/防盗链，吃带宽）" value="proxy" />
              </el-select>
              <div class="hint inline">采集源回源模式选“跟随全局”时使用此默认值。默认 direct 不下载任何 TS；需藏源/处理加密源才逐源或全局调高。</div>
            </el-form-item>
            <el-form-item label="本地转存清晰度">
              <el-select v-model="form.playConfig.archiveResolution" style="width:300px">
                <el-option label="最高清（体积最大）" :value="0" />
                <el-option label="1080P 蓝光" :value="1080" />
                <el-option label="720P 高清（推荐，体积约减半）" :value="720" />
                <el-option label="480P 标清（最省盘）" :value="480" />
              </el-select>
              <div class="hint inline">金牌等源本地转存时下载的清晰度上限。CDN 按 IP 限速下，降清晰度可成倍提速并省磁盘（一部 1080P 剧约 90G，720P 约减半）。若无所选清晰度则取≤上限的最高一档。</div>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="PWA" name="pwa">
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
                  <el-upload :show-file-list="false" :before-upload="onPwaIcon" accept="image/*">
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
        </el-tab-pane>

        <el-tab-pane label="主题设置" name="theme">
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

      <template v-else-if="activeSettingTab === 'shorts'">
        <div class="sec-title" style="margin-bottom:14px">刷短剧预览</div>
        <div class="shorts-preview">
          <div class="sp-phone">
            <div class="sp-top">
              <span>刷短剧</span>
              <em>{{ form.shortsConfig.enabled ? '已开启' : '已隐藏' }}</em>
            </div>
            <div class="sp-video">
              <b>{{ form.shortsConfig.defaultType || '短剧' }}</b>
              <span>{{ shortsSortLabel(form.shortsConfig.sortMode) }}</span>
              <button v-if="form.shortsConfig.showImmersiveButton">沉浸</button>
            </div>
            <div class="sp-bottom">
              <span>每次 {{ form.shortsConfig.feedLimit }} 条</span>
              <span>{{ form.shortsConfig.enableSearch ? '框架内搜索' : '搜索关闭' }}</span>
            </div>
          </div>
          <p class="pv-foot">自动下一集：{{ form.shortsConfig.autoPlayNext ? '开启' : '关闭' }}</p>
          <p class="pv-foot">游客试看：{{ form.shortsConfig.guestPreviewEpisodes }} 集</p>
          <p class="pv-foot">偏好范围：{{ shortsScopePreview }}</p>
        </div>
      </template>

      <template v-else-if="activeSettingTab === 'playback'">
        <div class="sec-title" style="margin-bottom:14px">播放策略预览</div>
        <div class="play-policy-preview">
          <div class="policy-row">
            <b>重复包装通道</b>
            <el-tag size="small" :type="form.playConfig.hideDuplicateSourceChannels ? 'success' : 'info'" effect="plain">
              {{ form.playConfig.hideDuplicateSourceChannels ? '观众端隐藏' : '观众端展示' }}
            </el-tag>
          </div>
          <p class="pv-foot">后台仍保留全部原始线路；该策略只影响观众播放页和刷短剧选线。</p>
        </div>
      </template>

      <template v-else-if="activeSettingTab === 'pwa'">
        <div class="sec-title" style="margin-bottom:14px">PWA 预览</div>
        <div class="pwa-preview">
          <div class="pwa-icon">
            <img v-if="form.pwaConfig.icon || form.logo" :src="form.pwaConfig.icon || form.logo" alt="PWA 图标" />
            <el-icon v-else :size="28" color="#c0c4cc"><Picture /></el-icon>
          </div>
          <b>{{ form.pwaConfig.shortName || form.pwaConfig.name || form.siteName || '视频CMS' }}</b>
          <span>{{ form.pwaConfig.enabled ? '支持添加到桌面' : 'PWA 已关闭' }}</span>
        </div>
        <p class="pv-foot">更新提示：新版本发布后，已安装用户会看到前台升级弹窗。</p>
      </template>

      <template v-else>
        <div class="preview-head">
          <div>
            <div class="sec-title">影响预览</div>
            <div class="preview-sub">
              全局主题 · 当前字段：{{ currentField.label }}
            </div>
          </div>
          <el-tag size="small" effect="plain">高亮影响区域</el-tag>
        </div>
        <div class="impact-tags">
          <el-tag v-for="x in currentImpacts" :key="x" size="small" effect="plain">{{ x }}</el-tag>
        </div>

        <div class="theme-preview" :style="previewVars">
          <div class="tp-shell">
            <aside class="tp-side" :class="{hl: previewActive('nav') || previewActive('surface')}">
              <div class="tp-brand"><span>●</span><span>Video CMS</span></div>
              <div class="tp-nav on">精选</div>
              <div class="tp-nav">电影</div>
              <div class="tp-nav">动漫</div>
            </aside>
            <main class="tp-main">
              <div class="tp-bar" :class="{hl: previewActive('search')}">
                <div class="tp-search">搜索影片、演员</div>
                <button class="tp-search-button">搜索</button>
                <div class="tp-user"></div>
              </div>

              <section class="tp-hero" :class="{hl: previewActive('hero') || previewActive('surface')}">
                <div class="tp-badge">热门推荐</div>
                <div class="tp-title">斗破苍穹 第五季</div>
                <div class="tp-meta"><span>2026</span><span>动漫</span><b>8.7</b></div>
                <button>立即播放</button>
              </section>

              <div class="tp-preview-row">
                <div class="tp-preview-left">
                  <div class="tp-filters" :class="{hl: previewActive('chip')}">
                    <span class="on">全部</span><span>热播</span><span>新番</span>
                  </div>
                  <div class="pv-section-demo" :class="{hl: previewActive('section')}">
                    <div class="section-line"></div><b>每日更新</b>
                  </div>
                  <div class="tp-row compact" :class="{hl: previewActive('poster') || previewActive('surface')}">
                    <div class="tp-poster score-poster"><em>8.7</em><span></span></div>
                    <div class="tp-poster"><span></span></div>
                  </div>
                </div>
                <div class="tp-preview-right">
                  <div class="pv-rank-demo" :class="{hl: previewActive('rank')}">
                    <span class="r1">1</span><span class="r2">2</span><span class="r3">3</span>
                  </div>
                  <div class="pv-button-demo" :class="{hl: previewActive('button')}">
                    <button class="tp-primary">主按钮</button>
                    <button class="tp-ghost">次按钮</button>
                  </div>
                </div>
              </div>

              <section class="pv-play-demo tp-play-info" :class="{hl: previewActive('play') || previewActive('surface')}">
                <div class="tp-cover"></div>
                <div class="tp-copy">
                  <div class="tp-line-tabs"><span class="on">线路一</span><span>线路二</span></div>
                  <div class="tp-channel-tabs"><span class="on">推荐</span><span>备用</span></div>
                  <div class="tp-eps"><span v-for="i in 5" :key="i" :class="{on: i === 1}">{{ i }}</span></div>
                </div>
              </section>
            </main>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { Check, Upload, Picture } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api, DEFAULT_THEME, normalizeHomeConfig, normalizePlayConfig, normalizePwaConfig, normalizeShortsConfig, normalizeTheme, readCachedSite, writeCachedSite } from '../api'

const form = ref(readCachedSite())
const saving = ref(false)
const siteLoaded = ref(false)
const activeSettingTab = ref('basic')
const activeFieldKey = ref('accent')
const categoryOptions = ref([])
const subtypeGroups = ref([])
const subtypeCascaderProps = { multiple: true, emitPath: false, checkStrictly: true }
const shortsSortOptions = [
  { value: 'smart', label: '智能' },
  { value: 'hot', label: '热度' },
  { value: 'recent', label: '最新' },
  { value: 'rating', label: '评分' },
]
const themeGroups = [
  {
    key: 'base',
    label: '底板',
    desc: '页面底色、卡片、文字阶梯',
    fields: [
      { key: 'bg', label: '页面背景' },
      { key: 'card', label: '卡片背景' },
      { key: 'border', label: '分割线', alpha: true },
      { key: 'text', label: '主文字' },
      { key: 'textDim', label: '次要文字' },
      { key: 'textSub', label: '三级文字' },
    ],
  },
  {
    key: 'brand',
    label: '品牌强调',
    desc: '导航、chip、搜索聚焦、播放线路等选中态',
    fields: [
      { key: 'accent', label: '品牌边框色', alpha: true },
      { key: 'accentBgStart', label: '渐变起点', alpha: true },
      { key: 'accentBgEnd', label: '渐变终点', alpha: true },
      { key: 'onBrand', label: '品牌主色文字' },
      { key: 'accentSoft', label: '透明底(%)', type: 'alpha' },
    ],
  },
  {
    key: 'action',
    label: '操作按钮',
    desc: '白底按钮单独设置；主按钮跟随品牌主色',
    fields: [
      { key: 'surfaceButtonBg', label: '白底按钮背景' },
      { key: 'surfaceButtonText', label: '白底按钮文字' },
    ],
  },
  {
    key: 'search',
    label: '搜索',
    desc: '搜索框底色与搜索榜单弹层背景',
    fields: [
      { key: 'searchBg', label: '搜索框底色', alpha: true },
      { key: 'searchPanelBg', label: '榜单背景', alpha: true },
    ],
  },
  {
    key: 'semantic',
    label: '语义色',
    desc: '评分、标签等特殊场景色',
    fields: [
      { key: 'rating', label: '评分色' },
      { key: 'ratingText', label: '评分文字' },
      { key: 'tag', label: '标签色' },
    ],
  },
  {
    key: 'rank',
    label: '榜单',
    desc: '搜索榜单前三名独立设色，不再绑评分/标签/品牌色',
    fields: [
      { key: 'rankFirst', label: '第 1 名' },
      { key: 'rankSecond', label: '第 2 名' },
      { key: 'rankThird', label: '第 3 名' },
    ],
  },
  {
    key: 'hero',
    label: 'Hero',
    desc: '首页大图遮罩和背景融合',
    fields: [
      { key: 'heroOverlayColor', label: 'Hero遮罩色' },
      { key: 'heroOverlayStrength', label: '融合强度(%)', type: 'alpha' },
    ],
  },
  {
    key: 'fixed',
    label: '固定色',
    desc: '深浅底上的文字色',
    fields: [
      { key: 'onDark', label: '白底深字' },
      { key: 'surfaceDim', label: '最暗表面' },
    ],
  },
]

const fieldMeta = {
  bg:         { impacts: ['页面底色'], previews: ['surface'] },
  card:       { impacts: ['卡片/面板/弹窗'], previews: ['surface'] },
  border:     { impacts: ['所有分割线/边框'], previews: ['surface'] },
  text:       { impacts: ['正文/标题'], previews: ['surface'] },
  textDim:    { impacts: ['次要信息/导航常态'], previews: ['surface', 'nav'] },
  textSub:    { impacts: ['三级文字/placeholder'], previews: ['surface'] },
  accent:     { impacts: ['hover边框/搜索聚焦/透明底计算'], previews: ['nav', 'search', 'hero', 'play'] },
  accentBgStart: { impacts: ['品牌渐变起始色，支持透明度'], previews: ['chip', 'section', 'play'] },
  accentBgEnd:   { impacts: ['品牌渐变结束色，支持透明度'], previews: ['chip', 'section', 'play'] },
  accentSoft: { impacts: ['导航选中背景/Hero徽标底/引导面板 — 全自动联动'], previews: ['nav', 'hero'] },
  surfaceButtonBg:   { impacts: ['搜索按钮/Hero主按钮背景'], previews: ['search', 'hero'] },
  surfaceButtonText: { impacts: ['搜索按钮/Hero主按钮文字'], previews: ['search', 'hero'] },
  searchBg:   { impacts: ['顶部搜索框底色'], previews: ['search'] },
  searchPanelBg: { impacts: ['搜索弹层/热门榜单背景透明度'], previews: ['search', 'rank'] },
  rating:     { impacts: ['评分角标背景/评分文字'], previews: ['poster'] },
  ratingText: { impacts: ['评分角标文字'], previews: ['poster'] },
  tag:        { impacts: ['标签/玫瑰强调'], previews: ['rank'] },
  rankFirst:  { impacts: ['搜索榜单第 1 名'], previews: ['rank'] },
  rankSecond: { impacts: ['搜索榜单第 2 名'], previews: ['rank'] },
  rankThird:  { impacts: ['搜索榜单第 3 名'], previews: ['rank'] },
  heroOverlayColor:    { impacts: ['Hero大图遮罩色/底部融合色'], previews: ['hero'] },
  heroOverlayStrength: { impacts: ['Hero大图遮罩强度/底部融合强度'], previews: ['hero'] },
  onBrand:    { impacts: ['品牌底文字(chip/播放选中态)'], previews: ['chip', 'play'] },
  onDark:     { impacts: ['白按钮/搜索按钮深字'], previews: ['search'] },
  surfaceDim: { impacts: ['海报占位/缩略图底'], previews: ['poster'] },
}

const previewColors = computed(() => effectiveTheme())
const visibleThemeGroups = computed(() => themeGroups.map(group => ({
  ...group,
  fields: group.fields.map(f => ({ ...f, ...(fieldMeta[f.key] || {}) })),
})))
const allThemeFields = computed(() => themeGroups.flatMap(group => group.fields.map(f => ({ ...f, ...(fieldMeta[f.key] || {}) }))))
const currentField = computed(() => allThemeFields.value.find(f => f.key === activeFieldKey.value) || allThemeFields.value[0] || { label: '主题字段', impacts: [], previews: ['surface'] })
const currentImpacts = computed(() => currentField.value.impacts?.length ? currentField.value.impacts : ['当前字段影响的组件'])
const currentPreviewBlocks = computed(() => currentField.value.previews?.length ? currentField.value.previews : ['surface'])
const previewVars = computed(() => {
  const c = previewColors.value
  const acc_soft = rgba(c.accent, alphaPercent(c.accentSoft, .12))
  const brandBg = `linear-gradient(120deg, ${c.accentBgStart || c.accentBg || c.accent}, ${c.accentBgEnd || c.accentBgStart || c.accentBg || c.accent})`
  const heroOverlay = c.heroOverlayColor || c.bg
  const heroStrength = alphaPercent(c.heroOverlayStrength, .88)
  const gh = rgbaColor('#ffffff', .06)
  return {
    '--tp-bg': c.bg, '--tp-card': c.card, '--tp-text': c.text,
    '--tp-muted2': c.textDim, '--tp-muted': c.textSub,
    '--tp-accent': c.accent, '--tp-accent-lt': c.accent, '--tp-accent-soft': acc_soft, '--tp-grad': brandBg,
    '--tp-rating': c.rating, '--tp-rating-text': c.ratingText, '--tp-tag': c.tag,
    '--tp-gold': c.rating,
    '--tp-on-brand': c.onBrand, '--tp-on-dark': c.onDark, '--tp-surface-dim': c.surfaceDim,
    '--tp-card-hi': c.surfaceDim,
    '--tp-soft': rgba(c.accent, .18),
    '--tp-rose-soft': rgba(c.tag, .22),
    '--tp-hero-overlay-strong': rgba(heroOverlay, heroStrength),
    '--tp-hero-overlay-mid': rgba(heroOverlay, Math.max(.18, heroStrength * .72)),
    '--tp-hero-overlay-soft': rgba(heroOverlay, Math.max(.08, heroStrength * .32)),
    '--tp-hero-bottom': c.bg,
    '--tp-hero-bottom-mid': rgba(c.bg, .82),
    '--tp-hero-bottom-soft': rgba(c.bg, .36),
    '--tp-nav-active-bg': acc_soft, '--tp-nav-active-text': c.accent,
    '--tp-search-button-bg': c.surfaceButtonBg, '--tp-search-button-text': c.surfaceButtonText,
    '--tp-search-bg': c.searchBg || rgbaColor(c.card, .5),
    '--tp-search-panel-bg': c.searchPanelBg || rgbaColor(c.card, .82),
    '--tp-rank-first-text': c.rankFirst, '--tp-rank-second-text': c.rankSecond, '--tp-rank-third-text': c.rankThird,
    '--tp-btn-primary-bg': brandBg, '--tp-btn-primary-text': c.onBrand,
    '--tp-btn-ghost-bg': gh, '--tp-btn-ghost-text': c.text,
    '--tp-btn-hover-text': c.accent, '--tp-btn-hover-border': c.accent,
    '--tp-section-accent-bg': brandBg,
    '--tp-poster-overlay-bg': `linear-gradient(0deg, ${rgba(c.bg, .82)} 0%, transparent 55%)`,
    '--tp-badge-score-bg': c.rating, '--tp-badge-score-text': c.ratingText,
    '--tp-hero-badge-bg': acc_soft, '--tp-hero-badge-text': c.accent,
    '--tp-hero-primary-button-bg': c.surfaceButtonBg, '--tp-hero-primary-button-text': c.surfaceButtonText,
    '--tp-chip-active-bg': brandBg, '--tp-chip-active-text': c.onBrand,
    '--tp-play-line-active-bg': brandBg, '--tp-play-line-active-text': c.onBrand,
    '--tp-play-channel-active-bg': brandBg, '--tp-play-channel-active-text': c.onBrand,
    '--tp-play-episode-active-bg': brandBg, '--tp-play-episode-active-text': c.onBrand,
    '--tp-gallery-active-border': c.accent,
    '--tp-onboarding-bg': `linear-gradient(135deg, ${acc_soft}, rgba(32,36,52,.78))`,
  }
})

const shortsSubtypeOptions = computed(() => subtypeGroups.value.map(group => ({
  value: typeScopeKey(group.type),
  label: group.type,
  children: group.children.map(item => ({
    value: subtypeKey(group.type, item.name),
    label: `${item.name} (${item.count || 0})`,
  })),
})))

const shortsScopeKeys = computed({
  get() {
    const types = Array.isArray(form.value.shortsConfig?.preferredTypes) ? form.value.shortsConfig.preferredTypes : []
    const subtypes = Array.isArray(form.value.shortsConfig?.preferredSubtypes) ? form.value.shortsConfig.preferredSubtypes : []
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
    form.value.shortsConfig.preferredTypes = types
    form.value.shortsConfig.preferredSubtypes = subtypes
  },
})

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
  ensureTheme()
  ensureHomeConfig()
  ensureShortsConfig()
  ensurePlayConfig()
  ensurePwaConfig()
  await loadCategoryOptions()
}

function categoryLabel(item) {
  return item?.count ? `${item.name} (${item.count})` : item?.name || ''
}

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

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key)
}

function effectiveTheme() {
  const theme = form.value.theme || {}
  return {
    ...DEFAULT_THEME.global,
    ...(theme.global || {}),
  }
}

function themeValue(key) {
  if (hasOwn(form.value.theme?.global, key)) return form.value.theme.global[key]
  return DEFAULT_THEME.global[key]
}

function setThemeValue(key, value) {
  setActiveField(key)
  if (!form.value.theme.global) form.value.theme.global = {}
  form.value.theme.global[key] = normalizeThemeValue(key, value)
}

function setActiveField(key) {
  activeFieldKey.value = key
}

function previewActive(block) {
  return currentPreviewBlocks.value.includes(block)
}

function shortsSortLabel(value) {
  return shortsSortOptions.find(x => x.value === value)?.label || '智能'
}

function resetTheme() {
  form.value.theme.global = { ...DEFAULT_THEME.global }
}

function cssVarName(key) {
  return key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
}

function alphaColorField(key) {
  return allThemeFields.value.some(f => f.key === key && f.alpha)
}

function clampAlpha(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.max(0, Math.min(1, n))
}

function fmtAlpha(value) {
  return Number(clampAlpha(value).toFixed(3)).toString()
}

function parseCssColor(value) {
  const raw = String(value || '').trim()
  const hex = raw.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i)
  if (hex) {
    const body = hex[1]
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
      a: hex[2] ? parseInt(hex[2], 16) / 255 : 1,
      hasAlpha: Boolean(hex[2]),
    }
  }
  const rgb = raw.match(/^rgba?\((.+)\)$/i)
  if (rgb) {
    const parts = rgb[1].split(',').map(x => x.trim())
    if (parts.length >= 3) {
      const [r, g, b] = parts.map(Number)
      if ([r, g, b].every(Number.isFinite)) {
        const hasAlpha = parts.length >= 4
        return { r, g, b, a: hasAlpha ? clampAlpha(parts[3]) : 1, hasAlpha }
      }
    }
  }
  return null
}

function colorToRgba(color, fallbackAlpha = 1) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${fmtAlpha(color.hasAlpha ? color.a : fallbackAlpha)})`
}

function normalizeThemeValue(key, value) {
  if (!alphaColorField(key)) return value
  const color = parseCssColor(value)
  if (!color) return value
  const oldColor = parseCssColor(themeValue(key))
  const fallbackAlpha = oldColor?.a ?? 1
  return colorToRgba(color, fallbackAlpha)
}

function hexToRgb(hex) {
  const color = parseCssColor(hex)
  if (!color) return null
  return {
    r: color.r,
    g: color.g,
    b: color.b,
  }
}

function rgba(hex, alpha) {
  const c = hexToRgb(hex)
  return c ? `rgba(${c.r},${c.g},${c.b},${alpha})` : hex
}

function rgbaColor(value, alpha) {
  const color = parseCssColor(value)
  return color ? `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${fmtAlpha(alpha)})` : value
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
    ensureTheme()
    ensureHomeConfig()
    ensureShortsConfig()
    ensurePlayConfig()
    ensurePwaConfig()
    form.value = writeCachedSite(await api.updateSite(form.value))
    ensureTheme()
    ensureHomeConfig()
    ensureShortsConfig()
    ensurePlayConfig()
    ensurePwaConfig()
    ElMessage.success('站点设置已保存，前端刷新后生效')
  } catch (e) { ElMessage.error(e.message || '保存失败') } finally { saving.value = false }
}
onMounted(() => { ensureTheme(); ensureHomeConfig(); ensureShortsConfig(); ensurePlayConfig(); ensurePwaConfig(); load() })
</script>

<style scoped>
.site-wrap { display: grid; grid-template-columns: minmax(560px, 1fr) minmax(320px, 420px); gap: 20px; align-items: start; }
.site-editor-card { min-width: 0; }
.site-tabs { margin-top: 8px; }
.site-form { margin-top: 8px; max-width: 820px; }
.logo-row { display: flex; gap: 16px; align-items: flex-start; }
.logo-preview { width: 64px; height: 64px; border-radius: 12px; border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fafbfc; flex-shrink: 0; }
.logo-preview img { width: 100%; height: 100%; object-fit: cover; }
.hint { font-size: 12px; color: var(--text-3); margin-top: 6px; }
.hint.inline { margin: 0 0 0 12px; }
.preview-card { position: sticky; top: 84px; max-height: calc(100vh - 108px); overflow: auto; scrollbar-gutter: stable; }
.preview-card::-webkit-scrollbar { width: 6px; }
.preview-card::-webkit-scrollbar-thumb { background: #d9deea; border-radius: 999px; }
.preview-nav { display: flex; align-items: center; justify-content: space-between;
  background: #0b0e14; border-radius: 10px; padding: 12px 14px; gap: 12px; }
.pv-brand { display: flex; align-items: center; gap: 8px; color: #ff5c8a; font-weight: 800; font-size: 18px; min-width: 0; }
.pv-brand span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv-logo { width: 24px; height: 24px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
.pv-search { flex-shrink: 0; font-size: 12px; color: #8a94a7; background: #141925; padding: 6px 12px; border-radius: 14px; }
.pv-desc { color: var(--text-2); font-size: 13px; margin: 14px 4px 6px; line-height: 1.6; }
.pv-foot { color: var(--text-3); font-size: 12px; margin: 0 4px; line-height: 1.7; }
.shorts-preview { display: grid; gap: 10px; }
.sp-phone { width: 188px; height: 332px; margin: 0 auto 8px; border-radius: 24px; overflow: hidden; position: relative;
  background: linear-gradient(180deg, #111827, #05060a); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 18px 48px rgba(15,23,42,.18); color: #fff; }
.sp-top { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 14px 12px 34px;
  background: linear-gradient(180deg, rgba(0,0,0,.72), transparent); font-size: 12px; font-weight: 900; }
.sp-top em { font-style: normal; color: rgba(255,255,255,.62); font-size: 10px; }
.sp-video { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end; padding: 0 12px 48px;
  background: radial-gradient(circle at 58% 36%, rgba(255,94,108,.22), transparent 34%); }
.sp-video b { font-size: 18px; line-height: 1.2; }
.sp-video span { margin-top: 5px; font-size: 11px; color: rgba(255,255,255,.68); }
.sp-video button { position: absolute; right: 10px; bottom: 86px; width: 42px; height: 26px; border: 1px solid rgba(255,255,255,.28); border-radius: 999px;
  background: rgba(255,255,255,.1); color: #fff; font-size: 11px; font-weight: 900; }
.sp-bottom { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-between; gap: 8px; padding: 13px 12px;
  background: linear-gradient(0deg, rgba(0,0,0,.72), transparent); font-size: 10px; color: rgba(255,255,255,.72); }
.play-policy-preview { display: grid; gap: 10px; }
.policy-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 12px; border-radius: 12px;
  border: 1px solid var(--border); background: #fafbfc; }
.policy-row b { color: var(--text-1); font-size: 14px; }
.pwa-preview { display: grid; justify-items: center; gap: 8px; padding: 24px 12px; border-radius: 16px; background: #fafbfc; text-align: center; border: 1px solid var(--border); }
.pwa-icon { width: 72px; height: 72px; border-radius: 18px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff; box-shadow: 0 12px 30px rgba(20,24,36,.12); }
.pwa-icon img { width: 100%; height: 100%; object-fit: cover; }
.pwa-preview b { color: var(--text-1); font-size: 15px; }
.pwa-preview span { color: var(--text-3); font-size: 12px; }
.theme-layout { max-width: none; }
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
.preview-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px;
  position: sticky; top: -1px; z-index: 2; padding-bottom: 10px; background: var(--card-bg); }
.preview-sub { margin-top: 4px; color: var(--text-3); font-size: 12px; }
.impact-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: -4px 0 12px; }
.theme-preview { border-radius: 14px; overflow: hidden; background: var(--tp-bg); color: var(--tp-text);
  border: 1px solid rgba(255,255,255,.1); box-shadow: 0 12px 32px rgba(0,0,0,.12); padding: 14px; }
.theme-preview .hl { position: relative; outline: 2px solid #4f6ef7; outline-offset: 3px; box-shadow: 0 0 0 6px rgba(79,110,247,.18); }
.theme-preview .hl::after { content: ''; position: absolute; inset: -4px; border-radius: inherit; pointer-events: none; border: 1px solid rgba(255,255,255,.42); }
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
.pv-rank-demo { display: flex; gap: 12px; align-items: center; width: fit-content; padding: 9px 12px; border-radius: 12px;
  background: var(--tp-search-panel-bg); border: 1px solid rgba(255,255,255,.08); font-size: 22px; font-weight: 900; font-style: italic; }
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
.tp-hero::after { content: ''; position: absolute; inset: 0; background:
  linear-gradient(90deg, var(--tp-hero-overlay-strong) 0%, var(--tp-hero-overlay-mid) 44%, var(--tp-hero-overlay-soft) 100%),
  linear-gradient(0deg, var(--tp-hero-bottom) 0%, var(--tp-hero-bottom-mid) 30%, var(--tp-hero-bottom-soft) 52%, transparent 72%); pointer-events: none; }
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
.tp-preview-row { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(110px, .8fr); gap: 12px; margin-top: 12px; }
.tp-preview-left, .tp-preview-right { min-width: 0; display: grid; gap: 12px; align-content: start; }
.tp-preview-right { background: var(--tp-card); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 12px; }
.tp-preview-right .pv-rank-demo { justify-content: center; }
.tp-preview-right .pv-button-demo { justify-content: center; }
.tp-play-info.pv-play-demo { margin-top: 12px; }
@media (max-width: 1180px) {
  .site-wrap { grid-template-columns: minmax(0, 1fr); }
  .preview-card { position: static; order: -1; max-height: none; overflow: visible; }
}
@media (max-width: 760px) {
  .site-wrap { gap: 14px; }
  .logo-row, .edit-status, .theme-group-head, .policy-row, .preview-head { flex-direction: column; align-items: flex-start; }
  .logo-actions, .logo-actions .el-input, .site-form :deep(.el-select), .site-form :deep(.el-cascader) { width: 100% !important; }
  .theme-grid { grid-template-columns: 1fr; }
  .theme-field, .theme-field.alpha { grid-template-columns: 1fr; }
  .raw-input { grid-column: auto; }
  .hint.inline { display: block; margin: 6px 0 0; }
  .sp-phone { width: min(188px, 100%); }
  .tp-shell { grid-template-columns: 1fr; }
  .tp-side { display: none; }
}
</style>
