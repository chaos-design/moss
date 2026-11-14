# 语音服务通用规则配置

本文件汇总 Moss 语音链路里跨服务重复出现的规则与默认值。机器可读的唯一来源是
`frontend/src/lib/speech-rules.json`（前端由 `src/lib/speech-rules.ts` 封装，本机适配器由
`backend/services/elevenlabs/start.mjs` 与 `backend/services/fishaudio/start.mjs` 读取）；
环境变量清单在 `.env.example`，本机适配器的可提交配置模板在
`backend/services/elevenlabs/.env.local.example` 与 `backend/services/fishaudio/.env.local.example`。

新增或修改任何默认值时，先改规则表，再核对下表列出的消费方，避免多处硬编码漂移。

## 1. 服务、端口与路由归属

| 服务 | 端口 | 所有者 | 对外路由 |
| --- | --- | --- | --- |
| Next.js 应用 | 5577 | `frontend` | `/api/speech/asr`、`/api/speech/tts`、`/api/speech/tts/test` |
| TTS 网关 | 5578 | `backend/services/tts` | `/health`、`/v1/tts/prepare`、`/v1/tts/synthesize` |
| ASR 服务 | 5580 | `backend/services/asr` | `/health`、`/v1/asr/stream` |
| CosyVoice sidecar | 5581 | `tts/runtimes/cosyvoice` | 仅供 5578 网关调用，不向浏览器暴露 |
| Audio8 sidecar | 5582 | `tts/runtimes/audio8` | 仅供 5578 网关调用，不向浏览器暴露 |
| 本机 OpenAI 兼容接口（ElevenLabs） | 5583 | `backend/services/elevenlabs` | `/health`、`/v1/audio/speech`、`/v1/audio/speech/test`、`/v1/audio/transcriptions` |
| 本机 OpenAI 兼容接口（Fish Audio） | 5584 | `backend/services/fishaudio` | `/health`、`/v1/audio/speech`、`/v1/audio/speech/test`、`/v1/audio/transcriptions` |

浏览器**不直连** 5583/5584：`/api/speech/*` 负责拼接 `/audio/speech` 或
`/audio/transcriptions` 后缀、注入 Bearer 并代理转发。地址拼接规则见 `getSpeechRequestUrl()`。

## 2. 模型

| 类别 | 值 | 说明 |
| --- | --- | --- |
| 本机接口 TTS | `eleven_flash_v2_5`（默认，成本最低、免费层可用） | `MOSS_ELEVENLABS_TTS_MODEL` / `NEXT_PUBLIC_TTS_LOCAL_API_MODEL` |
| 本机接口 ASR | `scribe_v2` | `MOSS_ELEVENLABS_ASR_MODEL` / `NEXT_PUBLIC_ASR_LOCAL_API_MODEL` |
| Fish Audio TTS | `s2.1-pro-free` | `MOSS_FISHAUDIO_TTS_MODEL` / `NEXT_PUBLIC_TTS_FISH_AUDIO_MODEL` |
| Fish Audio ASR | `transcribe-1-pro` | `MOSS_FISHAUDIO_ASR_MODEL` / `NEXT_PUBLIC_ASR_FISH_AUDIO_MODEL` |
| 远程 HTTP API | `tts-1` / `whisper-1` | 设置页「HTTP API」占位默认值 |
| TTS 网关引擎 | `kokoro`、`audio8`、`cosyvoice` | 由 `engine` 参数选择 |
| ASR 引擎 | `qwen3-asr`、`sensevoice` | `MOSS_ASR_ENGINE` |
| 真正的本地权重 | `kokoro-v1.0.onnx`、`kokoro-v1.1-zh.onnx`、`Audio8/Audio8-TTS-Preview-0.6b`、`CosyVoice-300M-SFT`、`Qwen/Qwen3-ASR-1.7B`、`iic/SenseVoiceSmall` | 由各 `setup.mjs` 下载到 `models/` |

