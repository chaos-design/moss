from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from backend.services.fishaudio.config import FishAudioSettings


class FishAudioSettingsTest(unittest.TestCase):
    def test_reads_safe_defaults(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = FishAudioSettings.from_env()

        self.assertEqual(settings.host, "127.0.0.1")
        self.assertEqual(settings.port, 5584)
        self.assertEqual(settings.base_url, "https://api.fish.audio")
        self.assertEqual(settings.tts_model, "s2.1-pro-free")
        self.assertEqual(settings.asr_model, "transcribe-1-pro")
        self.assertEqual(settings.default_voice, "")
        self.assertEqual(settings.latency, "balanced")
        self.assertFalse(settings.configured)
        self.assertIn("http://localhost:5577", settings.allowed_origins)

    def test_reads_provider_configuration(self) -> None:
        with patch.dict(
            os.environ,
            {
                "FISH_API_KEY": " secret ",
                "MOSS_FISHAUDIO_ACCESS_TOKEN": "local-token",
                "MOSS_FISHAUDIO_TTS_MODEL": "s2.1-pro",
                "MOSS_FISHAUDIO_ASR_MODEL": "transcribe-1",
                "MOSS_FISHAUDIO_DEFAULT_VOICE": "9a9cf47702da476aa4629e2506d4a857",
                "MOSS_FISHAUDIO_LATENCY": "normal",
            },
            clear=True,
        ):
            settings = FishAudioSettings.from_env()

        self.assertTrue(settings.configured)
        self.assertEqual(settings.api_key, "secret")
        self.assertEqual(settings.access_token, "local-token")
        self.assertEqual(settings.tts_model, "s2.1-pro")
        self.assertEqual(settings.asr_model, "transcribe-1")
        self.assertEqual(settings.default_voice, "9a9cf47702da476aa4629e2506d4a857")
        self.assertEqual(settings.latency, "normal")

    def test_rejects_non_loopback_bind_address(self) -> None:
        with patch.dict(os.environ, {"MOSS_FISHAUDIO_HOST": "0.0.0.0"}, clear=True):
            with self.assertRaisesRegex(ValueError, "loopback"):
                FishAudioSettings.from_env()

    def test_rejects_insecure_remote_provider_url(self) -> None:
        with patch.dict(
            os.environ,
            {"MOSS_FISHAUDIO_BASE_URL": "http://api.fish.audio"},
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "HTTPS"):
                FishAudioSettings.from_env()

    def test_allows_loopback_provider_url_for_a_local_mock(self) -> None:
        with patch.dict(
            os.environ,
            {"MOSS_FISHAUDIO_BASE_URL": "http://127.0.0.1:5599/"},
            clear=True,
        ):
            settings = FishAudioSettings.from_env()

        self.assertEqual(settings.base_url, "http://127.0.0.1:5599")

    def test_rejects_provider_url_credentials(self) -> None:
        with patch.dict(
            os.environ,
            {"MOSS_FISHAUDIO_BASE_URL": "https://user:pass@api.fish.audio"},
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "credentials"):
                FishAudioSettings.from_env()


if __name__ == "__main__":
    unittest.main()
