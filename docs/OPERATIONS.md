# 运维手册

> 现行流程。后台管理与 V2 默认首页均已上线：日常「改图 / 换图 / 新增」直接在网页后台完成（[ADMIN-BACKEND.md](ADMIN-BACKEND.md)），§1 本地流程仅作应急备用；正式版本基线见 [V2.1.0 归档](releases/V2.1.0.md)。（2026-08-27 同步）

## 1. 地图更新流程

### 改图 / 换图

1. 新原图放入 `maps/`（一图流更新则替换 `maps/全地图一图流.png`）。
2. 仓库根目录运行 `python crop_images.py [地图名]`，裁剪输出到 `apps/web/src/assets/maps/`。
3. `pnpm test` 通过后提交 push → CI 自动测试、构建、部署。

### 新增地图 checklist

- [ ] 四张图入 `assets/maps/{entry,floor1,floor2,full}/<逻辑名>.webp`（缩略图不用管，构建自动生成）
- [ ] `src/data/maps.json` 增加记录：`id` 取 max+1 且**永不复用**；「（新）」等后缀只写 `displayName`，`name` 保持与文件名一致
- [ ] 更新根级 `updatedAt`（页脚展示）
- [ ] `pnpm test`——缺图、数据错误、**地图名出现子集字体没有的新字**都会在这里红；缺字则先跑 `node apps/web/scripts/subset-fonts.mjs` 再测
- [ ] push 后在 PR 预览 URL 上抽查新地图

**不需要做的事**：不需要任何 `?v=` 版本号；不需要通知用户清缓存——部署完成后普通刷新即生效。

## 2. 分支与发布

长期分支职责（2026-08-23 确认）：

| 分支 | 用途 | 发布渠道 |
|------|------|---------|
| feat/admin-backend | **动态版生产**：Worker + 后台 + V2 数据，`idv-map.321666.xyz` | push 即 test + build + `wrangler deploy` |
| main | 纯静态页面版本，可读取正式公开 V2 接口 | 独立静态发布渠道；不触发 Worker 部署 |
| dev / 功能分支 | 日常开发 | PR 时：test + build + 上传 Workers 预览版本（预览 URL 见 CI 日志） |

- 功能分支合入 `feat/admin-backend` 前，在预览 URL 用手机真机过一遍核心交互（缩放拖拽最易回归）。
- Vercel 镜像跟随仓库自动构建，无需额外操作。

明确约束：`feat/admin-backend` 不合并到 `main`。`main` 长期保留为静态页面发布分支，仅通过 `VITE_MAP_API_BASE_URL` 读取正式环境的公开 V2 接口。

## 3. 缓存速查

| 资源 | 策略 | 更新方式 |
|------|------|---------|
| HTML / sw.js / manifest | no-cache 回源验证 | 部署即新 |
| `/assets/*`（哈希产物） | 一年 immutable | 内容变 → 文件名变 → 自动拉新 |

改一张图重新构建：仅该图 + 其缩略图 + index.js 哈希变化，其余 130+ 产物文件名不变（增量缓存友好）。

## 4. 验证命令

```bash
pnpm test                              # 单测 15 项（数据/路由兼容/字体覆盖）
pnpm build && npx wrangler dev         # 本地起 Workers 形态，curl -I 验证缓存头
node apps/web/scripts/verify-e2e.mjs   # E2E 31 项（需本机 Chrome + dev 服务）
node apps/web/scripts/verify-pwa.mjs   # PWA 离线 5 项
```

## 5. 回滚手册

按影响面从小到大：

1. **代码问题**：`git revert` 问题提交 → push `feat/admin-backend` 重新部署（几分钟）。
2. **急停**：`pnpm exec wrangler rollback --message "Rollback production Worker" --yes` 回退 Worker 上一版本（不动 git、KV 或 R2）。
3. **指定稳定基线**：`pnpm exec wrangler rollback 2a13463a-9a42-45cf-9ba6-1c2b12f1d50d --message "Rollback to V2.1.0 baseline" --yes`。
4. **退回 V1 默认首页**：`pnpm exec wrangler rollback 8b4a7767-12dd-42ba-869b-f6194c03b635 --message "Emergency rollback to pre-V2" --yes`。
5. **Service Worker 故障**（缓存坏死难恢复）：vite-plugin-pwa 开 `selfDestroying: true` 发一版自毁 SW，全体用户退回纯在线模式，修复后再关掉。
6. **切换期兜底**：旧 Cloudflare Pages 项目继续保留，必要时可把域名指回旧站；项目只允许 `main` 构建。

