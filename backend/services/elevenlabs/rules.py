"""语音服务通用规则的 Python 侧镜像。

机器可读的权威来源是 ``frontend/src/lib/speech-rules.json``；本模块把其中与本机适配器
相关的常量集中到一处，避免 ``client.py`` / ``app.py`` 各自硬编码。
``backend/tests/elevenlabs/test_rules.py`` 会断言两边保持一致。跨服务说明见
``docs/speech-rules.md``。
"""

from __future__ import annotations

# 输出格式 -> (ElevenLabs output_format, Content-Type)。AAC / FLAC 不被支持，
# 直接拒绝，避免把其他编码伪装成目标格式。
SUPPORTED_RESPONSE_FORMATS: dict[str, tuple[str, str]] = {
    "mp3": ("mp3_44100_128", "audio/mpeg"),
    "opus": ("opus_48000_128", "audio/ogg"),
    "pcm": ("pcm_16000", "audio/pcm"),
    "wav": ("wav_44100", "audio/wav"),
}

# OpenAI 音色名 + ElevenLabs 官方预置音色名 -> voice ID；其余值按原样当作 voice ID。
# nova/shimmer 原指向 Rachel/shimmer 目标音色，2026-11-14 实测已转为付费专属（402），
# 改映射到仍免费的 Laura / Lily；premade 列表逐一用免费层合成请求验证过可用。
VOICE_ALIASES: dict[str, str] = {
    "alloy": "JBFqnCBsd6RMkjVDRZzb",
    "echo": "onwK4e9ZLuTAKqWW03F9",
    "fable": "EXAVITQu4vr4xnSDxMaL",
    "onyx": "pNInz6obpgDQGcFmaJgB",
    "nova": "FGY2WhTYpPnrIDTdsKH5",
    "shimmer": "pFZP5JQG7iQjIQuC4Bku",
    "george": "JBFqnCBsd6RMkjVDRZzb",
    "adam": "pNInz6obpgDQGcFmaJgB",
    "bill": "pqHfZKP75CvOlQylNhV4",
    "brian": "nPczCjzI2devNBz1zQrb",
    "callum": "N2lVS1w4EtoT3dr4eOWO",
    "emma": "EXAVITQu4vr4xnSDxMaL",
    "jessica": "cgSgspJ2msm6clMCkdW9",
    "laura": "FGY2WhTYpPnrIDTdsKH5",
    "liam": "TX3LPaxmHKxFdv7VOQHJ",
    "lily": "pFZP5JQG7iQjIQuC4Bku",
    "matilda": "XrExE9yKIg1WjnnlVkGX",
    "river": "SAz9YHcvj6GT2YYXdXww",
    "roger": "CwhRBWXzGAHq8TQ4Fs17",
}

DEFAULT_RESPONSE_FORMAT = "mp3"

# 对外接受的速度范围，与 ElevenLabs 上游可接受范围分开。
MIN_SPEECH_SPEED = 0.5
MAX_SPEECH_SPEED = 2.0
DEFAULT_SPEECH_SPEED = 1.0
MIN_VOICE_SPEED = 0.7
MAX_VOICE_SPEED = 1.2

# 「测试合成接口」的默认参数。端点只返回诊断信息，不回传音频本体。
TEST_SYNTHESIS_TEXT = "Moss 语音接口测试成功。"
TEST_SYNTHESIS_VOICE = "alloy"
TEST_SYNTHESIS_FORMAT = "mp3"
TEST_SYNTHESIS_SPEED = 1.0
TEST_SYNTHESIS_MIN_AUDIO_BYTES = 4
