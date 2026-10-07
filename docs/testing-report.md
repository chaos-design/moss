# 测试与验证报告

> 基线命令：`pnpm check`、`pnpm build`

## 自动化门禁

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#E8F3F1","primaryTextColor":"#123F35","primaryBorderColor":"#258A72","lineColor":"#686860","secondaryColor":"#FFF3E8","tertiaryColor":"#EEF2FF"}}}%%
flowchart LR
    Change[代码或契约变更] --> Lint[Biome]
    Lint --> Types[TypeScript]
    Types --> Frontend[Vitest]
    Frontend --> TTS[Python TTS tests]
    TTS --> ASR[Python ASR tests]
    ASR --> Database[Database contract tests]
    Database --> Build[Next.js build]
```

| 门禁 | 范围 | 当前结果 |
| --- | --- | --- |
| `pnpm lint` | TypeScript、Python 周边配置、Markdown 与格式 | 通过 |
| `pnpm typecheck` | Next.js/React 严格类型 | 通过 |
| `pnpm --dir frontend test` | 领域逻辑、route、hook、组件 | 72 文件，444 测试通过 |
| `pnpm tts:test` | gateway、Audio8、CosyVoice | 15 测试通过 |
| `pnpm asr:test` | 配置、PCM、VAD、WebSocket、安全边界 | 35 测试通过 |
| `pnpm db:test` | SQL、RLS、记忆 RPC、共享限流、删除审计与 embedding 回填契约 | 14 测试通过 |
| `pnpm memory:test` | 评估集校验、召回排序、参数网格和学习指标 | 6 测试通过 |
| `pnpm test:coverage` | 核心学习算法 | 语句/函数/行 100%，分支 94.73% |
| `pnpm build` | Next.js 路由、打包和服务端边界 | 通过 |

## 重点覆盖

| 领域 | 覆盖行为 |
| --- | --- |
| 认证与配置 | Supabase 配置、OAuth 安全跳转、demo 模式、多模型配置切换与迁移、加密模型信封、模型端点出口限制 |
| 对话 | 状态机、transport、本地优先的跨设备会话同步与完成、双语意图、结构化反馈、打断、连续问题合并、迟到响应丢弃 |
| 学习记忆 | 本地解析、迁移、间隔重复、冲突合并、Realtime 协调、RAG 降级、向量写入、召回评估指标 |
| API 边界 | 输入长度、认证、按用户共享限流、匿名容量有界限流、provider 错误脱敏、推理 token 预算 |
| 语音 | ASR 地址与引擎、PCM 编码、静默切段、TTS 缓存、取消和系统语音降级、三种接入方式、识别回退与代理端点策略 |
| 错误文案 | `user-error` 归一化规则、状态码映射、中断与失败区分、网络与解析失败不落本机存储 |
| UI | 公共首页、登录、对话反馈、语音会话、学习记忆 Provider、提醒、句子列表、账户数据控制 |

核心学习算法覆盖率门槛为 statements、branches、functions、lines 均不低于 80%。覆盖率
命令是 `pnpm test:coverage`，不属于默认 `pnpm check`，发布候选版本需单独执行。

`tests/hold-to-record-shortcut.test.tsx`（10 个用例）覆盖长按录音的按下/抬起配对、keydown
重复抑制、非本快捷键的 keyup、失焦与标签页隐藏兜底停止、文本框与按钮焦点下不触发、禁用态、
非 Space 键与 IME 组合态。

`tests/conversation-prompt-ownership.test.ts` 覆盖整段 Prompt 的偏好解析、v4 补充指令与 v5
指令段两级迁移、学习者占位符解析与未知占位符中和、传输长度上限，以及“学习者文本原样发送
（含输出契约）”。`tests/settings-form.test.tsx` 覆盖可编辑全文、删除输出契约时给出警告而非
拦截、恢复内置，以及“编辑某个控件不会重渲染无关卡片”的渲染隔离断言。
`tests/conversation-workspace.test.tsx` 与 `tests/voice-conversation.test.tsx` 覆盖
`contractApplied: false` 时转写标注该轮并指向设置页。`tests/workspace-loading.test.tsx` 覆盖
对话路由占位层的内边距。

## 性能与交互延迟

2026-10-07 本机为 Apple Silicon macOS、Node 22、无浏览器环境，因此**未采集真实 INP、LCP
或 CLS**：这三项需要 Chrome DevTools 或 field data，本环境两者都不具备，任何数值都会是编造。
已确认的可测量结果与结构保证如下：

- `pnpm build` 产物中 `frontend/.next/static/chunks` 共 57 个客户端 chunk，合计 956.3 KB
  gzip（含全部路由，非单路由首屏）。系统 Prompt 内置文本 4560 字符，约 1.5 KB gzip，随设置页
  客户端 chunk 下发，相对总量可忽略。
- 设置页「对话体验」原本把 Prompt 编辑器、三个数值输入和模型配置表单放在同一个
  `SettingsForm` 内，受控输入每次按键都会重渲染整页全部卡片与 Base UI Select。现在
  `ConversationPromptEditor` 与 `ConversationTimingFields` 为 `memo` 组件、草稿保存在组件内部，
  只有失焦或点保存才写共享 store。
- `tests/settings-form.test.tsx` 的渲染计数断言固定了这条约束：连续三次按键修改 Prompt 与
  会话续接时限时，被桩替换的无关卡片渲染次数保持不变。该断言防止回归，但不等于 INP 实测值。

INP 达标仍需在真实浏览器执行：在桌面与移动视口下用 DevTools Performance 面板测量
LCP/INP/CLS，或接入 field data 后观察 p75 INP ≤ 200ms。此项**未在本次验证**，不能视为通过。

## 视觉验证

2026-08-28 使用 Chrome 验证桌面 `1440 x 1000` 与移动 `390 x 844`。移动端覆盖公共首页、
登录、场景库、对话、影子跟读和设置页。公共首页已验证场景自动轮播、缩略预览、无分页器
以及六项学习能力展示；设置页已验证模型列表与编辑态互斥、绿色启用态、多行学习目标、
模型服务/学习 Agent/对话体验三级分类、可配置会话时限和 390px 无横向溢出。相关页面
未发现横向溢出或内容遮挡。对话页同时验证
了桌面键盘焦点顺序及 390px 转写与输入区宽度。对话提示 Sheet、输入控制和错误反馈不得
产生横向溢出。全局搜索已验证桌面结果分组、输入聚焦，以及 390px 弹窗滚动与关闭入口。
场景图片使用项目内静态资源。视觉变更必须按
[界面规范](ui-guidelines.md) 重新验证。

2026-08-29 复核场景库：桌面会话和 `390 x 844` demo 视口均按学习记忆显示掌握数；锁定
场景不生成链接，移动端 `scrollWidth` 为 390，无横向溢出。

2026-10-04 对比验证对话输入区禁用表达：修复前发送按钮因草稿为空而 `disabled`，触发
`InputGroup` 原语的 `has-disabled:opacity-50`，导致输入框与语音按钮整体降到 50% 不透明度
并被染色，视觉上与不可点击一致；修复后仅发送按钮保留禁用表达。使用 Chrome DevTools
Protocol 在 `390 x 844` 下量测，`clientWidth` 与 `scrollWidth` 均为 390，超宽元素为 0。
`tailwind-merge` 已确认 `has-disabled:opacity-100` 会移除原语中的 `has-disabled:opacity-50`，
覆盖不依赖 CSS 生成顺序。截图确认 390px 下顶栏、场景标题、统计条与输入区控件完整可见。

2026-08-29 验证提醒与句子列表：桌面端使用当前学习记忆完整显示 8 条记录和 5 条到期
提醒；`390 x 844` demo 视口验证空状态、类型筛选和提醒 Popover，页面
`scrollWidth/clientWidth` 为 `390/390`，浮层边界未超出视口。

2026-08-29 验证账户数据控制：桌面端确认导出、删除入口及邮箱确认 Dialog 的焦点和禁用
状态；`390 x 844` demo 视口确认账户区按行堆叠，云端操作正确禁用且
`scrollWidth/clientWidth` 为 `390/390`。未在真实账户执行删除。

2026-08-29 验证设置页模型配置与对话体验布局：桌面保存配置行展示验证、启停和删除操作，
对话布局与输入方式位于左列，会话与判句位于右列且两列底部误差约 5px；`390 x 844` demo
视口按对话布局、会话与判句、输入方式排列，截图未见横向裁切。真实模型验证未在浏览器中
触发，成功与失败结果由组件测试覆盖。

2026-08-29 验证对话与设置修正：账户卡片限制为半宽，侧栏外层承载滚动；`390 x 844`
demo 视口的设置与对话页
`scrollWidth/clientWidth` 均为 `390/390`。对话顶部新话题、历史、设置和提示入口均可用，
设置与历史浮层可打开；A2 等级徽标为 `26 x 16px` 并使用成功色。TTS/ASR 隔离和历史删除
确认由组件测试覆盖，未在浏览器中采集真实麦克风音频。

2026-08-29 复核设置与复习布局：设置页更名为“学习配置”，模型服务与学习策略在桌面端
使用等宽双列，学习策略位于左侧且字段纵向排列，所有设置卡片统一占一行的一半；
`390 x 844` demo 视口
`scrollWidth/clientWidth` 为 `390/390`。设置入口使用齿轮图标，侧栏底部显示真实平均
记忆强度。复习队列从 `lg` 断点开始固定在当前卡片右侧，并通过组件测试验证可折叠窄轨和
本地偏好持久化；当前登录数据没有到期复习项，因此未生成真实队列的浏览器截图。

2026-08-29 验证模型名称控件：移除浏览器原生 `datalist`，使用主题化常用模型菜单；
桌面浏览器确认菜单与输入框对齐、选项完整，自由输入和建议选择由组件测试覆盖。

2026-08-30 验证场景化工作区：场景库扩充到 100 个，99 个可用场景均生成至少 4 句、
同时包含学习者和对话角色的影子跟读脚本；重点场景使用 6 句专用脚本。桌面 `1244 x 912`
验证影子跟读与智能复习均使用左队列、中任务、右辅助信息三栏，影子跟读实际列宽为
`220px / 592px / 260px`。全局搜索显示快捷键和页面、场景、记忆横向 Tabs，结果区
`clientHeight/scrollHeight` 为 `578/6715`，可独立滚动；句子分类滚动后固定在顶栏下
`64px`。`390 x 844` demo 视口验证影子跟读、智能复习、设置和句子列表的
`scrollWidth/clientWidth` 均为 `390/390`。本轮 `pnpm check` 的 55 个前端测试文件、
343 项测试以及 `pnpm build` 均通过。

2026-08-29 验证推理回复与语音回声修复：推理模型耗尽初始 token 预算且正文为空时，
服务端以有界预算重试；TTS 播放前关闭 ASR 连接，并保留延迟回声过滤。用户在当前环境
完成真实语音通话复验，确认 AI 回复可见且播报未被重新提交为用户输入。清理调试观测后，
`pnpm check`、301 项前端测试和 `pnpm build` 均通过。

2026-08-29 补充浏览器验证：Chromium 在 `390 x 844` 与 `1440 x 1000` 加载公共首页，
两种视口的 `scrollWidth/clientWidth` 分别为 `390/390` 和 `1440/1440`，已加载图片无失败，
当前页面加载无控制台错误。自动化环境的 Firefox 与 WebKit 运行时不可用，因此未将
`browserType` 参数仍复用 Chromium 的结果计入跨浏览器验收。

2026-08-29 验证历史会话切换与侧栏滚动：切换历史记录时，当前未完结会话先转为完成，
目标记录成为当前场景唯一活动会话，刷新后仍恢复目标记录。文字续聊会将完整历史消息
连同新问题发送；语音续聊直接开始监听，不重复播放场景开场，并沿用历史累计时长。历史
Sheet 在 `1440 x 1000` 与 `390 x 844` 下高度均严格限制在动态视口内，列表区域使用独立
纵向滚动；两种视口的 `scrollWidth/clientWidth` 分别为 `1440/1440` 和 `390/390`。

2026-08-29 验证语音静默上限：连续 3 次静默提醒后仍未收到有效回应，下一次静默超时会
自动结束通话、停止媒体轨道并恢复文字输入；自动化测试直接绑定运行时上限，避免提示数量
与挂断阈值发生漂移。

2026-08-29 验证对话生命周期竞态：用户在麦克风授权返回前结束通话时，迟到的媒体流会立即
停止且不会启动识别；通话中删除当前历史记录不会被结束流程重新写回；用户已输入草稿或
启动语音后，迟到的云端历史仍合并到列表，但不会替换当前会话状态。相关回归测试已纳入
307 项前端测试，`pnpm check` 与 `pnpm build` 均通过。

2026-08-29 验证按记忆项交接：在 demo 对话中通过可见 UI 生成
`expression-coffee-1` 后，首页入口跳转到带 `memory` 参数的指定复习项；跟读队列首项
使用同一记忆生成可朗读句子，应用入口继续携带该 ID，目标记忆在本地与向量召回合并后保持
首位。桌面 `1440 x 1000` 与移动 `390 x 844` 的复习、跟读页面均无横向溢出，
`scrollWidth/clientWidth` 分别为 `1440/1440` 和 `390/390`。本次未启动本地 ASR/TTS
sidecar，相关 CORS/503 属预期降级；`pnpm check`、314 项前端测试和 `pnpm build` 通过。

2026-08-29 验证学习分析周期：桌面端切换“最近 7 天”“最近 30 天”和“本阶段”后，周期说明、
能力指标、每日活动和薄弱点使用同一事件集合；无对应事件的百分比显示“暂无数据”。移动
`390 x 844` 与桌面 `1440 x 1000` 的 `scrollWidth/clientWidth` 分别为 `390/390` 和
`1440/1440`。事件写入与跨设备合并不再静默截断 120 条，锁定场景不参与等级完成分母。
`pnpm check`、324 项前端测试和 `pnpm build` 均通过。

2026-08-30 验证导师模式：对话设置可在自然交流、温和纠错和沉浸英语之间切换，刷新后
仍恢复设备偏好。浏览器在沉浸英语模式完成真实演示回合，主回复、记忆提示、纠错说明和
例句内容均未混入中文，英文记忆提示显示为“学习辅助”，按需翻译入口保留。桌面
`1440 x 1000` 与移动 `390 x 844` 的 `scrollWidth/clientWidth` 分别为 `1440/1440` 和
`390/390`，设置浮层未越界。`5588` 演示实例未启动本地 ASR/TTS sidecar，其健康检查
CORS/503 属预期降级。`pnpm check`、331 项前端测试和 `pnpm build` 均通过。

2026-08-30 验证完整会话历史：本地解析、保存和冲突合并不再截断第 25 条及之后的记录；
云端查询每页读取 50 条并用额外一条判断是否还有下一页，客户端自动读取到
`nextCursor = null`。非法和重复游标会被拒绝，避免无界单次响应与异常循环。
`pnpm check`、337 项前端测试和 `pnpm build` 均通过。

2026-08-30 验证无边框页面 header：公共首页、工作区顶栏、共享页面标题和各功能工作区
语义 header 均不再绘制边框。桌面复习页检查到 4 个 header 的四边计算宽度均为 `0px`；
移动 `390 x 844` 首页的 `scrollWidth/clientWidth` 为 `390/390`，header 底边框为
`0px`。`pnpm check`、338 项前端测试和 `pnpm build` 均通过。

2026-08-30 验证影子跟读交互：重新录音单击后直接启动采集，同一句的临时录音在页面会话
内保留，可逐次回放并显示相邻综合分差；组件卸载时统一释放 Object URL。整段对话按说话人
分别使用设置页主角色音色与自动匹配的第二音色，中文翻译 Switch 默认关闭。桌面
`1244 x 912` 检查中栏内容独立滚动且录音操作区固定在底部，深浅主题均使用语义色；
移动 `390 x 844` 的 `scrollWidth/clientWidth` 为 `390/390`。`pnpm check` 的 56 个
前端测试文件、345 项测试以及 `pnpm build` 均通过。

2026-08-30 验证生活与职场地道表达场景：场景库现有 101 个场景，其中 100 个可用；专项
场景提供 36 组带语境、含义、隐喻解释、来源与例句的结构化内容，并可由全局搜索命中。
影子跟读提供 12 句人工预设，学习者与双语团队同事各 6 句；桌面 `1244 x 912` 下页面
`scrollWidth/clientWidth` 为 `1244/1244`，中栏高 685px，脚本滚动区
`clientHeight/scrollHeight` 为 `438/1158`，底部操作栏保持在视口内。移动
`390 x 844` 下页面宽度为 `390/390`，专项脚本滚动区为 `413/1334`，角色互换后顶部显示
完整“扮演：双语团队同事”且首条 Jordan 台词成为目标。移动提示 Sheet 打开后焦点位于
标题、滚动位置为 0，未跳过词库首项。全局搜索键帽实测为 `24 x 24px`、`12px` 字号。
`pnpm check` 通过 350 项前端、15 项 TTS、18 项 ASR、13 项数据库契约和 6 项记忆评估测试；
`pnpm build` 通过。

2026-08-30 将专项地道表达从 36 组扩充到 100 组，新增日常交流、情绪与决策、协作和职场
推进表达。自动化断言覆盖总数、短语唯一性、含义/解释/来源/例句完整性、完整句标点、提示栏
数量以及中英文全局搜索命中；对有争议的来源明确保留不确定性说明。`pnpm check` 的
350 项前端、15 项 TTS、18 项 ASR、13 项数据库契约和 6 项记忆评估测试均通过，
`pnpm build` 通过。

2026-08-30 验证独立地道表达库：内置数据共 1000 条，10 类场景各至少 90 条，英文表达
全局去重并包含中文含义、语义解释、来源和完整例句。CSV/JSON 导入覆盖预检、重复过滤、
本机优先保存、200 条分批同步、分页全量读取和异常游标保护；`expression_library_items`
的 schema、RLS、账户导出与级联删除纳入契约测试。筛选区滚动时稳定吸附在 64px 全局顶栏
下方，底部哨兵进入 480px 预加载区后自动将列表从 60 条扩展到 120 条，不再显示手动加载
按钮。`pnpm check` 通过 375 项前端、15 项
TTS、18 项 ASR、14 项数据库契约和 6 项记忆评估测试，`pnpm build` 通过。桌面
`1244 x 912` 与移动 `390 x 844` 的 `scrollWidth/clientWidth` 分别为 `1244/1244` 和
`390/390`，首批稳定渲染 60 条且未发现控制项重叠。远端数据库迁移与双账户 RLS 仍受
T-004 的隔离项目权限约束，本次未声称完成。

2026-08-30 根据使用反馈简化地道表达导入：移除逐条批量表单，提供直接粘贴 JSON 和上传
CSV/JSON 文件两个数据入口；JSON 文本自动校验，上传模式保留 CSV 模板和预检结果。用户
导入项稳定排在内置项之前，可通过行级图标编辑或删除；编辑和删除均先更新本机，再按稳定
`clientId` 同步云端。组件与接口测试覆盖直接 JSON、文件上传、单条修改、删除确认、
PUT/DELETE 校验和仓储冲突键。`pnpm check` 通过 382 项前端、15 项 TTS、18 项 ASR、
14 项数据库契约和 6 项记忆评估测试。桌面 `1244 x 912` 和移动 `390 x 844` 下完成生产
构建验收；直接 JSON 使用按需加载的 Monaco Editor 并正确显示 JSON 语言编辑器，上传 Tab
保留文件选择和模板下载。预检统计压缩为高 `34px` 的单行摘要；移动编辑区
`clientHeight/scrollHeight` 为 `587/770`，底部操作栏无重叠，页面和弹窗
`scrollWidth/clientWidth` 均无溢出。

2026-10-03 验证质量门稳定性与 Vercel 部署配置。`pnpm check` 与 `pnpm build` 通过
384 项前端、15 项 TTS、35 项 ASR、14 项数据库契约和 6 项记忆评估测试。

前端套件此前会在全量运行时随机超时，单次插桩测得工作区组件一次 `getByRole` 查询耗时
1–2 秒。根因是 jsdom 通过 `getComputedStyle` 解析隐式 ARIA role，且 worker 数按超线程
分配后内存带宽饱和：单测从 4.9 秒恶化到 20 秒仍超时，全量耗时 158 秒。将
`maxWorkers` 限制为 2 后 62 个文件全部通过，全量耗时降至 53 秒。本轮未执行浏览器或
目标硬件验证。

确认「构建通过不代表配置正确」：移走根 `.env.local` 并清空 `NEXT_PUBLIC_SUPABASE_*`、
`AI_*` 与 `MODEL_CONFIG_PRIVATE_KEY_BASE64` 后 `pnpm build` 仍零错误产出全部 23 个路由。
恢复配置后，真实 Supabase 主机名出现在 `frontend/.next/static` 的客户端 chunk 中，
证实 `next.config.ts` 的 `env` 在构建期内联公开变量。已确认 `.next/` 被 `.gitignore`
覆盖，构建产物未进入提交。

新增 `frontend/vercel.json` 与 `frontend/package.json` 的 `engines`。确认
`prompt-template.ts` 依赖 `process.cwd()`，且 `route.js.nft.json` 将 Prompt 解析到
`frontend/src/lib/memory/prompts`，因此 Vercel 的 Root Directory 必须为 `frontend`。

本次未执行真实 Provider、真实语音、远端数据库或跨浏览器验证。

2026-10-04 修复 ASR 的 Vercel 构建失败。Vercel CLI 62.1.0 报
`Found app.py, main.py but none define a top-level "app" FastAPI instance`；根因是
`services/asr` 只暴露 `create_app()` 工厂，`main.py` 在 `main()` 内部才实例化，且
`services/asr/app.py` 的包内相对导入在 Vercel 把 `app.py` 当顶层模块导入时会抛
`ImportError`——后者已在本机复现。只加模块级 `app` 会把构建错误换成 `ImportError`。

改为在仓库根新增 `asgi.py`（`app = create_app()`）、转发 `requirements.txt` 与
`functions.asgi.py.excludeFiles`，ASR 服务代码零改动。

本机实测：

- `import asgi` 得到 FastAPI 实例，路由为 `/openapi.json`、`/health`、`/v1/asr/stream`。
- 不进入 lifespan 时 `GET /health` 返回 503 与既有 `ready: false` 契约，未加载模型。
- `pnpm asr:test` 通过 35 项；`backend.services.asr.main` 导入正常，本地与 Docker 路径
  未受影响。
- `biome check` 对新增的 `asgi.py`、`vercel.json`、`requirements.txt` 无报错；仓库既有
  11 项 lint 错误全部位于本次未改动的脏工作区前端文件。
- 根 `requirements.txt` 的 `-r` 间接解析生效。本机 pip dry-run 报
  `No matching distribution found for torch>=2.5`，用原始
  `backend/services/asr/requirements.txt` 得到完全相同的错误，属本机环境既有问题。

未执行 `vercel build`：CLI 需要登录令牌与已关联项目，本次环境没有凭据，因此「构建通过」
尚未取得证据，只验证了 Vercel 检测所依赖的入口契约。生产运行条件（内存、bundle、无 GPU、
前端回环限制）不成立，见[部署指南](deployment.md#asr-的-vercel-构建入口)与 T-302。

2026-10-05 完成对话输入区、删除消息与可编辑 Prompt。本机实测：

- 对话错误气泡按内容宽度收缩，不再撑满 grid 轨道；`conversation-workspace.test.tsx` 24 项
  通过，覆盖错误气泡宽度、重试与删除按钮无边框、识别消息可删除、输入区不因发送按钮禁用而
  呈现禁用态。
- `deleteMessage` 与其搭档回复一并移除，`voice-conversation.test.tsx` 新增 3 项通过；
  该文件仍有 1 项既有失败（音色试听），`git stash` 基线确认先于本次改动存在。
- Prompt 补充层：`prompt-supplement.test.ts` 8 项、`settings-form.test.tsx` 13 项、
  `conversation-route.test.ts` 26 项通过。补充指令仅在显式保存后写入，未配置时请求体不含该
  字段；服务端拒绝超长与非字符串值。
- `pnpm lint` 报 1 项错误，位于本次未改动的 `shadowing-workspace.tsx` 与
  `speech-config.test.ts`，`git stash` 基线确认与本次无关。`pnpm asr:test` 35 项与
  `pnpm build` 均通过。

未执行浏览器截图与真实 Provider 调用，因此 320px/390px 无溢出和纠错实际效果未取得证据。
Prompt 基础契约的修改只经单元测试覆盖，未经真实模型验证。

## 真实服务证据

本机验证覆盖：

- SenseVoice 模型加载和 WebSocket `ready` / `started` / `final`。
- Kokoro 英文 v1.0 与中文 v1.1-zh WAV 合成。
- CosyVoice 通过 `5581` sidecar 与 `5578` gateway 合成英文。
- 浏览器对本机 TTS 的 health、CORS、prepare、synthesize 和音频播放。

这些结果证明协议链路可运行，不代表所有目标硬件的质量、延迟或容量达标。

## ## 2026-10-07 影子跟读长按空格录音，Prompt 编辑区取消卡内滚动

2026-10-07 设置页「对话 Prompt」卡片此前与其他设置卡共用 `settingsCardHeightClass` 高度上限与
`overflow-y-auto`，编辑器、契约警告与操作按钮因此挤在卡内滚动区里：警告可能被滚出视野，保存
按钮也需要卡内滚动才能到达。该卡片改为不使用高度上限、不设卡内滚动，textarea 自身保留固定
高度（`h-80` / `lg:h-96`）以维持「字段」而非「页面区块」的定位。布局测试固定「除 Prompt
卡片外其余 6 张卡仍带高度上限」。

2026-10-07 影子跟读新增长按空格录音。新增 `use-hold-to-record-shortcut`：仅在跟读阶段生效，
且在文本框、按钮等可交互元素获得焦点时不触发，避免覆盖空格输入与按钮激活；长按期间忽略
keydown 重复事件，否则每几百毫秒重启录音；`window.blur` 与 `visibilitychange` 均停止录音，
因为在窗口外松手时 keyup 不会到达该文档。录音按钮旁新增 `kbd` 提示。

`tests/hold-to-record-shortcut.test.tsx`（10 个用例）与 `tests/shadowing-workspace.test.tsx`
新增用例覆盖快捷键行为。本次未执行桌面与 390px 截图核对；空格长按的真实手感（含系统级快捷键
冲突与 macOS 全屏空格冲突）需在浏览器中人工确认。

## 2026-10-07 系统 Prompt 改为学习者全权所有

`conversationPrompt` 非空时整体替换内置文本，包含 `## Output Contract` 输出契约；
`conversationPromptMaxLength` 与路由校验同步放宽至 12000。为把「改坏契约」这一合法配置结果
变成可归因事件，`parseProviderConversation` 新增 `contractApplied` 字段，解析降级时返回
`false`，转写标注「未按输出契约返回」并指向设置页；设置页在草稿缺少该段时给出警告但不拦截。
偏好记录升级到版本 6，v4 补充指令与 v5 指令段两级迁移均不改变实际发送的 Prompt。
`pnpm check` 通过（74 文件、515 用例）；`pnpm build` 通过。

