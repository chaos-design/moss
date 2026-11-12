from __future__ import annotations

import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.services.elevenlabs import rules
from backend.services.elevenlabs.config import ElevenLabsSettings

RULES_FILE = Path(__file__).resolve().parents[3] / "frontend" / "src" / "lib" / "speech-rules.json"


class SpeechRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.shared = json.loads(RULES_FILE.read_text(encoding="utf-8"))

    def test_format_mappings_match_the_shared_rules(self) -> None:
        expected = {
            name: (value["outputFormat"], value["contentType"])
            for name, value in self.shared["formats"]["adapterSupported"].items()
        }
        self.assertEqual(rules.SUPPORTED_RESPONSE_FORMATS, expected)
        self.assertEqual(rules.DEFAULT_RESPONSE_FORMAT, self.shared["formats"]["default"])

    def test_voice_aliases_and_speed_ranges_match(self) -> None:
        self.assertEqual(rules.VOICE_ALIASES, self.shared["voice"]["aliases"])
        speed = self.shared["speed"]
        self.assertEqual(rules.MIN_SPEECH_SPEED, speed["min"])
        self.assertEqual(rules.MAX_SPEECH_SPEED, speed["max"])
        self.assertEqual(rules.DEFAULT_SPEECH_SPEED, speed["default"])
        self.assertEqual(rules.MIN_VOICE_SPEED, speed["providerMin"])
        self.assertEqual(rules.MAX_VOICE_SPEED, speed["providerMax"])

    def test_test_synthesis_defaults_match(self) -> None:
        defaults = self.shared["testSynthesis"]
        self.assertEqual(rules.TEST_SYNTHESIS_TEXT, defaults["text"])
        self.assertEqual(rules.TEST_SYNTHESIS_VOICE, defaults["voice"])
        self.assertEqual(rules.TEST_SYNTHESIS_FORMAT, defaults["format"])
        self.assertEqual(rules.TEST_SYNTHESIS_SPEED, defaults["speed"])
        self.assertEqual(rules.TEST_SYNTHESIS_MIN_AUDIO_BYTES, defaults["minimumAudioBytes"])

    def test_local_models_match(self) -> None:
        local = self.shared["models"]["localApi"]
        with patch.dict(os.environ, {}, clear=True):
            settings = ElevenLabsSettings.from_env()
        self.assertEqual(settings.tts_model, local["tts"])
        self.assertEqual(settings.asr_model, local["asr"])
        self.assertEqual(settings.default_voice, self.shared["voice"]["default"])
        self.assertEqual(settings.port, self.shared["services"]["localApi"]["port"])
        self.assertEqual(
            settings.max_text_length, self.shared["limits"]["maxTtsTextLength"]
        )
        self.assertEqual(
            settings.request_timeout_seconds,
            self.shared["limits"]["adapterTimeoutSeconds"],
        )

    def test_default_response_format_is_configurable(self) -> None:
        with patch.dict(
            os.environ,
            {"MOSS_ELEVENLABS_DEFAULT_RESPONSE_FORMAT": " WAV "},
            clear=True,
        ):
            self.assertEqual(ElevenLabsSettings.from_env().default_response_format, "wav")

    def test_rejects_an_unsupported_default_response_format(self) -> None:
        with patch.dict(
            os.environ,
            {"MOSS_ELEVENLABS_DEFAULT_RESPONSE_FORMAT": "flac"},
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "DEFAULT_RESPONSE_FORMAT"):
                ElevenLabsSettings.from_env()


if __name__ == "__main__":
    unittest.main()
