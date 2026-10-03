# CosyVoice TTS Sidecar

> 可选运行时；不是浏览器公开 API。

该服务将 CosyVoice 官方运行时及其大型依赖与轻量 TTS 网关、Kokoro 环境隔离。

## 安装与启动

```bash
pnpm cosyvoice:setup
pnpm cosyvoice:start
```

安装器创建独立 `.venv`，检出固定版本的官方运行时，并下载
`FunAudioLLM/CosyVoice-300M-SFT`。运行时、模型和虚拟环境均被 Git 忽略。

sidecar 默认监听 `http://127.0.0.1:5581`。`pnpm tts:start` 在检测到完整安装后自动启动；
浏览器始终只访问 `5578` 网关。

## 接口

```text
GET  /health
POST /prepare
POST /synthesize
```

稳定音色：

- `english_female` 对应内置 `英文女` speaker。
- `english_male` 对应内置 `英文男` speaker。

## 配置

| 变量 | 默认值 |
| --- | --- |
| `MOSS_COSYVOICE_HOST` | `127.0.0.1` |
| `MOSS_COSYVOICE_PORT` | `5581` |
| `MOSS_COSYVOICE_RUNTIME_DIR` | `backend/services/tts/runtimes/cosyvoice/runtime` |
| `MOSS_COSYVOICE_MODEL_DIR` | `backend/services/tts/runtimes/cosyvoice/models/CosyVoice-300M-SFT` |

## 运行边界

- Host 必须是 loopback；鉴权、Origin、文本长度和缓存由网关负责。
- sidecar 不读取学习记忆，不保存合成文本和音频。
- 启动慢或未安装时不影响 Kokoro 与 Audio8。
- 测试由 `backend/tests/tts/test_cosyvoice.py` 覆盖，真实模型延迟需在目标硬件验收。