Prompt 文本从 `src/lib/memory/prompts/conversation-system.md`（`node:fs` 运行时读取）迁到
`src/lib/memory/conversation-prompt-text.ts`，`next.config.ts` 的
`outputFileTracingIncludes` 随之移除。

2026-10-06 调整设置页「对话体验」布局。新增
`app/workspace/conversation/loading.tsx`：工作区 Shell 在对话路由下取消自身内边距，
原共享占位层会紧贴左侧与顶部边缘，新边界按 `conversation-workspace` 的
`px-4 md:px-5`（页头）与 `px-5 md:px-8`（转写）自持内边距。设置页把「对话布局」与「输入
方式」合并为「对话方式」一张卡片、两个下拉，`items-start` 防止短卡片被同行高卡片拉伸成空
块，会话与判句三段数值在 `lg` 下改为三列。本次未执行桌面与 390px 截图核对，需按
[界面规范](ui-guidelines.md) 补验。

`tests/shadowing-workspace.test.tsx`、`tests/expression-library-workspace.test.tsx` 与
`tests/conversation-workspace.test.tsx` 各有一个用例在整包运行时触发 10s 超时；用 `git stash`
在未修改的基线上复现了 shadowing 超时，单独重跑亦消失，最终 `pnpm check` 全量通过。判定为
本机负载相关的既有不稳定项，未由本次变更引入，也未因此放宽断言。

