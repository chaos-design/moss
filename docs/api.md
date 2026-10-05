# API 文档

> 状态：当前线协议
> 所有示例中的密钥、token 和 ID 均为占位值。

## 通用约定

| 接口 | 鉴权 | 限额 | 数据面 |
| --- | --- | --- | --- |
| `GET /api/conversation` | 无 | 无 | 临时模型配置公钥 |
| `PUT /api/conversation` | 加密的自带模型配置 | 20 次/分钟/endpoint | 模型连接验证 |
| `POST /api/conversation` | Supabase session 或加密自带配置 | 20 次/分钟/主体 | 场景推理 |
| `GET /api/conversations` | Supabase session | 120 次/分钟/用户 | 当前用户的对话历史 |
| `PUT /api/conversations` | Supabase session | 120 次/分钟/用户 | 幂等保存或完成对话 |
| `DELETE /api/conversations` | Supabase session | 120 次/分钟/用户 | 删除一条对话 |
| `GET /api/expressions` | Supabase session | 120 次/分钟/用户 | 当前用户导入的表达 |
| `POST /api/expressions` | Supabase session | 120 次/分钟/用户 | 分批导入或更新表达 |
| `DELETE /api/expressions` | Supabase session | 120 次/分钟/用户 | 删除一条导入表达 |
| `GET /api/account` | Supabase session | 10 次/小时/用户 | 导出当前用户全部云端数据 |
| `DELETE /api/account` | Supabase session + 邮箱确认 | 5 次/小时/用户 | 删除账户并审计残留 |
| `POST /api/memory-documents` | Supabase session | 60 次/分钟/用户 | 复习与跟读向量记忆 |
| `POST /api/translation` | Supabase session 或加密自带配置 | 30 次/分钟/主体 | 单条翻译 |
| `POST /api/speech/asr` | 无（请求自带端点配置） | 120 次/分钟/endpoint | 单段语音转写 |
| `POST /api/speech/tts` | 无（请求自带端点配置） | 240 次/分钟/endpoint | 文本转音频 |
| `WS /v1/asr/stream` | 可选部署 token | 连接数与消息大小限制 | PCM 与转写 |
| FunASR 2-pass WebSocket | 由本地服务决定 | 由本地服务决定 | PCM 与转写 |
| `POST /v1/tts/synthesize` | loopback + Origin | 文本长度与服务资源限制 | 文本与 WAV |

Next.js API 成功响应使用 `{ "data": ... }`，失败响应使用
`{ "error": { "code": "...", "message": "..." } }`。Provider 原始错误、响应正文和凭据
不返回客户端。认证请求通过 Supabase `check_rate_limit` RPC 按用户 ID 和固定业务 bucket
执行跨实例原子限流；数据库限流不可用时，服务端公共模型请求拒绝继续。演示模式和携带
加密 BYOK 配置的请求使用容量有界的单进程固定窗口保护。

OpenAI 兼容模型若因推理过程耗尽输出预算而返回 `finish_reason=length`、非空
`reasoning_content` 和空 `content`，服务端会使用上限受控的更高 token 预算重试一次；
推理内容不会作为用户可见回答返回。

认证请求的固定配额：

| Bucket | 接口 | 配额 |
| --- | --- | --- |
| `conversation-generate` | `POST /api/conversation` | 20 次/分钟 |
| `translation` | `POST /api/translation` | 30 次/分钟 |
| `memory-document` | `POST /api/memory-documents` | 60 次/分钟 |
| `conversation-sync` | `/api/conversations` | 120 次/分钟 |
| `expression-library` | `/api/expressions` | 120 次/分钟 |
| `account-export` | `GET /api/account` | 10 次/小时 |
| `account-delete` | `DELETE /api/account` | 5 次/小时 |

## WebSocket `/v1/asr/stream`

独立 ASR 服务默认位于 `ws://127.0.0.1:5580`，接收单声道 little-endian PCM。
客户端可发送 `start` 配置采样率、格式和部署令牌，随后以二进制消息连续发送音频：

```json
{
  "type": "start",
  "sampleRate": 16000,
  "format": "int16",
  "engine": "sensevoice",
  "languages": ["zh", "en"],
  "context": "Vocabulary: latte, decaf, oat milk.",
  "token": "optional-deployment-token"
}
```

