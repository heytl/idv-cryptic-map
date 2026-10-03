# 微信小程序开发指南

更新日期：2026-10-04（Asia/Shanghai）。当前工程版本为 `0.1.0`，开发分支为 `feat/wechat-miniprogram`。用户确认初版全部验收项大致通过；范围、验证证据与验收清单见 [初版记录](releases/MINIPROGRAM-0.1.0.md)。

## 功能范围

- 目录按地图、困难 / 噩梦模式及入口查询布局，支持方向 / 通道筛选、两列 / 三列卡片和手动刷新。
- 条件弹窗使用草稿，点击入口后应用；取消不修改目录。地图、模式、入口及卡片密度在本地记忆。
- 详情使用微信原生导航栏，支持全图 / 可用楼层、四方向旋转、重置、1–4 倍缩放和页面内全屏。
- 单指拖图、双指捏合及边缘横滑切层由 WXS 处理；楼层胶囊与图片切换共用动画。
- 点击地图打开微信原生图片预览，区域楼层在空闲时预生成 PNG，并跨页面、跨启动缓存。

详情工具栏保留全屏、旋转、重置、放大、缩小五项。入口参考、备注和图例面板不在本初版界面中。分享直达、访问统计、配置与主图的完整离线下载尚未接入；楼层 PNG 缓存不等同于离线包。

## 工程与协议

采用 uni-app + Vue 3 + TypeScript，微信界面位于 `apps/miniprogram`。继续使用现有 Worker、KV/R2 和后台，公开只读取 `/maps-v4.json` 及图片；不调用管理接口，也不回写内容。

| 位置 | 职责 |
|---|---|
| `src/pages/maps/index.vue` | 目录、条件草稿、筛选、密度与刷新 |
| `src/pages/strategy/index.vue` | 布局读取、楼层顺序、胶囊动画、页面尺寸与前后台状态 |
| `src/components/MapViewport.vue` | 图片尺寸校验、裁切 / 旋转、内联 WXS 手势、工具栏 |
| `src/components/FloorStill.vue` | 横滑时相邻楼层的静态裁切图 |
| `src/components/ImageProbe.vue` | 通过原生图片加载事件读取真实尺寸，隔离旧请求事件 |
| `src/components/FloorPreview.vue` | Canvas 2D 适配、空闲预生成、原生图片预览 |
| `src/services/content-client.ts` | V4 校验、会话配置复用、并发请求合并与刷新 |
| `src/services/catalog-preferences.ts` | 条件持久化及无效偏好回退 |
| `src/services/map-gestures.ts` | 点击识别、按胶囊顺序选择相邻楼层；切层手势由 WXS 判断 |
| `src/services/floor-preview*.ts` | 楼层 PNG 生成、缓存索引及微信文件系统适配 |
| `src/services/preview-idle.ts` | 空闲等待、交互 / 后台暂停及主动预览接管 |
| `scripts/generate-icons.mjs` | 从 Web SVG 图形生成本地透明 PNG 图标 |

上表未带前缀的路径均相对于 `apps/miniprogram`。共享包 `packages/shared` 提供入口规则、可用楼层、V4 公开类型、楼层来源解析和旋转几何；Web 与小程序各自实现界面及平台交互。

内部内容仍为 V3，公开数据使用 `PublicMapConfigV4` / `PublicLayoutV4`。`floorImages.full` 是全图；区域楼层使用 `floorRegions.sourceUrl`、原图尺寸与整数矩形；未迁移楼层使用独立图片。坐标以最终全图左上角为原点，保持原图像素，不转成 rpx 或屏幕坐标。缺少的楼层不显示按钮。协议详见 [楼层区域说明](FLOOR-REGIONS.md)。

## 本地开发

需要 Node.js 22.13+、仓库声明的 pnpm 11.19.0，以及微信开发者工具。所有命令从仓库根目录执行。

```powershell
pnpm install --frozen-lockfile
pnpm dev:miniprogram
# 或生成非 watch 的测试构建
pnpm build:miniprogram:preview
```

在微信开发者工具导入对应的输出目录：

