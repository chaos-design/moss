"""Vercel ASGI entrypoint for the Moss ASR service.

Vercel looks for a top-level ``app`` in ``app.py``, ``index.py``, ``server.py``,
``main.py``, ``wsgi.py``, or ``asgi.py`` at the project root. This module is that
entrypoint: it re-exports ``create_app`` from the real service package so the
service keeps its package-relative imports and its factory-only design.

The Vercel project Root Directory must be the repository root, not
``backend/services/asr``, because the service is imported as the
``backend.services.asr`` package from here.
"""

from __future__ import annotations

from backend.services.asr.app import create_app

app = create_app()
