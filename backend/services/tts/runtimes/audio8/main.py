from __future__ import annotations

import logging

from .app import create_server
from .config import Audio8Settings


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    settings = Audio8Settings.from_env()
    server = create_server(settings)
    print(f"[audio8] Sidecar ready at http://{settings.host}:{settings.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