| 命令 | 工程目录 |
|---|---|
| `pnpm dev:miniprogram` | `apps/miniprogram/dist/dev/mp-weixin` |
| `pnpm build:miniprogram:preview` | `apps/miniprogram/dist/build/mp-weixin` |
| `pnpm build:miniprogram` | `apps/miniprogram/dist/build/mp-weixin`（正式配置） |

测试 API 来自 `apps/miniprogram/.env.development`，当前为 `https://idv-map-dev.321666.xyz`。个人配置写入 `apps/miniprogram/.env.development.local`：

```dotenv
WECHAT_APP_ID=实际微信AppID
# 仅模拟器联调时按需启用；体验版需配置合法域名
WECHAT_SKIP_DOMAIN_CHECK=false
```

没有 AppID 时，测试编译输出游客工程；真机预览、上传和体验版需要有效 AppID。AppID 仅注入输出的 `project.config.json`，源码 `manifest.json` 保持空值。

按 API 和图片的实际地址配置微信后台的 request / downloadFile 合法域名。`WECHAT_SKIP_DOMAIN_CHECK=true` 仅在 development 模式关闭项目域名校验，正式构建始终开启。开发者工具的个人设置可能覆盖工程设置，需在“详情 → 本地设置”核对。

## 提交前验证与正式构建

小程序改动至少执行：

```powershell
pnpm --filter miniprogram test
pnpm --filter miniprogram typecheck
pnpm build:miniprogram:preview
```

共享规则、workspace 依赖或 CI 入口有变化时，执行全仓库检查：

```powershell
pnpm test
pnpm check:shared
pnpm check:worker
pnpm build
```

根 `pnpm build` 构建 Web / 后台，并追加小程序类型检查和测试环境编译。小程序产物不进入 Worker 静态资源目录。`pnpm-workspace.yaml` 的版本限定 `packageExtensions` 补齐 uni-app 编译器未声明的 `estree-walker` 依赖，需与锁文件一起提交。

重新生成图标使用仓库已有的 sharp 开发依赖：

```powershell
pnpm --filter miniprogram generate:icons
```

提交生成的 `src/static/icons/*.png` 和生成脚本。构建产物、`.env.*.local`、个人 `project.private.config.json`、`.tmp` 验证输出不提交。

正式构建前，将 `.env.example` 复制为 `apps/miniprogram/.env.production.local` 并填写：

```dotenv
VITE_MAP_API_BASE_URL=https://实际生产域名
WECHAT_APP_ID=实际微信AppID
```

```powershell
pnpm build:miniprogram
```

正式构建要求 HTTPS origin 和 `wx` 加 16 位十六进制的 AppID 格式，拒绝缺失配置及当前已知测试 API 地址。构建检查格式，不验证账号归属或域名在微信后台的配置。正式构建与测试构建共用输出目录，上传前应重新执行正式命令，并核对输出的 API、AppID 和域名校验设置。上传、审核与发布需另行操作。

## 地图交互约定

1. 默认显示全图，按 `min(视口宽/内容宽, 视口高/内容高)` 完整适配。普通详情的未旋转全图顶部对齐，分层、旋转及全屏居中。
2. 网络图片使用原生 `<image webp>` 的加载事件读取真实尺寸，避免 `getImageInfo` 下载为本地文件后失去网络 WebP 解码支持。同 URL 的尺寸使用最多 8 项的会话缓存；失败清除后可重试，旧请求事件不能覆盖新图。
3. 区域先按原图坐标裁切，再旋转；90 / 270 度交换容器宽高并补偿偏移。真实图片尺寸与区域元数据不一致时显示错误。
4. WXS 是平移、捏合和边缘切层的唯一处理者，逐帧位移直接更新视图样式。Vue 只下发按钮 / 重置 / 动画命令，并接收交互起止及最终倍率；不逐帧回写倍率。
5. 缩放围绕双指中点，范围为适配大小的 1–4 倍。双指抬起一指后可继续平移，该次多指手势不触发切层或图片预览。
6. 单指先拖动放大的地图，抵达水平边界后的剩余位移驱动楼层轨道。明显的水平手势超过视口宽 18%（48–96px）时松手切层；不足阈值回弹，首尾阻尼且不循环。慢拖也可切层。
7. 楼层顺序与顶部胶囊一致，胶囊点击和横滑共用 240ms 动画；动画期间阻止重复切换。切层 / 重置恢复适配和零旋转；旋转保留受边界约束的绝对比例。重置、旋转、尺寸变化和卸载会取消未完成切层。
8. 点击识别区分短按、长按、拖动、多指和取消。页面内全屏隐藏楼层栏并扩展地图区域，保留微信系统导航栏；支持工具栏与右上角关闭按钮退出。

