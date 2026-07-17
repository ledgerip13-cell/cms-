<template>
  <div class="x8-page">
    <header class="x8-header" :class="{ solid: scrolled }" :style="{ '--x8-header-bg': headerBgOpacity }">
      <button class="x8-brand" type="button" @click="goX8Home">
        <img v-if="showHomeLogo && site.logo" :src="site.logo" alt="logo" />
        <span v-else-if="showHomeLogo" class="x8-brand-mark">JP</span>
        <span class="x8-brand-text">
          <b>{{ site.siteName || '金牌影院' }}</b>
          <em>dododmb.com</em>
        </span>
      </button>
      <nav class="x8-nav" aria-label="主导航">
        <button type="button" :class="{ active: pageMode === 'home' }" @click="goX8Home">首页</button>
        <button v-for="item in navItems" :key="item.name" type="button" :class="{ active: curType === item.name }" @click="goShow(item.name)">
          {{ item.name }}
        </button>
      </nav>
      <form class="x8-search" @submit.prevent="doSearch">
        <input v-model.trim="kw" type="search" :placeholder="searchPlaceholder" @focus="searchFocused = true" @blur="searchFocused = false" />
        <button type="submit" aria-label="搜索">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </button>
      </form>
      <div class="x8-header-tools">
        <button type="button" @click="goRank">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19V9" /><path d="M12 19V5" /><path d="M19 19v-7" /></svg>
          <span>排行榜</span>
        </button>
        <button type="button" @click="goUser('history')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          <span>历史</span>
        </button>
        <button type="button" @click="goLogin">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V5h16v10H8l-4 4Z" /></svg>
          <span>求片</span>
        </button>
        <button type="button" @click="goLogin">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>
          <span>播放列表</span>
        </button>
        <button class="x8-login-btn" type="button" @click="goLogin">登录</button>
      </div>
    </header>

    <main>
      <template v-if="pageMode === 'home'">
        <section v-if="!heroItems.length" class="x8-banner x8-banner-skeleton">
          <div class="x8-skeleton-shine"></div>
          <div class="x8-skeleton-title"></div>
          <div class="x8-skeleton-subtitle"></div>
          <div class="x8-banner-dots skeleton">
            <button v-for="index in 6" :key="`hero-sk-${index}`" type="button"><span></span></button>
          </div>
        </section>
        <section v-else class="x8-banner">
          <div
            class="x8-banner-swiper"
            @mouseenter="pauseHero"
            @mouseleave="resumeHero"
            @touchstart.passive="onHeroTouchStart"
            @touchend.passive="onHeroTouchEnd"
          >
            <div class="x8-banner-track" :style="{ transform: `translate3d(-${heroIdx * 100}%, 0, 0)` }">
              <article v-for="item in heroItems" :key="`hero-${item.id}`" class="x8-hero-slide">
                <button class="x8-hero-link" type="button" @click="goDetail(item.id)">
                  <img class="x8-bg-img-container" :src="heroImage(item)" :alt="item.name" @error="onImgError" />
                  <span class="x8-slide-content"></span>
                  <span class="x8-slide-action">
                    <span class="x8-go-title">
                      <b class="list-title">{{ item.name }}</b>
                      <em v-if="item.remarks" class="list-description">{{ item.remarks }}</em>
                    </span>
                  </span>
                </button>
              </article>
            </div>
            <button class="x8-banner-arrow left" type="button" aria-label="上一张" @click.stop="shiftHero(-1, true)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button class="x8-banner-arrow right" type="button" aria-label="下一张" @click.stop="shiftHero(1, true)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
          <div class="x8-banner-dots" role="tablist" aria-label="首页轮播">
            <button
              v-for="(item, index) in heroItems"
              :key="`dot-${item.id}`"
              type="button"
              role="tab"
              :aria-selected="heroIdx === index"
              :aria-label="`切换到 ${item.name}`"
              :class="{ active: heroIdx === index }"
              @click="setHero(index)"
            >
              <span></span>
            </button>
          </div>
        </section>

        <x8-panel title="正在热播" :changeable="true" @change="shuffleHot" @more="goRank">
          <div class="x8-card-grid hot">
            <x8-card v-for="item in hotShowcase" :key="`hot-${item.id}`" :item="item" @open="goDetail" @follow="goLogin" />
            <template v-if="loading && !hotShowcase.length">
              <x8-card-skeleton v-for="index in hotSkeletonCount" :key="`hot-sk-${index}`" />
            </template>
          </div>
        </x8-panel>

        <section class="x8-panel x8-trailer" id="trailer-panel">
          <div class="x8-panel-head">
            <button class="x8-panel-title" type="button">
              <span>新片预告</span>
            </button>
          </div>
          <div class="x8-trailer-content" :data-loaded="trailerItems.length ? 'true' : 'false'">
            <div class="x8-trailer-bg" :style="{ backgroundImage: `url(${heroImage(activeTrailer)})` }"></div>
            <div class="x8-trailer-name">
              <span>{{ activeTrailer?.name || '新片预告' }}</span>
              <small v-if="activeTrailer?.year">（{{ activeTrailer.year }}上映）</small>
              <button type="button">预约</button>
            </div>
            <div class="x8-trailer-flex">
              <button class="x8-trailer-player" type="button" @click="activeTrailer && goDetail(activeTrailer.id)">
                <span class="x8-play-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 5.8v12.4a1.15 1.15 0 0 0 1.78.96l8.8-6.2a1.16 1.16 0 0 0 0-1.92l-8.8-6.2a1.15 1.15 0 0 0-1.78.96Z" /></svg>
                </span>
              </button>
              <aside class="x8-trailer-right">
                <div class="x8-watermark">
                  <b>{{ site.siteName || '金牌影院' }}</b>
                  <span>dododmb.com</span>
                </div>
                <div class="x8-trailer-thumbs">
                  <button v-for="(item, index) in trailerItems" :key="`trailer-${item.id}`" type="button" :class="{ active: trailerIdx === index }" @click="trailerIdx = index">
                    <img :src="poster(item)" :alt="item.name" @error="onImgError" />
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <template v-for="section in homeSections" :key="section.key">
          <section v-if="loading || section.items.length" class="x8-panel x8-section-row">
            <div class="x8-section-main">
              <div class="x8-panel-head">
                <button class="x8-panel-title" type="button" @click="goShow(section.type)">
                  <span>{{ section.title }}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6" /></svg>
                </button>
                <button class="x8-change" type="button" @click="refreshSection(section)">换一换</button>
              </div>
              <div class="x8-card-grid section">
                <x8-card v-for="item in section.items" :key="`${section.key}-${item.id}`" :item="item" short @open="goDetail" @follow="goLogin" />
                <template v-if="loading && !section.items.length">
                  <x8-card-skeleton v-for="index in 12" :key="`${section.key}-sk-${index}`" short />
                </template>
              </div>
            </div>
            <x8-rank-card :title="section.rankTitle" :items="section.rank" :loading="loading" @open="goDetail" @more="goRank" />
          </section>
        </template>
      </template>

      <section v-else-if="pageMode === 'show'" class="x8-page-panel">
        <div class="x8-page-title">
          <h1>{{ browseTitle }}</h1>
          <p>{{ browseSub }}</p>
        </div>
        <div class="x8-filter">
          <div v-if="loading && curType && !subtypes.length" class="x8-filter-line skeleton">
            <span></span>
            <div class="x8-filter-tags">
              <i v-for="index in 8" :key="`subtype-sk-${index}`"></i>
            </div>
          </div>
          <div v-else-if="subtypes.length" class="x8-filter-line">
            <span>类型</span>
            <div class="x8-filter-tags">
              <button type="button" :class="{ active: !curSub }" @click="setBrowse({ sub: undefined, page: 1 })">全部</button>
              <button v-for="item in subtypes" :key="item.name" type="button" :class="{ active: curSub === item.name }" @click="setBrowse({ sub: item.name, page: 1 })">
                {{ item.name }}
              </button>
            </div>
          </div>
          <div v-if="loading && !years.length" class="x8-filter-line skeleton">
            <span></span>
            <div class="x8-filter-tags">
              <i v-for="index in 7" :key="`year-sk-${index}`"></i>
            </div>
          </div>
          <div v-else-if="years.length" class="x8-filter-line">
            <span>年份</span>
            <div class="x8-filter-tags">
              <button type="button" :class="{ active: !curYear }" @click="setBrowse({ year: undefined, page: 1 })">全部</button>
              <button v-for="item in years" :key="item.year" type="button" :class="{ active: curYear === item.year }" @click="setBrowse({ year: item.year, page: 1 })">
                {{ item.year }}
              </button>
            </div>
          </div>
          <div class="x8-filter-line">
            <span>排序</span>
            <div class="x8-filter-tags">
              <button v-for="item in sortItems" :key="item.value" type="button" :class="{ active: sort === item.value }" @click="setBrowse({ sort: item.value, page: 1 })">
                {{ item.label }}
              </button>
            </div>
          </div>
        </div>
        <div class="x8-card-grid browse">
          <template v-if="loading">
            <x8-card-skeleton v-for="index in browseSkeletonCount" :key="`browse-sk-${index}`" />
          </template>
          <template v-else>
            <x8-card v-for="item in list" :key="`browse-${item.id}`" :item="item" @open="goDetail" @follow="goLogin" />
          </template>
        </div>
        <div v-if="!loading && !list.length" class="x8-empty">暂无影片</div>
        <div class="x8-pager" v-if="page > 1 || hasMore">
          <button type="button" :disabled="page <= 1" @click="setBrowse({ page: page - 1 })">上一页</button>
          <span>{{ page }}</span>
          <button type="button" :disabled="!hasMore" @click="setBrowse({ page: page + 1 })">下一页</button>
        </div>
      </section>

      <section v-else-if="pageMode === 'rank'" class="x8-page-panel x8-rank-page">
        <div class="x8-rank-grid">
          <template v-if="loading && !rankGroups.length">
            <x8-rank-card v-for="group in rankSkeletonGroups" :key="`rank-sk-${group.key}`" :title="group.title" :items="[]" loading static @open="goDetail" />
          </template>
          <template v-else>
            <x8-rank-card v-for="group in rankGroups" :key="group.key" :title="group.title" :items="group.items" :loading="loading" static @open="goDetail" />
          </template>
        </div>
      </section>

      <section v-else-if="pageMode === 'detail'" class="x8-page-panel x8-detail">
        <div class="x8-detail-info">
          <button class="x8-detail-poster" type="button" @click="goPlay(vod.id)">
            <span class="x8-detail-poster-bg"></span>
            <img v-if="poster(vod)" :src="poster(vod)" :alt="vod.name" @error="onImgError" />
            <span class="x8-detail-play-mask"><span class="x8-play-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 5.8v12.4a1.15 1.15 0 0 0 1.78.96l8.8-6.2a1.16 1.16 0 0 0 0-1.92l-8.8-6.2a1.15 1.15 0 0 0-1.78.96Z" /></svg></span></span>
          </button>
          <div class="x8-detail-main">
            <div class="x8-detail-meta">
              <h1>{{ vod.name || '影片详情' }}</h1>
              <div class="x8-detail-tags">
                <button v-for="tag in detailTags" :key="tag" type="button" @click="setBrowse({ type: vod.typeName, sub: tag, page: 1 })">{{ tag }}</button>
              </div>
              <div v-if="vod.director" class="x8-detail-row"><span>导演:</span><p>{{ vod.director }}</p></div>
              <div v-if="actors.length" class="x8-detail-row x8-detail-people-row">
                <span>主演:</span>
                <div class="x8-detail-people">
                  <button v-for="p in actors" :key="`x8-actor-${p.id}`" type="button" @click="searchPerson(p.person.name)">
                    <img v-if="p.person.avatar" :src="imgUrl(p.person.avatar)" alt="" @error="onImgError" />
                    <i v-else>{{ p.person.name.slice(0, 1) }}</i>
                    <em>{{ p.person.name }}</em>
                  </button>
                </div>
              </div>
              <div v-else-if="vod.actor" class="x8-detail-row"><span>主演:</span><p>{{ vod.actor }}</p></div>
              <div v-if="detailAliases.length" class="x8-detail-row"><span>别名:</span><p>{{ detailAliases.join(' / ') }}</p></div>
              <div v-if="vod.area || vod.language" class="x8-detail-row"><span>语言:</span><p>{{ [vod.language, vod.area].filter(Boolean).join(' / ') }}</p></div>
            </div>
            <div class="x8-detail-actions">
              <div class="x8-detail-action-top">
                <button class="x8-detail-play-btn" type="button" @click="goPlay(vod.id)">
                  <span class="x8-play-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 5.8v12.4a1.15 1.15 0 0 0 1.78.96l8.8-6.2a1.16 1.16 0 0 0 0-1.92l-8.8-6.2a1.15 1.15 0 0 0-1.78.96Z" /></svg></span>
                  立即播放
                </button>
                <button class="x8-follow-action" type="button" :class="{ on: followed }" @click="toggleFollow">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5s-7.5-4.4-9.4-9A5.1 5.1 0 0 1 11.7 7l.3.4.3-.4a5.1 5.1 0 0 1 9.1 4.5c-1.9 4.6-9.4 9-9.4 9Z" /></svg>
                  {{ followed ? '已追剧' : '追剧' }}
                </button>
              </div>
              <div class="x8-detail-stats">
                <div class="x8-stat-item">
                  <p class="x8-stat-top">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.82 5.72 6.32.92-4.57 4.46 1.08 6.3L12 17.02 6.35 20l1.08-6.3-4.57-4.46 6.32-.92L12 2.6Z" /></svg>
                    <strong>{{ vod.rating || '暂无' }}</strong>
                  </p>
                  <span>评分</span>
                </div>
                <i></i>
                <div class="x8-stat-item">
                  <p class="x8-stat-top">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.4 2.2c.36 2.25 1.2 3.96 2.5 5.12.8.7 1.74 1.4 2.78 2.06 1.97 1.26 3.12 3.24 3.12 5.64 0 4.08-3.35 7.38-8.05 7.38-4.8 0-8.05-3.08-8.05-7.3 0-2.7 1.3-4.84 3.92-6.42.6 1.42 1.42 2.38 2.44 2.88-.28-2.78.16-5.9 1.34-9.36Z" /></svg>
                    <strong>热度</strong>
                  </p>
                  <span>{{ heatValue(vod) ? `${heatValue(vod)}人` : '暂无' }}</span>
                </div>
                <i></i>
                <div class="x8-stat-item">
                  <p class="x8-stat-top"><strong>{{ vod.year || '未知' }}</strong></p>
                  <span>上映时间</span>
                </div>
                <i></i>
                <div class="x8-stat-item">
                  <p class="x8-stat-top"><strong>{{ detailDuration }}</strong></p>
                  <span>片长</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="x8-detail-intro">
          <p>简介：{{ vod.blurb || vod.officialIntro || vod.content || '暂无简介' }}</p>
        </div>
        <section v-if="vod.lines?.length" class="x8-detail-play-list">
          <div class="x8-detail-list-head">
            <span>{{ currentLine?.sourceName || currentLine?.flag || '默认' }} 播放器</span>
            <button type="button" @click="detailEpDesc = !detailEpDesc">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 5v14" /><path d="m5 16 3 3 3-3" /><path d="M16 19V5" /><path d="m13 8 3-3 3 3" /></svg>
              {{ detailEpDesc ? '升序' : '倒序' }}
            </button>
          </div>
          <div v-if="(vod.lines || []).length > 1" class="x8-detail-line-tabs">
            <button v-for="line in vod.lines || []" :key="`detail-line-${line.id}`" type="button" :class="{ active: currentLineId === line.id }" @click="selectDetailLine(line.id)">
              {{ line.sourceName || line.flag || '线路' }}
            </button>
          </div>
          <div class="x8-detail-episodes">
            <button
              v-for="ep in detailEpisodes"
              :key="`detail-ep-${ep.index}`"
              type="button"
              :class="{ watched: isHistoryEpisode(ep.index, currentLineId) }"
              :style="episodeProgressStyle(ep.index, currentLineId)"
              @click="goPlay(vod.id, ep.index)"
            >
              <span>{{ ep.index + 1 }}</span>
              <em v-if="isHistoryEpisode(ep.index, currentLineId)">{{ historyEpisodeText }}</em>
            </button>
          </div>
        </section>
        <x8-panel v-if="related.length" title="猜你喜欢" :changeable="true" :moreable="false" @change="refreshRelated">
          <div class="x8-card-grid section">
            <x8-card v-for="item in related.slice(0, 12)" :key="`detail-rel-${item.id}`" :item="item" short @open="goDetail" @follow="goLogin" />
          </div>
        </x8-panel>
      </section>

      <section v-else-if="pageMode === 'play'" class="x8-play" :class="{ 'theater-mode': playerTheater }">
        <div class="x8-play-shell">
          <section class="x8-play-list-container">
            <div class="x8-player-video">
              <div class="x8-player-video-left">
                <div
                  class="x8-player-area active"
                  :class="{ 'controls-visible': controlsVisible || settingsOpen || qualityOpen }"
                  @mousemove="showPlayerControls"
                  @mouseleave="hidePlayerControlsSoon"
                >
                  <div ref="videoBox" class="x8-video-container">
                    <div v-if="playerTheater" class="x8-theater-title">
                      <b>{{ currentPlayTitle }}</b>
                    </div>
                    <video
                      v-if="playKind !== 'iframe'"
                      ref="videoEl"
                      playsinline
                      webkit-playsinline
                      x-webkit-airplay="allow"
                      airplay="allow"
                      :poster="heroImage(vod)"
                      @click="onVideoClick"
                      @timeupdate="syncVideoState"
                      @loadedmetadata="syncVideoState"
                      @play="playing = true"
                      @pause="onVideoPause"
                      @volumechange="syncVideoState"
                      @ended="onVideoEnded"
                      @webkitbeginfullscreen="nativeFullscreen = true"
                      @webkitendfullscreen="nativeFullscreen = false"
                    ></video>
                    <iframe v-else-if="playUrl" :src="playUrl" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>
                    <button v-if="playKind !== 'iframe'" class="x8-airplay-btn" type="button" title="投屏" @click.stop="openAirplay">
                      <svg class="x8-lucide" viewBox="0 0 24 24"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><path d="m12 15 5 6H7Z" /></svg>
                    </button>
                    <button v-if="!playUrl" class="x8-player-empty" type="button" @click="playCurrent">
                      <span class="x8-play-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 5.8v12.4a1.15 1.15 0 0 0 1.78.96l8.8-6.2a1.16 1.16 0 0 0 0-1.92l-8.8-6.2a1.15 1.15 0 0 0-1.78.96Z" /></svg></span>
                      <em>{{ resolving ? '解析中...' : '立即播放' }}</em>
                    </button>
                    <div class="x8-video-toolbar" @click.stop @mousemove.stop="showPlayerControls">
                      <input class="x8-progress" type="range" min="0" :max="duration || 0" step="0.1" :value="currentTime" :style="{ '--x8-progress': progressPercent + '%' }" @input="seekVideo" />
                      <div class="x8-control-row">
                        <div class="x8-control-left">
                          <button type="button" :title="playing ? '暂停' : '播放'" @click="togglePlay">
                            <svg v-if="playing" class="x8-lucide" viewBox="0 0 24 24"><rect x="14" y="4" width="4" height="16" rx="1" /><rect x="6" y="4" width="4" height="16" rx="1" /></svg>
                            <svg v-else class="x8-lucide" viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                          </button>
                          <button type="button" title="下一集" @click="playNextEpisode">
                            <svg class="x8-lucide" viewBox="0 0 24 24"><polygon points="6 4 16 12 6 20 6 4" /><line x1="18" x2="18" y1="5" y2="19" /></svg>
                          </button>
                          <button type="button" :title="muted ? '打开声音' : '静音'" @click="toggleMute">
                            <svg v-if="muted" class="x8-lucide" viewBox="0 0 24 24"><path d="M16 9a5 5 0 0 1 .95 2.293" /><path d="M19.364 5.636a9 9 0 0 1 1.889 9.96" /><path d="m2 2 20 20" /><path d="m7 7-.587.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298V11" /><path d="M9.828 4.172A.686.686 0 0 1 11 4.657v.686" /></svg>
                            <svg v-else class="x8-lucide" viewBox="0 0 24 24"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" /></svg>
                          </button>
                          <span class="x8-time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
                        </div>
                        <div class="x8-control-right">
                          <div class="x8-control-pop">
                            <button v-if="qualities.length" class="x8-quality-trigger" type="button" :class="{ active: qualityOpen }" @click.stop="toggleQuality">
                              <span>清晰度</span>
                              <b>{{ currentQualityResLabel }}</b>
                            </button>
                            <div v-if="qualities.length && qualityOpen" class="x8-quality-menu" @click.stop>
                              <button v-for="q in qualities" :key="q.resolution" type="button" :class="{ on: activeQualityResolution === q.resolution }" @click="switchQuality(q.resolution)">
                                <strong>{{ q.resolution }}P</strong>
                                <span>{{ q.name || `${q.resolution}P` }}</span>
                              </button>
                            </div>
                          </div>
                          <div class="x8-control-pop">
                            <button type="button" :class="{ active: settingsOpen }" title="设置" @click.stop="toggleSettings">
                              <svg class="x8-lucide" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" /><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /><path d="M12 2v2" /><path d="M12 22v-2" /><path d="m17 20.66-1-1.73" /><path d="M11 10.27 7 3.34" /><path d="m20.66 17-1.73-1" /><path d="m3.34 7 1.73 1" /><path d="M14 12h8" /><path d="M2 12h2" /><path d="m20.66 7-1.73 1" /><path d="m3.34 17 1.73-1" /><path d="m17 3.34-1 1.73" /><path d="m11 13.73-4 6.93" /></svg>
                            </button>
                            <div v-if="settingsOpen" class="x8-settings-menu" :class="{ 'rate-mode': rateOpen }" @click.stop>
                              <template v-if="!rateOpen">
                                <label class="x8-switch-row">
                                  <span>自动下一集</span>
                                  <input v-model="autoNext" type="checkbox" />
                                  <i></i>
                                </label>
                                <label class="x8-switch-row">
                                  <span>跳过片头片尾</span>
                                  <input v-model="skipIntroOutro" type="checkbox" />
                                  <i></i>
                                </label>
                                <button class="x8-setting-row" type="button" @click="rateOpen = true">
                                  <span>倍数</span>
                                  <b>{{ playbackRateLabel }}</b>
                                  <svg class="x8-lucide" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
                                </button>
                              </template>
                              <div v-else class="x8-rate-panel">
                                <button class="x8-setting-back" type="button" @click="rateOpen = false">
                                  <svg class="x8-lucide" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
                                  <span>播放倍数</span>
                                </button>
                                <button v-for="rate in playbackRates" :key="rate" type="button" :class="{ on: playbackRate === rate }" @click="setPlaybackRate(rate)">
                                  {{ rateLabel(rate) }}
                                </button>
                              </div>
                            </div>
                          </div>
                          <button type="button" title="窗口化" @click="togglePip">
                            <svg class="x8-lucide x8-icon-picture-in-picture" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 10h6V4" /><path d="m2 4 6 6" /><path d="M21 10V7a2 2 0 0 0-2-2h-7" /><path d="M3 14v2a2 2 0 0 0 2 2h3" /><rect x="12" y="14" width="10" height="7" rx="1" /></svg>
                          </button>
                          <button type="button" :title="playerTheater ? '退出 HLS 全屏' : 'HLS 全屏'" :class="{ active: playerTheater }" @click="togglePlayerTheater">
                            <svg v-if="playerTheater" class="x8-lucide x8-icon-minimize" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
                            <svg v-else class="x8-lucide x8-icon-maximize" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
                          </button>
                          <button v-if="!playerTheater" type="button" title="系统全屏" @click="requestNativeFullscreen">
                            <svg class="x8-lucide x8-icon-fullscreen" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><rect width="10" height="8" x="7" y="8" rx="1" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <aside class="x8-player-video-right">
                <div class="x8-side-playlist">
                  <div class="x8-side-playlist-head">
                    <div class="header-title">{{ currentLine?.sourceName || currentLine?.flag || '默认' }} 播放器</div>
                    <div v-if="vod.lines?.length > 1" ref="sideLinesEl" class="x8-side-lines">
                      <button v-for="line in vod.lines" :key="line.id" type="button" :class="{ active: currentLineId === line.id }" @click="selectLine(line.id)">
                        {{ line.sourceName || line.flag || '默认' }}
                      </button>
                    </div>
                    <div class="header-sections">
                      <div ref="playGroupsEl" class="sections-left">
                        <button v-for="(group, index) in playEpisodeGroups" :key="`side-group-${index}`" type="button" :class="{ active: playGroupIdx === index }" @click="selectPlayGroup(index)">{{ group.label }}</button>
                      </div>
                      <button class="sections-sort" type="button" @click="playEpDesc = !playEpDesc">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 5v14" /><path d="m5 16 3 3 3-3" /><path d="M16 19V5" /><path d="m13 8 3-3 3 3" /></svg>
                      </button>
                    </div>
                  </div>
                  <div ref="sideEpisodesEl" class="x8-side-episodes">
                    <button
                      v-for="row in playVisibleEpisodes"
                      :key="`side-ep-${row.index}`"
                      type="button"
                      :class="{ active: currentEpIndex === row.index, watched: isHistoryEpisode(row.index, currentLineId) }"
                      :style="episodeProgressStyle(row.index, currentLineId)"
                      @click="selectEpisode(row.index)"
                    >
                      <span>{{ row.index + 1 }}</span>
                      <em v-if="isHistoryEpisode(row.index, currentLineId)">{{ historyEpisodeText }}</em>
                    </button>
                  </div>
                </div>
              </aside>
            </div>

            <section class="x8-player-detail">
              <div class="x8-player-title">
                <button type="button" @click="goDetail(vod.id)">
                  <h1>{{ vod.name || '正在加载' }}</h1>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.7 3.3 13.3 10l-6.6 6.7" stroke-linecap="round" /></svg>
                </button>
                <h2>{{ playEpisodeTitle }}</h2>
              </div>
              <div class="x8-player-meta">
                <span v-if="vod.rating" class="rating">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.82 5.72 6.32.92-4.57 4.46 1.08 6.3L12 17.02 6.35 20l1.08-6.3-4.57-4.46 6.32-.92L12 2.6Z" /></svg>
                  {{ vod.rating }}
                </span>
                <span v-if="vod.year" class="line">|</span>
                <span v-if="vod.year">{{ vod.year }}</span>
                <span class="line">|</span>
                <span>{{ detailDuration }}</span>
                <div v-if="detailTags.length" class="x8-player-tags">
                  <span v-for="tag in detailTags.slice(0, 3)" :key="`play-tag-${tag}`">{{ tag }}</span>
                </div>
              </div>
              <p v-if="playIntro" class="x8-player-desc">简介：{{ playIntro }}</p>
            </section>

            <section v-if="vod.lines?.length" class="x8-mini-play-list">
              <div class="x8-play-list-head">
                <div class="player-name">{{ currentLine?.sourceName || currentLine?.flag || '默认' }} 播放器</div>
                <button class="player-sort" type="button" @click="playEpDesc = !playEpDesc">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 5v14" /><path d="m5 16 3 3 3-3" /><path d="M16 19V5" /><path d="m13 8 3-3 3 3" /></svg>
                  <span>排序</span>
                </button>
              </div>
              <div v-if="vod.lines?.length > 1" ref="miniLinesEl" class="x8-line-tabs">
                <button v-for="line in vod.lines" :key="`mini-line-${line.id}`" type="button" :class="{ active: currentLineId === line.id }" @click="selectLine(line.id)">
                  {{ line.sourceName || line.flag || '默认' }}
                </button>
              </div>
              <div ref="miniEpisodesEl" class="x8-episode-grid">
                <button
                  v-for="row in playAllEpisodes"
                  :key="`mini-ep-${row.index}`"
                  type="button"
                  :class="{ active: currentEpIndex === row.index, watched: isHistoryEpisode(row.index, currentLineId) }"
                  :style="episodeProgressStyle(row.index, currentLineId)"
                  @click="selectEpisode(row.index)"
                >
                  <span>{{ row.ep.name || row.index + 1 }}</span>
                  <em v-if="isHistoryEpisode(row.index, currentLineId)">{{ historyEpisodeText }}</em>
                </button>
              </div>
            </section>

            <x8-panel v-if="related.length" title="猜你喜欢" :changeable="true" :moreable="false" @change="refreshRelated">
              <div class="x8-card-grid section">
                <x8-card v-for="item in related.slice(0, playLikeCount)" :key="`play-rel-${item.id}`" :item="item" short @open="goDetail" @follow="goLogin" />
              </div>
            </x8-panel>
          </section>
        </div>
      </section>

      <section v-else class="x8-page-panel x8-login-page">
        <div class="x8-login-card">
          <h1>登录</h1>
          <p>参考站求片、播放列表入口会先进入登录页。</p>
          <button type="button" @click="goUser('history')">进入个人中心</button>
        </div>
      </section>
    </main>

    <footer class="x8-footer">
      <div class="x8-footer-inner">
        <div class="x8-quick-navigation">
          <section class="x8-footer-nav">
            <h3>影视分类</h3>
            <div class="x8-footer-card category">
              <div class="top">
                <button type="button" @click="goShow('电影')"><span class="x8-footer-icon icon-kuaijielianjie11"></span><em>电影</em></button>
                <button type="button" @click="goShow('电视剧')"><span class="x8-footer-icon icon-kuaijielianjie10"></span><em>电视剧</em></button>
              </div>
              <div class="bottom">
                <button type="button" @click="goShow('综艺')"><span class="x8-footer-icon icon-kuaijielianjie9"></span><em>综艺</em></button>
                <button type="button" @click="goShow('动漫')"><span class="x8-footer-icon icon-kuaijielianjie8"></span><em>动漫</em></button>
                <button type="button" @click="goShow('短剧')"><span class="x8-footer-icon icon-kuaijielianjie7"></span><em>短剧</em></button>
              </div>
            </div>
          </section>
          <section class="x8-footer-nav">
            <h3>内容推荐</h3>
            <div class="x8-footer-card">
              <button type="button" @click="goShow('电影')"><span class="x8-footer-icon icon-kuaijielianjie6"></span><em>最新上映</em></button>
              <button type="button" @click="goRank"><span class="x8-footer-icon icon-kuaijielianjie5"></span><em>热门推荐</em></button>
              <button type="button" @click="goRank"><span class="x8-footer-icon icon-kuaijielianjie4"></span><em>评分最高</em></button>
              <button type="button" @click="scrollToTrailer"><span class="x8-footer-icon icon-kuaijielianjie3"></span><em>即将上线</em></button>
            </div>
          </section>
          <section class="x8-footer-nav">
            <h3>用户中心</h3>
            <div class="x8-footer-card">
              <button type="button" @click="goUser('follows')"><span class="x8-footer-icon icon-kuaijielianjie12"></span><em>我的收藏</em></button>
              <button type="button" @click="goUser('history')"><span class="x8-footer-icon icon-kuaijielianjie2"></span><em>观看历史</em></button>
              <button type="button" @click="goUser('history')"><span class="x8-footer-icon icon-kuaijielianjie1"></span><em>个人中心</em></button>
              <button type="button" @click="goLogin"><span class="x8-footer-icon icon-kuaijielianjie"></span><em>系统设置</em></button>
            </div>
          </section>
        </div>
        <div class="x8-help-navigation">
          <nav>
            <button type="button">帮助中心</button>
            <span>|</span>
            <button type="button">常见问题</button>
            <span>|</span>
            <button type="button">意见反馈</button>
            <span>|</span>
            <button type="button">隐私政策</button>
          </nav>
          <div class="year">2026 ADY-All Rights Reserved</div>
        </div>
      </div>
    </footer>

    <div class="x8-float">
      <button type="button" aria-label="切换主题">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
      </button>
      <button type="button" aria-label="回到顶部" @click="scrollTop">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6" /></svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Hls from 'hls.js'
