# Moss 文档索引

文档按“架构事实、接口契约、产品设计、运行手册、验证证据”分层。修改代码时只更新拥有该
事实的文档，其他文档通过链接引用。

| 文档 | 类型 | 何时更新 |
| --- | --- | --- |
| [architecture.md](architecture.md) | 架构基线 | 容器、模块边界、数据所有权或降级策略变化 |
| [api.md](api.md) | 接口契约 | HTTP、WebSocket、RPC、错误码或限额变化 |
| [detailed-design.md](detailed-design.md) | 产品详细设计 | 信息架构或核心工作流变化 |
| [memory-rag-design.md](memory-rag-design.md) | 领域设计 | 记忆模型、同步、召回或 Prompt 变化 |
| [memory-evaluation.md](memory-evaluation.md) | 评估协议 | 召回参数、数据集格式、指标或发布门槛变化 |
| [bilingual-conversation-design.md](bilingual-conversation-design.md) | 领域设计 | 语言识别、反馈或语音回合变化 |
| [ui-guidelines.md](ui-guidelines.md) | UI 规范 | 视觉 token、组件或响应式契约变化 |
| [development.md](development.md) | 开发手册 | 本地环境、前后端工作流、场景扩展、测试或排障变化 |
| [deployment.md](deployment.md) | 运行手册 | 环境变量、服务拓扑、发布或回滚变化 |
| [testing-report.md](testing-report.md) | 验证基线 | 自动化范围或完整验证结果变化 |

## 维护规则

- Mermaid 图描述边界、状态和数据流；不要用图重复逐字段协议。
- `README.md` 只负责快速开始和导航，不复制专题设计。
- `.env.example` 是变量名称和本地默认值的唯一清单。
- `docs/api.md` 是线上协议权威来源，服务 README 只补充运行时细节。
- 测试报告必须注明实际执行命令；性能数据要标记设备与环境，不记录维护日期。
- 尚未实现的能力进入 `plans/planned.md`、`plans/in-progress.md` 或
  `plans/blocked.md`，不能写成当前能力。