`engine` 支持 `qwen3-asr` 和 `sensevoice`。`languages` 仅接受 `zh` 和 `en`，默认同时
启用；其他语言的模型结果会被丢弃。`context` 最多 1000 字符，只用于当前连接的 Qwen3-ASR
场景词汇偏置。

两个引擎均按完整语音段推理。端点检测或收到 `flush` 后发送 `final`：

```json
{"type":"final","text":"Could I get 一杯咖啡？","segment":0,"tokens":[],"timestamps":[],"language":"zh"}
```

`flush` 提交当前段但保持连接；服务端端点检测也会提交当前段并继续接收下一段，
因此单连接支持多次发言。`stop` 提交后关闭，`ping` 返回 `pong`。完整协议、错误码和部署参数见
[`backend/services/asr/README.md`](../backend/services/asr/README.md)。

## FunASR 2-pass WebSocket

对话设置中的 `FunASR` 选项直接连接标准 FunASR WebSocket 服务，默认地址为
`ws://127.0.0.1:10095`，可通过 `NEXT_PUBLIC_FUNASR_SERVICE_URL` 覆盖。浏览器在连接建立后
发送 `mode: "2pass"`、`chunk_size: [5, 10, 5]`、16 kHz PCM 和 ITN 配置；将
`2pass-online` 结果显示为临时转写，将 `2pass-offline` 或 `is_final_sentence: true` 结果
提交为用户消息。结束连接时发送 `{ "is_speaking": false }`。

该接入只允许 loopback WebSocket 地址。FunASR 服务的鉴权、Origin 限制、TLS 和资源控制由
其部署方负责；Moss 不持久化原始麦克风音频。外部 FunASR 无法建立连接时，浏览器自动回退
到内置 Moss ASR 的 SenseVoice 引擎，并将本地语音识别选择同步切换为 SenseVoice。

## Python TTS `POST http://127.0.0.1:5578/v1/tts/synthesize`

Python TTS 服务统一接收所有语音合成请求并返回 `audio/wav`。该服务只绑定 loopback，
仅允许本地 Moss Origin，不经过 Next.js 或 Supabase。

```json
{
  "engine": "kokoro",
  "text": "Could I get a coffee, please?",
  "voice": "af_bella",
  "speed": 1,
  "seed": 2024
}
```

`engine` 支持 `audio8`、`kokoro` 和 `cosyvoice`。`text` 最多 1000 字符，`speed` 必须在
`0.5` 到 `1.5`。Audio8 单个合成片段最多 150 个字符。`POST /v1/tts/prepare` 在语音会话
开始前准备指定引擎，`GET /health` 返回网关和所有适配器状态。Audio8 通过独立 `5582`
sidecar 接入，使用 `multilingual` 音色并通过 `pnpm audio8:setup` 安装。Kokoro 由 Python
网关按需加载英文 v1.0 或中文 v1.1-zh INT8 ONNX 模型；CosyVoice 通过独立 `5581` sidecar 接入。
浏览器仅保存引擎和音色选择，不加载任何 TTS 模型。服务未启动时，前端使用浏览器原生
`speechSynthesis` 作为音频兜底。服务对相同参数的并发
请求去重，并使用 64 MB LRU 音频缓存；`X-TTS-Cache` 响应头为 `MISS`、`COALESCED` 或
`HIT`。

## 语音服务接入方式

ASR 与 TTS 各有三种接入方式，由浏览器本地配置 `moss:speech-config:v1` 决定。对话页设置浮层的
“识别来源”与“播报来源”以及偏好设置的“语音服务接入”卡片编辑同一份配置。该配置不会写入学习
记忆、日志或 Supabase。

音色标识随接入方式解析：本机接入使用 `moss:tts-config:v2` 的引擎音色注册表（`kokoro:af_bella`
等），API 接入使用 `tts.voice` 的接口音色名（`alloy`、`nova` 或自建网关的自定义名称），
浏览器接入由系统按语言选择。

| 接入方式 | ASR 实现 | TTS 实现 |
| --- | --- | --- |
| `local`（默认） | `ws://127.0.0.1:5580/v1/asr/stream` 流式 PCM | `http://127.0.0.1:5578/v1/tts/synthesize` |
| `api` | `/api/speech/asr` → OpenAI 兼容 `/audio/transcriptions` | `/api/speech/tts` → OpenAI 兼容 `/audio/speech` |
| `browser` | 浏览器 `SpeechRecognition` | 浏览器 `speechSynthesis` |

