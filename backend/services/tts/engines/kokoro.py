from __future__ import annotations

import io
import threading
import wave
from pathlib import Path
from typing import Any, Callable, Optional

from ..errors import TtsServiceError

KOKORO_ENGLISH_VOICES = frozenset(
    {
        "af_alloy",
        "af_aoede",
        "af_bella",
        "af_heart",
        "af_jessica",
        "af_kore",
        "af_nicole",
        "af_nova",
        "af_river",
        "af_sarah",
        "af_sky",
        "am_adam",
        "am_echo",
        "am_eric",
        "am_fenrir",
        "am_liam",
        "am_michael",
        "am_onyx",
        "am_puck",
        "am_santa",
        "bf_alice",
        "bf_emma",
        "bf_isabella",
        "bf_lily",
        "bm_daniel",
        "bm_fable",
        "bm_george",
        "bm_lewis",
    }
)
KOKORO_CHINESE_VOICES = frozenset(
    {
        "zf_001", "zf_002", "zf_003", "zf_004", "zf_005", "zf_006", "zf_007",
        "zf_008", "zf_017", "zf_018", "zf_019", "zf_021", "zf_022", "zf_023",
        "zf_024", "zf_026", "zf_027", "zf_028", "zf_032", "zf_036", "zf_038",
        "zf_039", "zf_040", "zf_042", "zf_043", "zf_044", "zf_046", "zf_047",
        "zf_048", "zf_049", "zf_051", "zf_059", "zf_060", "zf_067", "zf_070",
        "zf_071", "zf_072", "zf_073", "zf_074", "zf_075", "zf_076", "zf_077",
        "zf_078", "zf_079", "zf_083", "zf_084", "zf_085", "zf_086", "zf_087",
        "zf_088", "zf_090", "zf_092", "zf_093", "zf_094", "zf_099", "zm_009",
        "zm_010", "zm_011", "zm_012", "zm_013", "zm_014", "zm_015", "zm_016",
        "zm_020", "zm_025", "zm_029", "zm_030", "zm_031", "zm_033", "zm_034",
        "zm_035", "zm_037", "zm_041", "zm_045", "zm_050", "zm_052", "zm_053",
        "zm_054", "zm_055", "zm_056", "zm_057", "zm_058", "zm_061", "zm_062",
        "zm_063", "zm_064", "zm_065", "zm_066", "zm_068", "zm_069", "zm_080",
        "zm_081", "zm_082", "zm_089", "zm_091", "zm_095", "zm_096", "zm_097",
        "zm_098", "zm_100",
    }
)
KOKORO_VOICES = KOKORO_ENGLISH_VOICES | KOKORO_CHINESE_VOICES


def _load_kokoro(
    model_path: Path,
    voices_path: Path,
    vocab_config_path: Path | None = None,
) -> Any:
    from kokoro_onnx import Kokoro

    return Kokoro(
        str(model_path),
        str(voices_path),
        vocab_config=str(vocab_config_path) if vocab_config_path else None,
    )


def _create_chinese_phonemizer() -> Any:
    from misaki import zh

    return zh.ZHG2P(version="1.1")


def _wav_bytes(samples: Any, sample_rate: int) -> bytes:
    import numpy as np

    pcm = np.clip(np.asarray(samples), -1.0, 1.0)
    pcm = (pcm * 32_767).astype("<i2", copy=False)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return output.getvalue()


