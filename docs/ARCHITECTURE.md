# 架构总览（V3）

前端为 Vue 3 + TypeScript，前后台分别构建，部署在同一个 Cloudflare Worker。详见 [V3 升级与运维](V3-UPGRADE.md)。

| 层 | 职责 |
|---|---|
| apps/web | 地图选择、布局筛选、攻略详情、按地图离线包、访问事件 |
| apps/admin | 地图与布局编辑、发布、统计展示、备份恢复 |
| packages/shared | V2/V3 类型、发布规则、协议转换、统计类型 |
| packages/server/src | 内容发布、导出恢复、事件校验、维护任务及平台接口 |
| workers | HTTP 路由、Cloudflare KV/R2/D1/Access 适配、定时触发 |

内容真源为 KV `config:v3:current`，图片及版本备份在 R2，访问事件独立存 D1。V2 仅保留公开协议和正式链接兼容。V1 已退役，不再加载、构建或维护。

内部内容使用稳定资源键；公开序列化才生成媒体 URL。V3 草稿不会对外输出，地图下架会隐藏所属布局。配置使用 NetworkFirst 离线回退，图片使用 CacheFirst；离线包主动缓存所选地图及对应配置。

内容仓库版本校验不具备原子锁语义，当前后台采用单编辑者工作流。未来 Docker 接入复用业务与 HTTP 协议，另行实现服务器运行入口、存储和鉴权。
