# 地图 V2.1 多模式、多入口重构实施方案

> 状态：已上线。正式 Worker 分支 `feat/admin-backend`。本方案以不修改 V1 正式配置和公开协议为首要约束。

## 1. 目标与边界

- 困难模式支持侧门、正门、二楼门三个入口。
- 噩梦模式支持正门、二楼门两个入口，不支持侧门。
- 同一模式地图的多个入口共享 Layout；困难和噩梦 Layout 相互独立。
- 噩梦模式比困难模式多一张地下室（负一楼）地图。
- Worker 正式前台、`main` 静态网页和未来微信小程序消费同一份只读 V2 公开协议。
- 微信小程序只展示地图，不接入后台管理接口。
- V1 正式配置、旧网页、旧分享链接和旧后台在上线观察期保持可用。

## 2. 稳定代码命名

```ts
type GameMode = 'hard' | 'nightmare'
type EntranceType = 'side' | 'front' | 'upstairs'
type Direction = 'left' | 'right' | 'south' | 'north'
type Passage = 'upperLeft' | 'upperRight' | 'both' | 'triple'
type FloorType = 'full' | 'basement' | 'floor1' | 'floor2'
```

| 代码 | 中文 |
|---|---|
| `hard` | 困难模式 |
| `nightmare` | 噩梦模式 |
| `side` | 侧门 |
| `front` | 正门 |
| `upstairs` | 二楼门 |

正门的物理入口固定为南门，前台不再按方向筛选正门，而是按进门后的通道类型筛选：

| 代码 | 中文 |
|---|---|
| `upperLeft` | 左上门 |
| `upperRight` | 右上门 |
| `both` | 左右门 |
| `triple` | 三门 |

当前 V2 前台启用策略：困难模式暂时只显示侧门；正门、二楼门数据继续保留在后台，待素材完成后再开放。噩梦模式显示正门、二楼门。旧的困难正门、二楼门链接会自动回到相同方向或相同地图的侧门页面。

| 代码 | 中文 |
|---|---|
| `full` | 全图 |
| `basement` | 地下室（负一楼） |
| `floor1` | 一楼 |
| `floor2` | 二楼 |

内部只使用以上代码，中文标签由公开序列化层统一生成。

## 3. 楼层显示规则

全图始终排在楼层切换器第一位，并作为进入地图后的默认显示。

困难模式：

```text
[全图] [一楼] [二楼]
```

噩梦模式：

```text
[全图] [地下室] [一楼] [二楼]
```

`full` 继续表示原有全图，`basement` 是单独图片，不要求拼接进 `full`。客户端根据当前地图 `layout` 实际存在的字段生成按钮，但统一按 `full → basement → floor1 → floor2` 排序。

## 4. 业务约束与发布门禁

草稿允许缺少图片或入口，以便分批录入。发布表示所有展示客户端都可以无条件正常显示，因此执行严格校验。

困难模式发布条件：

```text
Layout：full、floor1、floor2 必须存在；basement 不允许
入口：side、front、upstairs 必须存在
```

噩梦模式发布条件：

```text
Layout：full、basement、floor1、floor2 必须存在
入口：front、upstairs 必须存在；side 不允许
```

通用规则：

- 地图 ID 全局唯一，入口 ID 全局唯一。
- 同一地图内入口类型唯一。
- 每个发布入口必须具备方向和入口图；正门方向由系统固定为南，管理员无需重复选择；缩略图可回退到入口原图。
- 正门的 `passage` 在过渡录入期为可选字段：未分类地图仍显示在“全部”中，但不会进入具体通道分类；补齐现有数据后再升级为发布门禁。
- 图片 Key 必须位于允许的 R2 目录。
- 模式切换不得静默删除图片；草稿可以暂存不匹配内容，但发布前必须处理。
- 服务端校验是最终门禁，后台只负责提前提示。

## 5. V2 存储模型

```ts
interface AssetRef {
  key: string
}

interface EntranceV2 {
  id: string
  type: EntranceType
  direction?: Direction
  passage?: Passage
  image?: AssetRef
  thumb?: AssetRef
}

interface MapLayoutV2 {
  full?: AssetRef
  basement?: AssetRef
  floor1?: AssetRef
  floor2?: AssetRef
}

interface MapItemV2 {
  id: number
  mode: GameMode
  name: string
  displayName: string
  remarks: string
  sort: number
  published: boolean
  deletedAt?: string | null
  legacyNames?: string[]
  layout: MapLayoutV2
  entrances: EntranceV2[]
}

interface MapConfigV2 {
  schemaVersion: 2
  version: number
  updatedAt: string
  maps: MapItemV2[]
}
```

