# idv-cryptic-map 重构实施文档

> 基于 Vite + Vue 3 + TypeScript，主力部署 Cloudflare Workers 静态资源，Vercel 备用镜像。
> 在新分支 `refactor/vite` 上按 Phase 推进，每个 Phase 一次或多次提交，附验收清单。
> 本文档最终会以 `docs/REFACTOR.md` 形式随代码入库并持续更新。

---

## 一、背景与目标

### 1.1 现状痛点

| # | 痛点 | 现状证据 |
|---|------|---------|
| 1 | 缓存策略原始：更新靠手动 `?v=` 版本号，容易漏改 | `index.html` 中 `style.css?v=2`、`script.js?v=6`，git 历史多次专门提交升版本号 |
| 2 | 全站 `no-cache`，重复访问每个资源都要回源验证，加载慢 | `site/_headers`、`vercel.json` 全部资源 `no-cache, must-revalidate` |
| 3 | 数据双份维护：`script.js` 内嵌 `MAP_DATA` 与 `site/maps.json` 重复，且后者运行时根本没被使用 | `script.js:6-259` 与 `site/maps.json` 内容重复；页面从不 fetch maps.json |
| 4 | 死资源照常部署：webp 与已淘汰的 jpg/png 并存全部上线 | `site/public/full` 等目录 50 个文件实际只用 28 个，部署体积 ~26MB |
| 5 | 房间坐标 `ROOM_COORDINATES` 硬编码在 JS 里，与地图数据割裂 | `script.js:262-322` |
| 6 | 无构建管线、无 API 层，后续做后台配置管理无处可挂 | 纯手写三件套，零依赖 |

### 1.2 重构目标

1. **更新即生效**：改地图配置或图片后，部署完成即对所有用户生效，无需手动版本号，无需用户强刷。
2. **加载更快**：静态资源内容哈希 + 一年 immutable 缓存，重复访问零回源；只打包被引用的资源。
3. **现代架构**：Vite 构建、TypeScript、组件化，逻辑/数据/样式分层清晰。
4. **为后台管理预留布局**：目录结构、数据访问层、部署形态都为后续加管理面板和 API 留好位置。

### 1.3 技术选型（可调整项）

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 前端框架 | **Vue 3 + TypeScript**（Composition API + `<script setup>`） | 包体小、中文生态好；后台管理面板（表单/CRUD）可复用同栈与成熟 UI 库（Naive UI / Element Plus） |
| 构建 | **Vite 7** | 用户指定；内容哈希、资源管线、dev 体验都是标配 |
| Cloudflare 形态 | **Workers 静态资源**（`wrangler.jsonc` 的 `assets` 配置） | Cloudflare 当前主推方向（Pages 已进入维护模式）；未来后台 API 直接写进同一个 Worker，配 KV/D1/R2 无需迁移 |
| Vercel | **保留为备用镜像** | 同步更新 vercel.json 即可，成本低；Vercel Analytics 统计脚本保留 |
| 路由 | **vue-router，hash 模式** | 与旧站 `#/map/左-Y门/1` 格式完全兼容，已分享出去的链接不失效 |
| 包管理 | **pnpm** | 快、省磁盘，workspace 为后续 `apps/admin` 做准备 |
| 测试 | **Vitest**（数据一致性测试为主）+ 手动验收清单 | 项目以 UI 交互为主，重点保数据与资源不脱节 |
| 字体 | **自托管 + 中文子集化 woff2**（弃用 Google Fonts CDN） | 目标用户在中国大陆，`fonts.googleapis.com` 不可达/极慢，是现站最大加载短板；子集化后 Ma Shan Zheng 等从 2MB+ 降到几十 KB |
| 缩略图 | **sharp 构建时生成** | 目录页卡片显示尺寸小，为 entry 图生成 ~300px 缩略图，首屏流量降 70%+；新增地图零手工操作 |
| 离线 | **PWA（vite-plugin-pwa，autoUpdate 策略）** | 玩家局内断网/弱网也能查图，契合使用场景；可添加到手机主屏。SW 检测到新版自动更新，不与"更新即生效"冲突 |
| 产物命名 | **`assetFileNames` 仅用 hash** | 源文件名保持中文（`左-Y门.webp`），但构建产物用纯 hash 命名，规避非 ASCII URL 在 CDN/工具链上的兼容坑 |

