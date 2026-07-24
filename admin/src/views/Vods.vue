<template>
  <div class="card">
    <div class="toolbar">
      <div class="filters">
        <el-input v-model="q.kw" placeholder="搜索片名" clearable style="width:180px" @keyup.enter="applyFilters" :prefix-icon="Search" />
        <el-select v-model="q.type" placeholder="全部分类" clearable style="width:140px" @change="applyFilters">
          <el-option v-for="t in types" :key="t.name" :label="`${t.name||'未分类'}(${t.count})`" :value="t.name" />
        </el-select>
        <el-select v-model="q.status" placeholder="全部状态" clearable style="width:120px" @change="applyFilters">
          <el-option label="在线" value="online" />
          <el-option label="下架" value="offline" />
        </el-select>
        <el-select v-model="q.sourceId" placeholder="全部源" clearable filterable style="width:160px" @change="applyFilters">
          <el-option v-for="s in sourceOptions" :key="s.id" :label="`${s.name}${s.enabled ? '' : '（已禁用）'}`" :value="s.id" />
        </el-select>
        <el-select v-model="q.cleanStatus" placeholder="清洗状态" clearable style="width:130px" @change="applyFilters">
          <el-option label="仅看已清洗" value="cleaned" />
          <el-option label="仅看未清洗" value="uncleaned" />
        </el-select>
        <el-button type="primary" @click="applyFilters">查询</el-button>
      </div>
      <div class="actions">
        <el-button type="success" :icon="Plus" @click="kwDlg=true">按片名采集</el-button>
        <el-button type="warning" :icon="MagicStick" @click="metaBatch">
          元数据匹配<span v-if="mstat.none || mstat.pending" style="margin-left:2px">（{{ mstat.none }} 待匹 / {{ mstat.pending || 0 }} 待确认）</span>
        </el-button>
        <el-button :icon="CollectionTag" @click="backfillSubs">补全小类</el-button>
        <el-button type="danger" plain @click="openCleanup">影片管理</el-button>
        <el-button type="primary" plain @click="openPlaybackDiagnose">播放诊断</el-button>
        <span class="vod-count">去重后 {{ total }} 部</span>
      </div>
    </div>

    <!-- 按片名采集（两步：搜索预览 → 勾选确认） -->
    <el-dialog v-model="kwDlg" title="按片名采集" width="640" @close="resetKwDlg">
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <el-input v-model="kwInput" placeholder="输入片名，如：龙珠、师兄啊师兄" clearable @keyup.enter="searchKeyword" :disabled="kwSearching" />
        <el-button type="primary" :loading="kwSearching" @click="searchKeyword">搜索</el-button>
      </div>

      <div v-if="kwSearching" style="text-align:center;color:var(--text-3);padding:30px 0">正在遍历所有采集源搜索…</div>

      <template v-else-if="kwCandidates.length">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:13px;color:var(--text-3)">共找到 {{ kwCandidates.length }} 个候选，选中后只采集所选项</span>
          <div>
            <el-button size="small" link @click="kwChecked = kwCandidates.map(c=>c.fingerprint)">全选</el-button>
            <el-button size="small" link @click="kwChecked = []">清空</el-button>
          </div>
        </div>
        <el-checkbox-group v-model="kwChecked" style="max-height:360px;overflow-y:auto;display:block">
          <div v-for="c in kwCandidates" :key="c.fingerprint"
            style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
            <el-checkbox :value="c.fingerprint" style="flex:1;min-width:0">
              <span style="font-weight:600">{{ c.name }}</span>
              <span v-if="c.year" style="color:var(--text-3);margin-left:6px">({{ c.year }})</span>
            </el-checkbox>
            <div style="flex-shrink:0;display:flex;gap:6px;align-items:center">
              <el-tag size="small" type="success">{{ c.sources.length }} 个源</el-tag>
              <el-tooltip :content="c.sources.map(s=>s.sourceName+' x'+s.hits).join('\n')" placement="top">
                <span style="font-size:12px;color:var(--text-3);cursor:help">详情</span>
              </el-tooltip>
            </div>
          </div>
        </el-checkbox-group>
      </template>

      <div v-else-if="kwSearched" style="text-align:center;color:var(--text-3);padding:30px 0">没有搜到相关影片</div>
      <el-alert v-else type="info" :closable="false"
        title="输入片名先搜索预览，按片名+年份分组展示命中源数，选中后再采集，不会误采不相关的同名片。" />

      <el-divider content-position="left">采集后动作</el-divider>
      <div class="kw-post-actions">
        <el-checkbox v-model="kwOptions.metaAfterCollect">采集后元数据匹配</el-checkbox>
        <el-checkbox v-model="kwOptions.cleanAfterCollect">采集后HLS清洗</el-checkbox>
      </div>

      <template #footer>
        <el-button @click="kwDlg=false">取消</el-button>
        <el-button type="primary" :disabled="!kwChecked.length" :loading="kwSubmitting" @click="confirmKeyword">
          采集选中项（{{ kwChecked.length }}）
        </el-button>
      </template>
    </el-dialog>

    <div v-if="selected.length" class="batch-bar">
      <span>已选 {{ selected.length }} 项</span>
      <el-button size="small" type="primary" plain @click="batchMetaMatch">批量匹配元数据</el-button>
      <el-button size="small" type="primary" :disabled="selected.length < 2" @click="openMergeDlg">合并片源</el-button>
      <el-button size="small" @click="openCleanAdsDialog('batch')" :icon="VideoPlay">清洗广告</el-button>
      <el-button size="small" type="warning" @click="batchAction('offline')">批量下架</el-button>
      <el-button size="small" type="success" @click="batchAction('online')">批量上架</el-button>
      <el-button size="small" type="danger" @click="batchAction('delete')">批量删除</el-button>
      <el-button size="small" link @click="tableRef?.clearSelection()">取消选择</el-button>
    </div>

    <el-table ref="tableRef" :data="list" v-loading="loading" stripe @row-click="openDetail" @selection-change="v => selected = v">
      <el-table-column type="selection" width="42" @click.stop />
      <el-table-column label="封面" width="70">
        <template #default="{ row }">
          <el-image v-if="row.officialPic || row.pic || row.localPic" :src="coverUrl(row)" fit="cover" style="width:44px;height:60px;border-radius:4px" lazy @error="fallbackCover(row)">
            <template #error><div class="noimg">无图</div></template>
          </el-image>
          <div v-else class="noimg">无图</div>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="片名" min-width="180">
        <template #default="{ row }">
          <span style="font-weight:600">{{ row.name }}</span>
          <el-tag v-if="row.pinned" size="small" type="warning" style="margin-left:6px">置顶</el-tag>
          <el-tag v-if="row.archiveStatus==='done'" size="small" type="success" style="margin-left:6px" :title="`已转存 ${row.archiveEps||0}集 / ${row.archiveRes||'?'}P / ${row.archiveSize||0}MB`">已下载{{ row.archiveRes?('·'+row.archiveRes+'P'):'' }}</el-tag>
          <el-tag v-else-if="row.archiveStatus==='running'" size="small" style="margin-left:6px">转存中</el-tag>
          <el-tag v-else-if="row.archiveStatus==='pending'" size="small" type="info" style="margin-left:6px">待转存</el-tag>
          <el-tag v-else-if="row.archiveStatus==='failed'" size="small" type="danger" style="margin-left:6px">转存失败</el-tag>
          <el-tag v-if="row.hasCleanResult" size="small" type="success" effect="dark" style="margin-left:6px" :title="cleanTagTitle(row)">
            {{ cleanTagText(row) }}
          </el-tag>
          <div v-if="aliasNamesText(row)" class="alias-line">别名：{{ aliasNamesText(row) }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="year" label="年份" width="70" />
      <el-table-column prop="typeName" label="分类" width="110">
        <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.typeName || '未分类' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="线路数" width="80">
        <template #default="{ row }"><el-tag type="success" size="small">{{ row._count.plays }} 条</el-tag></template>
      </el-table-column>
      <el-table-column label="元数据评分" width="110">
        <template #default="{ row }">
          <span v-if="row.rating" class="rating"><el-icon><StarFilled /></el-icon>{{ row.rating }}</span>
          <el-tag v-else-if="row.metaMatched==='pending'" size="small" type="warning">待确认 {{ row.metaScore || '' }}</el-tag>
          <el-tag v-else-if="row.metaMatched==='failed'" size="small" type="info">{{ failedMetaLabel(row) }}</el-tag>
          <span v-else style="color:#c0c4cc">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="remarks" label="更新状态" width="110" show-overflow-tooltip />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status==='online'?'success':'info'" size="small">{{ row.status==='online'?'在线':'下架' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="132" fixed="right" align="center">
        <template #default="{ row }">
          <div class="vod-actions">
            <el-button size="small" @click.stop="openDetail(row)">线路</el-button>
            <el-dropdown trigger="click" @visible-change="visible => noteVodMenuVisibility(row, visible)"
              @command="cmd => handleVodCommand(cmd, row)" @click.stop>
              <el-button size="small" plain :icon="MoreFilled" @click.stop />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">编辑资料</el-dropdown-item>
                  <el-dropdown-item command="refresh" :disabled="row._refreshing">采集更新</el-dropdown-item>
                  <el-dropdown-item command="clean">清洗广告</el-dropdown-item>
                  <el-dropdown-item v-if="row.hasArchivable" command="archive" divided>{{ ['done','running','pending'].includes(row.archiveStatus) ? '重新转存' : '转存到本地' }}</el-dropdown-item>
                  <el-dropdown-item v-if="row.hasArchivable && row.archiveStatus && !['none','off'].includes(row.archiveStatus)" command="unarchive">取消/删除转存</el-dropdown-item>
                  <el-dropdown-item command="status" divided>{{ row.status==='online'?'下架':'上架' }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination class="pager" background layout="total, prev, pager, next, sizes"
      :total="total" :page-size="q.size" :current-page="q.page" :page-sizes="[20,50,100]"
      @current-change="p=>{q.page=p;load()}" @size-change="s=>{q.size=s;q.page=1;load()}" />
  </div>

  <!-- 影片线路详情 -->
  <el-drawer v-model="drawer" :title="cur.name" size="620">
    <div v-if="cur.id">
      <div class="detail-head">
        <el-image v-if="cur.officialPic || cur.pic || cur.localPic" :src="coverUrl(cur)" fit="cover" style="width:110px;height:150px;border-radius:8px" @error="fallbackCover(cur)" />
        <div class="meta">
          <p><b>年份:</b> {{ cur.year || '—' }} · <b>分类:</b> {{ cur.typeName || '—' }}</p>
          <p><b>地区:</b> {{ cur.area || '—' }} · <b>语言:</b> {{ cur.lang || '—' }}</p>
          <p><b>主演:</b> <span class="ellip">{{ cur.actor || '—' }}</span></p>
          <p v-if="aliasNamesText(cur)"><b>别名:</b> <span class="ellip">{{ aliasNamesText(cur) }}</span></p>
          <p><b>指纹:</b> <code>{{ cur.fingerprint }}</code></p>
          <p><b>更新:</b> {{ cur.remarks }}</p>
          <p v-if="cur.heroPic"><b>首页图:</b> 已设置</p>
          <p>
            <b>元数据:</b>
            <el-tag v-if="rowProvider(cur)" size="small" effect="plain" style="margin-right:6px">{{ providerLabel(rowProvider(cur)) }}</el-tag>
            <span v-if="cur.rating" class="rating"><el-icon><StarFilled /></el-icon>{{ cur.rating }}</span>
            <el-tag v-else-if="cur.metaMatched==='pending'" size="small" type="warning">待确认 {{ cur.metaScore || '' }}</el-tag>
            <span v-else style="color:var(--text-3)">{{ cur.metaMatched==='failed' ? failedMetaLabel(cur) : '未匹配' }}</span>
            <el-button size="small" text type="primary" @click="matchOne(cur.id)">
              {{ cur.rating ? '重新匹配' : '匹配元数据' }}
            </el-button>
            <a v-if="cur.doubanId" :href="`https://movie.douban.com/subject/${cur.doubanId}/`" target="_blank"
              style="font-size:12px;color:var(--el-color-primary)">查看豆瓣页 ↗</a>
            <a v-if="metadataUrl(cur)" :href="metadataUrl(cur)" target="_blank"
              style="font-size:12px;color:var(--el-color-primary)">查看{{ providerLabel(rowProvider(cur)) }}页 ↗</a>
          </p>
          <p v-if="cur.matchedTitle || cur.metaScore">
            <b>置信:</b> {{ cur.metaScore || 0 }}<span v-if="cur.matchedTitle"> · {{ cur.matchedTitle }} {{ cur.matchedYear ? '(' + cur.matchedYear + ')' : '' }}</span>
          </p>
          <p v-if="cur.genres"><b>元数据类型:</b> {{ cur.genres }}</p>
          <p>
            <b>自动采集:</b>
            <el-tag size="small" :type="cur.autoCollectEnabled ? 'success' : 'info'">
              {{ autoCollectSummary(cur) }}
            </el-tag>
            <span v-if="cur.autoCollectNextAt" class="muted"> 下次 {{ formatDate(cur.autoCollectNextAt) }}</span>
          </p>
        </div>
      </div>
      <div v-if="pendingCandidates(cur).length" class="meta-candidates">
        <div class="cand-title">低置信候选 · 请人工确认</div>
        <div v-for="c in pendingCandidates(cur)" :key="c.id" class="cand-item">
          <div class="cand-main">
            <el-image v-if="c.img" :src="imgUrl(c.img)" fit="cover" class="cand-img" />
            <div class="cand-info">
              <div><b>{{ c.title }}</b><span v-if="c.year" class="cand-year">({{ c.year }})</span></div>
              <div class="cand-sub">{{ c.subTitle || c.type || '—' }}</div>
              <div class="cand-sub">分数 {{ c.score }} · {{ reasonText(c.reasons) }}</div>
            </div>
          </div>
          <div class="cand-actions">
            <el-button size="small" type="primary" @click="confirmMeta(cur.id, c)">确认此项</el-button>
            <a v-if="candidateUrl(c)" :href="candidateUrl(c)" target="_blank">打开</a>
          </div>
        </div>
      </div>
      <p class="blurb" v-if="cur.officialIntro" style="border-left:3px solid #409eff;padding-left:10px">
        <b style="color:var(--el-color-primary)">元数据简介:</b> {{ cur.officialIntro }}
      </p>
      <div v-if="cur.people?.length" class="asset-box">
        <div class="asset-title">人物资产</div>
        <el-tag v-for="p in cur.people" :key="p.id" size="small" effect="plain" style="margin:0 6px 6px 0">
          {{ p.role === 'director' ? '导演' : '演员' }} · {{ p.person.name }}
        </el-tag>
      </div>
      <div v-if="cur.images?.length" class="asset-box">
        <div class="asset-title">
          图片资产
          <span>封面=影片列表/详情竖图；首页横图=首页 Hero/预告等横版展示图</span>
        </div>
        <div class="asset-imgs">
          <div v-for="img in cur.images.slice(0, 18)" :key="img.id" class="asset-img-card">
            <el-image :src="imgUrl(img.url)" fit="cover" class="asset-img">
              <template #error><div class="noimg">无图</div></template>
            </el-image>
            <div class="asset-img-actions">
              <el-button size="small" link type="primary" @click="setVodImage(cur, img, 'cover')">用作封面</el-button>
              <el-button size="small" link type="primary" @click="setVodImage(cur, img, 'hero')">用作首页横图</el-button>
              <el-button size="small" link type="danger" @click="deleteVodImage(cur, img)">删除</el-button>
            </div>
          </div>
        </div>
      </div>
      <p class="blurb" v-if="cur.blurb">{{ cur.blurb }}</p>

      <div style="display:flex;gap:10px;margin:8px 0 4px">
        <el-button type="primary" plain :icon="EditPen" @click="openEdit(cur)">编辑资料</el-button>
        <el-button type="success" plain :icon="Refresh" :loading="refreshing" @click="refreshOne(cur)">采集更新（刷新剧集）</el-button>
        <el-button :type="cur.pinned?'warning':'default'" plain @click="togglePin(cur)">{{ cur.pinned?'取消置顶':'置顶' }}</el-button>
      </div>
      <div class="sec-title" style="margin:16px 0 10px">播放线路 · {{ cur.lines?.length }} 条(按源优先级)</div>
      <el-collapse v-model="active">
        <el-collapse-item v-for="l in cur.lines" :key="l.id" :name="String(l.id)">
          <template #title>
            <el-tag size="small" type="success">{{ l.sourceName }}</el-tag>
            <span style="margin:0 10px">flag={{ l.flag }}</span>
            <span style="color:var(--text-3)">{{ l.epCount }} 集</span>
            <span style="margin-left:10px;color:#64748b">健康 {{ l.score ?? 0 }} · 成功 {{ l.playSuccessCount || 0 }} / 失败 {{ l.playFailureCount || 0 }}</span>
            <el-button size="small" link type="primary" class="line-title-action" @click.stop="diagnoseFirstEpisode(l)">诊断第1集</el-button>
          </template>
          <div v-for="ch in lineChannels(l)" :key="ch.id || ch.flag" class="line-channel">
            <div v-if="lineChannels(l).length > 1" class="line-channel-title">
              <b>{{ ch.sourceName || l.sourceName }}</b>
              <span>flag={{ ch.flag }} · {{ ch.epCount || ch.episodes?.length || 0 }} 集 · 健康 {{ ch.score ?? 0 }}</span>
              <el-button size="small" link type="primary" @click="diagnoseFirstEpisode(ch)">诊断第1集</el-button>
            </div>
            <div class="line-health">
              <span>平均 {{ ch.avgResponseMs || ch.checkMs || 0 }}ms</span>
              <span>最近成功 {{ fmtDate(ch.lastSuccessAt) || '—' }}</span>
              <span>最近失败 {{ fmtDate(ch.lastFailureAt) || '—' }}</span>
              <span v-if="ch.healthReason">原因 {{ ch.healthReason }}</span>
            </div>
            <div class="eps">
              <span v-for="(e,i) in visibleEpisodes(ch)" :key="i" class="ep-wrap">
                <el-tag size="small" effect="plain" class="ep" @click="copy(e.url)" :title="e.url">{{ e.name }}</el-tag>
                <el-button size="small" link type="primary" @click="diagnoseEp(ch, e, i)">诊断</el-button>
              </span>
              <div v-if="(ch.episodes?.length || 0)>60" class="episode-more">
                <span>共 {{ ch.episodes.length }} 集</span>
                <el-button size="small" link type="primary" @click="toggleEpisodes(ch)">
                  {{ isEpisodesExpanded(ch) ? '收起' : '展开全部' }}
                </el-button>
              </div>
              <el-empty v-if="!ch.episodes?.length" description="该线路暂无集数数据" :image-size="48" />
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </el-drawer>

  <el-dialog v-model="mergeDlg" title="合并片源" width="620">
    <el-alert type="warning" :closable="false" show-icon
      title="合并会把其他影片的播放线路、追剧、观看历史、人物和图片资产移动到主影片，并记录旧指纹，后续采集会继续归并到主影片。" />
    <div class="merge-list">
      <label v-for="row in selected" :key="row.id" class="merge-item" :class="{on: mergeTargetId === row.id}">
        <el-radio v-model="mergeTargetId" :value="row.id" />
        <el-image v-if="row.officialPic || row.pic || row.localPic" :src="coverUrl(row)" fit="cover" class="merge-cover">
          <template #error><div class="noimg">无图</div></template>
        </el-image>
        <div class="merge-info">
          <b>{{ row.name }}</b>
          <span>{{ row.year || '—' }} · {{ row.typeName || '未分类' }} · {{ row._count?.plays || 0 }} 条线路</span>
          <code>{{ row.fingerprint }}</code>
        </div>
      </label>
    </div>
    <template #footer>
      <el-button @click="mergeDlg=false">取消</el-button>
      <el-button type="primary" :disabled="selected.length < 2 || !mergeTargetId" :loading="mergeSaving" @click="confirmMerge">
        合并到选中主影片
      </el-button>
    </template>
  </el-dialog>

  <!-- 编辑影片资料 -->
  <el-dialog v-model="editDlg" title="编辑影片资料" width="600">
    <el-form :model="editForm" label-width="80px">
      <el-form-item label="片名" required>
        <el-input v-model="editForm.name" />
      </el-form-item>
      <el-form-item label="别名">
        <el-input v-model="editForm.aliasesText" type="textarea" :rows="2" placeholder="多个别名用逗号或换行分隔" />
      </el-form-item>
      <div style="display:flex;gap:12px">
        <el-form-item label="年份" style="flex:1"><el-input v-model="editForm.year" /></el-form-item>
        <el-form-item label="分类" style="flex:1"><el-input v-model="editForm.typeName" /></el-form-item>
      </div>
      <div style="display:flex;gap:12px">
        <el-form-item label="地区" style="flex:1"><el-input v-model="editForm.area" /></el-form-item>
        <el-form-item label="语言" style="flex:1"><el-input v-model="editForm.lang" /></el-form-item>
      </div>
      <el-form-item label="主演"><el-input v-model="editForm.actor" /></el-form-item>
      <el-form-item label="导演"><el-input v-model="editForm.director" /></el-form-item>
      <div style="display:flex;gap:12px">
        <el-form-item label="更新状态" style="flex:1"><el-input v-model="editForm.remarks" placeholder="如：更新至20集" /></el-form-item>
        <el-form-item label="元数据评分" style="flex:1"><el-input v-model="editForm.rating" placeholder="如 8.5，空=无" /></el-form-item>
      </div>
      <el-form-item label="当前封面">
        <el-input v-model="editForm.officialPic" placeholder="优先展示封面 URL">
          <template #append><el-image v-if="editForm.officialPic" :src="imgUrl(editForm.officialPic)" style="width:28px;height:38px" fit="cover" /></template>
        </el-input>
      </el-form-item>
      <el-form-item label="采集封面">
        <el-input v-model="editForm.pic" placeholder="封面 URL">
          <template #append><el-image v-if="editForm.pic" :src="imgUrl(editForm.pic)" style="width:28px;height:38px" fit="cover" /></template>
        </el-input>
      </el-form-item>
      <el-form-item v-if="editForm.images?.length" label="可选封面">
        <div class="edit-image-picker">
          <button v-for="img in posterImages(editForm.images)" :key="img.id || img.url" type="button" class="edit-image-option"
            :class="{on: editForm.officialPic === img.url}" @click="editForm.officialPic = img.url">
            <img :src="imgUrl(img.url)" alt="" />
          </button>
        </div>
      </el-form-item>
      <el-form-item label="首页图">
        <el-input v-model="editForm.heroPic" placeholder="横版剧照/背景图 URL，首页 Hero 优先使用">
          <template #append><el-image v-if="editForm.heroPic" :src="imgUrl(editForm.heroPic)" style="width:48px;height:28px" fit="cover" /></template>
        </el-input>
      </el-form-item>
      <el-form-item v-if="editForm.images?.length" label="可选首页图">
        <div class="edit-image-picker wide">
          <button v-for="img in heroImages(editForm.images)" :key="img.id || img.url" type="button" class="edit-image-option wide"
            :class="{on: editForm.heroPic === img.url}" @click="editForm.heroPic = img.url">
            <img :src="imgUrl(img.url)" alt="" />
          </button>
        </div>
      </el-form-item>
      <el-divider content-position="left">自动采集</el-divider>
      <el-form-item label="周期采集">
        <el-switch v-model="editForm.autoCollectEnabled" inline-prompt active-text="开启" inactive-text="关闭" />
      </el-form-item>
      <el-form-item v-if="editForm.autoCollectEnabled" label="采集周期">
        <div class="auto-collect-row">
          <el-radio-group v-model="editForm.autoCollectMode">
            <el-radio-button label="days">按天</el-radio-button>
            <el-radio-button label="weekdays">固定周几</el-radio-button>
          </el-radio-group>
          <template v-if="editForm.autoCollectMode === 'days'">
            <el-input-number v-model="editForm.autoCollectIntervalDays" :min="1" :max="30" controls-position="right" />
            <span class="muted">天/次</span>
          </template>
          <el-checkbox-group v-else v-model="editForm.autoCollectWeekdays" class="weekday-group">
            <el-checkbox-button v-for="day in weekdayOptions" :key="day.value" :label="day.value">{{ day.label }}</el-checkbox-button>
          </el-checkbox-group>
          <el-checkbox v-model="editForm.autoCollectMeta">同步元数据</el-checkbox>
          <el-checkbox v-model="editForm.autoCollectClean">提交HLS清洗</el-checkbox>
        </div>
      </el-form-item>
      <el-divider content-position="left">片头片尾</el-divider>
      <el-form-item label="跳过策略">
        <el-select v-model="editForm.skipMode" style="width:180px">
          <el-option label="继承全局" value="inherit" />
          <el-option label="本片开启" value="enabled" />
          <el-option label="本片关闭" value="disabled" />
        </el-select>
        <span class="muted">只影响这部影片，用户自己的设置仍优先。</span>
      </el-form-item>
      <div class="skip-config-row">
        <el-form-item label="片头秒数">
          <el-input-number v-model="editForm.skipIntroSeconds" :min="0" :max="600" :step="5" controls-position="right" />
          <el-checkbox v-model="editForm.skipIntroInherit">继承</el-checkbox>
        </el-form-item>
        <el-form-item label="片尾秒数">
          <el-input-number v-model="editForm.skipOutroSeconds" :min="0" :max="600" :step="5" controls-position="right" />
          <el-checkbox v-model="editForm.skipOutroInherit">继承</el-checkbox>
        </el-form-item>
      </div>
      <el-form-item label="简介"><el-input v-model="editForm.blurb" type="textarea" :rows="3" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="editDlg=false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="cleanupDlg" title="影片管理" width="820">
    <el-form :model="cleanupForm" label-width="100px">
      <el-form-item label="筛选规则">
        <el-select v-model="cleanupForm.rule" style="width:260px" @change="resetCleanupPreview">
          <el-option label="已上架影片" value="online" />
          <el-option label="已下架影片" value="offline" />
          <el-option label="没有任何播放线路" value="empty_plays" />
          <el-option label="全部线路失效" value="all_dead" />
          <el-option label="只剩禁用源线路" value="disabled_source_only" />
          <el-option label="下架超过 N 天" value="offline_old" />
          <el-option label="按源清退线路" value="source_lines" />
          <el-option label="按分类/子分类筛选" value="category_vods" />
          <el-option label="无任何封面" value="no_cover" />
          <el-option label="无元数据封面" value="no_official_pic" />
          <el-option label="无横图/Hero图" value="no_hero_pic" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="cleanupForm.rule === 'source_lines'" label="采集源">
        <el-select v-model="cleanupForm.sourceId" filterable style="width:260px" @change="resetCleanupPreview">
          <el-option v-for="s in sourceOptions" :key="s.id" :label="`${s.name}${s.enabled ? '' : '（已禁用）'}`" :value="s.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="主分类">
        <el-select v-model="cleanupForm.categoryNames" multiple collapse-tags collapse-tags-tooltip clearable filterable placeholder="全部主分类" style="width:360px" @change="onCleanupCategoryChange">
          <el-option v-for="t in types" :key="t.name" :label="`${t.name || '未分类'}(${t.count || 0})`" :value="t.name" />
        </el-select>
      </el-form-item>
      <el-form-item label="子分类">
        <el-select v-model="cleanupForm.subType" clearable filterable
          :disabled="cleanupSelectedCategoryNames.length !== 1"
          :loading="cleanupSubtypesLoading"
          :placeholder="cleanupSubtypesPlaceholder"
          style="width:260px" @change="resetCleanupPreview">
          <el-option v-for="t in cleanupSubtypes" :key="t.name" :label="`${t.name || '未分类'}(${t.count || 0})`" :value="t.name" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="cleanupForm.rule === 'offline_old'" label="下架天数">
        <el-input-number v-model="cleanupForm.days" :min="1" :max="3650" />
      </el-form-item>
      <el-form-item label="年份筛选">
        <div class="year-filter">
          <el-select v-model="cleanupForm.yearMode" placeholder="不限" style="width:120px" @change="resetCleanupPreview">
            <el-option label="不限" value="" />
            <el-option label="等于" value="eq" />
            <el-option label="大于" value="gt" />
            <el-option label="大于等于" value="gte" />
            <el-option label="小于" value="lt" />
            <el-option label="小于等于" value="lte" />
            <el-option label="区间" value="range" />
          </el-select>
          <template v-if="cleanupForm.yearMode && cleanupForm.yearMode !== 'range'">
            <el-input-number v-model="cleanupForm.year" :min="1900" :max="2100" controls-position="right" @change="resetCleanupPreview" />
          </template>
          <template v-else-if="cleanupForm.yearMode === 'range'">
            <el-input-number v-model="cleanupForm.yearStart" :min="1900" :max="2100" controls-position="right" @change="resetCleanupPreview" />
            <span class="muted">至</span>
            <el-input-number v-model="cleanupForm.yearEnd" :min="1900" :max="2100" controls-position="right" @change="resetCleanupPreview" />
          </template>
          <span v-else class="muted">不过滤年份</span>
        </div>
      </el-form-item>
      <el-form-item label="执行上限">
        <el-input-number v-model="cleanupForm.limit" :min="1" :max="5000" />
      </el-form-item>
      <el-form-item v-if="cleanupForm.rule === 'source_lines'" label="孤片处理">
        <el-checkbox v-model="cleanupForm.deleteOrphans">清退线路后，顺手删除无线路影片</el-checkbox>
      </el-form-item>
    </el-form>
    <div class="cleanup-actions">
      <el-button type="primary" plain :loading="cleanupLoading" @click="previewCleanup">预检</el-button>
      <el-button v-if="cleanupForm.rule === 'source_lines'" type="warning" :disabled="!cleanupCanExecute" :loading="cleanupLoading" @click="executeCleanup('delete_lines')">清退选中线路</el-button>
      <el-button type="success" plain :disabled="!cleanupCanExecute" :loading="cleanupLoading" @click="executeCleanup('online')">上架选中</el-button>
      <el-button type="warning" plain :disabled="!cleanupCanExecute" :loading="cleanupLoading" @click="executeCleanup('offline')">下架选中</el-button>
      <el-button type="danger" :disabled="!cleanupCanExecute" :loading="cleanupLoading" @click="executeCleanup('delete')">删除选中</el-button>
    </div>
    <el-alert v-if="cleanupPreview" type="warning" :closable="false" show-icon
      :title="cleanupPreview.mode === 'delete_lines'
        ? `筛出 ${cleanupPreview.playCount || 0} 条线路，涉及 ${cleanupPreviewTotal} 部影片，已选 ${cleanupSelectedIds.length} 部`
        : `筛出 ${cleanupPreviewTotal} 部影片，已选 ${cleanupSelectedIds.length} 部`" />
    <div v-if="cleanupPreview?.samples?.length" class="cleanup-preview-head">
      <span>先勾选需要操作的影片，再执行删除、下架或上架。</span>
      <el-button v-if="cleanupSelectedRows.length" size="small" link type="primary" @click="clearCleanupSelection">清空选择</el-button>
    </div>
    <el-table v-if="cleanupVisibleSamples.length" ref="cleanupTableRef" :data="cleanupVisibleSamples" size="small" style="margin-top:8px" max-height="320" @selection-change="rows => cleanupSelectedRows = rows">
      <el-table-column type="selection" width="42" />
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="片名" min-width="180" />
      <el-table-column prop="year" label="年份" width="80" />
      <el-table-column prop="typeName" label="分类" width="100" />
      <el-table-column prop="subType" label="子分类" width="110" />
      <el-table-column label="线路" width="80">
        <template #default="{ row }">{{ row._count?.plays || 0 }}</template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">{{ row.status === 'online' ? '在线' : '下架' }}</template>
      </el-table-column>
    </el-table>
    <el-empty v-else-if="cleanupPreview?.samples?.length" description="暂无可选候选" :image-size="64" />
  </el-dialog>

  <el-dialog v-model="playbackDiagnoseDlg" title="播放链接诊断 / 死链治理" width="880">
    <el-form :model="playbackDiagnoseForm" label-width="92px">
      <div class="play-diagnose-grid">
        <el-form-item label="片名/演员">
          <el-input v-model="playbackDiagnoseForm.kw" clearable placeholder="片名 / 演员 / 别名" @change="resetPlaybackDiagnose" />
        </el-form-item>
        <el-form-item label="影片ID">
          <el-input-number v-model="playbackDiagnoseForm.vodId" :min="0" controls-position="right" @change="resetPlaybackDiagnose" />
        </el-form-item>
        <el-form-item label="主分类">
          <el-select v-model="playbackDiagnoseForm.categoryNames" multiple collapse-tags collapse-tags-tooltip clearable filterable placeholder="全部主分类" @change="onPlaybackDiagnoseCategoryChange">
            <el-option v-for="t in types" :key="t.name" :label="`${t.name || '未分类'}(${t.count || 0})`" :value="t.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="子分类">
          <el-select v-model="playbackDiagnoseForm.subType" clearable filterable
            :disabled="playbackDiagnoseCategoryNames.length !== 1"
            :loading="cleanupSubtypesLoading"
            :placeholder="playbackDiagnoseSubtypesPlaceholder"
            @change="resetPlaybackDiagnose">
            <el-option v-for="t in cleanupSubtypes" :key="t.name" :label="`${t.name || '未分类'}(${t.count || 0})`" :value="t.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="采集源">
          <el-select v-model="playbackDiagnoseForm.sourceId" clearable filterable placeholder="全部源" @change="resetPlaybackDiagnose">
            <el-option v-for="s in sourceOptions" :key="s.id" :label="`${s.name}${s.enabled ? '' : '（已禁用）'}`" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="影片状态">
          <el-select v-model="playbackDiagnoseForm.status" clearable placeholder="全部状态" @change="resetPlaybackDiagnose">
            <el-option label="在线" value="online" />
            <el-option label="下架" value="offline" />
          </el-select>
        </el-form-item>
        <el-form-item label="线路健康">
          <el-select v-model="playbackDiagnoseForm.lineHealth" clearable placeholder="全部线路" @change="resetPlaybackDiagnose">
            <el-option label="仅失效" value="dead" />
            <el-option label="仅可用" value="alive" />
          </el-select>
        </el-form-item>
        <el-form-item label="清洗状态">
          <el-select v-model="playbackDiagnoseForm.cleanStatus" clearable placeholder="全部" @change="resetPlaybackDiagnose">
            <el-option label="已清洗" value="cleaned" />
            <el-option label="未清洗" value="uncleaned" />
          </el-select>
        </el-form-item>
        <el-form-item label="执行上限">
          <el-input-number v-model="playbackDiagnoseForm.limit" :min="1" :max="100" controls-position="right" @change="resetPlaybackDiagnose" />
        </el-form-item>
        <el-form-item label="回写健康">
          <el-switch v-model="playbackDiagnoseForm.markHealth" inline-prompt active-text="回写" inactive-text="只看" />
        </el-form-item>
      </div>
    </el-form>
    <div class="diagnose-actions">
      <el-button type="primary" plain :loading="playbackDiagnoseLoading" @click="previewPlaybackDiagnose">预检</el-button>
      <el-button type="danger" :disabled="!playbackDiagnosePreview?.playCount" :loading="playbackDiagnoseLoading" @click="executePlaybackDiagnose">执行诊断</el-button>
    </div>
    <el-alert v-if="playbackDiagnosePreview" class="diagnose-summary" type="warning" :closable="false" show-icon
      :title="`命中 ${playbackDiagnosePreview.playCount || 0} 条线路，涉及 ${playbackDiagnosePreview.vodCount || 0} 部影片，本次最多处理 ${playbackDiagnosePreview.limit || playbackDiagnoseForm.limit} 条`" />
    <el-table v-if="playbackDiagnosePreview?.samples?.length" :data="playbackDiagnosePreview.samples" size="small" max-height="260">
      <el-table-column prop="vodId" label="影片ID" width="78" />
      <el-table-column prop="vodName" label="片名" min-width="170" show-overflow-tooltip />
      <el-table-column prop="typeName" label="分类" width="92" show-overflow-tooltip />
      <el-table-column prop="subType" label="子分类" width="100" show-overflow-tooltip />
      <el-table-column prop="sourceName" label="源" width="120" show-overflow-tooltip />
      <el-table-column prop="flag" label="flag" width="90" show-overflow-tooltip />
      <el-table-column label="健康" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="row.alive ? 'success' : 'danger'">{{ row.alive ? '可用' : '失效' }}</el-tag>
          <span class="muted"> {{ row.score ?? 0 }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="healthReason" label="原因" min-width="160" show-overflow-tooltip />
    </el-table>
    <template v-if="playbackDiagnoseResult">
      <div class="diagnose-result-summary">
        <el-tag type="success">可播 {{ playbackDiagnoseResult.playable || 0 }}</el-tag>
        <el-tag type="danger">失败 {{ playbackDiagnoseResult.failed || 0 }}</el-tag>
        <el-tag type="info">{{ playbackDiagnoseResult.markHealth ? '已回写健康' : '未回写' }}</el-tag>
      </div>
      <el-table :data="playbackDiagnoseResult.results || []" size="small" max-height="340">
        <el-table-column label="状态" width="70">
          <template #default="{ row }"><el-tag size="small" :type="row.ok ? 'success' : 'danger'">{{ row.ok ? '可播' : '失败' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="vodName" label="片名" min-width="150" show-overflow-tooltip />
        <el-table-column prop="sourceName" label="源" width="110" show-overflow-tooltip />
        <el-table-column prop="flag" label="flag" width="82" show-overflow-tooltip />
        <el-table-column prop="epName" label="集数" width="90" show-overflow-tooltip />
        <el-table-column prop="summary" label="诊断结果" min-width="220" show-overflow-tooltip />
        <el-table-column label="地址" width="92" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.url" size="small" link type="primary" @click="copy(row.url)">复制</el-button>
            <el-button v-if="row.url" size="small" link type="primary" @click="openUrl(row.url)">打开</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>
  </el-dialog>

  <el-dialog v-model="diagOpen" title="线路播放诊断" width="720">
    <div v-if="diag.line" class="diag-head">
      <div>
        <b>{{ cur.name }}</b>
        <span>{{ diag.line.sourceName }} · {{ diag.ep?.name || `第 ${diag.epIndex + 1} 集` }}</span>
      </div>
      <el-tag :type="diagStatusType">{{ diagStatusText }}</el-tag>
    </div>
    <el-descriptions :column="1" border size="small">
      <el-descriptions-item label="线路ID">{{ diag.line?.id || '—' }}</el-descriptions-item>
      <el-descriptions-item label="线路标识">{{ diag.line?.flag || '—' }}</el-descriptions-item>
      <el-descriptions-item label="原始地址">
        <div class="diag-url">
          <code>{{ diag.ep?.url || '—' }}</code>
          <el-button size="small" link type="primary" @click="copy(diag.ep?.url)">复制</el-button>
        </div>
      </el-descriptions-item>
      <el-descriptions-item label="解析规则">{{ diag.result?.rule || '—' }}</el-descriptions-item>
      <el-descriptions-item label="播放类型">{{ diag.result?.kind || (isM3u8(diag.result?.url) ? 'm3u8' : '—') }}</el-descriptions-item>
      <el-descriptions-item label="解析地址">
        <div class="diag-url">
          <code>{{ diag.result?.url || diag.result?.error || '—' }}</code>
          <el-button v-if="diag.result?.url" size="small" link type="primary" @click="copy(diag.result.url)">复制</el-button>
          <el-button v-if="diag.result?.url" size="small" link type="primary" @click="openUrl(diag.result.url)">打开</el-button>
        </div>
      </el-descriptions-item>
      <el-descriptions-item v-if="diag.result?.fallbackUrl" label="回退地址">
        <div class="diag-url">
          <code>{{ diag.result.fallbackUrl }}</code>
          <el-button size="small" link type="primary" @click="copy(diag.result.fallbackUrl)">复制</el-button>
        </div>
      </el-descriptions-item>
      <el-descriptions-item label="探测结果">{{ diag.result?.probeSummary || diag.probe || '未探测' }}</el-descriptions-item>
      <template v-if="diag.result?.jinpaiStatus">
        <el-descriptions-item label="金牌签名IP">{{ diag.result.jinpaiStatus.signClientIp || diag.result.jinpaiStatus.clientIp || '—' }}</el-descriptions-item>
        <el-descriptions-item label="客户端归属">{{ diag.result.jinpaiStatus.clientCountry || diag.result.jinpaiStatus.clientRegion || '—' }}</el-descriptions-item>
        <el-descriptions-item label="CDN 区域">
          {{ diag.result.jinpaiStatus.cdnHost || '—' }}
          <el-tag v-if="diag.result.jinpaiStatus.cdnRegion" size="small" :type="diag.result.jinpaiStatus.regionMismatch ? 'danger' : 'success'">
            {{ diag.result.jinpaiStatus.cdnRegion }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-if="diag.result.jinpaiStatus.retryCdnHost" label="重试 CDN">
          {{ diag.result.jinpaiStatus.retryCdnHost }}
          <el-tag size="small">{{ diag.result.jinpaiStatus.retryCdnRegion || 'unknown' }}</el-tag>
        </el-descriptions-item>
      </template>
      <el-descriptions-item v-if="diag.result?.probe?.stages?.length" label="真实链路">
        <div class="diag-stages">
          <el-tag v-for="s in diag.result.probe.stages" :key="s.name" size="small" :type="s.ok ? 'success' : 'danger'">
            {{ s.name }} {{ s.status || '' }}
          </el-tag>
        </div>
      </el-descriptions-item>
      <el-descriptions-item label="说明">{{ diag.result?.note || '后台诊断只检查线路解析，不代表用户可直接观看。' }}</el-descriptions-item>
    </el-descriptions>
    <template #footer>
      <el-button @click="diagOpen=false">关闭</el-button>
      <el-button :loading="diag.loading" @click="diagnoseEp(diag.line, diag.ep, diag.epIndex, true)">重新解析</el-button>
      <el-button v-if="diag.result?.url" type="primary" @click="openUrl(diag.result.url)">新窗口打开</el-button>
    </template>
  </el-dialog>

  <!-- 清洗广告对话框 -->
  <el-dialog v-model="cleanDlg" :title="cleanDlgTitle" width="520">
    <el-form label-width="80px">
      <el-form-item label="清洗策略">
        <el-select v-model="cleanForm.strategyIds" multiple collapse-tags collapse-tags-tooltip placeholder="空 = 默认策略链" style="width:100%">
          <el-option v-for="s in cleanStrategies" :key="s.id" :label="s.label" :value="s.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="集数">
        <el-radio-group v-model="cleanForm.epMode">
          <el-radio label="all">全部集</el-radio>
          <el-radio label="first">仅第1集</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <el-alert type="info" :closable="false" style="margin-bottom:0"
      title="清洗在后台排队执行，完成后可在「播放治理」查看结果。" />
    <template #footer>
      <el-button @click="cleanDlg=false">取消</el-button>
      <el-button type="primary" :loading="cleanSubmitting" @click="submitCleanAds">提交清洗（{{ cleanTargetCount }} 部片）</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, reactive, onMounted, watch } from 'vue'
import { Search, MagicStick, StarFilled, EditPen, Refresh, CollectionTag, Plus, MoreFilled, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { api, imgUrl } from '../api'
const router = useRouter()
const route = useRoute()

const kwDlg = ref(false); const kwInput = ref('')
const kwSearching = ref(false); const kwSearched = ref(false)
const kwCandidates = ref([]); const kwChecked = ref([]); const kwSubmitting = ref(false)
const kwOptions = ref({ metaAfterCollect: true, cleanAfterCollect: false })

function resetKwDlg() {
  kwInput.value = ''; kwSearching.value = false; kwSearched.value = false
  kwCandidates.value = []; kwChecked.value = []
  kwOptions.value = { metaAfterCollect: true, cleanAfterCollect: false }
}
async function searchKeyword() {
  const kw = kwInput.value.trim()
  if (!kw) { ElMessage.warning('请输入片名'); return }
  kwSearching.value = true; kwSearched.value = false; kwChecked.value = []
  try {
    const r = await api.previewKeyword(kw)
    if (r.ok) {
      kwCandidates.value = r.candidates
      kwSearched.value = true
    } else {
      ElMessage.error(r.error || '搜索失败'); kwCandidates.value = []
    }
  } catch (e) { ElMessage.error('搜索失败: ' + e.message) } finally { kwSearching.value = false }
}
async function confirmKeyword() {
  if (!kwChecked.value.length) return
  kwSubmitting.value = true
  try {
    const picked = kwCandidates.value.filter(c => kwChecked.value.includes(c.fingerprint))
    // 展平为 { sourceId, vodIds } 列表传给后端
    const candidates = []
    for (const c of picked) for (const s of c.sources) candidates.push({ sourceId: s.sourceId, vodIds: s.vodIds })
    const r = await api.confirmKeyword(kwInput.value.trim(), candidates, kwOptions.value)
    if (r.ok) {
      ElMessage.success('已提交，去「采集任务」页看进度')
      kwDlg.value = false
      ElMessageBox.confirm('采集在后台运行中，是否前往「采集任务」页查看进度？', '已提交', {
        confirmButtonText: '去看进度', cancelButtonText: '留在本页', type: 'success'
      }).then(() => router.push('/tasks')).catch(() => {})
    } else {
      ElMessage.error(r.error || '提交失败')
    }
  } catch (e) { ElMessage.error('提交失败: ' + e.message) } finally { kwSubmitting.value = false }
}

const list = ref([]); const total = ref(0); const loading = ref(false); const types = ref([]); const sourceOptions = ref([])
const mstat = ref({})
async function loadMeta() { try { mstat.value = await api.metaStats() } catch {} }
async function backfillSubs() {
  try {
    await ElMessageBox.confirm('将从各采集源回拉详情，为缺小类的影片补全原始小类标签（供大类下钻）。后台任务，去「采集任务」看进度。继续？', '补全小类', { type: 'warning' })
    const r = await api.backfillSubtypes()
    ElMessage.success('已提交，任务#' + r.taskId)
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '提交失败') }
}
async function metaBatch() {
  try {
    await ElMessageBox.confirm('将按当前启用的匹配源批量抓取元数据，任务后台运行。继续？', '元数据匹配', { type: 'warning' })
    const r = await api.metaBatch({})
    ElMessage.success(r.message || '已提交')
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '提交失败') }
}
const q = reactive({ page: 1, size: 20, kw: String(route.query.kw || ''), type: '', status: '', sourceId: '', cleanStatus: '', year: '' })
const drawer = ref(false); const cur = ref({}); const active = ref([])
const selected = ref([]); const tableRef = ref(null)
const mergeDlg = ref(false); const mergeTargetId = ref(null); const mergeSaving = ref(false)
const expandedEpisodes = ref({})
const vodMenuOpenedAt = ref({})
const diagOpen = ref(false)
const diag = ref({ loading: false, line: null, ep: null, epIndex: 0, result: null, probe: '' })
const cleanupDlg = ref(false)
const playbackDiagnoseDlg = ref(false)
const playbackDiagnoseLoading = ref(false)
const playbackDiagnosePreview = ref(null)
const playbackDiagnoseResult = ref(null)
const playbackDiagnoseForm = ref({
  kw: '',
  vodId: 0,
  categoryNames: [],
  subType: '',
  sourceId: '',
  status: 'online',
  lineHealth: '',
  cleanStatus: '',
  limit: 30,
  markHealth: true,
})

// 清洗广告
const cleanDlg = ref(false); const cleanForm = reactive({ strategyIds: [], epMode: 'all' }); const cleanSubmitting = ref(false)
const cleanMode = ref('batch'); const cleanTargetIds = ref([]); const cleanStrategies = ref([])
const cleanDlgTitle = computed(() => `清洗广告${cleanMode.value === 'batch' ? '（批量）' : ''}`)
const cleanTargetCount = computed(() => cleanMode.value === 'batch' ? cleanTargetIds.value.length : 1)
function loadCleanStrategies() {
  api.hlsCleanOverview().then(o => { cleanStrategies.value = o.strategies || [] }).catch(() => {})
}
async function openCleanAdsDialog(mode, vodId = 0) {
  cleanMode.value = mode; cleanForm.strategyIds = []; cleanForm.epMode = 'all';
  cleanTargetIds.value = mode === 'batch' ? selected.value.map(r => r.id) : (vodId ? [vodId] : []);
  if (!cleanTargetIds.value.length && mode === 'batch') return ElMessage.warning('请先勾选影片')
  loadCleanStrategies(); cleanDlg.value = true
}
async function submitCleanAds() {
  cleanSubmitting.value = true
  try {
    // 逐部查详情(含 plays)，收集所有 playId
    const allPlayIds = []
    for (const vid of cleanTargetIds.value) {
      try {
        const vod = await api.vod(vid)
        for (const line of (vod.lines || [])) {
          if (line.id) allPlayIds.push(line.id)
          if (line.channels) for (const ch of line.channels) { if (ch.id) allPlayIds.push(ch.id) }
        }
      } catch { /* skip failed fetch */ }
    }
    if (!allPlayIds.length) return ElMessage.error('未找到有效线路')
    await api.hlsCleanTask({
      playIds: allPlayIds,
      rangeMode: 'vod',
      episodeMode: cleanForm.epMode,
      strategyIds: cleanForm.strategyIds?.length ? cleanForm.strategyIds : undefined,
      limit: 5000,
    })
    ElMessage.success(`已提交清洗任务：${allPlayIds.length} 条线路`)
    cleanDlg.value = false
  } catch (e) { ElMessage.error(e?.response?.data?.error || e.message || '提交失败') }
  finally { cleanSubmitting.value = false }
}
const cleanupLoading = ref(false)
const cleanupPreview = ref(null)
const cleanupExcludedIds = ref(new Set())
const cleanupSelectedRows = ref([])
const cleanupTableRef = ref(null)
const cleanupSubtypes = ref([])
const cleanupSubtypesLoading = ref(false)
const currentYear = new Date().getFullYear()
const cleanupForm = ref({
  rule: 'online',
  sourceId: '',
  categoryName: '',
  categoryNames: [],
  subType: '',
  days: 30,
  limit: 500,
  deleteOrphans: true,
  yearMode: '',
  year: currentYear,
  yearStart: currentYear,
  yearEnd: currentYear,
})
const cleanupVisibleSamples = computed(() => {
  const rows = cleanupPreview.value?.samples || []
  return rows.filter(row => !cleanupExcludedIds.value.has(Number(row.id)))
})
const cleanupPreviewTotal = computed(() => Math.max(0, Number(cleanupPreview.value?.total || 0) - cleanupExcludedIds.value.size))
const cleanupSelectedIds = computed(() => cleanupSelectedRows.value
  .map(row => Number(row?.id))
  .filter(id => Number.isInteger(id) && id > 0))
const cleanupCanExecute = computed(() => {
  if (!cleanupPreview.value) return false
  return cleanupSelectedIds.value.length > 0
})
const cleanupSelectedCategoryNames = computed(() => {
  const names = Array.isArray(cleanupForm.value.categoryNames)
    ? cleanupForm.value.categoryNames
    : cleanupForm.value.categoryName
      ? [cleanupForm.value.categoryName]
      : []
  return [...new Set(names.map(name => String(name || '').trim()).filter(Boolean))]
})
const playbackDiagnoseCategoryNames = computed(() => {
  return [...new Set((Array.isArray(playbackDiagnoseForm.value.categoryNames) ? playbackDiagnoseForm.value.categoryNames : [])
    .map(name => String(name || '').trim())
    .filter(Boolean))]
})
const cleanupSubtypesPlaceholder = computed(() => {
  if (!cleanupSelectedCategoryNames.value.length) return '先选择主分类'
  if (cleanupSelectedCategoryNames.value.length > 1) return '多主分类时不可选子分类'
  return '全部子分类'
})
const playbackDiagnoseSubtypesPlaceholder = computed(() => {
  if (!playbackDiagnoseCategoryNames.value.length) return '先选择主分类'
  if (playbackDiagnoseCategoryNames.value.length > 1) return '多主分类时不可选子分类'
  return '全部子分类'
})
const weekdayOptions = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
]

function coverUrl(row) {
  if (row?._coverStage === 'local') return imgUrl(row.localPic || '')
  if (row?._coverStage === 'pic') return imgUrl(row.pic || row.localPic || '')
  return imgUrl(row?.officialPic || row?.pic || row?.localPic || '')
}
function fallbackCover(row) {
  if (!row) return
  if (row._coverStage !== 'pic' && row.officialPic && row.pic) {
    row._coverStage = 'pic'
    return
  }
  if (row._coverStage !== 'local' && row.localPic) row._coverStage = 'local'
}
function aliasDisplay(alias) {
  return String(alias?.note || alias?.name || alias?.fingerprint || '').split('|')[0].trim()
}
function aliasNames(row) {
  const rows = Array.isArray(row?.aliasNames) && row.aliasNames.length
    ? row.aliasNames
    : Array.isArray(row?.aliases)
      ? row.aliases.map(aliasDisplay)
      : []
  return [...new Set(rows.map(item => String(item || '').trim()).filter(Boolean))]
}
function aliasNamesText(row) {
  return aliasNames(row).join('、')
}
function cleanTagTitle(row) {
  const clean = Number(row?.cleanLineCount || 0)
  const total = Number(row?.totalLineCount || row?._count?.plays || 0)
  return total ? `已清洗 ${clean}/${total} 条线路` : '已清洗'
}
function cleanTagText(row) {
  const clean = Number(row?.cleanLineCount || 0)
  const total = Number(row?.totalLineCount || row?._count?.plays || 0)
  return total && clean < total ? `已清洗 ${clean}/${total}` : '已清洗'
}

async function load() {
  loading.value = true
  try { const r = await api.adminVods(q); list.value = r.list; total.value = r.total } finally { loading.value = false }
}
function applyFilters() {
  q.page = 1
  load()
}
async function batchAction(action) {
  if (!selected.value.length) return
  const label = { offline: '下架', online: '上架', delete: '删除' }[action]
  try {
    await ElMessageBox.confirm(`确认${label}选中的 ${selected.value.length} 部影片？${action==='delete'?'删除不可恢复，将同时删除其播放线路。':''}`, `批量${label}`, { type: 'warning' })
    const ids = selected.value.map(r => r.id)
    const r = await api.batchVods(ids, action)
    if (r.ok) { ElMessage.success(`已${label} ${r.count} 部`); tableRef.value?.clearSelection(); load() }
    else ElMessage.error(r.error || '操作失败')
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '操作失败') }
}
async function batchMetaMatch() {
  if (!selected.value.length) return
  const ok = await ElMessageBox.confirm(`确认提交 ${selected.value.length} 部影片进行元数据匹配？`, '批量元数据匹配', { type: 'warning' })
    .then(() => true).catch(() => false)
  if (!ok) return
  try {
    const r = await api.metaBatch({ vodIds: selected.value.map(r => r.id), limit: selected.value.length, priority: 50, redo: true })
    ElMessage.success(r.message || `已提交任务 #${r.taskId}`)
    tableRef.value?.clearSelection()
  } catch (e) { ElMessage.error(e.message || '提交失败') }
}
function openMergeDlg() {
  if (selected.value.length < 2) return ElMessage.warning('至少选择两部影片')
  mergeTargetId.value = selected.value[0]?.id || null
  mergeDlg.value = true
}
async function confirmMerge() {
  if (!mergeTargetId.value) return
  const sources = selected.value.map(row => row.id).filter(id => id !== mergeTargetId.value)
  if (!sources.length) return
  const target = selected.value.find(row => row.id === mergeTargetId.value)
  const ok = await ElMessageBox.confirm(
    `确认将 ${sources.length} 部重复影片合并到「${target?.name || mergeTargetId.value}」？此操作会删除重复影片，只保留一条主影片。`,
    '确认合并片源',
    { type: 'warning' }
  ).then(() => true).catch(() => false)
  if (!ok) return
  mergeSaving.value = true
  try {
    const r = await api.mergeVods(mergeTargetId.value, sources)
    if (!r.ok) return ElMessage.error(r.error || '合并失败')
    ElMessage.success(`已合并 ${r.merged} 部，当前线路 ${r.lines} 条，别名 ${r.aliases} 个`)
    mergeDlg.value = false
    tableRef.value?.clearSelection()
    load()
  } catch (e) {
    ElMessage.error(e.message || '合并失败')
  } finally {
    mergeSaving.value = false
  }
}
function openCleanup() {
  cleanupDlg.value = true
  if (cleanupSelectedCategoryNames.value.length === 1 && !cleanupSubtypes.value.length) loadCleanupSubtypes()
}
function resetCleanupPreview() {
  cleanupPreview.value = null
  cleanupExcludedIds.value = new Set()
  cleanupSelectedRows.value = []
}
function excludeCleanupVod(row) {
  const id = Number(row?.id)
  if (!Number.isInteger(id) || id <= 0) return
  cleanupExcludedIds.value = new Set([...cleanupExcludedIds.value, id])
}
function resetCleanupExcluded() {
  cleanupExcludedIds.value = new Set()
}
function clearCleanupSelection() {
  cleanupTableRef.value?.clearSelection?.()
  cleanupSelectedRows.value = []
}
async function onCleanupCategoryChange() {
  resetCleanupPreview()
  const names = cleanupSelectedCategoryNames.value
  cleanupForm.value.categoryName = names.length === 1 ? names[0] : ''
  cleanupForm.value.subType = ''
  cleanupSubtypes.value = []
  if (names.length === 1) await loadCleanupSubtypes()
}
async function loadCleanupSubtypes(typeOverride = '') {
  const type = typeOverride || cleanupSelectedCategoryNames.value[0]
  if (!type) return
  cleanupSubtypesLoading.value = true
  try {
    cleanupSubtypes.value = await api.adminSubtypes(type)
  } catch (e) {
    ElMessage.error(e.message || '子分类加载失败')
  } finally {
    cleanupSubtypesLoading.value = false
  }
}
function cleanupPayload(extra = {}) {
  const categoryNames = cleanupSelectedCategoryNames.value
  return {
    ...cleanupForm.value,
    ...extra,
    categoryName: categoryNames.length === 1 ? categoryNames[0] : '',
    categoryNames,
  }
}
async function previewCleanup() {
  cleanupLoading.value = true
  try {
    const r = await api.previewVodCleanup(cleanupPayload())
    if (!r.ok) return ElMessage.error(r.error || '预检失败')
    cleanupPreview.value = r
    cleanupExcludedIds.value = new Set()
    cleanupSelectedRows.value = []
  } catch (e) { ElMessage.error(e.message || '预检失败') } finally { cleanupLoading.value = false }
}
async function executeCleanup(action = 'delete') {
  if (!cleanupPreview.value) return
  const ids = cleanupSelectedIds.value
  if (!ids.length) return ElMessage.warning('请先勾选要操作的影片')
  const label = { delete: '删除', offline: '下架', online: '上架', delete_lines: '清退线路' }[action] || '操作'
  const msg = action === 'delete_lines'
    ? `确认清退选中 ${ids.length} 部影片中符合筛选规则的线路？`
    : `确认${label}选中的 ${ids.length} 部影片？${action === 'delete' ? '删除不可恢复。' : ''}`
  const ok = await ElMessageBox.confirm(msg, `确认${label}`, { type: action === 'delete' ? 'warning' : 'info' }).then(() => true).catch(() => false)
  if (!ok) return
  cleanupLoading.value = true
  try {
    const r = await api.executeVodCleanup(cleanupPayload({
      excludeVodIds: [...cleanupExcludedIds.value],
      includeVodIds: ids,
      action,
    }))
    if (!r.ok) return ElMessage.error(r.error || '操作失败')
    const changed = r.deletedVods || r.updatedVods || r.deletedOrphans || 0
    const lineChanged = r.deletedLines || 0
    ElMessage.success(`${label}完成：影片 ${changed}，线路 ${lineChanged}`)
    cleanupPreview.value = null
    cleanupExcludedIds.value = new Set()
    cleanupSelectedRows.value = []
    cleanupDlg.value = false
    load()
  } catch (e) { ElMessage.error(e.message || '操作失败') } finally { cleanupLoading.value = false }
}
function resetPlaybackDiagnose() {
  playbackDiagnosePreview.value = null
  playbackDiagnoseResult.value = null
}
function playbackDiagnosePayload() {
  const vodId = Number(playbackDiagnoseForm.value.vodId) || 0
  const sourceId = Number(playbackDiagnoseForm.value.sourceId) || 0
  return {
    ...playbackDiagnoseForm.value,
    vodId: vodId > 0 ? vodId : undefined,
    sourceId: sourceId > 0 ? sourceId : undefined,
    categoryNames: playbackDiagnoseCategoryNames.value,
    limit: Math.max(1, Math.min(100, Number(playbackDiagnoseForm.value.limit) || 30)),
  }
}
function openPlaybackDiagnose() {
  playbackDiagnoseDlg.value = true
  resetPlaybackDiagnose()
  if (playbackDiagnoseCategoryNames.value.length === 1 && !cleanupSubtypes.value.length) loadCleanupSubtypes(playbackDiagnoseCategoryNames.value[0])
}
async function onPlaybackDiagnoseCategoryChange() {
  resetPlaybackDiagnose()
  playbackDiagnoseForm.value.subType = ''
  cleanupSubtypes.value = []
  if (playbackDiagnoseCategoryNames.value.length === 1) await loadCleanupSubtypes(playbackDiagnoseCategoryNames.value[0])
}
async function previewPlaybackDiagnose() {
  playbackDiagnoseLoading.value = true
  try {
    const r = await api.previewPlaybackDiagnose(playbackDiagnosePayload())
    if (!r.ok) return ElMessage.error(r.error || '预检失败')
    playbackDiagnosePreview.value = r
    playbackDiagnoseResult.value = null
  } catch (e) {
    ElMessage.error(e.message || '预检失败')
  } finally {
    playbackDiagnoseLoading.value = false
  }
}
async function executePlaybackDiagnose() {
  const payload = playbackDiagnosePayload()
  const ok = await ElMessageBox.confirm(
    payload.markHealth ? '确认执行播放链接诊断并回写线路健康状态？' : '确认执行播放链接诊断？本次不回写健康状态。',
    '执行播放诊断',
    { type: 'warning' }
  ).then(() => true).catch(() => false)
  if (!ok) return
  playbackDiagnoseLoading.value = true
  try {
    const r = await api.executePlaybackDiagnose(payload)
    if (!r.ok) return ElMessage.error(r.error || '执行失败')
    playbackDiagnoseResult.value = r
    playbackDiagnosePreview.value = { ...(playbackDiagnosePreview.value || {}), playCount: r.total, limit: payload.limit }
    ElMessage.success(`诊断完成：可播 ${r.playable || 0}，失败 ${r.failed || 0}`)
    if (payload.markHealth) load()
  } catch (e) {
    ElMessage.error(e.message || '执行失败')
  } finally {
    playbackDiagnoseLoading.value = false
  }
}
async function openDetail(row) {
  cur.value = await api.vod(row.id)
  active.value = cur.value.lines?.length ? [String(cur.value.lines[0].id)] : []
  expandedEpisodes.value = {}
  drawer.value = true
}
async function togglePin(row) {
  await api.patchVod(row.id, { pinned: !row.pinned })
  ElMessage.success('已更新'); if (cur.value.id === row.id) cur.value.pinned = !cur.value.pinned; load()
}