配置内部保存 R2 Key，公开接口根据环境生成完整 HTTPS URL，避免静态站和微信小程序错误解析相对地址。

## 6. V1/V2 隔离

```text
config:current       V1 正式配置，不原地迁移
config:v2:current    V2 配置

backups/             V1 历史备份（保持现有路径）
backups-v2/          V2 备份（避开 V1 的 backups/ 前缀）
```

V2 迁移先生成草稿，补齐入口和噩梦地图后才允许发布。观察期内不删除 V1 Key、旧 R2 图片或旧 Worker Version。V2 正式上线后，每日任务只保护 `config:v2:current`；V1 历史数据继续保留但不再产生每日快照。

## 7. API 契约

公开只读接口：

```http
GET|HEAD|OPTIONS /api/public/v2/maps
GET|HEAD         /maps-v2.json
```

两个地址返回同一公开结构。响应包含 `schemaVersion`、`dataVersion`、更新时间、字典和已发布地图；不包含 `published`、`deletedAt` 等后台字段。

后台接口：

```http
GET  /api/admin/v2/maps
PUT  /api/admin/v2/maps
POST /api/admin/v2/images
GET  /api/admin/v2/backups
GET  /api/admin/v2/preview
POST /api/admin/v2/restore
```

`/api/public/*` 在 Access 鉴权前处理，只允许读取；`/api/admin/*` 必须通过 Cloudflare Access。

公开响应要求：

```http
Cache-Control: no-cache, must-revalidate
ETag: "maps-v2-<dataVersion>"
Access-Control-Allow-Origin: *
```

破坏性协议变更必须新增 V3；V2 只允许增加可选字段。公开字典增加 `passages`，正门入口可返回 `passage` 与 `passageLabel`，便于网页、静态站和微信小程序共用。

## 8. 图片目录

```text
maps/layout/full/
maps/layout/basement/
maps/layout/floor1/
maps/layout/floor2/
maps/entrance/
maps/entrance-thumb/
sources/
backups/             V1 历史目录，保持兼容
backups-v2/
```

迁移后的 V1 图片可以继续引用 `maps/full/`、`maps/floor1/`、`maps/floor2/`、`maps/entry/` 和 `maps/entry-thumb/`，新上传图片使用 V2 目录。

## 9. 三类展示客户端

### Worker 正式前台

同源读取 `/api/public/v2/maps`。目录第三级筛选随入口变化：正门显示“全部、左上门、右上门、左右门、三门”，其他入口继续显示方向。入口卡片打开对应 Layout。正式前台路径不带版本前缀并使用稳定 ID；V1 统一使用 `#/v1/*`。旧 `#/v2/*`、`#/legacy`、`#/dir/*` 和 `#/map/*` 在观察期自动替换为对应规范地址。

### main 静态网页

通过 `VITE_MAP_API_BASE_URL` 跨域读取正式公开 API；访问成功后由 Service Worker 保留最近缓存。`main` 只部署静态网页，不执行 Worker 部署，不拥有 KV/R2 写权限。完全离线首次访问所需的 V2 构建快照属于发版切换前的待办项。

分支策略固定为：V2 Worker 与后台代码只从功能分支合入 `feat/admin-backend`；`main` 长期保留为静态页面发布分支，不与 `feat/admin-backend` 合并。正式静态版使用 `VITE_MAP_API_BASE_URL=https://idv-map.321666.xyz` 读取 `/maps-v2.json`。

### 微信小程序

整份拉取公开配置，用 `dataVersion` 管理本地缓存，图片按需下载。小程序只依赖公开 API 和完整 HTTPS 图片 URL，不接入任何后台接口。

## 10. V1 → V2 迁移

- 默认迁移仍生成 `hard` 草稿；从正式公开 V1 做完整同步时，可保持其已发布状态。
- `images.full/floor1/floor2` 迁入 Layout。
- 原方向和入口图迁入 `side` 入口；过渡录入阶段可让 `front`、`upstairs` 暂时复用同一方向、入口图和缩略图，后续在后台逐张替换。
- 保留 ID、排序、名称、展示名、备注、删除状态和旧名称。
- 不生成空 `basement`；噩梦地图全部在 V2 新建。
- 迁移不得修改 `config:current`。
- dry-run/文件转换可重复执行且结果确定；实际写入生产 `config:v2:current` 前必须确认目标尚未存在，禁止覆盖已补充的 V2 入口。本地验收库只有显式传入替换参数时才允许覆盖，并自动生成 V2 备份。
- Dry-run 必须输出数量、缺图、重复和冲突报告。

