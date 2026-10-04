# 架构总览（V3）

前端为 Vue 3 + TypeScript，Web 与后台分别构建，部署在同一个 Cloudflare Worker；微信小程序由 uni-app 独立编译，读取同一公开 V4 API。详见 [V3 升级与运维](V3-UPGRADE.md) 和 [小程序指南](MINIPROGRAM.md)。

| 层 | 职责 |
|---|---|
| apps/web | 地图选择、布局筛选、攻略详情、按地图离线包、访问事件 |
| apps/miniprogram | 目录与地图查看器、WXS 手势、持久楼层 PNG 预览缓存；初版验收见 [版本记录](releases/MINIPROGRAM-0.1.0.md) |
| apps/admin | 地图与布局编辑、发布、统计展示、备份恢复 |
| packages/shared | V2/V3 内部与历史类型、V4 公开类型、发布规则、协议转换、统计类型 |
| packages/server/src | 内容发布、导出恢复、事件校验、维护任务及平台接口 |
| workers | HTTP 路由、Cloudflare KV/R2/D1/Access 适配、定时触发 |

内容真源为 KV `config:v3:current`，图片及版本备份在 R2，访问事件独立存 D1。旧分享链接继续兼容；V2/V3 公开接口返回 410，当前公开协议为 `/maps-v4.json`。V1 已退役，不再加载、构建或维护。

内部内容使用稳定资源键；公开序列化才生成媒体 URL。V3 草稿不会对外输出，地图下架会隐藏所属布局。Web PWA 配置使用 NetworkFirst 离线回退，图片使用 CacheFirst；离线包主动缓存所选地图及对应配置。小程序配置与主图仍在线读取，区域楼层 PNG 在微信用户文件目录缓存，不提供完整离线包，也尚未接入分享或统计。

内容仓库版本校验不具备原子锁语义，当前后台采用单编辑者工作流。未来 Docker 接入复用业务与 HTTP 协议，另行实现服务器运行入口、存储和鉴权。

楼层以 `floorImages.full` 引用全图，`floorRegions` 保存绑定该全图资源键的原图像素矩形。尚未迁移的楼层仍使用独立图片，每层只能选择一种来源。内部配置与后台接口保持 V3；公开 V4 将 `sourceKey` 转为 `sourceUrl`。入口图片与缩略图仍独立保存。

区域编辑器共用于楼层、全图裁切与入口裁剪；前台视口按区域尺寸处理缩放、旋转和边界，切换区域不更换图片 URL。操作及发布说明见 [楼层区域改造](FLOOR-REGIONS.md)。
