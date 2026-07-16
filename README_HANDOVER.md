# Video-CMS 交接文档（README_HANDOVER）

> **文档性质**：动态交接文档（Handover Doc），供任意 AI/工程师无缝接班。
> **维护官**：Zia（gogo·全栈）｜**唯一真相源**：`workspace-gogo/video-cms/README_HANDOVER.md`
> **文档中心镜像**：小虎虾文档中心 → 分组 `cms视频`（经软链实时同步，改源文件即更新）
> **最后更新**：2026-07-17 (GMT+8)｜**对应提交**：本次提交（X8 搜索分类页骨架屏补齐）

---

## 0. 一句话定位

一套**视频内容采集 + 聚合 + 分发 CMS**：后端从上游源（MacCMS API + 元数据源：豆瓣/TMDB）采集影片 → 分类/去重/补全 → 清洗 HLS(m3u8) 去广告 → 播放解析与代理；对外提供**观众前端**（PC + 移动端模板）与**运营后台**（鉴权管理台）。

---

## 1. 项目技术栈与概览

### 技术栈
| 层 | 技术 |
|----|------|
| **后端** | Node.js + TypeScript(ESM) · **Fastify 5** · **Prisma 6** ORM · **PostgreSQL 16** |
| 鉴权 | JWT(`jsonwebtoken`) + `bcryptjs`，登录限流 |
| 采集/媒体 | `fast-xml-parser`(MacCMS) · `sharp`(图片/PWA图标) · `node-cron`(定时调度) |
| **运营后台 admin** | Vue 3 + Vite 6 + **Element Plus** + vue-router + axios |
| **观众前端 web** | Vue 3 + Vite 6 + **hls.js** + vue-router + axios（含独立移动端模板） |
| **部署** | Docker Compose（postgres/server/admin/web），前端 nginx 托管静态产物 |

### 服务拓扑与端口（docker-compose）
| 容器 | 端口 | 说明 |
|------|------|------|
| `vcms-postgres` | `127.0.0.1:5155→5432` | PG16，数据卷 `vcms_pgdata`(external) |
| `vcms-server` | `127.0.0.1:5150` | Fastify API，仅本机（前端 nginx 反代） |
| `vcms-admin` | `5151→80` | 运营后台（对外，有鉴权） |
| `vcms-web` | `5152→80` | 观众前端（对外公开） |

> ⚠️ 端口铁律：临时/测试预览服务只能用 `5100-5200`；生产固定端口勿动。

### 数据流（核心链路）
```
上游源(MacCMS/元数据源) ──采集──> taskRunner ──分类/去重──> Vod/Person(PG)
                                              │
                              元数据补全 ← metaAssets
播放请求 ──> resolve ──> hlsProxy/playProxy ──> HLS cleaner(去广告) ──> 观众端 hls.js
运营后台 ──JWT──> admin API(sources/vods/tasks/users/site/access/hlsClean...)
```

---

## 2. 动态目录树（核心文件职责）

```
video-cms/
├── docker-compose.yml          # 4 容器编排：postgres/server/admin/web
├── restart-server.sh           # 服务重启脚本
├── .env                        # POSTGRES_* 等（占位，见 §3）
├── docs/
│   ├── backlog.md              # 待办积压（当前 2 项，见 §4 下一步）
│   └── frontend-test-report-2026-07-02.md
│
├── server/                     # 后端（Fastify + Prisma）
│   ├── prisma/schema.prisma    # 26 个模型（见下），provider=postgresql
│   └── src/
│       ├── index.ts            # 【入口】Fastify 装配，注册全部路由 + seedAdmin/seedVipLevels/startScheduler/recoverOrphanTasks/ensurePerformanceIndexes
│       ├── db.ts               # Prisma Client + 性能索引保障
│       ├── auth.ts             # 鉴权工具 + 初始化管理员(seedAdmin)
│       ├── scheduler.ts        # node-cron 定时采集调度
│       ├── aggregateCache.ts   # 浏览总数聚合缓存(分页/浏览提速)
│       ├── publicVod.ts        # 观众端 VOD 查询与序列化
│       ├── playProxy.ts        # 播放代理
│       ├── playDomains.ts      # 播放域名管理
│       ├── localImages.ts      # 本地图片缓存
│       ├── icloud.ts           # iCloud 相关存储/同步
│       ├── pwaIcons.ts         # PWA 图标生成(sharp)
│       ├── vipLevels.ts        # VIP 等级 + seedVipLevels
│       ├── loginRateLimit.ts   # 登录限流
│       ├── hotConfig.ts        # 热榜配置
│       ├── categoryIcons.ts    # 分类图标
│       ├── sourceAutoTypes.ts  # 源类型自动映射
│       ├── textClean.ts        # 文本清洗
│       │
│       ├── routes/             # 【API 路由】
│       │   ├── auth.ts         #   后台登录/发 token
│       │   ├── sources.ts      #   采集源 CRUD
│       │   ├── vods.ts         #   ★最大(56KB) 影片管理 + 公开影片 API
│       │   ├── categories.ts   #   分类管理 + 访问控制
│       │   ├── resolve.ts      #   播放解析(拿可播地址)
│       │   ├── tasks.ts        #   采集任务管理
│       │   ├── meta.ts         #   元数据配置(豆瓣等)
│       │   ├── site.ts         #   站点/主题/布局配置
│       │   ├── img.ts          #   图片代理/服务
│       │   ├── users.ts        #   后台用户 + Web 用户管理
│       │   ├── hot.ts          #   热榜配置
│       │   ├── access.ts       #   访问审计/访问控制
│       │   ├── hlsClean.ts     #   HLS 清洗配置 + 结果
│       │   └── hlsProxy.ts     #   HLS 播放代理
│       │
│       ├── collector/          # 【采集引擎】
│       │   ├── taskRunner.ts   #   ★最大(39KB) 任务执行引擎
│       │   ├── sync.ts         #   采集同步编排
│       │   ├── maccms.ts       #   MacCMS API 适配器
│       │   ├── douban.ts       #   豆瓣元数据适配器
│       │   ├── tmdb.ts         #   TMDB 元数据适配器
│       │   ├── classify.ts     #   内容分类
│       │   ├── dedupe.ts       #   去重
│       │   ├── metaAssets.ts   #   元数据资源抓取
│       │   ├── probe.ts        #   源探测
│       │   ├── resolver.ts     #   URL 解析
│       │   └── drivers/        #   源驱动
│       │
│       └── hls/                # 【HLS 处理】
│           ├── cleaner.ts      #   ★(37KB) m3u8 清洗/去广告（3 策略：编码画像/异源路径/时长序列指纹）
│           └── tsProbe.ts      #   TS 分片探测
│
├── admin/                      # 运营后台(Vue3 + Element Plus)
│   └── src/views/             # Login/Dashboard/Sources/Vods/Categories/Tasks/Meta/Site/Users/Hot/Access/HlsClean
│
└── web/                        # 观众前端(Vue3 + hls.js)
    └── src/
        ├── views/             # Home/Play/Shorts/Auth/Profile (PC)
        ├── mobile/            # MobileShell/Home/Search/Shorts/Theater/Me (独立移动模板)
        ├── x8/                # X8 深色影院自适应模板（首页/分类/排行/详情/播放/登录壳）
        └── components/        # AuthModal/ToastStack
```

### Prisma 数据模型（26 个）
`Source` `Category` `SourceTypeMap` `SiteConfig` `MetaConfig` `HotConfig` `HlsCleanConfig` `HlsCleanPolicy` `HlsCleanResult` `HlsAdFingerprint` `User` `WebUser` `VipLevel` `LegacyMemberGroup` `LegacyWebUserGroup` `InviteCode` `AuditLog` `AccessAudit` `Vod` `VodAlias` `Person` `VodPerson` `VodImage` `UserFollow` `WatchHistory` `Play` `Task` `SyncLog`

---

## 3. 配置与依赖

### 环境变量（占位符，切勿在文档写真实值）
**根 `.env`（供 docker-compose）**
```env
POSTGRES_USER=<pg_user>
POSTGRES_PASSWORD=<pg_password>
POSTGRES_DB=<pg_db>
# compose 内注入 server：
JWT_SECRET=<jwt_secret>                 # 缺省回退 dev-secret，生产必改
MEDIA_ENCRYPTION_KEY=<media_key_optional>
```
**`server/.env`（本地开发/tsx）**
```env
DATABASE_URL=postgresql://<user>:<pwd>@localhost:5155/<db>?schema=public
```

### 核心依赖
- **server**：`fastify@5` `@fastify/cors` `@prisma/client@6` `prisma@6` `jsonwebtoken` `bcryptjs` `node-cron` `sharp` `fast-xml-parser` `dotenv` · dev：`tsx` `typescript@5`
- **admin**：`vue@3` `element-plus` `@element-plus/icons-vue` `vue-router@4` `axios` · dev：`vite@6` `@vitejs/plugin-vue`
- **web**：`vue@3` `hls.js` `vue-router@4` `axios` · dev：`vite@6` `@vitejs/plugin-vue`

### 常用命令
```bash
# 后端（server/）
pnpm dev            # tsx watch 开发
pnpm build          # tsc 编译到 dist/
pnpm db:push        # prisma db push（同步 schema）
pnpm db:gen         # prisma generate

# 前端（admin/ 或 web/）
pnpm dev / pnpm build

# 整体部署
docker compose up -d --build
./restart-server.sh
```

---

## 4. 当前开发进度（断点记录）

