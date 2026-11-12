from __future__ import annotations

import unittest
from typing import Any

from fastapi.testclient import TestClient

from backend.services.fishaudio import rules
from backend.services.fishaudio.app import create_app
from backend.services.fishaudio.config import FishAudioSettings
from backend.services.fishaudio.errors import FishAudioServiceError

AUDIO = b"ID3\x04\x00\x00\x01\x02"


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
    def __init__(self, audio: bytes = AUDIO) -> None:
        self.synthesis: list[dict[str, Any]] = []
        self.error: FishAudioServiceError | None = None
        self.audio = audio

    def synthesize(self, **kwargs: Any) -> tuple[bytes, str]:
        if self.error:
            raise self.error
        self.synthesis.append(kwargs)
        return self.audio, "audio/mpeg"


class SynthesisProbeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = FakeClient()
        self.app = create_app(create_settings(), self.client)

    def probe(self, payload: dict[str, object] | None = None, **kwargs: str):
        with TestClient(self.app) as http:
            if payload is None:
                return http.post("/v1/audio/speech/test", **kwargs)
            return http.post("/v1/audio/speech/test", json=payload, **kwargs)

    def test_runs_one_synthesis_with_shared_defaults_and_returns_diagnostics_only(self) -> None:
        response = self.probe()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"].split(";")[0], "application/json")
        self.assertEqual(response.headers["cache-control"], "no-store")
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["service"], "moss-fishaudio")
        self.assertEqual(body["model"], "s2.1-pro-free")
        # Fish Audio 没有默认 reference_id：空音色在诊断里明确标注为内置默认音色。
        self.assertEqual(body["voice"], "(fish-audio 默认音色)")
        self.assertEqual(body["format"], rules.DEFAULT_RESPONSE_FORMAT)
        self.assertEqual(body["contentType"], "audio/mpeg")
        self.assertEqual(body["bytes"], len(AUDIO))
        self.assertEqual(body["checks"], {"audioContentType": True, "minimumBytes": True})
        self.assertGreaterEqual(body["elapsedMs"], 0)
        # No audio bytes are echoed back.
        self.assertNotIn("audio", body)
        self.assertEqual(
            self.client.synthesis,
            [
                {
                    "text": rules.TEST_SYNTHESIS_TEXT,
                    "voice": "",
                    "model": "s2.1-pro-free",
                    "response_format": rules.DEFAULT_RESPONSE_FORMAT,
                    "speed": rules.TEST_SYNTHESIS_SPEED,
                }
            ],
        )

    def test_accepts_explicit_overrides(self) -> None:
        response = self.probe(
            {
                "text": "Could I get a coffee?",
                "voice": "9a9cf47702da476aa4629e2506d4a857",
                "model": "s2.1-pro",
                "response_format": "wav",
                "speed": 1.5,
            }
        )

        self.assertTrue(response.json()["ok"])
        self.assertEqual(response.json()["format"], "wav")
        self.assertEqual(
            self.client.synthesis[0],
            {
                "text": "Could I get a coffee?",
                "voice": "9a9cf47702da476aa4629e2506d4a857",
                "model": "s2.1-pro",
                "response_format": "wav",
                "speed": 1.5,
            },
        )

    def test_passes_an_openai_alias_through_for_the_client_to_map(self) -> None:
        response = self.probe({"voice": "alloy"})

        self.assertTrue(response.json()["ok"])
        # 音色名按原样转发；alloy -> 内置默认音色的映射发生在真实客户端里，
        # 已由 test_client.py 覆盖。
        self.assertEqual(self.client.synthesis[0]["voice"], "alloy")

    def test_flags_a_truncated_audio_payload(self) -> None:
        self.client = FakeClient(audio=b"ID3")
        self.app = create_app(create_settings(), self.client)

        body = self.probe().json()

        self.assertFalse(body["ok"])
        self.assertFalse(body["checks"]["minimumBytes"])
        self.assertEqual(body["bytes"], 3)

    def test_rejects_an_unsupported_format(self) -> None:
        response = self.probe({"response_format": "flac"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "unsupported_format")
        self.assertEqual(self.client.synthesis, [])

    def test_requires_a_configured_api_key(self) -> None:
        self.app = create_app(create_settings(api_key=""), self.client)

        response = self.probe()

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "not_configured")

    def test_enforces_the_optional_local_access_token(self) -> None:
        self.app = create_app(create_settings(access_token="local-token"), self.client)

        denied = self.probe()
        allowed = self.probe(headers={"Authorization": "Bearer local-token"})

        self.assertEqual(denied.status_code, 401)
        self.assertEqual(denied.json()["error"]["code"], "unauthorized")
        self.assertTrue(allowed.json()["ok"])

    def test_normalizes_upstream_failures(self) -> None:
        self.client.error = FishAudioServiceError(429, "fishaudio_rate_limited", "配额不足")

        response = self.probe()

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["error"]["code"], "fishaudio_rate_limited")

    def test_rejects_invalid_json(self) -> None:
        with TestClient(self.app) as http:
            response = http.post(
                "/v1/audio/speech/test",
                content=b"not-json",
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "invalid_json")


if __name__ == "__main__":
    unittest.main()
