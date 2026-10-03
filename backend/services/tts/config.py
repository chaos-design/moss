from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

PROJECT_ROOT = Path(__file__).resolve().parents[2]
TTS_DIR = Path(__file__).resolve().parent
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _read_port(name: str, default: int) -> int:
    value = int(os.environ.get(name, default))
    if value < 1 or value > 65_535:
        raise ValueError(f"{name} must be a valid TCP port")
    return value


def _loopback_url(name: str, default: str) -> str:
    value = (os.environ.get(name) or default).rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme != "http" or parsed.hostname not in LOOPBACK_HOSTS:
        raise ValueError(f"{name} must use a loopback HTTP address")
    return value


def _path(name: str, default: Path) -> Path:
    return Path(os.environ.get(name) or default).expanduser()


@dataclass(frozen=True)
class TtsSettings:
    host: str
    port: int
    allowed_origins: frozenset[str]
    audio8_url: str
    cosyvoice_url: str
    kokoro_model_path: Path
    kokoro_voices_path: Path
    kokoro_zh_model_path: Path
    kokoro_zh_voices_path: Path
    kokoro_zh_config_path: Path
    max_cache_bytes: int = 64 * 1024 * 1024

    @classmethod
    def from_env(cls) -> "TtsSettings":
        host = os.environ.get("MOSS_TTS_HOST", "127.0.0.1")
        if host not in LOOPBACK_HOSTS:
            raise ValueError("Moss TTS service must bind to a loopback address")

        configured_origins = {
            value.strip()
            for value in os.environ.get("MOSS_TTS_ALLOWED_ORIGINS", "").split(",")
            if value.strip()
        }
        default_origins = {
            "http://127.0.0.1:5577",
            "http://localhost:5577",
        }
        model_dir = TTS_DIR / "models"
        return cls(
            host=host,
            port=_read_port("MOSS_TTS_PORT", 5578),
            allowed_origins=frozenset(default_origins | configured_origins),
            audio8_url=_loopback_url("MOSS_AUDIO8_URL", "http://127.0.0.1:5582"),
            cosyvoice_url=_loopback_url("MOSS_COSYVOICE_URL", "http://127.0.0.1:5581"),
            kokoro_model_path=_path(
                "MOSS_KOKORO_MODEL_PATH",
                model_dir / "kokoro-v1.0.onnx",
            ),
            kokoro_voices_path=_path(
                "MOSS_KOKORO_VOICES_PATH",
                model_dir / "voices-v1.0.bin",
            ),
            kokoro_zh_model_path=_path(
                "MOSS_KOKORO_ZH_MODEL_PATH",
                model_dir / "kokoro-v1.1-zh.onnx",
            ),
            kokoro_zh_voices_path=_path(
                "MOSS_KOKORO_ZH_VOICES_PATH",
                model_dir / "voices-v1.1-zh.bin",
            ),
            kokoro_zh_config_path=_path(
                "MOSS_KOKORO_ZH_CONFIG_PATH",
                model_dir / "kokoro-v1.1-zh-config.json",
            ),
        )