---

## 二、目标目录结构

```
idv-cryptic-map/
├── apps/
│   └── web/                         # 前端应用（未来 apps/admin 平级放后台管理）
│       ├── index.html               # 入口 HTML（Vercel Analytics 保留在此）
│       ├── vite.config.ts           # assetFileNames 纯 hash 命名 + vite-plugin-pwa
│       ├── tsconfig.json
│       ├── scripts/
│       │   └── gen-thumbs.mjs       # sharp：entry 图生成 ~300px 缩略图（build 前置钩子）
│       ├── public/                  # 原样拷贝的静态文件
│       │   ├── _headers             # Cloudflare 缓存头（见 §3）
│       │   └── icons/               # 图例图标
│       └── src/
│           ├── main.ts
│           ├── App.vue
│           ├── router.ts            # hash 路由，兼容旧链接格式
│           ├── views/
│           │   ├── CatalogView.vue  # 手记目录页
│           │   └── StrategyView.vue # 地图攻略详情页
│           ├── components/
│           │   ├── DirectionTabs.vue    # 左/右/南/北方向筛选
│           │   ├── DensitySwitch.vue    # 标准/紧凑密度切换
│           │   ├── MapCard.vue          # 目录卡片
│           │   ├── FloorSwitch.vue      # 全图/1楼/2楼切换
│           │   ├── MapViewport.vue      # 地图视口（缩放/拖拽/全屏/高亮）
│           │   ├── RoomSelector.vue     # 房间快速指引按钮
│           │   └── LegendBox.vue        # 图示说明
│           ├── composables/
│           │   └── useZoomPan.ts    # 缩放/拖拽/双指捏合/边界钳制/全屏（自 script.js 移植）
│           ├── data/
│           │   ├── maps.json        # ★ 唯一数据源（合并 MAP_DATA + ROOM_COORDINATES + maps.json）
│           │   └── maps.ts          # 数据访问层：校验 + 图片逻辑名 → Vite 哈希 URL
│           ├── assets/
│           │   ├── maps/            # 28×4 张在用 webp（走构建管线，产出哈希文件名）
│           │   │   ├── entry/  ├── entry-thumb/（gen-thumbs 生成，git 忽略）
│           │   │   ├── floor1/ ├── floor2/  └── full/
│           │   └── fonts/           # 子集化后的 woff2（Cinzel/Ma Shan Zheng/Noto Serif SC）
│           └── styles/
│               ├── fonts.css        # @font-face 自托管声明
│               └── main.css         # 原 style.css 迁入（先全局保证视觉 1:1，拆分为后续优化）
├── maps/                            # 原始素材（不动，不参与部署）
├── crop_images.py                   # 裁图脚本（输出路径改到 apps/web/src/assets/maps）
├── docs/
│   └── REFACTOR.md                  # 本实施文档入库版 + 各阶段验收记录
├── .github/workflows/deploy.yml     # CI：PR 预览部署 + main 自动部署
├── wrangler.jsonc                   # Cloudflare Workers 静态资源配置
├── vercel.json                      # 更新为 Vite 构建
├── package.json                     # pnpm workspace 根
├── pnpm-workspace.yaml
└── site/                            # 旧站整体保留，直至线上切换确认后在 Phase 7 删除
```

### 2.1 数据结构（`src/data/maps.json`）

合并三处数据为单一来源，图片路径不再存完整 URL，只存逻辑名（由目录约定推导），`rooms` 并入每张地图：

