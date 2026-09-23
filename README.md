# 第五人格加页手记 · 多地图攻略手册

面向《第五人格》“加页手记”玩家的网页版互动地图攻略工具。按地图、困难 / 噩梦模式、入口、方向或正门通道类型查找布局，再查看全图与分层攻略。

- 项目站点：[idv-map.321666.xyz](https://idv-map.321666.xyz/)
- 地图后台：[后台管理](https://idv-map.321666.xyz/admin/)（需要 Cloudflare Access 授权）
- 源码与反馈：[GitHub](https://github.com/heytl/idv-cryptic-map) · [Issues](https://github.com/heytl/idv-cryptic-map/issues)

**版本状态：**当前工作区为 V3 多地图升级，尚待预览验收与正式发布。上述站点地址不代表已部署 V3；历史正式基线见 [V2.1.0 归档](docs/releases/V2.1.0.md)。本轮变化与待办见 [V3 版本记录](docs/releases/V3.md)。

## 功能与使用方式

- **多地图与多条件筛选**：当前迁移基线为“厄运之女”，可由后台管理更多地图。支持困难、噩梦模式；入口选项按模式与配置提供，侧门 / 二楼门按方向筛选，正门按通道类型筛选。记住最近选择，也可通过链接分享。
- **全图与分层查看**：默认打开全图，按布局提供一楼、二楼及地下室切换。
- **缩放、拖拽与全屏**：电脑端滚轮缩放、鼠标拖拽；手机和平板支持单指平移、双指捏合；工具栏可全屏、旋转和重置视角。
- **入口参考与备注**：在详情页打开参考面板，查看入口图片、说明与路线图例。
- **响应式界面**：目录沿用复古手记风格，详情采用统一墨蓝灰背景与金色操作文字；桌面内容最大宽度 1080px，移动端自适应。
- **PWA 离线阅读**：可添加到主屏幕；已缓存内容可离线阅读，也可下载当前地图离线包。首次使用需要联网，未下载或未缓存的图片不保证离线可用。
- **自托管字体**：Cinzel、Ma Shan Zheng、Noto Serif SC 本地加载，中文字体使用子集，不依赖运行时访问 Google Fonts。
- **在线管理**：后台支持地图 / 布局编辑、图片裁剪、发布、访问热度统计、配置备份恢复；完整图片和配置可通过工具导出迁移。

## 技术与数据

pnpm 工作区，前后台采用 **Vue 3 + TypeScript + Vite**。主站使用 **Cloudflare Workers + KV + R2**，V3 访问统计新增 **D1**；后台由 Cloudflare Access 保护。

内容真源为 KV `config:v3:current`，图片与版本备份存于 R2，统计独立存于 D1。修改地图通过后台发布，无需重新构建前端。首次读取可从现有 V2 配置转换，首次保存前归档 V2 基线。V2 正式分享链接与公开协议继续兼容；V1 页面、编辑 API 和静态图片链路已退役。

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
packages/shared/           V2/V3 协议、共享类型与校验
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

推荐先启动隔离验收服务。它不读写生产数据，提供样例配置和图片，进程重启后数据重置：

```powershell
pnpm exec wrangler deploy --dry-run --env dev --outdir .tmp/worker-build
node scripts/verification-server.mjs
# 另开终端，分别运行需要的前后台开发服务：
pnpm dev        # 玩家端默认 http://localhost:5210
pnpm dev:admin  # 后台地址以终端输出为准，路径 /admin/
```

前后台 API 代理到 `127.0.0.1:8787`。也可替换成真正的本地 Worker：先执行 `pnpm exec wrangler d1 migrations apply STATS --local --env dev`，再运行 `pnpm exec wrangler dev --env dev --local`，并导入本地内容；不要与隔离服务占用同一端口。

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
2. 新增或编辑布局，上传全图，裁剪楼层与入口参考图，填写门型 / 方向和备注。
3. 检查发布所需图片与入口信息，再保存、发布。
4. 刷新玩家端，核对入口筛选、楼层、备注与图片；已下载离线包可重新复查。

配置版本由服务端维护。布局 ID 不复用，删除采用软删除；目前采用单编辑者流程，KV 冲突检测不等同于数据库事务锁。配置恢复与包含图片的完整导出用途不同，详见 [备份与迁移](docs/V3-UPGRADE.md#完整导出与恢复)。

## 部署与发布

- **Cloudflare 主站**：推送 `feat/admin-backend` 时执行生产 D1 迁移和 Worker 部署；推送 `codex/v3-dev` 时执行预览 D1 迁移并部署至隔离的 `v2-preview` Worker；`main` 保留独立静态发布职责。
- **V3 前置条件**：生产发布前配置真实 D1 ID。开发分支部署前，在 GitHub 仓库 Actions Variables 设置 `V3_PREVIEW_D1_ID`，值为隔离数据库 `idv-map-stats-preview` 的 UUID。详情见 [V3 版本记录](docs/releases/V3.md)。
- **预览先行**：独立环境名仍为 `v2-preview`，不表示部署旧代码。PR 上传预览不能代替数据库准备与完整验收。
- **静态镜像**：保留 Vercel 配置；构建时设置 `VITE_MAP_API_BASE_URL` 指向提供 `/maps-v3.json` 的 Worker origin，并验证媒体跨域可用。镜像不提供管理 API，也不作为主站访问统计来源。

具体部署命令、备份、验收与回滚以 [V3 升级与运维](docs/V3-UPGRADE.md) 为准。未来 Docker 自托管只有业务 / 平台接口准备，本版本不包含 Docker 运行环境。

## 文档

- [文档索引](docs/README.md)
- [当前架构](docs/ARCHITECTURE.md)
- [V3 升级、部署、统计与恢复](docs/V3-UPGRADE.md)
- [V3 版本记录与发布清单](docs/releases/V3.md)
- [V2.1.0 历史正式基线](docs/releases/V2.1.0.md)

## 声明与致谢

本项目免费开放使用，是玩家社区辅助工具。

- 地图攻略原素材来自社区作者 [凉哈皮](https://space.bilibili.com/8618005) 的公开一图流攻略，感谢原作者整理与分享。
- 游戏及地图版权归《第五人格》官方所有。
- 字体 Cinzel / Ma Shan Zheng / Noto Serif SC 来自 [google/fonts](https://github.com/google/fonts)，按 OFL 协议使用并自托管。
- 欢迎通过 GitHub Issues 反馈错误、缺图与体验问题；反馈时请附地图、模式、入口、布局及复现步骤。
