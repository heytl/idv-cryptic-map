# V3 多地图、统计与迁移说明

> 当前实现的升级手册，尚待正式发布。本轮功能与验收结果见 [V3 版本记录](releases/V3.md)，历史版本见 [V2.1.0](releases/V2.1.0.md)。

## 本次交付

- V1 页面、后台、启动加载、静态配置、专用图片和迁移工具退出运行链路。旧 hash 地址回地图选择页；`/maps.json` 与 V1 API 返回 410。
- `GameMap → Layout → entrances / floorImages`，原 V2 基线的 50 个布局（49 个公开）归入厄运之女；图片键和 ID 不变。
- 地图选择、按模式/入口/门型或方向查找布局，按地图下载离线包。V2 正式链接仍可使用。
- 后台新增地图管理、访问统计、备份恢复。当前 API 为 `/api/admin/v3/*`，V2 编辑接口返回 410。
- `packages/server/src` 是与平台无关的业务服务及接口；`workers/cloudflare.ts` 提供 KV、R2、D1、Access 适配。Docker 运行入口、服务器存储和登录系统尚未实施。

## 数据与兼容

V3 真源为 KV `config:v3:current`。若此键尚不存在，Worker 只读现有 `config:v2:current` 并转换；首次在新后台保存时，先归档 V2 基线至 R2 `backups-v3/v2-baseline.json`，再保存 V3。之后不再读取 V2 作为正式内容，也不维护第二个编辑源。

`/maps-v3.json` 输出多地图协议；`/maps-v2.json` 和 `/api/public/v2/maps` 从 V3 投影厄运之女，保持现有公开客户端协议。内容下架同样作用于兼容接口。

纯文件迁移（不写远端，输出文件必须不存在）：

```powershell
pnpm migrate:v3 baseline-v2.json migrated-v3.json
```

布局只能软删除，已删除 ID 不可复用；有布局引用的地图只能下架。恢复历史配置时，新增过的 ID 保留为下架/软删除记录，因此历史统计不会指向后来新增的布局。图片按内容哈希上传，禁止覆盖不同内容的同名资源。

**并发限制：**KV 的版本比较是尽力冲突检测，不是原子 compare-and-swap。后台应使用单编辑者工作流。真正多管理员同时编辑需要后续引入串行写入协调或事务型内容仓库，不能把现有检查视作数据库锁。

## 上线前准备（本次未操作生产）

1. 保存当前 Worker 发布版本、V2 完整配置和图片备份。先在独立预览环境验证 V3。
2. 创建生产与预览各自的 D1 数据库，将真实 `database_id` 写入 `wrangler.jsonc` 对应的 `STATS` 配置。配置中只有数据库名称，不包含臆造的生产 ID；不要依赖首次生产部署隐式建库。
3. 分别执行生产和预览 D1 迁移，再发布相应 Worker。测试数据不得写入生产库。

```powershell
pnpm exec wrangler d1 create idv-map-stats
pnpm exec wrangler d1 create idv-map-stats-preview
# 填入各环境 database_id 后：
pnpm exec wrangler d1 migrations apply STATS --remote
pnpm exec wrangler d1 migrations apply STATS --remote --env v2-preview
```

4. 核对 `TELEMETRY_ORIGIN` 为正式主站的精确 origin。备用域名与静态镜像不计数。预览默认留空，若需联机验收，仅设置为该预览环境自己的 origin。
5. `TELEMETRY_LIMITER` 使用每 IP 每分钟 60 次的边缘限流；这只是防滥用手段，不是全球精确配额。统计内容不保存 IP 或用户标识。
6. Access 继续保护 `/admin/*`、`/api/*`，公开配置走 `/maps-v3.json`，采集走 `/telemetry/events`。公开采集不要求后台登录。
7. 发布后检查多地图流程、V2 兼容链接、后台保存、一次有效访问与统计页。采集未配置或失败只影响统计，不影响查图。

