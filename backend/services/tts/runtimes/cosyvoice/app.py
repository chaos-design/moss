from __future__ import annotations

import json
import logging
import math
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Optional
from urllib.parse import urlparse

from .config import CosyVoiceSettings
from .engine import CosyVoiceRuntime, CosyVoiceRuntimeError

MAX_REQUEST_BYTES = 16 * 1024


def create_server(
    settings: CosyVoiceSettings,
    runtime: Optional[CosyVoiceRuntime] = None,
) -> ThreadingHTTPServer:
    cosyvoice = runtime or CosyVoiceRuntime(settings)

    class CosyVoiceRequestHandler(BaseHTTPRequestHandler):
        server_version = "MossCosyVoice/1.0"

        def _send_json(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)

        def _read_json(self) -> dict[str, Any]:
            if self.headers.get_content_type() != "application/json":
                raise ValueError("请求必须使用 application/json")
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                raise ValueError("请求体大小无效")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("请求 JSON 无效")
            return payload

        def _handle(self) -> None:
            path = urlparse(self.path).path
            if self.command == "GET" and path == "/health":
                health = cosyvoice.health()
                self._send_json(
                    HTTPStatus.OK if health["ready"] else HTTPStatus.SERVICE_UNAVAILABLE,
                    health,
                )
                return
            if self.command == "POST" and path == "/prepare":
                cosyvoice.prepare()
                self._send_json(HTTPStatus.OK, {"ready": True})
                return
            if self.command == "POST" and path == "/synthesize":
                payload = self._read_json()
                text = payload.get("text")
                voice = payload.get("voice", "english_female")
                speed = float(payload.get("speed", 1))
                seed = payload.get("seed", 2_024)
                if not isinstance(text, str) or not text.strip() or len(text) > 1_000:
                    raise ValueError("text 必须为 1 到 1000 个字符")
                if not isinstance(voice, str):
                    raise ValueError("voice 必须为字符串")
                if not math.isfinite(speed) or speed < 0.5 or speed > 1.5:
                    raise ValueError("speed 必须在 0.5 到 1.5 之间")
                if (
                    isinstance(seed, bool)
                    or not isinstance(seed, int)
                    or abs(seed) > 9_007_199_254_740_991
                ):
                    raise ValueError("seed 必须为整数")
                audio = cosyvoice.synthesize(text.strip(), voice, speed, seed)
                self.send_response(HTTPStatus.OK)
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(audio)))
                self.send_header("Content-Type", "audio/wav")
                self.send_header("X-TTS-Engine", "cosyvoice")
                self.end_headers()
                self.wfile.write(audio)
                return
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

        def do_GET(self) -> None:
            self._run_handler()

        def do_POST(self) -> None:
            self._run_handler()

        def _run_handler(self) -> None:
            try:
                self._handle()
            except (ValueError, TypeError, json.JSONDecodeError) as error:
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"error": "invalid_request", "message": str(error)},
                )
            except CosyVoiceRuntimeError as error:
                self._send_json(
                    HTTPStatus.SERVICE_UNAVAILABLE,
                    {"error": "cosyvoice_unavailable", "message": str(error)},
                )
            except Exception as error:
                logging.exception("[cosyvoice] request failed")
                self._send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": "synthesis_failed", "message": str(error)},
                )

        def log_message(self, message: str, *args: Any) -> None:
            logging.info("[cosyvoice] %s %s", self.address_string(), message % args)

    server = ThreadingHTTPServer((settings.host, settings.port), CosyVoiceRequestHandler)
    server.daemon_threads = True
    return server