```jsonc
{
  "updatedAt": "2026-07-10",          // 地图数据更新时间：随地图更新手动维护的配置字段，
                                      // 页脚从数据层读取；后续有后台管理后改由接口下发
  "maps": [
    {
      "id": 1,                         // 稳定主键，未来入库不复用
      "direction": "左",
      "name": "左-Y门",                // 逻辑名 = 各目录下图片文件名（不带扩展名）
      "displayName": "左-Y门",         // 展示名（"（新）"后缀只写这里，不影响文件名）
      "remarks": "左侧入口，呈现Y字形墙体结构",
      "rooms": {                       // 原 ROOM_COORDINATES 并入，无则省略
        "1": { "餐厅": { "left": 33, "top": 15, "width": 15, "height": 15 } },
        "2": { }
      }
    }
  ]
}
```

`src/data/maps.ts` 数据访问层（未来切 API 的隔离点）：

```ts
// import.meta.glob 生成 逻辑路径 → 构建后哈希 URL 的清单
const imgUrls = import.meta.glob('../assets/maps/**/*.webp', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

export interface MapItem { /* id/direction/name/displayName/remarks/rooms + entry缩略图 + 四张原图的已解析 URL */ }

export function getMaps(): MapItem[] { /* 读 maps.json，逐条解析四张图 URL，缺图直接 throw（构建期即暴露） */ }
```

**未来加后台时**：只需把 `getMaps()` 改为 fetch Worker API（KV/D1 数据 + R2 图片 URL），所有组件零改动。

---

## 三、核心机制：缓存与"更新即生效"

### 3.1 原理

```
改图片/配置 → git push → CI 构建（内容变化 ⇒ 产物文件名哈希变化）→ 部署
→ 用户下次打开/刷新页面：index.html 是 no-cache（体积仅几 KB，回源验证极快）
→ HTML 里引用的都是新哈希 URL ⇒ 立即加载新资源
→ 未改动的图片哈希不变 ⇒ 继续命中本地一年缓存，零流量
```

对比现状：旧方案所有资源每次访问都 `no-cache` 回源验证；新方案只有 HTML 回源，其余全部本地缓存直读。**更新更及时，同时加载更快。**

### 3.2 缓存头配置（`apps/web/public/_headers`）

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache, must-revalidate

/
  Cache-Control: no-cache, must-revalidate