// 编辑影片资料
const editDlg = ref(false); const saving = ref(false)
const editForm = ref({})
async function openEdit(row) {
  if (row?.id && !Array.isArray(row.images)) {
    try { row = await api.vod(row.id) } catch {}
  }
  editForm.value = {
    id: row.id, name: row.name, year: row.year, typeName: row.typeName,
    aliasesText: aliasNames(row).join('\n'),
    area: row.area, lang: row.lang, actor: row.actor, director: row.director,
    remarks: row.remarks, rating: row.rating ?? '', pic: row.pic, officialPic: row.officialPic, heroPic: row.heroPic, blurb: row.blurb,
    images: Array.isArray(row.images) ? row.images : [],
    autoCollectEnabled: Boolean(row.autoCollectEnabled),
    autoCollectMode: row.autoCollectMode === 'weekdays' ? 'weekdays' : 'days',
    autoCollectIntervalDays: row.autoCollectIntervalDays || Math.max(1, Math.ceil((row.autoCollectIntervalHours || 24) / 24)),
    autoCollectWeekdays: parseWeekdays(row.autoCollectWeekdays),
    autoCollectMeta: row.autoCollectMeta !== false,
    autoCollectClean: Boolean(row.autoCollectClean),
    skipMode: row.skipConfig?.enabled === true ? 'enabled' : row.skipConfig?.enabled === false ? 'disabled' : 'inherit',
    skipIntroSeconds: Number(row.skipConfig?.introSeconds ?? 0) || 0,
    skipOutroSeconds: Number(row.skipConfig?.outroSeconds ?? 0) || 0,
    skipIntroInherit: row.skipConfig?.introSeconds == null,
    skipOutroInherit: row.skipConfig?.outroSeconds == null,
  }
  editDlg.value = true
}
async function saveEdit() {
  if (!editForm.value.name?.trim()) return ElMessage.warning('片名不能为空')
  saving.value = true
  try {
    const payload = {
      ...editForm.value,
      aliases: editForm.value.aliasesText || '',
      skipConfig: {
        enabled: editForm.value.skipMode === 'inherit' ? null : editForm.value.skipMode === 'enabled',
        introSeconds: editForm.value.skipIntroInherit ? null : editForm.value.skipIntroSeconds,
        outroSeconds: editForm.value.skipOutroInherit ? null : editForm.value.skipOutroSeconds,
      },
    }
    delete payload.aliasesText
    delete payload.images
    delete payload.skipMode
    delete payload.skipIntroSeconds
    delete payload.skipOutroSeconds
    delete payload.skipIntroInherit
    delete payload.skipOutroInherit
    const r = await api.editVod(editForm.value.id, payload)
    if (r.error) return ElMessage.error(r.error)
    ElMessage.success('已保存')
    editDlg.value = false
    if (cur.value.id === editForm.value.id) cur.value = await api.vod(editForm.value.id)
    load()
  } catch (e) { ElMessage.error(e.message || '保存失败') } finally { saving.value = false }
}

