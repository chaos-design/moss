# 进行中

更新时间：2026-08-30

| ID | 优先级 | 任务 | 当前工作 | 验收 |
| --- | --- | --- | --- | --- |
| T-312 | P1 | 统一学习记忆写入层，并把词库表达学习接入长期记忆 | `recordLearningActivity` 统一对话、复习、跟读与表达学习；`learningActivityTypes` 成为事件类型与 `source_type` 的单一词表；词库新增“加入长期记忆”动作 | 表达学习写入条目与事件并可被 RAG 召回；SQL 两套入口均接受新 `source_type`；`pnpm check` 与 `pnpm build` 通过 |

## 流转规则

- 这里只保留已经开始且可以继续推进的任务。
- 外部依赖阻止继续实现时移动到 [`blocked.md`](blocked.md)。
- 完成实现和验收后移动到 [`archived.md`](archived.md)。
