from __future__ import annotations

import unittest
from typing import Any

from fastapi.testclient import TestClient

from backend.services.fishaudio.app import create_app
from backend.services.fishaudio.config import FishAudioSettings
from backend.services.fishaudio.errors import FishAudioServiceError


def create_settings(**overrides: object) -> FishAudioSettings:
    values = {
        "host": "127.0.0.1",
        "port": 5584,
        "allowed_origins": frozenset({"http://localhost:5577"}),
        "api_key": "test-key",
        "access_token": "",
        "base_url": "https://api.fish.audio",
        "tts_model": "s2.1-pro-free",
        "asr_model": "transcribe-1-pro",
        "default_voice": "",
        "latency": "balanced",
    }
    values.update(overrides)
    return FishAudioSettings(**values)  # type: ignore[arg-type]


class FakeClient:
    def __init__(self) -> None:
        self.synthesis: list[dict[str, Any]] = []
        self.transcriptions: list[dict[str, Any]] = []
        self.error: FishAudioServiceError | None = None
        self.audio = b"ID3\x04\x00\x00\x01\x02"

    def synthesize(self, **kwargs: Any) -> tuple[bytes, str]:
        if self.error:
            raise self.error
        self.synthesis.append(kwargs)
        return self.audio, "audio/mpeg"

    def transcribe(self, **kwargs: Any) -> str:
        if self.error:
            raise self.error
        self.transcriptions.append(kwargs)
        return "Could I get a latte?"


class HealthTest(unittest.TestCase):
    def test_reports_ready_when_a_key_is_configured(self) -> None:
        with TestClient(create_app(create_settings())) as http:
            response = http.get("/health")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ready"])
        self.assertEqual(body["service"], "moss-fishaudio")
        self.assertEqual(body["provider"], "fishaudio")
        self.assertEqual(body["models"]["tts"], "s2.1-pro-free")
        self.assertEqual(body["models"]["asr"], "transcribe-1-pro")
        self.assertEqual(body["latency"], "balanced")

    def test_reports_not_configured_without_a_key(self) -> None:
        with TestClient(create_app(create_settings(api_key=""))) as http:
            response = http.get("/health")

        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()["ready"])


class SpeechEndpointTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = FakeClient()
        self.app = create_app(create_settings(), self.client)

    def request(self, payload: dict[str, object], **kwargs: str):
        with TestClient(self.app) as http:
            return http.post("/v1/audio/speech", json=payload, **kwargs)

    def test_synthesizes_with_the_default_voice_and_model(self) -> None:
        response = self.request(
            {"input": "Could I get a coffee, please?", "speed": 1.0}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"].split(";")[0], "audio/mpeg")
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.content, self.client.audio)
        self.assertEqual(
            self.client.synthesis,
            [
                {
                    "text": "Could I get a coffee, please?",
                    "voice": "",
                    "model": "s2.1-pro-free",
                    "response_format": "mp3",
                    "speed": 1.0,
                }
            ],
        )

    def test_forwards_an_explicit_reference_id(self) -> None:
        response = self.request(
            {
                "input": "Hello.",
                "voice": "9a9cf47702da476aa4629e2506d4a857",
                "model": "s2.1-pro-free",
            }
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.client.synthesis[0]["voice"],
            "9a9cf47702da476aa4629e2506d4a857",
        )

    def test_falls_back_to_server_defaults_for_empty_model_and_voice(self) -> None:
        # 网关按契约省略空字段；显式空串也按同样的语义回退到服务端默认值
        # （空音色 = Fish Audio 内置默认音色，由客户端省略 reference_id）。
        response = self.request({"input": "Hello.", "model": "", "voice": ""})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.synthesis[0]["model"], "s2.1-pro-free")
        self.assertEqual(self.client.synthesis[0]["voice"], "")

    def test_rejects_an_unsupported_format_without_calling_the_provider(self) -> None:
        response = self.request(
            {"input": "Hello.", "response_format": "flac"}
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "unsupported_format")
        self.assertEqual(self.client.synthesis, [])

    def test_rejects_out_of_range_speed(self) -> None:
        response = self.request({"input": "Hello.", "speed": 5})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "invalid_speed")

    def test_rejects_oversized_text(self) -> None:
        response = self.request({"input": "a" * 2001})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "invalid_text")

    def test_requires_a_configured_api_key(self) -> None:
        self.app = create_app(create_settings(api_key=""), self.client)

        response = self.request({"input": "Hello."})

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "not_configured")

    def test_enforces_the_optional_local_access_token(self) -> None:
        self.app = create_app(create_settings(access_token="local-token"), self.client)

        denied = self.request({"input": "Hello."})
        allowed = self.request(
            {"input": "Hello."}, headers={"Authorization": "Bearer local-token"}
        )

        self.assertEqual(denied.status_code, 401)
        self.assertEqual(denied.json()["error"]["code"], "unauthorized")
        self.assertEqual(allowed.status_code, 200)

    def test_normalizes_upstream_failures(self) -> None:
        self.client.error = FishAudioServiceError(
            429, "fishaudio_rate_limited", "配额不足"
        )

        response = self.request({"input": "Hello."})

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["error"]["code"], "fishaudio_rate_limited")

    def test_rejects_invalid_json(self) -> None:
        with TestClient(self.app) as http:
            response = http.post(
                "/v1/audio/speech",
                content=b"not-json",
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "invalid_json")


class TranscriptionEndpointTest(unittest.TestCase):
    def test_transcribes_an_uploaded_clip(self) -> None:
        client = FakeClient()
        app = create_app(create_settings(), client)

        with TestClient(app) as http:
            response = http.post(
                "/v1/audio/transcriptions",
                files={"file": ("speech.webm", b"webm-bytes", "audio/webm")},
                data={"language": "en"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"text": "Could I get a latte?"})
        self.assertEqual(client.transcriptions[0]["language"], "en")
        self.assertEqual(client.transcriptions[0]["model"], "transcribe-1-pro")

    def test_rejects_a_clip_over_the_size_limit(self) -> None:
        client = FakeClient()
        app = create_app(
            create_settings(max_audio_bytes=1_000), client
        )

        with TestClient(app) as http:
            response = http.post(
                "/v1/audio/transcriptions",
                files={"file": ("speech.webm", b"x" * 1_500, "audio/webm")},
            )

        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["error"]["code"], "request_too_large")


if __name__ == "__main__":
    unittest.main()