- **2026-07-17 X8 搜索分类页骨架屏补齐断点**：`web/src/x8/X8Home.vue` 为 X8 show 页（搜索结果、分类/二级分类/年份/排序切换）补齐加载骨架：请求期间 browse 列表直接展示响应式骨架卡，二级分类与年份筛选首次加载时展示胶囊骨架，标题副文案显示“正在加载影片”；`loadBrowse()` 增加请求序号，避免快速切换时旧请求覆盖新结果。验证：`npm run build`、`git diff --check` 通过；新前端包 `assets/index-C3006o8-.js / assets/index-CT23Raxo.css`。
- **2026-07-17 X8 搜索热词点击提交回修断点**：`web/src/x8/X8Home.vue` 修复 X8 顶部搜索框热门词轮播交互：输入框聚焦后 placeholder 不再从当前热词切换成“搜索”，空输入直接点击搜索会使用当前轮播热词提交；只有用户实际输入内容后才以输入内容覆盖热词搜索。验证：`npm run build`、`git diff --check` 通过；新前端包 `assets/index-BPOp9asv.js / assets/index-DZwTkYo4.css`。
- **2026-07-17 X8 播放页切线路不跳集回修断点**：`web/src/x8/X8Home.vue` 继续修正播放页右侧切线路行为：`selectLine()` 不再把 `currentEpIndex` 重置为 `0`，只切换当前线路与对应选集列表，并按当前集数定位分组；只有点击具体选集时才调用 `playCurrent()`。验证：`npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5150 `/health` 正常，5152 新包 `assets/index-8i0bAvSN.js / assets/index-DZwTkYo4.css`；浏览器实测 `#/x8/play/921?line=450701&ep=2` 从金牌第 2 集切到无尽后仍 active 第 2 集，video src 不变、`/api/resolve` 不增加，点击第 2 集后才切到无尽播放并更新 URL。
- **2026-07-17 X8 播放页线路选择行为回修断点**：`web/src/x8/X8Home.vue` 修复从详情页选择线路进入播放页后丢失线路的问题：`goPlay()` 会把当前详情页选中的 `line` 写入播放页 query，`loadVod(true)` 优先按 `route.query.line` 还原播放线路。播放页 `selectLine()` 不再直接调用 `playCurrent()`，只切换线路 tabs/选集列表，用户点击具体选集时才解析播放；`selectEpisode()` 会同步 URL 的 `line/ep`，避免切线后刷新又回到旧线路。验证：`npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5150 `/health` 正常，5152 新包 `assets/index-PmbxN7OH.js / assets/index-DZwTkYo4.css`；浏览器实测详情页选金牌第 2 集进入 `#/x8/play/921?line=450701&ep=2` 后播放页 active 为金牌/第 2 集，播放页再切无尽只切 UI 不新增 `/api/resolve`，点击第 1 集后才发起新解析并更新 URL。
- **2026-07-17 X8 播放器官方 lucide 图标回修断点**：`web/src/x8/X8Home.vue` 按 lucide 官方 SVG 校正两个误用图标：窗口化按钮使用官方 `PictureInPicture` 路径（`M2 10h6V4`、`m2 4 6 6`、`M21 10...`、`M3 14...`、`rect x=12 y=14 width=10 height=7`），系统全屏按钮使用官方 `Fullscreen` 路径并补中间 `rect x=7 y=8 width=10 height=8`，避免继续与 HLS 的 `Maximize` 四角图标混淆。验证：`npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5150 `/health` 正常，5152 新包 `assets/index-1Bh7r8FL.js / assets/index-DZwTkYo4.css`；无头浏览器实测 `#/x8/play/921` 中 `.x8-icon-picture-in-picture` 与 `.x8-icon-fullscreen` 子节点均为官方路径，图标尺寸仍为 `22x22`。
- **2026-07-17 前台分类列表展示权限回修断点**：`server/src/publicVod.ts` 将 `enabledTypeNames(viewer)` 恢复为旧模板展示语义，返回 `visibleTypeNames(viewer)`，让 `/api/vods`、详情、相关推荐、年份等前台展示接口按“展示权限”出内容；播放解析仍由 `server/src/routes/resolve.ts` 的 `accessForType(typeName, "watch", viewer)` 拦截观看权限。验证：`pnpm --dir server build`、`docker compose up -d --build server`、`git diff --check` 通过；5150 `/health` 正常；未登录 `/api/vods?type=短剧&size=3` 返回 `404的秘密/殿主归来：为她横扫世家/闺蜜偷换我崽，怎料他爹是大佬`，`/api/vods?type=漫剧&size=3` 返回 `谁说没灵根不能修仙的？之无灵证道第一季/...`；对应 `/api/resolve` 仍返回 `login_required` 与 VIP requirement，确认只恢复展示不放开播放。
- **2026-07-17 X8 播放器图标统一回修断点**：`web/src/x8/X8Home.vue` 按用户指定名称替换播放器控制图标：播放/暂停为 `Play/Pause`、下一集 `StepForward`、声音 `Volume2/VolumeOff`、设置 `Cog`、窗口化 `PictureInPicture`、HLS 打开/关闭全屏 `Maximize/Minimize`、系统全屏 `Fullscreen`。播放器控制图标 PC 统一 `22x22`，手机断点统一 `20x20`，按钮 hover 取消背景仅保留轻微 `scale(1.06)`，右上角 AirPlay 取消圆形背景与毛玻璃，图标同尺寸体系。验证：`npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5150 `/health` 正常，5152 新包 `assets/index-D9pSyzJj.js / assets/index-DZwTkYo4.css`；无头浏览器实测桌面按钮热区 `34x34`、图标 `22x22`、AirPlay 背景透明，手机按钮热区 `30x30`、图标 `20x20`，hover 背景 `rgba(0,0,0,0)`。
- **2026-07-17 X8 HLS 页面内全屏回修断点**：`web/src/x8/X8Home.vue` 将 HLS 全屏从浏览器 Fullscreen API 改为页面内 `playerTheater/theater-mode`，点击后不触发 `document.fullscreenElement`，只隐藏右侧选集、播放信息、下方选集和猜你喜欢，让播放器在页面内铺满视口并保留自定义 HLS 控制条；Esc 或再次点击退出。系统全屏仍只对 `video` 元素调原生全屏，进入前临时打开 `video.controls`，退出后关闭。控制条已去掉前进10秒/后退10秒入口。验证：`npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5150 `/health` 正常，5152 新包 `assets/index-BMLvFRWP.js / assets/index-C2avfgT9.css`；无头浏览器实测 `#/x8/play/921` 点击 HLS 全屏后 `.x8-play.theater-mode=true`、`document.fullscreenElement=null`、右侧选集 `display:none`、`video.controls=false`；点击系统全屏后 `document.fullscreenElement=VIDEO` 且 `video.controls=true`。
- **2026-07-17 X8 头部分类与域名回修断点**：`server/src/routes/vods.ts` 将公共 `/api/types` 从观看权限 `enabledTypeNames(viewer)` 调整为展示权限 `visibleTypeNames(viewer)`，并按后台分类配置顺序返回，避免 X8 头部未登录只剩三个可观看分类；`/api/vods` 等内容列表仍按观看权限过滤，未登录访问 `短剧` 仍返回空列表。`web/src/x8/X8Home.vue` 将头部 logo 域名与预告区水印从 `JPYY21.COM` 统一替换为 `dododmb.com`。验证：`pnpm --dir server build`、`npm run build`、`docker compose up -d --build server web`、`git diff --check` 通过；5150 `/health` 正常，未登录 `/api/types` 返回 `电影/电视剧/动漫/短剧/漫剧`，`/api/vods?type=短剧` 返回空列表；无头浏览器实测 `#/x8` 头部为 `首页/电影/电视剧/动漫/短剧/漫剧`，brand 与 watermark 均为 `dododmb.com`。
- **2026-07-16 X8 播放器设置与全屏图标回修断点**：`web/src/x8/X8Home.vue` 将播放器设置按钮替换为 lucide `<Settings />` 原始路径，不再使用手写齿轮或 bolt；HLS/video 原生全屏未进入时为 `fullscreen`，进入后退出态明确使用 lucide `minimize` 并加 `x8-icon-minimize` class。保持播放器页面最大化为 diagonal maximize，与 HLS 全屏区分。验证：`npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5150 `/health` 正常，5152 新包 `assets/index-BagS8rDd.js / assets/index-CTbZVJT6.css`；浏览器实测 `#/x8/play/921` 设置按钮 title 为“设置”，SVG path 为 lucide Settings 标准路径，HLS 未全屏态为 `x8-icon-fullscreen`。
- **2026-07-16 X8 HLS 全屏状态回修断点**：`web/src/x8/X8Home.vue` 将 HLS 全屏从 `video.requestFullscreen()` 改为 `.x8-video-container.requestFullscreen()`，确保自定义控制条仍在 fullscreen 元素内；新增 `videoBox` 引用，标准 `fullscreenchange` 与 `webkitfullscreenchange` 均同步 `videoFullscreen`，并补 `webkitbeginfullscreen/webkitendfullscreen` 兼容。验证：`npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5150 `/health` 正常，5152 新包 `assets/index-CVY0wvv_.js / assets/index-CTbZVJT6.css`；浏览器实测点击 `HLS 全屏` 后 `document.fullscreenElement` 为 `.x8-video-container`，按钮 title 切为“退出全屏”，SVG class 切为 `x8-lucide x8-icon-minimize`。
- **2026-07-16 X8 播放器弹窗比例回修断点**：`web/src/x8/X8Home.vue` 未直接复制参考站私有播放器代码，改为按其播放器内小浮层比例重做自定义 HLS 控制条弹窗。清晰度弹窗从大卡片压为 `168x136`，每项 `152x38` 横向显示 `1080P/蓝光`；设置弹窗压为 `218x118`，三行 `202x32`，14px 文案，36x20 胶囊开关；倍速二级弹窗压为 `154x214`，列表项 `142x26`，13px 文案。统一半透明毛玻璃 `rgba(18,18,18,.68)+blur(16px)`。验证：`npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5150 `/health` 正常，5152 新包 `assets/index-Cb-Fmmos.js / assets/index-CUF5DwdS.css`；浏览器实测 `#/x8/play/921` 设置/倍速/金牌清晰度三类弹窗尺寸均符合上述数值。
- **2026-07-16 X8 播放器移动端适配回修断点**：`web/src/x8/X8Home.vue` 针对 `max-width:720px` 压缩播放器控制条：高度从 78px 收为 66px，按钮热区改 `30x30`，控制图标 `21px`、设置图标 `23px`、时间 `12px`，清晰度按钮在手机端只保留档位文本并压到约 54px 宽，弹窗 bottom 改 40px 避免贴边。验证：390x844 浏览器实测普通线路控制按钮均在屏内，金牌线路带清晰度时 HLS 全屏按钮位于 `x=344,w=30`，仍在 390 宽内；播放器保持 `390x219` 标准 16:9，设置弹窗 `218x118`、清晰度弹窗 `168x136`，页面 `scrollWidth=381` 无横向页面溢出。
- **2026-07-17 X8 HLS 全屏退出图标回修断点**：`web/src/x8/X8Home.vue` 将 HLS 全屏态退出按钮从四角内收版 `Minimize` 改为更明显的 lucide `Minimize2` 对角线内收路径，避免与非全屏态 `Fullscreen` 四角括号视觉接近。验证：`npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5150 `/health` 正常，5152 新包 `assets/index-CYmB-_zj.js / assets/index-CZYLqrMU.css`；浏览器实测点击 `HLS 全屏` 后 `document.fullscreenElement=.x8-video-container`，按钮 title 为“退出全屏”，SVG class 为 `x8-lucide x8-icon-minimize`，path 为 `M4 14h6v6 / M20 10h-6V4 / m14 10 7-7 / m3 21 7-7`。
- **2026-07-16 X8 播放页布局对齐断点**：按用户截图重新修正 `web/src/x8/X8Home.vue` 播放页：删除下方评论区；上方播放区改为一个深色圆角容器，左侧为 16:9 播放器 + 82px 工具栏，右侧为同高选集栏；外层高度按 `左侧播放器宽度 × 9/16 + 工具栏高度` 锁定，右侧选集在同高区域内滚动，避免选集把容器撑高导致左侧多出黑底。工具栏补齐点赞/点踩/评论/收藏/报错/分享/添加与弹幕输入区域；下方信息区改为 `片名 > 第 N 集`、评分/年份/集数/标签/简介；猜你喜欢继续保留“换一换”，无“更多”。验证：`npm run build`（web）通过，`docker compose up -d --build web` 部署，`5150 /health` 正常，`5152` 新包 `assets/index-BXUeoorl.js / assets/index-CwJX5i8K.css`；2048×1250 浏览器实测 `#/x8/play/921`：外层 `2000x899`、左播放器 `1452x817`、工具栏 `82`、右栏 `548x899`、选集按钮 `64x64`、外层高度差 `0`、右栏高度差 `0`、评论区数量 `0`；`git diff --check` 通过。
- **2026-07-16 X8 搜索栏与底部导航对齐断点**：按用户最新要求和参考站 `https://www.x8kb9k8.com/` 对齐 X8 首页头部搜索与底部：`web/src/x8/X8Home.vue` 搜索框改为常驻展开，输入字号提升到 14px，未聚焦且无输入时通过现有 `api.hot(12)` 热榜接口轮切热门搜索 placeholder，聚焦时恢复“搜索”；底部下载并本地化参考站背景图与 iconfont 到 `web/public/x8/footer-bg.png`、`web/public/x8/iconfont.woff`，三列快捷导航按参考站图标映射、字号 16px/500、卡片高度 145px、分割线 `rgba(255,255,255,.12)`、毛玻璃 `blur(4px)`、透明度和间距对齐。验证：`git diff --check` 通过，X8 UI 禁用符号扫描无命中，`npm run build`（web）通过，`docker compose up -d --build web` 部署，`5150 /health` 正常，`5152` 新包 `assets/index-egmloh5i.js`，本地资源 `/x8/footer-bg.png` 与 `/x8/iconfont.woff` 返回 200；浏览器实测 `#/x8` 搜索 placeholder 从“吞噬星空”轮切到“牧神记”，聚焦后为“搜索”，搜索框宽 418px、输入 14px，footer 背景本地 URL 生效、快捷区高 308px、padding 60px、卡片 `blur(4px)`、图标字体 20px。
- **2026-07-16 X8 详情页按钮与选集规范修复断点**：按参考站 `https://www.x8kb9k8.com/detail/145325` 的 `InfoRight / PlayBox / PlayListBox` 细节复核，修正 `web/src/x8/X8Home.vue` 详情页信息区、动作区和选集区：左侧封面为 236x340，右侧 `.x8-detail-main` 锁定 `height/max-height:340px` 并 `justify-content:space-between`；主演行复用自适应模板 `vod.people` 数据，有头像时显示 28px 圆头像，无头像时显示姓名首字占位，点击演员走搜索；立即播放旁只保留一个真实“追剧/已追剧”按钮，加载 `/api/user/vods/:id/state` 状态，未登录点击进 `/x8/login`，已登录调用 follow/unfollow；主按钮图标固定 24x24 实心黑色；统计栏评分/热度图标放大到 19px；头部分类字号从 16px 调整到 17px；选集区支持多线路 tabs、升序/倒序、196px 固定高度滚动。验证：`npm run build`（web）通过，`docker compose up -d --build web` 部署，`5150 /health` 正常，`5152` 新包 `assets/index-DU8u7lmB.js`，浏览器硬刷 `#/x8/detail/921` 实测主演显示 6 个 28px 圆头像、旧三按钮数量为 0、只剩一个 108x60 追剧按钮、统计图标 19px、头部分类 17px，正文无旧符号，`git diff --check` 通过。
- **2026-07-16 前台分类按观看权限过滤断点**：定位 X8 未登录仍显示/进入 VIP 类内容的根因有两层：① `server/src/publicVod.ts::enabledTypeNames()` 仍返回 `visibleTypeNames(display)`，公共 `/api/types`、`/api/vods`、详情、相关、热榜等内容入口只按展示权限过滤，不按观看权限过滤；后台当前 `短剧/漫剧` 为 `display=public, watch=vip`，所以未登录仍能看到列表数据，只在 resolve 播放时被拦。② `web/src/x8/X8Home.vue` 头部 `navItems` 对 `电影/电视剧/综艺/动漫/短剧` 做了固定 fallback，即使 `/api/types` 没返回也会硬显示。已改为 `enabledTypeNames()` 返回 `watchableTypeNames()`，公共内容列表/详情/分类聚合统一按观看权限过滤；X8 头部只渲染 `/api/types` 实际返回的分类，不再硬补。验证：未登录 `/api/types` 返回 `动漫/电视剧/电影`，`/api/vods?type=短剧` 返回 0 条，浏览器 X8 头部仅显示 `首页/电影/电视剧/动漫`。已 `npm run build`（server/web）、`docker compose up -d --build server web`、`5150 /health`、`5152` 新包 `assets/index-CB3AWIJG.js`、`git diff --check` 通过。
- **2026-07-16 X8 详情页路由与样式统一断点**：按参考站 `https://www.x8kb9k8.com/detail/145325` 抓取确认详情页结构为 `detail__MovieDetailContainer / InfoBox / CardImg / InfoRight / Info / PlayBox / VideoIntro / PlayListBox`：左侧 sticky 海报，右侧标题、标签、导演/主演/别名/语言，立即播放与收藏/添加/分享按钮，下方评分/热度/上映/片长指标，简介、播放器选集与猜你喜欢。`web/src/x8/X8Home.vue` 已将 X8 首页 Hero、影片卡、分类列表、排行榜、相关推荐的影片点击统一改为进入 `#/x8/detail/:id`，只有详情页“立即播放”、海报播放遮罩和选集按钮进入 `#/x8/play/:id`。详情页样式按参考站补齐海报尺寸、按钮组、指标栏、简介、选集和猜你喜欢；移动断点改为纵向海报+信息。已 `npm run build`（web）、`docker compose up -d --build web`、`5150 /health`、`5152` 新包 `assets/index-B0A6C4XK.js`、`git diff --check` 通过；浏览器本地实测点击 X8 首页第一张卡进入 `#/x8/detail/921`，详情渲染海报/标签/播放按钮/指标/149集选集，再点“立即播放”进入 `#/x8/play/921`。
- **2026-07-16 X8 播放器清晰度切换断点**：`web/src/x8/X8Home.vue` 补齐 X8 播放页播放器内右上角清晰度浮层，消费 `/api/resolve` 返回的 `qualities`。多档金牌线路显示“自动”并可下拉切换蓝光/高清/标清；单档线路也显示实际档名（如“高清”）。切换清晰度时保留当前播放进度，重新 attach 对应 URL 后在 `loadedmetadata` 回跳。已 `npm run build`（web）、`docker compose up -d --build web` 部署，`5150 /health`、`5152` 新包 `assets/index-ChgheZbP.js`、resolve API 与浏览器本地 X8 页面实测通过：`#/x8/play/921` 金牌显示“自动/蓝光/高清/标清”，`#/x8/play/184923` 显示“高清”。
- **2026-07-15 X8 模板整站前端重构断点**：按实时参考站 `https://www.x8kb9k8.com/` 重新抓取首页 HTML、Next.js 静态资源清单与 styled-components 样式，确认页面体系为：首页 `/`、分类 `/vod/show/id/:id`、详情 `/detail/:id`、播放 `/vod/play/:id/sid/:sid`、排行 `/rank`、登录 `/login`。`web/src/x8/X8Home.vue` 已从旧单页皮肤重构为 X8 整站前端壳：固定透明顶部导航、搜索胶囊、全屏 Banner、`正在热播` 海报卡墙、`新片预告` 左视频框 + 右品牌水印 + 缩略图、`最新电影/电视剧/综艺/动漫/短剧 + 对应热榜` 的左右布局，以及分类/搜索、排行榜、详情、播放、登录壳。删除旧版自创首页小卡条/分类面板/错误 trailer 右侧榜单等参考站没有的模块。`web/src/main.js` 新增 `/x8/show/:type`、`/x8/detail/:id`、`/x8/login` 路由。已 `pnpm --dir web build`、`docker compose up -d --build web`、`5150 /health`、`5152` 200、`git diff --check` 通过；浏览器实测桌面首页首屏、热播/预告、最新+热榜、排行、分类页与移动宽度非空正常。注意：截图中出现的“发现新版本”是现有 PWA 更新提示，不属于 X8 模板。
- **2026-07-15 X8 字号/列数二次对齐断点**：根据参考站 styled-components 断点复核：热播网格 `.golOll` 为桌面 `7`、`max-width:1750` 为 `6`；带右侧短热榜的普通分区卡片使用 short-rank-card 档位，标题/评分在 `1400-1749` 宽度降为 `14px/16px`。`web/src/x8/X8Home.vue` 已调整：1440 宽实测热播 6 列、分区左侧 6 列；section 标题修正为 `28px/600`（之前被 `.x8-page button { font: inherit }` 覆盖成 16px），热播卡名/评分为 `16px/18px`，分区卡名/评分为 `14px/16px`，gap 对齐 `19.9px/16px`。已重新 `pnpm --dir web build`、`docker compose up -d --build web`、`5150 /health`、`git diff --check`，浏览器计算值复测通过。
- **2026-07-15 X8 卡片高度/热播填充断点**：继续按参考站卡片 CSS 对齐：`1400-1749` 桌面段普通热播卡片固定视觉高度 `347.53px`，带右侧短榜分区卡片固定 `300px`，不再按自然海报比例压矮。`正在热播` 展示数量改为按当前列数自动取两排（`>=1750:7*2`、`1025-1749:6*2`、`721-1024:4*2`、移动 `2*2`）；当 `/api/hot` 返回不足时，自动用首页 hero 与各分区列表去重补足，避免出现一排半或第三排残项。1440 宽浏览器实测：热播 `12` 条、`6+6` 两排，热播卡片 `347.52px`，分区卡片 `12` 条、`6` 列、`300px`。已 `pnpm --dir web build`、`docker compose up -d --build web`、`5150 /health`、`git diff --check` 通过。
- **2026-07-15 X8 Hero/Footer/图标对齐断点**：按参考站 `banner__BannerContainer` / `banner__SlideContentAction` 结构重做首页 Hero：`padding-top:49.18%`，图片居中铺满，底部 `160px` blur mask + 渐变，左下 `SlideContentAction` 文案层，分页点为 `32px` 高胶囊；桌面 1440 实测 Hero 高 `704px`、分页点 `184x32`。顶部工具图标统一为按钮 `30x40`、svg `16x16`、登录按钮 `56x28`，修正图标小和垂直不齐。新增 X8 footer：影视分类/内容推荐/用户中心三列快捷卡片 + 帮助中心/常见问题/意见反馈/隐私政策 + `© 2026 ADY-All Rights Reserved`，样式按参考站 footer 间距、卡片高度、毛玻璃背景。已 `pnpm --dir web build`、`docker compose up -d --build web`、`5150 /health`、`5152` 200、`git diff --check`，浏览器首屏和 footer 截图实测通过。
- **2026-07-15 采集源仅清洗管理断点**：`admin/src/views/Sources.vue` 采集源管理页补齐源级 `cleanOnly` 操作：工具栏新增“全部开启仅清洗/全部关闭仅清洗”批量按钮，表格在“启用”后新增“仅清洗”开关列并走 `toggleCleanOnly(row)` 单源保存，新增/编辑弹窗新增“仅清洗”开关说明；新增源默认 `cleanOnly:false`，保存沿用 `addSource/updateSource` 透传，批量切换先二次确认再走 `api.batchCleanOnlySources` 后刷新列表。`admin/src/api/index.js` 新增 `batchCleanOnlySources(enabled, ids)`。代码审查补齐反范式新鲜度：`collector/sync.ts` 在采集更新线路剧集/通道类型变化时重置 `Play.hasCleanResult=false`，`routes/sources.ts` 播放域名替换也同步重置，避免旧 clean 标记误放行已变化线路。已 `npx tsc --noEmit`（server）与 `npm run build`（admin）通过。
- **2026-07-15 HLS 暂停态仍更新进度断点**：定位任务 `6865/6866/6868` 显示“等待中”但实际仍在跑的根因：`runHlsCleanTask().runQueue()` 用 `Promise.all(workers)`，首个 worker 收到暂停信号后立即 reject 并把任务置为 `paused`，但其它已在 `runHlsCleanForEpisode()` 内的 worker 不会被取消，完成后继续写 `pageNow/progress/message`，造成 `paused` 行仍增长。`server/src/collector/taskRunner.ts` 已改为共享 `stopSignal`，暂停/中止时停止领取新任务、等待所有 worker 收尾后再统一抛出 `__PAUSED__/__CANCELED__`，避免 paused/canceled 后还有 worker 写进度。已 `npx tsc --noEmit` 通过。
- **2026-07-15 后台概览内容运营升级断点**：按“去掉运行任务/排队任务/任务+清洗，主要显示影片信息”的方向重做后台 `Dashboard.vue`。顶部指标改为影片总数、在线影片、可播放影片、播放线路、今日新增、今日更新、近7天新增、近7天更新；中段新增“今日内容动态”（最近新增/最近更新）与“待处理”（无线路、全死链、无封面、无官方封面、元数据待处理、清洗失败）；底部新增“分类分布”表格（总量/在线/可播放/今日新增/今日更新/可播放率）与“采集源贡献”表格（影片/线路/今日新增/今日更新/仅清洗/最近采集）。`/api/stats` 改为后台鉴权接口，返回兼容旧字段 `vods/plays/sources/online` 及新增 dashboard 结构，并复用 `publicPlayableFilter(sourceIds, cleanOnlySourceIds)` 计算 cleanOnly 后的可播放量。已 `npx tsc --noEmit`、`npm run build`、`docker compose up -d --build server admin`、`/health` 验证通过。
- **2026-07-15 手势返回闪动·方案B断点**：落地「压缩空窗期」方案。① `web/src/mobile/MobileShell.vue`：新增手势返回判定（二级页 `/m/play`、`/m/search` 上边缘 30px 内 touchstart + 横向位移 >12px 记录时间戳，1.5s 内收到 `popstate` 即判定为系统手势返回），命中后 `syncPageTransition` 将本次导航 transition 置为 `m-page-none`（同步换页，不再二次播 `m-pop` 动画）；程序化返回按钮不受影响，仍播 `m-pop`。② `web/src/main.js`：`scrollBehavior` 改为 `savedPosition || { top: 0 }`，浏览器返回（popstate）时还原列表滚动位置，配合已有 keep-alive 消除「返回像刷新」。无 `beforeEach` 异步守卫，无需跳过项。已 `pnpm --dir web build` 通过并 `docker compose up -d --build web` 部署。遗留：方案B是缓解不是根除，低端机极端情况仍可能一帧闪；治本需方案A（二级页 overlay 层叠路由），待老大拍板。
- **2026-07-14 移动首页卡片标题样式断点**：`web/src/mobile/MobileHome.vue` 中 `/m` 首页普通影片卡片与继续观看卡片标题（`.mh-card strong` / `.mh-history strong`）从 `13px` 调整为 `14px`，并显式设置 `font-weight: 500`；副文本样式未动。已 `pnpm --dir web build` 通过。
- **2026-07-14 移动端卡片标题单行断点**：移动模板卡片下方影片标题统一最多一行，超出显示省略号：覆盖首页/继续看（`MobileHome.vue`）、剧场榜单/列表（`MobileTheater.vue`）、搜索推荐/榜单/结果（`MobileSearch.vue`）、刷剧相关推荐（`MobileShorts.vue`）。播放页相关推荐与我的页卡片此前已是单行省略。已 `pnpm --dir web build` 通过。
- **2026-07-14 移动搜索页样式断点**：`web/src/mobile/MobileSearch.vue` 搜索栏调整为浅灰底 44px 圆角胶囊输入框，右侧“搜索”为黑色粗体；热榜文案改为“综合热搜榜/短剧热榜/动漫热榜/电影热榜”，榜单面板改浅粉浅青背景，tab 选中黑色粗体、未选中灰色，前三名序号标记使用独立高亮样式；搜索页卡片标题统一 `14px / 500`。
- **2026-07-14 移动端影视卡片标题规范断点**：此前没有统一全局规范，首页/剧场/搜索/刷剧相关推荐/播放页相关推荐/我的页影视卡片标题在各 scoped 样式中分别硬编码，存在 `12px/13px/15px` 与默认字重差异。现于 `web/src/style.css` 增加全局参数 `--mobile-vod-card-title-size: 14px`、`--mobile-vod-card-title-weight: 500`、`--mobile-vod-card-title-line: 1.25`、`--mobile-vod-card-title-color: #1f232b`，并让 `/m` 移动模板各影视卡片标题统一引用；旧自适应模板移动断点 `.c-name` 也接入同一参数。
- **2026-07-14 移动首页/剧场标题右侧文字断点**：`MobileHome.vue` 与 `MobileTheater.vue` 分类标题栏右侧文字（如“全部/更多/全部影片”）保持 `13px`，字重从 `800` 调整为 `500`；移动首页 Hero “立即播放/追剧”按钮文字显式调整为 `14px`，并为按钮加 `justify-content:center` 与 `line-height:1` 修正文字/图标居中。
- **2026-07-14 移动搜索热榜背景断点**：`MobileSearch.vue` 热搜榜面板左右扩展至屏幕边缘无边距，面板圆角取消；背景渐变右侧改为浅绿色；热榜 tab 文案选中/未选中字重统一为 `500`。
- **2026-07-14 移动首页 Hero 按钮对齐断点**：`MobileHome.vue` Hero “立即播放/追剧”按钮文字用 `.mh-action-label` 包裹，配合 `inline-flex + justify-content:center + align-items:center` 让图标与文字作为整体居中；图标文字间距从 `5px` 收到 `3px`，按钮文字字重从 `900` 降为 `800`。
- **2026-07-14 移动搜索页返回与热榜角标断点**：`MobileSearch.vue` 搜索页返回按钮点击区从 `30px` 增至 `34px`，返回图标从 `20px` 增至 `23px`；热榜贴屏面板保留顶部 `10px` 小圆角；前三名榜单角标增加左上角斜向高光伪元素，形成光束照射效果。
- **2026-07-14 前台评分格式断点**：新增 `server/src/publicVod.ts::formatPublicRating`，前台公开影片序列化与用户推荐接口统一将评分最多保留 1 位小数并四舍五入（如 `8.12 -> 8.1`、`8.25 -> 8.3`），无有效评分仍返回 `null`；后台管理编辑原始评分逻辑不变。
- **2026-07-14 移动首页 Hero 按钮整体居中断点**：`MobileHome.vue` Hero “立即播放/追剧”按钮改成按钮容器内只放一个 `.mh-action-inner`，由该内部元素包裹图标与文字并统一 `inline-flex + align-items:center + justify-content:center`；按钮本身只负责容器居中，避免 svg 与文字分别参与按钮布局导致视觉不齐。
- **2026-07-14 PWA 更新提示断点**：`web/src/pwa.js` 原逻辑发现新 Service Worker 后立即 `skipWaiting` 并触发 `controllerchange` 自动 reload，导致“发现新版本”提示经常不可见。现改为 `markUpdateReady`：发现 `registration.waiting` 或新 worker `installed` 时只保存 waiting worker 并触发 UI 提示，用户点击“立即升级”后才 `SKIP_WAITING` 激活并 reload。
- **2026-07-14 前台文字规范断点**：`web/src/style.css` 增加 `--mobile-control-text-size: 14px`、`--mobile-control-text-weight: 500`、`--small-text-max-weight: 500`。剧场页顶部分类、排序入口、筛选弹窗分组标题、筛选项按钮、底部“重置/完成”统一接入 `14px / 500`；前台 `web/src` 内同一 CSS 规则中凡 `font-size < 14px` 且 `font-weight > 500` 的样式统一压到 `var(--small-text-max-weight)`，复扫违规项为 0。后台 admin 不在此次视觉规范范围内。
- **2026-07-14 移动剧场卡片标签层级回修断点**：`MobileTheater.vue` 剧场片源卡片海报标签 `vod.remarks` 与热榜序号增加明确 `z-index:2`，高于全局 `.m-img-fade` 图片层级，修复标签在图片加载前闪现、图片加载后被盖住的问题。已定因：全局图片淡入类为骨架方案设置了 `position:relative; z-index:1`，剧场局部覆盖层此前未声明层级。
- **2026-07-15 移动剧场卡片评分标签断点**：`MobileTheater.vue` 剧场影片列表卡片海报左下继续显示 `vod.remarks`，右上新增 `vod.rating` 评分标签，样式沿用首页卡片评分胶囊（红底白字、10px、小字字重规范），并保留 `z-index:2` 避免被图片淡入层覆盖。
- **2026-07-15 前台用户账号规则断点**：`server/src/routes/users.ts` 收口前台用户 `WebUser` 账号规则：注册账号统一小写入库，用户名 4-32 位字母/数字/下划线且不能纯数字，密码最少 6 位；注册查重与登录改为大小写不敏感。后台用户管理保留启用/禁用，并新增删除前台用户接口与按钮；删除会走 Prisma 关系清理用户追剧/观看历史/旧分组，邀请码使用记录按外键置空。`AuthModal.vue` 注册提示同步为“4-32位字母/数字/下划线，不能纯数字”。
- **2026-07-15 PWA 首次加载刷新修复断点**：`web/vite.config.js` 生成的 `sw.js` 不再在 `install` 阶段无条件 `self.skipWaiting()`，避免新 SW 首次安装后立刻激活；`web/src/pwa.js` 的 `controllerchange` 增加 `userActivatedUpdate` 门闩，只有用户点击“立即升级”触发 `SKIP_WAITING` 后才 reload。修复首次打开页面/首次被 SW 接管时页面自动刷新一次的问题，同时保留手动升级后的自动刷新。
- **2026-07-15 移动评分与搜索状态标签断点**：移动端评分胶囊字重统一为 `600`，覆盖首页、剧场、我的页推荐卡片及 PC/自适应通用 `.score-badge`。`MobileSearch.vue` 猜你想搜从 3 列改为 4 列，每批展示 4 个；搜索页状态标签新增统一 `vodStatus()`，将 `完结`、`全N集`、`更新至N集` 拆成独立状态，修复此前把“更新至149集”误显示为“全149集”的问题。无集数/完结信息时不硬猜，只显示分类或原始备注。
- **2026-07-15 HLS 严格 clean 播放开关断点**：`HlsCleanConfig` 新增 `requireCleanPlayback`。后台 `HLS 广告清洗` 配置页新增“只播 clean 片源”开关；开启后 `/api/resolve` 在 HLS 清洗总开关开启但找不到可用 clean 结果时返回 `ok:false / code:hls_clean_missing`，不再回退原始源。`播放缺失时排队` 语义收窄为“找不到 clean 结果时自动提交后台清洗任务”，只控制是否创建 HLS 清洗任务，不再暗示回退策略。
- **2026-07-15 移动评分标签字重断点**：`web/src/mobile/MobileHome.vue` 热播推荐/首页影片卡片评分 `.mh-score` 与 `web/src/mobile/MobileTheater.vue` 剧场影片卡片评分 `.mt-score` 字重从 `600` 调整为 `700`，文字大小仍为 `10px`。
- **2026-07-15 X8 自适应模板断点**：新增 `web/src/x8/X8Home.vue`，参考 `https://www.x8kb9k8.com/#trailer-panel` 的深色影院首页结构另起自适应模板：透明固定顶部导航、全屏海报 Hero、横向小卡条、分类面板、正在热播、`#trailer-panel` 新片预告区、分区影片卡片与搜索/分类浏览。新增预览路由 `#/x8`；`homeConfig.adaptiveTemplate` 新增 `default/x8`，后台 `站点设置 -> 首页设置` 可切换“自适应首页模板”，默认保持旧模板不变。
- **2026-07-15 X8 分类筛选完善断点**：`web/src/x8/X8Home.vue` 浏览页补齐目标站分类页式横向筛选条：分类、类型(subtypes)、年份(years)、排序四行胶囊；移动端横向滚动，桌面端自动换行。接口沿用 `/api/types`、`/api/subtypes`、`/api/years`、`/api/vods`，筛选条件写入当前 `#/x8` 或根路径 query。
- **2026-07-15 X8 整站模板补强断点**：X8 不再只做首页骨架，`X8Home.vue` 扩展为模板壳：支持 `#/x8` 首页、`#/x8?type=` 分类/搜索、`#/x8/rank` 完整排行榜、`#/x8/play/:id` 播放页；站点正式启用 `adaptiveTemplate=x8` 时，根路径和 `/play/:id` 也走同一套 X8 视觉，避免首页 X8、播放页旧 PC 的割裂。样式补齐参考站暗色体系、12px 卡片、搜索/按钮过渡、卡片 hover 放大信息层、排行榜密排行、播放页大播放器+右侧详情+选集布局、右侧悬浮圆按钮与移动端两列断点。
- **2026-07-15 X8 首页一致性回修断点**：按参考站首页重新收窄 X8 首页：去掉自创 Hero 标题文案和首页分类卡面板；首屏保留顶部黑色导航、全幅 Banner、底部横向预告小卡；“正在热播”改为 6 列海报卡片墙并在桌面 hover 时显示信息遮罩/添加按钮；`#trailer-panel` 改为左侧黑色视频预告框、右侧品牌水印与底部预告缩略图，下面再接“最新电影/电视剧/动漫”等内容流。早期曾误加“世界杯”静态入口，后续已移除，顶部导航只展示实际分类。当前优先保证首页一致性，排行/播放页暂不继续扩展。
- **2026-07-15 HLS 清洗结果标记回修断点**：`runHlsCleanForEpisode()` 补回清洗结果 `upsert` 包裹，修复服务端构建时 `cleaner.ts` 对象字面量裸露导致的 TS 语法错误；成功产出 `clean` 时同步写 `Play.hasCleanResult=true`，用于仅展示/播放 clean 片源的列表过滤。同步数据库 schema 前清理了 229 条无对应 `Play` 的孤儿 `HlsCleanResult`，随后 `prisma db push` 通过。
- **2026-07-14 时长指纹二次扫断点**：`server/src/hls/cleaner.ts` 在 `duration_pattern_fingerprint_v1` 自学习后，将本次新入库源级指纹数量写入 `evidence.durationPattern.newFingerprints`；`server/src/collector/taskRunner.ts` 在同一 HLS 清洗任务第一轮完成后，若某采集源本轮新增了时长指纹，会把该源第一轮结果为 `no_ads/uncertain` 的集数追加二次扫。最终任务统计按每集最后一次状态计算，不重复累计；无新增指纹、非时长指纹策略、失败结果不触发二次扫。已 `pnpm --dir server build` 通过。
- **2026-07-13 HLS 时长序列指纹清洗策略（新增第3策略 + 源级自学习指纹库）断点**：新增第 3 个清洗策略 `duration_pattern_fingerprint_v1`（`server/src/hls/cleaner.ts`），**不动**现有 `discontinuity_profile_v1` / `foreign_ad_block_fingerprint_v1` 两策略。**定因**：如意源（`ryiplay18/ryplay1x` 系）贴片广告与正片**同目录同前缀、同 1920×1080 同编码**，原两策略的准入门槛（路径差异/编码画像差异）全部撞墙 → 广告 100% 漏检（《金特务》1121 号 6 集全被误判 no_ads，实为每集含 1~2 处 21s 赌博贴片）。**判据**：纯解析 m3u8 文本（EXTINF 时长序列 + DISCONTINUITY 分块 + 段名重复），**零额外流量**（不 probe、不下载 ts）。两级：①Tier1 铁证——块内多数段在清单内**重复引用**（循环插入广告）→ conf95，并抽取该块**高区分度时长前缀**（前缀含 ≥2 个偏离 4.00s 基准的异常值，如 `4.00,5.48,4.00,3.24`）自学入库；②Tier2——用**源级指纹库**扫全片候选块，命中单次插入的同款广告 → conf90。**源级自学习**：新增独立表 `HlsAdFingerprint(sourceId, prefix, segCount, seenCount)`，`runHlsCleanForEpisode` 清洗前 `loadDurSigLib(sourceId)` 载入、清洗后 `persistDurSigLib` 沉淀铁证块指纹；同源跨片复用（同一条广告在整源内时长指纹恒定）。**误杀防线**：前缀区分度门槛（杜绝 `4,4,4` 通用序列入库）+ 块形态门槛（3~12 段、12~45s）+ 保留 30% 安全阀 + `minConfidence` 门槛。**验证**：①离线 6 集逐段指纹比对；②容器内**真实** `runHlsCleanForEpisode` 端到端（走完整 DB 链路）：第5集 Tier1 自学入库→第4/1集靠库 conf90 命中，全片 10 处广告位精确命中、正片 0 误杀；③跨片验证 5 部同源片（蓝海/风险社会/至死不渝/度假季/疾患）命中位置均为典型广告位、风险社会指纹+段名重复双确认。已 `pnpm --dir server build`、`prisma db push`、`git diff --check`、`docker compose up -d --build server` 通过；全局默认策略链已追加该策略（`HlsCleanConfig.defaultStrategy = discontinuity_profile_v1,foreign_ad_block_fingerprint_v1,duration_pattern_fingerprint_v1`）。⚠️ **接班切入点**：一个指纹只覆盖“同一条广告”，覆盖率随清洗量自增长（源内出现循环插入实例即自动扩库）；已清洗过的旧结果需**重扫一次**才会用上新策略/新指纹（旧 `HlsCleanResult.strategyId` 不含新策略）。如需对存量批量补扫，走后台 HLS 清洗任务重新排队即可。
- **2026-07-13 影片库清洗广告入口断点**：`admin/src/views/Vods.vue` 影片库新增两处清洗广告入口：①每行**操作菜单**（`···` 下拉）-> “清洗广告”；②**批量操作栏**（勾选多部影片后）-> “清洗广告”按钮。点击弹出清洗对话框——**清洗策略**多选（空=默认策略链，可选禁用/指定单策略）、**集数**（全部集/仅第1集）、提交后 `GET /admin/vods` 拉线路 `playIds` → `POST /admin/hls-clean/tasks` 后台排队执行。`admin/src/api/index.js` 新增 `hlsCleanTask` 接口。已 `npm run build`、`docker compose up -d --build admin` 通过；5151 新包 `index-mNMR9xNO.js` 已含“清洗广告”字样。
- **2026-07-13 后台清洗结果广告位置/命中策略展示断点**：`admin/src/views/HlsClean.vue`（菜单名 **“播放治理”** → 页标题 **HLS 广告清洗**）清洗结果区展开行（逐集明细）增强：①新增**命中策略**列——优先取 `evidence.matchedStrategy`（真正产生广告判定的那个策略，clean 结果绿色 tag 高亮），不再只显整条策略链；②**广告位置**列——逐段展示 `起止(mm:ss) · 时长 · 置信 · 命中原因`。**纯前端改动**：后端 `GET /api/admin/hls-clean/results?mode=flat` 已现成返回 `adRanges`(含 start/end/duration/confidence/reason) + `evidence.matchedStrategy`，无需改后端；新增前端 helper `strategyLabel/matchedStrategyLabel/secToClock/adRangeLines`。已 `npm run build`、`git diff --check`、`docker compose up -d --build admin` 通过；5151 新包 `index-ymcIMRFE.js` 已含“命中策略/广告位置”两列；真实数据校验 `playId=55234` 第1集展示 `6:26~6:47 · 21s · 置信90 · 时长序列前缀匹配已知广告指纹`、命中策略 `时长序列指纹`。

