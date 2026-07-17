# 运维手册

> 现行流程（静态架构版）。后台管理（[ADMIN-BACKEND.md](ADMIN-BACKEND.md)）上线后，「地图更新」一节将被网页后台操作取代，其余仍适用。

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

| 分支 | 用途 | CI 行为 |
|------|------|---------|
| dev / 功能分支 | 日常开发 | PR 时：test + build + 上传 Workers 预览版本（预览 URL 见 CI 日志） |
| main | 生产 | push 即 `wrangler deploy` 上线 |

- 合并前在预览 URL 用手机真机过一遍核心交互（缩放拖拽最易回归）。
- Vercel 镜像跟随仓库自动构建，无需额外操作。

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

1. **代码问题**：`git revert` 问题提交 → push main 重新部署（几分钟）。
2. **急停**：`npx wrangler rollback` 直接回退 Worker 上一版本（不动 git）。
3. **Service Worker 故障**（缓存坏死难恢复）：vite-plugin-pwa 开 `selfDestroying: true` 发一版自毁 SW，全体用户退回纯在线模式，修复后再关掉。
4. **切换期兜底**：旧 Cloudflare Pages 项目在观察期内保留，可把域名指回旧站。

## 6. 上线待办（一次性手动步骤）

- [ ] GitHub repo Secrets：`CLOUDFLARE_API_TOKEN`（Workers 编辑权限）、`CLOUDFLARE_ACCOUNT_ID`
- [ ] Cloudflare Dashboard：Worker `idv-cryptic-map` 绑定正式域名；打开 **Preview URLs** 开关（PR 预览依赖）
- [ ] Vercel：确认 `vercel.json` 新构建配置生效、Analytics 正常
- [ ] 生产切换验证通过后：删除 `site/` 旧目录；旧 Pages 项目观察一段时间后下线
- [ ] 端到端演练一次「更新即生效」：改一张图 → push → 部署后普通刷新即见新图

后台管理（Phase 2）相关的待办清单单独维护在 [ADMIN-BACKEND.md §13.4](ADMIN-BACKEND.md#134-尚待验收--待办)，含 Cron secrets、CI secrets、分支合并、后台端到端验收等，此处不重复。

## 7. 已知事项

- `maps/` 目录（79MB，含 48MB 一图流源图）只做裁图来源，不参与部署。
- 旧站时代的 88 张废弃 jpg/png 已不进产物（`import.meta.glob` 只打包被引用资源）。
- 极少数移动浏览器（如 Via）曾出现无视 no-cache 死抱旧资源的问题——新架构下 HTML 是唯一非哈希入口，该风险窗口已收敛到最小；若有残余用户反馈图裂，引导其清一次浏览器缓存即可。