设置页对 5583/5584 提供模型快捷按钮，来自规则表 `models.localApiTtsOptions`
（`eleven_flash_v2_5` / `eleven_v4` / `eleven_multilingual_v2` / `eleven_v3`，2026-11-14
均在免费层验证可用）、`localApiAsrOptions`、`fishAudioTtsOptions`、`fishAudioAsrOptions`。

> 「本机接口」(5583/5584) 是 loopback 代理，不加载本地权重；它们把 Moss 的 OpenAI 兼容契约
> 翻译成 ElevenLabs / Fish Audio 云端 API。需要离线本地模型时应使用 5578 网关或浏览器引擎。

## 3. 音色、音频格式与速度

- 默认音色 `JBFqnCBsd6RMkjVDRZzb`（George）；`alloy`/`echo`/`fable`/`onyx`/`nova`/`shimmer`
  六个 OpenAI 音色在 5583 适配器里映射到 ElevenLabs voice ID，其余值按原样当作 voice ID。
  规则表另附 `voice.premadeElevenLabs` 官方预置音色表（george/adam/bill/brian/callum/emma/
  jessica/laura/liam/lily/matilda/river/roger），2026-11-14 用免费层合成请求逐一验证；
  `nova`/`shimmer` 原指向的音色（Rachel 等）已转为付费专属（402 paid_plan_required），
  现改映射到仍免费的 Laura / Lily。设置页对 5583 显示预置音色快捷按钮。
- Fish Audio（5584）的音色是 voice model ID（reference_id）：六个 OpenAI 别名统一映射为
  空串 = 省略 `reference_id`、使用 Fish Audio 内置默认音色；其余非空值按原样作为
  reference_id 转发。
- **兜底默认参数**：5583 在上游拒绝时自动重试一次——`404 voice_not_found` 改用默认音色，
  `400 bad_request` 且消息含 "invalid ID" 改用默认模型；5584 在 reference_id 被上游
  400/404/422 拒绝时去掉 `reference_id` 重试一次。兜底仍失败时保留上游状态码与错误码，
  `voice_not_found` 会提示「可清空音色直接使用服务端默认音色」。
- 默认输出格式 `mp3`。前端路由允许 `mp3/opus/aac/flac/wav/pcm`，但适配器只实现了
  `mp3/opus/pcm/wav`；`aac`/`flac` 会返回 `400 unsupported_format`，不会被伪装成目标格式。
- **套餐与输出格式**：ElevenLabs 免费层的 TTS 输出**只有 mp3**；wav / pcm 会被上游以
  `403 output_format_not_allowed` 拒绝（Pro 档以上才可用）。适配器把该错误映射为
  `400 elevenlabs_request_rejected` 并提示改用 mp3，不会误报成凭据问题。语音通话运行时
  固定请求 mp3，不受影响。

ElevenLabs（5583）：

| 格式 | 上游 `output_format` | Content-Type | 采样率 |
| --- | --- | --- | --- |
| `mp3` | `mp3_44100_128` | `audio/mpeg` | 44100 |
| `opus` | `opus_48000_128` | `audio/ogg` | 48000 |
| `pcm` | `pcm_16000` | `audio/pcm` | 16000 |
| `wav` | `wav_44100` | `audio/wav` | 44100 |

Fish Audio（5584）原生接受 `mp3`/`opus`/`pcm`/`wav` 格式名，转发时无需改名；
`mp3` 默认采样率 44100，`opus` 默认 48000。

- ElevenLabs：`speed` 对外接受 `0.5`–`2`，转发前收敛到 `0.7`–`1.2`；默认 `1`。
- Fish Audio：`speed` 对外接受 `0.5`–`2`，与上游 `prosody.speed` 范围一致，直接转发。
- Fish Audio 实时性档位 `latency` 取 `low`/`normal`/`balanced`，会话场景默认 `balanced`。

