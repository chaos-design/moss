from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlparse

from .rules import DEFAULT_RESPONSE_FORMAT, TTS_LATENCY, SUPPORTED_RESPONSE_FORMATS

LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
DEFAULT_API_BASE_URL = "https://api.fish.audio"
# Fish Audio 的免费开发者档模型；付费模型在未充值时会返回 402。
DEFAULT_TTS_MODEL = "s2.1-pro-free"
DEFAULT_ASR_MODEL = "transcribe-1-pro"
TTS_MODEL_HEADER = "model"


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


def _read_latency(value: str | None) -> str:
    resolved = (value or TTS_LATENCY).strip().lower()
    if resolved not in {"low", "normal", "balanced"}:
        raise ValueError("MOSS_FISHAUDIO_LATENCY must be one of: low, normal, balanced")
    return resolved


def _read_response_format(value: str | None) -> str:
    resolved = (value or DEFAULT_RESPONSE_FORMAT).strip().lower()
    if resolved not in SUPPORTED_RESPONSE_FORMATS:
        supported = ", ".join(sorted(SUPPORTED_RESPONSE_FORMATS))
        raise ValueError(
            f"MOSS_FISHAUDIO_DEFAULT_RESPONSE_FORMAT must be one of: {supported}"
        )
    return resolved


def _validate_base_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.username or parsed.password:
        raise ValueError("MOSS_FISHAUDIO_BASE_URL must not contain credentials")
    if parsed.scheme == "https" and parsed.hostname:
        return value.rstrip("/")
    if parsed.scheme == "http" and parsed.hostname in LOOPBACK_HOSTS:
        return value.rstrip("/")
    raise ValueError(
        "MOSS_FISHAUDIO_BASE_URL must use HTTPS, or loopback HTTP for a local mock"
    )


@dataclass(frozen=True)
class FishAudioSettings:
    host: str
    port: int
    allowed_origins: frozenset[str]
    api_key: str
    access_token: str
    base_url: str
    tts_model: str
    asr_model: str
    default_voice: str
    latency: str
    request_timeout_seconds: float = 45
    max_audio_bytes: int = 8_000_000
    max_text_length: int = 2_000
    default_response_format: str = DEFAULT_RESPONSE_FORMAT

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    @classmethod
    def from_env(cls) -> "FishAudioSettings":
        host = os.environ.get("MOSS_FISHAUDIO_HOST", "127.0.0.1")
        if host not in LOOPBACK_HOSTS:
            raise ValueError("Moss Fish Audio service must bind to a loopback address")

        configured_origins = {
            value.strip()
            for value in os.environ.get("MOSS_FISHAUDIO_ALLOWED_ORIGINS", "").split(",")
            if value.strip()
        }
        default_origins = {
            "http://127.0.0.1:5577",
            "http://localhost:5577",
        }
        return cls(
            host=host,
            port=_read_port("MOSS_FISHAUDIO_PORT", 5584),
            allowed_origins=frozenset(default_origins | configured_origins),
            api_key=(os.environ.get("FISH_API_KEY") or "").strip(),
            access_token=(os.environ.get("MOSS_FISHAUDIO_ACCESS_TOKEN") or "").strip(),
            base_url=_validate_base_url(
                (os.environ.get("MOSS_FISHAUDIO_BASE_URL") or DEFAULT_API_BASE_URL).strip()
            ),
            tts_model=(os.environ.get("MOSS_FISHAUDIO_TTS_MODEL") or DEFAULT_TTS_MODEL).strip(),
            asr_model=(os.environ.get("MOSS_FISHAUDIO_ASR_MODEL") or DEFAULT_ASR_MODEL).strip(),
            default_voice=(os.environ.get("MOSS_FISHAUDIO_DEFAULT_VOICE") or "").strip(),
            latency=_read_latency(os.environ.get("MOSS_FISHAUDIO_LATENCY")),
            request_timeout_seconds=_read_timeout("MOSS_FISHAUDIO_TIMEOUT_SECONDS", 45),
            max_audio_bytes=_read_positive_int(
                "MOSS_FISHAUDIO_MAX_AUDIO_BYTES", 8_000_000, 1_000, 32_000_000
            ),
            max_text_length=_read_positive_int(
                "MOSS_FISHAUDIO_MAX_TEXT_LENGTH", 2_000, 1, 10_000
            ),
            default_response_format=_read_response_format(
                os.environ.get("MOSS_FISHAUDIO_DEFAULT_RESPONSE_FORMAT")
            ),
        )