`local` 接入地址可在设置中覆盖，留空时使用 `NEXT_PUBLIC_ASR_SERVICE_URL` 与
`NEXT_PUBLIC_TTS_SERVICE_URL`。`local` 连接失败时，前端在当前会话内自动回退到浏览器引擎并提示
一次，不改写用户已保存的接入方式。`api` 接入的默认根地址来自 `NEXT_PUBLIC_ASR_API_URL` 与
`NEXT_PUBLIC_TTS_API_URL`，模型来自 `NEXT_PUBLIC_ASR_API_MODEL` 与
`NEXT_PUBLIC_TTS_API_MODEL`；`tts.voice` 留空时使用 `alloy`。

`api` 识别按段上传：接口没有中间结果和语音起点信号，因此该接入方式不提供实时字幕，也不支持用
说话打断 AI 播报，需要打断时使用文字输入。`browser` 识别由浏览器实现决定行为，静默一段时间后
浏览器会结束一次会话，前端会自动重新开始监听。识别引擎选择器（SenseVoice、Qwen3-ASR、
FunASR）只在 `local` 接入下有意义，其他接入方式不显示该控件。

## POST `/api/speech/asr`

把一段录音转写为文本。浏览器永远不直接请求第三方语音服务：接口由 Next.js 校验端点、限流并转发，
因此第三方 CORS 策略不影响可用性，密钥也不会进入页面脚本。

```json
{
  "endpoint": {
    "endpoint": "https://speech.example.com/v1",
    "apiKey": "sk-...",
    "model": "whisper-1"
  },
  "audioBase64": "AAECAwQ...",
  "mimeType": "audio/webm",
  "language": "zh"
}
```

成功响应：

```json
{ "data": { "text": "Could I get a latte?" } }
```

约束与错误：

- `endpoint` 必须通过与推理端点相同的策略：生产环境仅允许 HTTPS 公网主机，且主机名需在
  `AI_ALLOWED_BROWSER_SPEECH_HOSTS` 白名单内（默认包含 `api.openai.com`、`api.anthropic.com`）；
  非生产环境额外允许回环地址。URL 不得携带用户名或密码。
- 解码后的音频不超过 8 MB，请求体不超过 12 MB，`language` 可省略。
- 上游使用 `multipart/form-data`：`file`、`model`、`response_format=json`、可选 `language`。
- 上游 30 秒未响应视为不可用。错误码：`invalid_json`、`invalid_request`、
  `invalid_speech_endpoint`、`invalid_audio`、`request_too_large`、`rate_limited`、
  `speech_endpoint_unreachable`、`speech_upstream_error`、`speech_invalid_response`、`asr_failed`。
- 服务端只返回规范化文案，不回传上游响应正文；密钥仅用于当次转发，不落盘、不记录。

## POST `/api/speech/tts`

合成一段语音并原样返回音频字节，响应 `Content-Type` 与上游一致，`Cache-Control: no-store`。

```json
{
  "endpoint": {
    "endpoint": "https://speech.example.com/v1",
    "apiKey": "sk-...",
    "model": "tts-1"
  },
  "text": "Could I get a coffee, please?",
  "voice": "alloy",
  "speed": 0.95,
  "format": "mp3"
}
```

- `text` 去除首尾空白后长度为 1–2000 字符，`voice` 必填且不超过 120 字符，`speed` 收敛到
  `0.5`–`2`，`format` 取 `mp3`、`opus`、`aac`、`flac`、`wav`、`pcm` 之一，默认 `mp3`。
- 端点策略、限流（240 次/分钟/endpoint）与错误码语义同 `/api/speech/asr`。
- 上游返回非 `audio/*` 内容时记为 `speech_invalid_response`，浏览器据此回退到系统语音。

## POST `/api/conversation`

生成下一轮场景对话。接口最多接收 24 条历史消息，每条消息最多 4000 字符，并只向模型转发最近 12 条。

模型配置集合与当前启用项只持久化在浏览器 `moss:model-config:v1`。客户端仅取当前启用
配置，先从 `GET /api/conversation` 获取 RSA-OAEP 公钥，再以一次性 AES-256-GCM 密钥加密。
对话请求只携带 `modelConfigEnvelope` 密文，不出现 API Key、接口地址或模型名称明文。
服务端仅在当前请求内解密并用于推理，不写入日志、数据库或 Supabase 向量记忆。

### Input

