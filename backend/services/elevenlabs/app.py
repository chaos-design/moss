from __future__ import annotations

import asyncio
import hmac
import re
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from .client import (
    SUPPORTED_RESPONSE_FORMATS,
    ElevenLabsClient,
    resolve_output_format,
)
from .config import ElevenLabsSettings
from .errors import ElevenLabsServiceError

MAX_SPEECH_REQUEST_BYTES = 64_000
ALLOWED_AUDIO_CONTENT_TYPES = {"application/octet-stream", "video/webm"}
LANGUAGE_CODE_PATTERN = re.compile(r"^[a-z]{2,3}$")


def _error(status: int, code: str, message: str) -> ElevenLabsServiceError:
    return ElevenLabsServiceError(status, code, message)


def _ensure_authorized(request: Request, settings: ElevenLabsSettings) -> None:
    if not settings.access_token:
        return
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(
        token.strip(), settings.access_token
    ):
        raise _error(401, "unauthorized", "本机 ElevenLabs 适配服务需要访问令牌。")


def _ensure_configured(settings: ElevenLabsSettings) -> None:
    if not settings.configured:
        raise _error(
            503,
            "not_configured",
            "尚未配置 ELEVENLABS_API_KEY，ElevenLabs 适配服务不可用。",
        )


def _parse_text(payload: dict[str, object], settings: ElevenLabsSettings) -> str:
    raw = payload.get("input", payload.get("text"))
    text = raw.strip() if isinstance(raw, str) else ""
    if not text or len(text) > settings.max_text_length:
        raise _error(
            400,
            "invalid_text",
            f"input 必须为 1 到 {settings.max_text_length} 个字符。",
        )
    return text


def _parse_string(
    payload: dict[str, object],
    key: str,
    fallback: str,
    maximum: int,
    code: str,
) -> str:
    raw = payload.get(key, fallback)
    if raw is None:
        raw = fallback
    if not isinstance(raw, str):
        raise _error(400, code, f"{key} 必须是字符串。")
    value = raw.strip()
    if not value or len(value) > maximum:
        raise _error(400, code, f"{key} 必须为 1 到 {maximum} 个字符。")
    return value


def _parse_speed(payload: dict[str, object]) -> float:
    raw = payload.get("speed", 1)
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        raise _error(400, "invalid_speed", "speed 必须是数字。")
    speed = float(raw)
    if speed < 0.5 or speed > 2:
        raise _error(400, "invalid_speed", "speed 必须在 0.5 到 2 之间。")
    return speed


def create_app(
    settings: ElevenLabsSettings | None = None,
    client: ElevenLabsClient | None = None,
) -> FastAPI:
    resolved_settings = settings or ElevenLabsSettings.from_env()
    owned_client = client is None
    resolved_client = client or ElevenLabsClient(resolved_settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            yield
        finally:
            if owned_client:
                resolved_client.close()

    app = FastAPI(
        title="Moss ElevenLabs Speech Adapter",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=sorted(resolved_settings.allowed_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def reject_unknown_origins(request: Request, call_next):  # type: ignore[no-untyped-def]
        origin = request.headers.get("origin")
        if origin and origin not in resolved_settings.allowed_origins:
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "code": "origin_not_allowed",
                        "message": "请求来源不受信任。",
                    }
                },
            )
        return await call_next(request)

    @app.exception_handler(ElevenLabsServiceError)
    async def handle_service_error(
        _request: Request,
        error: ElevenLabsServiceError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=error.status,
            content={"error": {"code": error.code, "message": error.message}},
        )

    @app.get("/health")
    async def health() -> JSONResponse:
        ready = resolved_settings.configured
        return JSONResponse(
            status_code=200 if ready else 503,
            content={
                "ready": ready,
                "configured": ready,
                "service": "moss-elevenlabs",
                "provider": "elevenlabs",
                "models": {
                    "tts": resolved_settings.tts_model,
                    "asr": resolved_settings.asr_model,
                },
                "defaultVoice": resolved_settings.default_voice,
                "accessTokenRequired": bool(resolved_settings.access_token),
            },
        )

    @app.post("/v1/audio/speech")
    async def create_speech(request: Request) -> Response:
        _ensure_authorized(request, resolved_settings)
        _ensure_configured(resolved_settings)
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                too_large = int(content_length) > MAX_SPEECH_REQUEST_BYTES
            except ValueError:
                too_large = False
            if too_large:
                raise _error(413, "request_too_large", "语音合成请求体过大。")
        try:
            payload = await request.json()
        except ValueError as error:
            raise _error(400, "invalid_json", "请求体必须是有效 JSON。") from error
        if not isinstance(payload, dict):
            raise _error(400, "invalid_request", "语音合成请求必须是 JSON 对象。")

        text = _parse_text(payload, resolved_settings)
        voice = _parse_string(
            payload,
            "voice",
            resolved_settings.default_voice,
            120,
            "invalid_voice",
        )
        model = _parse_string(
            payload,
            "model",
            resolved_settings.tts_model,
            120,
            "invalid_model",
        )
        response_format = _parse_string(
            payload,
            "response_format",
            "mp3",
            16,
            "invalid_format",
        )
        if response_format not in SUPPORTED_RESPONSE_FORMATS:
            resolve_output_format(response_format)
        speed = _parse_speed(payload)

        audio, content_type = await asyncio.to_thread(
            resolved_client.synthesize,
            text=text,
            voice=voice,
            model=model,
            response_format=response_format,
            speed=speed,
        )
        return Response(
            content=audio,
            media_type=content_type,
            headers={
                "Cache-Control": "no-store",
                "X-ElevenLabs-Model": model,
            },
        )

    @app.post("/v1/audio/transcriptions")
    async def create_transcription(
        request: Request,
        file: UploadFile | None = File(default=None),
        model: str = Form(default=""),
        language: str = Form(default=""),
    ) -> JSONResponse:
        _ensure_authorized(request, resolved_settings)
        _ensure_configured(resolved_settings)
        if file is None or not file.filename:
            raise _error(400, "invalid_audio", "没有收到可识别的语音文件。")

        audio = await file.read(resolved_settings.max_audio_bytes + 1)
        if not audio:
            raise _error(400, "invalid_audio", "没有收到可识别的语音数据。")
        if len(audio) > resolved_settings.max_audio_bytes:
            raise _error(413, "request_too_large", "单段语音不能超过 8 MB。")

        content_type = (file.content_type or "application/octet-stream").lower()
        if not content_type.startswith("audio/") and content_type not in ALLOWED_AUDIO_CONTENT_TYPES:
            raise _error(415, "invalid_audio_type", "不支持的音频类型。")

        resolved_model = model.strip() or resolved_settings.asr_model
        if len(resolved_model) > 120:
            raise _error(400, "invalid_model", "model 过长。")
        resolved_language = language.strip().lower()
        if resolved_language and not LANGUAGE_CODE_PATTERN.fullmatch(resolved_language):
            raise _error(400, "invalid_language", "language 必须是 ISO 639 语言代码。")

        text = await asyncio.to_thread(
            resolved_client.transcribe,
            audio=audio,
            filename=file.filename or "speech.webm",
            content_type=content_type,
            model=resolved_model,
            language=resolved_language,
        )
        return JSONResponse(content={"text": text}, headers={"Cache-Control": "no-store"})

    return app
