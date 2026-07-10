# Video-CMS 交接文档（README_HANDOVER）

> **文档性质**：动态交接文档（Handover Doc），供任意 AI/工程师无缝接班。
> **维护官**：Zia（gogo·全栈）｜**唯一真相源**：`workspace-gogo/video-cms/README_HANDOVER.md`
> **文档中心镜像**：小虎虾文档中心 → 分组 `cms视频`（经软链实时同步，改源文件即更新）
> **最后更新**：2026-07-11 (GMT+8)｜**对应提交**：本提交（PWA 自动更新与 iOS 状态栏沉浸兼容）

---

## 0. 一句话定位

一套**视频内容采集 + 聚合 + 分发 CMS**：后端从上游源（MacCMS API + 豆瓣元数据）采集影片 → 分类/去重/补全 → 清洗 HLS(m3u8) 去广告 → 播放解析与代理；对外提供**观众前端**（PC + 移动端模板）与**运营后台**（鉴权管理台）。

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
上游源(MacCMS/豆瓣) ──采集──> taskRunner ──分类/去重──> Vod/Person(PG)
                                              │
                              豆瓣补全元数据 ← metaAssets
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
│       │   ├── douban.ts       #   豆瓣元数据补全
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
- **后端全链路 API**：采集源管理、采集任务引擎(taskRunner)+ 定时调度、MacCMS 适配、豆瓣元数据补全、分类/去重、**HLS 清洗去广告**、播放解析(resolve)+代理(hlsProxy/playProxy)。
- **用户与权限**：后台管理员 + Web 用户体系、VIP 等级、邀请码、登录限流、访问审计(AccessAudit)+ 操作审计(AuditLog)。
- **站点运营**：站点/主题配置(15 原子 token 主题系统)、热榜配置、分类访问控制、聚合计数缓存（浏览/分页/搜索提速 + P0 索引）。
- **运营后台**：12 个页面全部落地（Login/Dashboard/Sources/Vods/Categories/Tasks/Meta/Site/Users/Hot/Access/HlsClean）。
- **观众前端**：PC 端（Home/Play/Shorts/Auth/Profile）+ 移动端模板（Shell/Home/Search/Shorts/Theater/Me）。

### 🟡 正在进行
- **豆瓣元数据匹配**：豆瓣图片只落两类资产：竖版海报(`poster`/`officialPic`)与横图(`backdrop`/Hero)。匹配写库前会从详情图和 `photos` 接口候选中探测尺寸，跳过 `s_ratio_poster`，最少使用 `m_ratio_poster`，优先更大图；若豆瓣候选清晰度/面积低于原采集源封面，则不覆盖 `officialPic`。`autoMatchScore` 达标即自动写入；后台即时/筛选提交会显式带当前置信分；匹配/人工确认后同步影片 `year`，以豆瓣年份为准并清聚合缓存。
- **移动端模板收口**：`/m/me` 已替换占位，展示登录/会员权益/观看历史/追剧/推荐；后台 `站点设置 -> 首页设置 -> 移动端模板` 已恢复 `homeConfig.mobileTemplate` 开关；开启 `shortDrama` 后，仅手机 UA 会从 PC 首页自动跳转到 `/m` 模板，iPad/tablet/桌面窄窗口不再被自动跳转；`/m` 首页 Hero 已由单条推荐升级为多条轮播，沿用原大卡样式，支持手势/点位/自动轮播，过渡为方向感轻滑淡入；Hero 切换已从 `out-in` 顺序切换改为同步叠层切换，旧图淡出时新图同步淡入，不再露出底层背景；`/m/search` 顶部浏览器颜色与剧场页背景统一；`/m/shorts` 有声自动播放被浏览器拦截时会先静音播放并显示“轻触开启声音”，真正 `playing` 前不隐藏封面；iOS PWA 兼容：静态状态栏 meta 已改为 `black-translucent`，移动模板运行期会同步写入 `html/body` 的 `background` 与 `background-color`，全集态播放器恢复 `100dvh` 全屏铺底，避免 PWA 状态栏和播放器顶部被安全区裁短；PWA 更新链路已改为页面已完成 load 时也会立即注册 SW，新版 SW 安装后自动 `skipWaiting`/`clients.claim`，页面 focus/pageshow/回前台时主动 `registration.update()`，避免 iOS 桌面版长期卡旧壳；刷剧底部 UI 已按漫游态/全集态拆分：漫游态标题/标签/简介整体下移，降低黑色遮罩、底部条全宽无圆角并贴合导航，横条 blur 已降低，文案为“观看完整{分类} · 全 N 集 · 免费观看”，进度条位于底部条上沿并上移 1px，进度点不再被横条容器裁剪；头部筛选/搜索和右侧追剧/点赞/分享按钮已去背景，头部控制层固定为当前激活卡，不随卡片切换位移，头部图标间距已内收，漫游态右侧动作区底部已和简介区对齐；全集态隐藏主导航，顶部左侧为返回箭头 + 小字号集数标题，位置和图标尺寸与漫游态头部一致，右侧仅保留搜索与更多，中央播放按钮改为无背景通用播放图标，打开声音与全屏观看统一为居中并排胶囊提示，开声后只保留全屏观看，底部进度条轨道位于选集条黑区上沿上方 1px，选集条位于底部黑色安全区内，右侧为独立方形清屏观看按钮，底部黑区高度与移动底部菜单栏一致为 `62px + safe-area`，选集胶囊高度为 36px，上下各 13px 居中，胶囊按固定横向网格与黑底左右对齐，文字左对齐且垂直居中；刷剧筛选已支持主分类/小分类多选、已选 tag、一键重置和 localStorage 持久化，刷新/重进/登录态刷新后保留已应用筛选；筛选面板底部按钮白底延伸覆盖 safe-area；短剧流和筛选项按“可展示分类”返回，播放时仍由 `resolve` 判断登录/VIP/等级权限；登录、登出或 VIP 状态变化后，移动刷剧页会清播放缓存并立即重拉站点配置、筛选项和 feed。
- **影片维护能力**：后台影片详情可设置单片自动采集周期（按天间隔或固定周几），调度器每 10 分钟扫描到期影片并重拉现有片源详情，可选同步豆瓣与提交 HLS 清洗；影片清理支持按分类/子分类叠加年份过滤，并新增按分类删除、无封面、无豆瓣封面、无横图/Hero 图等规则。

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