## 11. 后台要求

- V2 工作区以“困难地图 / 噩梦地图”两个模式页签分开展示，一次只显示当前模式列表；新增按钮自动使用当前模式。
- 根据模式显示 Layout 槽位；全图始终第一。
- 困难显示全图、一楼、二楼和三个入口。
- 噩梦显示全图、地下室、一楼、二楼和两个入口。
- 正门入口显示“通道类型”，不显示方向选择，并由系统自动保存固定南门；其他入口继续选择方向。
- 新建地图从困难切换为噩梦时，自动移除侧门入口；切回困难时自动补齐侧门入口。编辑已有地图时不静默删除现有入口数据。
- 支持地下室上传、裁剪、替换、留档、预览与恢复。
- 每张地图只提供一个“上传原图整体裁剪”按钮，并可选择本次同时生成的入口图；困难输出全图/一楼/二楼/所选入口/缩略图，噩梦额外输出地下室。
- 全图、地下室、一楼、二楼和各入口图在编辑页统一使用“换图 / 裁剪”；进入裁剪页后，可选择“当前图片”或“从全图裁剪”。
- 上传原图只用于当次整体裁剪，不为每张图片重复留存；后续单图重裁统一以已生成的全图为来源。
- 草稿显示完整度，发布时前后端同时校验。
- V2 备份、预览、恢复使用独立路径和 Schema。
- 过渡期避免 V1/V2 隐式双写。

## 12. PWA 与缓存

- V2 配置使用 NetworkFirst。
- Layout/入口图片使用 CacheFirst。
- 离线缓存版本标记包含 `dataVersion`。
- 图片缓存容量按困难 9 张/图、噩梦 8 张/图并预留新旧版本重叠空间。
- 验证全图默认、地下室离线、数据更新后重新缓存，以及困难模式不显示地下室。

## 13. 测试门禁

- Schema：草稿、困难发布、噩梦发布、地下室和入口约束。
- Migration：字段保持、重复运行、冲突保护、V1 不变。
- Contract：V1 前后语义一致、V2 JSON Schema、完整 HTTPS URL、无后台字段泄漏。
- Worker：V1/V2 Key 隔离、ETag、CORS、备份、预览、恢复和 409。
- Web：模式/入口/动态第三级筛选（正门通道、其他入口方向），全图第一且默认，噩梦地下室，旧路由。
- main 静态站：跨域 API 和快照回退。
- 微信小程序：Contract Fixture 可解析和缓存版本更新。
- PWA：访问缓存、完整离线包和版本更新。
- 真机：iPhone Safari、Android Chrome、PC Chrome。

## 14. 开发与发版顺序

```text
生产保护与备份演练
→ 独立 Staging 与 CI 隔离
→ Shared Schema/Validator/Migration
→ Worker V2 Expand
→ Admin V2
→ Web V2
→ Staging 导入生产快照并补数据
→ Production Backend Expand
→ 生成 config:v2:current
→ 补齐并验证 V2 内容
→ Worker Web 切换
→ main 静态站切换
→ 观察 2～4 周
→ 单独评估 V1 Contract
```

## 15. 回滚

- Web 问题：回滚 Worker Version，旧 Web 继续读取 `config:current`。
- V2 API 问题：回滚 Backend Expand，不修改 V1 数据。
- V2 数据问题：只恢复 `backups-v2/`。
- main 静态站问题：只回滚静态部署。
- PWA 问题：发布自毁 Service Worker。
- 观察期内不删除旧配置、旧图片和旧备份。

## 16. 完成标准

- `side/front/upstairs`、`full/basement/floor1/floor2` 全链路一致。
- 所有地图默认显示全图，全图按钮排第一。
- 困难模式无地下室且有三个入口。
- 噩梦模式有地下室且只有两个入口。
- Worker、main 静态网页和微信小程序消费同一公开契约。
- V1 数据、接口、旧分享链接、备份和回滚保持可用。

## 17. 实施结果

已完成：

- Shared V2 类型、发布校验、公开序列化和 V1 → V2 dry-run 迁移。
- 独立 V2 KV Key、公开/后台接口、上传目录和备份目录。
- 前台 V2 模式/入口/动态第三级筛选（正门通道、其他入口方向）、稳定 ID 路由、入口切换和地下室楼层。
- 全图固定第一，详情无楼层参数时全图为选中状态。
- 后台 V2 独立工作区、草稿保存、逐项发布提示、楼层和入口图片维护。
- 当前 V2 前端代码支持通过 `VITE_MAP_API_BASE_URL` 读取公开 API；移植到独立 `main` 静态分支仍作为后续任务。
- 单元测试、类型检查、生产构建和本地 Worker 页面联调。

