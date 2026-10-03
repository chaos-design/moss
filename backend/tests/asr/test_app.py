from __future__ import annotations

import tempfile
import time
import unittest
from dataclasses import replace
from pathlib import Path
from typing import Any, Callable

import numpy as np
from fastapi.testclient import TestClient

from backend.services.asr.app import create_app
from backend.services.asr.config import AsrSettings
from backend.services.asr.engine import RecognitionResult


class FakeSession:
    def __init__(self) -> None:
        self.calls = 0
        self.resets = 0

    def accept_waveform(
        self,
        sample_rate: int,
        samples: np.ndarray,
    ) -> RecognitionResult:
        self.calls += 1
        assert sample_rate == 16_000
        assert samples.dtype == np.float32
        return RecognitionResult(
            text="hello",
            tokens=["hello"],
            timestamps=[0.0],
            is_final=False,
        )

    def finish(self) -> RecognitionResult:
        return RecognitionResult(
            text="hello world",
            tokens=["hello", "world"],
            timestamps=[0.0, 0.2],
            is_final=True,
        )

    def reset(self) -> None:
        self.resets += 1


class FakeEngine:
    model_name = "fake-bilingual-model"

    def __init__(self) -> None:
        self.session = FakeSession()
        self.contexts: list[str] = []

    def create_session(
        self,
        context: str = "",
        languages: tuple[str, ...] = ("zh", "en"),
    ) -> FakeSession:
        assert languages == ("zh", "en")
        self.contexts.append(context)
        return self.session


class LoadableEngine:
    def __init__(self, engine_id: str, *, fail: bool = False) -> None:
        self.engine_id = engine_id
        self.model_name = f"{engine_id}-model"
        self.fail = fail
        self.load_calls = 0

    def load(self) -> None:
        self.load_calls += 1
        if self.fail:
            raise RuntimeError(f"cannot load {self.engine_id}")

    def create_session(
        self,
        context: str = "",
        languages: tuple[str, ...] = ("zh", "en"),
    ) -> FakeSession:
        return FakeSession()


def create_settings(**changes: object) -> AsrSettings:
    with tempfile.TemporaryDirectory() as temporary:
        base = AsrSettings(
            host="127.0.0.1",
            port=5580,
            model_dir=Path(temporary),
            model_id="Qwen/Qwen3-ASR-1.7B",
            device="cpu",
            dtype="float32",
            sample_rate=16_000,
            max_connections=2,
            max_chunk_bytes=65_536,
            max_audio_seconds=30,
            max_new_tokens=256,
            speech_threshold=0.012,
            noise_calibration_seconds=0.4,
            noise_threshold_multiplier=2.2,
            min_speech_seconds=0.18,
            endpoint_silence_seconds=0.85,
            pre_roll_seconds=0.25,
            allowed_origins=("http://localhost:5577",),
            api_key=None,
        )
        return replace(base, **changes)


def _wait_for_health(
    client: TestClient,
    predicate: Callable[[dict[str, Any]], bool],
    timeout: float = 5.0,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    payload: dict[str, Any] = {}
    while time.monotonic() < deadline:
        payload = client.get("/health").json()
        if predicate(payload):
            return payload
        time.sleep(0.02)
    return payload


class AsrAppTest(unittest.TestCase):
    def test_health_and_streaming_protocol(self) -> None:
        engine = FakeEngine()
        app = create_app(create_settings(), engine)

        with TestClient(app) as client:
            response = client.get(
                "/health",
                headers={"origin": "http://localhost:5577"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["ready"])
            self.assertEqual(
                response.headers["access-control-allow-origin"],
                "http://localhost:5577",
            )

            with client.websocket_connect("/v1/asr/stream") as websocket:
                self.assertEqual(websocket.receive_json()["type"], "ready")
                websocket.send_json(
                    {
                        "type": "start",
                        "sampleRate": 16_000,
                        "format": "int16",
                        "context": "Vocabulary: latte.",
                    }
                )
                self.assertEqual(websocket.receive_json()["type"], "started")
                websocket.send_bytes(np.zeros(1_600, dtype="<i2").tobytes())
                partial = websocket.receive_json()
                self.assertEqual(partial["type"], "partial")
                self.assertEqual(partial["text"], "hello")
                websocket.send_json({"type": "flush"})
                final = websocket.receive_json()
                self.assertEqual(final["type"], "final")
                self.assertEqual(final["text"], "hello world")
                self.assertEqual(final["segment"], 0)
                websocket.send_bytes(np.zeros(1_600, dtype="<i2").tobytes())
                self.assertEqual(websocket.receive_json()["type"], "partial")
                websocket.send_json({"type": "flush"})
                next_final = websocket.receive_json()
                self.assertEqual(next_final["type"], "final")
                self.assertEqual(next_final["segment"], 1)
                websocket.send_json({"type": "stop"})

        self.assertEqual(engine.session.calls, 2)
        self.assertEqual(engine.session.resets, 2)
        self.assertIn("Vocabulary: latte.", engine.contexts)

    def test_requires_configured_api_key(self) -> None:
        app = create_app(create_settings(api_key="secret"), FakeEngine())

        with TestClient(app) as client:
            with client.websocket_connect("/v1/asr/stream") as websocket:
                ready = websocket.receive_json()
                self.assertTrue(ready["requiresAuth"])
                websocket.send_json(
                    {
                        "type": "start",
                        "sampleRate": 16_000,
                        "format": "int16",
                        "token": "wrong",
                    }
                )
                error = websocket.receive_json()
                self.assertEqual(error["code"], "unauthorized")

    def test_rejects_untrusted_origin(self) -> None:
        app = create_app(create_settings(), FakeEngine())

        with TestClient(app) as client:
            with self.assertRaises(Exception):
                with client.websocket_connect(
                    "/v1/asr/stream",
                    headers={"origin": "https://attacker.example"},
                ):
                    pass

    def test_preloads_configured_secondary_engine_at_startup(self) -> None:
        default_engine = FakeEngine()
        preloaded = LoadableEngine("qwen3-asr")

        def factory(engine_id: str) -> object:
            assert engine_id == "qwen3-asr"
            return preloaded

        app = create_app(
            create_settings(engine="sensevoice", preload_engines=("qwen3-asr",)),
            default_engine,
            engine_factory=factory,
        )

        with TestClient(app) as client:
            health = _wait_for_health(
                client,
                lambda payload: payload["engines"]["qwen3-asr"]["loaded"],
            )

        self.assertEqual(preloaded.load_calls, 1)
        self.assertTrue(health["engines"]["qwen3-asr"]["loaded"])
        self.assertIsNone(health["engines"]["qwen3-asr"]["error"])

    def test_preload_failure_is_non_fatal(self) -> None:
        default_engine = FakeEngine()
        failing = LoadableEngine("qwen3-asr", fail=True)

        app = create_app(
            create_settings(engine="sensevoice", preload_engines=("qwen3-asr",)),
            default_engine,
            engine_factory=lambda engine_id: failing,
        )

        with TestClient(app) as client:
            # The service still starts and serves the default engine.
            health = _wait_for_health(
                client,
                lambda payload: payload["engines"]["qwen3-asr"]["error"] is not None,
            )
            self.assertTrue(health["ready"])
            self.assertFalse(health["engines"]["qwen3-asr"]["loaded"])
            self.assertIn("cannot load qwen3-asr", health["engines"]["qwen3-asr"]["error"])


if __name__ == "__main__":
    unittest.main()
