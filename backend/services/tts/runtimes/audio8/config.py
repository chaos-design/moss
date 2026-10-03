from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


AUDIO8_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_ID = "Audio8/Audio8-TTS-Preview-0.6b"
DEFAULT_MODEL_DIR = AUDIO8_DIR / "models" / "Audio8-TTS-Preview-0.6b"
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _read_port(name: str, default: int) -> int:
    value = int(os.environ.get(name, default))
    if value < 1 or value > 65_535:
        raise ValueError(f"{name} must be a valid TCP port")
    return value


@dataclass(frozen=True)
class Audio8Settings:
    host: str
    port: int
    model_dir: Path
    model_id: str
    device: str
    max_new_tokens: int

    @classmethod
    def from_env(cls) -> "Audio8Settings":
        host = os.environ.get("MOSS_AUDIO8_HOST", "127.0.0.1")
        if host not in LOOPBACK_HOSTS:
            raise ValueError("Audio8 service must bind to a loopback address")
        max_new_tokens = int(os.environ.get("MOSS_AUDIO8_MAX_NEW_TOKENS", "1024"))
        if max_new_tokens < 64 or max_new_tokens > 4_096:
            raise ValueError("MOSS_AUDIO8_MAX_NEW_TOKENS must be between 64 and 4096")
        return cls(
            host=host,
            port=_read_port("MOSS_AUDIO8_PORT", 5582),
            model_dir=Path(
                os.environ.get("MOSS_AUDIO8_MODEL_DIR", str(DEFAULT_MODEL_DIR))
            ).expanduser(),
            model_id=os.environ.get("MOSS_AUDIO8_MODEL_ID", DEFAULT_MODEL_ID).strip(),
            device=os.environ.get("MOSS_AUDIO8_DEVICE", "auto").strip().lower(),
            max_new_tokens=max_new_tokens,
        )
