from __future__ import annotations

import json
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ..errors import TtsServiceError


def read_json(response: Any) -> dict[str, Any]:
    return json.loads(response.read().decode("utf-8"))


class SidecarTtsEngine:
    id = ""
    display_name = ""

    def __init__(
        self,
        base_url: str,
        unavailable_code: str,
        opener: Callable[..., Any] = urlopen,
    ) -> None:
        self.base_url = base_url
        self.unavailable_code = unavailable_code
        self.opener = opener

    def health(self) -> dict[str, Any]:
        try:
            with self.opener(f"{self.base_url}/health", timeout=2) as response:
                details = read_json(response)
                details["ready"] = (
                    response.status == 200
                    and details.get("ready") is True
                    and details.get("engine") == self.id
                )
                return details
        except (OSError, ValueError, URLError):
            return {"ready": False}

    def prepare(self) -> None:
        self._request_json("/prepare", {})

    def synthesize(self, request: dict[str, Any]) -> bytes:
        response = self._request("/synthesize", request, timeout=300)
        with response:
            content_type = response.headers.get("Content-Type", "")
            if not content_type.startswith("audio/wav"):
                raise TtsServiceError(
                    502,
                    "invalid_audio",
                    f"{self.display_name} 返回了无效音频",
                )
            return response.read()

    def _request_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = self._request(path, payload, timeout=300)
        with response:
            return read_json(response)

    def _request(self, path: str, payload: dict[str, Any], timeout: int) -> Any:
        outgoing = Request(
            f"{self.base_url}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            return self.opener(outgoing, timeout=timeout)
        except HTTPError as error:
            if error.code == 404:
                raise TtsServiceError(
                    503,
                    self.unavailable_code,
                    f"{self.display_name} 推理进程未运行或端口被其他服务占用",
                ) from error
            try:
                message = read_json(error).get("message")
            except (ValueError, json.JSONDecodeError):
                message = None
            raise TtsServiceError(
                error.code,
                f"{self.id}_failed",
                message or f"{self.display_name} 返回 HTTP {error.code}",
            ) from error
        except (OSError, URLError) as error:
            raise TtsServiceError(
                503,
                self.unavailable_code,
                f"无法连接本地 {self.display_name} 推理进程",
            ) from error
