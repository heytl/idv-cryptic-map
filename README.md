# 第五人格加页手记 | 多模式地图攻略手册 🧭

这是一个针对《第五人格》“加页手记”模式开发的网页版互动地图攻略手册。正式 V2 支持困难、噩梦两种模式以及侧门、正门、二楼门入口；噩梦地图额外提供地下室。玩家可按入口、方向或正门通道类型筛选地图，并查看全图及分层高清攻略图。

技术栈：**Vite + Vue 3 + TypeScript**，主力部署 **Cloudflare Workers**（静态资源），Vercel 备用镜像。

---

## 🎨 视觉与交互特色

* **庄园暗黑哥特风**：复古羊皮纸纹理卡片、缝线饰边、金属感推拉拉杆、纽扣造型按钮，提灯微光背景氛围感十足。
* **多级快速筛选**：支持模式、入口、方向或正门通道类型切换，筛选状态可随链接分享。
* **多楼层地图**：全图始终默认并排在第一；困难显示一楼、二楼，噩梦额外显示地下室。
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
│   │   │   ├── maps.json        # ★ 构建期快照（兜底数据源；线上真源为 KV，见 docs/ADMIN-BACKEND.md）
│   │   │   ├── maps-v2.ts       # V2 公开数据访问与筛选逻辑
│   │   │   └── maps.ts          # V1 兼容数据访问层
│   │   ├── assets/maps/         # entry/floor1/floor2/full 各 28 张 webp
│   │   ├── assets/fonts/        # 子集化后的自托管字体
│   │   └── styles/              # 哥特风样式
│   ├── scripts/
│   │   ├── gen-thumbs.mjs       # 构建前自动生成目录页缩略图（sharp）
│   │   ├── subset-fonts.mjs     # 字体子集化（新增文案缺字时重跑）
│   │   ├── verify-e2e.mjs       # 31 项交互验收（Playwright 驱动本机 Chrome）
│   │   └── verify-pwa.mjs       # PWA 离线验收
│   └── public/                  # _headers 缓存策略 / 图标 / PWA 图标
├── apps/admin/                  # Cloudflare Access 保护的地图后台
├── packages/shared/             # V1/V2 共享类型、校验与公开序列化
├── workers/                     # Worker 公开接口、后台 API、KV/R2 与快照任务
├── maps/                        # 原始图片素材（仅作裁剪源，不参与部署）
├── crop_images.py               # 原图裁剪脚本（输出到 apps/web/src/assets/maps）
├── wrangler.jsonc               # Cloudflare Workers 部署配置
├── vercel.json                  # Vercel 部署配置（备用镜像）
├── .github/workflows/deploy.yml # CI：PR 预览 + 生产分支自动部署
└── docs/                        # 项目文档（见下方「文档」一节）
```

---

## 📚 文档

完整文档见 [docs/](docs/README.md)：

* [架构总览](docs/ARCHITECTURE.md) — 技术栈、数据流、缓存与 PWA 机制
* [后台管理设计](docs/ADMIN-BACKEND.md) — Phase 2：KV/R2/Access 全动态方案（已上线）
* [运维手册](docs/OPERATIONS.md) — 地图更新、发布与回滚、上线待办
* [V2.1.0 正式归档](docs/releases/V2.1.0.md) — 版本、数据指纹、备份位置和回滚基线
* [重构实施记录](docs/REFACTOR.md) — Phase 0–7 过程与验收（历史存档）

---

## 🗺️ 地图更新流程（更新即生效，无需重新部署）

1. 登录 `https://idv-map.321666.xyz/admin/`。
2. 在 V2 工作区选择困难或噩梦模式，新增或编辑地图。
3. 从全图裁剪楼层图和入口图，检查完整度后保存、发布。
4. 正式 KV 保存成功后，前台刷新即可读取新 dataVersion；不需要提交代码或重新部署。

`maps/`、`crop_images.py` 和静态 JSON 流程仅作为应急备用。正式发布校验由后台和 Worker 共同执行，缺少必要楼层或入口图的地图不能发布。

---

## 🚀 部署

### Cloudflare Workers（主力）
1. GitHub 仓库 Settings → Secrets 配置 `CLOUDFLARE_API_TOKEN`（Workers 编辑权限）与 `CLOUDFLARE_ACCOUNT_ID`。
2. push `feat/admin-backend` 自动测试、构建并部署正式动态 Worker；`main` 只用于独立静态页面版本，不触发本 Worker 部署。
3. 手动部署正式环境：`pnpm build && pnpm exec wrangler deploy`；部署测试环境必须显式使用 `--env v2-preview`。

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
