# 分支与发布约定

更新日期：2026-10-24（Asia/Shanghai）。

| 分支 | 职责 | 推送行为 |
|---|---|---|
| `production` | 唯一正式源码，共用 Docker / Cloudflare 业务与前端 | 仅验证，不发布正式站 |
| `dev` | 共用开发与验收基线，原 `v3-dev` | 验证通过后部署隔离 CF `v2-preview` |
| 功能分支 | 从 `dev` 创建，通过 PR 合回 `dev` | PR 运行双平台验证 |
| `main` | 独立静态版本和 GitHub 默认分支 | 保留静态发布职责 |

## 开发与正式发布

功能分支 → `dev` → `production`。修复和功能只开发一次；正式分支只接收已验收提交。环境差异通过运行入口、存储适配和环境变量表达，不再按部署平台维护业务分支。AMD1 已手动部署 dev 测试站，入口和更新方式见 [测试环境](TEST-ENVIRONMENT.md)。

PR、`dev`、`production` 共用业务测试、类型检查、前后台及小程序构建、PWA 升级、CF 打包和 AMD64 / ARM64 Docker 验证。`dev` 的 CF 预览发布等待全部验证通过，沿用独立 KV / R2 / D1 和 `V3_PREVIEW_D1_ID`；普通 PR 不部署 Worker。

`idv-map-dev.321666.xyz` 现指向 AMD1 Docker 测试站，不随 push 自动更新；CF 自动预览继续使用 `idv-cryptic-map-v2-preview.heytl.workers.dev`，两份测试数据也相互独立。

GitHub Actions → **Release** → **Run workflow**：必须选择 `production`，再选择 `docker`、`cloudflare` 或 `both`。工作流拒绝其他分支，锁定本次提交并重新验证；之后 Docker 镜像发布和 CF 发布可独立执行，各自报告状态，部分失败时整个发布失败。`production` push 不执行正式 D1 迁移或 Worker 部署。

- Docker：发布 `ghcr.io/heytl/idv-cryptic-map:<完整提交SHA>`，支持 AMD64 / ARM64，并输出摘要。服务器手动拉取指定摘要，工作流不持有服务器连接凭据。升级和恢复见 [Docker 指南](DOCKER.md)。
- CF：先迁移正式 D1，再部署备用 Worker；保留 `idvmap.321666.xyz` 和 `new-map.321666.xyz`，禁止重新绑定 Docker 主域名。发布代码不执行内容导入。
- GitHub 默认分支仍为 `main`。该分支只注册一份手动 Release 工作流供 GitHub 显示入口，不合入动态版源码；实际运行须选择 `production`，可复用的验证工作流均从所选版本读取。

两端内容、图片、统计独立保存，不自动同步。Docker 是当前日常编辑入口。CF 每日维护 Cron 仍为北京时间 12:00，Git 快照可回写 `production` 并带 `[skip ci]`；这些 CF 快照不能替代 Docker SQLite 异地备份。

## 2026-10-24 统一记录

- 原本地 `codex/docker-server` 曾更名为 `production-docker`；Docker 支持及登录修复现合入统一 `production`，无需保留平台专用开发分支。
- `v3-dev` 更名为 `dev`，保留独有开发提交并合入统一正式源码；旧 `origin/dev` 历史也保留，不强推覆盖。
- 主域名迁移配置和记录继续保留，见 [主域名迁移](releases/DOMAIN-MIGRATION-2026-10-24.md)。本次不发布正式站或修改线上数据。
- 分支同步和远程检查通过后移除旧 `v3-dev` 与本地 `production-docker`。其他克隆应先保存本地修改，执行 `git fetch --prune origin`，再切换到对应的 `dev` / `production` 跟踪分支。

## 2026-10-23 改名记录

- 原正式分支 `feat/admin-backend` 已迁移为 `production`，原提交历史全部保留，旧本地和远程分支已删除。
- 迁移配置提交：`8b9fe73`。首次新分支发布通过 [GitHub Actions](https://github.com/heytl/idv-cryptic-map/actions/runs/39919670985)，测试、构建、缓存升级、生产 D1 迁移及部署均成功。
- 已核对线上快照目标、保留的 GitHub secret 和恢复后的 Cron；正式站及 Docker 站的页面、55 条公开布局和抽查图片正常。
- 旧分支没有未合并 PR 或分支保护规则。此次使用 SSH 新建新分支再安全删除旧分支，没有 GitHub 原生 Rename 的链接重定向；旧源码 URL、raw URL 和本地跟踪配置需自行更新。
- `main` 未改名，也未更改 GitHub 默认分支。历史发布记录里的旧分支名代表当时事实，不作为当前操作指令。