```

（`vercel.json` 的 `headers` 同步写一份等价规则。）

### 3.3 PWA 与缓存策略的协调

- `vite-plugin-pwa` 用 `registerType: 'autoUpdate'`：SW 在后台发现新版本后自动激活并刷新缓存，用户下次进入即新版，与 §3.1 的"更新即生效"目标一致。
- 地图大图（floor/full 共 ~13MB）不放进 SW precache（避免首次访问强制全量下载），改用 runtime caching（CacheFirst，访问过的图才缓存）；HTML/JS/CSS/字体/entry 缩略图进 precache，保证壳子完整离线。
- 效果：玩家访问过某张地图后，局内断网也能查该图；添加到主屏可全屏使用。

### 3.4 附带收益

- `import.meta.glob` 只打包 `assets/maps/` 下实际存在的 webp，`site/public` 里那些淘汰 jpg/png 从源头不再进入部署，产物体积从 ~26MB 降到 ~13MB（28×4 webp + icons）。
- 产物文件名经 `assetFileNames` 统一为纯 hash（源文件名保持中文不变），规避非 ASCII URL 的 CDN 兼容问题。
- 数据一致性测试保证"maps.json 每条记录的四张图都存在"，缺图在 CI 就红，不会上线后 404。
- 字体自托管进同一哈希 + immutable 管线，大陆用户不再等 Google Fonts 超时。

---

## 四、实施步骤

> 每个 Phase 结尾提交一次，commit message 前缀 `refactor(phaseN):`。
> 验收清单逐项打勾后才进入下一 Phase，验收结果记录进 `docs/REFACTOR.md`。

### Phase 0：分支与脚手架

**操作**
1. 从 `main` 建分支：`git checkout -b refactor/vite`
2. 根目录初始化 pnpm workspace（`package.json` + `pnpm-workspace.yaml`）
3. `apps/web/` 下脚手架 Vite + Vue 3 + TS（`pnpm create vite`），配好 `vite.config.ts`（含 `build.rollupOptions.output.assetFileNames = 'assets/[hash][extname]'` 纯 hash 产物命名）、tsconfig
4. 建 `docs/REFACTOR.md`（本文档入库）
5. `.gitignore` 增补 `dist/`、`node_modules/`（已有则跳过）

**验收**
- [ ] `pnpm install && pnpm dev` 起动，浏览器出 Vue 默认页
- [ ] `pnpm build` 成功，`apps/web/dist` 产物带哈希文件名
- [ ] 旧站 `site/` 未受任何影响（`git status` 无 site/ 改动）

### Phase 1：数据与资源统一

**操作**
1. 合并 `script.js` 的 `MAP_DATA`（28 条）+ `ROOM_COORDINATES`（4 张图的坐标）+ `site/maps.json` → `src/data/maps.json`（结构见 §2.1；名称带"（新）"的拆为 `name`/`displayName` 两字段）
2. 从 `site/public/{entry,floor1,floor2,full}` 只拷贝 28×4 张在用 webp 到 `src/assets/maps/`；icons 拷到 `apps/web/public/icons/`
3. 实现 `src/data/maps.ts` 数据访问层
4. Vitest 数据一致性测试 `src/data/maps.test.ts`：
   - 每条记录 entry/floor1/floor2/full 四张图在 glob 清单中都存在
   - `id`、`name` 无重复；`direction` ∈ {左,右,南,北}
   - rooms 坐标值在 0–100 百分比范围内

**验收**
- [ ] `pnpm test` 全绿
- [ ] `pnpm build` 后 `dist/assets` 中 webp 数量 = 112（28×4），全部哈希命名
- [ ] 故意改错一个图片名，`pnpm test` 能红（再改回）

### Phase 2：视图组件化移植

**操作**
1. 移植目录页 `CatalogView.vue`：方向筛选（DirectionTabs）、密度切换（DensitySwitch + localStorage 键沿用 `idv-catalog-compact`）、卡片网格（MapCard，入口图 `loading="lazy"`）
2. 移植攻略页 `StrategyView.vue` 框架：标题/方向徽章、侧门参考图、特征备注、图例（LegendBox）、楼层切换（FloorSwitch）
3. `router.ts` hash 路由，**与旧站格式逐字符兼容**：
   - `#/` 目录；`#/dir/左` 目录+筛选（replace 不产生历史）
   - `#/map/左-Y门` 与 `#/map/左-Y门/1|2` 攻略页+楼层（楼层切换 replace）
   - 未知地图名 → `location.replace('#/')` 兜底
   - `document.title` 同步 `${displayName} | 加页手记...`
   - 保留"目录点击进入则返回键 history.back()、分享直达则返回按钮跳目录"的行为（`script.js:338` 的 `enteredFromCatalog` 逻辑）
4. 页脚"数据更新于"读 `maps.json` 的 `updatedAt` 配置字段（经 `data/maps.ts` 数据层暴露，后续有后台管理后无缝改为接口下发），不再硬编码在 HTML 里

**验收**
- [ ] 四方向筛选正确，筛选态刷新后保持（hash 还原）
- [ ] 密度切换生效且刷新后记忆
- [ ] 旧格式链接直达：手输 `#/map/%E5%B7%A6-Y%E9%97%A8/2`（URL 编码中文）能直达左-Y门 2 楼
- [ ] 目录 → 详情 → 浏览器返回键 = 回目录且筛选态不丢；直达详情页点"返回目录"不退出站点
- [ ] 28 张卡片全部有图无 404（DevTools Network 过滤 404）

### Phase 3：地图交互移植

