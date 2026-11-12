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
| 本机接口 TTS | `eleven_v4` | `MOSS_ELEVENLABS_TTS_MODEL` / `NEXT_PUBLIC_TTS_LOCAL_API_MODEL` |
| 本机接口 ASR | `scribe_v2` | `MOSS_ELEVENLABS_ASR_MODEL` / `NEXT_PUBLIC_ASR_LOCAL_API_MODEL` |
| Fish Audio TTS | `s2.1-pro-free` | `MOSS_FISHAUDIO_TTS_MODEL` / `NEXT_PUBLIC_TTS_FISH_AUDIO_MODEL` |
| Fish Audio ASR | `transcribe-1-pro` | `MOSS_FISHAUDIO_ASR_MODEL` / `NEXT_PUBLIC_ASR_FISH_AUDIO_MODEL` |
| 远程 HTTP API | `tts-1` / `whisper-1` | 设置页「HTTP API」占位默认值 |
| TTS 网关引擎 | `kokoro`、`audio8`、`cosyvoice` | 由 `engine` 参数选择 |
| ASR 引擎 | `qwen3-asr`、`sensevoice` | `MOSS_ASR_ENGINE` |
| 真正的本地权重 | `kokoro-v1.0.onnx`、`kokoro-v1.1-zh.onnx`、`Audio8/Audio8-TTS-Preview-0.6b`、`CosyVoice-300M-SFT`、`Qwen/Qwen3-ASR-1.7B`、`iic/SenseVoiceSmall` | 由各 `setup.mjs` 下载到 `models/` |

> 「本机接口」(5583/5584) 是 loopback 代理，不加载本地权重；它们把 Moss 的 OpenAI 兼容契约
> 翻译成 ElevenLabs / Fish Audio 云端 API。需要离线本地模型时应使用 5578 网关或浏览器引擎。

## 3. 音色、音频格式与速度

- 默认音色 `JBFqnCBsd6RMkjVDRZzb`；`alloy`/`echo`/`fable`/`onyx`/`nova`/`shimmer`
  六个 OpenAI 音色在 5583 适配器里映射到 ElevenLabs voice ID，其余值按原样当作 voice ID。
- Fish Audio（5584）的音色是 voice model ID（reference_id）：六个 OpenAI 别名统一映射为
  空串 = 省略 `reference_id`、使用 Fish Audio 内置默认音色；其余非空值按原样作为
  reference_id 转发。
- 默认输出格式 `mp3`。前端路由允许 `mp3/opus/aac/flac/wav/pcm`，但适配器只实现了
  `mp3/opus/pcm/wav`；`aac`/`flac` 会返回 `400 unsupported_format`，不会被伪装成目标格式。

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

## 4. 通用限制与安全规则

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

## 5. 配置优先级

本机适配器启动时按以下顺序合并（越靠后优先级越高）：

1. `frontend/src/lib/speech-rules.json` 里的通用默认值（由各 `start.mjs` 注入）
2. `backend/services/elevenlabs/.env.local` / `backend/services/fishaudio/.env.local`
   （本机实例配置，gitignore）
3. shell / 父进程环境变量

前端 `NEXT_PUBLIC_*` 由 `frontend/next.config.ts` 在构建期内联；浏览器本地覆盖保存在
`moss:speech-config:v1`。

## 6. 测试合成规则

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

## 7. 消费方对照

| 文件 | 用途 |
| --- | --- |
| `frontend/src/lib/speech-rules.ts` | 类型化封装、音频有效性判定、规则默认值 |
| `frontend/src/app/api/speech/tts/test/route.ts` | 前端诊断端点 |
| `frontend/src/features/settings/speech-service-card.tsx` | 设置页「测试合成接口」与本机接口预设 |
| `backend/services/elevenlabs/start.mjs` | 把规则默认值注入 Python 进程 |
| `backend/services/elevenlabs/rules.py` | Python 侧格式/音色/速度/测试默认值 |
| `backend/services/elevenlabs/app.py` | `/v1/audio/speech/test` 探针 |
| `backend/services/fishaudio/start.mjs` | 把规则默认值注入 Python 进程 |
| `backend/services/fishaudio/rules.py` | Python 侧格式/音色/速度/测试默认值 |
| `backend/services/fishaudio/app.py` | `/v1/audio/speech/test` 探针 |
