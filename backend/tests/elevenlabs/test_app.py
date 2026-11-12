from __future__ import annotations

import unittest
from typing import Any

from fastapi.testclient import TestClient

from backend.services.elevenlabs.app import create_app
from backend.services.elevenlabs.config import ElevenLabsSettings
from backend.services.elevenlabs.errors import ElevenLabsServiceError


def create_settings(**overrides: object) -> ElevenLabsSettings:
    values = {
        "host": "127.0.0.1",
        "port": 5583,
        "allowed_origins": frozenset({"http://localhost:5577"}),
        "api_key": "test-key",
        "access_token": "",
        "base_url": "https://api.elevenlabs.io",
        "tts_model": "eleven_v4",
        "asr_model": "scribe_v2",
        "default_voice": "JBFqnCBsd6RMkjVDRZzb",
    }
    values.update(overrides)
    return ElevenLabsSettings(**values)  # type: ignore[arg-type]


class FakeClient:
    def __init__(self) -> None:
        self.synthesis: list[dict[str, Any]] = []
        self.transcriptions: list[dict[str, Any]] = []
        self.error: ElevenLabsServiceError | None = None
        self.closed = False

    def synthesize(self, **kwargs: Any) -> tuple[bytes, str]:
        if self.error:
            raise self.error
        self.synthesis.append(kwargs)
        return b"ID3", "audio/mpeg"

    def transcribe(self, **kwargs: Any) -> str:
        if self.error:
            raise self.error
        self.transcriptions.append(kwargs)
        return "Hello world"

    def close(self) -> None:
        self.closed = True


class ElevenLabsAppTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = FakeClient()
        self.app = create_app(create_settings(), client=self.client)  # type: ignore[arg-type]

    def test_health_reports_configuration_without_the_api_key(self) -> None:
        with TestClient(self.app) as client:
            response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ready"])
        self.assertEqual(payload["service"], "moss-elevenlabs")
        self.assertEqual(payload["models"], {"tts": "eleven_v4", "asr": "scribe_v2"})
        self.assertNotIn("test-key", response.text)

    def test_health_is_not_ready_without_an_api_key(self) -> None:
        app = create_app(create_settings(api_key=""), client=FakeClient())  # type: ignore[arg-type]
        with TestClient(app) as client:
            response = client.get("/health")
            request = client.post("/v1/audio/speech", json={"input": "Hello."})

        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()["ready"])
        self.assertEqual(request.status_code, 503)
        self.assertEqual(request.json()["error"]["code"], "not_configured")

    def test_synthesizes_with_defaults_and_returns_audio(self) -> None:
        with TestClient(self.app) as client:
            response = client.post(
                "/v1/audio/speech",
                json={"input": " Could I get a coffee? ", "speed": 0.9},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "audio/mpeg")
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.content, b"ID3")
        self.assertEqual(
            self.client.synthesis,
            [
                {
                    "text": "Could I get a coffee?",
                    "voice": "JBFqnCBsd6RMkjVDRZzb",
                    "model": "eleven_v4",
                    "response_format": "mp3",
                    "speed": 0.9,
                }
            ],
        )

    def test_rejects_invalid_synthesis_input(self) -> None:
        cases = [
            ({}, "invalid_text"),
            ({"input": ""}, "invalid_text"),
            ({"input": "Hello.", "speed": True}, "invalid_speed"),
            ({"input": "Hello.", "speed": 3}, "invalid_speed"),
            ({"input": "Hello.", "voice": ""}, "invalid_voice"),
            ({"input": "Hello.", "response_format": "aac"}, "unsupported_format"),
        ]
        with TestClient(self.app) as client:
            for payload, code in cases:
                with self.subTest(payload=payload):
                    response = client.post("/v1/audio/speech", json=payload)
                    self.assertEqual(response.status_code, 400)
                    self.assertEqual(response.json()["error"]["code"], code)
        self.assertEqual(self.client.synthesis, [])

    def test_transcribes_uploaded_audio(self) -> None:
        with TestClient(self.app) as client:
            response = client.post(
                "/v1/audio/transcriptions",
                files={"file": ("speech.webm", b"audio-bytes", "audio/webm")},
                data={"model": "scribe_v2", "language": "EN"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"text": "Hello world"})
        self.assertEqual(
            self.client.transcriptions,
            [
                {
                    "audio": b"audio-bytes",
                    "filename": "speech.webm",
                    "content_type": "audio/webm",
                    "model": "scribe_v2",
                    "language": "en",
                }
            ],
        )

    def test_rejects_empty_or_oversized_audio(self) -> None:
        app = create_app(
            create_settings(max_audio_bytes=4),
            client=self.client,  # type: ignore[arg-type]
        )
        with TestClient(app) as client:
            empty = client.post(
                "/v1/audio/transcriptions",
                files={"file": ("speech.webm", b"", "audio/webm")},
            )
            oversized = client.post(
                "/v1/audio/transcriptions",
                files={"file": ("speech.webm", b"12345", "audio/webm")},
            )
            missing = client.post("/v1/audio/transcriptions")

        self.assertEqual(empty.status_code, 400)
        self.assertEqual(empty.json()["error"]["code"], "invalid_audio")
        self.assertEqual(oversized.status_code, 413)
        self.assertEqual(oversized.json()["error"]["code"], "request_too_large")
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(missing.json()["error"]["code"], "invalid_audio")

    def test_enforces_an_optional_local_access_token(self) -> None:
        app = create_app(
            create_settings(access_token="local-token"),
            client=self.client,  # type: ignore[arg-type]
        )
        with TestClient(app) as client:
            unauthorized = client.post("/v1/audio/speech", json={"input": "Hello."})
            authorized = client.post(
                "/v1/audio/speech",
                json={"input": "Hello."},
                headers={"Authorization": "Bearer local-token"},
            )
            wrong = client.post(
                "/v1/audio/speech",
                json={"input": "Hello."},
                headers={"Authorization": "Bearer wrong"},
            )

        self.assertEqual(unauthorized.status_code, 401)
        self.assertEqual(unauthorized.json()["error"]["code"], "unauthorized")
        self.assertEqual(authorized.status_code, 200)
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(len(self.client.synthesis), 1)

    def test_rejects_unknown_browser_origins(self) -> None:
        with TestClient(self.app) as client:
            rejected = client.get("/health", headers={"Origin": "https://evil.example"})
            allowed = client.get("/health", headers={"Origin": "http://localhost:5577"})

        self.assertEqual(rejected.status_code, 403)
        self.assertEqual(rejected.json()["error"]["code"], "origin_not_allowed")
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(
            allowed.headers["access-control-allow-origin"],
            "http://localhost:5577",
        )

    def test_returns_normalized_provider_errors(self) -> None:
        self.client.error = ElevenLabsServiceError(
            502,
            "elevenlabs_upstream_error",
            "ElevenLabs 返回 HTTP 500。",
        )
        with TestClient(self.app) as client:
            response = client.post("/v1/audio/speech", json={"input": "Hello."})

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json(),
            {
                "error": {
                    "code": "elevenlabs_upstream_error",
                    "message": "ElevenLabs 返回 HTTP 500。",
                }
            },
        )
        self.assertNotIn("test-key", response.text)


if __name__ == "__main__":
    unittest.main()
