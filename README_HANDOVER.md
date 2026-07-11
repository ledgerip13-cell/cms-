# Video-CMS 交接文档（README_HANDOVER）

> **文档性质**：动态交接文档（Handover Doc），供任意 AI/工程师无缝接班。
> **维护官**：Zia（gogo·全栈）｜**唯一真相源**：`workspace-gogo/video-cms/README_HANDOVER.md`
> **文档中心镜像**：小虎虾文档中心 → 分组 `cms视频`（经软链实时同步，改源文件即更新）
> **最后更新**：2026-07-11 (GMT+8)｜**对应提交**：本提交（注册账号规则与邀请码大小写兼容）

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
│           ├── cleaner.ts      #   ★(28KB) m3u8 清洗/去广告
│           └── tsProbe.ts      #   TS 分片探测
│
├── admin/                      # 运营后台(Vue3 + Element Plus)
│   └── src/views/             # Login/Dashboard/Sources/Vods/Categories/Tasks/Meta/Site/Users/Hot/Access/HlsClean
│
└── web/                        # 观众前端(Vue3 + hls.js)
    └── src/
        ├── views/             # Home/Play/Shorts/Auth/Profile (PC)
        ├── mobile/            # MobileShell/Home/Search/Shorts/Theater/Me (独立移动模板)
        └── components/        # AuthModal/ToastStack
