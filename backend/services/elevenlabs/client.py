from __future__ import annotations

import math
from typing import Any
from urllib.parse import quote

import httpx

from .config import ElevenLabsSettings
from .errors import ElevenLabsServiceError
# Re-exported so existing imports from ``client`` keep working; the values now live in the
# shared rule module alongside the test-synthesis defaults.
from .rules import (
    MAX_VOICE_SPEED,
    MIN_VOICE_SPEED,
    SUPPORTED_RESPONSE_FORMATS,
    VOICE_ALIASES,
)


def resolve_output_format(value: str) -> tuple[str, str]:
    try:
        return SUPPORTED_RESPONSE_FORMATS[value]
    except KeyError as error:
        raise ElevenLabsServiceError(
            400,
            "unsupported_format",
            "ElevenLabs 适配器仅支持 mp3、opus、pcm 或 wav 输出。",
        ) from error


def resolve_voice_id(value: str) -> str:
    normalized = value.strip()
    return VOICE_ALIASES.get(normalized.lower(), normalized)


def resolve_voice_speed(value: float) -> float:
    if not math.isfinite(value):
        raise ElevenLabsServiceError(400, "invalid_speed", "speed 必须是有限数字。")
    return round(min(MAX_VOICE_SPEED, max(MIN_VOICE_SPEED, value)), 3)