**代码状态**：移动模板筛选/播放器手势修复待提交｜上一代码提交：`fix: polish mobile pwa experience`
**运行状态**：4 容器全在线（postgres healthy / server·admin·web 已于 2026-07-13 重建：server 上线 HLS 第3策略、admin 上线清洗结果广告位置/命中策略展示）

### 🟢 100% 已完成
- **后端全链路 API**：采集源管理、采集任务引擎(taskRunner)+ 定时调度、MacCMS 适配、元数据补全（豆瓣/TMDB）、分类/去重、**HLS 清洗去广告**、播放解析(resolve)+代理(hlsProxy/playProxy)。
- **用户与权限**：后台管理员 + Web 用户体系、VIP 等级、邀请码、登录限流、访问审计(AccessAudit)+ 操作审计(AuditLog)。
- **站点运营**：站点/主题配置(15 原子 token 主题系统)、热榜配置、分类访问控制、聚合计数缓存（浏览/分页/搜索提速 + P0 索引）。
- **运营后台**：12 个页面全部落地（Login/Dashboard/Sources/Vods/Categories/Tasks/Meta/Site/Users/Hot/Access/HlsClean）。
- **观众前端**：PC 端（Home/Play/Shorts/Auth/Profile）+ 移动端模板（Shell/Home/Search/Shorts/Theater/Me）。

