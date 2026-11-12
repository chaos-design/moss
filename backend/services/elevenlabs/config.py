from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlparse

LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
DEFAULT_API_BASE_URL = "https://api.elevenlabs.io"
# George, the stock voice used by the ElevenLabs quickstart.
DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"
DEFAULT_TTS_MODEL = "eleven_v4"
DEFAULT_ASR_MODEL = "scribe_v2"


def _read_port(name: str, default: int) -> int:
    value = int(os.environ.get(name, default))
    if value < 1 or value > 65_535:
        raise ValueError(f"{name} must be a valid TCP port")
    return value


def _read_positive_int(name: str, default: int, minimum: int, maximum: int) -> int:
    value = int(os.environ.get(name, default))
    if value < minimum or value > maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def _read_timeout(name: str, default: float) -> float:
    value = float(os.environ.get(name, default))
    if value < 1 or value > 300:
        raise ValueError(f"{name} must be between 1 and 300 seconds")
    return value


def _validate_base_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.username or parsed.password:
        raise ValueError("MOSS_ELEVENLABS_BASE_URL must not contain credentials")
    if parsed.scheme == "https" and parsed.hostname:
        return value.rstrip("/")
    if parsed.scheme == "http" and parsed.hostname in LOOPBACK_HOSTS:
        return value.rstrip("/")
    raise ValueError(
        "MOSS_ELEVENLABS_BASE_URL must use HTTPS, or loopback HTTP for a local mock"
    )


@dataclass(frozen=True)
class ElevenLabsSettings:
    host: str
    port: int
    allowed_origins: frozenset[str]
    api_key: str
    access_token: str
    base_url: str
    tts_model: str
    asr_model: str
    default_voice: str
    request_timeout_seconds: float = 45
    max_audio_bytes: int = 8_000_000
    max_text_length: int = 2_000

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    @classmethod
    def from_env(cls) -> "ElevenLabsSettings":
        host = os.environ.get("MOSS_ELEVENLABS_HOST", "127.0.0.1")
        if host not in LOOPBACK_HOSTS:
            raise ValueError("Moss ElevenLabs service must bind to a loopback address")

        configured_origins = {
            value.strip()
            for value in os.environ.get("MOSS_ELEVENLABS_ALLOWED_ORIGINS", "").split(",")
            if value.strip()
        }
        default_origins = {
            "http://127.0.0.1:5577",
            "http://localhost:5577",
        }
        return cls(
            host=host,
            port=_read_port("MOSS_ELEVENLABS_PORT", 5583),
            allowed_origins=frozenset(default_origins | configured_origins),
            api_key=(os.environ.get("ELEVENLABS_API_KEY") or "").strip(),
            access_token=(os.environ.get("MOSS_ELEVENLABS_ACCESS_TOKEN") or "").strip(),
            base_url=_validate_base_url(
                (os.environ.get("MOSS_ELEVENLABS_BASE_URL") or DEFAULT_API_BASE_URL).strip()
            ),
            tts_model=(os.environ.get("MOSS_ELEVENLABS_TTS_MODEL") or DEFAULT_TTS_MODEL).strip(),
            asr_model=(os.environ.get("MOSS_ELEVENLABS_ASR_MODEL") or DEFAULT_ASR_MODEL).strip(),
            default_voice=(
                os.environ.get("MOSS_ELEVENLABS_DEFAULT_VOICE") or DEFAULT_VOICE_ID
            ).strip(),
            request_timeout_seconds=_read_timeout("MOSS_ELEVENLABS_TIMEOUT_SECONDS", 45),
            max_audio_bytes=_read_positive_int(
                "MOSS_ELEVENLABS_MAX_AUDIO_BYTES", 8_000_000, 1_000, 32_000_000
            ),
            max_text_length=_read_positive_int(
                "MOSS_ELEVENLABS_MAX_TEXT_LENGTH", 2_000, 1, 10_000
            ),
        )