生产使用顶层 Wrangler 配置，回滚命令不要添加 `--env v2-preview`。数据问题和代码问题分开处理：Worker 回滚不会改数据；只有确认 `config:v2:current` 损坏时，才从 `backups-v2/` 恢复。

## 6. 当前正式基线

2026-08-27 归档状态：

- Git 功能基线：`v2.1.0` / `16e9c64`。
- 当前流量 Worker：`2acc1622-b305-4001-b446-b18f4102da49`，100%。
- V2 稳定回滚 Worker：`2a13463a-9a42-45cf-9ba6-1c2b12f1d50d`。
- 正式 V2：v23，41 张有效地图；困难 28，噩梦 13。
- 正式 V1：v8，28 张地图，继续保留。
- 正式 V2 基线备份：`backups-v2/snapshot-v23.json`，规范化 SHA-256 为 `812f43db99e81bd652dc66b782966116e7eb50099001966acb74380fe368c62b`。

完整的数据指纹、备份位置和路由清单见 [V2.1.0 正式版本归档](releases/V2.1.0.md)。

## 7. 上线待办（一次性手动步骤）

- [x] GitHub repo Secrets：`CLOUDFLARE_API_TOKEN`（Workers 编辑权限）、`CLOUDFLARE_ACCOUNT_ID`（2026-07-19 配置验证，自动部署多次成功）
- [x] Cloudflare Dashboard：Worker 绑定正式域名 `idv-map.321666.xyz`（2026-07-21）；`new-map.321666.xyz` 暂留回退入口
- [ ] PR 预览依赖的 Workers **Preview URLs** 开关：如遇 CI 预览 URL 打不开，到 Dashboard 检查
- [ ] 旧站清理（2026-08-22 建议）：
  - **删** 本分支 `site/` 目录——26MB、新构建零引用，纯仓库死重；旧版在 main 有完整副本，git 历史亦永存，删之无损；
  - **留** 旧 Cloudflare Pages 项目——✅ 2026-08-28 已确认生产分支为 `main`，并关闭所有 Preview 分支自动构建；`feat/admin-backend` 不再触发 Pages 红叉；
  - **留** Vercel 项目——注意它若跟随 main 构建则镜像的是旧站（main 的 vercel.json 输出 `site/`），若已切到本分支则是新版静态壳（数据滞后 ≤1 天的降级链路）。两种身份都无持有成本，等旧版退役时一并处理。
- [x] 端到端演练「更新即生效」：已由后台路径覆盖（2026-07-18 Phase 2 端到端验收通过）

后台管理（Phase 2）遗留事项的清账记录见 [ADMIN-BACKEND.md §13.4](ADMIN-BACKEND.md)。

## 8. 已知事项

- `maps/` 目录（79MB，含 48MB 一图流源图）只做裁图来源，不参与部署。
- 旧站时代的 88 张废弃 jpg/png 已不进产物（`import.meta.glob` 只打包被引用资源）。
- 极少数移动浏览器（如 Via）曾出现无视 no-cache 死抱旧资源的问题——新架构下 HTML 是唯一非哈希入口，该风险窗口已收敛到最小；若有残余用户反馈图裂，引导其清一次浏览器缓存即可。
- 2026-08-28 已修复每日快照：只读取正式 V2；中文 GitHub Base64 使用 UTF-8 解码；内容相同不提交；提交带 `[skip ci]`；同一 V2 dataVersion 不重复写 R2。V1 数据与历史备份仍保留，但不再进入每日任务。

## 9. 每日 V2 备份检查

- 执行时间：每天 04:00 UTC（北京时间 12:00）。
- 正式数据源：仅 `config:v2:current`；任务名应为 `V2 地图配置快照 v<版本>`，不再出现 V1 的 v8。
- R2：`backups-v2/snapshot-v<版本>.json`，同版本只存在一份定时基线；后台保存产生的时间戳备份继续保留。
- Git：`apps/web/src/data/maps-v2.snapshot.json`，只有内容变化才提交，且 `[skip ci]` 不触发重复部署。
- V1：`config:current`、`backups/`、`maps.snapshot.json` 和图片只保留，不再每日备份，也不删除。
