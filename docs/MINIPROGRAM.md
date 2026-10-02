# 微信小程序开发方案与进度

更新日期：2026-10-02。开发基线：`v3-dev` 的 `a88f26b396686af006a0a11c8f1e609939c1dd76`；开发分支：`feat/wechat-miniprogram`。

楼层坐标迁移已完成，用户确认已同步测试环境。本轮实现第一批工程与查看器，并补充可用于联调的基础列表、详情页。代码完成不等于真机验收或微信发布完成。

## 架构和协议

采用 uni-app + Vue 3 + TypeScript，新增 `apps/miniprogram`，继续使用现有 Worker、KV/R2 和后台。Web 与小程序分别实现界面，共享业务规则及原图坐标计算。

| 层 | 当前职责 |
|---|---|
| `apps/miniprogram/src/pages` | 地图/模式/入口筛选、详情、入口参考 |
| `apps/miniprogram/src/components/MapViewport.vue` | 微信原生移动容器、图片显示、视口测量、旋转及裁切 |
| `apps/miniprogram/src/services` | `uni.request` 数据适配、会话图片缓存；不承诺持久离线 |
| `packages/shared/src/catalog.ts` | 从 Web 抽出的入口规则、方向/通道筛选、可用楼层 |
| `packages/shared/src/map-client.ts` | V4 公共数据校验、全图/区域/旧楼层图的统一来源解析 |
| `packages/shared/src/viewport.ts` | 原图适配比例、四方向旋转、旋转偏移、单轴边界计算 |
| `apps/web` | 继续提供成熟 Web；改用上述共享规则与几何函数 |

- 公开读取 `/maps-v4.json`，使用 `PublicMapConfigV4` / `PublicLayoutV4`；不访问后台受保护接口。
- 内部配置仍是 V3，不重新迁移内容，不向测试或正式环境写入地图数据。
- `floorRegions` 的 `sourceUrl`、`imageWidth/imageHeight`、各楼层整数矩形以最终全图左上角为原点。坐标不转换成 rpx、不回写屏幕尺寸。
- 全图本身使用 `floorImages.full`。区域楼层从全图显示，未迁移楼层继续使用独立图片；缺少的楼层不显示按钮。
- 困难当前开放侧门，噩梦开放正门与二楼门；复用已有规则，不因小程序接入额外开放入口。正门按通道筛选，其余按方向。
- 入口图、缩略图继续独立保存。没有新增地图点位或标记模型。

## 查看器实现

1. 默认进入全图，取地图面板的实际宽高，以 `min(视口宽/内容宽, 视口高/内容高)` 完整显示内容。
2. `movable-area` 直接包含 `movable-view`。外层负责原生双指缩放和平移；内层先裁切楼层，再旋转整个裁切区域。
3. 图片按实际加载尺寸与同一比例显示，裁切偏移为 `-x*比例` / `-y*比例`。旋转 90/270 度交换容器宽高，并按共享算法补偿旋转偏移。
4. 初始适配比例先烘入图片/区域尺寸，原生缩放倍率为相对比例 0.95–4，避免原图较大时触及原生组件的绝对缩放下限。
5. 切楼层/重置恢复零旋转、适配并居中。旋转保留受新边界约束后的绝对比例并居中，与 Web 规则一致。
6. 微信编译结果中的普通 `key` 不足以保证重建原生节点，因此重置通过条件渲染与下一次更新显式重建移动容器。重建不重新识别坐标。
7. 同 URL 的全图通过有上限的会话缓存复用 `getImageInfo` 结果和本地临时路径；切层不再次请求图片信息。图片失败可清缓存重试；异步请求带序号，防止旧图覆盖新图。
8. 加载尺寸与坐标元数据不一致时显示错误，不渲染错位楼层。“全屏”隐藏页面控制栏扩展地图区域，微信系统导航栏仍保留。

原生拖动边界、捏合锚点、小尺寸轴居中、连续缩放/旋转的体感仍需微信开发者工具及真机验收。实现中没有把浏览器模拟结果视为微信验证。

## 开发与预览

使用仓库声明的 pnpm 版本，Node.js 22 或兼容版本。