**操作**
1. `useZoomPan.ts`：自 `script.js:724-940` 平移逻辑并 TypeScript 化，**不改行为**——滚轮以指针为锚缩放、左键拖拽、双指捏合（含中点锚定与抬指接续单指拖）、`clampScale`/`clampPosition` 边界钳制、`fitScale` 自适应、`ZOOM_CONFIG` 常量照搬
2. `MapViewport.vue`：楼层图切换（full 由 floor1 URL 推导改为直接从数据层取 `fullImg`）、图片 onload 后 fit、页内全屏（含右上角 × 与点击黑边退出）、悬浮工具栏（+/-/全屏/重置）
3. `RoomSelector.vue` + 高亮层：有坐标数据的地图渲染房间按钮，点击高亮并自动聚焦 2×（`showHighlight` 逻辑移植）；无数据的地图隐藏该面板（**去掉旧版 alert 占位交互**）

**验收**
- [ ] 桌面：滚轮缩放锚点正确、拖拽不越界、+/- 缩放、重置恢复自适应居中、全屏进出后自适应重算
- [ ] 移动端（DevTools 触摸模拟 + 真机各过一遍）：单指拖、双指捏合、双指抬一指无缝转单指拖
- [ ] 楼层切换：全图/1楼/2楼图片正确、每次切换后自适应重置、hash 楼层段同步
- [ ] 房间高亮：左-Y门 1 楼点"餐厅"→ 高亮框位置正确 + 自动放大聚焦；再点一次取消；换楼层高亮清除

### Phase 4：样式与字体迁移

**操作**
1. `site/style.css` → `src/styles/main.css` 全局引入，选择器基本原样（哥特风视觉 1:1 是硬要求，拆 scoped 是后续优化不在本次范围）；css 内 `public/icons` 等相对路径核对修正
2. **字体自托管**（替换 Google Fonts CDN，解决大陆不可达）：
   - 下载 Cinzel（拉丁字符集本来就小）、Ma Shan Zheng、Noto Serif SC 的 woff2
   - 中文两款用 fontmin/subfont 按页面实际用字子集化（站内中文文案 + 28 个地图名，字符量很小，预计各几十 KB）
   - `src/styles/fonts.css` 写 `@font-face`（`font-display: swap`），字体文件走 assets 哈希管线
   - 注意：子集化字符集要覆盖 maps.json 全部文本，数据一致性测试加一条"maps.json 中出现的字符 ⊆ 子集字符表"（防止未来新增地图名出现缺字）
3. Vercel Analytics `<script defer src="/_vercel/insights/script.js">` 保留在 `index.html`

**验收**
- [ ] 双窗口对照（旧站 `cd site && python -m http.server 8000` vs 新站 `pnpm dev`）：目录页、攻略页、全屏态逐屏对比无可感知差异
- [ ] 桌面 1440px 与移动 375px 两档宽度各过一遍
- [ ] DevTools Network：无任何 `fonts.googleapis.com`/`gstatic.com` 请求，三款字体从本站加载且渲染正确（含"（新）"等全角括号字符）
- [ ] 断网刷新（模拟大陆访问 Google 失败）页面渲染不被字体阻塞

### Phase 5：缓存头、缩略图、PWA 与性能

**操作**
1. 写 `apps/web/public/_headers`（§3.2）
2. **入口图缩略图**：`scripts/gen-thumbs.mjs`（sharp）把 `assets/maps/entry/*.webp` 生成 ~300px 宽缩略图到 `assets/maps/entry-thumb/`（git 忽略，`pnpm build`/`pnpm dev` 前置钩子自动执行）；目录卡片改用缩略图，攻略页侧门参考图仍用原图
3. **PWA**：`vite-plugin-pwa`，`registerType: 'autoUpdate'`；precache = HTML/JS/CSS/字体/icons/entry 缩略图；floor1/floor2/full/entry 原图走 runtime CacheFirst（访问过才缓存，避免首访强制拉 13MB）；manifest 配名称/主题色/图标（从现有 icons 生成）
4. 目录页入口图确认 `loading="lazy"`；攻略页主图加 `fetchpriority="high"`
5. 检查 chunk 划分：本项目 JS 很小，默认单 chunk 即可，不做过度优化

