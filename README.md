# 第五人格加页手记 · 解密手册

面向《第五人格》“加页手记”玩家的互动地图攻略工具，提供 Web 与微信小程序。按地图、困难 / 噩梦模式、入口、方向或正门通道类型查找布局，再查看全图与分层攻略。

- 项目站点：[idv-map.321666.xyz](https://idv-map.321666.xyz/)
- Cloudflare 备用入口：[idvmap.321666.xyz](https://idvmap.321666.xyz/)（主域名已切换 Oracle Docker，备用站内容尚未自动同步）
- 地图后台：[后台管理](https://idv-map.321666.xyz/admin/)（Docker 管理密钥登录；CF 备用后台继续由 Access 保护）
- 源码与反馈：[GitHub](https://github.com/heytl/idv-cryptic-map) · [Issues](https://github.com/heytl/idv-cryptic-map/issues)

**版本状态：**V3 已于 2026-10-22 发布到正式站，公开数据使用 V4 协议；CF 上线基线内容版本为 41，Docker 与 CF 的内容版本独立递增。Web 与新版小程序共用正式统计接口，后台区分来源。发布、备份与验收见 [正式上线记录](docs/releases/V3-PRODUCTION-2026-10-22.md)，历史基线见 [V2.1.0 归档](docs/releases/V2.1.0.md)。

微信小程序 `0.1.0` 初版已获用户初步功能验收通过。本轮已生成指向正式 API、包含访问统计的新版产物；微信平台上传、审核与发布需单独执行，旧包不会自动接入统计。支持目录筛选、分层地图、WXS 手势和楼层图片预览缓存；开发入口见 [小程序指南](docs/MINIPROGRAM.md)，交付范围及验收反馈见 [初版记录](docs/releases/MINIPROGRAM-0.1.0.md)。

## 功能与使用方式

- **多地图与多条件筛选**：当前迁移基线为“厄运之女”，可由后台管理更多地图。支持困难、噩梦模式；入口选项按模式与配置提供，并按入口类型提供方向或通道筛选。记住最近选择，也可通过链接分享。
- **全图与分层查看**：默认打开全图，按布局提供一楼、二楼及地下室切换。
- **横滑切层与联动动画**：Web 和小程序支持边缘横滑切层；放大时先拖地图，到左右边界后继续横滑才切换。相邻楼层跟手显露，图片与金色楼层胶囊同步滑动，不足距离回弹，首尾不循环。
- **缩放、拖拽与全屏**：电脑端滚轮缩放、鼠标拖拽；手机和平板支持单指平移、双指捏合；工具栏可全屏、旋转和重置视角。
- **入口参考与备注**：在详情页打开参考面板，查看入口图片、说明与路线图例。
- **响应式界面**：目录沿用复古手记风格，详情采用统一墨蓝灰背景与金色操作文字；桌面内容最大宽度 1080px，移动端自适应。
- **PWA 离线阅读**：可添加到主屏幕；已缓存内容可离线阅读，也可下载当前地图离线包。首次使用需要联网，未下载或未缓存的图片不保证离线可用。
- **自托管字体**：Cinzel、Ma Shan Zheng、Noto Serif SC 本地加载，中文字体使用子集，不依赖运行时访问 Google Fonts。
- **在线管理**：后台支持地图 / 布局编辑、图片裁剪、发布、访问热度统计、配置备份恢复；完整图片和配置可通过工具导出迁移。

## 技术与数据

pnpm 工作区，前后台采用 **Vue 3 + TypeScript + Vite**。同一正式源码同时支持 **Node.js + SQLite Docker** 和 **Cloudflare Workers + KV + R2 + D1**；Docker 后台使用站内密钥会话，CF 后台由 Cloudflare Access 保护。

Docker 配置、图片、版本备份与统计保存在 SQLite；CF 配置在 KV `config:v3:current`，图片与版本备份在 R2，统计在 D1。两端内容和统计独立，不自动同步。修改地图通过后台发布，无需重新构建前端。首次读取可从现有 V2 配置转换，首次保存前归档 V2 基线。旧分享链接继续兼容，公开数据使用 V4（旧 V2/V3 图片协议返回升级提示）；V1 页面、编辑 API 和静态图片链路已退役。

部分文件名和路由内部名称仍保留 `V2`，用于延续原组件与接口调用，**不表示存在第二套可编辑内容源**。详见 [架构总览](docs/ARCHITECTURE.md)。

## 项目结构

```text
apps/web/                  玩家端、PWA、字体与地图交互
  src/views/               地图选择、布局目录、攻略详情
  src/components/          筛选、地图视口、楼层切换、入口图例
  src/composables/         缩放拖拽、离线缓存等逻辑
  src/data/                公开数据读取、测试与版本快照
  scripts/                 字体子集、交互与 PWA 验收
apps/admin/                地图管理、裁剪、统计、备份恢复
apps/miniprogram/          uni-app 微信小程序、WXS 地图手势、楼层预览缓存
packages/shared/           V2/V3 历史配置、V4 公开协议、共享类型与校验
packages/server/src/       内容与统计业务、平台存储接口
workers/                   HTTP 路由、Cloudflare 适配、定时任务
  migrations/              D1 数据库迁移
scripts/                   迁移、完整导出导入、隔离验收与只读预览
maps/                      原始素材，不随前端构建发布
docs/                      架构、升级运维、版本与历史记录
wrangler.jsonc             Worker 各环境绑定与部署配置
vercel.json                备用静态镜像构建配置
.github/workflows/         测试、构建与 Worker 部署
```

## 本地开发与验证

需要 **Node.js 22.13+**、**pnpm 11.19.0**；浏览器自动验收还需要本机 Chrome。

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm check:shared
pnpm check:worker
pnpm build
```

微信小程序开发运行 `pnpm dev:miniprogram`，非 watch 测试构建运行 `pnpm build:miniprogram:preview`，然后在微信开发者工具导入对应的 `apps/miniprogram/dist` 工程目录。根 `pnpm build` 包含小程序测试环境编译；正式构建独立运行 `pnpm build:miniprogram`，需在本地配置生产 API 和真实 AppID。详细配置、产物路径及缓存排查见 [小程序指南](docs/MINIPROGRAM.md)。

推荐先启动隔离验收服务。它不读写生产数据，提供样例配置、图片和虚构的演示访问数据，进程重启后数据重置：

```powershell
pnpm exec wrangler deploy --dry-run --env dev --outdir .tmp/worker-build
node scripts/verification-server.mjs
# 另开终端，分别运行需要的前后台开发服务：
pnpm dev        # 玩家端默认 http://localhost:5210
pnpm dev:admin  # 后台地址以终端输出为准，路径 /admin/
```

需要联调本地 Worker 时，前后台 API 代理到 `127.0.0.1:8787`。在 `apps/web/.env.development.local` 中设置 `VITE_MAP_API_BASE_URL=`，再执行 `pnpm exec wrangler d1 migrations apply STATS --local --env dev`、运行 `pnpm exec wrangler dev --env dev --local` 并导入本地内容；不要与隔离服务占用同一端口。

直接运行 `pnpm dev` 时，玩家端默认从隔离测试环境 `idv-map-dev.321666.xyz` 读取最新地图配置与图片；此设置只用于 Vite 开发，不影响生产构建。需要改用本地 Worker 时，在 `apps/web/.env.development.local` 中设置 `VITE_MAP_API_BASE_URL=` 覆盖默认值。

```powershell
# 查看线上当前公开地图与图片（需要网络），本机只读，不转发后台和统计写入
pnpm preview:demo   # 打开 http://127.0.0.1:8791/#/maps

# 针对已启动的隔离服务；服务使用 pnpm build 生成的产物
pnpm verify:e2e
pnpm verify:pwa
```

隔离服务将所有图片引用映射到本地样例图，适合验证流程，不用于验收正式地图素材。普通 `pnpm preview` 只预览静态产物，不能代替 Worker API。字体出现缺字时，运行 `node apps/web/scripts/subset-fonts.mjs` 并重新测试。

## 日常地图维护

1. 进入已部署相应版本的后台，选择目标游戏地图及模式。
2. 新增或编辑布局，上传完整全图，选择楼层区域并裁剪入口参考图，填写门型 / 方向和备注。
3. 检查发布所需图片与入口信息，再保存、发布。
4. 刷新玩家端，核对入口筛选、楼层、备注与图片；已下载离线包可重新复查。

配置版本由服务端维护。布局 ID 不复用，删除采用软删除；目前采用单编辑者流程，KV 冲突检测不等同于数据库事务锁。配置恢复与包含图片的完整导出用途不同，详见 [备份与迁移](docs/V3-UPGRADE.md#完整导出与恢复)。

## 部署与发布

统一正式源码为 `production`，开发分支为 `dev`；`main` 保留静态版本职责。详见 [分支与发布约定](docs/BRANCHES.md)。

- **验证**：PR、`dev` 和 `production` 更新运行共享测试、类型检查、构建、PWA 升级和 AMD64 / ARM64 容器验证。
- **开发预览**：[AMD1 Docker 测试站](https://idv-map-dev.321666.xyz/) 已手动部署，更新方式见 [测试环境](docs/TEST-ENVIRONMENT.md)。`dev` 验证通过后仍自动更新隔离 CF `v2-preview` 的 Workers 地址，需配置 `V3_PREVIEW_D1_ID`；不会自动更新 AMD1。
- **正式发布**：合入 `production` 不更新线上。GitHub Actions 的 **Release** 选择 `production`，再选择 `docker`、`cloudflare` 或 `both`，发布前重新验证同一提交。
- **Docker**：发布双架构镜像 `ghcr.io/heytl/idv-cryptic-map:<完整提交 SHA>`，输出摘要；服务器手动拉取指定版本。发布镜像不会更新服务器。
- **Cloudflare**：迁移正式 D1 后发布备用 Worker，保持 `idvmap.321666.xyz` / `new-map.321666.xyz`；不重新绑定 Docker 主域名。
- **静态镜像**：保留 Vercel 配置，通过 `VITE_MAP_API_BASE_URL` 指向提供公开 V4 API 的站点，并验证跨域媒体读取；不提供管理 API。

Docker 启动、镜像升级和恢复见 [Docker 部署指南](docs/DOCKER.md)。CF 数据归档和历史运维见 [V3 升级与运维](docs/V3-UPGRADE.md)；CF 定时快照不能代替 Docker 数据库异地备份。

## 文档

- [文档索引](docs/README.md)
- [当前架构](docs/ARCHITECTURE.md)
- [微信小程序开发指南](docs/MINIPROGRAM.md)
- [微信小程序初版记录与验收清单](docs/releases/MINIPROGRAM-0.1.0.md)
- [V3 升级、部署、统计与恢复](docs/V3-UPGRADE.md)
- [V3 版本记录与发布清单](docs/releases/V3.md)
- [V2.1.0 历史正式基线](docs/releases/V2.1.0.md)

## 声明与致谢

本项目免费开放使用，是玩家社区辅助工具。

- 地图攻略原素材来自社区作者 [凉哈皮](https://space.bilibili.com/8618005) 的公开一图流攻略，感谢原作者整理与分享。
- 游戏及地图版权归《第五人格》官方所有。
- 字体 Cinzel / Ma Shan Zheng / Noto Serif SC 来自 [google/fonts](https://github.com/google/fonts)，按 OFL 协议使用并自托管。
- 欢迎通过 GitHub Issues 反馈错误、缺图与体验问题；反馈时请附地图、模式、入口、布局及复现步骤。

楼层区域与移动端编辑器的迁移、验收和回滚说明见 [区域改造说明](docs/FLOOR-REGIONS.md)。
