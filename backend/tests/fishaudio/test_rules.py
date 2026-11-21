from __future__ import annotations

import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.services.fishaudio import rules
from backend.services.fishaudio.config import FishAudioSettings

RULES_FILE = Path(__file__).resolve().parents[3] / "frontend" / "src" / "lib" / "speech-rules.json"


class SpeechRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.shared = json.loads(RULES_FILE.read_text(encoding="utf-8"))
        cls.provider = cls.shared["fishAudio"]

    def test_format_mappings_match_the_shared_rules(self) -> None:
        expected = {
            name: (value["outputFormat"], value["contentType"])
            for name, value in self.shared["formats"]["fishAudioSupported"].items()
        }
        self.assertEqual(rules.SUPPORTED_RESPONSE_FORMATS, expected)
        self.assertEqual(rules.DEFAULT_RESPONSE_FORMAT, self.shared["formats"]["default"])

    def test_voice_aliases_map_openai_names_to_the_builtin_default_voice(self) -> None:
        self.assertEqual(rules.VOICE_ALIASES, self.provider["voiceAliases"])
        # 空串表示省略 reference_id、使用 Fish Audio 内置默认音色。
        self.assertTrue(all(value == "" for value in rules.VOICE_ALIASES.values()))
        self.assertEqual(rules.DEFAULT_VOICE, self.provider["defaultVoice"])
        self.assertEqual(rules.TTS_LATENCY, self.provider["latency"])

    def test_speed_ranges_match(self) -> None:
        speed = self.shared["speed"]
        self.assertEqual(rules.MIN_SPEECH_SPEED, speed["min"])
        self.assertEqual(rules.MAX_SPEECH_SPEED, speed["max"])
        self.assertEqual(rules.DEFAULT_SPEECH_SPEED, speed["default"])
        # Fish Audio 的 prosody.speed 上游范围与对外范围一致，无需收敛。
        self.assertEqual(rules.MIN_SPEECH_SPEED, self.provider["speed"]["min"])
        self.assertEqual(rules.MAX_SPEECH_SPEED, self.provider["speed"]["max"])

    def test_test_synthesis_defaults_match(self) -> None:
        defaults = self.shared["testSynthesis"]
        self.assertEqual(rules.TEST_SYNTHESIS_TEXT, defaults["text"])
        # Fish Audio 没有 OpenAI 别名的真实模型，测试合成的音色默认走内置默认音色。
        self.assertEqual(rules.TEST_SYNTHESIS_VOICE, rules.DEFAULT_VOICE)
        self.assertEqual(rules.TEST_SYNTHESIS_FORMAT, defaults["format"])
        self.assertEqual(rules.TEST_SYNTHESIS_SPEED, defaults["speed"])
        self.assertEqual(rules.TEST_SYNTHESIS_MIN_AUDIO_BYTES, defaults["minimumAudioBytes"])

    def test_local_models_match(self) -> None:
        local = self.shared["models"]["fishAudio"]
        with patch.dict(os.environ, {}, clear=True):
            settings = FishAudioSettings.from_env()
        self.assertEqual(settings.tts_model, local["tts"])
        self.assertEqual(settings.asr_model, local["asr"])
        self.assertEqual(settings.port, self.shared["services"]["fishAudio"]["port"])
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
            {"MOSS_FISHAUDIO_DEFAULT_RESPONSE_FORMAT": " WAV "},
            clear=True,
        ):
            self.assertEqual(FishAudioSettings.from_env().default_response_format, "wav")

    def test_rejects_an_unsupported_default_response_format(self) -> None:
        with patch.dict(
            os.environ,
            {"MOSS_FISHAUDIO_DEFAULT_RESPONSE_FORMAT": "flac"},
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "DEFAULT_RESPONSE_FORMAT"):
                FishAudioSettings.from_env()

    def test_latency_is_configurable(self) -> None:
        with patch.dict(os.environ, {"MOSS_FISHAUDIO_LATENCY": " LOW "}, clear=True):
            self.assertEqual(FishAudioSettings.from_env().latency, "low")
        with patch.dict(os.environ, {"MOSS_FISHAUDIO_LATENCY": "instant"}, clear=True):
            with self.assertRaisesRegex(ValueError, "LATENCY"):
                FishAudioSettings.from_env()


if __name__ == "__main__":
    unittest.main()
