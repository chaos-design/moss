# Audio8 TTS Sidecar

> 可选运行时；不是浏览器公开 API。

本地 `Audio8/Audio8-TTS-Preview-0.6b` 推理服务，监听 `127.0.0.1:5582`，只由
Moss TTS 网关调用。模型支持中英文等 11 种语言，当前使用无参考音频的多语言声音，不开放
声音克隆输入。

```bash
pnpm audio8:setup
pnpm audio8:start
```

首次安装会创建独立 Python 3.10-3.12 环境并从 Hugging Face 下载模型。官方推荐 CUDA；
服务也会自动选择 Apple MPS 或 CPU，但首次加载和合成会明显更慢。

接口：

```text
GET  /health
POST /prepare
POST /synthesize
```

合成请求示例：

```json
{
  "text": "Could I get a coffee, please?",
  "voice": "multilingual",
  "speed": 1,
  "seed": 2024
}
```

环境变量：

| 名称 | 默认值 |
| --- | --- |
| `MOSS_AUDIO8_HOST` | `127.0.0.1` |
| `MOSS_AUDIO8_PORT` | `5582` |
| `MOSS_AUDIO8_MODEL_ID` | `Audio8/Audio8-TTS-Preview-0.6b` |
| `MOSS_AUDIO8_MODEL_DIR` | `backend/services/tts/runtimes/audio8/models/Audio8-TTS-Preview-0.6b` |
| `MOSS_AUDIO8_DEVICE` | `auto` |
| `MOSS_AUDIO8_MAX_NEW_TOKENS` | `1024` |

## 运行边界

- `MOSS_AUDIO8_HOST` 必须是 loopback。
- 网关负责文本长度、Origin、缓存和错误归一化；sidecar 只负责模型推理。
- 当前不接受参考音频，不提供声音克隆，避免引入音频存储和身份授权边界。
- 进程退出不会影响 Kokoro；`pnpm tts:start` 会记录降级状态。

测试由 `backend/tests/tts/test_audio8.py` 覆盖，且不会加载完整模型。