### 🟡 正在进行
- **元数据匹配**：匹配源由 `MetaConfig.providersConfig` 决定，目前内置豆瓣/TMDB。命中后写入 `metaSource/metaSourceId` 标注来源，并落库评分、简介、类型、官方封面、剧照、人物与别名；旧 `doubanId` 仅作为豆瓣来源兼容字段。图片只落两类资产：竖版海报(`poster`/`officialPic`)与横图(`backdrop`/Hero)。匹配写库前会探测候选图尺寸，低清候选不覆盖更好的原采集源封面；匹配/人工确认后同步影片 `year` 并清聚合缓存。
- **移动端模板收口**：`/m/me` 已替换占位，展示登录/会员权益/观看历史/追剧/推荐；后台 `站点设置 -> 首页设置 -> 移动端模板` 已恢复 `homeConfig.mobileTemplate` 开关；开启 `shortDrama` 后，仅手机 UA 会从 PC 首页自动跳转到 `/m` 模板，iPad/tablet/桌面窄窗口不再被自动跳转；`/m` 首页 Hero 已由单条推荐升级为多条轮播，沿用原大卡样式，支持手势/点位/自动轮播，过渡为方向感轻滑淡入；Hero 切换已从 `out-in` 顺序切换改为同步叠层切换，旧图淡出时新图同步淡入，不再露出底层背景；`/m/search` 顶部浏览器颜色与剧场页背景统一；`/m/shorts` 有声自动播放被浏览器拦截时会先静音播放并显示“轻触开启声音”，真正 `playing` 前不隐藏封面；iOS PWA 兼容：静态状态栏 meta 已改为 `black-translucent`，移动模板运行期会同步写入 `html/body` 的 `background` 与 `background-color`，全集态播放器恢复 `100dvh` 全屏铺底，避免 PWA 状态栏和播放器顶部被安全区裁短；PWA 更新链路已改为页面已完成 load 时也会立即注册 SW，新版 SW 安装后自动 `skipWaiting`/`clients.claim`，页面 focus/pageshow/回前台时主动 `registration.update()`，避免 iOS 桌面版长期卡旧壳；刷剧底部 UI 已按漫游态/全集态拆分：漫游态标题/标签/简介整体下移，降低黑色遮罩、底部条全宽无圆角并贴合导航，横条 blur 已降低，文案为“观看完整{分类} · 全 N 集 · 免费观看”，进度条位于底部条上沿并上移 1px，进度点不再被横条容器裁剪；头部筛选/搜索和右侧追剧/点赞/分享按钮已去背景，头部控制层固定为当前激活卡，不随卡片切换位移，头部图标间距已内收，漫游态右侧动作区底部已和简介区对齐；全集态隐藏主导航，顶部左侧为返回箭头 + 小字号集数标题，位置和图标尺寸与漫游态头部一致，右侧仅保留搜索与更多，中央播放按钮改为无背景通用播放图标，打开声音与全屏观看统一为居中并排胶囊提示，开声后只保留全屏观看，底部进度条轨道位于选集条黑区上沿上方 1px，选集条位于底部黑色安全区内，右侧为独立方形清屏观看按钮，底部黑区高度与移动底部菜单栏一致为 `62px + safe-area`，选集胶囊高度为 36px，上下各 13px 居中，胶囊按固定横向网格与黑底左右对齐，文字左对齐且垂直居中；刷剧筛选已支持主分类/小分类多选、已选 tag、一键重置和 localStorage 持久化，刷新/重进/登录态刷新后保留已应用筛选；筛选面板底部按钮白底延伸覆盖 safe-area；短剧流和筛选项按“可展示分类”返回，播放时仍由 `resolve` 判断登录/VIP/等级权限；登录、登出或 VIP 状态变化后，移动刷剧页会清播放缓存并立即重拉站点配置、筛选项和 feed；从“登录后继续观看”权限锁打开登录弹窗后，登录成功会强制刷新用户态、清除锁层、重拉权限数据并回到当前卡重新调度播放。
- **影片维护能力**：后台影片详情可设置单片自动采集周期（按天间隔或固定周几），调度器每 10 分钟扫描到期影片并重拉现有片源详情，可选同步豆瓣与提交 HLS 清洗；影片清理支持按分类/子分类叠加年份过滤，并新增按分类删除、无封面、无豆瓣封面、无横图/Hero 图等规则；清理预检候选支持手动排除，执行时后端会按排除 ID 真正剔除。
- **2026-07-11 视觉断点**：移动剧场默认列表恢复 24 条分页，影片卡片网格改为一行 3 个；首页快捷分类 `.mh-cats button` 与剧场顶部分类 `.mt-types button` 去掉 box-shadow；剧场筛选抽屉的点击遮罩保留但去掉黑色蒙版；刷剧全集态顶部降低黑色渐变蒙版，返回/集数/搜索/更多改为轻微高斯感 drop-shadow 与淡 shadow，不再像黑底按钮，顶部左右边距为 10px、左右组 gap 为 0、集数标题 shadow 收敛到 `0 0 4px`；刷剧筛选底部操作栏为半透明白底加 `blur(4px)`。
- **2026-07-11 缓存断点**：移动剧场已新增本地 stale-while-revalidate 缓存，影片列表、热播榜、小分类、年份筛选会先读 `vcms.mobile.theater.cache.v1` 秒出旧数据，再后台异步请求最新数据，有变化再替换，避免刷新/切页白屏闪烁。
- **2026-07-11 HLS清洗结果聚合断点**：`/api/admin/hls-clean/results` 接口重构为默认「按影片+源(playId)聚合」模式（`mode=grouped`，一行=一条线路，返回 `vodName/sourceName/episodes/statusCounts/lastCheckedAt`），解决同片多集平铺+不显示影片/源名的问题；传 `playId` 或 `mode=flat` 回退逐集明细（供前端展开行）；支持 `kw`(片名模糊)/`sourceId`/`status` 筛选、`page/size` 分页。前端 `admin/src/views/HlsClean.vue` 结果区改为：顶部筛选栏(片名搜索/源下拉/状态下拉)+聚合表(展开行懒加载逐集明细)+分页；新增 state `grouped/resultLoading/resultTotal/resultFilter` 与 `loadResults()/onExpand()`，`onMounted` 同时调 `load()` 与 `loadResults(1)`。已 build+上线，实测：搜「太平年」精准命中 playId 355219(如意源/10集/clean 10)、flat 明细返回 10 集、`sourceId=1&status=clean` total=459、无匹配 kw total=0。
- **2026-07-11 豆瓣候选重试断点**：`server/src/collector/douban.ts` 的 `doubanSuggest` 拆出内部 `runSuggestChain`，五级兜底全空时在冷却窗口(`SUGGEST_RETRY_COOLDOWN=8s`)外隔 `SUGGEST_RETRY_DELAY=1.5s` 整体重试 1 次，救豆瓣瞬时风控；纯内部增量，未改函数签名/返回结构/成功路径。⚠ 已定因：豆瓣当前对服务器出口IP `43.165.175.8` 做**持续IP级风控**（搜索入口 302→`/misc/sorry`、rexxar `need_login`），登录 Cookie(dbcl2 有效)也解不了搜索、仅详情接口可用；重试只能救「忽好忽坏」的瞬时空，救不了持续封禁。**根治待办**：给 `getJson` 加 `DOUBAN_PROXY`(住宅隧道代理)换出口IP —— 代码框架尚未落地，等老大提供代理地址。
- **2026-07-11 图标断点**：移动底栏“刷剧”图标已切换为 lucide `tv-minimal-play` 形态，剧场图标已切换为 lucide `film` 形态，刷剧追剧图标使用 lucide `heart`，中央播放按钮使用 lucide `circle-play`，和首页/我的保持线性图标体系一致。
- **2026-07-11 播放图标断点**：全局用户侧播放按钮已统一为纯 `play` 三角实心填充，图标整体 80% 不透明，去掉圆圈描边；覆盖 PC 首页 Hero/卡片 hover/搜索弹层/个人页卡片、PC 刷剧中央与剧场播放按钮、移动自适应首页与移动刷剧居中播放按钮。
- **2026-07-11 全集态断点**：刷剧全集态简介、右侧交互区、打开声音/全屏观看提示整体上提，避免压进底部黑区、进度条和选集条。
- **2026-07-11 刷剧微调断点**：漫游态 `ms-roam-card` 高度调整为 46px，入口文字权重降为 500；漫游态标题/标签/简介位置为 `116px + safe-area`，轻触开启声音提示上提到 `238px + safe-area` 避免遮挡标题；全集态简介为 `70px + safe-area`，全集态右侧交互区为 `82px + safe-area`。
- **2026-07-11 权限断点**：后台邀请码池默认生成码改为 4 位数字（1000-9999），并增加短码池重复重试上限；手动指定重复码返回 409。
- **2026-07-11 注册断点**：前后端注册用户名规则统一为 4-32 位字母/数字/下划线且不能纯数字；密码最少 6 位；邀请码消费改为大小写不敏感。
- **2026-07-11 交互/后台断点**：移动模板路由切换增加轻过渡并收紧到 120ms，同步进出不再 `out-in` 等待；登录弹窗收紧到 120/160ms 上浮弹出；刷剧筛选、选集抽屉和剧场筛选抽屉收紧到 160ms 底部弹出；后台影片线路诊断改为专用 `/api/admin/vods/:id/diagnose`，只检查线路解析，不再套用前台登录/VIP 权限；后台影片列表、详情和编辑弹窗已支持别名展示/维护，别名复用 `VodAlias.note` 保存展示名、`fingerprint` 保存去重指纹。
- **2026-07-11 移动模板网关断点**：`web/index.html` 在 Vue 挂载前读取缓存站点配置并请求 `/api/site`，若 `homeConfig.mobileTemplate=shortDrama` 且 UA 为手机，会直接把首页/搜索/分类入口改写到 `#/m`、`#/m/search`、`#/m/theater`；`main.js` 会等待 `window.__VCMS_MOBILE_GATE__` 完成后再挂载，避免手机首屏先闪 PC/自适应模板。iPad/tablet 与 `/shorts`、`/me` 等非移动模板路径不跳。
- **2026-07-11 移动播放页断点**：移动模板新增独立 `/m/play/:id` 播放页（`web/src/mobile/MobilePlay.vue`），播放器保持标准 16:9，顶部黑栏已取消，返回按钮固定回视频左上角；播放器已移除浏览器原生 `controls`，改为点击视频才出现、定时自动隐藏的自定义底部控制条（播放/暂停、静音、进度、时间、投屏、右下角全屏），避免原生控件右上/右下残留和叠加遮挡；全屏按钮使用 `icons.js` 的 `expand` 图标，优先调用 iOS `webkitEnterFullscreen`，否则调用标准 fullscreen API；投屏优先调用 `webkitShowPlaybackTargetPicker` / Remote Playback API，不支持时提示；标题区左侧展示小封面，下面是片名/标签/简介、选集、剧照、相关推荐；线路 UI 已隐藏，播放失败时自动切换下一条可用线路/通道。移动首页、剧场、搜索、我的、刷剧相关推荐入口均改为 `/m/play/:id`，手机网关也会把旧 `#/play/:id` 改写到 `#/m/play/:id`，避免进入 PC 旧播放模板。HLS 播放初始化改为 media attached 后加载源，并等待首帧/可播放事件后拉起播放，降低首次进入有声无画概率。
- **2026-07-12 移动播放器优化断点**：`MobilePlay.vue` 的自定义播放器控制条新增上一集/下一集、倍速切换（1/1.25/1.5/2/0.75）、HLS 清晰度切换（自动 + 清单内分辨率）与当前集提示；所有控制信息仍保持点击视频后显示、定时自动隐藏，不再常驻遮挡画面。底部控制条改为横向可滚，窄屏下不压缩进度条或覆盖全屏/投屏按钮；新增 `icons.js` 的 `skipBack/skipForward` 图标。
- **2026-07-12 移动播放器重排断点**：`MobilePlay.vue` 播放器控制层按老大确认的结构重排：顶部常驻“返回 + 剧名 · 当前集”，右上为播放器内横屏按钮；点击画面后中间出现上一集/播放暂停/下一集，底部独立进度行显示静音、当前时间、进度条、总时长、清晰度图标（仅多码率显示）、菜单图标与系统全屏图标。菜单内放倍速与投屏，所有入口统一线性图标风格，进度条不再被按钮挤压。
- **2026-07-12 播放器手势/显隐修复断点**：`MobilePlay.vue` 播放器点击行为改为 `onPlayerTap` 显隐切换（已显示则隐藏，否则显示），不再只显示不隐藏。新增点击/滑动区分：`touchmove` 位移超 10px 标记为滑动，`touchend` 后设 `suppressTapUntil=now+400ms` 抑制 touch 合成的 click，横滑调进度不再误触发菜单显示。横滑 seek 锁轴时由 `showControls(99999)` 改为 `hideControls()`，seek 预览与操作菜单互斥、不同时出现；`touchend` 后不再重新拉起控件。新增 `isControlTarget()` 判定落点是否在顶栏/中控/底控/菜单（含进度条滑块）内，命中则不启用播放器级手势与显隐，交给控件自身处理（修复拖进度条冒泡弹菜单）。已 `pnpm build` 通过。
- **2026-07-12 全屏方向识别断点**：`MobilePlay.vue` 右上横屏按钮 `toggleLandscape` 进全屏前读 `video.videoWidth/videoHeight` 判定横/竖：`vh>vw` 为竖片（`fullscreenPortrait=true`）锁 `portrait` 并加 `.portrait` 类、`100vw×100dvh` 铺满竖屏；否则为横片锁 `landscape`，方向锁不生效时由 CSS `@media (orientation: portrait) .mp-player.landscape:not(.portrait)` 旋转 90°按 `100dvh×100vw` 铺满横向全屏（方向锁成功时视口已横向、不匹配该规则，双保险）；`video` 仍 `object-fit:contain` 自适应不裁切。退出/卸载时 `fullscreenPortrait` 一并复位。已 `pnpm build` 通过。
- **2026-07-12 播放器显隐实测回修断点**：`MobilePlay.vue` 将控制层显隐拆成 `controlsVisible` 与 `centerControlsVisible`：点击播放器空白区显示中间播放/上下集，再次点击隐藏；底部控制条、菜单、进度条只调用 `keepControlsVisible(..., center:false)` 保持底部操作，不再重新拉起中间按钮。进度条新增 pointer/touch/mouse start/end/cancel 拦截，拖动时显示 seek 预览并抑制合成 click；`touchcancel` 不再提交横滑 seek，只清理状态。已 `pnpm --dir web build` 通过。
- **2026-07-12 `/m/play` PWA 顶部安全区断点**：`MobilePlay.vue` 普通播放页补回 `padding-top: env(safe-area-inset-top)`，避免 iOS/PWA `black-translucent` 状态栏压住 16:9 播放器；播放器顶栏默认不再重复叠加 safe-area。进入右上横屏/全屏播放态时，`.mp-player.landscape` 单独设置 `--mp-player-top-safe: env(safe-area-inset-top)`，保证沉浸态顶栏仍避开刘海/状态栏。已 `pnpm --dir web build` 通过。
- **2026-07-12 移动页面切换性能断点**：`MobileShell.vue` 移动路由切换从旧 `translateY` 改为 `mode="out-in"` + `opacity/translateX`，动画期间加 `will-change: transform, opacity`、`backface-visibility:hidden` 和 `translateZ(0)`；短剧页仍保留无位移特例。非短剧弹层同步轻量优化：`MobileTheater.vue` 筛选抽屉改为 `translate3d` 并加预提升，`AuthModal.vue`、`ToastStack.vue` 的进出场只走 `opacity/transform` 并加预提升。未引入 GSAP/FLIP，未新增背景层。已 `pnpm --dir web build` 通过。
- **2026-07-12 短剧入口去动画断点**：`MobileShell.vue` 针对 `/m/shorts` 路由切换改为 `m-page-none`，进入短剧页不再套移动路由过渡动画；同步删除旧的 `.shorts-shell .m-page-*` 无位移特例，避免无效旧逻辑残留。短剧页内部筛选/选集抽屉动画未动。已 `pnpm --dir web build` 通过。
- **2026-07-12 移动路由底层稳定色断点**：`MobileShell.vue` 增加仅用于防页面切换露底的路由壳底色：默认/搜索/播放保持 `#f7f7f8`，短剧保持 `#050505`；不增加背景图、不增加装饰层。用于对比验证 PWA/移动路由切换时白闪/黑闪是否减少。已 `pnpm --dir web build` 通过。
- **2026-07-12 移动路由去动画断点**：`MobileShell.vue` 移动路由层切换改为固定 `m-page-none`，删除旧 `m-page` 的 opacity/transform 过渡 CSS；当前 `/m`、`/m/theater`、`/m/search`、`/m/play`、`/m/shorts` 路由切换均不再做页面级淡入淡出/位移/缩放。短剧内部抽屉、登录弹窗、Toast 动画未动。已 `pnpm --dir web build` 通过。
- **2026-07-12 二级页侧滑断点**：`MobileShell.vue` 恢复仅二级页的 iPhone 风格侧滑：从一级页进入 `/m/play/:id` 或 `/m/search` 使用 `m-push`，二级页返回一级页使用 `m-pop`；主 tab 之间、短剧参与切换仍保持 `m-page-none` 无页面级动画。侧滑只使用 `translate3d` + `opacity`，不动画 `top/left/width/height/margin`。已 `pnpm --dir web build` 通过。
- **2026-07-12 移动播放页快速返回停播断点**：`MobilePlay.vue` 增加 `pageActive/loadSeq/playbackSeq` 生命周期令牌，进入播放页后快速返回时会让未完成的 `api.vod`、`api.resolvePlay`、`nextTick`、HLS `MEDIA_ATTACHED/MANIFEST_PARSED/ERROR`、首帧播放监听和自动换线延迟全部失效；`stopPlayback()` 统一递增播放令牌并销毁 HLS/暂停 video/清空 src，防止旧异步回调在页面离开后再次触发 `video.play()`。`onActivated` 在同一路由缓存重新激活且当前无播放源时重新加载当前影片，避免 keep-alive 停播后返回同页不恢复。已 `pnpm --dir web build` 通过。
- **2026-07-12 移动 PWA 侧滑返回断点**：上一版尝试通过 `popstate` 关闭 Vue 返回动画并在一级页边缘拦截历史手势，实测方向错误：点击返回动画被误关，一级页历史手势拦截无效，且侧滑返回后的闪一下更像页面落地后二次渲染/重绘。相关 `popstate` 与全局 touch 拦截已从 `MobileShell.vue` 回退；保留原二级页点击进入/返回的 `m-push/m-pop` 动画。下一步需重新定因侧滑返回后的重绘来源，重点看 keep-alive 激活、路由 key、移动页数据 reload 与 chrome meta/background 二次写入。
- **2026-07-12 移动一级页边缘侧滑禁用断点**：上一版 `main.js` 历史导航守卫方案已回退，不再改浏览器历史栈。`MobileShell.vue` 改为只在一级页 `/m`、`/m/theater`、`/m/shorts`、`/m/me` 渲染左右 24px 透明固定边缘层 `.m-edge-guard`，通过 `touch-action:none` 与 `touchstart/touchmove/pointerdown.prevent` 在当前页面元素层面吃掉边缘侧滑起点；二级页 `/m/play`、`/m/search` 不渲染该层，保留系统/PWA 侧滑返回。点击进入/点击返回动画仍由原 `m-push/m-pop` 控制。已 `pnpm --dir web build` 通过。
- **2026-07-12 移动 PWA 一级页侧滑源头拦截断点**：在上一版 `.m-edge-guard` 页面层拦截基础上，补齐两层平台方案：`web/src/style.css` 对 `html, body` 增加 `overscroll-behavior-x:none`，用于 Android/Chrome PWA 从源头禁横向 overscroll 导航；`MobileShell.vue` 增加 document 级 `touchstart` capture 监听，`passive:false`，仅在 standalone PWA 且当前路由为一级页 `/m`、`/m/theater`、`/m/shorts`、`/m/me` 时，对左右 25px 边缘触点 `preventDefault()`，二级页 `/m/play`、`/m/search` 保持系统侧滑返回可用。不加 history pillow，避免污染历史栈。已 `pnpm --dir web build` 通过。
- **2026-07-12 PWA 启动加载与底栏稳定断点**：`web/index.html` 新增首屏 `#app-boot` 启动层（深色全屏 + 播放标识动效），`main.js` 暴露 `window.__VCMS_FINISH_BOOT__` 并给 `#app` 加 `booting` 类；`/m` 首页不再由 mount 后固定 180ms 关闭 loading，而是在 `MobileHome.vue` 的 `loadHome()` 等站点、Hero、热播、上新、猜你喜欢、历史请求全部 settle 后，再等待 Hero 首图 load（1.2s 兜底）才关闭。非首页移动/PC 路由在 `router.isReady()` 后关闭，另有 4.2s 兜底防卡死。启动期间 `#app.booting .mtab` 隐藏，避免底栏在 safe-area/资源未稳定时先露在错误位置；`.mtab` 主体从 `height: calc(62px + env(safe-area-inset-bottom))` 改为 `min-height:62px`，只让 safe-area 参与底部 padding。已 `pnpm --dir web build` 通过。
- **2026-07-12 PWA 启动层铺底回修断点**：`#app-boot` 从简单 `inset:0` 改为向底部额外铺 `80px + env(safe-area-inset-bottom)`，并补 `100vh/100dvh` 双 min-height；`html/body` 初始 `background-color` 明确为 `#0a0b0f`，避免 iOS/PWA 冷启动第一帧底部安全区或合成区露白。已 `pnpm --dir web build` 通过。
- **2026-07-13 PWA 原生启动图断点**：已移除 `web/index.html` / `web/src/main.js` / `MobileHome.vue` 中的网页内 fake loading（`#app-boot`、`window.__VCMS_FINISH_BOOT__`、首页等首图再关闭逻辑），普通网页版不再出现启动遮罩。iOS PWA 改用原生 `apple-touch-startup-image`，`web/index.html` 静态声明常见 iPhone 尺寸启动图；`server/src/routes/site.ts` 新增 `/api/pwa/startup-:size.png`，`server/src/pwaIcons.ts` 复用 PWA icon/logo + backgroundColor 动态生成对应 PNG。Android PWA 仍由 manifest 的 `background_color/theme_color/icons` 生成系统启动屏。iOS 已安装到主屏幕后若仍显示旧启动快照，需关闭 PWA 进程；仍不刷新时重新添加到主屏幕。
- **2026-07-14 HLS 策略管理断点**：后台 `HlsClean.vue` 新增“策略管理”tab，集中展示每个 HLS 清洗策略的名称、说明、默认链启用/禁用状态、执行次数、命中次数、生成 clean 次数、最高置信；启用/禁用直接更新全局默认策略链，至少保留一个策略，不改变源/分类/单线路覆盖策略。`/api/admin/hls-clean/overview` 新增 `strategyStats`，按 `HlsCleanResult.evidence.attempts` 统计真实尝试过的策略次数，命中数优先读 `evidence.matchedStrategy`。已 `npm run build`（server/admin）通过。
- **2026-07-13 移动图片骨架断点**：`web/src/style.css` 新增全局 `.m-img-fade` 图片加载入场类，图片未完成时保持容器骨架底色/轻 shimmer，`load` 后添加 `.is-loaded`，只使用 `opacity + transform: scale()` 做短过渡，完成后释放 `will-change`；支持 `prefers-reduced-motion` 关闭动画。移动模板所有主要 `<img>`（首页 Hero/继续看/卡片，剧场榜单/列表，搜索榜单/结果，我的历史/追剧/推荐，播放页封面/剧照/相关推荐，刷剧封面/相关推荐）已接入 `@load="onImgLoad"` 与 `m-img-fade`。不引入 JS 动画库，不动画布局属性。
- **2026-07-13 移动首页 Hero 稳定断点**：`MobileHome.vue` 首页 Hero 轮播不再给整块 `.mh-hero` 使用 `:key="hero.id"` + 整块 `<Transition>`，避免每次切换重建按钮、点位、`backdrop-filter` blur 图层。现在 Hero 外壳、按钮和点位保持稳定 DOM，只给背景图片使用 `mh-hero-img-swap` 做 `opacity/transform` 切换；文案直接更新，不再触发按钮 blur 重合成。
- **2026-07-13 移动剧场骨架断点**：`MobileTheater.vue` 将列表 `loading` 初始值改为 `true`，避免首次挂载到 `reload()` 前短暂渲染空态；新增 `rankLoading` 和榜单骨架，榜单未命中缓存且接口未返回前展示横向 skeleton。列表骨架只在 `loading && !items.length` 时展示，已有缓存时继续 stale-while-revalidate 秒开。
- **2026-07-13 移动 PWA 状态栏贯穿断点**：`web/index.html` 保留原生 PWA 启动图方案，同时补回最小根节点首帧样式：`html/body/#app` 宽度、深色背景、`body` 的 `100vh/100dvh` 与 `margin:0`，不恢复 fake loading。`MobileShell.vue` 将移动模板 `/m`、`/m/theater`、`/m/search`、兜底页的 `apple-mobile-web-app-status-bar-style` 统一为 `black-translucent`，让页面头部背景可以贯穿到 iOS PWA 状态栏区域；`/m/shorts` 继续黑色透明状态栏，视频/封面 `100dvh + inset:0` 保持贯穿。
- **2026-07-13 iOS 26 PWA 状态栏颜色回修断点**：iOS 26 实测浅色一级页状态栏可能不按 `black-translucent` 透明贯穿，而是显示系统状态栏底色。`web/index.html` 的首帧 `theme-color` 与 `html/body/#app` 初始背景改为移动首页头部色 `#fff4f1`，并在最早脚本阶段按移动路由写入 `theme-color`/根背景：`/m/shorts` 为 `#050505`，`/m/play` 为 `#08090d`，其余移动页为 `#fff4f1`；`apply(site)` 在手机短剧模板下不再用后台 PWA 全局 `themeColor(#0a0b0f)` 覆盖移动页 chrome。`MobileShell.vue` 首页运行期 `themeColor/htmlBg` 同步改为 `#fff4f1`，避免挂载前后变色。
- **2026-07-13 移动模板回修断点**：`MobileTheater.vue` 筛选抽屉改为 draft 状态，抽屉内选择类型/分类/年份/排序不再立即改路由或触发列表请求，只有点“查看结果”才一次性提交 query 并关闭抽屉；“重置”清空筛选并关闭抽屉。`MobilePlay.vue` 返回按钮会先 `stopPlayback()`/`resetLandscape()` 再路由返回，避免离场动画期间声音残留；播放进度条 `@input` 只更新 UI/预览，`pointerup/touchend/mouseup` 才单次写 `video.currentTime`；CSS 假横屏且物理仍竖屏时，播放器横滑调进度改用物理 Y 轴作为视觉横向位移。`web/index.html` 默认首帧背景/theme-color 回到站点暗底 `#0a0b0f`，仅当前 hash 已经是 `/m` 路由时提前写移动模板 chrome 色，避免非 `/m` 自适应版本被移动模板 `#fff4f1` 背景污染。`web/src/style.css` 与 `siteConfig.applySiteTheme()` 已补齐 `#app` 背景跟随 `--bg`，修复后台主题“页面背景”保存后被首帧 `#app` 固定暗底盖住、看起来不生效的问题。已 `npm run build` 通过，并用 390×844 视口实测 `/m/theater` 筛选提交/重置、`/m/play/41238` 基础加载、`#/` 与 `#/m` 背景色；用 1280×800 视口验证 PC 自适应入口临时主题 `bg=#243447` 可同步写入 `html/body/#app`；已重建 `vcms-web`，5152 实测新包 `index-C24EeKjH.js`，`html/body/#app` 当前均为后台主题返回的 `#0a0b0f`。
- **2026-07-13 移动登录滚动锁回修断点**：`AuthModal.vue` 登录弹窗滚动锁已移除旧 `body.position=fixed` 方案，改为只暂时写入 `overflow:hidden`、`touch-action:none`、`overscroll-behavior:contain` 并记录原值；登录成功跳转前同步 `unlockPageScroll()`，路由变化/组件卸载时强制关闭弹窗并清理 Auth 自己残留的 `touch-action/overscroll/overflow`，修复移动模板点登录后用返回键回到页面只可点击、无法手指滑动的问题。已 `npm run build`、`git diff --check`、`docker compose up -d --build web` 通过；5152 移动视口实测新包 `index-DeQFdgy5.js`，打开 `/m/me` 登录弹窗后 `history.back()` 返回 `/m`，弹窗关闭且 `body/html` 的 `overflow/touchAction/overscrollBehavior` 均恢复为空，页面可滚动。
- **2026-07-13 刷剧封面层级回修断点**：`MobileShorts.vue` 漫游态封面残留原因是全局 `.m-img-fade` 为图片骨架补了 `position:relative; z-index:1`，而刷剧视频 `.ms-video` 没有显式层级，导致自动播放已开始但封面仍盖在视频上。现已在刷剧页局部明确层级：`.ms-bg z-index:0`、`.ms-poster z-index:1`、`.ms-video z-index:2`、`.ms-vignette z-index:3`，保留封面作视频未 ready 前占位，播放 ready 后视频覆盖封面。已 `npm run build`、`git diff --check`、`docker compose up -d --build web` 通过；5152 移动视口实测 `/m/shorts` 新包 `index-CRAkSuzB.js`，视频 `paused=false/currentTime>0/opacity=1/z-index=2`，封面 `z-index=1`，屏幕中心顶层元素为 `.ms-video ready`。
- **2026-07-13 刷剧全集菜单触控回修断点**：`MobileShorts.vue` 全集态右上角搜索/播放设置按钮触控热区从基础 `34x34` 扩大为 `48x48`，图标仍保持 `22x22`，右侧按钮间距补为 `2px`，通过负 margin 保持视觉位置不明显外扩。已 `npm run build`、`git diff --check`、`docker compose up -d --build web` 通过；5152 移动视口实测 `/m/shorts?mode=full`，右上搜索与播放设置按钮 DOM 命中区域均为 `48x48`，点击播放设置可正常打开倍速/清屏/小窗/投屏菜单。
- **2026-07-13 PWA fullscreen 试验断点**：`server/src/routes/site.ts` 的 `/api/pwa/manifest.webmanifest` 输出已按老大要求将 `display` 从 `standalone` 改为 `fullscreen`，其余 `orientation/theme_color/background_color/icons` 保持原逻辑。已 `pnpm --dir server build`、`git diff --check`、`docker compose up -d --build server` 通过；5150 实测 manifest 返回 `{ display:"fullscreen", orientation:"portrait", theme_color:"#0a0b0f", background_color:"#0a0b0f" }`。注意 iOS 已安装到主屏幕的 PWA 可能缓存 manifest，需要关闭/重开 PWA，必要时重新添加到主屏幕确认安装态差异。
- **2026-07-13 PWA 安全区回修断点**：`AuthModal.vue` 移动端登录弹窗 overlay 顶部 padding 增加 `env(safe-area-inset-top)`，`ToastStack.vue` 移动端 toast 顶部改为 `10px + safe-area`，避免 PWA fullscreen/black-translucent 下弹窗或提示跑进状态栏。`MobileShell.vue` 新增继承变量 `--mobile-tab-height: calc(62px + env(safe-area-inset-bottom))`，底栏 `.mtab` 使用该变量作为实际高度；`MobileShorts.vue` 漫游态“观看完整短剧/动漫”底部条也使用同一变量作为 `bottom`，避免真机 PWA 下用固定 `62px` 压进底栏安全区，或用两套公式产生断层。已 `npm run build`、`git diff --check`、`docker compose up -d --build web` 通过；5152 移动视口实测新包 `index-DkeRT76_.js`，无 safe-area 时变量为 `calc(62px + 0px)`、底栏高度 `62px`。
- **2026-07-13 PWA 首载底栏/启动图回修断点**：`MobileShell.vue` 新增 `chromeReady` 首帧门控，挂载后先同步写入移动 chrome/theme 并在 220ms 后放开 `.mtab` 显示，避免 iOS/PWA 首次加载 visual viewport 与 safe-area 尚未稳定时底部菜单先偏上、随后自己归位的跳动；稳定后底栏仍使用 `--mobile-tab-height` 贴底。PWA iOS 原生启动图改为纯文字版：`server/src/pwaIcons.ts` 不再读取后台 icon/logo 生成 startup image，而是合成 `server/src/assets/startup-text-mark.png` 文字资产“全军出鸡”；`web/index.html` 所有 `apple-touch-startup-image` 加 `?v=text-only-v2` 破旧缓存。已 `pnpm --dir server build`、`npm run build`、`docker compose up -d --build web server`、启动图接口 200 与实图查看通过；5152 390×844 视口实测 `/m` 稳定后 `.mtab` 为 `top=782/bottom=844/height=62`、`chromeReady=true`。
- **2026-07-13 移动首页背景对齐断点**：`MobileHome.vue` 首页主背景已改成与 `MobileTheater.vue` 剧场页一致，去掉首页独有的顶部红色径向光斑，并把背景渐变统一为 `linear-gradient(180deg, #fff4f1 0%, #f7f7f8 180px, #f7f7f8 100%)`。已 `npm run build`、`docker compose up -d --build web` 通过；5152 已切到新包 `index-BC9gTvfd.js / index-C75xIa1H.css`。
- **2026-07-13 独立移动全集态下一集轻预热/筛选动画/搜索样式断点**：`MobileShorts.vue` 新增 `prefetchFullNextPlayback()`，只在 `fullMode` 且当前视频触发 `onPlaying()` 后预热下一集；使用现有 `seriesUnit(currentEp + 1)` 构造下一集，调用现有 `resolveUnitPlayback(next)` 写入 `resolveCache`，成功后沿用 `warmupManifest()` 仅预热 m3u8 manifest，不创建隐藏 video、不预热海报、不改滑动切集逻辑；`fullNextPrefetchKey` 防止同一下一集重复预热，登录/会员态刷新时清空。刷剧筛选抽屉移除自带 `open/transform` 动画，补同款 `.ms-drag`，统一复用选集的 `ms-bottom-sheet` 进出场动画。移动首页/剧场/搜索页搜索栏文字字重统一为 `font-weight: 500`；搜索页 `.msearch`、`.search-shell` 与 `/m/search` body 背景改为 `#fffefe`；搜索历史词条字号加到 `14px`、字重 `500`、高度收为 `34px` 并去掉白底与阴影；猜你想搜改为 `api.hot` 影视卡片三列展示，右侧换一批每次轮换 3 个；榜单 tab/标题/热搜值字号各加大一号。已 `npm run build`、`git diff --check` 通过；本地构建包 `index-DhmcfxSp.js / index-Dn1KVnkI.css`。
- **2026-07-13 搜索历史/榜单样式断点**：`MobileSearch.vue` 的 `.msr-word-grid` 间距从 `9px` 改为 `0`，用于压缩搜索历史词条上下/左右间距；榜单 `.msr-rank-panel` 用 `margin-left/right:-14px` 延伸到屏幕边缘，圆角从 `18px` 减到 `12px`，未选中榜单 tab 色值改为 `rgba(33, 6, 6, .6)`。已 `npm run build`、`git diff --check` 通过，本地构建包 `index-DwoLbUtY.js / index-CwO4yoIo.css`。
- **2026-07-13 搜索卡片遮罩/热度断点**：`MobileSearch.vue` 修复榜单角标被 `.m-img-fade{z-index:1}` 图片盖住的问题，给 `.msr-rank-no/.msr-rank-tag/.msr-poster span` 提升到 `z-index:3`；搜索结果、榜单、猜你想搜海报底部新增轻渐变遮罩；猜你想搜卡片底部新增热度值和火焰 svg。已 `npm run build` 通过；本次文件定向 `git diff --check -- web/src/mobile/MobileSearch.vue README_HANDOVER.md` 通过；全仓 `git diff --check` 当前被无关 `server/src/hls/cleaner.ts` 末尾空行阻断。
- **2026-07-13 猜你想搜热度文案断点**：`MobileSearch.vue` 猜你想搜卡片底部热度从“火焰图标 + 数字”改为“火焰图标 + 热度值 + 数字”，热度区域保持白色文字/图标且无背景；已 `npm run build`、`git diff --check` 通过，本地构建包 `index-DVehQjm5.js / index-CuzEdkr2.css`。
- **2026-07-13 猜你想搜信息层回修断点**：`MobileSearch.vue` 提升 `.msr-heat` 到 `z-index:4`，并用 `.msr-suggest-cards .msr-heat` 覆盖通用 span 灰色规则，确保热度信息是白色且无背景；热度字重从 `900` 降为 `500`；猜你想搜卡片分类文案改为 `类型 · 全x集`（优先读取集数字段，兜底解析 remarks）；榜单未选中 tab 透明度从 60% 调为 50%。已 `npm run build`、定向 `git diff --check -- web/src/mobile/MobileSearch.vue README_HANDOVER.md` 通过，本地构建包 `index-D65TMcRi.js / index-Bp2G_GV7.css`。
- **2026-07-12 移动播放器 AirPlay 断点**：`MobilePlay.vue` 的 `<video>` 补 `x-webkit-airplay="allow"` 与 `airplay="allow"`；`openCast()` 优先调用苹果 WebKit 的 `video.webkitShowPlaybackTargetPicker()`，并在苹果设备上不再走 Remote Playback fallback，避免误走只投声音的路径。m3u8 播放初始化改为：当 video 原生支持 `application/vnd.apple.mpegurl` 时优先使用原生 HLS (`video.src=url`) 而不是 hls.js/MSE，保证 AirPlay 获取原生视频流；不支持原生 HLS 时才回退 hls.js。已 `pnpm --dir web build` 通过。
- **2026-07-12 元数据别名打分断点**：`collector/douban.ts`、`collector/tmdb.ts` 的候选标题打分已把远端 `meta.aliases` 纳入标题池，并区分 `alias_exact/alias_contains/alias_similar/alias_weak` 原因；`taskRunner.runProviderMatch()` 会读取本库 `VodAlias`（优先 `note`，兜底 `fingerprint` 片名段）作为 `ctx.aliases` 传给豆瓣/TMDB 匹配器。本库别名或远端别名精确命中按标题精确命中同等基础分 55，包含命中按 38，后续继续叠加年份、类型、季/特别篇、导演、演员等分。已 `pnpm --dir server build` 通过，并已 `docker compose up -d --build server` 重建生效。
- **2026-07-12 元数据匹配准确率优化断点**：标题打分新增中文弱归一（标题池增加去 `的/之` 变体）与高置信别名包含提权：本库/远端别名弱归一后精确命中走 `alias_exact=55`，短长比 ≥82% 的别名包含走 `alias_strong_contains=45`，低于该阈值仍走普通 `alias_contains=38`。`tmdb.ts` 也补齐演员/导演参与打分（复用豆瓣同级规则：导演 +28/不符 -16，演员最多 +18/不符 -6），并将 TV 的 `credits.crew` 导演与 `created_by` 一起纳入导演池。用当前代码只读复算：`152523` 从 68 → 89（`alias_strong_contains + year_match + type_match + actors_match`），`157363` 从 56 → 92（`alias_exact + year_match + type_match + actor_match`）。已 `pnpm --dir server build` 通过，并已 `docker compose up -d --build server` 重建生效。
- **2026-07-11 刷剧横屏断点**：`MobileShorts.vue` 全集态横竖屏/视口 resize 已增加短保护窗口，resize 期间清理待提交翻集任务并把滚动位置校正回当前集；不停止视频、不重拉播放源，避免横屏时 `scrollTop/clientHeight` 变化误判为下滑并自动切到下一集。
- **2026-07-11 移动固定头部断点**：移动首页 `MobileHome.vue` 顶部 logo/search 已改为 fixed 固定在视口顶部，页面内容用 `safe-area + 64px` 预留头部高度，Hero 从固定头下方开始，不被搜索栏遮挡；头部背景颜色为 `rgb(255 244 241)`，透明度按 scrollY 从 0 逐渐到 90%，并限制移动页纵向 overscroll 回弹。移动剧场 `MobileTheater.vue` 顶部只保留 fixed 搜索栏，同样预留头部高度，“全站热播榜”从搜索栏下方开始；分类/排序回到内容流，头部滚动背景与首页同步。个人中心 `MobileMe.vue` 顶部用户卡保持 sticky 固定，下面权益、统计和列表继续滚动。
- **2026-07-11 移动搜索断点**：`MobileSearch.vue` 的热门榜/短剧榜/动漫榜/电影榜已增加按 tab key 的内存缓存，切换回来直接复用已加载榜单，不再重复请求；榜单请求增加 `rankRequestId` 防止快速切换时旧响应覆盖当前榜单。
- **2026-07-11 移动搜索样式断点**：搜索页榜单 tab 与结果分类 tab 的默认文字色统一为 `#2106069e`；榜单 tab 字号提升到 15px，结果分类 tab 字号提升到 14px。
- **2026-07-11 移动搜索榜单标签断点**：`MobileSearch.vue` 搜索榜单卡片标签改为真实字段驱动的三类：采集源 `remarks` 命中完结/全集/全 N 集等显示“完结”，否则 `contentUpdatedAt/createdAt` 21 天内显示“新剧”，其余按真实热度榜单兜底显示“热门”；移除原独立硬贴的“新剧”角标和底部热度胶囊。
- **2026-07-11 移动搜索猜你想搜断点**：`MobileSearch.vue` 的“猜你想搜”只展示 2 行（4 个词），词条去掉白底和阴影，网格 gap 改为 0；搜索历史仍保留原卡片样式。
- **2026-07-11 移动搜索头部断点**：`MobileSearch.vue` 搜索页头部从 sticky 改为 fixed 固定吸顶；初始背景透明，滚动时按 `scrollY` 渐显 `rgb(255 244 241)` 纯色背景，去掉头部渐变与页面顶部装饰渐变，内容区预留固定头部高度避免遮挡。
- **2026-07-11 横向分类可视断点**：移动剧场大类/排序、移动搜索榜单/结果分类等横向 tab 增加选中项位置修正；每次选中都会按容器宽度尽量把 `.on` 按钮滚到可视区中间，首尾只受 `scrollLeft` 边界限制，确保后续分类可见。
- **2026-07-11 移动首页分类断点**：`MobileHome.vue` 已移除 Hero 下方的首页快捷分类入口（电影/电视剧/动漫/短剧等），并停止首页为该入口请求分类接口；“更多”仍通过 `goTheater('', sort)` 进入剧场。
- **2026-07-12 移动首页头部断点**：`MobileHome.vue` 已移除移动首页顶部左侧站点图标/logo 方块，搜索框占满头部可用宽度；固定头部与滚动背景渐显逻辑保持不变。
- **2026-07-11 后台视觉断点**：`admin/src/theme.css` 将后台主按钮/主色改为蓝色 `#2563eb`，左侧栏底色改为黑灰 `#111318`；`admin/src/App.vue` 后台品牌区和页面标题前图标改用站点 logo，采集任务菜单红点改为静态行内定位避免错位；`Tasks.vue` 实时连接小点补齐行高/固定尺寸对齐。
- **2026-07-11 后台开关控件断点**：后台所有 `el-switch` 已统一改为 `inline-prompt`，状态文案显示在按钮内部（开启/关闭、启用/停用、显示/隐藏、正常/禁用），避免旧式“关闭 按钮 开启”左右分散造成误读；`theme.css` 统一设置文字开关最小宽度，防止按钮内文案挤压。
- **2026-07-11 别名同步断点**：后台手动合并 `mergeVods()` 已从 `Set<fingerprint>` 改为 `Map<fingerprint, displayName>`，来源影片自己的片名会作为别名展示名写入，来源旧别名保留原 `note`，不再统一覆盖成 `manual_merge`；豆瓣详情抓取新增 `aka/aka_cn/aka_en/aka_title/original_title/original_name` 别名提取，`applyDoubanAssets()` 会把豆瓣标题与别名按 `makeFingerprint(name, meta.year || vod.year)` 写入 `VodAlias`，自动元数据任务和手动指定豆瓣 ID 都会同步。
- **2026-07-11 元数据源闭环断点**：元数据体系已从“豆瓣匹配”升级为“配置驱动的元数据源匹配”。`MetaConfig.providersConfig` 统一管理 `douban/tmdb` 的启用、优先级、源级限速、每批数量、自动通过分、待确认分；TMDB 支持后台配置 API Key 与 API Read Access Token。`Vod` 新增 `metaSource/metaSourceId` 标注最终命中的元数据源与源内 ID，旧 `doubanId` 继续兼容豆瓣外链/历史数据。单片即时匹配、候选搜索、人工确认、批量匹配、采集后自动排队、定时任务、匹配记录 `metaReason.provider` 均走统一 provider 链；启用多源时按优先级匹配，某一源失败会降级为该源失败并继续后续源，不再打断全链路。`collector/tmdb.ts` 已接入 TMDB `search/multi` 与详情/剧照/别名抓取，`metaAssets` 按 `meta.source` 写入图片来源，后台影片库/元数据页统一显示“元数据匹配/来源”。
- **2026-07-11 元数据候选续筛断点**：`matchByConfiguredProviders()` 已调整 provider 链路判定：优先级高的源只有 `matched` 才会立即截断；若只是 `pending/待确认候选`，会暂存候选并继续进入下一优先级源筛选。后续源若命中 `matched` 则按实际命中源写入；若所有源都没有 `matched`，再返回最高分的 pending 候选并附带其它源候选，避免优先级 1 的低置信候选阻断优先级 2 的真实命中。
- **2026-07-11 待确认异步断点**：后台“待确认候选”点击确认后不再同步等待详情抓取/图片探测/资产写库；`/api/meta/set/:id` 现在只校验影片与候选参数并创建高优先级 `meta` 任务（`manualConfirm=true`）立即返回，后台任务再按候选 `provider + metaSourceId` 拉详情、挑官方封面、写 `Vod`、同步别名/人物/图片资产。TMDB 当前落库字段：`metaSource/metaSourceId`、标题、年份、类型(movie/tv)、评分(`vote_average`)、评分人数(`vote_count`)、海报、简介、类型标签、导演/主创、演员、别名/原名、海报图集、横图剧照；候选阶段返回来源、源内 ID、标题、副标题/原名、年份、类型、海报、匹配分与原因。
- **2026-07-11 元数据图片/候选管理断点**：TMDB 图片统一使用 `image.tmdb.org/t/p/original` 原图地址，详情抓取会落主海报 + 最多 8 张 poster + 最多 12 张 backdrop；`VodImage.source` 标注 `tmdb`。后台影片详情的图片资产支持一键设为 `officialPic` 封面或 `heroPic` 首页图，编辑弹窗也会先拉详情并展示已取回 poster/backdrop 供选择；`officialPic` 为前台封面优先字段。匹配记录表支持多选后批量清理，`/api/meta/clear` 只重置 `metaMatched/metaScore/metaReason/matchedTitle/matchedYear/metaAt`，不删除影片、不删除已入库人物/图片资产。候选弹窗和影片详情均支持 TMDB 外链（`https://www.themoviedb.org/movie|tv/{id}`）。
- **2026-07-11 TMDB 并发断点**：`providersConfig.providers[].tmdb` 新增 `matchConcurrency`（并发数，1-10，默认 3）与 `concurrencyBatchSize`（每 worker 连续处理数量，1-50，默认 5）。后台 `Meta.vue` 已将源级“每批数量”更名为“任务数量上限”，并将 TMDB 并发配置显示为“并发数 / 每 worker 连续处理”；提交任务时会快照 `matchConcurrency/concurrencyBatchSize` 到任务参数。`taskRunner.runMetaTask()` 在 TMDB 单源任务时按 `matchConcurrency * concurrencyBatchSize` 分波并发处理，每个 worker 内串行处理自己的小批；波次之间仍按 TMDB `intervalMs` 间隔。豆瓣或豆瓣+TMDB 混合链路仍保持串行，避免豆瓣限流。
- **2026-07-11 任务/图片兜底断点**：后台 `Tasks.vue` 采集任务新增状态分类：进行中(`running/canceling`)、等待中(`pending/paused`)、已完成(`done`)、失败(`failed`)，`/api/tasks` 支持 `group` 查询。`taskRunner.taskUpdate()` 在任务进入 `done/failed` 后自动裁剪对应状态历史，只保留最新 500 条，超过自动删除旧记录。`MetaConfig` 新增 `saveImages`，后台元数据配置页增加“保存图片”开关；开启后单片匹配、批量匹配、人工确认都会把元数据海报/剧照通过 `downloadImageToLocal()` 保存到本地 `/api/media/images/`，写库时优先使用本地 URL，远程图片失效时可兜底。
- **2026-07-11 TMDB 并发修正断点**：之前 TMDB 并发仅在任务显式 `provider=tmdb` 或 TMDB 单源时生效；后台常规提交只带 `limit/intervalMs`，即使 TMDB 优先级为 1 且已配置 `matchConcurrency/concurrencyBatchSize` 也会串行。现已修正：`Meta.vue` 提交会带 TMDB 并发快照但默认不固定 `provider`；`taskRunner.runMetaTask()` 对未带 `provider` 的任务会自动使用当前最高优先级启用源作为 `effectiveProvider`，当最高源是 TMDB 时按 TMDB 并发设置分波处理，且优先使用任务参数中的并发快照。`Tasks.vue` 采集任务列表会解析元数据任务参数，显示“源 / 本任务 / 并发 / 单工 / 容量 / 轮间隔”。
- **2026-07-11 元数据任务拆分断点**：后台 `Meta.vue` 已改为“概览 / 匹配记录 / 匹配源配置”三段 tab 布局。元数据提交前会先按当前筛选条件统计总影片数，弹窗明确提示“共 N 部、单任务 M 部、将拆成 K 个任务、TMDB 容量”；确认后 `/api/meta/batch` 使用 `split=true` 在后端按筛选条件锁定 vodId 列表，并按单任务容量拆成多个带 `vodIds` 的 meta 任务排队，避免多个任务重复处理同一批失败影片。`Task.added/updated/merged` 在元数据任务中分别表示成功/失败/待确认，任务页显示为“成功 X 待确认 Y 失败 Z”，不再误读为采集更新。
- **2026-07-11 元数据源链/任务容量断点**：后台元数据页默认提交不再固定传当前主源 `provider`，改为按启用源优先级跑完整 provider 链；优先源只有 `matched` 才截断，`pending/failed` 会继续进入下一优先源。TMDB 的单任务容量不再使用独立“任务上限”，改为 `matchConcurrency × concurrencyBatchSize`，超出自动拆成多个任务排队；任务页显示简化为“源 按优先级 / 本任务 N 部 / 并发 / 单工 / 容量 / 轮间隔”。当 TMDB 为第一优先源时仍按 TMDB 并发分波，但单片内部不会被锁成仅 TMDB，候选/失败仍可降级到后续源。
- **2026-07-12 元数据匹配模式断点**：后台 `Meta.vue` 概览区快捷匹配与“手动范围匹配”均新增“匹配模式”选择，默认“按优先级自动”不传 `provider`，走完整 provider 链；选择“仅豆瓣/仅 TMDB”时才把 `provider=douban|tmdb` 写入任务参数，并按所选源快照任务容量、限速、通过分/候选分与 TMDB 并发配置。
- **2026-07-11 元数据手动匹配断点**：`/api/meta/match/:id` 单片手动重匹配已从同步即时匹配改为创建单片 `meta` 后台任务（`vodIds=[id]`、`redo=true`、`priority=40`），统一进入 `taskRunner.runMetaTask()`，沿用当前启用源、TMDB 并发数、每 worker 数量、保存图片等配置。后台元数据概览页新增“手动范围匹配”入口，可直接按状态/分类/采集源提交，复用 `split=true` 拆分排队逻辑。
- **2026-07-11 元数据源配置样式断点**：`Meta.vue` 的采集匹配源配置已精简表单文案（限速/任务上限/并发/单工处理/通过分/候选分），长说明移动到独立灰色说明行；表单内容区支持换行，input-number 固定安全宽度，避免 label、单位、控件在窄卡片内重叠。
- **2026-07-11 元数据全局设置断点**：`Meta.vue` 已将“保存图片”“自动匹配”等全局元数据配置从匹配源列表下方前移到独立“全局设置”区，并补充“所有元数据源生效/按优先级执行”说明，避免误解为豆瓣或某个单源专属配置；全局表单内容同样支持换行，避免说明文字与控件重叠。
- **2026-07-11 豆瓣诊断断点**：实测豆瓣详情接口和电影搜索正常，但豆瓣移动搜索接口对未登录请求返回 `need_login`，且 `subject_suggest/search_subjects` 对国产动漫/剧集标题经常返回空；后台已将 `no_suggest/detail_failed/低置信` 分开显示，避免把搜索无候选误报为“未收录”。
- **2026-07-11 豆瓣分季打分断点**：`collector/douban.ts` 新增 `romanToArabic()`（罗马数字Ⅰ-Ⅹ→阿拉伯）与 `baseTitle()`（去「年番N/第N季/SN/Season N」分季后缀 + 括注 + 罗马数字归一）；`scoreCandidate` 标题打分新增 `title_base=48` 档位（介于 `title_contains=38` 与 `title_exact=55` 之间），专治豆瓣分季命名（如「斗罗大陆Ⅱ绝世唐门 年番1/2/3/4」）与本库无后缀命名不一致导致的标题相似度打折；**不直接给满分**，最终仍靠 `year_match(+22)` 二次区分具体季，防串季误配；同时 `typeScore` 动漫→tv 分由 5 提到 8，与普通剧集对齐。实测回归：斗罗大陆Ⅱ绝世唐门 #2373/#1397/#7640 均由 pending(54-65) → **matched(78)**，太平年 #158359 保持 85，给 2026 年份时正确命中年番4(2026) 不串季。已 `tsc` build 通过，**待重启后台服务生效**。
- **2026-07-15 HLS 清洗队列恢复断点**：`taskRunner.recoverOrphanTasks()` 修复服务重启时边恢复 orphan 任务边启动队列的竞态：旧逻辑在循环内 `pumpHlsCleanQueue()`，会出现 HLS 任务刚被置为 `running` 又被后续 orphan 恢复覆盖回 `pending`，表现为“等待中但实际进度还在涨”。现改为循环内只标记 `shouldPump*`，所有 orphan 状态恢复完成后统一唤醒 collect/hls/meta 队列。已 `npx tsc --noEmit`、`docker compose up -d --build server` 通过；复查 `hls_clean` 为 1 running / 17 pending / 3 paused。
- **2026-07-15 X8 Hero 标准轮播断点**：`web/src/x8/X8Home.vue` 首页 Hero 从单图替换改为标准 carousel track：多 slide 横向轨道、`translate3d` 位移过渡、左右圆形箭头、底部分页条、悬停暂停、点击分页/箭头重置自动播放、移动端 touch 左右滑切换。已 `pnpm --dir web build`、`docker compose up -d --build web`、`git diff --check` 通过；5150 `/health` OK、5152 200；浏览器实测 8 张 slide，切换 transform 从 `-600%` 到 `-700%`，过渡为 `0.72s cubic-bezier(...)`。
- **2026-07-15 X8 卡片 hover 操作断点**：`web/src/x8/X8Home.vue` 首页/分类/分区卡片 hover 层移除旧“添加影片”按钮，底部改为左侧“热度值图标 + 热度值”、右侧“追剧”按钮；热度优先读取 `ratingCount`，兜底 `_count.plays/playCount/viewCount/hits`，按钮点击不触发卡片播放并进入登录入口。已 `pnpm --dir web build`、`docker compose up -d --build web`、`git diff --check` 通过；5150 `/health` OK、5152 200；浏览器快照确认热播/分区卡片均输出 `热度值 ...` 与 `追剧`。
- **2026-07-15 X8 头部导航回修断点**：`web/src/x8/X8Home.vue` 移除此前硬加的“世界杯”静态入口，头部栏目只展示实际分类；导航字号调为 16px/500，右侧工具按钮调为 12px 文字、20px 图标、44px 高，登录按钮调为 64x32；导航与右侧工具 hover 均增加 `scale(1.08)` 轻微放大动画。已 `pnpm --dir web build`、`docker compose up -d --build web`、`git diff --check` 通过；浏览器快照确认无世界杯，真实 hover ref 实测 transform 为 `matrix(1.08, 0, 0, 1.08, 0, 0)`。
- **2026-07-15 X8 头部搜索框回修断点**：`web/src/x8/X8Home.vue` 将头部搜索列从 368px 扩到 420px，1399px 以下断点也从固定 44px 改为 `minmax(44px,260px)`，避免 hover/focus 后背景过短；搜索按钮显式设为 40x40 grid 居中，图标 20x20。已 `pnpm --dir web build`、`docker compose up -d --build web`、`git diff --check` 通过；1440 视口实测搜索展开宽约 418px，按钮 40x40，图标中心偏差 x/y 均为 0。
- **2026-07-15 X8 首页首载骨架与数据回填断点**：`web/src/x8/X8Home.vue` 明确首页只使用现有前台接口：`/api/types`、`/api/vods`、`/api/hot`；加载逻辑从“等全部请求结束后一次性填充”改为“先渲染固定骨架，Hero/热播/各栏目接口返回后分批回填”。新增 Hero、影片卡、右侧热榜 skeleton，占位尺寸与正式卡片一致，避免首次加载空 DOM 导致布局跳动；无数据栏目只在 loading 期间显示骨架，加载结束后自动隐藏，避免永久假骨架。已 `pnpm --dir web build`、`docker compose up -d --build web`、`git diff --check` 通过；运行态实测 Hero 8 条、热播 12 条，有数据栏目各 12 条且无 skeleton 残留。
- **2026-07-15 X8 二级筛选栏断点**：`web/src/x8/X8Home.vue` 分类二级页移除重复“分类”筛选行，只保留“类型 / 年份 / 排序”；新增 `years` 状态与 `curYear`，通过现有 `/api/years?type=&sub=&kw=` 拉取年份，列表请求 `/api/vods` 同步带 `year` 参数；`setBrowse()` 增加 query 清理，避免 `undefined`/空值残留。已 `pnpm --dir web build`、`docker compose up -d --build web`、`git diff --check` 通过；运行态 `#/x8?type=电影` 实测筛选行标签为 `类型/年份/排序`、列表 30 条。
- **2026-07-15 X8 首页图标开关断点**：`homeConfig` 新增 `showHomeLogo`，server/web/admin 三端默认归一为 `true`；后台 `站点设置 -> 首页设置` 新增“首页显示图标”开关，关闭后 X8 首页头部不显示基础设置里的网站图标，也不显示 JP fallback，只保留站点名称；X8 头部网站图标默认加圆角 `9px`。已 `pnpm --dir server build`、`pnpm --dir admin build`、`pnpm --dir web build`、`docker compose up -d --build server admin web`、`git diff --check` 通过；`/api/site` 实测返回 `homeConfig.showHomeLogo=true`，X8 页面实测 logo 为 34x34、圆角 9px。
- **2026-07-15 X8 首页 Hero 数据源回修断点**：`web/src/x8/X8Home.vue` 首页轮播数据源已改回旧模板同源 `api.hot(12)`，即后台“热门推荐”配置驱动；同时复用旧模板 `heroImages` 横图优先选择逻辑，优先展示宽幅 Hero 图，兜底 `heroPic/officialPic/pic`。X8 Hero 不再使用 `/api/vods?sort=hot` 生成。已 `pnpm --dir web build`、`docker compose up -d --build web`、`git diff --check` 通过；运行态实测 `/api/hot?limit=12` 返回的 `仙逆/吞噬星空/金特务：本色回归/...` 与 X8 Hero slide 标题顺序一致。
- **2026-07-16 X8 播放页顶部安全距离断点**：`web/src/x8/X8Home.vue` 为 X8 fixed 头部补 `env(safe-area-inset-top)`，桌面播放页 `.x8-play` 顶部预留改为 `82px + safe-area`，移动端头部高度改为 `96px + safe-area`、播放页顶部预留改为 `116px + safe-area`，避免播放器和头部操作顶到系统状态栏。已 `npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5152 运行态实测桌面播放器 top=82px，390x844 移动视口 header bottom=96px、播放器 top=116px。
- **2026-07-16 X8 播放页参考站比例回修断点**：`web/src/x8/X8Home.vue` 按参考页 `/vod/play/145148/1/1293817` 回收播放页尺寸：内容宽从接近全屏改为 `min(1750px, 100vw-120px)`，右侧选集栏从 548px 改为 360px，工具条从 82px 改为 54px，右侧播放器标题从 30px 改为 20px，选集按钮改为 54x42/14px，播放信息区标题从 40px 改为 30px，元信息/简介从 24px 改为 14px；1350px 以下按参考站隐藏右栏并启用下方选集。已 `npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5152 2048px 视口实测播放器容器 `1750x835.875`、右栏 `360`、工具条 `54`、标题 `30px`。
- **2026-07-16 X8 分类接口顺序回修断点**：`web/src/x8/X8Home.vue` 移除前端硬编码 `navOrder` 与头部分类截断/重排逻辑，X8 头部分类、首页分类栏目、排行榜分类组统一使用 `/api/types` 返回的原始顺序和名称；`首页` 仍为模板固定入口，不属于分类接口。已 `npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5150 `/api/types` 返回 `动漫/电视剧/电影`，5152 `#/x8` 头部实测为 `首页/动漫/电视剧/电影`。
- **2026-07-16 X8 播放器控制条重构断点**：`web/src/x8/X8Home.vue` 移除播放页播放器下方旧的点赞/点踩/评论/收藏/报错/分享/添加与弹幕输入工具排，`<video>` 改为自定义 HLS 控制条：进度条、播放/暂停、下一集、静音、时间、清晰度、设置弹窗(自动下一集/跳过片头片尾/倍速)、画中画、video 全屏、播放器容器最大化；右上角新增 AirPlay 投屏按钮。右侧选集栏新增线路 tabs，分组 tabs 改为独立选中状态，修复 `1-50/51-100/101-149` 点击不切换；右侧栏高度与左侧播放器容器一致。1350px 以下下方迷你选集也补线路切换。已 `npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5152 `#/x8/play/921` 实测旧按钮为 0，控制按钮完整，点击 `51-100` 后首集为 `51`，切金牌后显示清晰度入口，设置弹窗正常。
- **2026-07-16 X8 播放器控制条内嵌回修断点**：`web/src/x8/X8Home.vue` 将自定义 HLS 控制条从播放器下方文档流移入 `.x8-video-container` 内部绝对定位，默认隐藏，点击/移动播放器后显示；AirPlay 同步改为交互后显示，避免操作层长期压在视频上。右侧选集栏高度改为与纯视频区域一致，不再把控制条高度算进去。已 `npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5152 `#/x8/play/921` 实测控制条 `position:absolute/opacity=0`，点击 video 后显示，控制条 top/bottom 完全落在播放器 top/bottom 内，右侧栏与视频区高度差为 0。
- **2026-07-16 X8 播放器最大化语义回修断点**：`web/src/x8/X8Home.vue` 将控制条两个全屏按钮语义拆清：第一个为播放器自身最大化(`theater-mode`)，只在页面内把播放器铺满视口并隐藏右侧选集、影片信息、下方选集和推荐内容；第二个为 `<video>` 原生系统全屏，调用 video fullscreen API。同步重做控制条观感：按钮热区 `34x34`、图标 `22x22`，进度条改为 3px 细轨道、小圆点和已播填充。已 `npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5152 `#/x8/play/921` 实测播放器最大化后 `.x8-play.theater-mode` 固定铺满视口、右侧栏 `display:none`、`document.fullscreenElement=false`，Esc 可退出。
- **2026-07-16 X8 播放器高度回修断点**：`web/src/x8/X8Home.vue` 播放页不再为了右侧选集把播放器撑高；桌面播放区最大宽从 `1750px` 收回 `1500px`，`.x8-player-video` 高度按左侧视频宽度计算 16:9，右侧选集栏固定跟随该高度，`.x8-side-episodes` 通过 `min-height:0 + overflow-y:auto` 内部滚动。已 `npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5152 2048×1200 实测 `#/x8/play/921`：播放器 `1500x641`，左侧视频 `1140x641`，右侧栏 `360x641`，高度差 0，选集滚动区 `overflow-y:auto`。
- **2026-07-16 X8 播放器设置菜单回修断点**：`web/src/x8/X8Home.vue` 播放器内设置入口图标改为 bolt，控制图标整体放大到 24px、bolt 25px；设置弹窗改为半透明毛玻璃(`rgba(18,18,18,.58) + blur(22px)`)；自动下一集/跳过片头片尾改为胶囊开关；倍速一级只显示“倍数 1.0x”入口，点击进入二级倍速面板，倍速项显示 `0.75x/1.0x/1.25x/1.5x/2.0x`。已 `npm run build`、`docker compose up -d --build web`、`git diff --check` 通过；5152 `#/x8/play/921` 实测设置弹窗、bolt 尺寸、二级倍速面板均生效。
- **2026-07-16 PC 自适应首页 Hero 黑帧回修断点**：`web/src/views/Home.vue` 旧自适应 PC 首页 Hero 从单个 `.hero-bg` 动态替换 `background-image` 改为所有 Hero 背景层常驻渲染，切换时只改变 `.on` 图层 opacity；新增 `heroImageReady/preloadHeroImage/warmHeroImages`，自动轮播和缩略图 hover/click 会先预载并尽量完成 decode，再切换可见背景层，避免图片已访问但被浏览器重新解码时露出黑底。`web/src/style.css` 移除无效的 `background-image` transition，改用 `.hero-bg-layer` opacity 过渡。已 `pnpm --dir web build`、`docker compose up -d --build web`、`git diff --check` 通过；运行态实测 7 个背景层常驻，点击第二个缩略图后可见层从当前层切到第 2 层，`visibleCount=1`。
- **2026-07-16 采集源自动转存/签名密钥/驱动感知预估断点**：修复两个“后端就绪、前端没接”的半成品。① `admin/src/views/Sources.vue` 源编辑表单新增“自动转存”开关(`form.autoArchive`，对应 `Source.autoArchive`，该源新片自动排队转存到本地硬盘) 与 jinpai 专用“签名密钥”输入(`form.signKey`，仅 `driver==='jinpai'` 时显示)，`resetForm` 初始化补 `signKey/autoArchive`，`save()`/`编辑` 均通过 spread 自动携带(后端 POST/PUT 已持久化这两字段)。② `server/src/routes/sources.ts` 的 `/api/sources/:id/typecount`(预估可采) 从写死 maccms 的 `fetchClasses/fetchTypeTotal` 改为走 `getDriver(s.driver)`：maccms 保留原精确 `fetchTypeTotal` 路径，其它驱动(jinpai/nbflix)改用 `driver.fetchList` 首页的 `pagecount × 首页条数` 估算并透传 `signKey`，修复金牌影院等非 maccms 源预估永远返回 0/预估失败。已 `npx tsc --noEmit` + `pnpm build`(server) + `pnpm build`(admin) 全过，**待重启后台服务生效**。