```json
{
  "sceneId": "coffee",
  "language": "auto",
  "tutorMode": "coach",
  "memory": {
    "shortTerm": {
      "sceneId": "coffee",
      "activeGoal": "自然完成定制点单，并确认杯型。",
      "turnCount": 3,
      "recentUserInputs": [
        "Could I get a latte with oat milk, please?"
      ]
    },
    "longTerm": [
      {
        "id": "polite-request",
        "label": "礼貌提出请求",
        "expression": "Could I get ..., please?",
        "source": "餐厅用餐",
        "guidance": "把点单句型迁移到咖啡店",
        "strength": 48
      }
    ]
  },
  "messages": [
    {
      "role": "user",
      "content": "Could I get a latte with oat milk, please?"
    }
  ],
  "modelConfigEnvelope": {
    "version": 1,
    "keyId": "temporary-key-id",
    "wrappedKey": "base64url-rsa-wrapped-aes-key",
    "iv": "base64url-aes-gcm-iv",
    "ciphertext": "base64url-encrypted-config-and-tag"
  }
}
```

`tutorMode` 可选，省略时默认为 `coach`。允许值：

- `natural`：优先保持角色对话，只纠正会阻碍理解或造成实际误解的问题。
- `coach`：先回应含义，再温和纠正高影响问题并按需提供例句。
- `english`：主回复和学习辅助均使用英语，`translation` 留空；用户仍可手动请求单条翻译。

客户端将导师模式保存在设备级 `moss:conversation-prefs:v1` 中，请求只发送上述枚举，不发送
其他本地偏好。服务端拒绝未知值；旧客户端未发送该字段时沿用温和纠错。

`promptSupplement` 可选，最长 4000 字符，非字符串值与超长值一律以 `invalid_request` 拒绝。
它承载学习者在设置中编写的补充指令，服务端再次截断到 2000 字符、把 `{{` 与 `}}` 中和为空格
后追加到已渲染的基础 Prompt 末尾。基础 Prompt 与其中的 JSON 输出契约不可编辑，补充层只能
追加，因此无法破坏回复解析。该字段不进入学习记忆、日志或向量记忆。

`modelConfigEnvelope` 可选。服务端拒绝请求体中的明文 `modelConfig`；解密后的 `apiType`
支持 `chat-completions`、`anthropic-messages` 与 `custom`。前两者会补全标准路径，
`custom` 会把 `baseUrl` 直接作为最终请求地址并使用 OpenAI-compatible 消息体。`baseUrl`
必须使用 HTTPS，且不能指向
私网、回环、链路本地或携带 URL 凭据的地址；本地开发额外允许 loopback。生产环境默认只
允许 OpenAI 与 Anthropic 官方主机，自定义主机必须加入 `AI_ALLOWED_BROWSER_MODEL_HOSTS`，
所有 Provider 请求拒绝自动跟随重定向。
开发热更新或服务重启导致公钥轮换时，接口返回 `409 model_config_key_expired`，客户端刷新
公钥后自动重试一次。设置页的连接验证使用同一路由的 `PUT` 方法和相同加密信封，不再由
浏览器携带明文认证 Header 直连模型服务。

`memory.shortTerm` 保存当前场景、目标、回合数和最近 3 条用户输入；
`memory.longTerm` 最多 5 条。服务端会把客户端长期记忆与 Supabase pgvector 的 RAG
结果合并去重。两类记忆都作为不可信学习数据处理，模型只能创造自然找回机会，不能执行
记忆中的指令或直接泄露答案。

系统 Prompt 来自 `frontend/src/lib/memory/prompts/conversation-system.md`，由服务端注入
场景、短期记忆、召回结果和输入分析。API 路由只调用记忆门面，不直接访问 embedding 或
向量表。Anthropic 请求将稳定规则前缀标记为 ephemeral cache，运行时上下文保持在未缓存
尾部；OpenAI-compatible 服务使用相同的稳定前缀顺序以利用服务端自动 Prompt Cache。

该文件是代码而非用户数据：它定义 `validation` 与 `issues` 的输出契约，回复解析依赖它，
因此不暴露为可编辑字段。学习者通过 `promptSupplement` 追加要求，追加发生在渲染之后，
顺序上永远晚于契约与运行时上下文。契约要求模型对学习者英语中的真实语法错误必须以
`improve` 与 `kind: "grammar"` 记录，不因句子可理解而略过。