```

### Prisma 数据模型（26 个）
`Source` `Category` `SourceTypeMap` `SiteConfig` `MetaConfig` `HotConfig` `HlsCleanConfig` `HlsCleanPolicy` `HlsCleanResult` `User` `WebUser` `VipLevel` `LegacyMemberGroup` `LegacyWebUserGroup` `InviteCode` `AuditLog` `AccessAudit` `Vod` `VodAlias` `Person` `VodPerson` `VodImage` `UserFollow` `WatchHistory` `Play` `Task` `SyncLog`

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

**代码状态**：`git` 工作树干净 ✅｜本提交：`feat: improve douban assets and vod maintenance`
**运行状态**：4 容器全在线（postgres healthy / server·web·admin 已按最近提交重建）

### 🟢 100% 已完成
- **后端全链路 API**：采集源管理、采集任务引擎(taskRunner)+ 定时调度、MacCMS 适配、元数据补全（豆瓣/TMDB）、分类/去重、**HLS 清洗去广告**、播放解析(resolve)+代理(hlsProxy/playProxy)。
- **用户与权限**：后台管理员 + Web 用户体系、VIP 等级、邀请码、登录限流、访问审计(AccessAudit)+ 操作审计(AuditLog)。
- **站点运营**：站点/主题配置(15 原子 token 主题系统)、热榜配置、分类访问控制、聚合计数缓存（浏览/分页/搜索提速 + P0 索引）。
- **运营后台**：12 个页面全部落地（Login/Dashboard/Sources/Vods/Categories/Tasks/Meta/Site/Users/Hot/Access/HlsClean）。
- **观众前端**：PC 端（Home/Play/Shorts/Auth/Profile）+ 移动端模板（Shell/Home/Search/Shorts/Theater/Me）。

### 🟡 正在进行
- **元数据匹配**：匹配源由 `MetaConfig.providersConfig` 决定，目前内置豆瓣/TMDB。命中后写入 `metaSource/metaSourceId` 标注来源，并落库评分、简介、类型、官方封面、剧照、人物与别名；旧 `doubanId` 仅作为豆瓣来源兼容字段。图片只落两类资产：竖版海报(`poster`/`officialPic`)与横图(`backdrop`/Hero)。匹配写库前会探测候选图尺寸，低清候选不覆盖更好的原采集源封面；匹配/人工确认后同步影片 `year` 并清聚合缓存。
- **移动端模板收口**：`/m/me` 已替换占位，展示登录/会员权益/观看历史/追剧/推荐；后台 `站点设置 -> 首页设置 -> 移动端模板` 已恢复 `homeConfig.mobileTemplate` 开关；开启 `shortDrama` 后，仅手机 UA 会从 PC 首页自动跳转到 `/m` 模板，iPad/tablet/桌面窄窗口不再被自动跳转；`/m` 首页 Hero 已由单条推荐升级为多条轮播，沿用原大卡样式，支持手势/点位/自动轮播，过渡为方向感轻滑淡入；Hero 切换已从 `out-in` 顺序切换改为同步叠层切换，旧图淡出时新图同步淡入，不再露出底层背景；`/m/search` 顶部浏览器颜色与剧场页背景统一；`/m/shorts` 有声自动播放被浏览器拦截时会先静音播放并显示“轻触开启声音”，真正 `playing` 前不隐藏封面；iOS PWA 兼容：静态状态栏 meta 已改为 `black-translucent`，移动模板运行期会同步写入 `html/body` 的 `background` 与 `background-color`，全集态播放器恢复 `100dvh` 全屏铺底，避免 PWA 状态栏和播放器顶部被安全区裁短；PWA 更新链路已改为页面已完成 load 时也会立即注册 SW，新版 SW 安装后自动 `skipWaiting`/`clients.claim`，页面 focus/pageshow/回前台时主动 `registration.update()`，避免 iOS 桌面版长期卡旧壳；刷剧底部 UI 已按漫游态/全集态拆分：漫游态标题/标签/简介整体下移，降低黑色遮罩、底部条全宽无圆角并贴合导航，横条 blur 已降低，文案为“观看完整{分类} · 全 N 集 · 免费观看”，进度条位于底部条上沿并上移 1px，进度点不再被横条容器裁剪；头部筛选/搜索和右侧追剧/点赞/分享按钮已去背景，头部控制层固定为当前激活卡，不随卡片切换位移，头部图标间距已内收，漫游态右侧动作区底部已和简介区对齐；全集态隐藏主导航，顶部左侧为返回箭头 + 小字号集数标题，位置和图标尺寸与漫游态头部一致，右侧仅保留搜索与更多，中央播放按钮改为无背景通用播放图标，打开声音与全屏观看统一为居中并排胶囊提示，开声后只保留全屏观看，底部进度条轨道位于选集条黑区上沿上方 1px，选集条位于底部黑色安全区内，右侧为独立方形清屏观看按钮，底部黑区高度与移动底部菜单栏一致为 `62px + safe-area`，选集胶囊高度为 36px，上下各 13px 居中，胶囊按固定横向网格与黑底左右对齐，文字左对齐且垂直居中；刷剧筛选已支持主分类/小分类多选、已选 tag、一键重置和 localStorage 持久化，刷新/重进/登录态刷新后保留已应用筛选；筛选面板底部按钮白底延伸覆盖 safe-area；短剧流和筛选项按“可展示分类”返回，播放时仍由 `resolve` 判断登录/VIP/等级权限；登录、登出或 VIP 状态变化后，移动刷剧页会清播放缓存并立即重拉站点配置、筛选项和 feed；从“登录后继续观看”权限锁打开登录弹窗后，登录成功会强制刷新用户态、清除锁层、重拉权限数据并回到当前卡重新调度播放。
- **影片维护能力**：后台影片详情可设置单片自动采集周期（按天间隔或固定周几），调度器每 10 分钟扫描到期影片并重拉现有片源详情，可选同步豆瓣与提交 HLS 清洗；影片清理支持按分类/子分类叠加年份过滤，并新增按分类删除、无封面、无豆瓣封面、无横图/Hero 图等规则。
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
- **2026-07-11 刷剧横屏断点**：`MobileShorts.vue` 全集态横竖屏/视口 resize 已增加短保护窗口，resize 期间清理待提交翻集任务并把滚动位置校正回当前集；不停止视频、不重拉播放源，避免横屏时 `scrollTop/clientHeight` 变化误判为下滑并自动切到下一集。
- **2026-07-11 移动固定头部断点**：移动首页 `MobileHome.vue` 顶部 logo/search 已改为 fixed 固定在视口顶部，页面内容用 `safe-area + 64px` 预留头部高度，Hero 从固定头下方开始，不被搜索栏遮挡；头部背景颜色为 `rgb(255 244 241)`，透明度按 scrollY 从 0 逐渐到 90%，并限制移动页纵向 overscroll 回弹。移动剧场 `MobileTheater.vue` 顶部只保留 fixed 搜索栏，同样预留头部高度，“全站热播榜”从搜索栏下方开始；分类/排序回到内容流，头部滚动背景与首页同步。个人中心 `MobileMe.vue` 顶部用户卡保持 sticky 固定，下面权益、统计和列表继续滚动。
- **2026-07-11 移动搜索断点**：`MobileSearch.vue` 的热门榜/短剧榜/动漫榜/电影榜已增加按 tab key 的内存缓存，切换回来直接复用已加载榜单，不再重复请求；榜单请求增加 `rankRequestId` 防止快速切换时旧响应覆盖当前榜单。
- **2026-07-11 移动搜索样式断点**：搜索页榜单 tab 与结果分类 tab 的默认文字色统一为 `#2106069e`；榜单 tab 字号提升到 15px，结果分类 tab 字号提升到 14px。
- **2026-07-11 移动搜索榜单标签断点**：`MobileSearch.vue` 搜索榜单卡片标签改为真实字段驱动的三类：采集源 `remarks` 命中完结/全集/全 N 集等显示“完结”，否则 `contentUpdatedAt/createdAt` 21 天内显示“新剧”，其余按真实热度榜单兜底显示“热门”；移除原独立硬贴的“新剧”角标和底部热度胶囊。
- **2026-07-11 移动搜索猜你想搜断点**：`MobileSearch.vue` 的“猜你想搜”只展示 2 行（4 个词），词条去掉白底和阴影，网格 gap 改为 0；搜索历史仍保留原卡片样式。
- **2026-07-11 移动搜索头部断点**：`MobileSearch.vue` 搜索页头部从 sticky 改为 fixed 固定吸顶；初始背景透明，滚动时按 `scrollY` 渐显 `rgb(255 244 241)` 纯色背景，去掉头部渐变与页面顶部装饰渐变，内容区预留固定头部高度避免遮挡。
- **2026-07-11 横向分类可视断点**：移动剧场大类/排序、移动搜索榜单/结果分类等横向 tab 增加选中项位置修正；每次选中都会按容器宽度尽量把 `.on` 按钮滚到可视区中间，首尾只受 `scrollLeft` 边界限制，确保后续分类可见。
- **2026-07-11 移动首页分类断点**：`MobileHome.vue` 已移除 Hero 下方的首页快捷分类入口（电影/电视剧/动漫/短剧等），并停止首页为该入口请求分类接口；“更多”仍通过 `goTheater('', sort)` 进入剧场。
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
- **2026-07-11 元数据手动匹配断点**：`/api/meta/match/:id` 单片手动重匹配已从同步即时匹配改为创建单片 `meta` 后台任务（`vodIds=[id]`、`redo=true`、`priority=40`），统一进入 `taskRunner.runMetaTask()`，沿用当前启用源、TMDB 并发数、每 worker 数量、保存图片等配置。后台元数据概览页新增“手动范围匹配”入口，可直接按状态/分类/采集源提交，复用 `split=true` 拆分排队逻辑。
- **2026-07-11 元数据源配置样式断点**：`Meta.vue` 的采集匹配源配置已精简表单文案（限速/任务上限/并发/单工处理/通过分/候选分），长说明移动到独立灰色说明行；表单内容区支持换行，input-number 固定安全宽度，避免 label、单位、控件在窄卡片内重叠。
- **2026-07-11 元数据全局设置断点**：`Meta.vue` 已将“保存图片”“自动匹配”等全局元数据配置从匹配源列表下方前移到独立“全局设置”区，并补充“所有元数据源生效/按优先级执行”说明，避免误解为豆瓣或某个单源专属配置；全局表单内容同样支持换行，避免说明文字与控件重叠。
- **2026-07-11 豆瓣诊断断点**：实测豆瓣详情接口和电影搜索正常，但豆瓣移动搜索接口对未登录请求返回 `need_login`，且 `subject_suggest/search_subjects` 对国产动漫/剧集标题经常返回空；后台已将 `no_suggest/detail_failed/低置信` 分开显示，避免把搜索无候选误报为“未收录”。
- **2026-07-11 豆瓣分季打分断点**：`collector/douban.ts` 新增 `romanToArabic()`（罗马数字Ⅰ-Ⅹ→阿拉伯）与 `baseTitle()`（去「年番N/第N季/SN/Season N」分季后缀 + 括注 + 罗马数字归一）；`scoreCandidate` 标题打分新增 `title_base=48` 档位（介于 `title_contains=38` 与 `title_exact=55` 之间），专治豆瓣分季命名（如「斗罗大陆Ⅱ绝世唐门 年番1/2/3/4」）与本库无后缀命名不一致导致的标题相似度打折；**不直接给满分**，最终仍靠 `year_match(+22)` 二次区分具体季，防串季误配；同时 `typeScore` 动漫→tv 分由 5 提到 8，与普通剧集对齐。实测回归：斗罗大陆Ⅱ绝世唐门 #2373/#1397/#7640 均由 pending(54-65) → **matched(78)**，太平年 #158359 保持 85，给 2026 年份时正确命中年番4(2026) 不串季。已 `tsc` build 通过，**待重启后台服务生效**。
- **2026-07-11 豆瓣限流退避断点**：`collector/douban.ts` 的 `getJson()` 对 403/408/429/5xx、超时、空响应增加短退避重试；`doubanSuggest()` 对 `subject_suggest` 空数组不再立刻判空兜底，而是 3 次递增退避后再进入 `search_subjects`、移动搜索、网页 subject 抓取等兜底链，每个空阶段之间追加 900ms 缓冲，降低批量匹配时豆瓣假空导致 `no_suggest` 的概率。已 `pnpm --dir server build` 通过，**待重启后台服务生效**。

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