## 2026-10-04 导航反馈与语音接入

本轮同时处理“切换菜单卡顿且没有加载反馈”和“ASR/TTS 必须依赖本机服务”两件事。

性能：新增 `app/workspace/loading.tsx` 路由级骨架，`AppNavigation` 用 `useLinkStatus` 在被点击
项显示进行中指示；全局搜索索引改为打开时（或空闲时）动态加载，导航元数据从 `demo-data.ts`
拆到 `navigation-sections.ts`，学习分析图表改为 `ssr: false` 动态加载。生产构建
`.next/diagnostics/route-bundle-stats.json` 实测（未压缩首载 JS）：

| 指标 | 修改前 | 修改后 |
| --- | --- | --- |
| 工作区共享外壳 | 1192 KB | 1105 KB |
| `/workspace/scenes` | 1219 KB | 1157 KB |
| `/workspace/review` | 1219 KB | 1139 KB |
| `/workspace/sentences` | 1199 KB | 1112 KB |
| `/workspace/analytics` | 1602 KB | 1183 KB |
| `/workspace/conversation` | 1341 KB | 1351 KB |

场景与习语目录（约 480 KB）不再属于任何路由的首载包，改为空闲时单独加载；全局搜索对话框关闭
时不再构建结果索引。`/workspace/conversation` 与 `/workspace/shadowing` 增加约 10 KB（语音接入
配置与浏览器识别适配器），属于功能成本。

