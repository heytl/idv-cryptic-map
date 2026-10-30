# 交接注意事项

- 楼层区域预览使用全图和原图像素矩形；SVG 的 viewBox 留白处可能露出区域外内容，须同时按矩形裁切，多个预览的裁切 ID 需保持唯一。
- 后台 Vite 默认代理到本地 Worker；连接远程开发环境需在忽略的本地配置中设置代理目标，并同时代理认证、API 和图片。受限网络环境可能导致代理返回 500。

- Web 与小程序的关于页共用 `packages/shared/src/project-info.ts`。更新入口信息时需同时检查两端页面。
- 小程序码保留用户提供的原图，不裁剪或重绘；`apps/web/public/static/miniprogram-code.png` 与 `apps/miniprogram/src/static/miniprogram-code.png` 应保持一致，共用 `/static/miniprogram-code.png` 路径。
- Web 的问题反馈使用 GitHub Issues 外链；小程序沿用现有外链处理方式，复制链接并提示在浏览器打开，不将外部网址传给内部页面导航 API。
- Web 使用 hash 路由，本地检查关于页应访问 `/#/about`，而非 `/about`。
- 小程序测试预览与正式构建共用 `apps/miniprogram/dist/build/mp-weixin`，后一次构建会覆盖前一次产物；上传前应重新执行正式构建。生产环境配置仅保留在忽略的本地文件中。