上线后独立迭代：

- 为后台补 V2 版本历史、预览/恢复界面（对应 API 已完成）。
- 如要求“首次打开即完全离线”，生成并验证 V2 静态构建快照。
- 微信小程序按公开契约另立项目开发；本次只保证其只读接口可直接消费。
- `main` 静态页面分支独立接入正式 V2 公开接口，不合并 Worker 与后台分支。
- 困难模式正门、二楼门素材补齐前，继续只开放侧门筛选。

## 18. V2 联机预览环境

2026-08-23 已建立完全独立的 Cloudflare 联机验收环境：

| 资源 | 测试环境 | 正式环境 |
|---|---|---|
| Worker | `idv-cryptic-map-v2-preview` | `idv-cryptic-map` |
| 访问入口 | `idv-cryptic-map-v2-preview.heytl.workers.dev` | `idv-map.321666.xyz` |
| KV | `idv-cryptic-map-v2-preview-config` | `CONFIG` |
| R2 | `idv-media-v2-preview` | `idv-media` |
| 自定义域名 | 无 | 正式域名与回退域名 |
| Cron | 无 | 每日正式快照 |

测试入口：

- 前台：`https://idv-cryptic-map-v2-preview.heytl.workers.dev/#/hard/side`
- 后台：`https://idv-cryptic-map-v2-preview.heytl.workers.dev/admin/`，进入“V2 开发工作区”编辑。
- 公开协议（推荐）：`https://idv-cryptic-map-v2-preview.heytl.workers.dev/maps-v2.json`。`/api/public/v2/maps` 返回相同数据，但正式环境的 Cloudflare Access 规则覆盖 `/api/*`，网页、main 静态站和微信小程序统一使用 `/maps-v2.json`，避免要求后台登录。

部署命令必须显式指定环境：

```bash
pnpm build
pnpm exec wrangler deploy --env v2-preview
```

禁止为 V2 测试直接运行不带环境参数的 `wrangler deploy`，因为顶层配置属于正式 Worker。预览后台通过 `DEV_DISABLE_AUTH=1` 临时开放，只能用于隔离测试，请勿公开传播；正式环境仍由 Cloudflare Access 保护。

## 19. 正式上线准备清单

当前联机数据基线（2026-08-23，正式 Backend Expand 后复核）：V2 配置 v23，共 42 条记录，其中有效地图 41 张、已移除记录 1 条；困难 28 张、噩梦 13 张。测试与正式 `config:v2:current` 语义完全一致。噩梦地图的全图、地下室、一楼、二楼、正门、二楼门、正门通道分类和备注已完成上传与校正。困难模式上线时仍只开放侧门入口，正门和二楼门继续保留数据但不在前台显示。

### A. 上线阻塞项

- [x] 迁移时导出并备份最新 V2 v23；正式切换默认入口前仍需再次短暂冻结录入并复核版本未变化。
- [x] 对 41 张有效地图执行公开配置校验，确认不存在缺图、重复 ID、非法入口或非法楼层。
- [x] 逐一检查 248 个配置引用的 R2 Key，并对测试/正式内容执行 SHA-256 一致性校验。
- [x] 确认困难前台只显示侧门；噩梦显示正门、二楼门和正确的第三级筛选。
- [x] 完成 V2 后台列表排序、列表发布开关和移除确认的页面回归测试；部署前后 v22 配置哈希一致。
- [x] 确认 V2 回收站列表延期：列表仍保留“移除”软删除功能，二次确认后先隐藏地图，点击“保存 V2”才生效；恢复入口不作为本次上线阻塞项，误操作可通过 V2 版本备份整体恢复。

### B. 正式数据迁移（不覆盖 V1）

- [x] 备份正式 KV 的 `config:current`、正式旧 V2、测试 V2 和当前 Worker Version。
- [x] 把 V2 预览 v23 复制到正式 KV 独立 Key `config:v2:current`，正式 `config:current` 保持 v8 不变。
- [x] 只复制 V2 配置引用的 248 个图片到正式 R2 `idv-media` 新目录，保持 Key 不变并校验文件 SHA-256。
- [x] 写入前发现正式已有 V2 v0，先独立备份再迁移，没有静默覆盖未知数据。
- [x] 迁移完成后比较配置语义、地图数量、模式数量、图片 Key 和公开 dataVersion，测试与正式一致。

### C. 切换前验证

