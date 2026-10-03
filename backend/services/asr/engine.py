from __future__ import annotations

import logging
import os
import platform
import re
import sys
from collections import deque
from dataclasses import dataclass
from typing import Any, Callable, Protocol

import numpy as np

from .config import AsrSettings

logger = logging.getLogger("moss.asr")


def is_apple_silicon() -> bool:
    """Return True only on Apple Silicon (arm64) macOS hardware."""
    return sys.platform == "darwin" and platform.machine() == "arm64"


def resolve_asr_device(
    device_setting: str,
    *,
    cuda_available: bool,
    mps_available: bool,
    apple_silicon: bool,
) -> str:
    """Pick the torch device for Qwen3-ASR from the configured setting.

    An explicit setting always wins. For ``auto`` we prefer CUDA, then Metal
    (MPS). Metal is only selected on Apple Silicon: Intel Macs report MPS as
    available too, but the transformers caching allocator warmup tries a single
    multi-gigabyte ``torch.empty`` on the Metal device, which exceeds the Intel
    GPU's max buffer size and fails with ``Invalid buffer size``. CPU is the
    safe fallback there.
    """
    if device_setting != "auto":
        return device_setting
    if cuda_available:
        return "cuda:0"
    if mps_available and apple_silicon:
        return "mps"
    return "cpu"


def resolve_asr_dtype(dtype_setting: str, device: str) -> str:
    """Pick the torch dtype name for Qwen3-ASR from the configured setting.

    For ``auto`` we use ``float16`` on Metal (MPS) and ``bfloat16`` everywhere
    else, including CPU. ``float32`` roughly doubles CPU memory: a single
    real-speech inference peaks near 8 GB versus ~4.5 GB for ``bfloat16``, which
    OOM-kills the service on a 16 GB machine shared with the web and TTS dev
    processes, so ``auto`` never selects it.

    An explicit setting wins, with one guard: ``float16`` on CPU raises a clear
    error because PyTorch has no half-precision CPU ``LayerNorm`` kernel, so that
    combination would otherwise crash mid-inference rather than at load.
    """
    if dtype_setting == "auto":
        return "float16" if device == "mps" else "bfloat16"
    if dtype_setting == "float16" and device == "cpu":
        raise ValueError(
            "MOSS_ASR_DTYPE=float16 is not supported on CPU (PyTorch has no "
            "half-precision CPU LayerNorm kernel). Use bfloat16 or float32."
        )
    return dtype_setting


_LANGUAGE_ALIASES = {
    "chinese": "zh",
    "english": "en",
    "mandarin": "zh",
    "zh-cn": "zh",
    "zh-tw": "zh",
}
_UNSUPPORTED_SCRIPT_PATTERN = re.compile(
    r"[\u0370-\u03ff\u0400-\u052f\u0590-\u08ff\u0900-\u0dff"
    r"\u0e00-\u0eff\u1100-\u11ff\u3040-\u30ff\uac00-\ud7af]"
)
_EMOJI_PATTERN = re.compile(
    r"[\u2600-\u27bf\U0001f000-\U0001faff\ufe0f\u20e3]"
)
_SENSEVOICE_LANGUAGE_PATTERN = re.compile(r"^<\|([^|]+)\|>")


@dataclass(frozen=True)
class RecognitionResult:
    text: str
    tokens: list[str]
    timestamps: list[float]
    is_final: bool
    language: str | None = None


class RecognitionSession(Protocol):
    def accept_waveform(self, sample_rate: int, samples: np.ndarray) -> RecognitionResult:
        ...

    def finish(self) -> RecognitionResult:
        ...

    def reset(self) -> None:
        ...


class RecognitionEngine(Protocol):
    engine_id: str
    model_name: str

    def load(self) -> None:
        ...

    def create_session(
        self,
        context: str = "",
        languages: tuple[str, ...] = ("zh", "en"),
    ) -> RecognitionSession:
        ...