### 🔴 下一步（接班切入点，源自 `docs/backlog.md`）
1. **HLS 清洗新鲜度（后台刷新）**：为过期清洗结果加后台刷新——拉取源 m3u8 比对 `m3u8Hash`，内容不变则仅续期 `checkedAt`，仅当源播放列表变化才重跑清洗。**必须放在播放请求路径之外**，避免增加播放延迟/压力。
2. **播放访问模型重构**：把分类访问从「两个独立开关」改为**层级模型**；隐藏/禁用展示必须一律等于不可观看（含直连 `/api/resolve`）；观看权限统一按 `展示允许 AND 观看允许` 评估，后台 UI 禁止出现「隐藏展示 + 公开观看」等矛盾配置；抽公共的**服务端展示过滤 / 可观看过滤** helper（勿在历史/关注/推荐里复用基于展示的 `enabledTypeNames()`）；观看历史写入**延迟到 resolve 成功后**，避免被拒播放产生历史记录。

---

## 5. 文档维护约定（接班必读）

本文档为**动态交接文档**，任何代码改动后须同步更新，并在对应交付回复末尾附【文档更新日志】：
- 🟢 **新增/修改的文件**：职责变化。
- 🟡 **最新断点状态**：进度停在哪，下一个人从哪切入。
- 🔴 **配置变更**：新增环境变量/依赖。

> 维护方式：只改本源文件（`workspace-gogo/video-cms/README_HANDOVER.md`）；小虎虾文档中心分组 `cms视频` 经软链自动同步，无需二次复制。
