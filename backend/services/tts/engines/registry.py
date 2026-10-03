from __future__ import annotations

from typing import Any

from ..errors import TtsServiceError


class TtsRegistry:
    def __init__(self, engines: list[Any]) -> None:
        self.engines = {engine.id: engine for engine in engines}

    def get(self, engine_id: str) -> Any:
        try:
            return self.engines[engine_id]
        except KeyError as error:
            raise TtsServiceError(
                400,
                "unsupported_engine",
                f"不支持的 TTS 引擎：{engine_id}",
            ) from error

    def health(self) -> dict[str, Any]:
        return {engine_id: engine.health() for engine_id, engine in self.engines.items()}
