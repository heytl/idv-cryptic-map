# Docker 服务器部署

基于 `origin/production` 的独立部署方案。Node.js 24 单进程提供玩家端、后台与现有 API，SQLite WAL 保存配置、图片、备份及访问统计，无需 Cloudflare 账户、Redis 或额外数据库。复用 Worker 路由与业务校验，Cloudflare 原部署方式继续可用。

## 启动

容器固定命名为 `idv-cryptic-map`，便于在面板中识别及配置停机备份任务。

登录表单使用固定账号标识 `admin` 和标准密码字段，方便浏览器与 Bitwarden 保存、填充管理密钥。账号无需输入，实际认证仍只验证密钥。默认登录有效期为 8 小时；勾选“在此设备保持登录 30 天”后，会话及 Cookie 有效期为 30 天。退出或更换密钥会使相应会话失效。网站不在 localStorage 保存管理密钥。密码管理器是否弹出保存提示由浏览器或扩展设置决定。

服务器安装 Docker Engine 和 Compose 插件，在仓库根目录执行：

```sh
cp deploy/.env.example .env
# 编辑 .env，设置随机 ADMIN_KEY（至少 32 字符，建议 openssl rand -hex 32）
sudo install -d -m 750 -o 1000 -g 1000 /opt/idv-map/data
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:8080/healthz
```

无需配置公开域名。玩家端 `/`，后台 `/admin/`，未登录时进入 `/admin/login` 站内登录页，只输入管理密钥。首次启动为空内容，可后台新增地图或导入已有内容。密钥从环境读取，不写入镜像，未配置或少于 32 字符会拒绝启动。

Compose 仅监听服务器回环地址，使用现有 Nginx/Caddy 终止 HTTPS 并转发到 `127.0.0.1:8080`。例如 Caddy 配置：

```caddy
maps.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

图片、缩略图、楼层区域和上传/导出响应均使用 `/r2/...` 同源相对路径，换域名无需修改容器配置。反向代理应保留原始 `Host`（Nginx/OpenResty 使用 `proxy_set_header Host $http_host;`，Caddy 默认保留），并将 `/`、`/api/`、`/r2/` 等路径一起转发。后台写入与访问统计按请求 Host 校验浏览器 Origin，兼容代理终止 HTTPS；不信任客户端提交的转发头。原 `PUBLIC_ORIGIN` 设置不再使用。API 由外部客户端或小程序读取时，应基于 API 站点地址解析相对图片 URL。后台采用密钥登录页与 8 小时会话，必须通过 HTTPS 对外提供。更换 ADMIN_KEY 后重建容器会撤销旧会话。旧 ADMIN_PASSWORD 可作为升级兼容密钥，长度需至少 32 字符。会话 Cookie 使用 HttpOnly、SameSite=Strict，公网域名另加 Secure；支持退出、登录失败限流和跨站提交检查。命令行工具使用 Bearer 密钥认证，不再支持 Basic。反向代理后的登录限流按连接地址共享，10 次失败后需等待最多 15 分钟。小程序统计可选配置真实 `TELEMETRY_WECHAT_APP_ID`，并在微信平台更新合法请求域名。

## 内容迁移

使用现有完整迁移工具，导出包含配置和图片，保留校验与版本冲突保护。原 Cloudflare 端使用 `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` 或 `CF_ACCESS_JWT` 环境凭据。

```sh
node scripts/content-transfer.mjs export https://old.example.com ./content-backup
# 切换到 Docker 管理凭据后导入（不要同时保留原站点凭据）
export ADMIN_KEY='与服务器配置一致的管理密钥'
node scripts/content-transfer.mjs import https://maps.example.com ./content-backup
```

迁移工具必须在有 Node.js 的本机运行；运行镜像只包含服务产物。导入前备份目标数据。完整内容迁移不包含历史访问统计；原 D1 统计单独保留归档，新站从新数据库开始统计。

## 备份、恢复与升级

所有持久数据均在服务器目录 `/opt/idv-map/data` 中，数据库为 `/opt/idv-map/data/app.sqlite`，该目录绑定到容器内 `/data`，运行中可能同时有 WAL/SHM 文件。每日进程内维护生成配置快照、清理过期统计；配置快照与图片在同一个 SQLite 数据库中，不能代替异地灾备。单实例部署，请勿增加副本共享此卷。请求按顺序执行，避免多个后台编辑者并发写入覆盖。

最简单可靠的灾备是停机后复制数据库：

```sh
docker compose stop app
docker compose cp app:/data/app.sqlite ./app.sqlite.backup
docker compose start app
```

将备份复制到服务器外并保管好权限，数据库含完整内容及统计。恢复时停机，先保存当前数据库，再删除卷内旧 `app.sqlite-wal` 与 `app.sqlite-shm`（在服务器数据目录中操作），将备份复制回 `/data/app.sqlite`，保证 UID/GID 1000 可写，启动并检查公开配置、图片及后台统计。不要在运行中直接复制单个 SQLite 主文件。

升级前执行以上备份，再运行 `docker compose up -d --build`。迁移按文件名自动执行且在事务中记录。回滚时检出旧代码重建；若数据库结构已变化，则同时恢复升级前数据库。`docker compose down` 和 `down -v` 均不会删除此绑定目录，但不要手动删除 `/opt/idv-map/data`。

## 验证与限制

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter admin build
node deploy/build.mjs
node --test deploy/server.test.mjs
pnpm test:worker
pnpm check:worker
docker compose build
```

集成测试启动真实 Node 服务及临时 SQLite，验证认证、配置保存/版本冲突、备份隔离、上传与重启持久化。容器以非 root 用户、只读根文件系统运行，并配置健康检查和优雅停止。

适用于当前社区工具的单服务器负载。图片以 BLOB 保存在 SQLite，提供整体备份和迁移便利；大量媒体或高并发服务应再拆分对象存储与数据库。统计限流使用连接 IP，反向代理后会按代理连接地址共享每分钟 60 次额度；不要直接相信任意客户端的 IP 请求头。维护周期依赖进程持续运行，频繁重启时可由外部定时备份弥补。

## 从旧命名卷迁移

已有部署切勿直接更换挂载后启动空目录。先停机，将原卷 `/data` 下全部文件（含可能存在的 WAL/SHM）备份并复制到 `/opt/idv-map/data`，设置 UID/GID 1000 可写，再重新创建容器。校验数据库完整性和配置、图片、统计后再清理临时文件。原卷和迁移备份保留用于回退。

服务器部署配置和源码放 `/opt/idv-map`，备份放 `/opt/backups/idv-map`；上传包、构建中转文件使用 `mktemp -d /tmp/idv-map-deploy.XXXXXX` 创建的临时目录，结束后仅清理该次创建的目录。