class KokoroEngine:
    id = "kokoro"

    def __init__(
        self,
        model_path: Path,
        voices_path: Path,
        zh_model_path: Path | None = None,
        zh_voices_path: Path | None = None,
        zh_config_path: Path | None = None,
        model_factory: Callable[[Path, Path, Path | None], Any] = _load_kokoro,
        phonemizer_factory: Callable[[], Any] = _create_chinese_phonemizer,
    ) -> None:
        self.model_path = model_path
        self.voices_path = voices_path
        self.zh_model_path = zh_model_path or model_path
        self.zh_voices_path = zh_voices_path or voices_path
        self.zh_config_path = zh_config_path
        self.model_factory = model_factory
        self.phonemizer_factory = phonemizer_factory
        self._english_model: Optional[Any] = None
        self._chinese_model: Optional[Any] = None
        self._chinese_phonemizer: Optional[Any] = None
        self._load_lock = threading.Lock()
        self._synthesis_lock = threading.Lock()

    def health(self) -> dict[str, Any]:
        english_missing = [
            str(path)
            for path in (self.model_path, self.voices_path)
            if not path.is_file()
        ]
        chinese_paths = [self.zh_model_path, self.zh_voices_path]
        if self.zh_config_path:
            chinese_paths.append(self.zh_config_path)
        chinese_missing = [str(path) for path in chinese_paths if not path.is_file()]
        return {
            "device": "cpu",
            "loaded": self._english_model is not None,
            "chineseLoaded": self._chinese_model is not None,
            "model": self.model_path.name,
            "chineseModel": self.zh_model_path.name,
            "ready": not english_missing,
            "chineseReady": not chinese_missing,
            "missing": english_missing,
            "chineseMissing": chinese_missing,
        }

    def prepare(self) -> None:
        self._get_english_model()

    def synthesize(self, request: dict[str, Any]) -> bytes:
        voice = request.get("voice") or "af_bella"
        if voice not in KOKORO_VOICES:
            raise TtsServiceError(400, "invalid_voice", f"不支持的 Kokoro 音色：{voice}")
        try:
            with self._synthesis_lock:
                if voice in KOKORO_CHINESE_VOICES:
                    phonemes, _ = self._get_chinese_phonemizer()(request["text"])
                    samples, sample_rate = self._get_chinese_model().create(
                        phonemes,
                        voice=voice,
                        speed=request["speed"],
                        is_phonemes=True,
                    )
                else:
                    language = "en-gb" if voice.startswith("b") else "en-us"
                    samples, sample_rate = self._get_english_model().create(
                        request["text"],
                        voice=voice,
                        speed=request["speed"],
                        lang=language,
                    )
            return _wav_bytes(samples, sample_rate)
        except TtsServiceError:
            raise
        except Exception as error:
            raise TtsServiceError(
                503,
                "kokoro_failed",
                f"Kokoro 合成失败：{error}",
            ) from error

    def _get_english_model(self) -> Any:
        if self._english_model is not None:
            return self._english_model
        missing = self.health()["missing"]
        if missing:
            raise TtsServiceError(
                503,
                "kokoro_unavailable",
                "Kokoro 模型尚未安装，请先运行 pnpm tts:setup",
            )
        with self._load_lock:
            if self._english_model is None:
                try:
                    self._english_model = self.model_factory(
                        self.model_path,
                        self.voices_path,
                        None,
                    )
                except Exception as error:
                    raise TtsServiceError(
                        503,
                        "kokoro_unavailable",
                        f"Kokoro 模型加载失败：{error}",
                    ) from error
        return self._english_model

    def _get_chinese_model(self) -> Any:
        if self._chinese_model is not None:
            return self._chinese_model
        missing = self.health()["chineseMissing"]
        if missing:
            raise TtsServiceError(
                503,
                "kokoro_chinese_unavailable",
                "Kokoro 中文模型尚未安装，请先运行 pnpm tts:setup",
            )
        with self._load_lock:
            if self._chinese_model is None:
                try:
                    self._chinese_model = self.model_factory(
                        self.zh_model_path,
                        self.zh_voices_path,
                        self.zh_config_path,
                    )
                except Exception as error:
                    raise TtsServiceError(
                        503,
                        "kokoro_chinese_unavailable",
                        f"Kokoro 中文模型加载失败：{error}",
                    ) from error
        return self._chinese_model

    def _get_chinese_phonemizer(self) -> Any:
        if self._chinese_phonemizer is not None:
            return self._chinese_phonemizer
        with self._load_lock:
            if self._chinese_phonemizer is None:
                try:
                    self._chinese_phonemizer = self.phonemizer_factory()
                except Exception as error:
                    raise TtsServiceError(
                        503,
                        "kokoro_chinese_unavailable",
                        f"Kokoro 中文分词器加载失败：{error}",
                    ) from error
        return self._chinese_phonemizer
