# 第五人格加页手记 | 侧门入口解密攻略手册 🧭

这是一个针对《第五人格》“加页手记”新模式开发的网页版互动地图攻略手册。玩家在局内可以根据侧门入口的墙体排布，快速筛选确认当前的地图布局，并查看一楼、二楼的高清攻略大图，支持无缝缩放、平移及楼层切换。

技术栈：**Vite + Vue 3 + TypeScript**，主力部署 **Cloudflare Workers**（静态资源），Vercel 备用镜像。

---

## 🎨 视觉与交互特色

* **庄园暗黑哥特风**：复古羊皮纸纹理卡片、缝线饰边、金属感推拉拉杆、纽扣造型按钮，提灯微光背景氛围感十足。
* **极速过滤筛选**：支持“左、右、南、北”四个方向的侧门动态切换，筛选状态可随链接分享。
* **三档地图模式**：一楼、二楼、全图三档平滑切换，默认加载全图。
* **高精度地图缩放拖拽**：
  - **电脑端**：鼠标左键拖拽平移、滚轮以指针为中心缩放。
  - **移动端/iPad**：单指拖拽平移、双指捏合无级缩放。
  - **悬浮工具栏**：一键全屏与重置自适应。
* **PWA 离线可用**：访问过一次后，局内断网/弱网也能查看已浏览过的地图；支持添加到手机主屏。
* **字体自托管**：中文字体子集化后自托管（共约 0.5MB），无 Google Fonts 依赖，大陆访问无阻。

---

## 📂 项目目录结构

```text
idv-cryptic-map/
├── apps/web/                    # 前端应用（Vite + Vue 3 + TS）
│   ├── src/
│   │   ├── views/               # 目录页 / 攻略详情页
│   │   ├── components/          # 地图视口、楼层切换、方向筛选等组件
│   │   ├── composables/         # useZoomPan 缩放拖拽交互
│   │   ├── data/
│   │   │   ├── maps.json        # ★ 唯一数据源（地图元数据 + 房间坐标 + updatedAt）
│   │   │   └── maps.ts          # 数据访问层（逻辑名 → 构建哈希 URL）
│   │   ├── assets/maps/         # entry/floor1/floor2/full 各 28 张 webp
│   │   ├── assets/fonts/        # 子集化后的自托管字体
│   │   └── styles/              # 哥特风样式
│   ├── scripts/
│   │   ├── gen-thumbs.mjs       # 构建前自动生成目录页缩略图（sharp）
│   │   ├── subset-fonts.mjs     # 字体子集化（新增文案缺字时重跑）
│   │   ├── verify-e2e.mjs       # 34 项交互验收（Playwright 驱动本机 Chrome）
│   │   └── verify-pwa.mjs       # PWA 离线验收
│   └── public/                  # _headers 缓存策略 / 图标 / PWA 图标
├── maps/                        # 原始图片素材（仅作裁剪源，不参与部署）
├── crop_images.py               # 原图裁剪脚本（输出到 apps/web/src/assets/maps）
├── wrangler.jsonc               # Cloudflare Workers 部署配置
├── vercel.json                  # Vercel 部署配置（备用镜像）
├── .github/workflows/deploy.yml # CI：PR 预览 + main 自动部署
└── docs/                        # 项目文档（见下方「文档」一节）
```

---

## 📚 文档

完整文档见 [docs/](docs/README.md)：

* [架构总览](docs/ARCHITECTURE.md) — 技术栈、数据流、缓存与 PWA 机制
* [后台管理设计](docs/ADMIN-BACKEND.md) — Phase 2：KV/R2/Access 全动态方案（设计定稿，待实施）
* [运维手册](docs/OPERATIONS.md) — 地图更新、发布与回滚、上线待办
* [重构实施记录](docs/REFACTOR.md) — Phase 0–7 过程与验收（历史存档）

---

## 🗺️ 地图更新流程（更新即生效，无需手动版本号）

1. 新原图放入 `maps/`（一图流更新则替换 `maps/全地图一图流.png`）。
2. 仓库根目录运行 `python crop_images.py [地图名]`，自动裁剪输出到 `apps/web/src/assets/maps/`。
3. 新增地图时在 `apps/web/src/data/maps.json` 增加一条记录（含 `updatedAt` 更新）。
4. `git push` → GitHub Actions 自动测试、构建、部署。

构建产物均为内容哈希文件名 + 一年 immutable 缓存，HTML 保持 no-cache：**部署完成后用户普通刷新即可看到最新内容**，未变化的图片继续命中本地缓存。缺图 / 数据错误 / 字体缺字都会在 CI 测试阶段直接报错，不会带病上线。

---

## 🚀 部署

### Cloudflare Workers（主力）
1. GitHub 仓库 Settings → Secrets 配置 `CLOUDFLARE_API_TOKEN`（Workers 编辑权限）与 `CLOUDFLARE_ACCOUNT_ID`。
2. push `main` 即自动部署；PR 会上传预览版本（需在 Cloudflare Dashboard 打开该 Worker 的 **Preview URLs** 开关）。
3. 手动部署：`pnpm build && npx wrangler deploy`。

### Vercel（备用镜像）
导入 GitHub 仓库即可，构建配置已由 `vercel.json` 指定（含 Web Analytics 统计）。

---

## 💻 本地开发

```bash
pnpm install
pnpm dev        # 开发服务器（自动生成缩略图）
pnpm test       # Vitest：数据一致性 / 路由兼容 / 字体覆盖测试
pnpm build      # 类型检查 + 生产构建
pnpm preview    # 预览构建产物

# 端到端验收（需本机 Chrome；先起 dev 服务）
node apps/web/scripts/verify-e2e.mjs
```

---

## 声明与致谢
* 本项目所用地图原素材源自《第五人格》玩家社区攻略博主 [**凉哈皮**](https://space.bilibili.com/8618005) 的公开一图流攻略。
* 字体 Cinzel / Ma Shan Zheng / Noto Serif SC 均来自 [google/fonts](https://github.com/google/fonts)（OFL 协议），经子集化自托管。
* 地图版权归《第五人格》官方游戏所有。