def _empty_result() -> RecognitionResult:
    return RecognitionResult(text="", tokens=[], timestamps=[], is_final=False)


def normalize_language_code(language: str | None) -> str | None:
    """Collapse one language label to a short code, e.g. ``English`` -> ``en``.

    Qwen3-ASR reports full language names and, for multi-language audio, a
    comma-joined string such as ``"Chinese,English"``. Only the first component
    is kept here so the emitted ``language`` field stays a single short code; use
    :func:`normalize_language_codes` to inspect every detected language.
    """
    if not language:
        return None
    primary = language.split(",", 1)[0].strip().lower().replace("_", "-")
    if not primary:
        return None
    return _LANGUAGE_ALIASES.get(primary, primary.split("-", 1)[0])


def normalize_language_codes(language: str | None) -> list[str]:
    """Normalize every comma-separated component to a short language code."""
    if not language:
        return []
    codes: list[str] = []
    for component in language.split(","):
        code = normalize_language_code(component)
        if code:
            codes.append(code)
    return codes


def filter_recognition_text(
    text: str,
    language: str | None,
    allowed_languages: tuple[str, ...] = ("zh", "en"),
) -> str:
    detected = normalize_language_codes(language)
    allowed = {normalize_language_code(item) for item in allowed_languages}
    # Qwen3-ASR tags mixed Chinese/English speech as "Chinese,English". Keep the
    # transcript when any detected language is supported and let the script
    # filter below drop genuinely foreign output.
    if detected and not any(code in allowed for code in detected):
        return ""
    if _UNSUPPORTED_SCRIPT_PATTERN.search(text):
        return ""
    return re.sub(r"[ \t]{2,}", " ", _EMOJI_PATTERN.sub("", text)).strip()