import { api, imgUrl } from '../api'
import { readCachedSite } from '../siteConfig'

defineOptions({ name: 'X8Home' })

const route = useRoute()
const router = useRouter()
const site = ref(readCachedSite())
const types = ref([])
const heroItems = ref([])
const hotItems = ref([])
const trailerItems = ref([])
const homeSections = ref([])
const list = ref([])
const subtypes = ref([])
const years = ref([])
const vod = ref({})
const related = ref([])
const rankGroups = ref([])
const page = ref(1)
const hasMore = ref(false)
const loading = ref(false)
const scrolled = ref(false)
const headerBgOpacity = ref(0)
const kw = ref('')
const searchFocused = ref(false)
const searchHints = ref([])
const searchHintIdx = ref(0)
const heroIdx = ref(0)
const trailerIdx = ref(0)
const hotOffset = ref(0)
const currentLineId = ref(0)
const currentEpIndex = ref(0)
const playUrl = ref('')
const playKind = ref('')
const resolving = ref(false)
const vodHistory = ref(null)
const videoEl = ref(null)
const videoBox = ref(null)
const sideLinesEl = ref(null)
const playGroupsEl = ref(null)
const sideEpisodesEl = ref(null)
const miniLinesEl = ref(null)
const miniEpisodesEl = ref(null)
const user = ref(null)
const followed = ref(false)
const qualities = ref([])
const preferredRes = ref(0)
const qualityOpen = ref(false)
const settingsOpen = ref(false)
const rateOpen = ref(false)
const defaultQualityUrl = ref('')
const detailEpDesc = ref(false)
const playEpDesc = ref(false)
const selectedPlayGroupIdx = ref(0)
const playing = ref(false)
const muted = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const controlsVisible = ref(false)
const playerTheater = ref(false)
const videoFullscreen = ref(false)
const nativeFullscreen = ref(false)
const autoNext = ref(true)
const skipIntroOutro = ref(false)
const playbackRate = ref(1)
const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2]
let heroTouchX = 0
let heroTimer = 0
let searchHintTimer = 0
let controlsTimer = 0
let browseRequestId = 0
let historySaveAt = 0
let hls = null

const sortItems = [
  { value: 'hot', label: '热门' },
  { value: 'recent', label: '最新' },
  { value: 'rating', label: '评分' },
  { value: 'year', label: '年份' },
]
const rankSkeletonGroups = [
  { key: 'all', title: '综合榜' },
  { key: 'movie', title: '电影榜' },
  { key: 'anime', title: '动漫榜' },
  { key: 'series', title: '电视剧榜' },
  { key: 'short', title: '短剧榜' },
  { key: 'comic', title: '漫剧榜' },
]
const typeRouteMap = {
  '1': '电影',
  '2': '电视剧',
  '3': '综艺',
  '4': '动漫',
  '88': '短剧',
}

