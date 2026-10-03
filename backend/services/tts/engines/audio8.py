from __future__ import annotations

from typing import Any, Callable
from urllib.request import urlopen

from .http_client import SidecarTtsEngine


class Audio8Engine(SidecarTtsEngine):
    id = "audio8"
    display_name = "Audio8"

    def __init__(
        self,
        base_url: str,
        opener: Callable[..., Any] = urlopen,
    ) -> None:
        super().__init__(base_url, "audio8_unavailable", opener)

    def synthesize(self, request: dict[str, Any]) -> bytes:
        return super().synthesize(
            {
                "text": request["text"],
                "voice": request.get("voice") or "multilingual",
                "speed": request["speed"],
                "seed": request["seed"],
            }
        )