```sh
pnpm install --frozen-lockfile
pnpm dev:miniprogram
# 或生成测试环境的非 watch 构建
pnpm build:miniprogram:preview
```

导入微信开发者工具的目录：

- watch 开发：`apps/miniprogram/dist/dev/mp-weixin`
- 测试构建：`apps/miniprogram/dist/build/mp-weixin`

测试环境地址来自 `apps/miniprogram/.env.development`，当前为 `https://idv-map-dev.321666.xyz`。此地址只用于测试数据读取。没有填写真实 AppID 时，编译器生成游客工程，可检查产物；真机预览、上传及体验版需要有效微信 AppID。

在 `apps/miniprogram/.env.development.local` 配置自己的 `WECHAT_APP_ID`。微信后台按实际使用配置请求及下载合法域名，当前测试 API 和图片都在同一测试域名。代码不关闭域名校验；开发者工具里关闭校验的结果不能作为体验版可用依据。

构建产物不提交 Git。`project.private.config.json` 等个人配置不提交。生产环境配置复制 `.env.example` 到 `.env.production.local` 后填写：

```dotenv
VITE_MAP_API_BASE_URL=https://实际生产域名
WECHAT_APP_ID=实际微信AppID
```

```sh
pnpm build:miniprogram
```

正式构建要求 HTTPS origin 与真实格式 AppID，拒绝缺失配置或使用已知测试地址。AppID 只注入输出的 `project.config.json`，不修改源码 manifest。构建并不等于上传、提交审核或发布。

根 `pnpm build` 仍构建 Web/后台，并追加小程序类型检查与测试环境编译，供现有 CI 检查；小程序产物不在 Worker 静态资源目录中。正式小程序构建独立执行 `pnpm build:miniprogram`。

## 阶段状态

| 阶段 | 状态 | 后续验收 |
|---|---|---|
| ① 工程与 V4 数据接入 | 已实现 | 使用真实 AppID 在开发者工具启动 |
| ② 坐标查看器 | 已实现，待平台验收 | Android/iOS 双指、四方向旋转、边界、横竖屏、安全区 |
| ③ 页面复刻 | 基础筛选、详情、入口参考和图例已实现 | 独立地图选择流程、视觉逐项对照、显示密度与偏好记忆 |
| ④ 平台能力 | 未开始 | 分享直达、访问统计、持久离线下载 |
| ⑤ 微信发布 | 未开始 | AppID/域名准备、体验版、生产 V4 数据就绪、审核发布 |

后续业务约定：统计复用现有 `/telemetry/events` 与一次详情访问口径，切楼层不重计，离线访问不补报；离线包按 `dataVersion` 配套保存配置及素材，全图 URL 去重，禁止新坐标配旧图片。后端暂未增加客户端来源字段，不假定现有统计能区分 Web/微信。

## 验证记录（2026-10-02）

- 全仓库单元测试 100 项通过：shared 33、Worker 25、Web 20、admin 20、小程序 2。
- 覆盖新旧楼层来源、源图不匹配、区域越界、双来源、失效引用、四方向旋转后所有角点边界、完整适配、网络失败重试与无效刷新保护。
- 共享包、Worker 类型检查，以及 Web/后台/微信小程序完整构建均通过。
- 小程序类型检查与微信目标编译已通过；AppID 注入使用占位格式做构建验证，没有使用真实微信账号上传。
- 构建环境不能读取网卡信息时，uni-app 自带更新检查会报错；在自动验证中使用官方编译器识别的 `CI=1` 跳过更新检查，未修改依赖源码。
- 已只读获取测试配置：公开 V4、`dataVersion=35`、55 个布局、137 个区域，192 个楼层显示来源全部解析通过。后续测试配置变化不自动更新此历史记录。
- 微信开发者工具启动、Android/iOS 真机、视觉对照、域名上线、离线和分享均未验收；不得据此声明已完整复刻 Web。

下一批先完成①②的平台验收，再进行③的视觉和交互对齐；未通过前不接入正式环境。

## 参考

- [uni-app CLI](https://uniapp.dcloud.net.cn/quickstart-cli.html)
- [movable-view](https://uniapp.dcloud.net.cn/component/movable-view.html)
- [楼层区域协议](FLOOR-REGIONS.md)