// 单片采集更新（刷新剧集）
const refreshing = ref(false)
async function refreshOne(row) {
  row._refreshing = true; refreshing.value = true
  try {
    const r = await api.refreshVod(row.id)
    if (!r.ok) return ElMessage.error(r.error || '更新失败')
    const changed = (r.lines || []).filter(l => l.ok && l.after !== l.before)
    const detail = (r.lines || []).map(l => l.ok ? `${l.source}:${l.before}→${l.after}集` : `${l.source}:${l.msg}`).join('；')
    const picMsg = r.pic === 'repaired' ? '；封面已重拓修复' : r.pic === 'broken_no_alt' ? '；⚠封面打不开且无可用替代图' : ''
    ElMessage({ message: `采集更新完成，${r.updated}/${r.total}条线路刷新。${detail}${picMsg}`, type: (changed.length || r.pic === 'repaired') ? 'success' : 'info', duration: 5000 })
    if (cur.value.id === row.id) cur.value = await api.vod(row.id)
    load()
  } catch (e) { ElMessage.error(e.message || '更新失败') } finally { row._refreshing = false; refreshing.value = false }
}
async function toggleStatus(row) {
  const s = row.status === 'online' ? 'offline' : 'online'
  await api.patchVod(row.id, { status: s }); ElMessage.success('已更新'); load()
}
function handleVodCommand(cmd, row) {
  const openedAt = vodMenuOpenedAt.value[row.id] || 0
  if (Date.now() - openedAt < 250) return
  if (cmd === 'edit') return openEdit(row)
  if (cmd === 'refresh') return refreshOne(row)
  if (cmd === 'clean') return openCleanAdsDialog('single', row.id)
  if (cmd === 'archive') return archiveOne(row)
  if (cmd === 'unarchive') return unarchiveOne(row)
  if (cmd === 'status') return toggleStatus(row)
}
async function archiveOne(row) {
  const redo = ['done','running','pending'].includes(row.archiveStatus)
  try {
    if (redo) await ElMessageBox.confirm(`「${row.name}」已有转存记录，确认重新转存？`, '重新转存', { type: 'warning' })
    const r = await api.archiveVod(row.id, redo)
    if (r?.ok === false) return ElMessage.error(r.error || '转存提交失败')
    row.archiveStatus = 'pending'
    ElMessage.success('转存任务已提交，可到「采集任务」查看进度')
  } catch (e) { if (e !== 'cancel') ElMessage.error('转存失败: ' + (e?.response?.data?.error || e.message || e)) }
}
async function unarchiveOne(row) {
  try {
    await ElMessageBox.confirm(`确认取消「${row.name}」的本地转存并删除已下载文件？`, '取消转存', { type: 'warning' })
    await api.cancelArchiveVod(row.id)
    row.archiveStatus = 'off'
    ElMessage.success('已取消转存并清理本地文件')
  } catch (e) { if (e !== 'cancel') ElMessage.error('取消失败: ' + (e?.response?.data?.error || e.message || e)) }
}
function noteVodMenuVisibility(row, visible) {
  if (!row?.id || !visible) return
  vodMenuOpenedAt.value = { ...vodMenuOpenedAt.value, [row.id]: Date.now() }
}
function lineChannels(line) {
  const channels = Array.isArray(line?.channels) ? line.channels : []
  return channels.length ? channels : [line].filter(Boolean)
}
function isEpisodesExpanded(line) {
  return Boolean(expandedEpisodes.value[line.id])
}
function visibleEpisodes(line) {
  const episodes = Array.isArray(line?.episodes) ? line.episodes : []
  return isEpisodesExpanded(line) ? episodes : episodes.slice(0, 60)
}
function toggleEpisodes(line) {
  expandedEpisodes.value = { ...expandedEpisodes.value, [line.id]: !isEpisodesExpanded(line) }
}
function copy(url) { navigator.clipboard?.writeText(url); ElMessage.success('已复制播放地址') }
function isM3u8(url) {
  return /\.m3u8(\?|$)/i.test(String(url || ''))
}
const diagStatusText = computed(() => {
  if (diag.value.loading) return '解析中'
  if (diag.value.result?.ok && diag.value.result?.url) return '可解析'
  if (diag.value.result?.error) return '解析失败'
  return '待诊断'
})
const diagStatusType = computed(() => {
  if (diag.value.loading) return 'warning'
  if (diag.value.result?.ok && diag.value.result?.url) return 'success'
  if (diag.value.result?.error) return 'danger'
  return 'info'
})
async function probeResolvedUrl(url) {
  if (!url) return '无解析地址'
  if (!/^https?:\/\//i.test(url) && !String(url).startsWith('/')) return '非 HTTP 地址，跳过探测'
  try {
    const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-2047' } })
    const type = res.headers.get('content-type') || 'unknown'
    return `${res.status} ${res.statusText || ''} · ${type}`.trim()
  } catch (e) {
    return `探测失败：${e?.message || e}`
  }
}
async function diagnoseEp(line, ep, visibleIndex, fresh = false) {
  const episodes = Array.isArray(line?.episodes) ? line.episodes : []
  const epIndex = episodes.indexOf(ep) >= 0 ? episodes.indexOf(ep) : Number(visibleIndex) || 0
  diagOpen.value = true
  diag.value = { loading: true, line, ep, epIndex, result: null, probe: '' }
  try {
    const result = await api.diagnoseVod(cur.value.id, { playId: line.id, epIndex, ...(fresh ? { fresh: 1 } : {}) })
    const probe = result?.probeSummary || (result?.url ? await probeResolvedUrl(result.url) : '')
    diag.value = { loading: false, line, ep, epIndex, result, probe }
  } catch (e) {
    diag.value = { loading: false, line, ep, epIndex, result: { ok: false, error: e.message || '解析失败' }, probe: '' }
  }
}
function diagnoseFirstEpisode(line) {
  const channels = lineChannels(line)
  const target = channels.find(ch => Array.isArray(ch?.episodes) && ch.episodes.length) || line
  const ep = Array.isArray(target?.episodes) ? target.episodes[0] : null
  if (!target?.id || !ep) return ElMessage.warning('该线路暂无可诊断集数')
  diagnoseEp(target, ep, 0)
}
function openUrl(url) {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}
function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}
function parseWeekdays(value) {
  let raw = value
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '[]') } catch { raw = [] }
  }
  return [...new Set((Array.isArray(raw) ? raw : [])
    .map(n => Number(n))
    .filter(n => Number.isInteger(n) && n >= 1 && n <= 7))]
    .sort((a, b) => a - b)
}
function autoCollectSummary(row) {
  if (!row?.autoCollectEnabled) return '关闭'
  if (row.autoCollectMode === 'weekdays') {
    const labels = parseWeekdays(row.autoCollectWeekdays)
      .map(value => weekdayOptions.find(day => day.value === value)?.label)
      .filter(Boolean)
    return labels.length ? labels.join(' / ') : '固定周几'
  }
  return `${row.autoCollectIntervalDays || Math.max(1, Math.ceil((row.autoCollectIntervalHours || 24) / 24))} 天/次`
}
async function matchOne(id) {
  try {
    const r = await api.metaMatch(id)
    ElMessage.success(r.message || `已提交元数据匹配任务 #${r.taskId}`)
    setTimeout(async () => {
      cur.value = await api.vod(id)
      load()
      loadMeta()
    }, 800)
  } catch (e) { ElMessage.error(e.message) }
}
function parseMetaReason(row) {
  try { return JSON.parse(row?.metaReason || '{}') } catch { return {} }
}
function failedMetaLabel(row) {
  const reasons = parseMetaReason(row).reasons || []
  if (reasons.includes('no_suggest')) return '搜索无候选'
  if (reasons.includes('detail_failed')) return '详情获取失败'
  return Number(row?.metaScore || 0) > 0 ? '低置信' : '无收录'
}
const reasonMap = {
  manual: '人工确认',
  no_provider: '未启用匹配源',
  provider_failed: '匹配源请求失败',
  no_suggest: '搜索无候选',
  detail_failed: '详情获取失败',
  title_exact: '标题完全一致',
  title_contains: '标题互相包含',
  title_similar: '标题相似',
  title_weak: '标题弱相关',
  year_match: '年份一致',
  year_near: '年份接近',
  year_mismatch: '年份不一致',
  season_match: '季数一致',
  season_mismatch: '季数不一致',
  special_match: '特别篇标记一致',
  special_missing: '候选缺少特别篇标记',
  type_match: '分类匹配',
  type_mismatch: '分类不一致',
  director_match: '导演匹配',
  director_mismatch: '导演不一致',
  actors_match: '多名演员匹配',
  actor_match: '演员匹配',
  actors_mismatch: '演员不一致',
}
const reasonText = (reasons) => {
  const list = Array.isArray(reasons) ? reasons : []
  return list.length ? list.map(r => reasonMap[r] || '其他匹配信号').join(' / ') : '—'
}
const providerLabel = (source) => ({ douban: '豆瓣', tmdb: 'TMDB' }[source] || source || '—')
function rowProvider(row) {
  return row?.metaSource || parseMetaReason(row).provider || ''
}
function candidateUrl(c) {
  const source = c?.source || 'douban'
  if (source === 'douban') return `https://movie.douban.com/subject/${c.id}/`
  if (source === 'tmdb') {
    const [kind, id] = String(c.id || '').split(':')
    return id ? `https://www.themoviedb.org/${kind === 'tv' ? 'tv' : 'movie'}/${id}` : ''
  }
  return ''
}
function metadataUrl(row) {
  if (rowProvider(row) !== 'tmdb') return ''
  const [kind, id] = String(row?.metaSourceId || '').split(':')
  return id ? `https://www.themoviedb.org/${kind === 'tv' ? 'tv' : 'movie'}/${id}` : ''
}
function posterImages(images = []) {
  return images.filter(img => img?.url && img.type === 'poster').slice(0, 12)
}
function heroImages(images = []) {
  return images.filter(img => img?.url && img.type !== 'poster').slice(0, 12)
}
async function setVodImage(row, image, mode) {
  if (!row?.id || !image?.url) return
  const payload = mode === 'hero' ? { heroPic: image.url } : { officialPic: image.url }
  await api.editVod(row.id, payload)
  ElMessage.success(mode === 'hero' ? '已设为首页横图' : '已设为封面')
  cur.value = await api.vod(row.id)
  load()
}
async function deleteVodImage(row, image) {
  if (!row?.id || !image?.id) return
  await ElMessageBox.confirm('确认删除这张图片资产？如果它正被用作封面或首页横图，会同步清空对应设置。', '删除图片资产', { type: 'warning' })
  await api.deleteVodImage(row.id, image.id)
  ElMessage.success('图片资产已删除')
  cur.value = await api.vod(row.id)
  load()
}
function pendingCandidates(row) {
  if (row?.metaMatched !== 'pending') return []
  return Array.isArray(parseMetaReason(row).candidates) ? parseMetaReason(row).candidates : []
}
async function confirmMeta(id, c) {
  try {
    await ElMessageBox.confirm(`确认匹配${providerLabel(c.source || 'douban')}《${c.title}》${c.year ? '（' + c.year + '）' : ''}？`, '确认元数据候选', { type: 'warning' })
    const r = await api.metaSet(id, c)
    if (r.ok) {
      ElMessage.success(r.message || '已提交后台确认')
      setTimeout(async () => {
        cur.value = await api.vod(id)
        load()
        loadMeta()
      }, 1200)
    } else ElMessage.error(r.error || '确认失败')
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '确认失败') }
}
onMounted(async () => {
  const [catRows, sourceRows] = await Promise.all([api.adminCategories(), api.sources()])
  types.value = catRows
  sourceOptions.value = sourceRows
  load()
  loadMeta()
})
watch(() => route.query.kw, (kw) => {
  const next = String(kw || '')
  if (next === q.kw) return
  q.kw = next
  q.page = 1
  load()
})
</script>

