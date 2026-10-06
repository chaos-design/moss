# 进行中

更新时间：2026-10-06

| ID | 优先级 | 任务 | 当前工作 | 验收 |
| --- | --- | --- | --- | --- |
| T-312 | P1 | 统一学习记忆写入层，并把词库表达学习接入长期记忆 | `recordLearningActivity` 以穷尽式 `switch` 统一对话、复习、跟读、表达学习与回想尝试；`learningActivityTypes` 成为事件类型与 `source_type` 的单一词表；词库新增“加入长期记忆”动作；对话回合以 `turnId` 为主键，重试改写而删除按事件增量回滚 | 表达学习写入条目与事件并可被 RAG 召回；SQL 两套入口均接受新 `source_type`；回想尝试与自评分离记录；重试不重复计数、删除不留残余进度；`pnpm check` 与 `pnpm build` 通过 |
| T-313 | P1 | 用共享认证状态词表描述账户状态，并修复设置页对话体验网格重叠 | 新增 `AuthProvider` 与 React-free 的 `lib/auth-status` 五态词表（loading/authenticated/anonymous/unconfigured/demo）；云端操作经 `requireSignIn` 门控，本机写入不被阻止、仅在提示中说明未同步原因；设置页“对话体验”五张卡片在 `lg` 下各占独立网格单元：Prompt 通栏首行，布局+判句、输入+发音两两成对 | `pnpm check` 与 `pnpm build` 通过；桌面 1440px 与 390px 截图无重叠、无横向溢出；布局测试固定各卡片的行列位置 |

## 流转规则

- 这里只保留已经开始且可以继续推进的任务。
- 外部依赖阻止继续实现时移动到 [`blocked.md`](blocked.md)。
- 完成实现和验收后移动到 [`archived.md`](archived.md)。