class QwenRecognitionSession:
    def __init__(
        self,
        settings: AsrSettings,
        transcribe: Callable[
            [np.ndarray, int, str],
            str | tuple[str, str | None],
        ],
        context: str = "",
        languages: tuple[str, ...] = ("zh", "en"),
    ) -> None:
        self._settings = settings
        self._transcribe = transcribe
        self._context = context
        self._languages = languages
        self.reset()

    def accept_waveform(self, sample_rate: int, samples: np.ndarray) -> RecognitionResult:
        audio = np.asarray(samples, dtype=np.float32).reshape(-1)
        if audio.size == 0:
            return _empty_result()

        rms = float(np.sqrt(np.mean(np.square(audio, dtype=np.float64))))
        if (
            not self._speech_started
            and self._calibration_samples
            < sample_rate * self._settings.noise_calibration_seconds
        ):
            self._update_noise_floor(rms, 1.5, 0.35)
            self._calibration_samples += audio.size
            self._append_pre_roll(audio, sample_rate)
            return _empty_result()

        threshold = max(
            self._settings.speech_threshold,
            self._noise_floor * self._settings.noise_threshold_multiplier,
        )
        voiced = rms >= threshold
        promoted_candidate = False
        if not self._speech_started:
            if not voiced:
                self._update_noise_floor(rms, 1.25, 0.08)
                self._candidate_chunks.clear()
                self._candidate_samples = 0
                self._append_pre_roll(audio, sample_rate)
                return _empty_result()
            self._candidate_chunks.append(audio.copy())
            self._candidate_samples += audio.size
            if (
                self._candidate_samples
                < sample_rate * self._settings.min_speech_seconds
            ):
                return _empty_result()
            self._speech_started = True
            self._chunks.extend(self._pre_roll)
            self._pre_roll.clear()
            self._chunks.extend(self._candidate_chunks)
            self._voiced_samples = self._candidate_samples
            promoted_candidate = True
            self._candidate_chunks.clear()
            self._candidate_samples = 0
        else:
            self._chunks.append(audio.copy())
        self._last_sample_rate = sample_rate
        if voiced:
            if not promoted_candidate:
                self._voiced_samples += audio.size
            self._trailing_silence_samples = 0
        else:
            self._update_noise_floor(rms, 1.25, 0.02)
            self._trailing_silence_samples += audio.size

        enough_speech = self._voiced_samples >= sample_rate * self._settings.min_speech_seconds
        reached_endpoint = (
            self._trailing_silence_samples
            >= sample_rate * self._settings.endpoint_silence_seconds
        )
        if enough_speech and reached_endpoint:
            return self._finalize(sample_rate)
        return _empty_result()

    def finish(self) -> RecognitionResult:
        if not self._speech_started or not self._chunks:
            return RecognitionResult(text="", tokens=[], timestamps=[], is_final=True)
        sample_rate = self._last_sample_rate or self._settings.sample_rate
        return self._finalize(sample_rate)

    def reset(self) -> None:
        self._chunks: list[np.ndarray] = []
        self._pre_roll: deque[np.ndarray] = deque()
        self._pre_roll_samples = 0
        self._speech_started = False
        self._voiced_samples = 0
        self._trailing_silence_samples = 0
        self._last_sample_rate: int | None = None
        self._noise_floor = 0.006
        self._calibration_samples = 0
        self._candidate_chunks: list[np.ndarray] = []
        self._candidate_samples = 0

    def _update_noise_floor(self, rms: float, growth_limit: float, weight: float) -> None:
        bounded_rms = min(rms, self._noise_floor * growth_limit)
        self._noise_floor = self._noise_floor * (1.0 - weight) + bounded_rms * weight

    def _append_pre_roll(self, audio: np.ndarray, sample_rate: int) -> None:
        self._last_sample_rate = sample_rate
        self._pre_roll.append(audio.copy())
        self._pre_roll_samples += audio.size
        limit = int(sample_rate * self._settings.pre_roll_seconds)
        while self._pre_roll and self._pre_roll_samples > limit:
            removed = self._pre_roll.popleft()
            self._pre_roll_samples -= removed.size

    def _finalize(self, sample_rate: int) -> RecognitionResult:
        audio = np.concatenate(self._chunks)
        transcription = self._transcribe(audio, sample_rate, self._context)
        if isinstance(transcription, tuple):
            raw_text, language = transcription
        else:
            raw_text, language = transcription, None
        text = filter_recognition_text(raw_text, language, self._languages)
        return RecognitionResult(
            text=text,
            tokens=[],
            timestamps=[],
            is_final=True,
            language=normalize_language_code(language),
        )


class QwenRecognitionEngine:
    engine_id = "qwen3-asr"

    def __init__(
        self,
        settings: AsrSettings,
        model_factory: Callable[[AsrSettings], Any] | None = None,
    ) -> None:
        self.settings = settings
        self.model_name = settings.model_dir.name
        self.model_factory = model_factory or self._load_model
        self.model: Any = None

    def load(self) -> None:
        self.settings.validate_model_files()
        logger.info("Loading Qwen3-ASR model from %s", self.settings.model_dir)
        self.model = self.model_factory(self.settings)
        self._warm_up()
        logger.info("Qwen3-ASR model is ready")

    def create_session(
        self,
        context: str = "",
        languages: tuple[str, ...] = ("zh", "en"),
    ) -> QwenRecognitionSession:
        if self.model is None:
            raise RuntimeError("Qwen3-ASR engine is not loaded")
        return QwenRecognitionSession(self.settings, self._transcribe, context, languages)

    def _transcribe(
        self,
        audio: np.ndarray,
        sample_rate: int,
        context: str = "",
    ) -> tuple[str, str | None]:
        results = self.model.transcribe(
            audio=(audio, sample_rate),
            context=context,
            language=None,
        )
        if not results:
            return "", None
        detected_language = getattr(results[0], "language", None)
        return (
            str(results[0].text),
            str(detected_language) if detected_language is not None else None,
        )

    def _warm_up(self) -> None:
        silence = np.zeros(self.settings.sample_rate, dtype=np.float32)
        self._transcribe(silence, self.settings.sample_rate)

    @staticmethod
    def _load_model(settings: AsrSettings) -> Any:
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        try:
            import torch
            from qwen_asr import Qwen3ASRModel
        except ImportError as error:
            raise RuntimeError(
                "Qwen3-ASR dependencies are not installed. Run pnpm asr:setup."
            ) from error

        device = resolve_asr_device(
            settings.device,
            cuda_available=torch.cuda.is_available(),
            mps_available=torch.backends.mps.is_available(),
            apple_silicon=is_apple_silicon(),
        )

        dtype_name = resolve_asr_dtype(settings.dtype, device)
        dtype = getattr(torch, dtype_name, None)
        if dtype is None:
            raise ValueError(f"Unsupported MOSS_ASR_DTYPE: {settings.dtype}")

        return Qwen3ASRModel.from_pretrained(
            str(settings.model_dir),
            dtype=dtype,
            device_map=device,
            max_inference_batch_size=1,
            max_new_tokens=settings.max_new_tokens,
        )