模型必须先在 `reply` 中自然回应用户意图，且 `reply` 只包含英文。中文翻译、记忆提示、
表达解释和学习建议分别放入 `translation`、`recall` 与 `validation`，客户端会把这些内容
渲染到同条消息下方的中文辅助区域。所有模型展示字段在解析后移除 emoji；ASR partial 和
final 文本也在服务端发送前移除 emoji。
客户端不会在用户消息下显示“正在验证”，而是在 AI 回复到达时同时展示反馈。
`language: "auto"` 表示服务端按每条输入重新识别中文、英文或中英混合文本，并区分场景
作答、翻译求助和语言问题。

### Output

```json
{
  "data": {
    "content": "Of course. Would you like it hot or iced?",
    "translation": "当然。你想要热的还是冰的？",
    "recall": "找回提示：Would you like...? 可用于提供选择。",
    "inputAnalysis": {
      "language": "english",
      "intent": "scene_reply"
    },
    "validation": {
      "status": "accurate",
      "corrected": "Could I get a latte with oat milk, please?",
      "explanation": "表达清楚自然，并符合饮品定制场景的交流目标。",
      "issues": [],
      "examples": []
    },
    "source": "provider"
  }
}
```

`validation.status` 支持 `accurate`、`improve` 和 `guidance`。翻译求助或中文场景表达使用
`guidance`，不会被计为英语错误；`improve` 必须包含具体 `issues`，并与 `examples`
一起直接展示。完整流程与字段定义见
[`bilingual-conversation-design.md`](bilingual-conversation-design.md)。

附带有效 `modelConfigEnvelope` 的自带密钥请求无需登录即可推理。未附带时，正常模式要求有效
的 Supabase 用户 session。只有显式设置 `NEXT_PUBLIC_DEMO_MODE=true` 时接口才返回
`source: "demo"`，且演示模式不会调用外部 AI provider。旧变量 `AI_MODEL` 仍可作为模型名称
的兼容配置。

### 错误

```json
{
  "error": {
    "code": "invalid_request",
    "message": "场景或对话消息格式不正确。"
  }
}
```

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| `400` | `invalid_json` | 请求体不是有效 JSON |
| `400` | `invalid_request` | 字段、长度或消息数量不合法 |
| `401` | `unauthorized` | 当前请求没有有效用户 session |
| `429` | `rate_limited` | 当前用户一分钟内超过 20 次 |
| `503` | `rate_limit_unavailable` | 共享限流存储不可用，服务端拒绝绕过保护 |
| `503` | `service_not_configured` | Supabase 或 AI provider 未配置 |
| `502` | `provider_unavailable` | 上游 AI 服务不可用；响应不包含上游错误详情 |

### 客户端错误文案

接口只返回经过审校的文案。浏览器端再经过 `frontend/src/lib/user-error.ts` 归一化后才允许进入
toast、对话记录和本机存储，规则如下：

- 文案含中文、不含技术标记（`HTTP <状态码>`、`[object Object]`、连续 20 个以上 ASCII 字符、
  `undefined`）且不超过 120 字符时，视为可展示文案，原样保留。
- 其余情况按失败形态归类：`fetch` 失败与连接错误归为网络失败，非 JSON 响应体归为解析失败，
  `HTMLMediaElement.play()` 拒绝归为浏览器拦截播放，其余归为调用方给定的兜底文案。
- 抛出的值若带数值 `status`，先按状态码映射；401/403/429/5xx 各自有独立文案。
- 中断（`AbortError`）不参与归一化，按控制流原样抛出，调用方据此区分打断与失败。

因此上游细节、栈信息与 HTTP 状态文本都不会出现在界面上；归一化后的文案才会被持久化。

## POST `/api/translation`

按需翻译单条 AI 回复。只有用户点击该回复下的“翻译”按钮且当前消息未携带中文时，前端
才会调用此接口。当前启用的浏览器模型配置通过加密信封随请求发送，不传输或持久化明文；
该模式在共享限流不可用时回退到容量有界的单进程限流。

### Input

```json
{
  "text": "Would you like it hot or iced?"
}
```

### Output

```json
{
  "data": {
    "translation": "你想要热的还是冰的？"
  }
}
```

## `/api/conversations`

登录用户的对话历史同步接口。客户端始终先写版本化 localStorage，再异步调用该接口；请求失败
不会回滚当前对话。服务端从 Supabase session 获取用户身份，客户端不能指定 `user_id`。