WXS 保留在 `MapViewport.vue` 内联模块中，单元测试直接执行这份交付代码。开发过程中出现过旧外部 WXS 依赖缓存，重开工程后恢复；不要通过补写构建产物修复模块路径。

## 楼层预览与缓存

主地图实际显示后等待 600ms 空闲，优先准备当前楼层，其余按胶囊顺序处理。拖拽、捏合、切层动画或页面隐藏时暂停后续生成步骤；用户点击图片可立即接管同一个任务。普通全图和旧独立楼层图使用原 URL，区域楼层通过 Canvas 2D 导出 PNG，同一次请求只解码一次共享全图。

输出保持原始像素，超大区域限制为最长边 4096px、约 800 万像素。完成导出后释放画布像素缓冲区，页面只保留路径。持久文件保存在微信用户目录的 `idv-floor-previews-v1`，索引为 `index.json`；缓存键包含输出策略版本、原图 URL、原图尺寸和区域坐标。

- 缓存命中检查文件存在性，文件丢失重新生成；跨页面及启动复用。
- 每次成功读取并校验配置后，清理不再被引用的 PNG 和中断写入的孤立文件，保留未改动楼层。
- 更新中的旧生成任务不能重新保存失效楼层；文件操作串行，索引通过临时文件重命名更新。
- 不按数量、容量或时间主动淘汰有效预览。微信文件写入失败时回退到临时路径，主地图仍可查看；生成失败可以再次点击重试。
- 只管理自己的预览目录，不删除其他小程序数据；配置与主图仍在线读取。

## 常见联调问题

| 现象 | 检查与处理 |
|---|---|
| 请求或图片域名错误 | 检查微信合法域名、输出 API 地址及个人设置覆盖；体验版使用真实域名配置 |
| 页面显示事件名、`split is not a function`、旧 WXS 路径 | 确认导入本次输出目录，关闭工程及个人配置的 `compileHotReLoad`，清除编译缓存再编译；仍混用时重开项目窗口 |
| 微信内部服务提示 `access_token expired` | 重新登录开发者工具；地图 API 不使用微信 access_token |
| CI 中 uni-app 更新检查无法读取网卡 | 设置 `CI=1` 跳过编译器更新检查，保留依赖原文件 |
| 模拟器原生预览本地文件持续加载 | 先确认 PNG 已导出且尺寸正确，再用真机验证；历史模拟器记录见开发归档 |

本工程在 `manifest.json` 关闭微信编译热重载。已有输出工程的 `project.private.config.json` 可能覆盖该值，需同步检查 `setting.compileHotReLoad: false`。

## 后续工作

用户已反馈初版全部验收项大致通过，见 [初版验收记录](releases/MINIPROGRAM-0.1.0.md)。正式发布前的体验版回归继续覆盖 Android / iOS 连续捏合与拖动、边缘切层、横竖屏 / 安全区、原生裁切图片预览和前后台恢复，并记录具体环境。开发者工具结果与用户反馈保留在该记录及 [开发过程归档](releases/MINIPROGRAM-DEVELOPMENT.md)。

后续接入分享、统计和完整离线包时，继续复用公开 V4 数据。统计约定为一次详情访问，切楼层不重计、离线不补报；后端当前未区分 Web / 微信来源。离线包应按 `dataVersion` 配套保存配置与素材、去重全图 URL，避免新坐标配旧图片。