const pageMode = computed(() => {
  if (route.path.includes('/play/')) return 'play'
  if (route.path.includes('/detail/')) return 'detail'
  if (route.path.includes('/rank')) return 'rank'
  if (route.path.includes('/login')) return 'login'
  if (route.query.kw || route.query.type || route.path.includes('/show/')) return 'show'
  return 'home'
})
const routeType = computed(() => {
  const id = String(route.params.type || '')
  return typeRouteMap[id] || id
})
const curType = computed(() => String(route.query.type || routeType.value || ''))
const curSub = computed(() => String(route.query.sub || ''))
const curYear = computed(() => String(route.query.year || ''))
const sort = computed(() => String(route.query.sort || 'hot'))
const activeHero = computed(() => heroItems.value[heroIdx.value] || heroItems.value[0] || {})
const activeTrailer = computed(() => trailerItems.value[trailerIdx.value] || trailerItems.value[0] || {})
const showHomeLogo = computed(() => site.value?.homeConfig?.showHomeLogo !== false)
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const hotCols = computed(() => {
  if (viewportWidth.value >= 1750) return 7
  if (viewportWidth.value >= 1025) return 6
  if (viewportWidth.value >= 721) return 4
  return 2
})
const hotSkeletonCount = computed(() => hotCols.value * 2)
const browseSkeletonCount = computed(() => {
  if (viewportWidth.value >= 1750) return 14
  if (viewportWidth.value >= 1025) return 12
  if (viewportWidth.value >= 721) return 8
  return 6
})
const hotShowcase = computed(() => rotate(hotItems.value, hotOffset.value).slice(0, hotCols.value * 2))
const navItems = computed(() => {
  return types.value.filter(item => item?.name)
})
const browseTitle = computed(() => route.query.kw ? `搜索：${route.query.kw}` : (curSub.value || curType.value || '影片'))
const browseSub = computed(() => {
  if (loading.value && pageMode.value === 'show') return '正在加载影片'
  return list.value.length ? `共展示 ${list.value.length} 部影片` : '按类型、年份和排序浏览'
})
const currentSearchHint = computed(() => searchHints.value[searchHintIdx.value % Math.max(1, searchHints.value.length)] || '')
const searchPlaceholder = computed(() => {
  return currentSearchHint.value || '搜索'
})
const currentLine = computed(() => (vod.value.lines || []).find(line => line.id === currentLineId.value) || (vod.value.lines || [])[0])
const episodes = computed(() => currentLine.value?.episodes || [])
const detailEpisodes = computed(() => {
  const rows = episodes.value.map((ep, index) => ({ ep, index }))
  return detailEpDesc.value ? rows.reverse() : rows
})
const playEpisodeGroups = computed(() => {
  const total = episodes.value.length
  const groups = []
  for (let start = 0; start < total; start += 50) {
    const end = Math.min(start + 49, total - 1)
    groups.push({ start, end, label: `${start + 1}-${end + 1}` })
  }
  return groups
})
const playGroupIdx = computed(() => {
  const groups = playEpisodeGroups.value
  if (!groups.length) return 0
  return Math.min(selectedPlayGroupIdx.value, groups.length - 1)
})
const playAllEpisodes = computed(() => {
  const rows = episodes.value.map((ep, index) => ({ ep, index }))
  return playEpDesc.value ? rows.reverse() : rows
})
const playVisibleEpisodes = computed(() => {
  const group = playEpisodeGroups.value[playGroupIdx.value]
  if (!group) return playAllEpisodes.value
  const rows = episodes.value.slice(group.start, group.end + 1).map((ep, offset) => ({ ep, index: group.start + offset }))
  return playEpDesc.value ? rows.reverse() : rows
})
const currentEpisodeLabel = computed(() => {
  const ep = episodes.value[currentEpIndex.value]
  return ep?.name || (episodes.value.length ? `第${currentEpIndex.value + 1}集` : '')
})
const playEpisodeTitle = computed(() => {
  const text = currentEpisodeLabel.value || ''
  const n = text.match(/\d+/)?.[0]
  return n ? `第 ${n} 集` : text
})
const currentPlayTitle = computed(() => {
  const title = String(vod.value?.name || '正在播放').trim()
  const episode = currentEpisodeLabel.value
  return episode ? `${title} · ${episode}` : title
})
const playLikeCount = computed(() => viewportWidth.value >= 1024 ? 12 : 8)
const detailTags = computed(() => {
  const rows = [vod.value?.subType, vod.value?.typeName]
    .flatMap(value => String(value || '').split(/[，,、/|]+/))
    .map(value => value.trim())
    .filter(Boolean)
  return [...new Set(rows)].slice(0, 6)
})
const detailAliases = computed(() => {
  const rows = Array.isArray(vod.value?.aliases) ? vod.value.aliases : []
  return rows
    .map(alias => String(alias?.note || alias?.name || alias?.title || '').trim())
    .filter(Boolean)
    .slice(0, 5)
})
const actors = computed(() => (vod.value?.people || []).filter(p => p.role === 'actor' && p.person?.name).slice(0, 6))
const playIntro = computed(() => String(vod.value?.blurb || vod.value?.officialIntro || vod.value?.content || '').replace(/<[^>]+>/g, '').trim())
const detailDuration = computed(() => {
  const text = String(vod.value?.duration || vod.value?.runtime || '').trim()
  if (text) return text
  const count = episodes.value.length || Number(currentLine.value?.epCount || 0)
  return count ? `共${count}集` : '未知'
})
const activeQuality = computed(() => {
  if (!qualities.value.length) return null
  if (preferredRes.value) {
    const hit = qualities.value.find(q => q.resolution === preferredRes.value)
    if (hit) return hit
  }
  return [...qualities.value].sort((a, b) => Number(b.resolution || 0) - Number(a.resolution || 0))[0]
})
const activeQualityResolution = computed(() => activeQuality.value?.resolution || 0)
const currentQualityResLabel = computed(() => {
  const res = activeQualityResolution.value
  return res ? `${res}P` : '自动'
})
const progressPercent = computed(() => {
  if (!duration.value) return 0
  return Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100))
})
const historyPercent = computed(() => {
  const h = vodHistory.value
  const durationSec = Number(h?.durationSec || 0)
  const progressSec = Number(h?.progressSec || 0)
  if (!durationSec || !progressSec) return 0
  return Math.min(99, Math.max(1, Math.round((progressSec / durationSec) * 100)))
})
const historyEpisodeText = computed(() => {
  const percent = historyPercent.value
  return percent ? `${percent}%` : '看过'
})
const playbackRateLabel = computed(() => rateLabel(playbackRate.value))

const X8Panel = defineComponent({
  name: 'X8Panel',
  props: {
    title: { type: String, required: true },
    changeable: { type: Boolean, default: false },
    moreable: { type: Boolean, default: true },
  },
  emits: ['change', 'more'],
  setup(props, { slots, emit }) {
    return () => h('section', { class: 'x8-panel' }, [
      h('div', { class: 'x8-panel-head' }, [
        h('button', { class: 'x8-panel-title', type: 'button', onClick: () => props.moreable && emit('more') }, [
          h('span', props.title),
          props.moreable ? h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
            h('path', { d: 'm9 18 6-6-6-6' }),
          ]) : null,
        ]),
        h('div', { class: 'x8-panel-actions' }, [
          props.changeable ? h('button', { class: 'x8-change', type: 'button', onClick: () => emit('change') }, '换一换') : null,
          props.moreable ? h('button', { class: 'x8-more', type: 'button', onClick: () => emit('more') }, '更多') : null,
        ]),
      ]),
      slots.default?.(),
    ])
  },
})

const X8Card = defineComponent({
  name: 'X8Card',
  props: {
    item: { type: Object, required: true },
    short: { type: Boolean, default: false },
  },
  emits: ['open', 'follow'],
  setup(props, { emit }) {
    const pic = () => poster(props.item)
    const meta = () => [props.item.typeName, props.item.subType, props.item.year].filter(Boolean).join(' · ')
    const heat = () => heatValue(props.item) || '0'
    return () => h('article', { class: ['x8-card', props.short ? 'short' : ''], onClick: () => emit('open', props.item.id) }, [
      h('div', { class: 'x8-card-poster' }, [
        pic() ? h('img', { src: pic(), alt: props.item.name || '', loading: 'lazy', onError: onImgError }) : null,
        h('div', { class: 'x8-card-tags' }, [h('span', '蓝光')]),
        h('div', { class: 'x8-card-bottom' }, [
          h('span', props.item.remarks || meta() || ''),
          props.item.rating ? h('b', props.item.rating) : null,
        ]),
        h('div', { class: 'x8-card-hover' }, [
          h('div', { class: 'x8-hover-title' }, [
            h('strong', props.item.name || ''),
            props.item.rating ? h('b', props.item.rating) : null,
          ]),
          meta() ? h('p', meta()) : null,
          props.item.actor ? h('p', `主演：${props.item.actor}`) : null,
          h('p', { class: 'intro' }, props.item.blurb || props.item.officialIntro || props.item.content || ''),
          h('div', { class: 'x8-hover-footer' }, [
            h('span', { class: 'x8-heat' }, [
              h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
                h('path', { d: 'M12.4 2.2c.36 2.25 1.2 3.96 2.5 5.12.8.7 1.74 1.4 2.78 2.06 1.97 1.26 3.12 3.24 3.12 5.64 0 4.08-3.35 7.38-8.05 7.38-4.8 0-8.05-3.08-8.05-7.3 0-2.7 1.3-4.84 3.92-6.42.6 1.42 1.42 2.38 2.44 2.88-.28-2.78.16-5.9 1.34-9.36Z' }),
              ]),
              h('em', `热度值 ${heat()}`),
            ]),
            h('button', {
              class: 'x8-follow-btn',
              type: 'button',
              onClick: event => {
                event.stopPropagation()
                emit('follow', props.item.id)
              },
            }, '追剧'),
          ]),
        ]),
      ]),
      h('div', { class: 'x8-card-info' }, [
        h('span', props.item.name || ''),
        props.item.rating ? h('b', props.item.rating) : null,
      ]),
    ])
  },
})

const X8CardSkeleton = defineComponent({
  name: 'X8CardSkeleton',
  props: {
    short: { type: Boolean, default: false },
  },
  setup(props) {
    return () => h('article', { class: ['x8-card', 'x8-card-skeleton', props.short ? 'short' : ''] }, [
      h('div', { class: 'x8-card-poster' }, [
        h('span', { class: 'x8-skeleton-shine' }),
      ]),
      h('div', { class: 'x8-card-info' }, [
        h('span', { class: 'x8-skeleton-line wide' }),
        h('b', { class: 'x8-skeleton-line score' }),
      ]),
    ])
  },
})

const X8RankCard = defineComponent({
  name: 'X8RankCard',
  props: {
    title: { type: String, required: true },
    items: { type: Array, default: () => [] },
    static: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
  },
  emits: ['open', 'more'],
  setup(props, { emit }) {
    const activeIndex = ref(null)
    const rankRows = () => props.items.slice(0, 10)
    const isLargeActive = (index) => index <= 2 || activeIndex.value === index
    const isLocked = (index, rows) => {
      const active = activeIndex.value
      if (active === null || rows.length < 10 || index <= 2) return false
      if (active === rows.length - 1 && index !== rows.length - 1) return true
      if (active === rows.length - 2 && index > 2 && index !== active) return true
      return false
    }
    const renderRankContent = (item, index, full = false) => {
      const tags = rankTags(item)
      const hot = heatValue(item) || item.rating || '热播'
      return h('span', { class: ['x8-rank-large-content', full ? 'full' : 'normal', `index-${index}`] }, [
        h('span', { class: 'x8-rank-large-no' }, index + 1),
        h('span', { class: 'x8-rank-large-center' }, [
          h('span', { class: 'x8-rank-large-center-content' }, [
            h('span', { class: 'x8-rank-large-poster' }, [
              poster(item) ? h('img', { src: poster(item), alt: item.name || '', loading: 'lazy', onError: onImgError }) : null,
              h('i', index + 1),
            ]),
            h('span', { class: 'x8-rank-large-main' }, [
              h('b', item.name || ''),
              h('span', { class: 'x8-rank-large-tags' }, tags.map(tag => h('em', tag))),
              h('span', { class: 'x8-rank-large-score' }, hot),
            ]),
          ]),
          index > 2 ? h('strong', { class: 'x8-rank-large-heat' }, hot) : null,
        ]),
      ])
    }
    const renderStaticRows = () => props.items.length ? props.items.slice(0, 10).map((item, index) => {
        const rows = rankRows()
        const locked = isLocked(index, rows)
        return h('button', {
          class: ['x8-rank-large-item', isLargeActive(index) ? 'active' : '', locked ? 'locked' : '', `index-${index}`],
          type: 'button',
          tabindex: locked ? -1 : 0,
          'aria-hidden': locked ? 'true' : null,
          onClick: () => emit('open', item.id),
          onMouseover: () => { activeIndex.value = index },
          onFocus: () => { activeIndex.value = index },
          onMouseleave: () => { activeIndex.value = null },
          onBlur: () => { activeIndex.value = null },
        }, [
          renderRankContent(item, index, false),
          renderRankContent(item, index, true),
        ])
      }) : (props.loading ? Array.from({ length: 10 }, (_, index) => h('div', { class: ['x8-rank-large-item', 'skeleton', index < 3 ? 'active' : '', `index-${index}`] }, [
        h('span', { class: 'x8-rank-large-no' }, index + 1),
        index < 3 ? h('span', { class: 'x8-rank-large-poster x8-rank-large-poster-skeleton' }) : null,
        h('span', { class: 'x8-rank-large-main' }, [
          h('b', { class: 'x8-skeleton-line wide' }),
          h('em', { class: 'x8-skeleton-line short' }),
        ]),
        h('strong', { class: 'x8-skeleton-line score' }),
      ])) : [])
    const renderRows = () => props.items.length ? props.items.slice(0, 10).map((item, index) => {
        const active = index === 0
        return h('button', { class: ['x8-rank-item', active ? 'active' : '', `index-${index}`], type: 'button', onClick: () => emit('open', item.id) }, [
          h('span', { class: 'num' }, index + 1),
          active && poster(item) ? h('img', { src: poster(item), alt: item.name || '', loading: 'lazy', onError: onImgError }) : null,
          h('span', { class: 'rank-title' }, [
            h('b', item.name || ''),
            h('em', item.subType || item.typeName || '影片'),
          ]),
          item.rating ? h('strong', item.rating) : null,
        ])
      }) : (props.loading ? Array.from({ length: 10 }, (_, index) => h('div', { class: ['x8-rank-item', 'skeleton', index === 0 ? 'active' : ''] }, [
        h('span', { class: 'num' }, index + 1),
        index === 0 ? h('span', { class: 'x8-rank-skeleton-poster' }) : null,
        h('span', { class: 'rank-title' }, [
          h('b', { class: 'x8-skeleton-line wide' }),
          h('em', { class: 'x8-skeleton-line short' }),
        ]),
        h('strong', { class: 'x8-skeleton-line score' }),
      ])) : [])
    return () => h('aside', { class: ['x8-rank-card', props.static ? 'static' : ''] }, [
      h('div', { class: 'x8-rank-head' }, [
        h('span', { class: 'x8-rank-head-title' }, [
          h('h3', props.title),
        ]),
        props.static ? null : h('button', { type: 'button', onClick: () => emit('more') }, '完整排行榜'),
      ]),
      h('div', { class: props.static ? ['x8-rank-large-list', activeIndex.value !== null ? 'active' : '', activeIndex.value !== null ? `active-index-${activeIndex.value}` : ''] : 'x8-rank-list' }, props.static ? renderStaticRows() : renderRows()),
    ])
  },
})

