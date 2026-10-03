from __future__ import annotations

import json
import logging
import math
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from .config import Audio8Settings
from .engine import Audio8Runtime, Audio8RuntimeError

MAX_REQUEST_BYTES = 16 * 1024


def create_server(
    settings: Audio8Settings,
    runtime: Audio8Runtime | None = None,
) -> ThreadingHTTPServer:
    audio8 = runtime or Audio8Runtime(settings)

    class Audio8RequestHandler(BaseHTTPRequestHandler):
        server_version = "MossAudio8/1.0"

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
                health = audio8.health()
                self._send_json(
                    HTTPStatus.OK if health["ready"] else HTTPStatus.SERVICE_UNAVAILABLE,
                    health,
                )
                return
            if self.command == "POST" and path == "/prepare":
                audio8.prepare()
                self._send_json(HTTPStatus.OK, {"ready": True})
                return
            if self.command == "POST" and path == "/synthesize":
                payload = self._read_json()
                text = payload.get("text")
                voice = payload.get("voice", "multilingual")
                speed = float(payload.get("speed", 1))
                seed = payload.get("seed", 2_024)
                if not isinstance(text, str) or not text.strip() or len(text) > 150:
                    raise ValueError("text 必须为 1 到 150 个字符")
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
                audio = audio8.synthesize(text.strip(), voice, speed, seed)
                self.send_response(HTTPStatus.OK)
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(audio)))
                self.send_header("Content-Type", "audio/wav")
                self.send_header("X-TTS-Engine", "audio8")
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
            except Audio8RuntimeError as error:
                self._send_json(
                    HTTPStatus.SERVICE_UNAVAILABLE,
                    {"error": "audio8_unavailable", "message": str(error)},
                )
            except Exception as error:
                logging.exception("[audio8] request failed")
                self._send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": "synthesis_failed", "message": str(error)},
                )

        def log_message(self, message: str, *args: Any) -> None:
            logging.info("[audio8] %s %s", self.address_string(), message % args)

    server = ThreadingHTTPServer((settings.host, settings.port), Audio8RequestHandler)
    server.daemon_threads = True
    return server