本地只读查看生产公开地图（使用正式 V2 JSON 与图片，后台禁用、统计请求丢弃）：先构建，再执行 `pnpm preview:demo`，打开 `http://127.0.0.1:8791/#/maps`。可通过 `DEMO_CONFIG_URL` 指定其他公开 V2 / V3 JSON 端点，通过 `DEMO_PREVIEW_PORT` 改端口。

本地数据库迁移：`pnpm exec wrangler d1 migrations apply STATS --local --env dev`。本地开发身份绕过只存在于 dev/隔离预览环境，生产仍校验 Access JWT。

## 统计口径

- 每次进入有效布局详情、刷新、返回目录后重新进入、切到另一布局：各一次。
- 同布局切换楼层/入口、缩放、目录浏览、下载离线包不计；页面不可见时等待可见再计。
- 离线访问和失败上报不补报；仅主站同源收集，不是 UV 或游戏内布局出现概率。
- 服务端填写地图、模式、首次入口类型和接收时间；事件 ID 主键去重。
- 北京时间按自然日汇总，允许查询今天及前 89 天，定时清理此前明细。`stats_meta.started_at` 保留首次采集时间。
- 占比分母为相同查询条件下的总访问次数。地图次数是布局访问的汇总，不另累计选择地图的点击。
- 统计明细独立导出；单次最多 10000 条，超限返回明确错误，缩小日期范围后重新导出。

## 完整导出与恢复

`scripts/content-transfer.mjs` 使用同一套服务接口，可用于未来服务器适配。需要 Node 22.13+。导出目录必须尚不存在；目录内保存 `manifest.json` 与 `assets/maps/...`，每个资源包含 SHA-256 与字节大小。

Access 凭据通过环境变量 `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`，或已有登录 JWT 的 `CF_ACCESS_JWT` 提供。服务令牌仍需符合现有 Access 策略。不要把凭据放进命令参数、备份或 Git。

```powershell
node scripts/content-transfer.mjs export https://idv-map.321666.xyz ./backup-2026-09-22
node scripts/content-transfer.mjs import https://目标环境.example ./backup-2026-09-22
```

导入先校验全部本地文件、路径和校验和，再逐项上传图片。服务端拒绝资源覆盖冲突，验证所有引用和哈希后保存新配置；失败时不会发布半份配置，已上传的无引用资源可留待审计。目标环境必须部署本次代码并配置内容/图片存储。空存储可直接导入，不要求先放 V2 数据。

后台“备份与恢复”用于当前存储内的配置恢复；跨存储迁移必须使用完整导出目录。统计不会随内容导入/恢复被覆盖。

## 验收与回滚

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm check:shared
pnpm check:worker
pnpm build
pnpm exec wrangler deploy --dry-run --env dev --outdir .tmp/worker-build
node scripts/verification-server.mjs
# 另一个终端：
pnpm verify:e2e
pnpm verify:pwa
```

隔离验收服务使用实际 Worker 路由、内存 KV/R2、真实 SQLite SQL，并把所有图片引用指向同一张本地样例 WebP；它验证数据链路和交互，不替代生产素材逐张检查。只监听 127.0.0.1。`TEST_PORT=8788` 与 `TEST_EMPTY=1` 可启动第二个空服务，演练导出导入。

V3 内容每日归档在 `backups-v3/`，按版本去重；可选 Git 快照写入 `maps-v3.snapshot.json`。不自动清理历史备份和生产 R2 图片。V1 的生产 KV/R2 留作归档，本次不做远端物理删除。

出现发布故障时回滚到上一稳定 Worker 版本。若回滚至旧 V2 代码，其读取的是冻结 V2 基线，**不会自动包含 V3 上线后的编辑**；回滚前应保留 V3 导出，必要时人工投影厄运之女数据。数据库不随 Worker 回滚删除，旧代码不会写新统计。不要恢复 V1 运行链路。