`GET` 使用不透明的 `cursor` 分页，每页最多返回 50 条会话。首个请求不传游标，后续请求
使用上一页的 `nextCursor`；`nextCursor` 为 `null` 表示已经读完。应用客户端会自动连续
读取全部页，本地不会再按固定会话数静默截断。

```json
{"data":{"userId":"user-id","sessions":[],"nextCursor":"50"}}
```

`PUT` 接收单条完整会话，以 `client_id` 和消息 `client_id` 幂等保存。新建话题时，当前已有
用户消息的会话会更新为 `completed`；从历史继续对话时重新变为 `active`。

```json
{
  "id": "coffee-1724832000000-ab12cd",
  "sceneId": "coffee",
  "sceneTitle": "咖啡店点单",
  "partnerName": "Mia",
  "startedAt": "2026-08-28T08:00:00.000Z",
  "updatedAt": "2026-08-28T08:05:00.000Z",
  "durationSeconds": 42,
  "status": "completed",
  "messages": []
}
```

`DELETE` 使用 `?sessionId=<client-id>` 删除当前用户的会话。RLS 同时校验消息行及其父会话的
所有权。

## `/api/expressions`

内置 1000 条表达随 Web 构建发布，不经过接口。该接口只同步当前用户通过 CSV 或 JSON
导入的表达；浏览器先写入版本化 localStorage，再按每批最多 200 条调用 `POST`，因此整份
文件不会被静默截断。

`GET` 每页返回最多 200 条，并使用十进制 `cursor` 继续读取：

```json
{
  "data": {
    "cloudAvailable": true,
    "userId": "user-id",
    "nextCursor": null,
    "items": [
      {
        "clientId": "expression-ab12cd",
        "phrase": "keep an eye on",
        "meaning": "留意；照看",
        "why": "eye 代表观察，keep 表示持续维持注意。",
        "origin": "由视觉动作形成的常用表达。",
        "example": "Could you keep an eye on my bag?",
        "context": "通用",
        "kind": "idiom",
        "sceneCategory": "social",
        "source": "imported"
      }
    ]
  }
}
```

`POST` 请求体使用 `{ "items": [...] }`，单批最多 200 条且请求体最多 2 MB。
`sceneCategory` 只接受 `clothing`、`dining`、
`housing`、`transport`、`work`、`social`、`health`、`services`、`learning` 和
`emergency`；`context` 只接受 `日常`、`职场`、`通用`；`kind` 只接受 `idiom`、
`collocation`、`phrasal-verb`、`sentence-pattern`。服务端从 session 写入 `user_id`，
并按 `(user_id, scene_category, normalized_phrase)` 幂等更新。

`PUT` 请求体使用 `{ "item": { ... } }`，按当前用户和稳定 `clientId` 更新单条导入表达。
字段校验与 `POST` 相同；若修改后的场景和规范化表达与另一条记录冲突，返回 `409`。

`DELETE` 使用 `?clientId=<client-id>`。演示模式下读取返回空云端集合，写入与删除返回
`202`，本机内容继续可用。浏览器编辑和删除均先更新本机数据，再调用对应云端接口。

## `/api/account`

`GET` 分页读取当前用户在所有用户数据表中的完整记录，返回
`application/json` 下载文件。导出包含账户元数据、对话、消息、进度、问题、复习、跟读、
学习事件、学习记忆快照、向量文档和导入表达；不包含只存在当前浏览器的模型配置和 API
密钥。响应使用 `Cache-Control: no-store`。内部滥用防护计数不属于学习数据导出，但会随
账户删除并纳入残留检查。

`DELETE` 请求体必须提供与当前账户一致的邮箱：

```json
{"confirmation":"learner@example.com"}
```

服务端在删除前以 HMAC 用户指纹创建审计记录并记录向量文档数量，再通过 Supabase Admin
删除 Auth 用户。外键级联完成后逐表检查残留并更新审计状态。成功响应：

```json
{"data":{"deleted":true,"auditId":"audit-id","vectorDocumentsDeleted":12}}
```

若账户已删除但残留检查或审计更新失败，响应仍包含 `"deleted": true`，客户端必须清理本机
Moss 数据并结束当前会话。服务端不向客户端返回 service-role key、审计密钥或原始数据库
错误。

## GET `/auth/callback`

Supabase OAuth 和邮箱验证回调。读取 `code` 并交换 session，然后跳转到 `next`。

