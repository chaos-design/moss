from __future__ import annotations

import logging

import uvicorn

from .app import create_app
from .config import AsrSettings


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    settings = AsrSettings.from_env()
    uvicorn.run(
        create_app(settings),
        host=settings.host,
        port=settings.port,
        log_level="info",
        ws_max_size=settings.max_chunk_bytes,
        timeout_graceful_shutdown=10,
    )


if __name__ == "__main__":
    main()
