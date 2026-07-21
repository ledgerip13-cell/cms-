<template>
  <div class="card preview-card">
    <template v-if="activeTab === 'basic'">
      <div class="sec-title preview-title">基础信息预览</div>
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

    <template v-else-if="activeTab === 'shorts'">
      <div class="sec-title preview-title">刷短剧预览</div>
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

    <template v-else-if="activeTab === 'pwa'">
      <div class="sec-title preview-title">PWA 预览</div>
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
</template>

<script setup>
import { Picture } from '@element-plus/icons-vue'

defineProps({
  activeTab: { type: String, required: true },
  form: { type: Object, required: true },
  shortsSortLabel: { type: Function, required: true },
  shortsScopePreview: { type: String, required: true },
  currentField: { type: Object, required: true },
  currentImpacts: { type: Array, required: true },
  previewVars: { type: Object, required: true },
  previewActive: { type: Function, required: true },
})
</script>

<style scoped>
.preview-card { position: sticky; top: 84px; max-height: calc(100vh - 108px); overflow: auto; scrollbar-gutter: stable; }
.preview-card::-webkit-scrollbar { width: 6px; }
.preview-card::-webkit-scrollbar-thumb { background: #d9deea; border-radius: 999px; }
.preview-title { margin-bottom: 14px; }
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
.pwa-preview { display: grid; justify-items: center; gap: 8px; padding: 24px 12px; border-radius: 16px; background: #fafbfc; text-align: center; border: 1px solid var(--border); }
.pwa-icon { width: 72px; height: 72px; border-radius: 18px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff; box-shadow: 0 12px 30px rgba(20,24,36,.12); }
.pwa-icon img { width: 100%; height: 100%; object-fit: cover; }
.pwa-preview b { color: var(--text-1); font-size: 15px; }
.pwa-preview span { color: var(--text-3); font-size: 12px; }
.preview-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px;
  position: sticky; top: -1px; z-index: 2; padding-bottom: 10px; background: var(--card-bg); }
.preview-sub { margin-top: 4px; color: var(--text-3); font-size: 12px; }
.impact-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: -4px 0 12px; }
.theme-preview { border-radius: 14px; overflow: hidden; background: var(--tp-bg); color: var(--tp-text);
  border: 1px solid rgba(255,255,255,.1); box-shadow: 0 12px 32px rgba(0,0,0,.12); padding: 14px; }
.theme-preview .hl { position: relative; outline: 2px solid #4f6ef7; outline-offset: 3px; box-shadow: 0 0 0 6px rgba(79,110,247,.18); }
.theme-preview .hl::after { content: ''; position: absolute; inset: -4px; border-radius: inherit; pointer-events: none; border: 1px solid rgba(255,255,255,.42); }
.tp-search-button { border: 0; height: 30px; border-radius: 16px; padding: 0 14px; background: var(--tp-search-button-bg); color: var(--tp-search-button-text); font-weight: 800; }
.pv-rank-demo { display: flex; gap: 12px; align-items: center; width: fit-content; padding: 9px 12px; border-radius: 12px;
  background: var(--tp-search-panel-bg); border: 1px solid rgba(255,255,255,.08); font-size: 22px; font-weight: 900; font-style: italic; }
.pv-rank-demo .r1 { color: var(--tp-rank-first-text); }
.pv-rank-demo .r2 { color: var(--tp-rank-second-text); }
.pv-rank-demo .r3 { color: var(--tp-rank-third-text); }
.pv-button-demo { display: flex; gap: 8px; flex-wrap: wrap; }
.tp-primary, .tp-ghost { border-radius: 10px; padding: 9px 13px; font-weight: 800; border: 1px solid transparent; }
.tp-primary { background: var(--tp-btn-primary-bg); color: var(--tp-btn-primary-text); }
.tp-ghost { background: var(--tp-btn-ghost-bg); color: var(--tp-btn-ghost-text); border-color: rgba(255,255,255,.1); }
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
.tp-meta { display: flex; align-items: center; gap: 7px; color: var(--tp-muted); font-size: 12px; margin-top: 8px; flex-wrap: wrap; }
.tp-meta span { background: rgba(255,255,255,.06); border-radius: 6px; padding: 3px 7px; }
.tp-meta b { color: var(--tp-gold); }
.tp-hero button { margin-top: 14px; border: 0; border-radius: 10px; padding: 9px 15px; background: var(--tp-hero-primary-button-bg); color: var(--tp-hero-primary-button-text); font-weight: 800; }
.tp-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; margin-top: 12px; }
.tp-poster { aspect-ratio: 2/3; border-radius: 10px; background: var(--tp-card); border: 1px solid rgba(255,255,255,.08); padding: 8px; }
.tp-poster span { display: block; height: 8px; border-radius: 8px; background: var(--tp-muted); opacity: .35; margin-top: auto; }
.tp-play-info { display: flex; gap: 12px; background: var(--tp-card); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 12px; }
.tp-cover { width: 54px; aspect-ratio: 2/3; border-radius: 8px; background: var(--tp-card-hi); flex-shrink: 0; }
.tp-copy { min-width: 0; flex: 1; }
.tp-eps { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 12px; }
.tp-eps span { width: 32px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center;
  background: var(--tp-card); color: var(--tp-muted2); border: 1px solid rgba(255,255,255,.08); font-size: 12px; }
.tp-eps span.on { color: var(--tp-play-episode-active-text); background: var(--tp-play-episode-active-bg); border-color: transparent; }
.tp-filters { display: flex; gap: 8px; padding: 12px; background: var(--tp-card); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; margin-bottom: 12px; }
.tp-filters span { height: 28px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 8px; color: var(--tp-muted2); background: rgba(255,255,255,.05); font-size: 12px; }
.tp-filters span.on { background: var(--tp-chip-active-bg); color: var(--tp-chip-active-text); font-weight: 800; }
.tp-preview-row { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(110px, .8fr); gap: 12px; margin-top: 12px; }
.tp-preview-left, .tp-preview-right { min-width: 0; display: grid; gap: 12px; align-content: start; }
.tp-preview-right { background: var(--tp-card); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 12px; }
.tp-preview-right .pv-rank-demo { justify-content: center; }
.tp-preview-right .pv-button-demo { justify-content: center; }
.tp-play-info.pv-play-demo { margin-top: 12px; }
@media (max-width: 1180px) {
  .preview-card { position: static; order: -1; max-height: none; overflow: visible; }
}
@media (max-width: 760px) {
  .preview-head { flex-direction: column; align-items: flex-start; }
  .sp-phone { width: min(188px, 100%); }
  .tp-shell { grid-template-columns: 1fr; }
  .tp-side { display: none; }
}
</style>