## 4. 配置字段规范

设置页与对话设置共用的字段规范声明在 `frontend/src/lib/speech-config.ts` 的
`speechFieldPolicies`，决定每种「服务 × 接入方式」展示并校验哪些字段：

| 服务 | 接入方式 | endpoint | model | apiKey | voice | engine |
| --- | --- | --- | --- | --- | --- | --- |
| ASR | 本机服务 (`local`) | 下拉选择（MOSS 本机服务可用项，留空用默认 5580） | — | — | — | 按所选本机服务独立匹配（Qwen3-ASR / SenseVoice / FunASR） |
| ASR | HTTP API (`api`) | 必填 | 可选 | 可选 | — | — |
| ASR | 浏览器引擎 (`browser`) | — | — | — | — | — |
| TTS | 本机服务 (`local`) | 下拉选择（MOSS 本机服务可用项，留空用默认 5578） | — | — | 按所选本机服务独立匹配（Kokoro / Audio8 / CosyVoice 音色） | — |
| TTS | HTTP API (`api`) | 必填 | 可选 | 可选 | 可选（留空 `alloy`，Fish Audio 填 reference_id） | — |
| TTS | 浏览器引擎 (`browser`) | — | — | — | — | — |

统一语义：

- **模型按服务而定**：OpenAI 等云端服务需要模型（占位符 `tts-1` / `whisper-1` 来自规则表
  `models.remoteApi`）；本机 5583/5584 适配器与自建网关可留空，网关对空模型按契约**省略
  字段转发**，由服务端默认模型接管。除非显式设置 `NEXT_PUBLIC_*_API_MODEL`，浏览器不再
  替学习者填充默认模型。
- **音色同规则**：`/api/speech/tts` 对空音色省略字段；5583 回退 George，5584 回退内置默认
  音色。TTS 的 `voice` 字段（`moss:speech-config:v1`）在设置页与对话页共享。
- **api 识别自动断句**：HTTP API 识别（整段上传）没有服务端 VAD，客户端用 Web Audio 能量
  检测补齐「说话开始/说完一句」信号（`features/speech/api-asr-turn-detection.ts`）：噪声底
  自适应校准 500ms，说话确认 320ms，静音 1.2s 断句，单段上限 25s 强制上传；断句只快照
  已积累音频块、录音保持运行，监听不中断。无 AudioContext 的环境降级为手动静音上传。
- **本机接入的引擎/音色**是本机服务自己的配置（`moss:asr-config:v1`、`moss:tts-config:v2`），
  与 HTTP API 的 `model`/`voice` 字段无关；设置页与对话页读写同一份。
- **本机服务地址**由文本输入改为下拉输入选择，选项取自规则表 `localServices`（按 ASR / TTS
  分组，模型名复用 `models`），与 `services` 中的 MOSS 本机服务可用项一致（含 5580、5578、
  5583、5584 与 FunASR 外部 10095）；触发器与每个选项同时展示服务名和地址，选择 `api`
  接入的本机适配器时接入方式随之对齐，不允许手填地址造成地址与接入方式错配。
- **引擎与音色按服务独立匹配**：本机服务、识别引擎、本机语音音色以服务 ID 为键分别持久化；
  切换本机服务时只加载该服务自己的选项与取值，不沿用其他服务的引擎或音色。
- 两个 HTTP API 接入都可先在设置页验证连通性：「测试识别接口」（内置 0.2s WAV 测试音，
  `lib/asr-test-audio.ts`）与「测试合成接口」。两个按钮按 ASR / TTS 分栏固定在卡片底部
  （字段区滚动时不随内容滚走），各自独立，分别验证本服务已配置地址与对应服务是否正常，
  结果、测试中状态与异常状态互不覆盖。

## 5. 通用限制与安全规则

