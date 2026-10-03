from __future__ import annotations

import json
import logging
import math
import threading
from collections import OrderedDict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Optional
from urllib.parse import urlparse

from .config import TtsSettings
from .engines import Audio8Engine, CosyVoiceEngine, KokoroEngine, TtsRegistry
from .errors import TtsServiceError

MAX_REQUEST_BYTES = 16 * 1024


def validate_synthesis_request(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise TtsServiceError(400, "invalid_request", "TTS 请求无效")
    text = payload.get("text", "")
    text = text.strip() if isinstance(text, str) else ""
    if not text or len(text) > 1_000:
        raise TtsServiceError(400, "invalid_text", "text 必须为 1 到 1000 个字符")
    try:
        speed = float(payload.get("speed", 1))
    except (TypeError, ValueError) as error:
        raise TtsServiceError(400, "invalid_speed", "speed 必须在 0.5 到 1.5 之间") from error
    if not math.isfinite(speed) or speed < 0.5 or speed > 1.5:
        raise TtsServiceError(400, "invalid_speed", "speed 必须在 0.5 到 1.5 之间")
    seed = payload.get("seed", 2_024)
    if isinstance(seed, bool) or not isinstance(seed, int) or abs(seed) > 9_007_199_254_740_991:
        raise TtsServiceError(400, "invalid_seed", "seed 必须为整数")
    voice = payload.get("voice")
    if voice is not None and not isinstance(voice, str):
        raise TtsServiceError(400, "invalid_voice", "voice 必须为字符串")
    return {
        "engine": payload.get("engine") if isinstance(payload.get("engine"), str) else "",
        "seed": seed,
        "speed": speed,
        "text": text,
        "voice": voice,
    }


class AudioCache:
    def __init__(self, max_bytes: int) -> None:
        self.max_bytes = max_bytes
        self.current_bytes = 0
        self.entries: OrderedDict[str, bytes] = OrderedDict()
        self.lock = threading.Lock()

    def get(self, key: str) -> Optional[bytes]:
        with self.lock:
            audio = self.entries.pop(key, None)
            if audio is not None:
                self.entries[key] = audio
            return audio

    def put(self, key: str, audio: bytes) -> None:
        if len(audio) > self.max_bytes:
            return
        with self.lock:
            previous = self.entries.pop(key, None)
            if previous is not None:
                self.current_bytes -= len(previous)
            self.entries[key] = audio
            self.current_bytes += len(audio)
            while self.current_bytes > self.max_bytes:
                _, oldest = self.entries.popitem(last=False)
                self.current_bytes -= len(oldest)


class TtsApplication:
    def __init__(self, registry: Any, max_cache_bytes: int) -> None:
        self.registry = registry
        self.audio_cache = AudioCache(max_cache_bytes)
        self.pending: dict[str, threading.Event] = {}
        self.pending_errors: dict[str, Exception] = {}
        self.pending_lock = threading.Lock()

    def synthesize(self, request: dict[str, Any]) -> tuple[bytes, str]:
        cache_key = json.dumps(request, sort_keys=True, ensure_ascii=False)
        cached = self.audio_cache.get(cache_key)
        if cached is not None:
            return cached, "HIT"

        with self.pending_lock:
            event = self.pending.get(cache_key)
            owner = event is None
            if owner:
                event = threading.Event()
                self.pending[cache_key] = event
                self.pending_errors.pop(cache_key, None)

        if not owner:
            event.wait()
            cached = self.audio_cache.get(cache_key)
            if cached is not None:
                return cached, "COALESCED"
            with self.pending_lock:
                error = self.pending_errors.get(cache_key)
            if error is not None:
                raise error
            raise TtsServiceError(500, "internal_error", "TTS 合成未返回音频")

        try:
            audio = self.registry.get(request["engine"]).synthesize(request)
            self.audio_cache.put(cache_key, audio)
            return audio, "MISS"
        except Exception as error:
            with self.pending_lock:
                self.pending_errors[cache_key] = error
            raise
        finally:
            with self.pending_lock:
                pending_event = self.pending.pop(cache_key)
                pending_event.set()


def create_registry(settings: TtsSettings) -> TtsRegistry:
    return TtsRegistry(
        [
            Audio8Engine(settings.audio8_url),
            KokoroEngine(
                settings.kokoro_model_path,
                settings.kokoro_voices_path,
                settings.kokoro_zh_model_path,
                settings.kokoro_zh_voices_path,
                settings.kokoro_zh_config_path,
            ),
            CosyVoiceEngine(settings.cosyvoice_url),
        ]
    )


def create_server(
    settings: TtsSettings,
    registry: Optional[Any] = None,
) -> ThreadingHTTPServer:
    application = TtsApplication(registry or create_registry(settings), settings.max_cache_bytes)

    class TtsRequestHandler(BaseHTTPRequestHandler):
        server_version = "MossTTS/2.0"

        def _origin_is_allowed(self) -> bool:
            origin = self.headers.get("Origin")
            return origin is None or origin in settings.allowed_origins

        def _set_cors_headers(self) -> None:
            origin = self.headers.get("Origin")
            if origin in settings.allowed_origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")

        def _send_json(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self._set_cors_headers()
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)

        def _read_json(self) -> Any:
            if self.headers.get_content_type() != "application/json":
                raise TtsServiceError(
                    415,
                    "invalid_content_type",
                    "请求必须使用 application/json",
                )
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError as error:
                raise TtsServiceError(400, "invalid_request", "TTS 请求无效") from error
            if length <= 0:
                raise TtsServiceError(400, "invalid_request", "TTS 请求无效")
            if length > MAX_REQUEST_BYTES:
                raise TtsServiceError(413, "request_too_large", "TTS 请求体过大")
            try:
                return json.loads(self.rfile.read(length))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise TtsServiceError(400, "invalid_json", "请求 JSON 无效") from error

        def _handle(self) -> None:
            if not self._origin_is_allowed():
                raise TtsServiceError(403, "origin_not_allowed", "请求来源不受信任")
            path = urlparse(self.path).path
            if self.command == "GET" and path == "/health":
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ready": True,
                        "service": "moss-tts",
                        "runtime": "python",
                        "engines": application.registry.health(),
                    },
                )
                return
            if self.command == "POST" and path == "/v1/tts/prepare":
                payload = self._read_json()
                engine = payload.get("engine") if isinstance(payload, dict) else ""
                application.registry.get(engine).prepare()
                self._send_json(HTTPStatus.OK, {"engine": engine, "ready": True})
                return
            if self.command == "POST" and path == "/v1/tts/synthesize":
                synthesis = validate_synthesis_request(self._read_json())
                audio, cache_status = application.synthesize(synthesis)
                self.send_response(HTTPStatus.OK)
                self._set_cors_headers()
                self.send_header(
                    "Access-Control-Expose-Headers",
                    "X-TTS-Cache, X-TTS-Engine",
                )
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(audio)))
                self.send_header("Content-Type", "audio/wav")
                self.send_header("X-TTS-Cache", cache_status)
                self.send_header("X-TTS-Engine", synthesis["engine"])
                self.end_headers()
                self.wfile.write(audio)
                return
            raise TtsServiceError(404, "not_found", "接口不存在")

        def do_OPTIONS(self) -> None:
            try:
                if not self._origin_is_allowed():
                    raise TtsServiceError(403, "origin_not_allowed", "请求来源不受信任")
                self.send_response(HTTPStatus.NO_CONTENT)
                self._set_cors_headers()
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Private-Network", "true")
                self.send_header("Access-Control-Max-Age", "600")
                self.end_headers()
            except TtsServiceError as error:
                self._send_json(error.status, {"error": error.code, "message": error.message})

        def do_GET(self) -> None:
            self._run_handler()

        def do_POST(self) -> None:
            self._run_handler()

        def _run_handler(self) -> None:
            try:
                self._handle()
            except TtsServiceError as error:
                self._send_json(error.status, {"error": error.code, "message": error.message})
            except Exception:
                logging.exception("[tts-service] request failed")
                self._send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": "internal_error", "message": "TTS 服务发生内部错误"},
                )

        def log_message(self, message: str, *args: Any) -> None:
            logging.info("[tts-service] %s %s", self.address_string(), message % args)

    server = ThreadingHTTPServer((settings.host, settings.port), TtsRequestHandler)
    server.daemon_threads = True
    return server