class ElevenLabsClient:
    def __init__(
        self,
        settings: ElevenLabsSettings,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.settings = settings
        self._client = httpx.Client(
            base_url=settings.base_url,
            headers={"xi-api-key": settings.api_key},
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
        output_format, fallback_content_type = resolve_output_format(response_format)
        # 空音色交给服务端默认值，避免生成 /v1/text-to-speech/ 这类缺 voice_id 的地址。
        requested_voice = resolve_voice_id(voice) or self.settings.default_voice
        if not requested_voice:
            raise ElevenLabsServiceError(
                400,
                "invalid_voice",
                "voice 不能为空，且服务端未配置默认音色。",
            )
        # 空/未知模型交回服务端默认：settings.tts_model 来自规则表，默认是成本最低的 flash 档。
        requested_model = model.strip() or self.settings.tts_model

        # 兜底默认参数：无效音色或无效模型各重试一次。一次手误的音色名（如 multilingual）
        # 不应让整条语音链路不可用，重试目标取服务端默认值。
        voice_id = requested_voice
        model_id = requested_model
        response: httpx.Response | None = None
        for attempt in range(2):
            payload: dict[str, Any] = {
                "text": text,
                "model_id": model_id,
                "voice_settings": {"speed": resolve_voice_speed(speed)},
            }
            try:
                response = self._post(
                    f"/v1/text-to-speech/{quote(voice_id, safe='')}",
                    params={"output_format": output_format},
                    json=payload,
                )
            except httpx.TimeoutException as error:
                raise ElevenLabsServiceError(
                    504,
                    "elevenlabs_timeout",
                    "ElevenLabs 语音合成超时，请稍后重试。",
                ) from error
            except httpx.RequestError as error:
                raise ElevenLabsServiceError(
                    503,
                    "elevenlabs_unreachable",
                    "无法连接 ElevenLabs 语音合成服务，请检查网络或代理。",
                ) from error
            if response.is_success:
                break
            if attempt == 0:
                fallback_voice = (
                    self._upstream_error_code(response) == "voice_not_found"
                    and voice_id != self.settings.default_voice
                )
                fallback_model = (
                    self._upstream_error_code(response) == "bad_request"
                    and "invalid id" in self._upstream_error_message(response).lower()
                    and model_id != self.settings.tts_model
                )
                if fallback_voice:
                    voice_id = self.settings.default_voice
                    continue
                if fallback_model:
                    model_id = self.settings.tts_model
                    continue
                # 凭据、余额、限流等不可兜底的失败不重试：原样再发一次只会
                # 放大限流与配额消耗（与 Fish Audio 适配器「切换参数才重试」一致）。
                break

        assert response is not None  # 循环至少执行一次
        self._ensure_success(response)
        content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        audio = response.content
        if not audio:
            raise ElevenLabsServiceError(
                502,
                "elevenlabs_invalid_audio",
                "ElevenLabs 返回了无效音频。",
            )
        if content_type and not content_type.startswith("audio/"):
            raise ElevenLabsServiceError(
                502,
                "elevenlabs_invalid_audio",
                "ElevenLabs 返回了无效音频。",
            )
        return audio, content_type or fallback_content_type

    def transcribe(
        self,
        *,
        audio: bytes,
        filename: str,
        content_type: str,
        model: str,
        language: str,
    ) -> str:
        data = {"model_id": model}
        if language:
            data["language_code"] = language
        try:
            response = self._post(
                "/v1/speech-to-text",
                data=data,
                files={"file": (filename, audio, content_type)},
            )
        except httpx.TimeoutException as error:
            raise ElevenLabsServiceError(
                504,
                "elevenlabs_timeout",
                "ElevenLabs 语音识别超时，请稍后重试。",
            ) from error
        except httpx.RequestError as error:
            raise ElevenLabsServiceError(
                503,
                "elevenlabs_unreachable",
                "无法连接 ElevenLabs 语音识别服务，请检查网络或代理。",
            ) from error

        self._ensure_success(response)
        try:
            payload = response.json()
        except ValueError as error:
            raise ElevenLabsServiceError(
                502,
                "elevenlabs_invalid_response",
                "ElevenLabs 语音识别返回了无效结果。",
            ) from error
        text = payload.get("text") if isinstance(payload, dict) else None
        if not isinstance(text, str):
            raise ElevenLabsServiceError(
                502,
                "elevenlabs_invalid_response",
                "ElevenLabs 语音识别返回了无效结果。",
            )
        return text.strip()

    @staticmethod
    def _upstream_error_code(response: httpx.Response) -> str:
        """只取上游错误体里的机器码，不透传自由文本，避免把上游内容写进响应。"""
        try:
            payload = response.json()
        except ValueError:
            return ""
        detail = payload.get("detail") if isinstance(payload, dict) else None
        code = detail.get("code") if isinstance(detail, dict) else None
        return code.strip()[:64] if isinstance(code, str) else ""

    @staticmethod
    def _upstream_error_message(response: httpx.Response) -> str:
        """取上游错误信息用于兜底判定（如 invalid ID 指向模型名）；不透传进响应。"""
        try:
            payload = response.json()
        except ValueError:
            return ""
        detail = payload.get("detail") if isinstance(payload, dict) else None
        message = detail.get("message") if isinstance(detail, dict) else None
        return message.strip()[:200] if isinstance(message, str) else ""

    @staticmethod
    def _ensure_success(response: httpx.Response) -> None:
        if response.is_success:
            return
        status = response.status_code
        upstream_code = ElevenLabsClient._upstream_error_code(response)
        suffix = f"（{upstream_code}）" if upstream_code else ""
        # 上游状态码就是诊断信息。凭据、余额、参数与限流问题不再统一压成 502：
        # 设置页按 401/402/422 直接给出“换密钥 / 充值 / 改参数”，而不是让人猜网关坏了。
        if upstream_code in {"output_format_not_allowed"}:
            # 免费层的 TTS 输出只有 mp3；wav / pcm 等格式需要 Pro 档。
            # 403 + 该错误码不能按「凭据无效」报，否则学习者会误改密钥。
            raise ElevenLabsServiceError(
                400,
                "elevenlabs_request_rejected",
                "ElevenLabs 当前套餐不支持该输出格式（wav / pcm 等需要 Pro 档），请改用 mp3。",
            )
        if status in {401, 403} or upstream_code in {"invalid_api_key", "authentication_error"}:
            raise ElevenLabsServiceError(
                401,
                "elevenlabs_unauthorized",
                f"ElevenLabs 凭据无效或缺少权限，请检查服务端 ELEVENLABS_API_KEY。{suffix}",
            )
        if status == 402:
            raise ElevenLabsServiceError(
                402,
                "elevenlabs_payment_required",
                f"ElevenLabs 账户余额不足或当前套餐不可用，请充值或改用其他语音服务。{suffix}",
            )
        if status == 429:
            raise ElevenLabsServiceError(
                429,
                "elevenlabs_rate_limited",
                "ElevenLabs 请求过于频繁，请稍后重试。",
            )
        if status in {400, 404, 409, 422}:
            # 兜底失败后仍被拒绝时，把最常见的「音色手误」指向可执行动作。
            hint = (
                " 可清空音色直接使用服务端默认音色。"
                if upstream_code == "voice_not_found"
                else ""
            )
            raise ElevenLabsServiceError(
                status,
                "elevenlabs_request_rejected",
                f"ElevenLabs 拒绝了请求参数，请检查模型、音色或音频格式。{suffix}{hint}",
            )
        raise ElevenLabsServiceError(
            502,
            "elevenlabs_upstream_error",
            f"ElevenLabs 返回 HTTP {status}。{suffix}",
        )