| 规则 | 值 |
| --- | --- |
| 单次合成文本上限 | 2000 字符（前端网关与适配器一致） |
| 单段识别音频上限 | 8 000 000 字节 |
| 合成请求体上限 | 64 000 字节 |
| endpoint / API key / model / voice 长度 | 300 / 400 / 120 / 120 |
| 前端代理超时 | 30 000 ms |
| 本机适配器上游超时 | 45 s |
| 合成限流 | 240 次/分钟/endpoint |

- 回环主机固定为 `127.0.0.1`、`localhost`、`::1`；允许协议 `http/https/ws/wss`。
- URL 内嵌凭据一律拒绝；远程端点必须 HTTPS，生产环境还受
  `AI_ALLOWED_BROWSER_SPEECH_HOSTS` 精确主机名白名单约束。
- `ELEVENLABS_API_KEY` / `FISH_API_KEY` 只存在本机服务进程，绝不进入 `NEXT_PUBLIC_*`、
  浏览器配置或日志。浏览器「API 密钥」字段只承载可选的
  `MOSS_ELEVENLABS_ACCESS_TOKEN` / `MOSS_FISHAUDIO_ACCESS_TOKEN`，且不会转发给上游。
- 音频只在请求生命周期内存在，不落盘、不写入学习记忆。

## 6. 配置优先级

本机适配器启动时按以下顺序合并（越靠后优先级越高）：

1. `frontend/src/lib/speech-rules.json` 里的通用默认值（由各 `start.mjs` 注入）
2. `backend/services/elevenlabs/.env.local` / `backend/services/fishaudio/.env.local`
   （本机实例配置，gitignore）
3. shell / 父进程环境变量

前端 `NEXT_PUBLIC_*` 由 `frontend/next.config.ts` 在构建期内联；浏览器本地覆盖保存在
`moss:speech-config:v1`。

## 7. 测试合成规则

`/api/speech/tts/test` 与本机适配器 `/v1/audio/speech/test` 共用以下默认参数：

| 参数 | 默认值 |
| --- | --- |
| 文本 | `Moss 语音接口测试成功。` |
| 音色 | `alloy` |
| 格式 | `mp3` |
| 速度 | `1` |
| 有效音频判定 | `Content-Type` 以 `audio/` 开头、至少 4 字节，已知容器校验魔数（ID3/RIFF/OggS），PCM 只校验长度 |

