# 加页手记 · 静态手册与历史版本

`main` 专门保存 Vercel 静态发布文件和发布工具。功能开发继续使用 `dev` → `production`，本分支不维护另一套前端源码。

| 地址 | 内容 |
|---|---|
| https://jysj.321666.xyz/ | 最新正式 UI 和地图的静态发布版 |
| https://jysj.321666.xyz/v1/ | 最初的纯 HTML 手册，原始页面、配置和图片完整保留 |
| https://jysj.321666.xyz/v3/ | V3 的完整静态快照，发布后不覆盖 |
| https://jysj.321666.xyz/versions/ | 历史版本目录 |

所有新版地图均从同站点读取本地文件，运行时不依赖正式地图 API。后台修改地图不会自动改变本静态站，需执行静态发布。页面 UI 来自锁定提交的 `production`，发布时仅适配静态资源地址、版本入口和离线缓存，不改动原有地图组件、样式或手势实现。

## 更新最新静态站

需要 Git、Node.js 24、pnpm 11。完整克隆仓库并安装 pnpm 后：

```powershell
git fetch origin main production
node scripts/static/release.mjs --source-ref origin/production
node scripts/static/verify.mjs
node --test scripts/static/lib.test.mjs
```

工具会锁定源码提交、下载公开配置和全部图片、构建页面、验证配置与图片，再替换 `site/`。任何下载、配置验证或构建失败都会终止，不以缺图版本替换原站。前一份 `site/` 留在 `.tmp/static-*/previous-site/`。

如果已有安装好依赖且与目标提交一致的正式源码目录，可追加 `--source-dir <目录>` 复用依赖。程序会逐文件比对构建输入，忽略 Windows CRLF 差异和仅开发环境配置的注释差异。

检查文件差异和浏览器验收通过后，提交 `site/` 到 `main`。现有 Vercel Git 集成继续从 `main` 发布；Vercel 使用 `site/`，无需构建命令或地图 API 环境变量。

## 保存新的大版本

例如正式 V4 上线后：

```powershell
node scripts/static/release.mjs --source-ref origin/production --archive v4
```

这会更新首页、创建 `/v4/` 并更新版本目录；已有 `/v1/`、`/v3/` 保持逐字节不变。已存在的版本号拒绝覆盖。小版本内容更新只更新首页；需要额外快照时可以使用 `v4.1`、`v4.1.0`。

也可以在 GitHub Actions 手动运行 **Prepare static handbook**：选择 `main`，指定正式源码分支、标签或提交，新大版本填写 `archive`，日常更新留空。工作流完成下载、构建和浏览器验收后提供 `verified-static-site` 发布包和截图报告，不会自动推送或部署。审核后用发布包替换 `site/` 并提交 `main`。

## 本地浏览器验收

```powershell
node scripts/static/serve.mjs
# 另开终端；构建记录中的 source 是已安装依赖的源码目录
$env:STATIC_SOURCE_DIR = (Get-Content .tmp/static-build.json | ConvertFrom-Json).source
node scripts/static/browser-verify.mjs
```

默认使用本机 Chrome；CI 可设置 `STATIC_BROWSER_CHANNEL=chromium`。验收包括地图图片解码、全部布局/入口/楼层、桌面与手机布局、筛选、深链刷新、经典版、版本跳转、离线下载/重载/切层，以及不同版本的缓存隔离。截图和机器报告存于 `.tmp/static-verification/`。

`source-maps-v4.json` 保存导出时的原始公开配置，`media-index.json` 记录图片来源与 SHA-256，`integrity.json` 记录版本内每个文件的校验值，`release.json` 记录 UI 提交、地图数据版本与保存时间。原始配置用于审计，实际页面只读取本地 `maps-v4.json`。

## 目录

```text
site/                   Vercel 直接发布的完整站点
  assets/               当前 UI、字体与图标
  media/                当前地图图片，按完整 SHA-256 命名
  v1/                   原版 site/ 的完整归档
  v3/                   V3 独立页面、配置、图片及 PWA
  versions/             版本目录
scripts/static/         发布、完整性验证、浏览器验收和本地预览
docs/                   本次改造验收记录
maps/                   历史原素材，不参与发布
```

历史版本保存的是当时的攻略，可能不适用于当前游戏。各版本 PWA 使用独立作用域和离线缓存；根目录的 worker 不处理历史版本路径。经典版仍保留原有 Google Fonts 引用，避免改动其原始页面。

素材来自社区作者[凉哈皮](https://space.bilibili.com/8618005)。游戏及地图版权归《第五人格》官方所有。本项目免费开放使用。