语音接入：新增 `moss:speech-config:v1`，ASR 与 TTS 各自支持本机服务、HTTP API 与浏览器引擎；
新增 `/api/speech/asr` 与 `/api/speech/tts` 代理；`use-asr-session` 成为唯一识别入口，本机服务
连接失败时在会话内回退到浏览器引擎。

对话页设置浮层直接提供接入方式：`识别来源` 与 `播报来源` 各自选择本机服务、线上 API 或浏览器
引擎；识别引擎选择器只在“本机服务”下出现，播报音色在“线上 API”下切换为接口音色名并保留自由
输入。影子跟读沿用同一份配置，`api` 接入时学习者使用配置音色、对方角色使用下一个预设。

自动化：`pnpm lint`、`pnpm typecheck`、`pnpm --dir frontend test`（73 文件 467 测试）与
`pnpm build` 通过。新增测试覆盖语音配置解析与端点策略、两个 route 的校验/转发/降级/限流、
浏览器 `SpeechRecognition` 事件与录音上传、本机识别到浏览器的回退、TTS 三种接入与音频缓存隔离、
对话设置浮层的接入切换、设置页语音卡片与工作区骨架。

`/api/speech/*` 用真实 Next.js 路由验证：非 HTTPS 端点、空文本与空音频返回 400，上游不可达返回
502 与 `speech_endpoint_unreachable`。