function rotate(items, offset) {
  if (!items.length) return []
  const start = offset % items.length
  return [...items.slice(start), ...items.slice(0, start)]
}
function uniqueVods(...groups) {
  const seen = new Set()
  const result = []
  for (const group of groups) {
    for (const item of group || []) {
      if (!item?.id || seen.has(item.id)) continue
      seen.add(item.id)
      result.push(item)
    }
  }
  return result
}
function poster(item) {
  return imgUrl(item?.officialPic || item?.pic || item?.localPic || '')
}
function heroImage(item) {
  return imgUrl(item?.heroImage || item?.heroPic || item?.officialPic || item?.pic || item?.localPic || '')
}
function withRandomHeroImage(item) {
  const images = Array.isArray(item?.heroImages) ? item.heroImages.filter(img => img?.url) : []
  const wideImages = images.filter(img => img.wide && img.source !== 'poster' && img.source !== 'posterFallback')
  const fallbackImages = images.filter(img => !wideImages.includes(img))
  const pool = wideImages.length ? wideImages : fallbackImages
  if (!pool.length) return item
  const picked = pool[Math.floor(Math.random() * pool.length)]
  return { ...item, heroImage: picked.url, heroImageWide: wideImages.length > 0 }
}
function heatScore(item) {
  return Number(item?.ratingCount || item?._count?.plays || item?.playCount || item?.viewCount || item?.hits || 0)
}
function heatValue(item) {
  const n = heatScore(item)
  if (!n) return ''
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`
  return String(n)
}
function rankTags(item) {
  return [item?.subType, item?.typeName, item?.year].filter(Boolean).slice(0, 3)
}
function onImgError(event) {
  if (event?.target) event.target.style.visibility = 'hidden'
}
function routeBase() {
  return route.path.startsWith('/x8') ? '/x8' : '/'
}
function goX8Home() {
  router.push(route.path.startsWith('/x8') ? '/x8' : '/')
}
function goShow(type) {
  router.push({ path: routeBase(), query: { type, sort: 'hot' } })
}
function goRank() {
  router.push(route.path.startsWith('/x8') ? '/x8/rank' : { path: '/', query: { view: 'rank' } })
}
function goLogin() {
  router.push(route.path.startsWith('/x8') ? '/x8/login' : '/auth')
}
function goUser(tab) {
  router.push({ path: '/me', query: { tab } })
}
function doSearch() {
  const text = String(kw.value || currentSearchHint.value || '').trim()
  if (!text || text === '搜索') return
  kw.value = text
  router.push({ path: routeBase(), query: { kw: text } })
}
function searchPerson(name) {
  const text = String(name || '').trim()
  if (!text) return
  router.push({ path: routeBase(), query: { kw: text } })
}
function goDetail(id) {
  if (!id) return
  router.push(route.path.startsWith('/x8') ? `/x8/detail/${id}` : `/detail/${id}`)
}
function goPlay(id, epIndex = 0) {
  if (!id) return
  const path = route.path.startsWith('/x8') ? `/x8/play/${id}` : `/play/${id}`
  const line = currentLineId.value || vod.value?.lines?.[0]?.id || 0
  const query = cleanQuery({
    line: line || undefined,
    ep: epIndex ? epIndex + 1 : undefined,
  })
  router.push(Object.keys(query).length ? { path, query } : path)
}
function setBrowse(next) {
  router.push({ path: routeBase(), query: cleanQuery({ ...route.query, ...next }) })
}
function cleanQuery(query) {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}
function setHero(index) {
  if (!heroItems.value.length) return
  heroIdx.value = (index + heroItems.value.length) % heroItems.value.length
  startHeroTimer()
}
function shiftHero(step, manual = false) {
  if (!heroItems.value.length) return
  heroIdx.value = (heroIdx.value + step + heroItems.value.length) % heroItems.value.length
  if (manual) startHeroTimer()
}
function shuffleHot() {
  hotOffset.value += 5
}
function pauseHero() {
  clearInterval(heroTimer)
}
function resumeHero() {
  startHeroTimer()
}
function onHeroTouchStart(event) {
  heroTouchX = event.changedTouches?.[0]?.clientX || 0
}
function onHeroTouchEnd(event) {
  const endX = event.changedTouches?.[0]?.clientX || 0
  const delta = endX - heroTouchX
  heroTouchX = 0
  if (Math.abs(delta) < 42) return
  shiftHero(delta > 0 ? -1 : 1, true)
}
function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function scrollToTrailer() {
  if (pageMode.value !== 'home') {
    router.push({ path: route.path.startsWith('/x8') ? '/x8' : '/', hash: '#trailer-panel' })
    return
  }
  document.getElementById('trailer-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function onScroll() {
  const alpha = Math.min(1, Math.max(0, window.scrollY / 72))
  headerBgOpacity.value = alpha.toFixed(2)
  scrolled.value = alpha >= 0.98
}
function onResize() {
  viewportWidth.value = window.innerWidth
}
function startHeroTimer() {
  clearInterval(heroTimer)
  heroTimer = window.setInterval(() => shiftHero(1), 5200)
}
function startSearchHintTimer() {
  clearInterval(searchHintTimer)
  searchHintTimer = window.setInterval(() => {
    if (!searchFocused.value && !kw.value && searchHints.value.length > 1) {
      searchHintIdx.value = (searchHintIdx.value + 1) % searchHints.value.length
    }
  }, 3200)
}
async function loadSearchHints() {
  const rows = await api.vods({ page: 1, size: 20, sort: 'hot' }).catch(() => ({ list: [] }))
  const names = (rows?.list || [])
    .filter(item => heatScore(item) > 0)
    .sort((a, b) => heatScore(b) - heatScore(a))
    .map(item => String(item?.name || '').trim())
    .filter(Boolean)
  searchHints.value = [...new Set(names)].slice(0, 10)
}
function destroyHls() {
  if (hls) {
    hls.destroy()
    hls = null
  }
}
function syncVideoState() {
  const video = videoEl.value
  if (!video) return
  currentTime.value = Number(video.currentTime) || 0
  duration.value = Number.isFinite(video.duration) ? Number(video.duration) : 0
  muted.value = Boolean(video.muted || video.volume === 0)
  playing.value = !video.paused && !video.ended
  saveHistoryTick()
}
function onVideoPause() {
  playing.value = false
  saveWatchHistory(true)
}
function saveHistoryTick() {
  if (Date.now() - historySaveAt < 15000) return
  saveWatchHistory(false)
}
function saveWatchHistory(force = false) {
  if (!user.value || !vod.value?.id || !currentLine.value?.id || !playUrl.value) return
  const video = videoEl.value
  const progressSec = Math.floor(Number(video?.currentTime) || currentTime.value || 0)
  const durationSec = Math.floor(Number(video?.duration) || duration.value || 0)
  if (!force && progressSec < 10) return
  historySaveAt = Date.now()
  const ep = episodes.value[currentEpIndex.value]
  const payload = {
    vodId: vod.value.id,
    lineId: currentLine.value.id,
    epIndex: currentEpIndex.value,
    epName: ep?.name || '',
    progressSec,
    durationSec,
  }
  vodHistory.value = { ...(vodHistory.value || {}), ...payload }
  api.saveHistory(payload).catch(() => {})
}
function isHistoryEpisode(index, lineId = currentLineId.value) {
  const h = vodHistory.value
  if (!h || Number(h.epIndex) !== Number(index)) return false
  if (h.lineId && lineId && Number(h.lineId) !== Number(lineId)) return false
  return true
}
function episodeProgressStyle(index, lineId = currentLineId.value) {
  if (!isHistoryEpisode(index, lineId)) return undefined
  return { '--x8-episode-progress': `${historyPercent.value || 100}%` }
}
function showPlayerControls() {
  controlsVisible.value = true
  clearTimeout(controlsTimer)
  if (!settingsOpen.value && !qualityOpen.value) {
    controlsTimer = window.setTimeout(() => {
      controlsVisible.value = false
    }, 2600)
  }
}
function toggleQuality() {
  qualityOpen.value = !qualityOpen.value
  if (qualityOpen.value) {
    settingsOpen.value = false
    rateOpen.value = false
  }
  showPlayerControls()
}
function hidePlayerControlsSoon() {
  clearTimeout(controlsTimer)
  if (!settingsOpen.value && !qualityOpen.value) {
    controlsTimer = window.setTimeout(() => {
      controlsVisible.value = false
    }, 900)
  }
}
function attachVideo(url, kind = '') {
  playUrl.value = url
  playKind.value = kind === 'iframe' ? 'iframe' : ''
  destroyHls()
  if (playKind.value === 'iframe') return
  nextTick(() => {
    const video = videoEl.value
    if (!video) return
    video.pause()
    video.removeAttribute('src')
    video.controls = false
    video.playbackRate = playbackRate.value
    video.load()
    if (/\.m3u8(\?|$)/i.test(url) && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30, capLevelToPlayerSize: true })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().then(syncVideoState).catch(syncVideoState))
    } else {
      video.src = url
      video.play().then(syncVideoState).catch(syncVideoState)
    }
  })
}
async function playCurrent() {
  const line = currentLine.value
  const ep = episodes.value[currentEpIndex.value]
  if (!vod.value?.id || !line || !ep) return
  resolving.value = true
  qualityOpen.value = false
  qualities.value = []
  defaultQualityUrl.value = ''
  try {
    const result = await api.resolvePlay({ vodId: vod.value.id, playId: line.id, epIndex: currentEpIndex.value })
    if (result?.ok !== false && result?.url) {
      // 多清晰度（金牌直连源）：记录可选档位，按用户偏好选 URL
      const qs = Array.isArray(result.qualities) ? result.qualities : []
      qualities.value = qs
      defaultQualityUrl.value = result.url
      let playHere = result.url
      if (preferredRes.value && qs.length) {
        const hit = qs.find((q) => q.resolution === preferredRes.value)
        if (hit?.url) playHere = hit.url
      }
      qualityOpen.value = false
      attachVideo(playHere, result.kind || line.playKind || '')
    }
  } finally {
    resolving.value = false
  }
}
// X8 播放器切换清晰度：保留当前播放位重新加载选定档 URL
function switchQuality(res) {
  qualityOpen.value = false
  if (res === preferredRes.value) return
  preferredRes.value = res
  const qs = qualities.value || []
  const hit = res ? qs.find((q) => q.resolution === res) : null
  const url = hit?.url || defaultQualityUrl.value || qs[0]?.url
  if (!url) return
  const video = videoEl.value
  const seekTo = Math.floor(Number(video?.currentTime) || 0)
  attachVideo(url, '')
  if (video && seekTo > 3) {
    const onLoaded = () => { try { video.currentTime = seekTo } catch {} video.removeEventListener('loadedmetadata', onLoaded) }
    video.addEventListener('loadedmetadata', onLoaded)
  }
}
function togglePlay() {
  const video = videoEl.value
  if (!video || playKind.value === 'iframe') return
  showPlayerControls()
  if (video.paused) video.play().then(syncVideoState).catch(syncVideoState)
  else {
    video.pause()
    syncVideoState()
  }
}
function onVideoClick() {
  showPlayerControls()
  togglePlay()
}
function playNextEpisode() {
  if (currentEpIndex.value >= episodes.value.length - 1) return
  selectEpisode(currentEpIndex.value + 1)
}
function toggleMute() {
  const video = videoEl.value
  if (!video) return
  video.muted = !video.muted
  syncVideoState()
}
function seekVideo(event) {
  const video = videoEl.value
  if (!video) return
  const next = Number(event?.target?.value || 0)
  video.currentTime = next
  currentTime.value = next
}
function seekBy(seconds) {
  const video = videoEl.value
  if (!video || playKind.value === 'iframe') return
  const max = Number(video.duration) || duration.value || 0
  const next = Math.max(0, max ? Math.min(max, video.currentTime + seconds) : video.currentTime + seconds)
  video.currentTime = next
  currentTime.value = next
  showPlayerControls()
}
function formatTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
function rateLabel(rate) {
  const value = Number(rate) || 1
  return Number.isInteger(value) ? `${value.toFixed(1)}x` : `${value}x`
}
function onVideoEnded() {
  syncVideoState()
  saveWatchHistory(true)
  if (autoNext.value) playNextEpisode()
}
function setPlaybackRate(rate) {
  playbackRate.value = rate
  const video = videoEl.value
  if (video) video.playbackRate = rate
  rateOpen.value = false
}
function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
  if (settingsOpen.value) qualityOpen.value = false
  if (!settingsOpen.value) rateOpen.value = false
  showPlayerControls()
}
async function togglePip() {
  const video = videoEl.value
  if (!video || !document.pictureInPictureEnabled) return
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture()
    else await video.requestPictureInPicture()
  } catch {}
}
async function requestNativeFullscreen() {
  const video = videoEl.value
  if (!video) return
  try {
    video.controls = true
    nativeFullscreen.value = true
    videoFullscreen.value = false
    if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen()
      return
    }
    if (video.requestFullscreen) {
      await video.requestFullscreen()
      return
    }
    if (video.webkitRequestFullscreen) {
      await video.webkitRequestFullscreen()
    }
  } catch {}
}
function syncFullscreenState() {
  const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement
  const video = videoEl.value
  videoFullscreen.value = false
  nativeFullscreen.value = fullscreenElement === video || Boolean(video?.webkitDisplayingFullscreen)
  if (!nativeFullscreen.value && video) video.controls = false
}
function togglePlayerTheater() {
  playerTheater.value = !playerTheater.value
  videoFullscreen.value = playerTheater.value
  nativeFullscreen.value = false
  const video = videoEl.value
  if (video) video.controls = false
  showPlayerControls()
}
function openAirplay() {
  const video = videoEl.value
  if (video?.webkitShowPlaybackTargetPicker) video.webkitShowPlaybackTargetPicker()
}
function selectDetailLine(id) {
  currentLineId.value = id
  currentEpIndex.value = 0
  detailEpDesc.value = false
  playEpDesc.value = false
  selectedPlayGroupIdx.value = 0
}
function selectLine(id) {
  currentLineId.value = id
  detailEpDesc.value = false
  playEpDesc.value = false
  selectedPlayGroupIdx.value = Math.max(0, Math.floor(currentEpIndex.value / 50))
  qualityOpen.value = false
  settingsOpen.value = false
  rateOpen.value = false
  syncPlayRouteQuery()
  focusActivePlayControls()
}
function selectPlayGroup(index) {
  selectedPlayGroupIdx.value = index
  focusActivePlayControls()
}
function syncPlayRouteQuery() {
  if (pageMode.value !== 'play') return
  const href = router.resolve({
    path: route.path,
    query: cleanQuery({
      line: currentLineId.value || undefined,
      ep: currentEpIndex.value + 1,
    }),
  }).href
  window.history.replaceState(window.history.state, '', href)
}
function selectEpisode(index) {
  saveWatchHistory(true)
  currentEpIndex.value = index
  selectedPlayGroupIdx.value = playEpisodeGroups.value.findIndex(group => index >= group.start && index <= group.end)
  if (selectedPlayGroupIdx.value < 0) selectedPlayGroupIdx.value = 0
  qualityOpen.value = false
  settingsOpen.value = false
  rateOpen.value = false
  syncPlayRouteQuery()
  focusActivePlayControls()
  playCurrent()
}
function scrollActiveButton(container, { block = 'nearest', inline = 'center', focus = false } = {}) {
  if (!container?.getClientRects?.().length) return
  const active = container?.querySelector?.('button.active')
  if (!active) return
  active.scrollIntoView({ behavior: 'smooth', block, inline })
  if (focus) active.focus({ preventScroll: true })
}
async function focusActivePlayControls() {
  await nextTick()
  scrollActiveButton(sideLinesEl.value, { inline: 'center' })
  scrollActiveButton(miniLinesEl.value, { inline: 'center' })
  scrollActiveButton(playGroupsEl.value, { inline: 'center' })
  scrollActiveButton(sideEpisodesEl.value, { block: 'nearest', inline: 'nearest', focus: true })
  scrollActiveButton(miniEpisodesEl.value, { block: 'nearest', inline: 'nearest' })
}
function onKeydown(event) {
  if (event.key === 'Escape' && playerTheater.value) {
    playerTheater.value = false
    videoFullscreen.value = false
    return
  }
  if (!shouldHandlePlayerHotkey(event)) return
  if (event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault()
    togglePlay()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    seekBy(-10)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    seekBy(10)
  }
}
function shouldHandlePlayerHotkey(event) {
  if (pageMode.value !== 'play' || playKind.value === 'iframe' || !videoEl.value) return false
  const target = event.target
  const tag = String(target?.tagName || '').toLowerCase()
  if (target?.isContentEditable || ['input', 'textarea', 'select'].includes(tag)) return false
  if (playerTheater.value) return true
  return Boolean(videoBox.value?.contains?.(document.activeElement))
}
async function ensureUser() {
  if (user.value) return user.value
  try {
    user.value = await api.userMe()
  } catch {
    user.value = null
  }
  return user.value
}
async function toggleFollow() {
  if (!vod.value?.id) return
  const currentUser = await ensureUser()
  if (!currentUser) {
    goLogin()
    return
  }
  const result = followed.value ? await api.unfollowVod(vod.value.id) : await api.followVod(vod.value.id)
  followed.value = Boolean(result?.followed)
}
async function refreshSection(section) {
  const res = await api.vods({ page: 1 + ((section.page || 1) % 3), size: 12, type: section.type, sort: 'recent' }).catch(() => ({ list: [] }))
  section.items = res?.list || section.items
  section.page = 1 + ((section.page || 1) % 3)
}
async function refreshRelated() {
  if (!vod.value?.id) return
  const rows = await api.related({ id: vod.value.id, type: vod.value?.typeName, sub: vod.value?.subType, limit: 12 }).catch(() => [])
  related.value = rows || related.value
}
async function ensureTypes() {
  if (types.value.length) return types.value
  types.value = await api.types().catch(() => [])
  return types.value
}
async function loadHome() {
  loading.value = true
  try {
    const typeRows = await ensureTypes().catch(() => [])
    const sectionTypes = (typeRows || []).map(item => item.name).filter(Boolean)
    homeSections.value = sectionTypes.map(type => ({
      key: type,
      type,
      title: `最新${type}`,
      rankTitle: `${type}热榜`,
      page: 1,
      items: [],
      rank: [],
    }))
    const heroPromise = api.hot(12)
      .then(rows => {
        const list = (rows || []).map(withRandomHeroImage).filter(item => heroImage(item)).slice(0, 8)
        heroItems.value = list
        return { list }
      })
      .catch(() => ({ list: [] }))
    const hotPromise = api.hot(24).catch(() => [])
    Promise.all([heroPromise, hotPromise]).then(([heroRes, hotRes]) => {
      hotItems.value = uniqueVods(hotRes, heroRes?.list).slice(0, 28)
    }).catch(() => {})
    const sectionPromises = sectionTypes.map((type, index) => Promise.all([
      api.vods({ page: 1, size: 12, type, sort: 'recent' }).catch(() => ({ list: [] })),
      api.vods({ page: 1, size: 10, type, sort: 'hot' }).catch(() => ({ list: [] })),
    ]).then(([recent, rank]) => {
      const next = [...homeSections.value]
      next[index] = {
        ...next[index],
        items: recent?.list || [],
        rank: rank?.list || [],
      }
      homeSections.value = next
      return [recent, rank]
    }))

    const [heroRes, hotRes, ...sectionRes] = await Promise.all([
      heroPromise,
      hotPromise,
      ...sectionPromises,
    ])
    const sections = homeSections.value
    const sectionFill = sections.flatMap(section => section.items)
    hotItems.value = uniqueVods(hotRes, heroRes?.list, sectionFill).slice(0, 28)
    trailerItems.value = uniqueVods(heroItems.value, hotItems.value, sectionFill).filter(item => poster(item)).slice(0, 5)
  } finally {
    loading.value = false
  }
}
async function loadBrowse() {
  const requestId = ++browseRequestId
  loading.value = true
  try {
    await ensureTypes()
    page.value = Math.max(1, Number(route.query.page) || 1)
    kw.value = String(route.query.kw || '')
    const [res, subtypeRows, yearRows] = await Promise.all([
      api.vods({
        page: page.value,
        size: 30,
        kw: route.query.kw || undefined,
        type: curType.value || undefined,
        sub: curSub.value || undefined,
        year: curYear.value || undefined,
        sort: sort.value,
      }).catch(() => ({ list: [] })),
      curType.value ? api.subtypes(curType.value).catch(() => []) : Promise.resolve([]),
      api.years({ type: curType.value || '', sub: curSub.value || '', kw: route.query.kw || '' }).catch(() => []),
    ])
    if (requestId !== browseRequestId || pageMode.value !== 'show') return
    list.value = res?.list || []
    hasMore.value = list.value.length >= 30
    subtypes.value = (subtypeRows || []).filter(item => Number(item.count || 0) > 0).slice(0, 18)
    years.value = (yearRows || []).slice(0, 12)
  } finally {
    if (requestId === browseRequestId) loading.value = false
  }
}
async function loadRanks() {
  loading.value = true
  try {
    await ensureTypes()
    const rankTypes = ['电影', '动漫', '电视剧', '短剧', '漫剧']
    const [hot, hotFallback, ...groups] = await Promise.all([
      api.hot(10).catch(() => []),
      api.vods({ page: 1, size: 10, sort: 'hot' }).catch(() => ({ list: [] })),
      ...rankTypes.map(type => api.vods({ page: 1, size: 10, type, sort: 'hot' }).catch(() => ({ list: [] }))),
    ])
    rankGroups.value = [
      { key: 'all', title: '综合榜', items: uniqueVods(hot || [], hotFallback?.list || []).slice(0, 10) },
      ...rankTypes.map((type, index) => ({ key: type, title: `${type}榜`, items: groups[index]?.list || [] })),
    ]
  } finally {
    loading.value = false
  }
}
async function loadVod(withPlay = false) {
  loading.value = true
  destroyHls()
  playUrl.value = ''
  qualityOpen.value = false
  qualities.value = []
  defaultQualityUrl.value = ''
  currentTime.value = 0
  duration.value = 0
  playing.value = false
  settingsOpen.value = false
  detailEpDesc.value = false
  playEpDesc.value = false
  selectedPlayGroupIdx.value = 0
  followed.value = false
  vodHistory.value = null
  historySaveAt = 0
  try {
    await ensureTypes()
    const id = Number(route.params.id)
    const currentUser = await ensureUser()
    vod.value = await api.vod(id).catch(() => ({}))
    const requestedLineId = Number(route.query.line || 0)
    const routeLine = (vod.value?.lines || []).find(line => line.id === requestedLineId)
    currentLineId.value = routeLine?.id || vod.value?.lines?.[0]?.id || 0
    currentEpIndex.value = Math.max(0, Number(route.query.ep || 1) - 1)
    selectedPlayGroupIdx.value = Math.max(0, Math.floor(currentEpIndex.value / 50))
    const [relatedRows, state] = await Promise.all([
      api.related({ id, type: vod.value?.typeName, sub: vod.value?.subType, limit: 12 }).catch(() => []),
      currentUser ? api.userVodState(id).catch(() => null) : Promise.resolve(null),
    ])
    related.value = relatedRows || []
    followed.value = Boolean(state?.followed)
    vodHistory.value = state?.history || null
    const historyLine = (vod.value?.lines || []).find(line => line.id === Number(vodHistory.value?.lineId || 0))
    if (!requestedLineId && historyLine) currentLineId.value = historyLine.id
    if (withPlay && currentLineId.value) playCurrent()
  } finally {
    loading.value = false
  }
}

watch(() => route.fullPath, (_next, prev) => {
  if (String(prev || '').includes('/play/')) saveWatchHistory(true)
  const mode = pageMode.value
  if (mode !== 'play') {
    playerTheater.value = false
    videoFullscreen.value = false
  }
  if (mode === 'home') loadHome()
  else if (mode === 'show') loadBrowse()
  else if (mode === 'rank') loadRanks()
  else if (mode === 'detail') loadVod(false)
  else if (mode === 'play') loadVod(true)
}, { immediate: true })

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('fullscreenchange', syncFullscreenState)
  document.addEventListener('webkitfullscreenchange', syncFullscreenState)
  onResize()
  startHeroTimer()
  startSearchHintTimer()
  loadSearchHints()
})
onBeforeUnmount(() => {
  saveWatchHistory(true)
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('fullscreenchange', syncFullscreenState)
  document.removeEventListener('webkitfullscreenchange', syncFullscreenState)
  clearInterval(heroTimer)
  clearInterval(searchHintTimer)
  clearTimeout(controlsTimer)
  destroyHls()
})
</script>

<style>
.x8-page {
  min-height: 100vh;
  background: #1f1f1f;
  color: #fff;
  font-family: "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
}
.x8-page button {
  font: inherit;
}
.x8-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 100;
  height: calc(72px + env(safe-area-inset-top));
  display: grid;
  grid-template-columns: 150px minmax(360px, 1fr) minmax(182px, 368px) auto;
  align-items: center;
  gap: 30px;
  padding: env(safe-area-inset-top) 40px 0;
  background:
    linear-gradient(180deg, rgba(18,18,18,var(--x8-header-bg, 0)) 0%, rgba(18,18,18,var(--x8-header-bg, 0)) 100%),
    linear-gradient(180deg, rgba(0,0,0,.68) 0%, rgba(0,0,0,.38) 54%, rgba(0,0,0,0) 100%);
  transition: background .2s linear;
}
.x8-header.solid {
  background: #121212;
  backdrop-filter: none;
}
.x8-brand,
.x8-nav button,
.x8-header-tools button,
.x8-search button,
.x8-panel-title,
.x8-change,
.x8-more {
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}
.x8-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.x8-brand img {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  object-fit: contain;
}
.x8-brand-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: #111;
  background: #fff;
  font-weight: 900;
}
.x8-brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1;
}
.x8-brand-text b {
  font-size: 15px;
  font-weight: 700;
}
.x8-brand-text em {
  color: rgba(255,255,255,.66);
  font-size: 9px;
  font-style: normal;
  letter-spacing: 1px;
}
.x8-nav {
  display: flex;
  align-items: center;
  gap: 30px;
  min-width: 0;
}
.x8-nav button {
  color: rgba(255,255,255,.85);
  font-size: 18px;
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
  transform-origin: center;
  transition: color .15s ease, transform .15s ease;
}
.x8-nav button.active,
.x8-nav button:hover {
  color: #fff;
  font-weight: 700;
  transform: scale(1.11111);
}
.x8-search {
  justify-self: end;
  width: min(368px, 100%);
  max-width: 368px;
  min-width: 182px;
  height: 40px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46px;
  border-radius: 20px;
  background: rgba(255,255,255,.08);
  overflow: hidden;
  transition: background .25s ease;
}
.x8-search:hover,
.x8-search:focus-within {
  background: rgba(255,255,255,.12);
}
.x8-search input {
  width: 100%;
  min-width: 0;
  height: 36px;
  border: 0;
  outline: 0;
  padding: 0 0 0 16px;
  color: #fff;
  background: transparent;
  font-size: 14px;
  line-height: 16px;
  opacity: 1;
  align-self: center;
}
.x8-search svg {
  width: 20px;
  height: 20px;
  display: block;
}
.x8-search button {
  width: 46px;
  height: 34px;
  align-self: center;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  color: rgba(255,255,255,.82);
  background: transparent;
  cursor: pointer;
}
.x8-header-tools {
  display: flex;
  align-items: center;
  gap: 30px;
}
.x8-header-tools button {
  min-width: 36px;
  height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: rgba(255,255,255,.72);
  font-size: 10px;
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
  transform-origin: center;
  transition: color .2s ease, transform .2s ease;
}
.x8-header-tools button:hover {
  color: #fff;
  transform: scale(1.08);
}
.x8-header-tools svg {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  stroke-width: 2;
}
.x8-header-tools .x8-login-btn {
  min-width: 64px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border: 1px solid rgba(255,255,255,.7);
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
}
.x8-banner {
  --base-size: calc(100vw * (1 / 1830));
  position: relative;
  padding-top: 49.18%;
  min-height: 0;
  max-height: 900px;
  overflow: hidden;
}
.x8-banner-skeleton {
  background: linear-gradient(110deg, #181818 8%, #222 18%, #181818 33%);
  background-size: 220% 100%;
  animation: x8-shimmer 1.4s linear infinite;
}
.x8-skeleton-title,
.x8-skeleton-subtitle {
  position: absolute;
  left: 40px;
  z-index: 3;
  border-radius: 8px;
  background: rgba(255,255,255,.12);
}
.x8-skeleton-title {
  bottom: calc(var(--base-size) * 100);
  width: min(360px, 54vw);
  height: 48px;
}
.x8-skeleton-subtitle {
  bottom: calc(var(--base-size) * 68);
  width: min(220px, 42vw);
  height: 16px;
}
.x8-skeleton-shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, #141414 8%, #242424 18%, #141414 33%);
  background-size: 220% 100%;
  animation: x8-shimmer 1.35s linear infinite;
}
@keyframes x8-shimmer {
  to { background-position-x: -220%; }
}
.x8-banner-swiper {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #111;
  overflow: hidden;
  touch-action: pan-y;
}
.x8-banner-track {
  height: 100%;
  display: flex;
  transition: transform .72s cubic-bezier(.22, .61, .36, 1);
  will-change: transform;
}
.x8-hero-slide {
  position: relative;
  flex: 0 0 100%;
  height: 100%;
  overflow: hidden;
}
.x8-hero-link {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
  background: #111;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.x8-bg-img-container {
  position: absolute;
  top: 0;
  left: 50%;
  width: auto;
  min-width: 100%;
  height: 100%;
  max-width: none;
  object-fit: cover;
  transform: translateX(-50%);
}
.x8-slide-content {
  position: absolute;
  inset: 0;
  display: block;
  z-index: 1;
}
.x8-slide-content::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  height: 160px;
  pointer-events: none;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,.6) 100%);
  mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,.6) 100%);
}
.x8-slide-content::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  height: 160px;
  pointer-events: none;
  background: linear-gradient(360deg, #1f1f1f 0%, rgba(0,0,0,0) 100%);
}
.x8-slide-action {
  width: 800px;
  position: absolute;
  left: 40px;
  bottom: calc(var(--base-size) * 70);
  z-index: 3;
  display: block;
  max-width: min(800px, 70vw);
  color: #fff;
  text-align: left;
}
.x8-go-title {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 6px;
  line-height: 1.25;
}
.x8-go-title .list-title {
  color: #fff;
  font-size: 48px;
  font-weight: 600;
  text-shadow: 0 1px 1px rgba(0,0,0,.35);
}
.x8-go-title .list-description {
  color: rgba(255,255,255,.6);
  font-size: 14px !important;
  font-style: normal;
  margin-bottom: 8px;
}
.x8-banner-arrow {
  position: absolute;
  top: 50%;
  z-index: 4;
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 50%;
  color: rgba(255,255,255,.86);
  background: rgba(0,0,0,.28);
  box-shadow: 0 10px 28px rgba(0,0,0,.24);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  cursor: pointer;
  opacity: 0;
  transform: translateY(-50%) scale(.92);
  transition: opacity .2s ease, transform .2s ease, background .2s ease;
}
.x8-banner:hover .x8-banner-arrow {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}
.x8-banner-arrow:hover {
  background: rgba(255,255,255,.18);
}
.x8-banner-arrow svg {
  width: 26px;
  height: 26px;
  display: block;
  margin: auto;
}
.x8-banner-arrow.left { left: 32px; }
.x8-banner-arrow.right { right: 32px; }
.x8-banner-dots {
  position: absolute;
  left: 50%;
  bottom: 64px;
  z-index: 5;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: 100px;
  background: rgba(0,0,0,.34);
  box-shadow: 0 8px 24px rgba(0,0,0,.18);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transform: translateX(-50%);
}
.x8-banner-dots button {
  width: 22px;
  height: 18px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.x8-banner-dots span {
  display: block;
  width: 100%;
  height: 4px;
  border-radius: 99px;
  background: rgba(255,255,255,.32);
  transition: width .24s ease, background .24s ease;
}
.x8-banner-dots button.active span {
  background: #fff;
}
.x8-banner-dots.skeleton span {
  background: rgba(255,255,255,.18);
}
.x8-panel {
  width: min(1750px, calc(100vw - 112px));
  margin: 0 auto 56px;
  position: relative;
}
.x8-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 16px;
}
.x8-page .x8-panel-title {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 29px;
  line-height: 28px;
  font-weight: 600;
}
.x8-page .x8-panel-title svg {
  width: 28px;
  height: 28px;
  color: rgba(255,255,255,.4);
  transition: transform .2s ease, color .2s ease;
}
.x8-page .x8-panel-title:hover svg {
  color: #fff;
  transform: translateX(4px);
}
.x8-panel-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.x8-page .x8-change,
.x8-page .x8-more {
  height: 28px;
  border-radius: 50px;
  padding: 0 13px;
  color: rgba(255,255,255,.6);
  font-size: 14px;
}
.x8-page .x8-change {
  border: 1px solid rgba(255,255,255,.08);
}
.x8-page .x8-more {
  background: rgba(255,255,255,.12);
}
.x8-page .x8-more:hover {
  color: #fff;
  background: #d92828;
}
.x8-card-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 40px 19.9px;
}
.x8-card-grid.hot {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.x8-card {
  min-width: 0;
  position: relative;
  cursor: pointer;
}
.x8-card-skeleton {
  cursor: default;
  pointer-events: none;
}
.x8-card-poster {
  --scale-x: 1.22866;
  --scale-y: 1.2416;
  position: relative;
  aspect-ratio: 356 / 498;
  border-radius: 10px;
  overflow: hidden;
  background: #101010;
  box-shadow: 0 2px 16px rgba(0,0,0,.3);
  transition: transform .25s ease, box-shadow .25s ease;
}
.x8-card-grid.hot .x8-card-poster {
  height: 375px;
  aspect-ratio: auto;
}
.x8-card-grid.section .x8-card-poster {
  height: 327px;
  aspect-ratio: auto;
}
.x8-card-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .25s ease;
}
.x8-card-skeleton .x8-card-poster {
  box-shadow: none;
}
.x8-card-skeleton .x8-card-info {
  align-items: center;
}
.x8-skeleton-line {
  display: block;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(110deg, #242424 8%, #343434 18%, #242424 33%);
  background-size: 220% 100%;
  animation: x8-shimmer 1.35s linear infinite;
}
.x8-skeleton-line.wide {
  width: 72%;
}
.x8-skeleton-line.short {
  width: 44%;
  height: 9px;
  margin-top: 7px;
}
.x8-skeleton-line.score {
  width: 32px;
  height: 14px;
  flex: 0 0 auto;
}
.x8-card:hover {
  z-index: 10;
}
.x8-card:hover .x8-card-poster {
  transform: scale(var(--scale-x), var(--scale-y));
  box-shadow: 0 7px 70px rgba(0,0,0,.8);
}
.x8-card:hover .x8-card-poster img {
  transform: scale(1.02);
}
.x8-card-tags {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 4px;
}
.x8-card-tags span {
  width: 38px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  color: #fff;
  background: #6d83f2;
  font-size: 12px;
  font-weight: 600;
}
.x8-card-bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 110px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px 15px;
  background: linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.85));
  color: rgba(255,255,255,.78);
  font-size: 14px;
}
.x8-card-bottom span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.x8-card-bottom b {
  color: #fff;
  font-size: 24px;
  line-height: 18px;
  font-weight: 700;
}
.x8-card-hover {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  color: rgba(255,255,255,.8);
  font-size: 12px;
  opacity: 0;
  transition: opacity .25s ease;
}
.x8-card-hover::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -1;
  height: 360px;
  background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.9));
}
.x8-card:hover .x8-card-hover {
  opacity: 1;
}
.x8-hover-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #fff;
}
.x8-hover-title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 27px;
  font-weight: 600;
}
.x8-hover-title b {
  font-size: 32px;
  font-weight: 700;
}
.x8-card-hover p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.x8-card-hover .intro {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  line-height: 15px;
}
.x8-hover-footer {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 2px;
}
.x8-heat {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: rgba(255,255,255,.78);
  font-size: 12px;
  line-height: 1;
}
.x8-heat svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  color: #ff7a3d;
  filter: drop-shadow(0 0 8px rgba(255,122,61,.35));
}
.x8-heat em {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: normal;
}
.x8-card-hover .x8-follow-btn {
  flex: 0 0 auto;
  height: 30px;
  border: 0;
  border-radius: 6px;
  padding: 0 13px;
  color: #fff;
  background: rgba(109,131,242,.94);
  box-shadow: 0 6px 18px rgba(109,131,242,.28);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.x8-card-hover .x8-follow-btn:hover {
  background: #7c8fff;
}
.x8-card-info {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 8px;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}
.x8-card-info span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 18px;
}
.x8-card-info b {
  color: rgba(255,255,255,.4);
  font-size: 20px;
  font-weight: 700;
}
.x8-trailer {
  margin-top: 8px;
}
.x8-trailer-content {
  position: relative;
  min-height: 520px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 0;
  border-radius: 12px;
  overflow: hidden;
}
.x8-trailer-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: .26;
  background-size: 100% auto;
  background-position: center bottom;
  background-repeat: no-repeat;
  filter: blur(1px);
}
.x8-trailer-content > * {
  position: relative;
  z-index: 1;
}
.x8-trailer-name {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
}
.x8-trailer-name small {
  color: rgba(255,255,255,.72);
  font-size: 20px;
  font-weight: 600;
}
.x8-trailer-name button {
  height: 24px;
  border: 1px solid #fff;
  border-radius: 6px;
  padding: 0 9px;
  color: #fff;
  background: #1f1f1f;
  font-size: 14px;
}
.x8-trailer-flex {
  flex: 1;
  display: flex;
}
.x8-trailer-player {
  width: 54.8572%;
  aspect-ratio: 16 / 9;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 12px;
  background: #000;
  box-shadow: 0 4px 12px rgba(0,0,0,.2);
  cursor: pointer;
}
.x8-play-icon {
  display: inline-grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  color: rgba(255,255,255,.84);
  background: rgba(255,255,255,.12);
}
.x8-play-icon svg {
  width: 34px;
  height: 34px;
}
.x8-trailer-right {
  flex: 1;
  min-width: 0;
  position: relative;
  margin: 0 46px;
}
.x8-watermark {
  position: absolute;
  inset: 0 0 90px;
  display: grid;
  place-items: center;
  align-content: center;
  color: rgba(255,255,255,.2);
  text-align: center;
}
.x8-watermark b {
  font-size: 38px;
  font-weight: 900;
}
.x8-watermark span {
  margin-top: 8px;
  font-size: 16px;
  letter-spacing: 2px;
}
.x8-trailer-thumbs {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  -webkit-mask: linear-gradient(90deg, rgba(0,0,0,0), #000 30%, #000 70%, rgba(0,0,0,0));
  mask: linear-gradient(90deg, rgba(0,0,0,0), #000 30%, #000 70%, rgba(0,0,0,0));
}
.x8-trailer-thumbs button {
  flex: 1;
  max-width: 130px;
  aspect-ratio: 130 / 68;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 12px;
  padding: 0;
  overflow: hidden;
  background: #111;
  cursor: pointer;
}
.x8-trailer-thumbs button:not(.active)::after {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,.5);
}
.x8-trailer-thumbs img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .2s ease;
}
.x8-trailer-thumbs button:hover img {
  transform: scale(1.1);
}
.x8-section-row {
  display: flex;
  gap: 22px;
  align-items: flex-start;
}
.x8-section-main {
  flex: 1;
  min-width: 0;
}
.x8-rank-card {
  width: 426px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.x8-rank-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.x8-rank-head-title {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.x8-rank-head h3 {
  margin: 0;
  font-size: 29px;
  font-weight: 600;
}
.x8-rank-head p {
  margin: 0;
  color: rgba(255,255,255,.42);
  font-size: 13px;
  font-weight: 400;
}
.x8-rank-head button {
  height: 28px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 20px;
  padding: 0 12px;
  color: rgba(255,255,255,.4);
  background: transparent;
}
.x8-rank-list {
  position: relative;
  min-height: 520px;
  padding: 12px;
  border-radius: 12px;
  background: #1a1a1a;
  box-shadow: 0 2px 16px rgba(0,0,0,.3);
  overflow: hidden;
}
.x8-rank-list::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: linear-gradient(135deg, rgba(255,255,255,.04), rgba(255,255,255,0));
  pointer-events: none;
}
.x8-rank-item {
  position: relative;
  width: 100%;
  height: 48px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 8px;
  padding: 0 12px;
  color: #fff;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: height .16s cubic-bezier(.32,.72,0,1), background-color .2s ease;
}
.x8-rank-item.active {
  height: 108px;
  grid-template-columns: 30px 62px minmax(0, 1fr) auto;
}
.x8-rank-item:hover {
  background: rgba(255,255,255,.04);
}
.x8-rank-item.skeleton {
  cursor: default;
}
.x8-rank-item.skeleton:hover {
  background: transparent;
}
.x8-rank-item .num {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  color: rgba(255,255,255,.72);
  background: rgba(255,255,255,.04);
  font-size: 16px;
  font-weight: 600;
}
.x8-rank-item.index-0 .num,
.x8-rank-item.index-1 .num,
.x8-rank-item.index-2 .num {
  color: #fff;
  background: #d92828;
}
.x8-rank-item img {
  width: 62px;
  height: 88px;
  border-radius: 4px;
  object-fit: cover;
}
.x8-rank-skeleton-poster {
  width: 62px;
  height: 88px;
  border-radius: 4px;
  background: linear-gradient(110deg, #242424 8%, #343434 18%, #242424 33%);
  background-size: 220% 100%;
  animation: x8-shimmer 1.35s linear infinite;
}
.rank-title {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.rank-title b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  font-weight: 600;
}
.rank-title em {
  color: rgba(255,255,255,.55);
  font-size: 12px;
  font-style: normal;
}
.x8-rank-item strong {
  color: rgba(255,255,255,.4);
  font-size: 16px;
  font-weight: 700;
}
.x8-page-panel {
  width: min(1750px, calc(100vw - 112px));
  margin: 0 auto;
  padding: 96px 0 80px;
}
.x8-play {
  width: min(1500px, calc(100vw - 120px));
  margin: 0 auto;
  padding: calc(92px + env(safe-area-inset-top)) 0 80px;
}
.x8-page-title {
  margin-bottom: 24px;
}
.x8-page-title h1 {
  margin: 0 0 8px;
  font-size: 34px;
  font-weight: 700;
}
.x8-page-title p {
  margin: 0;
  color: rgba(255,255,255,.55);
}
.x8-filter {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-bottom: 34px;
  padding: 20px 22px;
  border-radius: 12px;
  background: #1a1a1a;
}
.x8-filter-line {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: start;
  column-gap: 18px;
}
.x8-filter-line span {
  width: 42px;
  min-height: 34px;
  display: flex;
  align-items: center;
  color: rgba(255,255,255,.42);
  font-size: 13px;
}
.x8-filter-tags {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 14px;
}
.x8-filter-line.skeleton {
  pointer-events: none;
}
.x8-filter-line.skeleton span,
.x8-filter-tags i {
  display: block;
  height: 32px;
  border-radius: 7px;
  background: linear-gradient(110deg, #242424 8%, #343434 18%, #242424 33%);
  background-size: 220% 100%;
  animation: x8-shimmer 1.35s linear infinite;
}
.x8-filter-line.skeleton span {
  width: 42px;
  opacity: .62;
}
.x8-filter-tags i {
  width: 68px;
}
.x8-filter-tags i:nth-child(4n) {
  width: 86px;
}
.x8-filter-line button,
.x8-pager button,
.x8-line-tabs button,
.x8-episode-grid button {
  min-height: 32px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 7px;
  padding: 0 12px;
  color: rgba(255,255,255,.68);
  background: rgba(255,255,255,.04);
  cursor: pointer;
}
.x8-filter-line button.active,
.x8-line-tabs button.active,
.x8-episode-grid button.active {
  color: #111;
  background: #fff;
  border-color: #fff;
  font-weight: 700;
}
.x8-card-grid.browse {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.x8-pager {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 36px;
}
.x8-pager button:disabled {
  opacity: .35;
  cursor: not-allowed;
}
.x8-empty {
  padding: 80px 0;
  text-align: center;
  color: rgba(255,255,255,.5);
}
.x8-rank-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.x8-rank-card.static {
  width: auto;
  min-width: 0;
  height: 962px;
  gap: 0;
  border-radius: 12px;
  background: rgba(255,255,255,.04);
  overflow: hidden;
  box-shadow: 0 18px 38px rgba(0,0,0,.18);
}
.x8-rank-card.static .x8-rank-head {
  flex: 0 0 60px;
  height: 60px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.x8-rank-card.static .x8-rank-head h3 {
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
  color: #fff;
}
.x8-rank-large-list {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  padding: 0 12px 20px;
  overflow: hidden;
}
.x8-rank-large-list.active .index-0,
.x8-rank-large-list.active .index-1,
.x8-rank-large-list.active .index-2 {
  background: #282828;
  transition: all .16s cubic-bezier(.32,.72,0,1), background-color 0s;
}
.x8-rank-large-item {
  position: relative;
  z-index: 1;
  width: 100%;
  min-width: 0;
  height: 54px;
  display: flex;
  align-items: center;
  border: 0;
  padding: 0;
  color: #fff;
  background: transparent;
  text-align: left;
  cursor: pointer;
  flex-shrink: 0;
  transition: all .16s cubic-bezier(.32,.72,0,1), background-color 1s;
}
.x8-rank-large-item.index-0,
.x8-rank-large-item.index-1,
.x8-rank-large-item.index-2 {
  z-index: 1;
}
.x8-rank-large-item.active {
  height: 168px;
}
.x8-rank-large-item.locked {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transform: translateY(calc(-100% - 60px));
}
.x8-rank-large-list.active-index-8 .x8-rank-large-item.locked {
  transform: translateY(calc(-100% - 8px));
}
.x8-rank-large-item.active.index-7 {
  transform: translateY(-4%);
}
.x8-rank-large-item.active.index-8 {
  transform: translateY(-36%);
}
.x8-rank-large-item.active.index-9 {
  transform: translateY(-68%);
}
.x8-rank-large-item.skeleton {
  cursor: default;
}
.x8-rank-large-content {
  position: absolute;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  opacity: 0;
  flex-shrink: 0;
  transition: opacity .08s cubic-bezier(.32,.72,0,1);
}
.x8-rank-large-content.normal {
  opacity: 1;
}
.x8-rank-large-content.full {
  background: transparent;
}
.x8-rank-large-content:not(.index-0):not(.index-1):not(.index-2).full {
  background: rgba(255,255,255,.02);
}
.x8-rank-large-content:hover {
  background: rgba(255,255,255,.02) !important;
}
.x8-rank-large-item.active .x8-rank-large-content.normal {
  opacity: 0;
}
.x8-rank-large-item.active .x8-rank-large-content.full {
  opacity: 1;
  transition-delay: .16s;
}
.x8-rank-large-item.active .x8-rank-large-content.full * {
  transition-delay: .16s;
}
.x8-rank-large-no {
  flex: 0 0 36px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: rgba(255,255,255,.72);
  background: rgba(255,255,255,.04);
  font-size: 16px;
  font-weight: 600;
}
.x8-rank-large-item.active .x8-rank-large-content.full .x8-rank-large-no {
  display: none;
}
.x8-rank-large-item.index-0 .x8-rank-large-no,
.x8-rank-large-item.index-1 .x8-rank-large-no,
.x8-rank-large-item.index-2 .x8-rank-large-no {
  background: transparent;
  font-family: "DIN Alternate", Arial, sans-serif;
  font-size: 24px;
  font-weight: 700;
}
.x8-rank-large-item.index-0 .x8-rank-large-no { color: #ff183e; }
.x8-rank-large-item.index-1 .x8-rank-large-no {
  color: #ff5d38;
}
.x8-rank-large-item.index-2 .x8-rank-large-no {
  color: #ffb820;
}
.x8-rank-large-center {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  transform: translateY(3px);
}
.x8-rank-large-center-content {
  height: 24px;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
}
.x8-rank-large-item.active .x8-rank-large-center {
  transform: translateY(0);
}
.x8-rank-large-item.active .x8-rank-large-center-content {
  height: 144px;
  gap: 12px;
}
.x8-rank-large-poster {
  position: relative;
  width: 0;
  height: 0;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: rgba(255,255,255,.06);
  opacity: 0;
  gap: 0;
}
.x8-rank-large-item.active .x8-rank-large-poster {
  width: 100px;
  height: 144px;
  opacity: 1;
}
.x8-rank-large-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .22s ease;
}
.x8-rank-large-poster i {
  position: absolute;
  left: 0;
  bottom: -41.5%;
  width: 24px;
  height: 24px;
  display: none;
  align-items: center;
  justify-content: center;
  border-radius: 0 6px 0 0;
  color: #fff;
  font-size: 16px;
  font-style: normal;
  font-weight: 600;
  background: #d92828;
}
.x8-rank-large-item.active.index-0 .x8-rank-large-poster i,
.x8-rank-large-item.active.index-1 .x8-rank-large-poster i,
.x8-rank-large-item.active.index-2 .x8-rank-large-poster i {
  display: flex;
}
.x8-rank-large-item.index-1 .x8-rank-large-poster i {
  background: #ff5d38;
}
.x8-rank-large-item.index-2 .x8-rank-large-poster i {
  background: #ffb820;
}
.x8-rank-large-main {
  min-width: 0;
  height: 100%;
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.x8-rank-large-main b {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}
.x8-rank-large-item.active .x8-rank-large-main {
  gap: 8px;
}
.x8-rank-large-tags {
  display: flex;
  width: 0;
  height: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: 0;
  opacity: 0;
  overflow: hidden;
}
.x8-rank-large-item.active .x8-rank-large-tags {
  width: auto;
  height: auto;
  gap: 4px;
  opacity: 1;
}
.x8-rank-large-tags em {
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 4px;
  color: rgba(255,255,255,.6);
  font-size: 12px;
  font-style: normal;
  white-space: nowrap;
}
.x8-rank-large-heat {
  width: 80px;
  flex: 0 0 80px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  color: rgba(255,255,255,.6);
  font-size: 14px;
  font-weight: 400;
  text-align: right;
}
.x8-rank-large-heat::before,
.x8-rank-large-score::before {
  content: "";
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  border-radius: 8px 8px 8px 2px;
  background: linear-gradient(135deg, #ffb820 0%, #ff5d38 58%, #d92828 100%);
  transform: rotate(-18deg);
  box-shadow: 0 0 10px rgba(255,93,56,.34);
}
.x8-rank-large-score {
  position: absolute;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 0;
  opacity: 0;
  color: rgba(255,255,255,.4);
  font-family: "DIN Alternate", Arial, sans-serif;
  font-size: 14px;
  font-weight: 700;
}
.x8-rank-large-item.active .x8-rank-large-score {
  height: 16px;
  opacity: 1;
}
.x8-rank-large-poster-skeleton {
  background: linear-gradient(110deg, #242424 8%, #343434 18%, #242424 33%);
  background-size: 220% 100%;
  animation: x8-shimmer 1.35s linear infinite;
}
.x8-detail {
  padding-bottom: 80px;
}
.x8-detail-info {
  display: flex;
  position: relative;
  margin-bottom: 54px;
}
.x8-detail-poster {
  position: sticky;
  top: 96px;
  flex: 0 0 236px;
  width: 236px;
  height: 340px;
  margin-right: 24px;
  border: 0;
  border-radius: 12px;
  padding: 0;
  background: #111;
  overflow: hidden;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.x8-detail-poster-bg {
  position: absolute;
  inset: 0;
  border-radius: 12px;
  box-shadow: 0 2px 16px rgba(0,0,0,.3);
  transform: scale(1.015, 1.01) translateY(.1px);
  pointer-events: none;
}
.x8-detail-poster img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .25s ease;
}
.x8-detail-play-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0,0,0,.36);
  opacity: 0;
  transition: opacity .25s ease;
}
.x8-detail-poster:hover img {
  transform: scale(1.05);
}
.x8-detail-poster:hover .x8-detail-play-mask {
  opacity: 1;
}
.x8-detail-main {
  flex: 1;
  min-width: 0;
  height: 340px;
  max-height: 340px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}
.x8-detail-meta h1 {
  margin: -4px 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #fff;
  font-size: 36px;
  line-height: 1.3;
  font-weight: 600;
}
.x8-detail-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
}
.x8-detail-tags button {
  height: 28px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 4px;
  padding: 0 11px;
  color: rgba(255,255,255,.6);
  background: transparent;
  font-size: 14px;
  cursor: pointer;
}
.x8-detail-tags button:hover {
  background: rgba(255,255,255,.08);
  color: #fff;
}
.x8-detail-row {
  display: flex;
  min-height: 21px;
  margin-bottom: 14px;
  align-items: flex-start;
  color: #fff;
  font-size: 14px;
  line-height: 18px;
  overflow: hidden;
}
.x8-detail-row span {
  flex: 0 0 auto;
  margin-right: 5px;
  color: rgba(255,255,255,.6);
  white-space: nowrap;
}
.x8-detail-row p {
  margin: 0;
  color: #fff;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  scrollbar-width: none;
}
.x8-detail-row p::-webkit-scrollbar {
  display: none;
}
.x8-detail-people-row {
  align-items: center;
}
.x8-detail-people {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  scrollbar-width: none;
}
.x8-detail-people::-webkit-scrollbar {
  display: none;
}
.x8-detail-people button {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  border: 0;
  padding: 0;
  background: transparent;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
.x8-detail-people img,
.x8-detail-people i {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255,255,255,.12);
}
.x8-detail-people i {
  display: inline-grid;
  place-items: center;
  color: rgba(255,255,255,.7);
  font-style: normal;
  font-size: 13px;
}
.x8-detail-people em {
  max-width: 82px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-style: normal;
}
.x8-detail-actions {
  flex: 0 0 auto;
}
.x8-detail-action-top {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.x8-detail-play-btn,
.x8-follow-action {
  height: 60px;
  border: 0;
  border-radius: 10px;
  font-size: 20px;
  cursor: pointer;
}
.x8-page .x8-detail-play-btn {
  flex: 0 0 160px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: #fff;
  color: #121212;
  font-size: 20px;
  font-weight: 700;
  line-height: 24px;
  transition: background .25s ease;
}
.x8-detail-play-btn .x8-play-icon {
  width: 24px;
  height: 24px;
  border-radius: 0;
  background: transparent;
  color: #121212;
}
.x8-detail-play-btn .x8-play-icon svg {
  width: 24px;
  height: 24px;
  color: #121212;
  fill: #121212;
}
.x8-follow-action {
  flex: 0 0 108px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid #fff;
  background: transparent;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}
.x8-follow-action svg {
  width: 20px;
  height: 20px;
}
.x8-follow-action:hover,
.x8-follow-action.on {
  background: rgba(255,255,255,.08);
}
.x8-detail-stats {
  display: flex;
  width: min(760px, 100%);
  align-items: center;
  justify-content: flex-start;
  color: #fff;
  white-space: nowrap;
}
.x8-stat-item {
  min-width: 82px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 20px;
}
.x8-stat-item:first-child {
  padding-left: 0;
}
.x8-stat-top {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 18px;
  margin: 0 0 9px;
  color: #fff;
  font-size: 14px;
  line-height: 18px;
}
.x8-stat-top svg {
  width: 19px;
  height: 19px;
  margin-right: 4px;
  color: rgba(255,255,255,.9);
}
.x8-stat-top strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
  font-size: 14px;
  line-height: 18px;
  font-weight: 700;
}
.x8-stat-item span {
  color: rgba(255,255,255,.54);
  font-size: 12px;
  line-height: 16px;
}
.x8-detail-stats i {
  width: 1px;
  height: 44px;
  background: rgba(255,255,255,.12);
}
.x8-detail-intro {
  margin-bottom: 27px;
  color: #fff;
  font-size: 14px;
  line-height: 22px;
}
.x8-detail-intro p {
  margin: 0;
  max-width: 1120px;
  text-align: justify;
}
.x8-detail-play-list {
  position: relative;
  padding-bottom: 30px;
  margin-bottom: 26px;
}
.x8-detail-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.x8-detail-list-head span {
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.x8-detail-list-head button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: rgba(255,255,255,.6);
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
}
.x8-detail-list-head button:hover {
  color: #fff;
}
.x8-detail-list-head button svg {
  width: 16px;
  height: 16px;
}
.x8-detail-line-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 14px;
}
.x8-detail-line-tabs button {
  height: 36px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 10px;
  padding: 0 18px;
  background: rgba(255,255,255,.06);
  color: rgba(255,255,255,.72);
  font-size: 14px;
  cursor: pointer;
}
.x8-detail-line-tabs button.active,
.x8-detail-line-tabs button:hover {
  background: #fff;
  color: #111;
}
.x8-detail-episodes {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  max-height: 196px;
  overflow-y: auto;
  padding-right: 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,.26) transparent;
}
.x8-detail-episodes::-webkit-scrollbar {
  width: 4px;
}
.x8-detail-episodes::-webkit-scrollbar-thumb {
  border-radius: 4px;
  background: rgba(255,255,255,.26);
}
.x8-detail-episodes button {
  position: relative;
  overflow: hidden;
  min-width: 64px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 10px;
  padding: 0 18px;
  background: rgba(255,255,255,.06);
  color: rgba(255,255,255,.86);
  font-size: 15px;
  cursor: pointer;
}
.x8-detail-episodes button:hover {
  background: #fff;
  color: #111;
}
.x8-detail-episodes button span,
.x8-detail-episodes button em,
.x8-side-episodes button span,
.x8-side-episodes button em,
.x8-episode-grid button span,
.x8-episode-grid button em {
  position: relative;
  z-index: 1;
}
.x8-detail-episodes button em,
.x8-side-episodes button em,
.x8-episode-grid button em {
  color: rgba(255,255,255,.48);
  font-size: 11px;
  font-style: normal;
  font-weight: 500;
  line-height: 1;
}
.x8-detail-episodes button.watched::before,
.x8-side-episodes button.watched::before,
.x8-episode-grid button.watched::before {
  content: "";
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 0;
  width: var(--x8-episode-progress, 100%);
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, #6d83f2 0%, #9fb0ff 100%);
  box-shadow: 0 0 12px rgba(109,131,242,.38);
}
.x8-detail-episodes button.watched {
  border-color: rgba(109,131,242,.45);
}
.x8-detail-episodes button:hover em,
.x8-side-episodes button.active em,
.x8-episode-grid button.active em {
  color: rgba(17,17,17,.64);
}
.x8-play-shell {
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.x8-play-list-container {
  display: flex;
  flex-direction: column;
  gap: 32px;
  -webkit-tap-highlight-color: transparent;
}
.x8-play.theater-mode {
  position: fixed;
  inset: 0;
  z-index: 10000;
  width: 100vw;
  height: 100dvh;
  padding: 0;
  background: #000;
  overflow: hidden;
}
.x8-play.theater-mode .x8-play-shell,
.x8-play.theater-mode .x8-play-list-container {
  width: 100%;
  height: 100%;
  gap: 0;
}
.x8-play.theater-mode .x8-player-video {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 0;
  background: #000;
}
.x8-play.theater-mode .x8-player-video-left,
.x8-play.theater-mode .x8-player-area {
  width: 100%;
  height: 100%;
}
.x8-play.theater-mode .x8-player-area {
  aspect-ratio: auto;
}
.x8-play.theater-mode .x8-player-video-right,
.x8-play.theater-mode .x8-player-detail,
.x8-play.theater-mode .x8-mini-play-list,
.x8-play.theater-mode .x8-panel {
  display: none !important;
}
.x8-player-video {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  height: calc((min(1500px, calc(100vw - 120px)) - 360px) * 9 / 16);
  align-items: stretch;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(255,255,255,.04);
}
.x8-player-video-left {
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #000;
}
.x8-player-area {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}
.x8-video-container {
  position: absolute;
  inset: 0;
  background: #000;
}
.x8-video-container video,
.x8-video-container iframe {
  width: 100%;
  height: 100%;
  display: block;
  background: #000;
}
.x8-video-container video:not([controls])::-webkit-media-controls {
  display: none !important;
}
.x8-theater-title {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9;
  min-height: 86px;
  display: flex;
  align-items: flex-start;
  padding: 24px 28px 20px;
  color: #fff;
  background: linear-gradient(180deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.42) 46%, rgba(0,0,0,0) 100%);
  opacity: 0;
  pointer-events: none;
  transition: opacity .18s ease;
}
.x8-player-area.controls-visible .x8-theater-title {
  opacity: 1;
}
.x8-theater-title b {
  max-width: min(820px, calc(100vw - 56px));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
  text-shadow: 0 2px 10px rgba(0,0,0,.5);
}
.x8-airplay-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 7;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 0;
  color: rgba(255,255,255,.82);
  background: transparent;
  backdrop-filter: none;
  opacity: 0;
  pointer-events: none;
  transition: opacity .18s ease, color .16s ease, transform .16s ease;
}
.x8-player-area.controls-visible .x8-airplay-btn {
  opacity: 1;
  pointer-events: auto;
}
.x8-airplay-btn:hover {
  color: #fff;
  background: transparent;
  transform: scale(1.06);
}
.x8-player-video-right {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: transparent;
  border-left: .5px solid rgba(255,255,255,.04);
}
.x8-side-playlist {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.x8-side-playlist-head .header-title {
  padding: 16px 24px 14px;
  color: #fff;
  font-size: 20px;
  line-height: 24px;
  font-weight: 500;
}
.x8-side-lines {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 0 24px 14px;
  scrollbar-width: none;
}
.x8-side-lines::-webkit-scrollbar {
  display: none;
}
.x8-side-lines button {
  flex: 0 0 auto;
  height: 28px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 6px;
  padding: 0 11px;
  color: rgba(255,255,255,.68);
  background: rgba(255,255,255,.04);
  font-size: 13px;
}
.x8-side-lines button.active,
.x8-side-lines button:hover {
  color: #111;
  background: #fff;
  border-color: #fff;
}
.x8-side-playlist-head .header-sections {
  height: 32px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.x8-side-playlist-head .sections-left {
  flex: 1;
  display: flex;
  gap: 24px;
  overflow-x: auto;
  scrollbar-width: none;
}
.x8-side-playlist-head .sections-left::-webkit-scrollbar {
  display: none;
}
.x8-side-playlist-head .sections-left button {
  height: 32px;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 0 0 8px;
  color: rgba(255,255,255,.88);
  background: transparent;
  font-size: 16px;
  line-height: 22px;
  white-space: nowrap;
}
.x8-side-playlist-head .sections-left button.active {
  border-bottom-color: #fff;
  color: #fff;
}
.x8-side-playlist-head .sections-sort {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  color: rgba(255,255,255,.88);
  background: transparent;
}
.x8-side-playlist-head .sections-sort svg {
  width: 18px;
  height: 18px;
}
.x8-side-episodes {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 10px;
  padding: 16px 24px;
  overflow-y: auto;
}
.x8-side-episodes::-webkit-scrollbar {
  width: 4px;
}
.x8-side-episodes::-webkit-scrollbar-thumb {
  border-radius: 4px;
  background: rgba(255,255,255,.22);
}
.x8-side-episodes button,
.x8-episode-grid button {
  position: relative;
  overflow: hidden;
  min-width: 54px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 6px;
  padding: 0;
  color: rgba(255,255,255,.88);
  background: transparent;
  font-size: 14px;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
  transition: border-color .25s ease, background .25s ease, color .25s ease;
}
.x8-side-episodes button:hover,
.x8-episode-grid button:hover {
  border-color: rgba(255,255,255,.35);
}
.x8-side-episodes button.active,
.x8-episode-grid button.active {
  color: #111;
  background: #fff;
  border-color: #fff;
}
.x8-video-toolbar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  height: 58px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 7px 18px 9px;
  background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.56) 24%, rgba(0,0,0,.86) 100%);
  border-top: 0;
  backdrop-filter: blur(8px);
  opacity: 0;
  pointer-events: none;
  transform: none;
  transition: opacity .18s ease;
}
.x8-player-area.controls-visible .x8-video-toolbar {
  opacity: 1;
  pointer-events: auto;
}
.x8-progress {
  width: 100%;
  height: 10px;
  margin: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;
}
.x8-progress::-webkit-slider-runnable-track {
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, #fff 0%, #fff var(--x8-progress, 0%), rgba(255,255,255,.24) var(--x8-progress, 0%), rgba(255,255,255,.24) 100%);
}
.x8-progress::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 8px;
  height: 8px;
  margin-top: -3px;
  border: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 5px rgba(255,255,255,.12), 0 2px 10px rgba(0,0,0,.45);
}
.x8-progress::-moz-range-track {
  height: 2px;
  border-radius: 999px;
  background: rgba(255,255,255,.26);
}
.x8-progress::-moz-range-progress {
  height: 2px;
  border-radius: 999px;
  background: #fff;
}
.x8-progress::-moz-range-thumb {
  width: 8px;
  height: 8px;
  border: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(255,255,255,.16), 0 2px 8px rgba(0,0,0,.45);
}
.x8-control-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.x8-control-left,
.x8-control-right {
  display: flex;
  align-items: center;
  min-width: 0;
}
.x8-control-left {
  flex: 1;
  gap: 13px;
}
.x8-control-right {
  gap: 12px;
  justify-content: flex-end;
}
.x8-video-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 34px;
  height: 34px;
  border: 0;
  border-radius: 0;
  color: rgba(255,255,255,.9);
  background: transparent;
  font-size: 15px;
  line-height: 1;
  transition: color .16s ease, background .16s ease, transform .16s ease;
}
.x8-video-toolbar button:hover,
.x8-video-toolbar button.active {
  color: #fff;
  background: transparent;
  transform: scale(1.06);
}
.x8-video-toolbar .x8-lucide,
.x8-airplay-btn .x8-lucide {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.15;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.x8-time {
  color: rgba(255,255,255,.82);
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.x8-control-pop {
  position: relative;
}
.x8-settings-menu,
.x8-quality-menu {
  position: absolute;
  right: 0;
  bottom: 46px;
  z-index: 20;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px;
  background: rgba(18,18,18,.68);
  box-shadow: 0 10px 28px rgba(0,0,0,.36);
  backdrop-filter: blur(16px) saturate(130%);
  -webkit-backdrop-filter: blur(16px) saturate(130%);
}
.x8-settings-menu {
  width: 218px;
  padding: 7px;
  display: grid;
  gap: 3px;
}
.x8-settings-menu.rate-mode {
  width: 154px;
  padding: 5px;
}
.x8-settings-menu .x8-switch-row,
.x8-settings-menu .x8-setting-row,
.x8-settings-menu .x8-setting-back,
.x8-rate-panel button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  border: 0;
  border-radius: 8px;
  padding: 0 10px;
  color: rgba(255,255,255,.9);
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}
.x8-video-toolbar .x8-settings-menu .x8-setting-row,
.x8-video-toolbar .x8-settings-menu .x8-setting-back {
  height: 32px;
  min-height: 32px;
}
.x8-video-toolbar .x8-rate-panel button {
  height: 26px;
  min-height: 26px;
}
.x8-settings-menu .x8-switch-row {
  position: relative;
  cursor: pointer;
}
.x8-settings-menu .x8-switch-row:hover,
.x8-settings-menu .x8-setting-row:hover,
.x8-settings-menu .x8-setting-back:hover,
.x8-rate-panel button:hover {
  background: rgba(255,255,255,.07);
  transform: none;
}
.x8-settings-menu .x8-switch-row input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.x8-settings-menu .x8-switch-row i {
  position: relative;
  width: 36px;
  height: 20px;
  flex: 0 0 36px;
  border-radius: 999px;
  background: rgba(255,255,255,.18);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
  transition: background .18s ease, box-shadow .18s ease;
}
.x8-settings-menu .x8-switch-row i::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.35);
  transition: transform .18s ease;
}
.x8-settings-menu .x8-switch-row input:checked + i {
  background: rgba(255,255,255,.92);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.3);
}
.x8-settings-menu .x8-switch-row input:checked + i::after {
  transform: translateX(16px);
  background: #111;
}
.x8-settings-menu .x8-setting-row {
  cursor: pointer;
}
.x8-settings-menu .x8-setting-row b {
  margin-left: auto;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}
.x8-settings-menu .x8-setting-row svg,
.x8-settings-menu .x8-setting-back svg {
  width: 15px;
  height: 15px;
  color: rgba(255,255,255,.62);
}
.x8-rate-panel {
  min-width: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}
.x8-settings-menu .x8-setting-back {
  justify-content: flex-start;
  height: 28px;
  margin: -1px -3px 3px;
  border-radius: 10px 10px 0 0;
  border-bottom: 1px solid rgba(255,255,255,.08);
  color: #fff;
  font-size: 13px;
}
.x8-rate-panel button {
  justify-content: center;
  font-weight: 600;
  min-height: 26px;
  font-size: 13px;
}
.x8-rate-panel button.on,
.x8-quality-menu button.on {
  color: #fff;
  background: rgba(255,255,255,.08);
}
.x8-quality-menu button {
  width: 100%;
  min-height: 38px;
  border: 0;
  border-radius: 8px;
  padding: 7px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255,255,255,.78);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  transition: background .16s ease, transform .16s ease, color .16s ease;
}
.x8-quality-menu {
  width: 168px;
  padding: 7px;
  display: grid;
  gap: 3px;
}
.x8-quality-menu button:not(.on) {
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.09);
}
.x8-quality-menu button:hover {
  transform: scale(1.02);
  color: #fff;
  background: rgba(255,255,255,.07);
}
.x8-quality-menu button strong {
  color: #fff;
  font-size: 15px;
  line-height: 1;
}
.x8-quality-menu button span {
  color: rgba(255,255,255,.72);
  font-size: 13px;
  line-height: 1.2;
}
.x8-quality-trigger b {
  font-weight: 800;
}
.x8-player-detail {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.x8-player-title {
  display: flex;
  align-items: baseline;
  min-width: 0;
  color: #fff;
  font-size: 30px;
  line-height: 38px;
  font-weight: 600;
}
.x8-player-title button {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  border: 0;
  color: #fff;
  background: transparent;
}
.x8-player-title h1 {
  margin: 0;
  max-width: 620px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 30px;
  line-height: 38px;
  font-weight: 600;
}
.x8-player-title button svg {
  width: 20px;
  height: 20px;
  margin: 0 10px;
  color: rgba(255,255,255,.86);
}
.x8-player-title h2 {
  margin: 0;
  color: rgba(255,255,255,.66);
  font-size: 30px;
  line-height: 38px;
  font-weight: 600;
}
.x8-player-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0;
  color: rgba(255,255,255,.88);
  font-size: 14px;
  line-height: 20px;
}
.x8-player-meta .rating {
  display: inline-flex;
  align-items: center;
  font-size: 14px;
}
.x8-player-meta .rating svg {
  width: 16px;
  height: 16px;
  margin-right: 4px;
}
.x8-player-meta .line {
  margin: 0 10px;
  color: rgba(255,255,255,.5);
}
.x8-player-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: 24px;
}
.x8-player-tags span {
  padding: 2px 8px;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 4px;
  color: rgba(255,255,255,.66);
  font-size: 14px;
  line-height: 18px;
}
.x8-player-desc {
  max-width: 100%;
  margin: -4px 0 0;
  color: rgba(255,255,255,.88);
  font-size: 14px;
  line-height: 22px;
  text-align: justify;
}
.x8-mini-play-list {
  display: none;
  padding-bottom: 30px;
  border-top: 1px solid rgba(255,255,255,.08);
}
.x8-play-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 22px 0;
}
.x8-play-list-head .player-name {
  color: #fff;
  font-size: 20px;
  line-height: 24px;
  font-weight: 500;
}
.x8-play-list-head .x8-line-tabs {
  flex: 1;
  margin: 0;
}
.x8-play-list-head .player-sort {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 9px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 4px;
  color: rgba(255,255,255,.8);
  background: transparent;
  font-size: 14px;
}
.x8-play-list-head .player-sort svg {
  width: 24px;
  height: 24px;
}
.x8-episode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(164px, 1fr));
  gap: 12px;
  max-height: 300px;
  overflow-y: auto;
  text-align: center;
}
.x8-episode-grid::-webkit-scrollbar {
  width: 2px;
  background: rgba(255,255,255,.2);
}
.x8-episode-grid::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,.4);
}
.x8-player-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  border: 0;
  color: #fff;
  background: radial-gradient(circle at 50% 45%, rgba(255,255,255,.08), transparent 28%), #050505;
}
.x8-player-empty .x8-play-icon {
  width: auto;
  height: auto;
  border-radius: 0;
  background: transparent;
}
.x8-player-empty .x8-play-icon svg {
  width: 51px;
  height: 51px;
}
.x8-player-empty em {
  font-style: normal;
  font-weight: 500;
}
.x8-login-card {
  padding: 20px;
  border-radius: 12px;
  background: #1a1a1a;
}
.x8-login-page {
  min-height: 80vh;
  display: grid;
  place-items: center;
}
.x8-login-card {
  width: min(420px, 100%);
  text-align: center;
}
.x8-login-card h1 {
  margin: 0 0 10px;
}
.x8-login-card p {
  color: rgba(255,255,255,.55);
}
.x8-login-card button {
  height: 40px;
  border: 0;
  border-radius: 7px;
  padding: 0 18px;
  background: #fff;
  color: #111;
  font-weight: 700;
}
.x8-footer {
  margin-top: 34px;
  border-top: 1px solid rgba(255,255,255,.12);
  color: rgba(255,255,255,.6);
  background-color: #1f1f1f;
  background-image:
    linear-gradient(180deg, rgba(31,31,31,.16), rgba(31,31,31,.2)),
    url('/x8/footer-bg.png');
  background-size: cover;
  background-position: center;
}
.x8-footer-inner {
  width: min(1750px, calc(100vw - 112px));
  min-width: 0;
  margin: 0 auto;
}
.x8-quick-navigation {
  height: 308px;
  display: flex;
  justify-content: center;
  gap: 50px;
  padding: 60px 0;
  border-bottom: 1px solid rgba(255,255,255,.12);
  font-weight: 500;
}
.x8-footer-nav {
  width: 407px;
  min-width: 208px;
}
.x8-footer-nav h3 {
  margin: 0 0 21px;
  color: rgba(255,255,255,.8);
  text-align: center;
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}
.x8-footer-card {
  height: 145px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 30px 0;
  padding: 35.5px 17px;
  border-radius: 12px;
  background: rgba(255,255,255,.04);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}
.x8-footer-card.category {
  flex-direction: column;
}
.x8-footer-card .top,
.x8-footer-card .bottom {
  width: 100%;
  display: flex;
}
.x8-footer-card .top {
  padding: 0 30px;
}
.x8-footer-card .bottom {
  justify-content: space-between;
}
.x8-footer-card button {
  width: 50%;
  min-height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 0;
  color: rgba(255,255,255,.72);
  background: transparent;
  font-size: 16px;
  font-weight: 500;
  line-height: 22px;
  white-space: nowrap;
  text-align: center;
}
.x8-footer-card.category .bottom button {
  width: auto;
}
.x8-footer-card button em {
  font-style: normal;
}
@font-face {
  font-family: "x8-footer-iconfont";
  src: url('/x8/iconfont.woff') format('woff');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}
.x8-footer-icon {
  width: 20px;
  height: 20px;
  display: inline-grid;
  place-items: center;
  color: rgba(255,255,255,.56);
  font-family: "x8-footer-iconfont";
  font-size: 20px;
  font-style: normal;
  line-height: 20px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.icon-kuaijielianjie::before { content: "\e712"; }
.icon-kuaijielianjie1::before { content: "\e713"; }
.icon-kuaijielianjie2::before { content: "\e714"; }
.icon-kuaijielianjie3::before { content: "\e715"; }
.icon-kuaijielianjie4::before { content: "\e716"; }
.icon-kuaijielianjie5::before { content: "\e717"; }
.icon-kuaijielianjie6::before { content: "\e718"; }
.icon-kuaijielianjie7::before { content: "\e719"; }
.icon-kuaijielianjie8::before { content: "\e71a"; }
.icon-kuaijielianjie9::before { content: "\e71b"; }
.icon-kuaijielianjie10::before { content: "\e71c"; }
.icon-kuaijielianjie11::before { content: "\e71d"; }
.icon-kuaijielianjie12::before { content: "\e71e"; }
.x8-help-navigation {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 40px 0 42px;
}
.x8-help-navigation nav {
  display: flex;
  align-items: center;
  gap: 40px;
  font-size: 16px;
  line-height: 22px;
  font-weight: 500;
}
.x8-help-navigation button {
  border: 0;
  color: rgba(255,255,255,.6);
  background: transparent;
}
.x8-help-navigation span {
  color: rgba(255,255,255,.3);
  transform: scale(.7, 1);
}
.x8-help-navigation .year {
  color: rgba(255,255,255,.66);
  line-height: 22px;
}
.x8-float {
  position: fixed;
  right: 30px;
  bottom: 30px;
  z-index: 90;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.x8-float button {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border: .5px solid rgba(255,255,255,.08);
  border-radius: 50%;
  color: #fff;
  background: #333;
  box-shadow: 0 2px 6px rgba(0,0,0,.2);
}
.x8-float svg {
  width: 22px;
  height: 22px;
}
@media (max-width: 1749px) {
  .x8-panel,
  .x8-page-panel {
    width: min(1480px, calc(100vw - 88px));
  }
  .x8-play {
    width: min(1400px, calc(100vw - 80px));
  }
  .x8-footer-inner {
    width: min(1480px, calc(100vw - 88px));
  }
  .x8-card-grid.hot,
  .x8-card-grid.browse {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .x8-card-grid.section {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 40px 16px;
  }
  .x8-card-grid.hot .x8-card-poster {
    height: 347.53px;
  }
  .x8-card-grid.section .x8-card-poster {
    height: 300px;
    aspect-ratio: auto;
  }
  .x8-card-grid.section .x8-card-info {
    height: 46px;
    font-size: 14px;
    gap: 6px;
  }
  .x8-card-grid.section .x8-card-info span {
    font-size: 14px;
  }
  .x8-card-grid.section .x8-card-info b {
    font-size: 16px;
  }
  .x8-card-grid.hot .x8-card-info {
    height: 46px;
    font-size: 16px;
    gap: 6px;
  }
  .x8-card-grid.hot .x8-card-info span {
    font-size: 16px;
  }
  .x8-card-grid.hot .x8-card-info b {
    font-size: 18px;
  }
  .x8-card-grid.section .x8-card-bottom b,
  .x8-card-grid.hot .x8-card-bottom b {
    font-size: 18px;
  }
  .x8-rank-card {
    width: 390px;
  }
  .x8-footer-nav {
    width: 390px;
  }
  .x8-page .x8-panel-title,
  .x8-rank-head h3 {
    font-size: 28px;
  }
  .x8-rank-card.static .x8-rank-head h3 {
    font-size: 20px;
  }
  .x8-rank-item {
    height: 44px;
  }
  .x8-rank-item.active {
    height: 100px;
  }
}
@media (max-width: 1399px) {
  .x8-header {
    grid-template-columns: 138px minmax(280px, 1fr) minmax(182px, 300px) auto;
    gap: 18px;
    padding: env(safe-area-inset-top) 32px 0;
  }
  .x8-nav {
    gap: 22px;
  }
  .x8-header-tools {
    gap: 20px;
  }
  .x8-card-grid.hot,
  .x8-card-grid.section,
  .x8-card-grid.browse {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 44px 23px;
  }
  .x8-card-grid.hot .x8-card-poster,
  .x8-card-grid.section .x8-card-poster {
    height: auto;
    aspect-ratio: 100 / 159;
  }
  .x8-section-row {
    display: block;
  }
  .x8-section-row .x8-rank-card {
    display: none;
  }
  .x8-player-video {
    grid-template-columns: minmax(0, 1fr) 360px;
    height: calc((min(1400px, calc(100vw - 80px)) - 360px) * 9 / 16);
  }
  .x8-side-playlist-head .header-title {
    padding: 16px 24px 24px;
    font-size: 20px;
    line-height: 24px;
  }
  .x8-side-playlist-head .header-sections {
    padding: 0 24px;
  }
  .x8-side-playlist-head .sections-left button {
    font-size: 16px;
  }
  .x8-side-episodes {
    gap: 10px;
    padding: 16px 24px;
  }
  .x8-side-episodes button {
    font-size: 14px;
  }
  .x8-video-toolbar {
    height: 64px;
  }
  .x8-video-toolbar button {
    font-size: 13px;
  }
  .x8-video-toolbar svg {
    width: 18px;
    height: 18px;
  }
  .x8-player-title,
  .x8-player-title h1,
  .x8-player-title h2 {
    font-size: 30px;
    line-height: 38px;
  }
  .x8-quick-navigation {
    gap: 24px;
  }
  .x8-footer-nav {
    width: 380px;
  }
}
@media (min-width: 1360px) {
  .x8-rank-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 1830px) {
  .x8-rank-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
@media (max-width: 1350px) {
  .x8-player-video {
    display: block;
    height: auto;
  }
  .x8-player-area {
    aspect-ratio: 16 / 9;
    height: auto;
  }
  .x8-player-video-right {
    display: none;
  }
  .x8-mini-play-list {
    display: block;
  }
}
@media (max-width: 1024px) {
  .x8-header {
    grid-template-columns: auto minmax(0, 1fr) 40px;
    height: calc(96px + env(safe-area-inset-top));
    align-content: start;
    padding: calc(12px + env(safe-area-inset-top)) 18px 0;
    gap: 10px;
  }
  .x8-nav {
    grid-column: 1 / -1;
    order: 4;
    overflow-x: auto;
    gap: 22px;
    padding-bottom: 8px;
    scrollbar-width: none;
  }
  .x8-header-tools {
    display: none;
  }
  .x8-banner {
    padding-top: 70vh;
  }
  .x8-slide-action {
    left: 18px;
    bottom: 36.17px;
    max-width: 80vw;
  }
  .x8-go-title .list-title {
    font-size: 32px;
  }
  .x8-go-title .list-description {
    font-size: 12px !important;
  }
  .x8-banner-dots {
    bottom: 36.17px;
    height: 22px;
    gap: 4px;
    padding: 0 8px;
  }
  .x8-banner-arrow {
    width: 38px;
    height: 38px;
    opacity: 1;
  }
  .x8-banner-arrow.left { left: 14px; }
  .x8-banner-arrow.right { right: 14px; }
  .x8-banner-arrow svg {
    width: 21px;
    height: 21px;
  }
  .x8-panel,
  .x8-page-panel {
    width: calc(100vw - 28px);
  }
  .x8-play {
    width: calc(100vw - 28px);
    padding-top: calc(116px + env(safe-area-inset-top));
  }
  .x8-footer-inner {
    width: calc(100vw - 28px);
  }
  .x8-card-grid.hot,
  .x8-card-grid.section,
  .x8-card-grid.browse {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 24px 14px;
  }
  .x8-card-grid.hot .x8-card-poster,
  .x8-card-grid.section .x8-card-poster {
    aspect-ratio: 100 / 161.91;
  }
  .x8-card:hover .x8-card-poster {
    transform: none;
  }
  .x8-card-hover {
    display: none;
  }
  .x8-trailer-flex {
    flex-direction: column;
    gap: 18px;
  }
  .x8-trailer-player {
    width: 100%;
  }
  .x8-trailer-right {
    min-height: 170px;
    margin: 0;
  }
  .x8-quick-navigation {
    flex-direction: column;
    align-items: center;
    padding-top: 46px;
  }
  .x8-footer-nav {
    width: min(100%, 420px);
  }
  .x8-footer-card .top {
    padding: 0;
  }
  .x8-footer-icon {
    display: none;
  }
  .x8-help-navigation nav {
    gap: 14px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .x8-rank-page {
    padding-top: calc(116px + env(safe-area-inset-top));
  }
  .x8-rank-large-heat {
    font-size: 13px;
  }
}
@media (max-width: 720px) {
  .x8-brand-text b {
    font-size: 13px;
  }
  .x8-brand-text em {
    font-size: 8px;
  }
  .x8-panel {
    margin-bottom: 38px;
  }
  .x8-page .x8-panel-title,
  .x8-rank-head h3 {
    font-size: 24px;
  }
  .x8-rank-card.static .x8-rank-head {
    flex-basis: 58px;
    height: 58px;
    padding: 0 14px;
  }
  .x8-rank-card.static .x8-rank-head h3 {
    font-size: 18px;
  }
  .x8-rank-head p {
    font-size: 12px;
  }
  .x8-card-grid.hot,
  .x8-card-grid.section,
  .x8-card-grid.browse {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px 10px;
  }
  .x8-card-bottom {
    height: 72px;
    padding: 0 8px 10px;
  }
  .x8-card-bottom b,
  .x8-card-info b {
    font-size: 14px;
  }
  .x8-card-info {
    height: 32px;
    font-size: 14px;
    padding: 0 4px;
  }
  .x8-go-title .list-title {
    font-size: 20px;
  }
  .x8-go-title .list-description {
    font-size: 10px !important;
  }
  .x8-banner-dots {
    bottom: 32.81px;
    height: 18px;
    gap: 4px;
  }
  .x8-banner-dots button {
    width: 14px;
    height: 14px;
  }
  .x8-banner-dots span {
    height: 3px;
  }
  .x8-banner-arrow {
    width: 32px;
    height: 32px;
  }
  .x8-banner-arrow.left { left: 10px; }
  .x8-banner-arrow.right { right: 10px; }
  .x8-banner-arrow svg {
    width: 18px;
    height: 18px;
  }
  .x8-trailer-name,
  .x8-trailer-name small {
    font-size: 16px;
  }
  .x8-trailer-content {
    min-height: 410px;
  }
  .x8-watermark b {
    font-size: 26px;
  }
  .x8-trailer-thumbs {
    gap: 6px;
  }
  .x8-rank-grid {
    grid-template-columns: 1fr;
  }
  .x8-rank-card.static {
    height: 846px;
  }
  .x8-rank-large-list {
    padding: 0 8px 14px;
  }
  .x8-rank-large-item.active {
    height: 132px;
  }
  .x8-rank-large-content {
    padding: 9px 8px;
  }
  .x8-rank-large-no {
    flex-basis: 32px;
  }
  .x8-rank-large-item.active .x8-rank-large-center-content {
    height: 108px;
    gap: 8px;
  }
  .x8-rank-large-item.active .x8-rank-large-poster {
    width: 72px;
    height: 108px;
  }
  .x8-rank-large-main {
    gap: 6px;
  }
  .x8-rank-large-main b {
    font-size: 14px;
  }
  .x8-rank-large-tags {
    max-height: 52px;
    overflow: hidden;
  }
  .x8-rank-large-tags em {
    height: 22px;
    padding: 0 6px;
    font-size: 11px;
  }
  .x8-rank-large-heat {
    width: 58px;
    flex-basis: 58px;
    font-size: 12px;
  }
  .x8-rank-large-heat::before {
    width: 10px;
    height: 10px;
  }
  .x8-detail-info {
    flex-direction: column;
  }
  .x8-detail-poster {
    position: relative;
    top: auto;
    width: 180px;
    height: 259px;
    flex-basis: auto;
    margin: 0 0 18px;
  }
  .x8-detail-main {
    height: auto;
    max-height: none;
    overflow: visible;
  }
  .x8-detail-meta h1 {
    white-space: normal;
    font-size: 28px;
  }
  .x8-detail-action-top {
    flex-wrap: wrap;
  }
  .x8-detail-stats {
    flex-wrap: wrap;
    gap: 14px;
  }
  .x8-detail-stats i {
    display: none;
  }
  .x8-player-video {
    margin: 0 -14px;
    border-radius: 0;
    display: block;
    height: auto;
  }
  .x8-player-area {
    aspect-ratio: 16 / 9;
    height: auto;
  }
  .x8-player-video-right {
    display: none;
  }
  .x8-mini-play-list {
    display: block;
  }
  .x8-video-toolbar {
    min-height: 66px;
    height: 66px;
    gap: 5px;
    padding: 6px 10px 8px;
    scrollbar-width: none;
  }
  .x8-video-toolbar::-webkit-scrollbar {
    display: none;
  }
  .x8-control-row {
    justify-content: flex-start;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .x8-control-left,
  .x8-control-right {
    flex: 0 0 auto;
    gap: 6px;
  }
  .x8-video-toolbar button {
    min-width: 30px;
    width: 30px;
    height: 30px;
    border-radius: 0;
  }
  .x8-video-toolbar .x8-lucide,
  .x8-airplay-btn .x8-lucide {
    width: 20px;
    height: 20px;
  }
  .x8-time {
    font-size: 12px;
  }
  .x8-quality-trigger {
    width: auto !important;
    min-width: 54px !important;
    padding: 0 8px;
    gap: 4px;
    font-size: 12px !important;
  }
  .x8-quality-trigger span {
    display: none;
  }
  .x8-settings-menu,
  .x8-quality-menu {
    bottom: 40px;
  }
  .x8-player-title {
    font-size: 24px;
    line-height: 32px;
  }
  .x8-player-title h1,
  .x8-player-title h2 {
    font-size: 24px;
    line-height: 32px;
  }
  .x8-player-title button span,
  .x8-player-title button svg {
    display: none;
  }
  .x8-player-tags {
    width: 100%;
    margin: 12px 0 0;
  }
  .x8-episode-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .x8-float {
    right: 8px;
    gap: 12px;
  }
  .x8-float button {
    width: 36px;
    height: 36px;
  }
  .x8-quick-navigation {
    gap: 26px;
  }
  .x8-footer-card {
    height: auto;
    min-height: 128px;
    padding: 28px 16px;
  }
  .x8-help-navigation nav {
    font-size: 14px;
    gap: 10px;
  }
}
</style>