<style scoped>
.toolbar { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.sec-title { font-size: 16px; font-weight: 600; } .sec-title small { color: var(--text-3); font-weight:400; margin-left:6px; }
.filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.filters :deep(.el-button + .el-button) { margin-left: 0; }
.actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.vod-count { flex: 0 0 auto; color: var(--text-3); font-size:13px; line-height:32px; white-space: nowrap; margin-left: auto; }
.alias-line { margin-top: 4px; color:#98a1b0; font-size:12px; line-height:1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.noimg { width:44px; height:60px; background:var(--page-bg); color:var(--text-3); font-size:12px;
  display:flex; align-items:center; justify-content:center; border-radius:4px; }
.pager { margin-top: 16px; justify-content: flex-end; }
.detail-head { display: flex; gap: 16px; }
.meta p { margin: 4px 0; font-size: 13px; color: var(--text-2); }
.meta code { background:var(--page-bg); padding:1px 6px; border-radius:4px; color:var(--el-color-primary); }
.ellip { display:inline-block; max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:bottom; }
.blurb { margin-top:14px; font-size:13px; color:#667085; line-height:1.7; max-height:120px; overflow:auto; }
.eps { display: flex; flex-wrap: wrap; gap: 6px; }
.line-health { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 10px; color: #64748b; font-size: 12px; }
.line-title-action { margin-left: auto; margin-right: 8px; }
.line-channel + .line-channel { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e5e7eb; }
.line-channel-title { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #64748b; font-size: 12px; }
.line-channel-title b { color: #303133; }
.ep { cursor: pointer; }
.ep-wrap { display: inline-flex; align-items: center; gap: 2px; padding-right: 4px; border-right: 1px solid #edf0f5; }
.db-score { color: #ff9900; font-weight: 700; }
.vod-actions { display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; width: 100%; }
.vod-actions .el-button + .el-button {
  margin-left: 0;
}
.episode-more { width: 100%; display: flex; align-items: center; gap: 8px; color:var(--text-3); font-size: 12px; margin-top: 2px; }
.diag-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.diag-head b, .diag-head span { display: block; }
.diag-head span { color: #98a1b0; font-size: 12px; margin-top: 4px; }
.diag-url { display: flex; align-items: center; gap: 8px; min-width: 0; }
.diag-url code { flex: 1 1 auto; min-width: 0; word-break: break-all; white-space: normal; color: var(--text-2); }
.diag-stages { display: flex; flex-wrap: wrap; gap: 6px; }
.batch-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; margin-bottom: 12px;
  background: #fdf6ec; border: 1px solid #f5dab1; border-radius: 8px;
  font-size: 13px; color: #b88230;
}
.merge-list { display: grid; gap: 10px; margin-top: 14px; }
.merge-item { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
.merge-item.on { border-color: #409eff; background: #ecf5ff; }
.merge-cover { width: 44px; height: 60px; border-radius: 4px; flex-shrink: 0; }
.merge-info { min-width: 0; display: grid; gap: 3px; font-size: 12px; color: #8a94a7; }
.merge-info b { color: #303133; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.merge-info code { color: #409eff; background: #f0f2f5; border-radius: 4px; padding: 1px 5px; word-break: break-all; }
.cleanup-actions { display: flex; justify-content: flex-end; gap: 10px; margin: 6px 0 12px; }
.cleanup-preview-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; color: #8a94a7; font-size: 12px; }
.play-diagnose-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; }
.play-diagnose-grid :deep(.el-select), .play-diagnose-grid :deep(.el-input-number) { width: 100%; }
.diagnose-actions { display: flex; justify-content: flex-end; gap: 10px; margin: 4px 0 12px; }
.diagnose-summary { margin-bottom: 10px; }
.diagnose-result-summary { display: flex; align-items: center; gap: 8px; margin: 12px 0 10px; }
.kw-post-actions { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.kw-post-actions :deep(.el-checkbox) { margin-right: 0; }
.year-filter { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.auto-collect-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.auto-collect-row :deep(.el-checkbox) { margin-right: 0; }
.weekday-group { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.weekday-group :deep(.el-checkbox-button__inner) { border-left: 1px solid var(--el-border-color); border-radius: 6px; }
.skip-config-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.skip-config-row :deep(.el-form-item__content) { gap: 10px; }
.muted { color: var(--text-3); font-size: 12px; }
.meta-candidates { margin: 14px 0; border: 1px solid #f5dab1; background: #fdf6ec; border-radius: 10px; padding: 12px; }
.cand-title { font-weight: 700; color: #b88230; margin-bottom: 10px; }
.cand-item { display:flex; align-items:center; justify-content:space-between; gap: 12px; padding: 10px; background:#fff; border-radius:8px; margin-bottom:8px; }
.cand-item:last-child { margin-bottom:0; }
.cand-main { display:flex; align-items:center; gap:10px; min-width:0; }
.cand-img { width:40px; height:56px; border-radius:4px; flex-shrink:0; }
.cand-info { min-width:0; font-size:13px; }
.cand-year { color:#98a1b0; margin-left:4px; }
.cand-sub { color:#98a1b0; font-size:12px; margin-top:3px; word-break:break-all; }
.cand-actions { display:flex; align-items:center; gap:10px; flex-shrink:0; }
.cand-actions a { color:var(--el-color-primary); font-size:12px; text-decoration:none; }
.asset-box { margin: 14px 0; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: #fafbfc; }
.asset-title { display:flex; align-items:center; flex-wrap:wrap; gap:8px; font-weight: 700; color: var(--text-2); margin-bottom: 10px; }
.asset-title span { color:#8a94a6; font-size:12px; font-weight:400; }
.asset-imgs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.asset-img-card { min-width: 0; }
.asset-img { width: 100%; aspect-ratio: 16/9; border-radius: 6px; overflow: hidden; background: #f0f2f5; }
.asset-img-actions { display:flex; justify-content:center; flex-wrap:wrap; gap: 6px; margin-top: 4px; }
.edit-image-picker { display: grid; grid-template-columns: repeat(6, 44px); gap: 8px; }
.edit-image-picker.wide { grid-template-columns: repeat(4, 72px); }
.edit-image-option { width:44px; height:62px; padding:0; border:2px solid transparent; border-radius:6px; overflow:hidden; background:var(--page-bg); cursor:pointer; }
.edit-image-option.wide { width:72px; height:42px; }
.edit-image-option.on { border-color:#2563eb; }
.edit-image-option img { width:100%; height:100%; object-fit:cover; display:block; }
</style>