两个端点都只返回结构化诊断（格式、字节数、耗时、模型、音色、错误码），**不回传音频本体**。
可复跑命令：`pnpm elevenlabs:test:synthesis`（探测已启动的 5583 服务）、
`pnpm fishaudio:test:synthesis`（探测已启动的 5584 服务）与
`pnpm elevenlabs:test` / `pnpm fishaudio:test`（不联网的单元测试）。
5584 的音色别名（含共享默认值 `alloy`）映射为空串后由内置默认音色发声。
设置页的「测试识别接口」与「测试合成接口」是两条独立链路：分别验证本服务已配置地址与对应
服务是否正常，各自维护结果、测试中状态与异常状态，互不覆盖；本服务配置变化只失效本服务
已有的测试结果。完整需求见 [Moss 详细设计](detailed-design.md#55-语音服务接入设置)。

## 8. 消费方对照

| 文件 | 用途 |
| --- | --- |
| `frontend/src/lib/speech-rules.ts` | 类型化封装、音频有效性判定、规则默认值 |
| `frontend/src/app/api/speech/tts/test/route.ts` | 前端诊断端点 |
| `frontend/src/lib/local-service-config.ts` | `localServices` 选项、服务 ID 推导、引擎/音色按服务独立匹配与回退 |
| `frontend/src/features/speech/use-local-service-config.ts` | `moss:speech-local-config:v1` 的本地持久化与跨标签页同步 |
| `frontend/src/features/settings/speech-service-card.tsx` | 设置页「测试识别接口」「测试合成接口」、本机服务下拉与引擎/音色独立匹配 |
| `backend/services/elevenlabs/start.mjs` | 把规则默认值注入 Python 进程 |
| `backend/services/elevenlabs/rules.py` | Python 侧格式/音色/速度/测试默认值 |
| `backend/services/elevenlabs/app.py` | `/v1/audio/speech/test` 探针 |
| `backend/services/fishaudio/start.mjs` | 把规则默认值注入 Python 进程 |
| `backend/services/fishaudio/rules.py` | Python 侧格式/音色/速度/测试默认值 |
| `backend/services/fishaudio/app.py` | `/v1/audio/speech/test` 探针 |

## 9. 配置清单与故障排查

设置页按接入方式只要求填写真正需要的字段；卡片内的「配置清单」与此表一致。

| 接入方式 | 必填 | 可选 | 不需要 |
| --- | --- | --- | --- |
| 本机服务（`local`） | 无。ASR 先运行 `pnpm asr:start`（默认 `ws://127.0.0.1:5580/v1/asr/stream`），TTS 先运行 `pnpm tts:start`（默认 `http://127.0.0.1:5578`） | 识别引擎、本机音色 | 接口地址、API 密钥 |
| HTTP API（`api`） | 接口根地址，如 `http://127.0.0.1:5583/v1` 或 `https://api.openai.com/v1` | 模型、API 密钥、音色 | 端口与启动命令 |
| 浏览器引擎（`browser`） | 无 | 无 | 接口地址、密钥、本机服务 |

`local` 接入不经过 `/api/speech/*`：ASR 走 WebSocket，TTS 走 `5578` 网关；服务未启动时会
按既有规则回退浏览器语音。只有 `api` 接入的「测试接口」会真正发起合成或识别请求；
`local` 接入的按钮是「检测本机服务」，只探活端口，不消耗上游额度。

### 502 的定位顺序

1. `502 speech_endpoint_unreachable`：本站连不上填写的地址。先确认端口在监听
   （`lsof -nP -iTCP:5583 -sTCP:LISTEN`），本机适配器分别用 `pnpm elevenlabs:start`（5583）、
   `pnpm fishaudio:start`（5584）、`pnpm tts:start`（5578）、`pnpm asr:start`（5580）启动。
   地址填根地址即可，`/audio/speech` 后缀由系统追加且自动去重。
2. `401 speech_credentials_invalid`：适配器已经连上上游，但服务端密钥无效。改
   `backend/services/<adapter>/.env.local` 里的 `ELEVENLABS_API_KEY` / `FISH_API_KEY`，
   **不要**填到浏览器「API 密钥」；浏览器字段只承载可选的 `MOSS_*_ACCESS_TOKEN`。
3. `402 speech_payment_required`：上游余额不足或模型需要付费，改用免费模型（如
   `s2.1-pro-free`）或充值。
4. `503 speech_unavailable`：上游或代理不可达。检查网络、代理白名单与
   `MOSS_*_BASE_URL`；本机适配器的 `fishaudio_unreachable` 属于这一类。
5. `400 speech_request_rejected`：模型、音色或音频格式不被接受，按错误体里的上游码调整。

适配器不再把凭据、余额、参数、限流问题统一包装成 502：上游状态码会原样保留
（401/402/429/4xx），只有上游 5xx 或无效音频才返回 502，网络不可达返回 503，超时返回 504。

「本机服务」徽章与一键接入圆点按探活结果分三态：`ready`（`/health` 200）、
`unconfigured`（503 且 body 带 `configured:false`，显示「已启动·缺密钥」并提示对应
`.env.local` 文件）、`down`（探活失败，显示「未启动」）。`speech_endpoint_unreachable`
的提示会按端口号给出对应启动命令（5583 → `pnpm elevenlabs:start`，5584 →
`pnpm fishaudio:start`，5580 → `pnpm asr:start`，5578 → `pnpm tts:start`）。
