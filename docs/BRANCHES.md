# 分支与发布约定

更新日期：2026-10-23（Asia/Shanghai）。

| 分支 | 当前职责 | 自动发布行为 |
|---|---|---|
| `production` | Cloudflare 正式站、后台、公开 API 与统计 | push 后测试、构建、缓存升级验收、生产 D1 迁移、Worker 部署 |
| `v3-dev` | 隔离开发与预览 | push 后测试、构建、预览 D1 迁移及 `v2-preview` 部署；不部署正式站 |
| `codex/docker-server` | Docker 自托管版本，目前仅在本地保存 | 本地提交不触发 Actions；推送后运行 Docker 镜像验证，不自动更新 ARM 服务器 |
| `main` | 独立静态版本，也是 GitHub 默认分支 | 保留独立静态发布渠道，不作为 Worker 正式来源 |

`.github/workflows/deploy.yml` 的生产步骤同时限定 push 事件和 `refs/heads/production`。PR 只运行验证和隔离预览上传，不执行生产迁移或部署。`[skip ci]` 提交可跳过 push/PR 工作流；每日 Git 快照使用此标记，不重复触发发布。

Worker 的 `GITHUB_BRANCH=production` 只控制 Git 快照回写目标，不控制部署来源。配置文件修改后须部署，线上变量才会更新。生产每日快照 Cron 为 `0 4 * * *`（UTC，北京时间 12:00）；预览不启用该任务。

## 2026-10-23 改名记录

- 原正式分支 `feat/admin-backend` 已迁移为 `production`，原提交历史全部保留，旧本地和远程分支已删除。
- 迁移配置提交：`8b9fe73`。首次新分支发布通过 [GitHub Actions](https://github.com/heytl/idv-cryptic-map/actions/runs/39919670985)，测试、构建、缓存升级、生产 D1 迁移及部署均成功。
- 已核对线上快照目标、保留的 GitHub secret 和恢复后的 Cron；正式站及 Docker 站的页面、55 条公开布局和抽查图片正常。
- 旧分支没有未合并 PR 或分支保护规则。此次使用 SSH 新建新分支再安全删除旧分支，没有 GitHub 原生 Rename 的链接重定向；旧源码 URL、raw URL 和本地跟踪配置需自行更新。
- `main` 未改名，也未更改 GitHub 默认分支。历史发布记录里的旧分支名代表当时事实，不作为当前操作指令。

其他已有克隆可执行 `git fetch --prune origin` 后，从 `origin/production` 创建或更新本地 `production` 分支。确认没有本地独有改动后，再删除旧分支；不要用强制重置覆盖未保存工作。

当前 Docker 本地分支已基于 `production`，但尚未推送远程；ARM 容器通过独立部署目录构建，不会因 GitHub 分支更新自动部署。
