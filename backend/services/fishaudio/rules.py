"""Fish Audio 适配器通用规则的 Python 侧镜像。

机器可读的权威来源是 ``frontend/src/lib/speech-rules.json``：本服务读取其中的
``formats.fishAudioSupported``、``models.fishAudio``、``fishAudio`` 与共享的
``limits`` / ``speed`` / ``testSynthesis`` 段。``backend/tests/fishaudio/test_rules.py``
断言两边保持一致；跨服务说明见 ``docs/speech-rules.md``。
"""

from __future__ import annotations

# 输出格式 -> (Fish Audio format, Content-Type)。aac / flac 不被支持，直接拒绝。
SUPPORTED_RESPONSE_FORMATS: dict[str, tuple[str, str]] = {
    "mp3": ("mp3", "audio/mpeg"),
    "opus": ("opus", "audio/ogg"),
    "pcm": ("pcm", "audio/pcm"),
    "wav": ("wav", "audio/wav"),
}

DEFAULT_RESPONSE_FORMAT = "mp3"

# 对外接受的速度范围，与 Fish Audio prosody.speed 的 0.5–2.0 上游范围一致。
MIN_SPEECH_SPEED = 0.5
MAX_SPEECH_SPEED = 2.0
DEFAULT_SPEECH_SPEED = 1.0

# Fish Audio 的音色是 voice model ID（reference_id）。OpenAI 风格别名没有真实对应模型，
# 统一映射为空串：适配器会省略 reference_id，由 Fish Audio 使用其内置默认音色。
# 其余非空值一律按原样当作 reference_id 转发。
VOICE_ALIASES: dict[str, str] = {
    "alloy": "",
    "echo": "",
    "fable": "",
    "onyx": "",
    "nova": "",
    "shimmer": "",
}
DEFAULT_VOICE = ""

# Fish Audio 实时性档位；会话场景取 balanced 以压低合成延迟。
TTS_LATENCY = "balanced"

# 「测试合成接口」的默认参数。端点只返回诊断信息，不回传音频本体。
TEST_SYNTHESIS_TEXT = "Moss 语音接口测试成功。"
TEST_SYNTHESIS_VOICE = ""
TEST_SYNTHESIS_FORMAT = "mp3"
TEST_SYNTHESIS_SPEED = 1.0
TEST_SYNTHESIS_MIN_AUDIO_BYTES = 4