**验收**
- [ ] `pnpm build && npx wrangler dev`：`curl -I` 验证 `/assets/*` 返回 `immutable`、`/` 返回 `no-cache`
- [ ] 改动一张 webp 重新 build：仅该图（及其缩略图）哈希变化，其余产物文件名不变（增量缓存友好性）
- [ ] 目录页首屏图片请求全部为缩略图（DevTools Network 单图 ≲30KB）
- [ ] PWA：Lighthouse installable 通过；访问左-Y门后 DevTools 切离线，刷新可进站且该图可看、未访问过的图有兜底提示不白屏
- [ ] 更新即生效不被 SW 破坏：部署新版后旧标签页触发 SW 更新，下次进入即新版（本地用两次 build + `wrangler dev` 验证）
- [ ] Lighthouse 移动端跑分记录进 REFACTOR.md（性能分对比旧站，作为量化验证）

### Phase 6：部署与 CI workflow

**操作**
1. `wrangler.jsonc`：
   ```jsonc
   {
     "name": "idv-cryptic-map",
     "compatibility_date": "2026-07-01",
     "assets": { "directory": "./apps/web/dist", "not_found_handling": "single-page-application" }
   }
   ```
2. `.github/workflows/deploy.yml`：
   - PR → install + test + build + `wrangler versions upload`（评论里输出预览 URL）
   - push `main` → install + test + build + `wrangler deploy`
   - 使用 `cloudflare/wrangler-action@v3`，密钥走 repo secrets
3. `vercel.json` 更新：`buildCommand: "pnpm --filter web build"`、`outputDirectory: "apps/web/dist"`、headers 同步 §3.2 规则
4. **需要用户手动操作**（文档明示）：
   - GitHub repo secrets 配 `CLOUDFLARE_API_TOKEN`（Workers 编辑权限）、`CLOUDFLARE_ACCOUNT_ID`
   - Cloudflare Dashboard 为 Worker 绑定正式域名（旧 Pages 项目先保留观察），并开启 Worker 的 **Preview URLs**（PR 预览链接依赖此开关）
   - Vercel 项目确认新构建配置

**验收**
- [ ] 分支推送 PR，CI 全绿，预览 URL 可访问且 Phase 2/3 验收清单在预览环境重过一遍
- [ ] 合并前在预览环境用手机真机访问一次
- [ ] Vercel 预览部署正常、Analytics 采集正常

### Phase 7：文档、清理与合并

**操作**
1. `crop_images.py` 输出路径改到 `apps/web/src/assets/maps/`，README 的"地图更新流程"改为：
   `原图入 maps/ → python crop_images.py → 更新 src/data/maps.json → git push → CI 自动部署（无需版本号）`
2. README 重写：目录结构、本地开发（`pnpm dev`）、部署说明（Workers 为主、Vercel 备用、GitHub Pages 说明移除或标注需构建）
3. 删除 `site/` 整目录与旧 `_headers`（此时生产已切到 Workers 且验证通过）
4. PR `refactor/vite` → `main`，走一次完整 CI

**验收**
- [ ] 合并后生产域名全功能回归（Phase 2/3 清单抽查 + 一条旧分享链接实测）
- [ ] 端到端演练一次"更新即生效"：改一张地图图 → push → 部署完成后普通刷新即见新图（不清缓存、不强刷）
- [ ] 仓库内无 `?v=` 残留（`grep -r "?v=" apps/`为空）

---

## 五、后台管理预留（本次不实现）

| 预留点 | 本次动作 | 未来演进 |
|--------|---------|---------|
| 目录布局 | `apps/web` 结构 + pnpm workspace | 新增 `apps/admin`（同 Vue 栈 + Naive UI/Element Plus） |
| 数据访问层 | `src/data/maps.ts` 统一出口，组件不直接碰 json | `getMaps()` 改为 fetch `/api/maps`（Worker + KV 或 D1） |
| 图片 | 构建期哈希内嵌 | 迁 R2，admin 上传，URL 由 API 下发 |
| 部署形态 | Workers 静态资源 | 同一 Worker 加 `/api/*` 路由（鉴权用 Cloudflare Access 或简单 token） |
| 数据主键 | maps.json 的 `id` 稳定不复用 | 直接作为 D1 主键迁移 |

