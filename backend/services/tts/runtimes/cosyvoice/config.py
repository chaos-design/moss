from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

COSYVOICE_DIR = Path(__file__).resolve().parent
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _read_port(name: str, default: int) -> int:
    value = int(os.environ.get(name, default))
    if value < 1 or value > 65_535:
        raise ValueError(f"{name} must be a valid TCP port")
    return value


def _path(name: str, default: Path) -> Path:
    return Path(os.environ.get(name) or default).expanduser().resolve()


@dataclass(frozen=True)
class CosyVoiceSettings:
    host: str
    port: int
    runtime_dir: Path
    model_dir: Path

    @classmethod
    def from_env(cls) -> "CosyVoiceSettings":
        host = os.environ.get("MOSS_COSYVOICE_HOST", "127.0.0.1")
        if host not in LOOPBACK_HOSTS:
            raise ValueError("CosyVoice service must bind to a loopback address")
        return cls(
            host=host,
            port=_read_port("MOSS_COSYVOICE_PORT", 5581),
            runtime_dir=_path("MOSS_COSYVOICE_RUNTIME_DIR", COSYVOICE_DIR / "runtime"),
            model_dir=_path(
                "MOSS_COSYVOICE_MODEL_DIR",
                COSYVOICE_DIR / "models" / "CosyVoice-300M-SFT",
            ),
        )
