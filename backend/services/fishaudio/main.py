from __future__ import annotations

import logging

import uvicorn

from .app import create_app
from .config import FishAudioSettings


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logger = logging.getLogger("moss.fishaudio")
    settings = FishAudioSettings.from_env()
    if not settings.configured:
        logger.warning(
            "FISH_API_KEY is not set; the adapter starts in a not-configured state."
        )
    app = create_app(settings)
    logger.info(
        "Fish Audio speech adapter ready at http://%s:%s",
        settings.host,
        settings.port,
    )
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        log_level="info",
        timeout_graceful_shutdown=10,
    )


if __name__ == "__main__":
    main()
