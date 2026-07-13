# Video-CMS 交接文档（README_HANDOVER）

> **文档性质**：动态交接文档（Handover Doc），供任意 AI/工程师无缝接班。
> **维护官**：Zia（gogo·全栈）｜**唯一真相源**：`workspace-gogo/video-cms/README_HANDOVER.md`
> **文档中心镜像**：小虎虾文档中心 → 分组 `cms视频`（经软链实时同步，改源文件即更新）
> **最后更新**：2026-07-13 (GMT+8)｜**对应提交**：待提交（移动模板筛选/播放器手势修复）

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

**代码状态**：移动模板筛选/播放器手势修复待提交｜上一代码提交：`fix: polish mobile pwa experience`
**运行状态**：4 容器全在线（postgres healthy / server·web 已于 2026-07-13 通过 `docker compose up -d --build web` 重建，admin 未重建）

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
