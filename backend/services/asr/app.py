from __future__ import annotations

import asyncio
import hmac
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator, Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import SUPPORTED_ENGINES, AsrSettings
from .engine import (
    QwenRecognitionEngine,
    RecognitionEngine,
    RecognitionResult,
    RecognitionSession,
    SenseVoiceRecognitionEngine,
    filter_recognition_text,
)
from .protocol import ProtocolError, StartCommand, decode_audio_chunk, event, parse_command

logger = logging.getLogger("moss.asr")


@dataclass
class RuntimeState:
    settings: AsrSettings
    engines: dict[str, RecognitionEngine]
    startup_errors: dict[str, str]
    active_connections: int = 0


def create_app(
    settings: AsrSettings | None = None,
    engine: RecognitionEngine | None = None,
    engine_factory: Callable[[str], RecognitionEngine] | None = None,
) -> FastAPI:
    resolved_settings = settings or AsrSettings.from_env()
    injected_engine_id = getattr(engine, "engine_id", resolved_settings.engine)
    runtime = RuntimeState(
        settings=resolved_settings,
        engines={injected_engine_id: engine} if engine else {},
        startup_errors={},
    )
    inference_lock = asyncio.Lock()
    connection_lock = asyncio.Lock()
    engine_load_lock = asyncio.Lock()

    def default_engine_factory(engine_id: str) -> RecognitionEngine:
        if engine_id == "sensevoice":
            return SenseVoiceRecognitionEngine(resolved_settings)
        return QwenRecognitionEngine(resolved_settings)

    create_engine = engine_factory or default_engine_factory

    async def resolve_engine(engine_id: str) -> RecognitionEngine:
        if engine_id not in SUPPORTED_ENGINES:
            raise ValueError(f"Unsupported ASR engine: {engine_id}")
        existing = runtime.engines.get(engine_id)
        if existing is not None:
            return existing
        async with engine_load_lock:
            existing = runtime.engines.get(engine_id)
            if existing is not None:
                return existing
            candidate = create_engine(engine_id)
            try:
                await asyncio.to_thread(candidate.load)
            except Exception as error:
                runtime.startup_errors[engine_id] = str(error)
                raise
            runtime.startup_errors.pop(engine_id, None)
            runtime.engines[engine_id] = candidate
            return candidate

    async def preload_engine(engine_id: str) -> None:
        try:
            await resolve_engine(engine_id)
            logger.info("Preloaded ASR engine: %s", engine_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            # Preloading is a warm-up optimization; a failure must not take the
            # service down. The engine can still be lazy-loaded on first use, and
            # the error is surfaced through /health startup_errors.
            logger.exception("Failed to preload ASR engine: %s", engine_id)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if not runtime.engines:
            try:
                await resolve_engine(resolved_settings.engine)
            except Exception as error:
                logger.exception("Failed to load ASR engine")
                raise
        preload_targets = [
            engine_id
            for engine_id in resolved_settings.preload_engines
            if engine_id not in runtime.engines
        ]
        preload_tasks = [
            asyncio.create_task(preload_engine(engine_id), name=f"asr-preload-{engine_id}")
            for engine_id in preload_targets
        ]
        try:
            yield
        finally:
            for task in preload_tasks:
                task.cancel()
            for task in preload_tasks:
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    app = FastAPI(
        title="Moss Realtime ASR",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_settings.allowed_origins),
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> JSONResponse:
        default_engine = runtime.engines.get(resolved_settings.engine)
        ready = default_engine is not None
        return JSONResponse(
            status_code=200 if ready else 503,
            content={
                "ready": ready,
                "service": "moss-asr",
                "engine": resolved_settings.engine,
                "model": (
                    default_engine.model_name
                    if default_engine
                    else (
                        resolved_settings.sensevoice_model_dir.name
                        if resolved_settings.engine == "sensevoice"
                        else resolved_settings.model_dir.name
                    )
                ),
                "engines": {
                    engine_id: {
                        "loaded": engine_id in runtime.engines,
                        "error": runtime.startup_errors.get(engine_id),
                    }
                    for engine_id in sorted(SUPPORTED_ENGINES)
                },
                "sampleRate": resolved_settings.sample_rate,
                "activeConnections": runtime.active_connections,
                "error": runtime.startup_errors.get(resolved_settings.engine),
            },
        )

    @app.websocket("/v1/asr/stream")
    async def stream(websocket: WebSocket) -> None:
        origin = websocket.headers.get("origin")
        if origin and origin not in resolved_settings.allowed_origins:
            await websocket.close(code=1008, reason="Origin is not allowed")
            return

        async with connection_lock:
            if runtime.active_connections >= resolved_settings.max_connections:
                await websocket.close(code=1013, reason="ASR server is at capacity")
                return
            runtime.active_connections += 1

        try:
            await websocket.accept()
            if not runtime.engines:
                await websocket.send_json(event("error", code="not_ready", message="ASR is not ready"))
                await websocket.close(code=1013)
                return

            session: RecognitionSession | None = None
            sample_rate = resolved_settings.sample_rate
            audio_format = "int16"
            configured = False
            received_audio = False
            total_samples = 0
            segment = 0
            last_partial = ""
            allowed_languages = ("zh", "en")
            await websocket.send_json(
                event(
                    "ready",
                    sampleRate=sample_rate,
                    format=audio_format,
                    model=runtime.engines[resolved_settings.engine].model_name,
                    engine=resolved_settings.engine,
                    engines=sorted(SUPPORTED_ENGINES),
                    requiresAuth=resolved_settings.api_key is not None,
                )
            )

            async def send_result(result: RecognitionResult, force_final: bool = False) -> None:
                nonlocal last_partial, segment
                is_final = force_final or result.is_final
                filtered_text = filter_recognition_text(
                    result.text,
                    result.language,
                    allowed_languages,
                )
                if is_final:
                    await websocket.send_json(
                        event(
                            "final",
                            text=filtered_text,
                            segment=segment,
                            tokens=result.tokens,
                            timestamps=result.timestamps,
                            language=result.language,
                        )
                    )
                    segment += 1
                    last_partial = ""
                    return
                if filtered_text and filtered_text != last_partial:
                    await websocket.send_json(
                        event(
                            "partial",
                            text=filtered_text,
                            segment=segment,
                            language=result.language,
                        )
                    )
                    last_partial = filtered_text

            async def finish_segment() -> None:
                nonlocal received_audio, total_samples
                if not received_audio or session is None:
                    return
                async with inference_lock:
                    result = await asyncio.to_thread(session.finish)
                await send_result(result, force_final=True)
                session.reset()
                received_audio = False
                total_samples = 0

            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    break

                text = message.get("text")
                if text is not None:
                    try:
                        command = parse_command(
                            text,
                            resolved_settings.sample_rate,
                            resolved_settings.engine,
                        )
                        if isinstance(command, StartCommand):
                            if received_audio:
                                raise ProtocolError(
                                    "stream_started",
                                    "start must be sent before audio",
                                )
                            if resolved_settings.api_key and not hmac.compare_digest(
                                command.token or "", resolved_settings.api_key
                            ):
                                await websocket.send_json(
                                    event(
                                        "error",
                                        code="unauthorized",
                                        message="Invalid ASR token",
                                    )
                                )
                                await websocket.close(code=1008)
                                return
                            sample_rate = command.sample_rate
                            audio_format = command.audio_format
                            try:
                                selected_engine = await resolve_engine(command.engine)
                            except Exception as error:
                                logger.exception("Failed to load requested ASR engine")
                                await websocket.send_json(
                                    event(
                                        "error",
                                        code="engine_unavailable",
                                        message=str(error),
                                    )
                                )
                                continue
                            allowed_languages = command.languages
                            session = selected_engine.create_session(
                                command.context,
                                command.languages,
                            )
                            configured = True
                            await websocket.send_json(
                                event(
                                    "started",
                                    sampleRate=sample_rate,
                                    format=audio_format,
                                    engine=command.engine,
                                    model=selected_engine.model_name,
                                    languages=list(command.languages),
                                )
                            )
                        elif command == "ping":
                            await websocket.send_json(event("pong"))
                        elif command == "flush":
                            if not configured:
                                raise ProtocolError("unauthorized", "Send an authenticated start first")
                            await finish_segment()
                        elif command == "stop":
                            if not configured:
                                raise ProtocolError("unauthorized", "Send an authenticated start first")
                            await finish_segment()
                            await websocket.close(code=1000)
                            return
                    except ProtocolError as error:
                        await websocket.send_json(
                            event("error", code=error.code, message=str(error))
                        )
                    continue

                data = message.get("bytes")
                if data is None:
                    continue
                if not configured:
                    await websocket.send_json(
                        event(
                            "error",
                            code="unauthorized",
                            message="Send an authenticated start before audio",
                        )
                    )
                    await websocket.close(code=1008)
                    return
                if session is None:
                    await websocket.send_json(
                        event("error", code="not_started", message="Send start before audio")
                    )
                    continue
                if not data:
                    continue
                if len(data) > resolved_settings.max_chunk_bytes:
                    await websocket.send_json(
                        event(
                            "error",
                            code="chunk_too_large",
                            message=f"Audio chunks cannot exceed {resolved_settings.max_chunk_bytes} bytes",
                        )
                    )
                    await websocket.close(code=1009)
                    return

                try:
                    samples = decode_audio_chunk(data, audio_format)
                except ProtocolError as error:
                    await websocket.send_json(event("error", code=error.code, message=str(error)))
                    continue
                total_samples += samples.size
                if total_samples > sample_rate * resolved_settings.max_audio_seconds:
                    await websocket.send_json(
                        event(
                            "error",
                            code="stream_too_long",
                            message="Maximum stream duration exceeded",
                        )
                    )
                    await websocket.close(code=1008)
                    return

                received_audio = True
                async with inference_lock:
                    result = await asyncio.to_thread(
                        session.accept_waveform,
                        sample_rate,
                        samples,
                    )
                await send_result(result)
                if result.is_final:
                    session.reset()
                    received_audio = False
                    total_samples = 0
        except WebSocketDisconnect:
            pass
        except Exception:
            logger.exception("ASR WebSocket connection failed")
            try:
                await websocket.send_json(
                    event("error", code="internal_error", message="ASR processing failed")
                )
                await websocket.close(code=1011)
            except Exception:
                pass
        finally:
            async with connection_lock:
                runtime.active_connections = max(0, runtime.active_connections - 1)

    app.state.asr_runtime = runtime
    return app
