from __future__ import annotations

from typing import Any, Callable
from urllib.request import urlopen

from .http_client import SidecarTtsEngine


class CosyVoiceEngine(SidecarTtsEngine):
    id = "cosyvoice"
    display_name = "CosyVoice"

    def __init__(
        self,
        base_url: str,
        opener: Callable[..., Any] = urlopen,
    ) -> None:
        super().__init__(base_url, "cosyvoice_unavailable", opener)
