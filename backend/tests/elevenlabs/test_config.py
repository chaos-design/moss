from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from backend.services.elevenlabs.config import ElevenLabsSettings


class ElevenLabsSettingsTest(unittest.TestCase):
    def test_reads_safe_defaults(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = ElevenLabsSettings.from_env()

        self.assertEqual(settings.host, "127.0.0.1")
        self.assertEqual(settings.port, 5583)
        self.assertEqual(settings.base_url, "https://api.elevenlabs.io")
        self.assertEqual(settings.tts_model, "eleven_v4")
        self.assertEqual(settings.asr_model, "scribe_v2")
        self.assertEqual(settings.default_voice, "JBFqnCBsd6RMkjVDRZzb")
        self.assertFalse(settings.configured)
        self.assertIn("http://localhost:5577", settings.allowed_origins)

    def test_reads_provider_configuration(self) -> None:
        with patch.dict(
            os.environ,
            {
                "ELEVENLABS_API_KEY": " secret ",
                "MOSS_ELEVENLABS_ACCESS_TOKEN": "local-token",
                "MOSS_ELEVENLABS_TTS_MODEL": "eleven_multilingual_v2",
                "MOSS_ELEVENLABS_ASR_MODEL": "scribe_v1",
                "MOSS_ELEVENLABS_DEFAULT_VOICE": "voice-id",
            },
            clear=True,
        ):
            settings = ElevenLabsSettings.from_env()

        self.assertTrue(settings.configured)
        self.assertEqual(settings.api_key, "secret")
        self.assertEqual(settings.access_token, "local-token")
        self.assertEqual(settings.tts_model, "eleven_multilingual_v2")
        self.assertEqual(settings.asr_model, "scribe_v1")
        self.assertEqual(settings.default_voice, "voice-id")

    def test_rejects_non_loopback_bind_address(self) -> None:
        with patch.dict(os.environ, {"MOSS_ELEVENLABS_HOST": "0.0.0.0"}, clear=True):
            with self.assertRaisesRegex(ValueError, "loopback"):
                ElevenLabsSettings.from_env()

    def test_rejects_insecure_remote_provider_url(self) -> None:
        with patch.dict(
            os.environ,
            {"MOSS_ELEVENLABS_BASE_URL": "http://api.elevenlabs.io"},
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "HTTPS"):
                ElevenLabsSettings.from_env()

    def test_allows_loopback_provider_url_for_a_local_mock(self) -> None:
        with patch.dict(
            os.environ,
            {"MOSS_ELEVENLABS_BASE_URL": "http://127.0.0.1:5599/"},
            clear=True,
        ):
            settings = ElevenLabsSettings.from_env()

        self.assertEqual(settings.base_url, "http://127.0.0.1:5599")

    def test_rejects_provider_url_credentials(self) -> None:
        with patch.dict(
            os.environ,
            {"MOSS_ELEVENLABS_BASE_URL": "https://user:pass@api.elevenlabs.io"},
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "credentials"):
                ElevenLabsSettings.from_env()


if __name__ == "__main__":
    unittest.main()
