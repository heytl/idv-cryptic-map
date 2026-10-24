# Vercel 静态版本改造验收

验收日期：2026-10-24，Asia/Shanghai。

## 交付行为

| 路径 | 内容 |
|---|---|
| `/` | 当前 V3 正式交互与完整地图的静态发布版 |
| `/v1/` | 改造前经典旧版，原 UI、地图配置和图片完整保留 |
| `/v3/` | 本次 V3 的独立静态快照 |
| `/versions/` | 历史版本目录；新版页脚提供入口 |

Vercel 仍直接发布 `main` 的 `site/`。新版运行时地图、图片、字体都从当前静态站读取，不依赖 Docker / Cloudflare 地图接口；后台修改地图后需要重新发布静态站。历史版本不会跟着首页或后台更新。

正式 UI 提交：`badc484a8c100e3b50415f3b606c014f441b77d4`（`production`）。经典版提交：`ba791f63acf3c4d81c3bd57c5641b857ce4ebed4`。公开地图来源：`https://idv-map.321666.xyz/maps-v4.json`，V4 协议、数据版本 2、更新时间 `2026-10-22T17:22:43.445Z`。

## 数据完整性

- 经典版：207 个原文件、28 个布局，按原提交逐文件保存，并生成原文件 SHA-256 清单。
- 上线前从正在运行的 `jysj.321666.xyz` 重新读取 HTML、JS、CSS、地图 JSON 和全部 WebP：117 个文件均与 `/v1/` 逐字节一致。
- 首页与 V3 快照：各包含 55 个布局、138 个入口、192 个可用楼层视图，223 个独立地图图片文件。
- 将静态图片地址还原为原地址后，整个地图配置与原公开 JSON 深度相等。地图名称、排序、备注、历史名称、模式、入口、字典、楼层图片、裁剪区域与原图尺寸均保留。
- 223 张图片未重新压缩，逐张验证 SHA-256、字节数及 WebP 文件标识；浏览器逐张解码成功。
- 每版保存 `source-maps-v4.json`、`media-index.json`、`integrity.json`、`release.json`。这些是公开内容审计文件，不包含后台数据或管理凭据。

## UI 与浏览器验收

使用真实 Chrome，在桌面 1365×900 和手机 390×844 下验收首页与 `/v3/`。每种尺寸和路径均遍历所有 138 个入口和 192 个楼层视图，验证图片实际加载，并检查筛选弹窗、楼层按钮、详情深链重载、关于与版本记录页面。

结果：页面运行错误 0，本站 HTTP 错误 0，跨站运行时请求 0，写入请求 0，手机详情无横向溢出。第三方 Vercel 分析脚本在本地验收中单独模拟空响应；其可用性不作为地图验收依据。

经典版在电脑和手机下均显示 28 张目录卡片，详情加载、切换一楼/二楼和深链刷新正常。经典版的 Google Fonts 引用按原文件保留，本地离线验收不依赖 Google Fonts。

同一个浏览器会话依次打开首页、V3、V1 与版本目录：版本入口正确，根 PWA 不替换历史页面。首页和 V3 均完成全部地图离线下载，断网后重载详情和切换二楼成功；worker 作用域分别为 `/`、`/v3/`，缓存与离线标记按版本隔离。

原始浏览器记录：[browser-report.json](static-verification/browser-report.json)。截图保留在同目录：

- [新版手机目录](static-verification/latest-mobile-catalog.png)
- [新版手机详情](static-verification/latest-mobile-detail.png)
- [新版电脑详情](static-verification/latest-desktop-detail.png)
- [经典版电脑目录](static-verification/v1-desktop-catalog.png)
- [经典版手机详情](static-verification/v1-mobile-detail.png)

## 自动检查与失败保护

- 正式 Web 单元测试：52/52 通过。
- 共享配置与地图逻辑测试：34/34 通过。
- 静态工具测试：2/2 通过，覆盖中文文件名、二进制原样解包和路径边界。
- `node scripts/static/verify.mjs`：首页、V1 和 V3 的文件、地图引用、完整配置、图片及 PWA 作用域校验通过。
- 两份新增 GitHub Actions 配置通过 actionlint。
- 重复创建 `v3`：被拒绝，整个 `site/` 保持不变。
- 模拟导出缺图：发布失败，整个 `site/` 保持不变。
- 所有下载和构建先发生在临时目录；验证成功才替换 `site/`。旧站副本保留在临时目录，可恢复。
- Git 对静态部署文件禁用自动换行转换，避免不同系统检出后破坏校验值；Git 归档显式关闭 CRLF 转换。

## 后续操作

日常更新首页运行 `node scripts/static/release.mjs --source-ref origin/production`。新大版本追加 `--archive v4`，将同时生成首页和新的 `/v4/`，已有历史版本不覆盖。版本号支持 `v4`、`v4.1`、`v4.1.0`，沿用正式产品版本编号，不补造未经保留的 V2 历史版本。

GitHub Actions 的 **Prepare static handbook** 只生成经过验证的完整发布包和截图，审核后提交 `main`；不申请长期写入权限，不自动推送。一次性提交 `main` 仍通过正常 Git 发布。

## 范围

本次保留的是公开玩家页面与公开地图快照。地图后台、未发布内容和生产数据库不迁入静态站，也没有更改。加载速度取决于网络与 Vercel 可达性，本次验证证明地图无后台请求依赖，不将本地响应时间当成公网速度结论。
