from __future__ import annotations

import math
from typing import Any

import httpx

from .config import FishAudioSettings, TTS_MODEL_HEADER
from .errors import FishAudioServiceError
# Re-exported so existing imports from ``client`` keep working; the values live in the
# shared rule module alongside the test-synthesis defaults.
from .rules import (
    MAX_SPEECH_SPEED,
    MIN_SPEECH_SPEED,
    SUPPORTED_RESPONSE_FORMATS,
    TTS_LATENCY,
    VOICE_ALIASES,
)


def resolve_output_format(value: str) -> tuple[str, str]:
    try:
        return SUPPORTED_RESPONSE_FORMATS[value]
    except KeyError as error:
        raise FishAudioServiceError(
            400,
            "unsupported_format",
            "Fish Audio 适配器仅支持 mp3、opus、pcm 或 wav 输出。",
        ) from error


def resolve_reference_id(value: str) -> str:
    """OpenAI 音色名 -> Fish Audio reference_id；空串表示使用内置默认音色。"""
    normalized = value.strip()
    return VOICE_ALIASES.get(normalized.lower(), normalized)


def resolve_voice_speed(value: float) -> float:
    if not math.isfinite(value):
        raise FishAudioServiceError(400, "invalid_speed", "speed 必须是有限数字。")
    return round(min(MAX_SPEECH_SPEED, max(MIN_SPEECH_SPEED, value)), 3)


class FishAudioClient:
    def __init__(
        self,
        settings: FishAudioSettings,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.settings = settings
        self._client = httpx.Client(
            base_url=settings.base_url,
            headers={"Authorization": f"Bearer {settings.api_key}"},
            timeout=settings.request_timeout_seconds,
            follow_redirects=False,
            transport=transport,
        )

    def close(self) -> None:
        self._client.close()

    def _post(self, *args: Any, **kwargs: Any) -> httpx.Response:
        """连接建立失败时重试一次：代理抖动会表现为 ConnectError，但请求并未送达上游。"""
        try:
            return self._client.post(*args, **kwargs)
        except httpx.ConnectError:
            return self._client.post(*args, **kwargs)

    def synthesize(
        self,
        *,
        text: str,
        voice: str,
        model: str,
        response_format: str,
        speed: float,
    ) -> tuple[bytes, str]:
        output_format, content_type = resolve_output_format(response_format)
        reference_id = resolve_reference_id(voice)
        payload: dict[str, Any] = {
            "text": text,
            "prosody": {
                "speed": resolve_voice_speed(speed),
                "volume": 0,
                "normalize_loudness": True,
            },
            "format": output_format,
            "latency": self.settings.latency or TTS_LATENCY,
        }
        if reference_id:
            payload["reference_id"] = reference_id
        try:
            response = self._post(
                "/v1/tts",
                headers={TTS_MODEL_HEADER: model},
                json=payload,
            )
        except httpx.TimeoutException as error:
            raise FishAudioServiceError(
                504,
                "fishaudio_timeout",
                "Fish Audio 语音合成超时，请稍后重试。",
            ) from error
        except httpx.RequestError as error:
            raise FishAudioServiceError(
                502,
                "fishaudio_unreachable",
                "无法连接 Fish Audio 语音合成服务。",
            ) from error

        self._ensure_success(response)
        audio = response.content
        if not audio:
            raise FishAudioServiceError(
                502,
                "fishaudio_invalid_audio",
                "Fish Audio 返回了无效音频。",
            )
        # Fish Audio 的 200 响应可能按流返回 octet-stream；按请求的格式归一化类型。
        upstream_type = (
            response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        )
        if upstream_type and not (
            upstream_type.startswith("audio/") or upstream_type == "application/octet-stream"
        ):
            raise FishAudioServiceError(
                502,
                "fishaudio_invalid_audio",
                "Fish Audio 返回了无效音频。",
            )
        return audio, content_type

    def transcribe(
        self,
        *,
        audio: bytes,
        filename: str,
        content_type: str,
        model: str,
        language: str,
    ) -> str:
        data = {
            "auto_split": "true",
            "normalize": "true",
            "ignore_timestamps": "true",
        }
        if language:
            data["language"] = language
        try:
            response = self._post(
                "/v1/asr",
                headers={TTS_MODEL_HEADER: model},
                data=data,
                files={"audio": (filename, audio, content_type)},
            )
        except httpx.TimeoutException as error:
            raise FishAudioServiceError(
                504,
                "fishaudio_timeout",
                "Fish Audio 语音识别超时，请稍后重试。",
            ) from error
        except httpx.RequestError as error:
            raise FishAudioServiceError(
                502,
                "fishaudio_unreachable",
                "无法连接 Fish Audio 语音识别服务。",
            ) from error

        self._ensure_success(response)
        try:
            payload = response.json()
        except ValueError as error:
            raise FishAudioServiceError(
                502,
                "fishaudio_invalid_response",
                "Fish Audio 语音识别返回了无效结果。",
            ) from error
        text = payload.get("text") if isinstance(payload, dict) else None
        if not isinstance(text, str):
            raise FishAudioServiceError(
                502,
                "fishaudio_invalid_response",
                "Fish Audio 语音识别返回了无效结果。",
            )
        return text.strip()

    @staticmethod
    def _ensure_success(response: httpx.Response) -> None:
        if response.is_success:
            return
        status = response.status_code
        if status in {401, 403}:
            raise FishAudioServiceError(
                502,
                "fishaudio_unauthorized",
                "Fish Audio 凭据无效或缺少权限，请检查服务端 FISH_API_KEY。",
            )
        if status == 402:
            raise FishAudioServiceError(
                502,
                "fishaudio_payment_required",
                "Fish Audio 返回 402：当前模型需要账户充值，可改用免费模型 s2.1-pro-free。",
            )
        if status == 429:
            raise FishAudioServiceError(
                429,
                "fishaudio_rate_limited",
                "Fish Audio 请求过于频繁，请稍后重试。",
            )
        if status in {400, 404, 409, 422}:
            raise FishAudioServiceError(
                502,
                "fishaudio_request_rejected",
                "Fish Audio 拒绝了请求参数，请检查模型、音色或音频格式。",
            )
        raise FishAudioServiceError(
            502,
            "fishaudio_upstream_error",
            f"Fish Audio 返回 HTTP {status}。",
        )