## 六、风险与回滚

- 整个重构在 `refactor/vite` 分支进行，`site/` 旧站保留到最后一刻，`main` 随时可部署旧版 —— 回滚 = Cloudflare 把域名指回旧 Pages 项目（或 revert 合并提交）。
- hash 路由格式逐字符兼容是硬约束（Phase 2 验收有专项），保证已分享链接不失效。
- 视觉 1:1 是硬约束（Phase 4 双窗口对照），CSS 先整体迁移不重写。
- Service Worker 是唯一"缓存出错难恢复"的新风险点：坚持 autoUpdate + 不 precache 大图的保守策略，且 vite-plugin-pwa 提供 `selfDestroying` 开关，出问题可发一版自毁 SW 立即回到纯在线模式。

## 七、执行与验收记录（2026-07-15）

Phase 0–6 已在 `refactor/vite` 分支完成，每 Phase 一个提交。与原方案的差异与补充：

| 项 | 说明 |
|----|------|
| 验收自动化 | 手动验收清单升级为脚本：`scripts/verify-e2e.mjs`（34 项，Playwright 驱动本机 Chrome，含新旧站截图对照）与 `scripts/verify-pwa.mjs`（离线 5 项），全部通过 |
| 单元测试 | 16 项：数据一致性 7 + 路由旧链接兼容 8 + 字体子集覆盖 1 |
| 缩略图命名 | 产物统一纯 hash，唯缩略图加 `t-` 前缀（`assets/t-[hash].webp`）以便 PWA precache 与大图区分；`assetsInlineLimit=0` 防止小图内联进 JS 破坏缓存粒度 |
| 字体成果 | 三款字体子集化后共约 529KB（思源宋体 24.5MB → 261KB），变量字体单文件覆盖多字重 |
| 路由守卫补充 | vue-router `beforeEnter` 在同记录参数变化时不重跑，组件内已做兜底（CatalogView 非法方向按“全部”，StrategyView 未知地图回目录），E2E 覆盖两条路径 |
| 快速区域指引 | 旧站该面板被 display:none 永久隐藏；重构初版曾对 4 张图启用，后经用户确认无用，已连同房间坐标数据、高亮层与相关样式一并移除（2026-07-16） |
| 增量缓存验证 | 改动一张图重建：仅该图 + 其缩略图 + index.js 哈希变化，其余 130+ 产物文件名不变 |
| 缓存头实测 | wrangler dev：`/` 与 sw.js/registerSW.js/manifest 均 no-cache，`/assets/*` 一年 immutable |
| updatedAt | 按用户决策为 maps.json 配置字段（随地图更新手工维护），页脚经数据层读取，后续由后台接口下发 |

### 待用户完成的手动步骤
1. GitHub repo Secrets：`CLOUDFLARE_API_TOKEN`（Workers 编辑权限）、`CLOUDFLARE_ACCOUNT_ID`
2. Cloudflare Dashboard：确认 Worker `idv-cryptic-map` 创建成功后绑定正式域名，打开 Preview URLs 开关；旧 Pages 项目保留观察
3. Vercel：确认新构建配置（vercel.json 已更新）生效
4. 生产切换验证通过后：删除 `site/` 旧目录（Phase 7 收尾提交）

## 八、关键源文件参考

| 用途 | 文件 |
|------|------|
| 地图数据 + 房间坐标 + 全部交互逻辑 | `site/script.js`（940 行，移植的唯一逻辑来源） |
| HTML 结构 | `site/index.html` |
| 全部样式 | `site/style.css`（1124 行） |
| 现缓存配置 | `site/_headers`、`vercel.json` |
| 裁图脚本 | `crop_images.py` |
