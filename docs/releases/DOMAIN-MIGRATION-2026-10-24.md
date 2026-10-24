# 主域名迁移记录

日期：2026-10-24（Asia/Shanghai）。

## 域名与部署

- `idv-map.321666.xyz`：Oracle Docker，A 记录 `129.146.217.45`，仅 DNS，TTL 300 秒。
- `idvmap.321666.xyz`：原 `idv-cryptic-map` Worker，继续使用现有 KV、R2、D1；`/admin`、`/api` 纳入原 Access 应用。
- `new-map.321666.xyz`：保留原 Worker 入口。
- `idv-map.apps.321666.xyz`：用户计划退役；当前 Oracle 网站证书仅覆盖主域名，此旧入口不作为可用入口。

## 切换前验证

直接连接 Oracle 并使用主域名校验证书：Let's Encrypt，SAN `idv-map.321666.xyz`，到期日 2027-01-22。首页、公开配置、抽查图片正常；后台跳转站内登录，未认证管理接口返回 401。

切换前两端公开配置在排除版本号、更新时间及图片 origin 后完全一致，均为 1 张地图、55 个公开布局。CF 内容版本 41，Docker 版本 2；两端版本号独立递增，不作为内容一致性依据。

## 配置与验证

正式分支配置提交 `9e2a0d3` 将 Worker 主域名替换为 `idvmap.321666.xyz`，使用 `[skip ci]`，未重部署业务代码。通过官方接口解除主域名 Worker 绑定并创建 Oracle 直连 A 记录。公共 DNS 已返回 Oracle IP；递归 DNS 和客户端旧缓存仍需传播，切换过程中旧 CF 路径可能短暂重定向。

## 后续维护与回退

Docker 为日常编辑入口；两端没有自动内容同步。历史 CF D1 统计与 Docker SQLite 统计独立保存；CF 备用入口不在现有主站统计来源白名单内。

旧小程序若仍指向 `idv-map.apps.321666.xyz`，需更新 API 地址并按微信平台要求重新构建发布，不能依靠网站 DNS 切换自动更新。

回退前先核对新增内容，再通过官方接口恢复主域名 Worker 自定义域及其 DNS；保持正式分支域名声明与实际部署一致。原 CF 配置和图片未删除。