- [x] 发布 Production Backend Expand，让正式域名的 V2 API 可读，但默认前台仍保持 V1。
- [x] 验证正式 `/maps-v2.json`、ETag `"maps-v2-23"`、CORS、图片 URL 和 304 缓存；`/api/public/v2/maps` 保留为同结构别名，但当前正式 Access 策略会要求登录，不作为公开客户端地址。
- [x] 在隐藏 V2 路由验收困难/噩梦、入口切换、第三级筛选、全图默认和地下室。
- [x] 验证旧 V1 `/maps.json` 仍为 v8、28 张地图，迁移前后语义完全一致；默认路由仍为 V1。
- [ ] PC Chrome、iPhone Safari、Android Chrome 各完成一次核心路径真机验收。
- [ ] 验证 PWA 更新、普通刷新、离线缓存和旧 Service Worker 升级。
- [x] 验证正式后台仍由 Cloudflare Access 保护，未登录请求返回 302 登录跳转，未携带 `DEV_DISABLE_AUTH=1`。

### D. 发版切换

- [x] 单独发布“默认前台进入 V2”的 Worker Web 版本，不与数据迁移放在同一次变更中。
- [x] 保留 V1 路由和配置作为观察期回退入口：规范路径为 `#/v1`、`#/v1/dir/*`、`#/v1/map/*`，旧地址自动兼容跳转。
- [ ] 更新 `main` 静态网页的正式 V2 API 地址并验证跨域读取；微信小程序不作为本次网页上线阻塞项。
- [x] 记录最终 Worker Version、V2 dataVersion、配置指纹和发布时间，见 [V2.1.0 正式归档](releases/V2.1.0.md)。

### E. 上线后观察与回滚

- [x] 上线后抽查首页、13 张噩梦地图、困难侧门和随机图片加载；截至 2026-08-27 未发现阻塞问题。
- [x] 完成首轮运行观察；正式 V2 仍为 v23、41 张有效地图，公开接口 HTTP 200、ETag 与 CORS 正常。
- [ ] 发现 Web 问题时回滚 Worker Version；发现 V2 数据问题时只恢复 `backups-v2/`。
- [x] 首轮观察期内未删除 V1 KV、V1 图片、V1 备份、V2 预览环境或关键 Worker Version；继续保留至至少稳定满 30 天。
- [ ] 回收站、V2 版本历史界面和微信小程序作为上线后独立迭代。

## 20. 2026-08-23 正式 Backend Expand 迁移记录

- 数据源：测试 V2 v23；正式公开接口为 `/maps-v2.json`，返回 41 张有效地图（困难 28、噩梦 13）。
- 正式 V1：`config:current` 仍为 v8、28 张，未改动；`/` 默认仍进入 V1。
- 正式 V2：独立键 `config:v2:current` 为 v23；248 个图片引用已迁入正式 R2 并逐文件通过 SHA-256 校验。
- Backend Expand 迁移时 Worker：`5303c7ea-f896-4922-8765-aedb110a9a22`；默认 V2 与路径规范化后的稳定功能版本为 `2a13463a-9a42-45cf-9ba6-1c2b12f1d50d`。
- 迁移前稳定 Worker：`8b4a7767-12dd-42ba-869b-f6194c03b635`。
- 测试备份：`backups-v2/2026-08-23T10-02-00-000Z-manual-v23.json`。
- 正式迁移备份目录：`migration-backups/2026-08-23/`，包含正式 V1 v8、正式旧 V2 v0、测试 V2 v22 与 v23。
- Worker 紧急回退：`pnpm exec wrangler versions deploy --env="" 8b4a7767-12dd-42ba-869b-f6194c03b635@100 --message "Rollback V2 migration" --yes`。
- 数据回退原则：优先保持默认 V1，不删除任何 V1/V2 KV、R2 或测试资源；仅在确认 V2 配置异常时从上述迁移备份恢复 `config:v2:current`。
- 前台路径规范：`#/` 进入正式困难侧门目录并显示为 `#/hard/side`；正式版不带 `/v2`，V1 统一放在 `#/v1`。旧 `#/v2/*`、`#/legacy`、`#/dir/*` 与 `#/map/*` 分享链接继续有效并自动替换为规范地址。

## 21. V2.1.0 正式归档

2026-08-27 完成首轮稳定观察和正式版本归档。Git 标签、当前 Worker、稳定回滚版本、V1/V2 数据数量、规范化 SHA-256 指纹、备份位置和回滚命令统一记录在 [V2.1.0 正式版本归档](releases/V2.1.0.md)。