### Query

```json
{
  "code": "supabase-auth-code",
  "next": "/workspace"
}
```

`next` 只接受以单个 `/` 开头的站内路径，非法值会回退到 `/workspace`。

## POST `/api/memory-documents`

将已在本机保存的复习或跟读结果转为长期向量文档。接口只接受结构化学习结果，不接收
`user_id`、模型配置或原始音频；服务端从 Supabase session 获取用户身份，并使用部署侧的
`AI_EMBEDDING_MODEL`。

### Input

```json
{
  "sourceType": "review",
  "sourceId": "clarify-trade-off",
  "sceneId": "meeting",
  "sceneTitle": "项目会议",
  "label": "澄清取舍",
  "expression": "Could you clarify the trade-off?",
  "explanation": "Ask for the exact point that needs explanation.",
  "strength": 68,
  "rating": "good",
  "successful": true
}
```

`sourceType` 为 `shadowing` 时，结果字段改为 `focusWord`、`overallScore`、
`clarityScore`、`fluencyScore`、`rhythmScore` 和 `durationSeconds`。服务端以
`(user_id, source_type, source_id)` 幂等更新最新结果。

### Output

```json
{"data":{"stored":true}}
```

未配置 embedding 时返回 `202` 与 `{"data":{"stored":false}}`。Provider 或数据库失败返回
`502 memory_persistence_failed`；这些失败不回滚 localStorage 学习记忆、复习调度或跟读评分。

## Supabase 数据访问

前端可在登录后通过 Supabase SDK 访问以下 RLS 保护资源：

- `profiles`
- `conversations`
- `conversation_messages`
- `learning_progress`
- `issue_records`
- `review_items`
- `shadowing_attempts`
- `learning_events`
- `learning_memory_snapshots`
- `learning_memory_documents`
- `expression_library_items`

`learning_nodes` 与已发布的 `scenes` 对认证用户只读。`backend/supabase/platform.sql`
是完整数据库定义，`backend/supabase/update.sql` 是已有实例的当前增量。

## RPC `check_rate_limit`

认证 API 在执行主要操作前调用共享固定窗口计数器。调用者只能传固定 bucket 名，额度与窗口
由数据库函数决定，不能通过客户端参数放宽：

```json
{
  "p_bucket": "conversation-generate"
}
```

返回：

```json
[
  {
    "limited": false,
    "remaining": 19,
    "reset_at": "2026-08-29T08:01:00.000Z"
  }
]
```

函数使用 `auth.uid()` 作为所有者，通过原子 upsert 更新 `rate_limit_buckets`。
`anon` 无执行权限，认证用户不能直接读取或修改底层表。RPC 调用失败时 HTTP API 返回
`503 rate_limit_unavailable`；携带有效加密 BYOK 配置的推理和翻译请求可回退到容量
有界的单实例计数。

跟读完成后先将声学评分写入本地学习记忆，再由快照同步。登录用户同时向
`shadowing_attempts` 写入清晰度、连贯度、节奏、综合分和录音时长；`audio_path` 保持为空，
录音 Blob 只用于当前页面回放。

## RPC `sync_learning_memory`

以修订号乐观并发方式写入当前用户的学习记忆快照。客户端不能指定 `user_id`，函数始终使用
`auth.uid()`，并由 `learning_memory_snapshots` 的 RLS 再次限制访问。

```json
{
  "p_state": {
    "version": 1,
    "profile": {},
    "items": [],
    "sceneProgress": {},
    "events": [],
    "updatedAt": "<ISO-8601 timestamp>"
  },
  "p_expected_revision": 3,
  "p_device_id": "browser-device-id"
}
```

修订号匹配时写入并递增；不匹配时返回当前快照，客户端合并后最多重试三次。

## RPC `match_long_term_memories`

对当前用户的长期学习记忆执行场景约束的余弦相似度检索。调用者不传 `user_id`，函数使用
`auth.uid()` 并受 RLS 保护。

```json
{
  "p_query_embedding": [0.012, -0.031, 0.008],
  "p_scene_id": "coffee",
  "p_match_count": 5,
  "p_min_similarity": 0.2
}
```

实际向量固定为 1536 维。返回内容包括记忆 ID、内容、来源场景、记忆类型、强度、元数据和
相似度。未配置 `AI_EMBEDDING_MODEL` 或检索失败时，接口回退到客户端提交的长期记忆。