class SenseVoiceRecognitionEngine:
    engine_id = "sensevoice"

    def __init__(
        self,
        settings: AsrSettings,
        model_factory: Callable[[AsrSettings], Any] | None = None,
        postprocess: Callable[[str], str] | None = None,
    ) -> None:
        self.settings = settings
        self.model_name = settings.sensevoice_model_dir.name
        self.model_factory = model_factory or self._load_model
        self.postprocess = postprocess
        self.model: Any = None

    def load(self) -> None:
        self.settings.validate_model_files(self.engine_id)
        logger.info("Loading SenseVoice model from %s", self.settings.sensevoice_model_dir)
        self.model = self.model_factory(self.settings)
        if self.postprocess is None:
            from funasr.utils.postprocess_utils import rich_transcription_postprocess

            self.postprocess = rich_transcription_postprocess
        logger.info("SenseVoice model is ready")

    def create_session(
        self,
        context: str = "",
        languages: tuple[str, ...] = ("zh", "en"),
    ) -> QwenRecognitionSession:
        if self.model is None:
            raise RuntimeError("SenseVoice engine is not loaded")
        return QwenRecognitionSession(self.settings, self._transcribe, context, languages)

    def _transcribe(
        self,
        audio: np.ndarray,
        sample_rate: int,
        _context: str = "",
    ) -> tuple[str, str | None]:
        if sample_rate != self.settings.sample_rate:
            source_positions = np.arange(audio.size, dtype=np.float64)
            target_length = max(
                1,
                round(audio.size * self.settings.sample_rate / sample_rate),
            )
            target_positions = np.linspace(
                0,
                max(0, audio.size - 1),
                target_length,
            )
            audio = np.interp(target_positions, source_positions, audio).astype(np.float32)
        results = self.model.generate(
            input=audio,
            language="auto",
            use_itn=True,
            batch_size_s=60,
        )
        if not results:
            return "", None
        raw_text = str(results[0].get("text", ""))
        language_match = _SENSEVOICE_LANGUAGE_PATTERN.match(raw_text)
        language = language_match.group(1) if language_match else None
        text = self.postprocess(raw_text) if self.postprocess else raw_text
        return text, language

    @staticmethod
    def _load_model(settings: AsrSettings) -> Any:
        try:
            import torch
            from funasr import AutoModel
        except ImportError as error:
            raise RuntimeError(
                "SenseVoice dependencies are not installed. Run pnpm asr:setup."
            ) from error

        if settings.device.startswith("cuda") and torch.cuda.is_available():
            device = settings.device
        elif settings.device == "auto" and torch.cuda.is_available():
            device = "cuda:0"
        else:
            device = "cpu"

        return AutoModel(
            model=str(settings.sensevoice_model_dir),
            trust_remote_code=True,
            device=device,
            disable_update=True,
        )