未通过项：`tests/shadowing-workspace.test.tsx > shows measured scores and saves the completed
attempt` 断言“录音对比”区域包含“本次录音”，实际渲染为空状态（0 次）。该失败在本工作区并行进行
的影子跟读改动中已存在：把我的影子跟读改动全部移除后失败依旧；把该功能的分支测试文件放到本工作区
则 5 个用例全部通过。因此这是并行改动与其测试之间的不一致，不是本轮引入的回归，需由该改动的
负责人收口。

未执行：真实麦克风录音、真实第三方语音接口调用、目标设备音质与延迟、桌面与 390px 的视觉
截图复验。`tests/shadowing-workspace.test.tsx` 与 `tests/conversation-workspace.test.tsx` 的
重型用例单文件耗时 5–12 秒，并行负载下会触及 10 秒默认上限；放宽到 60 秒后仅剩上述一条断言失败。

## 外部验收

2026-08-29 使用 publishable key 执行 `pnpm db:test:remote`：14 张业务及运行时表和
`sync_learning_memory`、`match_long_term_memories`、`check_rate_limit` 三个 RPC 均以
PostgreSQL `42501` 拒绝匿名访问，最新远端匿名权限检查通过。该只读结果不能替代全量
新建、增量升级和认证账户 RLS 验收。认证请求的运行时证据显示，远端旧版
`check_rate_limit` 仍因时间变量类型冲突返回 PostgreSQL `42804`；本地 SQL 已修复，
但仍需管理员部署当前 `update.sql`。携带有效加密 BYOK 配置的请求在此期间使用容量有界
的单实例限流，公共服务端模型请求继续 fail-closed。

全量 `platform.sql` 的新建验证、当前 `update.sql` 的升级验证、认证账户 RLS、跨实例限流、
目标硬件、真实 Provider 和浏览器矩阵的状态记录在
[`plans/in-progress.md`](../plans/in-progress.md) 及 [`plans/blocked.md`](../plans/blocked.md)。
`pnpm db:test:rls` 已提供会话、消息、向量记忆和共享限流原子性的双账户隔离验收，但当前
环境未配置专用测试账户，因此尚未执行。embedding 回填 CLI 的断点、幂等和重试契约已通过自动化测试；
`pnpm memory:backfill -- --dry-run` 因当前环境未配置 `SUPABASE_SERVICE_ROLE_KEY` 而在任何
远端读取前终止，真实扫描与回填尚未执行。账户导出与删除审计的自动化契约已通过，远端
审计表已可见，但当前环境缺少 service-role key、审计密钥与专用可删除账户，因此未执行
真实导出、Auth 删除和残留检查。长期记忆评估的数据协议、参数网格和指标计算已由
`pnpm memory:test` 覆盖，真实 HNSW 参数对比仍等待去标识化评估集和可重建索引的隔离
数据库。静态契约测试和合成样例不能替代这些集成验证。
