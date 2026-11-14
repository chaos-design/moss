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
    ASR --> ElevenLabs[ElevenLabs adapter tests]
    ElevenLabs --> Database[Database contract tests]
    Database --> Build[Next.js build]
```

| 门禁 | 范围 | 当前结果 |
| --- | --- | --- |
| `pnpm lint` | TypeScript、Python 周边配置、Markdown 与格式 | 通过 |
| `pnpm typecheck` | Next.js/React 严格类型 | 通过 |
| `pnpm --dir frontend test` | 领域逻辑、route、hook、组件 | 85 文件，659 测试通过；本机默认 10s 上限下有 1 个重型用例偶发超时，放宽到 30s 全通过 |
| `pnpm tts:test` | gateway、Audio8、CosyVoice | 15 测试通过 |
| `pnpm asr:test` | 配置、PCM、VAD、WebSocket、安全边界 | 35 测试通过 |
| `pnpm elevenlabs:test` | ElevenLabs 适配器配置、路由、上游映射、通用规则一致性与测试合成探针 | 40 测试通过 |
| `pnpm fishaudio:test` | Fish Audio 适配器配置、路由、上游映射与测试合成探针 | 48 测试通过 |
| `pnpm db:test` | SQL、RLS、记忆 RPC、共享限流、删除审计与 embedding 回填契约 | 15 测试通过 |
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

## 2026-11-12 ElevenLabs 可选适配服务

新增独立可选的 `backend/services/elevenlabs`，在本机 `127.0.0.1:5583` 把 ElevenLabs
TTS/ASR 翻译为 Moss 已支持的 OpenAI 兼容语音契约。`5578` TTS 网关、`5580` ASR、前端默认
接入与 `pnpm dev:offline` 均未改动；只有学习者把 ASR 与 TTS 都切到 HTTP API 并填写本服务
地址时才会走 ElevenLabs。

自动化结果：

- `pnpm lint`：通过，263 个文件。
- `pnpm typecheck`：通过。
- `pnpm --dir frontend test`：77 文件、543 测试通过。默认 10s 上限下
  `tests/shadowing-workspace.test.tsx > shows measured scores and saves the completed
  attempt` 在本机耗时 10.2–11.9s 而超时；以 `--testTimeout=30000` 复跑全部通过，说明是本机
  负载导致的既有重型用例超时，不是本次后端变更引入的行为回归。
- `pnpm tts:test` 15、`pnpm asr:test` 35、`pnpm elevenlabs:test` 37、`pnpm db:test` 15、
  `pnpm memory:test` 6：全部通过（ElevenLabs 新增规则一致性与测试合成探针用例）。
- `pnpm build`：通过，Next.js 16.3.3 完成 28 个页面/路由的静态生成与类型检查。

真实进程冒烟：以本地假上游监听 `127.0.0.1:5598`，启动适配器进程并验证
`GET /health` 返回 `ready: true`；`POST /v1/audio/speech` 将 `alloy` 映射到 ElevenLabs
voice ID、把 `speed: 1.5` 收敛为 `1.2`、以 `mp3_44100_128` 请求并原样返回
`audio/mpeg`；`POST /v1/audio/transcriptions` 以 multipart 上传并返回
`{"text":"mock transcript"}`；`aac` 返回 `400 unsupported_format`，非白名单 Origin
返回 `403`。本机 macOS 系统代理会拦截回环请求，冒烟时需设置
`NO_PROXY=127.0.0.1,localhost`；这只影响本地假上游测试，不影响默认 HTTPS 上游。

后续补充的测试合成探针同样以本地假上游（不消耗额度）复跑：`pnpm elevenlabs:start` 在
未显式设置模型/音色/格式时，由 `frontend/src/lib/speech-rules.json` 注入默认值，
`GET /health` 返回 `eleven_v4` / `scribe_v2`；`POST /v1/audio/speech/test` 与
`pnpm elevenlabs:test:synthesis` 均返回 `ok: true`，含 `audio/mpeg`、字节数、耗时与
模型/音色/格式诊断，每次探测各调用上游一次。

未验证：本环境没有 `ELEVENLABS_API_KEY`，因此未调用真实 ElevenLabs 服务，未验证真实音色
质量、端到端延迟、账户配额、计费与保留策略。上述冒烟只证明协议翻译、进程启动和错误映射，
不能替代配置真实密钥后的验收。

## 2026-10-07 影子跟读自动跟随与角色反馈

本轮新增中栏转写的目标句跟随：只滚动中栏容器，不滚动页面，播放对方台词时跟随播放句，
录音和目标推进时跟随本角色台词，目标已可见则保持原位。原先评分位于转写下方，现只显示
在右侧「本轮反馈」；即使自动接话调用 `recorder.reset()` 清除当前结果，仍使用当前场景、当前
扮演角色最近一次已完成录音，显式标注评分所属台词及「上一句」，不把上一角色分数标给当前角色。

既有评分字段和持久化契约不变，仅按角色调整综合分的清晰度/连贯度权重及展示顺序。没有 ASR
或音素对齐，声学值只能表示发声强弱、有效发声占比、停顿与时长；UI 明示“不评判发音准确性
或台词含义”。`tests/shadowing-assessment.test.ts` 覆盖角色权重与静音输入；
`tests/shadowing-feedback.test.ts` 覆盖角色维度和文案；
`tests/scroll-shadowing-line.test.ts` 覆盖中栏滚动；工作区测试覆盖自动推进后仍保留上一句成绩、
切换角色不串分及实际台词跟随。桌面与 390px 视觉核对仍待浏览器环境。

## 2026-10-07 影子跟读长按空格录音，Prompt 编辑区取消卡内滚动

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

## 2026-11-12 本机 local 语音接口配置

为 HTTP API 语音接入补充了可配置的本机 local 接口：新增 4 个构建期内联环境变量，设置页为
ASR 与 TTS 各提供“使用本机接口”一键填入，并让回环端点在生产构建的端点策略与
`/api/speech/*` 白名单中内置允许。浏览器仍不直连本机端口，非回环私网主机与 URL 内嵌凭据
仍被拒绝，`local` 接入的 WS/HTTP sidecar 回环限制不变。

自动化结果：

- `pnpm check`：通过（Biome、TypeScript、前端 Vitest、Python TTS/ASR/ElevenLabs 单测、
  SQL 契约与记忆评估测试）。
- `pnpm build`：通过（Next.js 16.3.3，28 个路由生成成功）。
- 新增 8 个前端断言：本机接口预设的环境变量读取与 URL 拼接、回环端点在 `production`
  下的合法性、生产白名单对回环/私网/URL 凭据的区分，以及 `/api/speech/asr` 与
  `/api/speech/tts` 到 `127.0.0.1:5583/v1/audio/*` 的转发与 Bearer 头传递。

未执行：真实麦克风录音、真实 ElevenLabs 上游调用、本机服务进程级端到端联调、桌面与
390px 视口截图复验。Vercel 等无本机服务的运行环境不在本次验证范围内。

## 2026-11-12 Fish Audio 本机适配器与对话输入框交互

新增 Fish Audio 本机适配器（`backend/services/fishaudio`，loopback `5584`），把 Fish Audio
的 TTS/ASR 翻译为 Moss 的 OpenAI 兼容语音契约，与 5583 ElevenLabs 适配器同构：`/health`、
`/v1/audio/speech`、`/v1/audio/speech/test`（自检探针）、`/v1/audio/transcriptions`，
共享 `frontend/src/lib/speech-rules.json` 规则表（`services.fishAudio`、`models.fishAudio`、
`formats.fishAudioSupported`、`fishAudio` 提供商段）。设置页新增“使用 Fish Audio”一键
填入；音色别名（含共享测试合成默认值 `alloy`）映射为空串 = Fish Audio 内置默认音色，
`speed` 直接转发（上游接受 0.5–2），实时性档位默认 `balanced`。对话输入框同步优化：
内容自动增高（上限约 5 行）、Escape 收起、空草稿失焦收起、桌面端自动聚焦，以及生成期间
的“停止生成回复”按钮（草稿为空时唯一的打断入口）。

自动化结果：

- `pnpm fishaudio:test`：47 个用例通过（规则表一致性、`httpx.MockTransport` 客户端翻译、
  FastAPI TestClient 端点契约与探针）。
- 前端 Vitest 相关文件（conversation-workspace、speech-service-card、speech-rules、
  speech-config）共 57 个用例通过，含新增的停止按钮、Escape 收起、Fish Audio 预设与
  规则一致性断言。
- `pnpm check`：通过（Biome、TypeScript、前端 Vitest、TTS/ASR/ElevenLabs/FishAudio 单测、
  SQL 契约与记忆评估测试）。
- `pnpm build`：通过（Next.js 编译成功，29 个静态页生成）。

未执行：真实 Fish Audio 上游调用（当前环境未配置 `FISH_API_KEY`，探针仅通过本地假上游
验证）、真实麦克风录音、桌面与 390px 视口截图复验。付费模型在账户未充值时会返回
`fishaudio_payment_required`，需要在配置真实密钥后单独验收。

## 2026-11-13 语音配置统一规范与外部 HTTP API 直连

按「服务 × 接入方式」把语音配置整理为统一字段规范（`speechFieldPolicies`，表格见
`docs/speech-rules.md`「配置字段规范」）。核心语义变化：**模型与音色是否必填由服务端决定**——
`/api/speech/*` 网关对空模型/空音色不再拒绝而是按契约省略字段转发；除非显式设置
`NEXT_PUBLIC_*_API_MODEL`，浏览器不再替学习者填充 `whisper-1`/`tts-1` 默认模型（旧逻辑会把
空模型偷偷换成 whisper-1，指向 5584 时还会触发 Fish Audio 付费模型回落）；5583/5584 适配器
对空模型/空音色回退到服务端默认值。设置页新增：ASR「测试识别接口」（内置 0.2s WAV 测试音）、
TTS「音色」字段（与对话页接口音色同一存储）、本机接入的识别引擎与本机音色选择器、生效配置
中的引擎/音色展示。

自动化结果：

- `pnpm check`：通过（Biome、TypeScript、前端 Vitest、TTS/ASR/ElevenLabs(38)/FishAudio(48)、
  SQL 契约与记忆评估测试）。
- `pnpm build`：通过。
- 端到端：本地假外部 OpenAI 兼容服务（127.0.0.1:5590）验证空模型/空音色经 `/api/speech/asr`
  与 `/api/speech/tts` 直连成功（上游确认收到省略字段的请求）；demo 实例浏览器验证设置页新
  字段渲染与「测试识别接口」「测试合成接口」两条诊断链路均返回成功。

未执行：真实外部语音服务（OpenAI 等）联调、真实麦克风录音。`NEXT_PUBLIC_*_API_MODEL` 的
兜底语义变化需要已在环境里显式配置模型名的部署不受影响（仅移除了代码内硬编码默认）。

## 2026-11-13 转写朗读状态可视化与可打断

对话运行时新增朗读目标追踪（`speechTargetText` + `stopSpeech`）：转写里每条回复的
「播放本轮英语」按钮现在反映 Agent 语音反馈的真实状态——合成中显示加载图标、播放中变为
「停止播放」（`aria-pressed`），再次点击立即打断朗读并清空目标文本，语音播完自动恢复
播放入口。文字与语音模式都可用；预览试听（音色试听）不占用该状态。

自动化结果：

- `pnpm check`：通过（前端 Vitest 新增 3 个断言：朗读目标追踪与停止清空、转写按钮
  播放/停止切换、aria-pressed 状态；其余套件不变）。
- `pnpm build`：通过。
- demo 实例浏览器验证：点击播放按钮出现「停止播放」（aria-pressed=true），语音自然播完后
  自动恢复「播放本轮英语」，无残留停止控件。

未执行：真实麦克风与真实 TTS 音频链路下的打断体验（回声防护路径不变）。

## 2026-11-13 语音反馈边界修复

继续排查上一轮语音反馈改动在语音通话模式下的边界，修复两个问题：

1. **通话中停止朗读会卡死通话**：朗读开始时 ASR 已暂停、状态置为 speaking，转写里的
   「停止播放」按钮只停播不恢复识别，通话会卡在 speaking 且没有语音起点信号可以唤醒。
   现在 `stopSpeech` 在通话中（未静音）停止朗读后立即重启识别并回到 listening。
2. **拼音组合中按 Escape 会误收起输入框**：Escape 在 IME 组合期间的语义是取消组词，
   输入框收起现在仅在非组合状态触发（`isComposing` 守卫）。

自动化结果：

- `pnpm check`：通过（新增 2 个测试：通话中停止朗读恢复监听、IME 组合中 Escape 不收起；
  全套用例通过）。
- `pnpm build`：通过。
- demo 实例浏览器验证：390px 设置页无横向溢出（390/390），语音服务卡片新增的模型/音色
  字段在卡片内滚动容器中完整可用。

未执行：真实麦克风通话中的停止体验（依赖真实回声与识别时序）。

## 2026-11-13 语音服务下拉与按服务独立测试

按 `docs/detailed-design.md` §5.5 落地设置页的语音服务接入能力：

1. **本机服务地址改为下拉选择**：选项来自 `speech-rules.json` 的 `localServices`，与 MOSS
   本机服务可用项一致（本机 ASR 5580、FunASR 外部 10095、本机 TTS 网关 5578、ElevenLabs
   适配器 5583、Fish Audio 适配器 5584）；不再接受手填地址；选中 `api` 接入的本机适配器时
   自动对齐接入方式、地址与模型，切回本机服务时清掉残留的适配器地址。
2. **两个独立测试按钮**：ASR 与 TTS 各一个常驻的「测试识别接口」「测试合成接口」，分别验证
   本服务已配置地址与对应服务；各自维护 `idle`/`testing`/`success`/`error` 与结果文案，
   一个服务的测试不覆盖另一个；任一配置项变化只失效本服务已有的结果。
3. **引擎/音色按服务独立匹配**：新增 `moss:speech-local-config:v1`，以服务 ID 为键分别保存
   识别引擎与音色；切换服务时恢复目标服务自己的取值，不属于该服务的值回退到该服务默认值，
   不再把 FunASR 引擎或 Audio8 音色带到其他服务。
4. **上游诊断可定位**：`/api/speech/*` 网关在本机适配器返回 JSON 错误体时透传 `code` 与
   简短 `message`，设置页失败文案附带错误码；合成诊断对本机回环适配器不再强推 `alloy`。

自动化结果：

- `pnpm check`：通过（lint、typecheck、前端 82 个测试文件 633 个用例、后端 Python 与脚本
  测试全部通过）。
- 语音相关 4 个测试文件：51 个用例通过，其中新增 18 个（`local-service-config` 8、
  设置页 7、ASR 路由 1、合成诊断 2）。
- `pnpm build`：通过（以独立 `NEXT_DIST_DIR` 构建，29 条路由正常产出）。

未执行：5583/5584 的真实端到端合成与识别（本机 ElevenLabs 密钥为 key ID、Fish Audio
经当前代理不可达，均返回上游错误）；新下拉与测试按钮的浏览器手工点验。

## 2026-11-13 语音服务卡片布局与 502 诊断

按页面反馈调整语音服务卡片，并排查「测试接口 502」：

1. **下拉展示地址**：本机服务下拉的触发器与每个选项都显示服务名和地址；触发器地址过长时
   截断并用 `title` 保留完整值，选项内允许换行，避免长 WebSocket 地址撑破弹层。
2. **测试按钮按分类吸底**：ASR 与 TTS 的测试按钮与结果文案分别移到各自栏目的卡片页脚，
   页脚在字段区滚动时固定可见；未选 HTTP API 时按钮禁用并只显示一行原因，不再堆叠两条
   长提示。
3. **并排卡片等高**：模型服务/学习策略、对话方式/系统发音两组网格由 `items-start` 改为
   `items-stretch`，卡片 `h-full`（表单内卡片 `flex-1`），短卡片拉伸到与相邻卡片底部对齐。
4. **502 诊断**：ElevenLabs 用 `400 + detail.code=invalid_api_key` 表示密钥错误（本机填的是
   key ID），适配器此前误归为「请求参数错误」；现按上游 `detail.code` 归为
   `elevenlabs_unauthorized（invalid_api_key）`，只透传机器码不带上游自由文本。两个适配器
   在连接建立失败（`ConnectError`，请求未送达）时重试一次，降低代理抖动导致的
   `*_unreachable`。设置页对 `unauthorized` / `unreachable` / `payment_required` 追加
   可执行的排查提示。

自动化结果：

- `pnpm check`：通过（lint、typecheck、前端 82 个测试文件 636 个用例；ElevenLabs 40 个、
  Fish Audio 48 个 Python 用例）。
- `pnpm build`：通过（独立 `NEXT_DIST_DIR`，29 条路由正常产出）。
- 新增测试：下拉展示地址、测试按钮位于卡片页脚、502 鉴权提示；适配器新增 key ID 400 →
  `elevenlabs_unauthorized` 与空音色回退默认音色的用例。

实测结论：`/api/speech/tts/test` 对 5583 返回 `ok:false`、`status:502`，上游为
`400 invalid_api_key`（`API key ID used as API key`）；5584 为 `401`。两者都是服务端凭据
问题而非页面链路，修复后页面展示「上游凭据无效，请检查对应服务端的 API Key」。

未执行：填入有效 `sk_` 密钥后的真实合成/识别；浏览器手工点验页脚吸底与等高效果。

## 2026-11-14 例句译文、复习范围与考题式地道表达

改动：

1. **词库例句译文**：`IdiomaticExpressionNote` 新增可选 `exampleTranslation`，100 条审校内容
   补齐中文译文；例句行末的眼睛按钮用 `aria-expanded` 展开/收起译文，默认收起。导入字段别名
   增加 `exampleTranslation` / `example_translation` / `例句译文`，编辑弹窗可维护，译文参与搜索。
2. **复习范围**：新增 `lib/memory/review-scope.ts`，`moss:review-scope:v1` 保存
   混合 / 地道表达 / 场景；`getReviewQueue` 改为委托 `getScopedReviewQueue`，调度顺序不变。
   跨范围目标不强行插入；带 `?memory=` 进入且当前范围装不下目标时，首次水合后自动切到目标范围。
3. **考题式地道表达复习**：`features/review/expression-exam.ts` 按条目重复次数轮换释义选择、
   表达选择与例句填空；选项由词库其他条目提供，顺序来自确定性哈希；无法挖空时回退释义题。
   作答或跳过记为一次回想尝试，四档自评仍是唯一写入强度与间隔的信号。
4. **语音失败语义**：`/api/speech/*` 不再把上游 401/402/429/503/504 压成 502，按适配器错误码
   还原为 `speech_credentials_invalid`、`speech_payment_required`、`speech_rate_limited`、
   `speech_unavailable`、`speech_not_configured`、`speech_timeout`、`speech_request_rejected`；
   浏览器侧仍把 401/402 与 5xx 视为链路不可用并回退系统语音或浏览器识别。

自动化结果：

- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm --dir frontend test`：84 文件、653 用例通过。
- `pnpm tts:test` 15、`pnpm asr:test` 35、`pnpm elevenlabs:test` 40、`pnpm fishaudio:test` 48、
  `pnpm db:test` 15、`pnpm memory:test` 6：通过。
- `pnpm build`：通过（`NEXT_DIST_DIR=.next-verify`，29 条路由正常产出）。

实测证据（本机，临时端口）：

- 以当前代码启动的 5583 适配器（临时 5593）返回 `elevenlabs_unauthorized`（`invalid_api_key`，
  上游说明为 `API key ID used as API key`）；`/api/speech/tts/test` 返回 `status:401`、
  `speech_credentials_invalid`，并给出「上游凭据无效」的下一步提示。
- 以当前代码启动的 5584 适配器（临时 5594）返回 `fishaudio_unreachable`；诊断返回 `status:503`、
  `speech_unavailable`，与本机网络无法访问 `api.fish.audio` 一致。
- 运行中的 5583/5584 是改动前启动的进程，仍返回旧错误码；需重启 `pnpm elevenlabs:start` /
  `pnpm fishaudio:start` 后才会显示新的诊断结果。

未执行：

- 有效 `sk_` 密钥下的真实合成；`api.fish.audio` 的真实合成（本机网络不可达）。
- 浏览器手工截图核验：当前环境没有浏览器自动化，桌面与 390px 的视觉验收待补。

## 2026-11-14 长期记忆吸顶与分批挂载、语音一键接入、数据扩充

改动：

1. **长期记忆页**：顶部四条统计保留；向下滚动时一条精简栏吸顶（`sticky top-16`），只保留
   「长期记忆数 · 待找回数」与「全部 / 表达 / 词汇 / 语法 / 发音」分类；分类只改变候选集合，
   排序仍按记忆强度。列表与句子列表共用 `useIncrementalList`，首批 12 条，哨兵进入视口后
   追加 12 条，并显示「已显示 x / y 条」。顶部学习提醒最多列 5 条，其余提示去复习页。
2. **语音服务设置**：每个服务栏顶部新增「一键接入」（ElevenLabs 适配器 / Fish Audio 适配器 /
   OpenAI 官方），一次点击同时对齐接入方式、地址与模型；设置页在服务端并行探活 5578、5580、
   5583、5584 并注入「在线 / 未启动」，`GET /api/speech/services` 供「重新检测」强制刷新；
   回环适配器隐藏 API 密钥输入并说明密钥在服务端，音色提供默认与六个兼容别名快捷按钮。
3. **数据扩充**：默认学习记忆由 5 条增至 50 条（表达 / 词汇 / 语法 / 发音四类，覆盖 20+
   场景，强度与到期时间错开，含迁移目标）；精讲地道表达由 100 条增至 140 条并补齐
   `exampleTranslation`，全库 1040 条；精讲条目按习语 / 固定搭配 / 短语动词 / 句型标注类型。
4. **演示模式**：`NEXT_PUBLIC_DEMO_MODE=true` 时用默认记忆填充工作区，正式环境仍从空记忆开始。

自动化结果：

- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm --dir frontend test`：85 文件、659 用例通过。
- `pnpm build`：通过（`NEXT_DIST_DIR=.next-verify`）；`/workspace/settings` 因服务端探活改为
  按请求渲染（ƒ），其余路由不变。
- 新增测试：探测路由（5584 模拟 503、全部拒连）、长期记忆吸顶/分类/分批、句子列表分批、
  学习提醒截断、一键接入与回环隐藏密钥。

未执行：浏览器手工截图核验（当前环境无浏览器自动化），390px 视觉验收待补。

## 2026-11-14 例句就近译文开关与高亮、语音探活三态与 502 运行时验证

改动：

1. **例句译文开关就近**：词库行已在前一轮把译文开关移到例句末尾；本轮把复习考试卡的
   「显示译文/收起译文」从单独居中一行移到例句句尾（`expression-exam-card.tsx`），与词库
   同一位置习惯，并补 aria-label「显示/收起 <phrase> 的例句译文」。
2. **目标表达高亮**（前一轮完成，本轮验证）：词库与考试卡例句经 `ExpressionText` +
   `splitExpressionHighlights` 高亮目标表达；词库数据测试断言 140 条精讲词条的每条拓展
   例句都能命中高亮（含 `keeps tabs on` 等词尾变化与不规则过去式）。
3. **精讲表达记忆增强**（前一轮完成，本轮验证）：`idiomatic-expression-memory.ts` 对 140 条
   精讲词条全部提供 `usage`、`memoryTip` 与各 2 条带中文翻译的拓展例句；考试卡作答后展示
   「更多例句 / 用法 / 记忆提示」。本轮统一两个未加引号的 key（`bandwidth`、`bottleneck`）。
4. **语音探活三态**：`LocalSpeechServiceProbe` 新增 `state: ready | unconfigured | down`；
   适配器 `/health` 返回 503 且 body 带 `configured:false` 时显示「已启动·缺密钥」徽章并
   提示对应 `.env.local`；「检测本机服务」在缺密钥时不再误报「均未启动」；一键接入圆点
   用空心警示点区分缺密钥态。
5. **失败提示精确化**：`describeSpeechFailureHint` 识别本机适配器凭据错误后直接给出
   `backend/services/elevenlabs/.env.local`（ELEVENLABS_API_KEY，需 sk_ 开头 Secret Key）/
   `backend/services/fishaudio/.env.local`（FISH_API_KEY）；`/api/speech/*` 的
   `speech_endpoint_unreachable` 按端口号给出对应启动命令（端口取自规则表）。

运行时验证（本机实际执行）：

- 定位 5583/5584「仍出现 502」的两个根因：运行中的适配器是错误码改造前启动的旧进程；
  且现存 `ELEVENLABS_API_KEY` 是 64 位 Key ID 而非 `sk_` Secret Key。重启两个适配器后，
  经 `/api/speech/tts/test` 实测：5583 上游 401（`invalid_api_key`）→ 诊断返回
  `status:401 speech_credentials_invalid`；5584 上游 401 → `status:401
  speech_credentials_invalid`。两个上游域名当前出口可达（不再表现为 503 unreachable）。
- 浏览器实测（demo 构建 + 5579）：不可达地址（浏览器历史保存的 5590）提示带具体地址与
  `speech_endpoint_unreachable`；一键接入 5583 后测试提示精确到
  `backend/services/elevenlabs/.env.local` 与 `sk_` 要求。
- 视觉核验（内置浏览器截图 + 结构断言，1440px 与 390px）：词库行目标表达 `<mark>` 高亮、
  译文开关位于例句段落内且展开正常；考试卡作答后「更多例句 / 用法 / 记忆提示」完整呈现；
  词库、复习、设置页在 390px 均无横向溢出。
- `pnpm check`：通过（86 个前端测试文件 / 670 用例 + 后端套件 + biome + tsc）。
- `pnpm build`：通过。

未执行：

- ~~有效 `sk_` Secret Key 与有效 Fish Audio Key 下的真实合成~~ → 已在同日补齐，见下。

### 有效密钥后的复测（同日 2026-11-14）

用户提供真实密钥并写入两份 `.env.local`（gitignore 覆盖，未入库），重启两个适配器后实测：

- `POST /api/speech/tts/test`（经 5577 开发服务器）：5583 ElevenLabs 返回 `ok:true`、
  `audio/mpeg` 41.8 KB / 3.1 s；5584 Fish Audio 返回 `ok:true`、`audio/mpeg` 38 KB / 3.0 s。
- 设置页 UI（demo 构建 + 5579）：TTS 一键接入 ElevenLabs 后「测试合成接口」显示绿色
  「语音合成接口可用，音频已正常返回。audio/mpeg · 46.2 KB · 2625 ms」；ASR 一键接入
  ElevenLabs 后「测试识别接口」显示绿色「语音识别接口可用」（内置测试音频经 scribe_v2
  返回空文本）；切 Fish Audio 预设合成同样绿色（43.3 KB · 2018 ms）。
- `POST /api/speech/asr` 直测：5583 把 440 Hz 测试音转写为 `[beep]`；5584 返回 402
  `speech_payment_required`——`transcribe-1-pro` 需账户充值。据此修正 fishaudio 适配器的
  402 提示按服务区分：合成建议改用免费模型 `s2.1-pro-free`，识别不再误导（Fish Audio
  暂无免费识别模型），补 `test_payment_required_hint_matches_service` 用例
  （`pnpm fishaudio:test` 49 用例通过）。
- 「本机服务」徽章：本机 TTS 网关在线、ElevenLabs 适配器在线、Fish Audio 适配器在线、
  本机 ASR 服务未启动（5580 未启动，与实际一致）。

剩余未执行：Fish Audio 识别（`transcribe-1-pro`）需账户充值后才能验证；本机 ASR 5580
链路未启动。

## 2026-11-14 语音参数兜底、模型/音色配置对齐官方文档、未登录对话同步门控

改动：

1. **语音参数兜底默认值**：5583 ElevenLabs 适配器在上游拒绝时自动重试一次——
   `404 voice_not_found` 改用默认音色（George），`400 bad_request` 且消息含 "invalid ID"
   改用默认模型；5584 Fish Audio 在 `reference_id` 被 400/404/422 拒绝时去掉音色重试一次。
   兜底仍失败时保留上游语义，`voice_not_found` 提示「可清空音色直接使用服务端默认音色」。
   覆盖场景：设置页手误音色名（如 `multilingual`）不再让整条语音链路报
   `speech_request_rejected`。
2. **模型选择对齐官方文档**：ElevenLabs 默认 TTS 模型由 `eleven_v4` 改为
   `eleven_flash_v2_5`（官方模型页标注 API 半价档，约 100ms 延迟档位；2026-11-14 在免费层
   实测可用）；规则表新增 `models.localApiTtsOptions`（flash_v2_5 / v4 / multilingual_v2 /
   v3）、`localApiAsrOptions`、`fishAudioTtsOptions`、`fishAudioAsrOptions`，设置页对
   5583/5584 显示模型快捷按钮。
3. **音色映射修复与补充**：实测发现旧 `nova → Rachel(21m00Tcm4TlvDq8ikWAM)`、
   `shimmer → AZnzlk1XvdvUeBnXmlld` 两个映射目标已转付费专属（402 paid_plan_required），
   改映射到仍免费的 Laura / Lily；新增 `voice.premadeElevenLabs` 官方预置音色表
   （george/adam/bill/brian/callum/emma/jessica/laura/liam/lily/matilda/river/roger），
   全部用免费层合成请求逐一验证。设置页音色快捷按钮按适配器区分：5583 显示预置音色，
   5584 无公开预置音色（reference_id 账户私有），OpenAI 兼容服务仍显示六个兼容别名。
4. **未登录对话同步门控**：`use-conversation-sessions` 接入 `useAuth`——未登录/匿名/演示
   模式时完全跳过云端同步（此前每次挂载都会向 `/api/conversations` 发请求并收到 401）；
   本机写入不受影响，登录后由合并流程补传本地会话。

自动化结果：

- `pnpm elevenlabs:test`：43 用例通过（含 voice/model 兜底重试、兜底失败保留可执行提示、
  规则表别名与 Python 镜像一致性）。
- `pnpm fishaudio:test`：51 用例通过（含 reference_id 兜底、未发送音色不重试、402 提示
  按服务区分）。
- `pnpm --dir frontend test`：相关套件（speech-service-card、conversation-sessions、
  speech-routes）通过。

## 2026-11-14 修复 api 接入识别收不到用户输入（语音通话静音断句）

问题与定位：

- 用户反馈语音通话「收不到用户输入的声音」。适配器日志显示其 TTS 正常（17:36 两次
  `/v1/audio/speech` 200，voice=multilingual 经兜底成功），但当天没有任何新的
  `/v1/audio/transcriptions` 请求；本机 ASR（5580）全天未启动。
- 根因：HTTP API 接入的识别在语音通话里**没有「说完一句话」的触发器**。`use-browser-asr`
  的 api 分支只持续累积录音块，上传仅发生在 `pause()`（助手播报开始或手动静音）；
  用户说话期间没有 VAD、没有语音事件，回合永远无法提交，输入因此「石沉大海」。

修复：

- 新增 `frontend/src/features/speech/api-asr-turn-detection.ts`：镜像流式识别的客户端
  能量检测（噪声底自适应校准 500ms、说话确认 320ms、静音 1.2s 断句、单段上限 25s），
  纯逻辑按帧喂数据，5 个单元测试覆盖校准/断句/短促噪声/强制断句/重置。
- `use-browser-asr` 的 api 分支接入 Web Audio（AnalyserNode + 100ms 轮询 RMS）：
  说话开始触发 `onSpeechStart`（可打断等待中的回复），静音断句走 `flushRecordedAudio`——
  只快照已积累音频块并上传，**录音保持运行**，上传与提交期间监听不中断；
  无 AudioContext 的环境降级为原有的手动静音上传。
- 对话页「识别来源」提示更新为「说完停顿约 1 秒自动整段上传识别」。

自动化结果：检测器 5/5 通过；`tests/voice-conversation.test.tsx`（35）、
`tests/conversation-sessions.test.tsx`、`tests/speech-service-card.test.tsx`、
`tests/speech-routes.test.ts` 全部通过；biome/tsc 通过。

未执行：真实麦克风通话的端到端录音验证（浏览器环境无受控麦克风），依赖单元测试与
既有 api 链路（`/api/speech/asr` → 5583 → scribe_v2 已于同日实测可用）佐证。

### 2026-11-14 用户实测跟进：invalid_audio 与 MediaRecorder.start 失败

上一条修复上线后用户实测暴露两个叠加问题，均已定位并修复：

1. **`invalid_audio`（上游 400）**：录音跨回合后，VAD 快照上传的是 MediaRecorder 的
   **后续分片**——webm 分片只有第一块带文件头，无头的分片不是独立音频文件，上游以
   invalid_audio 拒绝。实测确认完整 webm（原始与规范化 mime）都能通过链路
   （440Hz 振荡器 → MediaRecorder → `/api/speech/asr` → 200 `[dial tone]`），
   问题在分片而非格式。
2. **`MediaRecorder.start` 抛错**：`use-browser-asr.teardown` 在回合间隙停掉了
   通话运行时持有的麦克风流轨道，下一轮 `start()` 在死流上建 MediaRecorder 直接失败。

修复：

- api 通道**弃用 MediaRecorder**，改为与 VAD 共用同一张 Web Audio 图采集 PCM
  （ScriptProcessorNode，与流式识别同一模式），断句时降采样 16kHz 并经
  `lib/audio-wav.ts` 的 `encodeWavBlob` 编码为**完整 WAV** 上传——每轮都是独立
  合法文件，格式问题从根上消除（25s 上限约 800KB，远低于 8MB 网关限制）。
- **轨道所有权**：`use-browser-asr` 只停自己 `getUserMedia` 获取的流；运行时持有的
  流由运行时在通话结束时释放。浏览器/本机接入同样受益。
- gateway 上传文件名按实际容器取扩展名（speech.wav/.m4a/.webm），不再固定 .webm。

自动化结果：`audio-wav` 3 用例（头部/采样编码/空样本）+ 检测器 5 用例 + 相关套件
共 91 用例通过；biome（0 警告）、tsc、`pnpm build` 通过。

未执行：真实麦克风端到端通话（需人工验证）；已在 IAB 用振荡器验证 webm 全链路与
`/api/speech/asr` → 5583 → scribe_v2 的 WAV 上传（同日 `[beep]`）。

## 2026-11-14 对话链路实测修复：契约修复重试与认证降级统一

用户实测反馈两个问题：

1. **「未按输出契约返回」（图1）**：模型对语音输入 "Hi" 直接回了纯文本
   "Hello! How have you been?"，翻译 / 纠错 / 判句缺失。`parseProviderPayload`
   已有 JSON.parse + 括号配对提取，能容忍围栏与前后缀散文，本例确认是模型
   完全没有输出 JSON。
   **修复**：路由层新增契约修复重试——`contractApplied=false` 时用一次聚焦请求
   （仅含解析器消费的最小 JSON 契约说明 + 学习者原句 + 待重排回复）让模型重排；
   修复失败（限流 / 超时 / 仍不合规）保持既有降级展示，不阻塞回复本身。
2. **`/api/conversations` PUT 401**：用户已登录（workspace 可进、cookie 有效），
   但六个 `auth.getUser()` 认证路由在本机受限网络下 Node fetch 连不上 Supabase
   Auth（AuthRetryableFetchError）而直接判 401——workspace 守卫早已有
   `hasUsableSession` 网络故障降级，API 路由没有。
   **修复**：`lib/supabase/session.ts` 新增 `resolveSessionUser`（返回完整 User；
   仅网络不可达时降级读 cookie 会话，4xx 一律未登录），`hasUsableSession` 改为
   基于它实现；`/api/conversations`、`/api/conversation`、`/api/expressions`、
   `/api/account`、`/api/memory-documents`、`/api/translation` 六个路由统一接入。

自动化结果：新增 7 个用例（修复重试成功 / 修复失败保持降级 / resolveSessionUser
四态 / conversations PUT 网络降级）；认证与对话相关 8 个套件共 84 用例、更广泛
回归 63 用例全部通过；biome、tsc、`pnpm build` 通过。

未执行：真实登录环境的浏览器端到端（需 Supabase 凭据与受限网络复现）；契约修复
对免费档模型的实际成功率需持续观察。


## 2026-11-14 双语识别与播报实证、识别条上浮、Fish 说话人标记清理

用户要求：识别中英文、回答中英文，两个语音服务都要支持；识别中的消息固定在输入框上方。

实证（真实上游请求）：

- **中文合成**：Fish Audio `s2.1-pro-free` 合成「你好，最近怎么样？」→ 163KB WAV ✓；
  ElevenLabs `eleven_flash_v2_5` + George 同文本 → 27.6KB 音频 ✓（免费层用 mp3 输出）。
- **中文识别**：ElevenLabs scribe 对中文 WAV 精确转写「你好，最近怎么样？」（未传语言，
  自动检测，中英混说同样支持）✓；Fish `transcribe-1-pro` 也转写成功，但文本混入
  `<|speaker:0|>` 说话人标记。
- **限制发现**：ElevenLabs 免费层 TTS 输出仅 mp3——`wav_44100` 被上游 403
  `output_format_not_allowed`（Pro 档以上）；此前一度误报为凭据问题。适配器已把该错误
  映射为 `400 elevenlabs_request_rejected` 并提示改用 mp3；语音通话运行时固定 mp3，不受影响。

修复：

1. **Fish 转写清理**：适配器剥离 `<|speaker:N|>` 说话人标记（`re.sub`），测试覆盖。
2. **识别条上浮**：语音通话时在输入区（通话面板）上方固定渲染识别条——有转写文本时显示
   「你（识别中）：…」+ 弹跳圆点，静音断句上传中显示「正在将这句话转换为文字…」动效；
   `role="status"` 供读屏播报。转写历史区的占位轮次动画维持上一轮实现。

自动化结果：elevenlabs 45 / fishaudio 52 用例通过（含标记清理与格式门槛映射两个新用例）；
前端语音/对话套件 83 用例通过；biome、tsc 通过。

未执行：真实麦克风双语通话的端到端听感验证（需人工）；Fish ASR 转写质量依赖账户余额。
