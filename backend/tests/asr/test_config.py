from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.services.asr.config import (
    DEFAULT_MODEL_DIR,
    DEFAULT_MODEL_ID,
    DEFAULT_SENSEVOICE_MODEL_DIR,
    AsrSettings,
)


class AsrSettingsTest(unittest.TestCase):
    def test_reads_valid_environment(self) -> None:
        with patch.dict(
            os.environ,
            {
                "MOSS_ASR_PORT": "6006",
                "MOSS_ASR_ALLOWED_ORIGINS": "https://moss.example, http://localhost:5577",
                "MOSS_ASR_DEVICE": "cpu",
                "MOSS_ASR_ENGINE": "sensevoice",
            },
            clear=False,
        ):
            settings = AsrSettings.from_env()

        self.assertEqual(settings.port, 6006)
        self.assertEqual(settings.device, "cpu")
        self.assertEqual(settings.model_id, DEFAULT_MODEL_ID)
        self.assertEqual(settings.model_dir, DEFAULT_MODEL_DIR)
        self.assertEqual(settings.engine, "sensevoice")
        self.assertEqual(settings.sensevoice_model_dir, DEFAULT_SENSEVOICE_MODEL_DIR)
        self.assertEqual(settings.speech_threshold, 0.018)
        self.assertEqual(settings.endpoint_silence_seconds, 0.85)
        self.assertEqual(settings.noise_calibration_seconds, 0.5)
        self.assertEqual(settings.noise_threshold_multiplier, 3.0)
        self.assertEqual(settings.min_speech_seconds, 0.35)
        self.assertEqual(
            settings.allowed_origins,
            ("https://moss.example", "http://localhost:5577"),
        )

    def test_validates_qwen_model_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            model_dir = Path(temporary)
            (model_dir / "config.json").touch()
            (model_dir / "model-00001-of-00002.safetensors").touch()

            with patch.dict(
                os.environ,
                {
                    "MOSS_ASR_MODEL_DIR": str(model_dir),
                },
                clear=False,
            ):
                settings = AsrSettings.from_env()

            self.assertEqual(settings.validate_model_files(), model_dir)

    def test_rejects_incomplete_sharded_qwen_weights(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            model_dir = Path(temporary)
            (model_dir / "config.json").touch()
            (model_dir / "model-00002-of-00002.safetensors").touch()
            (model_dir / "model.safetensors.index.json").write_text(
                json.dumps(
                    {
                        "weight_map": {
                            "encoder": "model-00001-of-00002.safetensors",
                            "decoder": "model-00002-of-00002.safetensors",
                        }
                    }
                ),
                encoding="utf-8",
            )

            with patch.dict(
                os.environ,
                {
                    "MOSS_ASR_MODEL_DIR": str(model_dir),
                },
                clear=False,
            ):
                settings = AsrSettings.from_env()

            with self.assertRaisesRegex(
                FileNotFoundError,
                "model-00001-of-00002.safetensors",
            ):
                settings.validate_model_files()

    def test_rejects_invalid_port(self) -> None:
        with patch.dict(os.environ, {"MOSS_ASR_PORT": "70000"}, clear=False):
            with self.assertRaisesRegex(ValueError, "MOSS_ASR_PORT"):
                AsrSettings.from_env()

    def test_rejects_invalid_engine(self) -> None:
        with patch.dict(os.environ, {"MOSS_ASR_ENGINE": "whisper"}, clear=False):
            with self.assertRaisesRegex(ValueError, "MOSS_ASR_ENGINE"):
                AsrSettings.from_env()

    def test_defaults_to_no_preload_engines(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("MOSS_ASR_PRELOAD_ENGINES", None)
            settings = AsrSettings.from_env()
        self.assertEqual(settings.preload_engines, ())

    def test_parses_and_deduplicates_preload_engines(self) -> None:
        with patch.dict(
            os.environ,
            {"MOSS_ASR_PRELOAD_ENGINES": "qwen3-asr, sensevoice ,qwen3-asr"},
            clear=False,
        ):
            settings = AsrSettings.from_env()
        self.assertEqual(settings.preload_engines, ("qwen3-asr", "sensevoice"))

    def test_rejects_unsupported_preload_engine(self) -> None:
        with patch.dict(
            os.environ,
            {"MOSS_ASR_PRELOAD_ENGINES": "whisper"},
            clear=False,
        ):
            with self.assertRaisesRegex(ValueError, "MOSS_ASR_PRELOAD_ENGINES"):
                AsrSettings.from_env()


if __name__ == "__main__":
    unittest.main()
