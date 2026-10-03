from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import numpy as np


SUPPORTED_AUDIO_FORMATS = {"int16", "float32"}
SUPPORTED_LANGUAGES = {"zh", "en"}


class ProtocolError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class StartCommand:
    sample_rate: int
    audio_format: str
    token: str | None
    context: str
    engine: str
    languages: tuple[str, ...]


def parse_command(
    raw: str,
    default_sample_rate: int,
    default_engine: str = "sensevoice",
) -> StartCommand | str:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ProtocolError("invalid_json", "Control message must be valid JSON") from error
    if not isinstance(payload, dict):
        raise ProtocolError("invalid_message", "Control message must be a JSON object")

    message_type = payload.get("type")
    if message_type in {"flush", "stop", "ping"}:
        return message_type
    if message_type != "start":
        raise ProtocolError("unknown_message", "Supported message types: start, flush, stop, ping")

    sample_rate = payload.get("sampleRate", default_sample_rate)
    audio_format = payload.get("format", "int16")
    if not isinstance(sample_rate, int) or isinstance(sample_rate, bool):
        raise ProtocolError("invalid_sample_rate", "sampleRate must be an integer")
    if sample_rate < 8_000 or sample_rate > 48_000:
        raise ProtocolError("invalid_sample_rate", "sampleRate must be between 8000 and 48000")
    if audio_format not in SUPPORTED_AUDIO_FORMATS:
        raise ProtocolError("invalid_audio_format", "format must be int16 or float32")
    token = payload.get("token")
    if token is not None and not isinstance(token, str):
        raise ProtocolError("invalid_token", "token must be a string")
    context = payload.get("context", "")
    if not isinstance(context, str) or len(context) > 1_000:
        raise ProtocolError("invalid_context", "context must be a string up to 1000 characters")
    engine = payload.get("engine", default_engine)
    if engine not in {"qwen3-asr", "sensevoice"}:
        raise ProtocolError("invalid_engine", "engine must be qwen3-asr or sensevoice")
    languages = payload.get("languages", ["zh", "en"])
    if (
        not isinstance(languages, list)
        or not languages
        or any(not isinstance(language, str) for language in languages)
    ):
        raise ProtocolError("invalid_languages", "languages must be a non-empty string array")
    normalized_languages = tuple(dict.fromkeys(language.lower() for language in languages))
    if any(language not in SUPPORTED_LANGUAGES for language in normalized_languages):
        raise ProtocolError("invalid_languages", "languages may only contain zh and en")
    return StartCommand(
        sample_rate=sample_rate,
        audio_format=audio_format,
        token=token,
        context=context.strip(),
        engine=engine,
        languages=normalized_languages,
    )


def decode_audio_chunk(data: bytes, audio_format: str) -> np.ndarray:
    if audio_format == "int16":
        if len(data) % 2:
            raise ProtocolError("invalid_audio", "int16 PCM chunks must contain complete samples")
        samples = np.frombuffer(data, dtype="<i2").astype(np.float32)
        return samples / 32_768.0
    if audio_format == "float32":
        if len(data) % 4:
            raise ProtocolError("invalid_audio", "float32 PCM chunks must contain complete samples")
        samples = np.frombuffer(data, dtype="<f4").astype(np.float32, copy=False)
        if not np.isfinite(samples).all():
            raise ProtocolError("invalid_audio", "Audio samples must be finite numbers")
        return np.clip(samples, -1.0, 1.0)
    raise ProtocolError("invalid_audio_format", "format must be int16 or float32")


def event(message_type: str, **payload: Any) -> dict[str, Any]:
    return {"type": message_type, **payload}
