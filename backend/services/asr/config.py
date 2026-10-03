from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


ASR_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_ID = "Qwen/Qwen3-ASR-1.7B"
DEFAULT_MODEL_DIR = ASR_DIR / "models" / "Qwen3-ASR-1.7B"
DEFAULT_SENSEVOICE_MODEL_ID = "iic/SenseVoiceSmall"
DEFAULT_SENSEVOICE_MODEL_DIR = ASR_DIR / "models" / "SenseVoiceSmall"
SUPPORTED_ENGINES = frozenset({"qwen3-asr", "sensevoice"})


def _read_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer") from error
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def _read_float(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.getenv(name, str(default))
    try:
        value = float(raw)
    except ValueError as error:
        raise ValueError(f"{name} must be a number") from error
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


@dataclass(frozen=True)
class AsrSettings:
    host: str
    port: int
    model_dir: Path
    model_id: str
    device: str
    dtype: str
    sample_rate: int
    max_connections: int
    max_chunk_bytes: int
    max_audio_seconds: int
    max_new_tokens: int
    speech_threshold: float
    noise_calibration_seconds: float
    noise_threshold_multiplier: float
    min_speech_seconds: float
    endpoint_silence_seconds: float
    pre_roll_seconds: float
    allowed_origins: tuple[str, ...]
    api_key: str | None
    engine: str = "sensevoice"
    preload_engines: tuple[str, ...] = ()
    sensevoice_model_dir: Path = DEFAULT_SENSEVOICE_MODEL_DIR
    sensevoice_model_id: str = DEFAULT_SENSEVOICE_MODEL_ID

    @classmethod
    def from_env(cls) -> "AsrSettings":
        configured_origins = os.getenv(
            "MOSS_ASR_ALLOWED_ORIGINS",
            "http://127.0.0.1:5577,http://localhost:5577",
        )
        origins = tuple(origin.strip() for origin in configured_origins.split(",") if origin.strip())
        engine = os.getenv("MOSS_ASR_ENGINE", "sensevoice").strip().lower()
        if engine not in SUPPORTED_ENGINES:
            raise ValueError(
                f"MOSS_ASR_ENGINE must be one of: {', '.join(sorted(SUPPORTED_ENGINES))}"
            )
        preload_engines = tuple(
            dict.fromkeys(
                value.strip().lower()
                for value in os.getenv("MOSS_ASR_PRELOAD_ENGINES", "").split(",")
                if value.strip()
            )
        )
        unsupported_preloads = [
            value for value in preload_engines if value not in SUPPORTED_ENGINES
        ]
        if unsupported_preloads:
            raise ValueError(
                "MOSS_ASR_PRELOAD_ENGINES may only contain: "
                f"{', '.join(sorted(SUPPORTED_ENGINES))}"
            )
        return cls(
            host=os.getenv("MOSS_ASR_HOST", "127.0.0.1"),
            port=_read_int("MOSS_ASR_PORT", 5580, 1, 65_535),
            model_dir=Path(
                os.getenv("MOSS_ASR_MODEL_DIR", str(DEFAULT_MODEL_DIR))
            ).expanduser(),
            model_id=os.getenv("MOSS_ASR_MODEL_ID", DEFAULT_MODEL_ID).strip(),
            device=os.getenv("MOSS_ASR_DEVICE", "auto").strip().lower(),
            dtype=os.getenv("MOSS_ASR_DTYPE", "auto").strip().lower(),
            sample_rate=_read_int("MOSS_ASR_SAMPLE_RATE", 16_000, 8_000, 48_000),
            max_connections=_read_int("MOSS_ASR_MAX_CONNECTIONS", 2, 1, 64),
            max_chunk_bytes=_read_int("MOSS_ASR_MAX_CHUNK_BYTES", 65_536, 320, 4_194_304),
            max_audio_seconds=_read_int("MOSS_ASR_MAX_AUDIO_SECONDS", 60, 5, 600),
            max_new_tokens=_read_int("MOSS_ASR_MAX_NEW_TOKENS", 256, 32, 4_096),
            speech_threshold=_read_float("MOSS_ASR_SPEECH_THRESHOLD", 0.018, 0.001, 0.5),
            noise_calibration_seconds=_read_float(
                "MOSS_ASR_NOISE_CALIBRATION_SECONDS", 0.5, 0.0, 2.0
            ),
            noise_threshold_multiplier=_read_float(
                "MOSS_ASR_NOISE_THRESHOLD_MULTIPLIER", 3.0, 1.1, 8.0
            ),
            min_speech_seconds=_read_float("MOSS_ASR_MIN_SPEECH_SECONDS", 0.35, 0.05, 5.0),
            endpoint_silence_seconds=_read_float(
                "MOSS_ASR_ENDPOINT_SILENCE_SECONDS", 0.85, 0.2, 5.0
            ),
            pre_roll_seconds=_read_float("MOSS_ASR_PRE_ROLL_SECONDS", 0.25, 0.0, 2.0),
            allowed_origins=origins,
            api_key=os.getenv("MOSS_ASR_API_KEY") or None,
            engine=engine,
            preload_engines=preload_engines,
            sensevoice_model_dir=Path(
                os.getenv(
                    "MOSS_SENSEVOICE_MODEL_DIR",
                    str(DEFAULT_SENSEVOICE_MODEL_DIR),
                )
            ).expanduser(),
            sensevoice_model_id=os.getenv(
                "MOSS_SENSEVOICE_MODEL_ID",
                DEFAULT_SENSEVOICE_MODEL_ID,
            ).strip(),
        )

    def validate_model_files(self, engine: str = "qwen3-asr") -> Path:
        model_dir = (
            self.sensevoice_model_dir if engine == "sensevoice" else self.model_dir
        )
        model_label = "SenseVoice" if engine == "sensevoice" else "Qwen3-ASR"
        if not model_dir.is_dir():
            raise FileNotFoundError(
                f"{model_label} model directory does not exist: {model_dir}. "
                "Run pnpm asr:setup."
            )
        config_paths = [
            model_dir / "config.json",
            model_dir / "configuration.json",
            model_dir / "config.yaml",
        ]
        if not any(path.is_file() for path in config_paths):
            raise FileNotFoundError(f"Missing {model_label} config in {model_dir}")
        weight_index = model_dir / "model.safetensors.index.json"
        if weight_index.is_file():
            try:
                index = json.loads(weight_index.read_text(encoding="utf-8"))
                weight_files = set(index.get("weight_map", {}).values())
            except (json.JSONDecodeError, OSError) as error:
                raise ValueError(f"Invalid {model_label} weight index: {weight_index}") from error
            missing_weights = sorted(
                filename for filename in weight_files if not (model_dir / filename).is_file()
            )
            if missing_weights:
                raise FileNotFoundError(
                    f"Missing {model_label} weight files in {model_dir}: "
                    f"{', '.join(missing_weights)}. Run pnpm asr:setup:qwen."
                )
            if weight_files:
                return model_dir
        if not (
            any(model_dir.glob("*.safetensors"))
            or any(model_dir.glob("*.bin"))
            or any(model_dir.glob("*.pt"))
        ):
            raise FileNotFoundError(f"Missing {model_label} weights in {model_dir}")
        return model_dir
