from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from backend.services.asr.config import AsrSettings
from backend.services.asr.engine import (
    QwenRecognitionSession,
    SenseVoiceRecognitionEngine,
    filter_recognition_text,
)
from backend.services.asr.protocol import ProtocolError, StartCommand, decode_audio_chunk, parse_command


class ProtocolTest(unittest.TestCase):
    def test_decodes_little_endian_int16_pcm(self) -> None:
        encoded = np.array([-32768, 0, 16384, 32767], dtype="<i2").tobytes()
        decoded = decode_audio_chunk(encoded, "int16")

        np.testing.assert_allclose(decoded, [-1.0, 0.0, 0.5, 32767 / 32768])

    def test_decodes_and_clips_float32_pcm(self) -> None:
        encoded = np.array([-2.0, 0.25, 2.0], dtype="<f4").tobytes()
        decoded = decode_audio_chunk(encoded, "float32")

        np.testing.assert_allclose(decoded, [-1.0, 0.25, 1.0])

    def test_parses_start_command(self) -> None:
        command = parse_command(
            json.dumps(
                {
                    "type": "start",
                    "sampleRate": 48_000,
                    "format": "float32",
                    "token": "secret",
                    "context": "Vocabulary: latte.",
                    "engine": "sensevoice",
                }
            ),
            16_000,
        )

        self.assertEqual(
            command,
            StartCommand(
                sample_rate=48_000,
                audio_format="float32",
                token="secret",
                context="Vocabulary: latte.",
                engine="sensevoice",
                languages=("zh", "en"),
            ),
        )

    def test_rejects_languages_outside_chinese_and_english(self) -> None:
        with self.assertRaisesRegex(ProtocolError, "only contain zh and en"):
            parse_command('{"type":"start","languages":["ja"]}', 16_000)

    def test_filters_recognition_results_outside_chinese_and_english(self) -> None:
        self.assertEqual(filter_recognition_text("Hello 你好", "en"), "Hello 你好")
        self.assertEqual(filter_recognition_text("Hello 👋 你好 🎉", "en"), "Hello 你好")
        self.assertEqual(filter_recognition_text("bonjour", "fr"), "")
        self.assertEqual(filter_recognition_text("こんにちは", None), "")

    def test_keeps_qwen_mixed_language_transcripts(self) -> None:
        # Qwen3-ASR reports full language names and joins them for mixed audio,
        # e.g. "Chinese,English". The transcript must survive as long as any
        # detected language is allowed.
        self.assertEqual(
            filter_recognition_text("hello 你好", "Chinese,English"),
            "hello 你好",
        )
        self.assertEqual(filter_recognition_text("hello world", "English"), "hello world")
        self.assertEqual(filter_recognition_text("你好", "Chinese"), "你好")
        # A genuinely foreign language is still dropped by the language gate.
        self.assertEqual(filter_recognition_text("hello", "French"), "")

    def test_rejects_misaligned_pcm(self) -> None:
        with self.assertRaisesRegex(ProtocolError, "complete samples"):
            decode_audio_chunk(b"\x00", "int16")

    def test_rejects_unknown_control_message(self) -> None:
        with self.assertRaisesRegex(ProtocolError, "Supported message types"):
            parse_command('{"type":"unknown"}', 16_000)

    def test_qwen_session_uses_pre_roll_and_silence_to_finalize(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            settings = AsrSettings(
                host="127.0.0.1",
                port=5580,
                model_dir=Path(temporary),
                model_id="Qwen/Qwen3-ASR-1.7B",
                device="cpu",
                dtype="float32",
                sample_rate=16_000,
                max_connections=1,
                max_chunk_bytes=65_536,
                max_audio_seconds=30,
                max_new_tokens=256,
                speech_threshold=0.01,
                noise_calibration_seconds=0.2,
                noise_threshold_multiplier=2.2,
                min_speech_seconds=0.1,
                endpoint_silence_seconds=0.2,
                pre_roll_seconds=0.1,
                allowed_origins=("http://localhost:5577",),
                api_key=None,
            )
        calls: list[tuple[np.ndarray, int]] = []
        session = QwenRecognitionSession(
            settings,
            lambda audio, rate, _context: calls.append((audio, rate))
            or "Could I get 一杯咖啡?",
        )
        silence = np.zeros(1_600, dtype=np.float32)
        speech = np.full(1_600, 0.1, dtype=np.float32)

        self.assertFalse(session.accept_waveform(16_000, silence).is_final)
        self.assertFalse(session.accept_waveform(16_000, silence).is_final)
        self.assertFalse(session.accept_waveform(16_000, speech).is_final)
        self.assertFalse(session.accept_waveform(16_000, silence).is_final)
        result = session.accept_waveform(16_000, silence)

        self.assertTrue(result.is_final)
        self.assertEqual(result.text, "Could I get 一杯咖啡?")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1], 16_000)
        self.assertGreaterEqual(calls[0][0].size, 6_400)

    def test_qwen_session_ignores_calibrated_background_noise(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            settings = AsrSettings(
                host="127.0.0.1",
                port=5580,
                model_dir=Path(temporary),
                model_id="Qwen/Qwen3-ASR-1.7B",
                device="cpu",
                dtype="float32",
                sample_rate=16_000,
                max_connections=1,
                max_chunk_bytes=65_536,
                max_audio_seconds=30,
                max_new_tokens=256,
                speech_threshold=0.01,
                noise_calibration_seconds=0.3,
                noise_threshold_multiplier=2.2,
                min_speech_seconds=0.15,
                endpoint_silence_seconds=0.2,
                pre_roll_seconds=0.1,
                allowed_origins=("http://localhost:5577",),
                api_key=None,
            )
        calls: list[np.ndarray] = []
        session = QwenRecognitionSession(
            settings,
            lambda audio, _rate, _context: calls.append(audio) or "hallucinated",
        )
        phase = np.linspace(0, np.pi * 16, 1_600, dtype=np.float32)
        background_noise = np.sin(phase) * 0.02

        for _ in range(8):
            self.assertFalse(
                session.accept_waveform(16_000, background_noise).is_final
            )
        result = session.finish()

        self.assertTrue(result.is_final)
        self.assertEqual(result.text, "")
        self.assertEqual(calls, [])

    def test_sensevoice_engine_cleans_rich_transcription_tags(self) -> None:
        class FakeSenseVoice:
            def generate(self, **_kwargs: object) -> list[dict[str, str]]:
                return [{"text": "<|zh|><|NEUTRAL|><|Speech|>你好，Moss。"}]

        with tempfile.TemporaryDirectory() as temporary:
            model_dir = Path(temporary)
            (model_dir / "config.yaml").touch()
            (model_dir / "model.pt").touch()
            settings = AsrSettings(
                host="127.0.0.1",
                port=5580,
                model_dir=model_dir,
                model_id="Qwen/Qwen3-ASR-1.7B",
                device="cpu",
                dtype="float32",
                sample_rate=16_000,
                max_connections=1,
                max_chunk_bytes=65_536,
                max_audio_seconds=30,
                max_new_tokens=256,
                speech_threshold=0.01,
                noise_calibration_seconds=0,
                noise_threshold_multiplier=2.2,
                min_speech_seconds=0.1,
                endpoint_silence_seconds=0.2,
                pre_roll_seconds=0.1,
                allowed_origins=("http://localhost:5577",),
                api_key=None,
                sensevoice_model_dir=model_dir,
            )
            engine = SenseVoiceRecognitionEngine(
                settings,
                model_factory=lambda _settings: FakeSenseVoice(),
                postprocess=lambda text: text.split(">")[-1],
            )
            engine.load()

            text, language = engine._transcribe(
                np.full(1_600, 0.1, dtype=np.float32),
                16_000,
            )
            self.assertEqual(text, "你好，Moss。")
            self.assertEqual(language, "zh")

if __name__ == "__main__":
    unittest.main()
