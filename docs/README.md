# 项目文档索引

| 文档 | 内容 | 状态 |
|------|------|------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 当前架构总览：技术栈、目录结构、数据流、缓存与 PWA 机制、部署拓扑 | ✅ 反映当前实现 |
| [ADMIN-BACKEND.md](ADMIN-BACKEND.md) | Phase 2 后台管理系统设计：KV/R2/Access、数据模型、API、裁剪工作台、备份降级 | 📐 设计定稿，待实施 |
| [OPERATIONS.md](OPERATIONS.md) | 运维手册：地图更新流程、发布与回滚、缓存速查、上线待办 | ✅ 现行流程 |
| [REFACTOR.md](REFACTOR.md) | Vite 重构（Phase 0–7）实施文档与验收记录 | 📜 历史存档 |

**阅读顺序建议**：新接手先读 ARCHITECTURE → OPERATIONS；参与后台开发读 ADMIN-BACKEND；追溯重构决策与验收细节读 REFACTOR。

文档维护约定：架构或流程变更时同步更新对应文档（与代码同一 PR）；REFACTOR.md 只增补记录、不改写历史。
