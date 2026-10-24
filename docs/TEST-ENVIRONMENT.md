# AMD1 Docker 开发测试环境

部署日期：2026-10-24（Asia/Shanghai）。

## 入口与版本

- 测试站：<https://idv-map-dev.321666.xyz/>。
- 后台：<https://idv-map-dev.321666.xyz/admin/>，使用独立测试管理密钥。
- 服务器：AMD1，`129.146.251.240`，AMD64，约 1 GB 内存。
- 运行代码基线：`dev` 的 `badc484a8c100e3b50415f3b606c014f441b77d4`。本记录及相关说明的后续提交未改变运行代码。
- 本次为手动部署；后续 push `dev` 不会自动更新 AMD1。现有 CI 仍只自动更新 CF 隔离预览，地址为 <https://idv-cryptic-map-v2-preview.heytl.workers.dev/>。

原 `idv-map-dev.321666.xyz` 的 CF Worker 自定义域绑定已解除，改为直连 AMD1 的 A 记录（仅 DNS，TTL 300）。CF 预览 Worker 及其 KV / R2 / D1 保留。临时创建的 `idv-map-test.321666.xyz` 已清理。主站域名及 ARM 正式服务未修改。

## 数据与隔离

初始配置和图片只读导出自原 CF 开发环境，校验后通过既有完整导入接口写入测试数据库：1 张游戏地图、55 个公开布局、230 个资源，公开配置引用 223 个不同图片地址。配置导入后的测试内容版本为 1；版本号与 CF、正式站独立递增。

测试站后续编辑、统计、图片、备份和会话均独立，不自动同步到正式站或 CF 预览。微信统计 AppID 留空，Web 同源统计使用测试域名。管理密钥在服务器本地随机生成，未写入 Git。

## 服务器目录与运行方式

内部部署目录保留 `/opt/idv-map-test` 命名：

| 路径 / 容器 | 用途 |
|---|---|
| `/opt/idv-map-test/compose.yaml` | 测试站专用 Compose，不能直接换成绑定正式数据路径的根 Compose |
| `/opt/idv-map-test/.env` | 独立管理密钥，root 读取，权限 600 |
| `/opt/idv-map-test/data/app.sqlite` | 测试数据库，挂载到应用 `/data` |
| `/opt/idv-map-test/releases/<提交SHA>` | 已构建前后台、服务代码、迁移文件、运行镜像 Dockerfile 和产物 SHA-256 清单 |
| `/opt/idv-map-test/seed` | 已校验的初始开发内容导出，保留用于重建测试数据 |
| `/opt/idv-map-test/backups/initial-20261024.sqlite` | 首次验收后的 SQLite 完整备份，不是异地备份 |
| `/opt/idv-map-test/caddy` | HTTPS 配置、证书与自动续期状态 |
| `idv-cryptic-map-test` | 应用，`127.0.0.1:18081`，内存上限 256 MiB |
| `idv-map-test-proxy` | Caddy HTTPS 代理，80 / 443，内存上限 128 MiB |

AMD1 不承担依赖安装和前端编译。本次在本地从干净的 dev 基线构建前后台及可移植 JS 服务，运行集成测试后打包上传；AMD1 仅使用 Node.js 24 基础镜像复制运行文件，不包含构建工具和 node_modules。服务器 `build-info.json` 记录源码提交与文件哈希，`deployment.json` 记录运行镜像 ID 和验收信息。

```sh
# 在 AMD1 执行。目录权限受限，使用 sudo 指定 project-directory。
sudo docker compose --project-directory /opt/idv-map-test ps
sudo docker compose --project-directory /opt/idv-map-test logs --tail 50 app
curl -f http://127.0.0.1:18081/healthz
curl -f https://idv-map-dev.321666.xyz/healthz
```

修改测试密钥后，通过上述 Compose 重新创建 app 容器，旧会话会失效。更新代码时先保存当前镜像和数据库，使用新 dev 提交构建、测试并上传新的 release 目录，调整测试 Compose 中的镜像与构建目录后再构建启动。不要在 AMD1 执行正式站的默认数据目录命令。未来可以接入 dev 镜像发布流程，本次未配置服务器自动更新。

恢复测试数据库遵循 [Docker 恢复步骤](DOCKER.md)，但所有路径改用本测试目录；停止 app、保存当前数据、处理旧 WAL/SHM、恢复备份并确保 UID/GID 1000 可写。镜像回滚涉及数据库结构变化时，须配套恢复升级前数据库。

## 验收

- 本地前后台构建和 Node / SQLite 集成测试通过。
- 原始域名下逐项校验 230 个资源 SHA-256，以及全部 223 个公开图片引用；容器重启后配置和登录会话保留，退出后会话失效。
- 最终域名 `idv-map-dev.321666.xyz` 严格校验证书；首页、健康检查、登录跳转、未认证 401、登录 / 退出、管理配置、统计读取和抽样图片均通过。
- 应用容器健康；最后检查应用约 25 MiB、代理约 18 MiB，原有 sing-box 和 1Panel 服务正常。该占用为低负载快照。
- 首次启动发现 AMD1 Docker 网络链缺失；确认没有运行容器后重启 Docker 服务恢复网络，未重启服务器。
