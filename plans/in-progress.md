# 进行中

更新时间：2026-10-11

| ID | 优先级 | 任务 | 当前工作 | 验收 |
| --- | --- | --- | --- | --- |
| T-319 | P2 | 修复窄视口下吸顶工作区头部溢出，并把分析页"下一步行动"卡片接入主题色 | 380px 以下隐藏工作区头部品牌文字列、仅保留 M 标记，让右侧五个操作按钮在 320px 视口内不溢出；分析页"NEXT BEST ACTION"卡片从 `bg-foreground/text-background` 反色卡片改为 `bg-accent` 底 + `border-primary/20` + `text-accent-foreground`，行动按钮改用主色按钮变体 | `pnpm check` 与 `pnpm build` 通过；320px 全工作区页面 scrollW=320 无横向溢出、390px 品牌完整可见；横幅浅色/深色计算色与 CTA 主色断言固定 |
| T-312 | P1 | 统一学习记忆写入层，并把词库表达学习接入长期记忆 | `recordLearningActivity` 以穷尽式 `switch` 统一对话、复习、跟读、表达学习与回想尝试；`learningActivityTypes` 成为事件类型与 `source_type` 的单一词表；词库新增“加入长期记忆”动作；对话回合以 `turnId` 为主键，重试改写而删除按事件增量回滚 | 表达学习写入条目与事件并可被 RAG 召回；SQL 两套入口均接受新 `source_type`；回想尝试与自评分离记录；重试不重复计数、删除不留残余进度；`pnpm check` 与 `pnpm build` 通过 |
| T-313 | P1 | 用共享认证状态词表描述账户状态，并修复设置页对话体验网格重叠 | 新增 `AuthProvider` 与 React-free 的 `lib/auth-status` 五态词表（loading/authenticated/anonymous/unconfigured/demo）；云端操作经 `requireSignIn` 门控，本机写入不被阻止、仅在提示中说明未同步原因；设置页“对话体验”在 `lg` 下 Prompt 通栏首行、对话方式与系统发音并列第二行、会话与判句通栏第三行 | `pnpm check` 与 `pnpm build` 通过；桌面 1440px 与 390px 截图无重叠、无横向溢出；布局测试固定各卡片的行列位置 |
| T-318 | P1 | 影子跟读进度跟随转写、侧栏按角色显示评分 | 仅在中栏跟读转写区将正在播放/录制的台词滚回可视区，已可见不强制滚动；评分从转写底部移到右侧「本轮反馈」，自动推进后保留当前场景与扮演角色最近一次已完成录音并注明原句；相同三项声学测量按角色调整综合权重、展示顺序和建议，不改学习记忆/SQL 契约 | 评分与下一目标不串句、换角色不串分、只滚动中栏；`pnpm check` 和 `pnpm build` 通过；桌面与 390px 视觉验收待浏览器环境 |
| T-317 | P2 | 影子跟读支持长按空格录音，并让对话 Prompt 编辑区完整展示 | 新增 `use-hold-to-record-shortcut`，仅在跟读阶段生效、文本框与按钮焦点下不触发、忽略 keydown 重复、window blur 与 visibilitychange 兜底停止；录音按钮旁加 `kbd` 提示；Prompt 卡片去掉高度上限与卡内滚动，textarea 自身保持固定高度 | `pnpm check` 与 `pnpm build` 通过；快捷键 10 个用例覆盖按下/抬起/重复/失焦/禁用/IME；空格长按手感与系统级快捷键冲突需浏览器人工确认 |
| T-316 | P1 | 修复对话路由骨架屏边距，把对话 Prompt 完全交给学习者控制，并消除设置页的输入延迟放大 | 新增 `app/workspace/conversation/loading.tsx` 自持 inset；`conversationPrompt` 整段可编辑（含输出契约，上限 12000），偏好升级到版本 6 并提供 v4/v5 两级迁移；`parseProviderConversation` 返回 `contractApplied`，转写据此标注该轮并指向设置页，设置页对缺失契约只警告不拦截；「对话体验」改为 Prompt 通栏首行、对话方式与系统发音并列、会话与判句通栏第三行；Prompt 编辑器与判句字段拆为 memo 组件并把草稿留在组件内部 | `pnpm check` 与 `pnpm build` 通过；渲染隔离断言固定「编辑控件不重渲染无关卡片」；桌面 1440px 与 390px 视觉核对待补；真实 INP/LCP/CLS 需浏览器环境，本次未采集 |
| T-315 | P1 | 登录与注册前要求显式同意服务条款与隐私政策 | 登录表单新增同意勾选（复选框，Base UI Checkbox），未勾选时登录、创建账户与 Google 登录按钮均禁用；底部“继续即表示你同意”的隐含同意文案改为指向勾选框；法律文档链接保留在勾选文案内且不触发勾选 | 勾选前按钮 disabled、勾选后可用（登录/注册/Google 均覆盖）；`pnpm check` 与 `pnpm build` 通过 |

## 流转规则

- 这里只保留已经开始且可以继续推进的任务。
- 外部依赖阻止继续实现时移动到 [`blocked.md`](blocked.md)。
- 完成实现和验收后移动到 [`archived.md`](archived.md)。
