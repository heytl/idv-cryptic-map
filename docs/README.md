# 项目文档索引

当前代码为 V3 升级，尚待发布；历史上线记录不代表当前代码已部署。新接手建议按「项目 README → 当前架构 → V3 升级 → V3 版本记录」阅读。

## 当前实现与发布准备

| 文档 | 内容 |
|---|---|
| [项目 README](../README.md) | 项目介绍、功能、使用、开发与日常维护 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | V3 分层、数据流与兼容边界 |
| [V3-UPGRADE.md](V3-UPGRADE.md) | 数据迁移、D1、部署、统计、备份和回滚 |
| [releases/V3.md](releases/V3.md) | 本轮版本变化、验证记录、发布前清单 |

## 历史资料

以下保留原始设计与当时上线事实，不能直接用作 V3 操作手册。

| 文档 | 历史用途 |
|---|---|
| [ADMIN-BACKEND.md](ADMIN-BACKEND.md) | Phase 2 KV/R2/Access 后台设计与上线过程 |
| [OPERATIONS.md](OPERATIONS.md) | V1/V2 运维流程；含已退役脚本与操作 |
| [MAP-V2.md](MAP-V2.md) | V2 多模式、多入口与公开协议设计 |
| [releases/V2.1.0.md](releases/V2.1.0.md) | 当时正式部署、数据指纹和回滚基线 |
| [REFACTOR.md](REFACTOR.md) | Vite 重构 Phase 0–7 历史记录 |

文档与代码同步维护；历史归档不改写成新版本说明。生产上线后，在当前版本记录补充实际提交、标签、Worker 版本、数据版本及验证结果，不预填上线成功状态。
