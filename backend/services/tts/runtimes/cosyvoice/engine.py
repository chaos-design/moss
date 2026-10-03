from __future__ import annotations

import io
import random
import sys
import threading
import wave
from pathlib import Path
from typing import Any, Callable, Optional

from .config import CosyVoiceSettings

VOICE_MAP = {
    "english_female": "英文女",
    "english_male": "英文男",
}
REQUIRED_MODEL_FILES = (
    "cosyvoice.yaml",
    "llm.pt",
    "flow.pt",
    "hift.pt",
    "spk2info.pt",
    "speech_tokenizer_v1.onnx",
)


class CosyVoiceRuntimeError(Exception):
    pass


def _load_model(runtime_dir: Path, model_dir: Path) -> Any:
    matcha_dir = runtime_dir / "third_party" / "Matcha-TTS"
    for path in (runtime_dir, matcha_dir):
        value = str(path)
        if value not in sys.path:
            sys.path.insert(0, value)

    from cosyvoice.cli.cosyvoice import AutoModel

    return AutoModel(model_dir=str(model_dir))


def _wav_bytes(chunks: list[Any], sample_rate: int) -> bytes:
    import numpy as np

    arrays = []
    for chunk in chunks:
        speech = chunk["tts_speech"]
        if hasattr(speech, "detach"):
            speech = speech.detach()
        if hasattr(speech, "cpu"):
            speech = speech.cpu()
        arrays.append(np.asarray(speech).reshape(-1))
    if not arrays:
        raise CosyVoiceRuntimeError("CosyVoice 未返回音频")

    samples = np.concatenate(arrays)
    pcm = (np.clip(samples, -1.0, 1.0) * 32_767).astype("<i2", copy=False)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return output.getvalue()


class CosyVoiceRuntime:
    def __init__(
        self,
        settings: CosyVoiceSettings,
        model_factory: Callable[[Path, Path], Any] = _load_model,
    ) -> None:
        self.settings = settings
        self.model_factory = model_factory
        self._model: Optional[Any] = None
        self._load_lock = threading.Lock()
        self._synthesis_lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def missing_files(self) -> list[str]:
        missing = []
        if not (self.settings.runtime_dir / "cosyvoice" / "cli" / "cosyvoice.py").is_file():
            missing.append(str(self.settings.runtime_dir))
        missing.extend(
            str(self.settings.model_dir / name)
            for name in REQUIRED_MODEL_FILES
            if not (self.settings.model_dir / name).is_file()
        )
        return missing

    def health(self) -> dict[str, Any]:
        missing = self.missing_files()
        return {
            "engine": "cosyvoice",
            "loaded": self.loaded,
            "model": self.settings.model_dir.name,
            "ready": not missing,
            "sampleRate": getattr(self._model, "sample_rate", 22_050),
            "voices": list(VOICE_MAP),
            "missing": missing,
        }

    def prepare(self) -> None:
        self._get_model()

    def synthesize(self, text: str, voice: str, speed: float, seed: int) -> bytes:
        speaker = VOICE_MAP.get(voice)
        if speaker is None:
            raise ValueError(f"不支持的 CosyVoice 音色：{voice}")

        with self._synthesis_lock:
            random.seed(seed)
            try:
                import torch

                torch.manual_seed(seed)
            except ImportError:
                pass
            model = self._get_model()
            chunks = list(
                model.inference_sft(
                    text,
                    speaker,
                    stream=False,
                    speed=speed,
                )
            )
        return _wav_bytes(chunks, model.sample_rate)

    def _get_model(self) -> Any:
        if self._model is not None:
            return self._model
        missing = self.missing_files()
        if missing:
            raise CosyVoiceRuntimeError(
                "CosyVoice 尚未安装，请先运行 pnpm cosyvoice:setup"
            )
        with self._load_lock:
            if self._model is None:
                self._model = self.model_factory(
                    self.settings.runtime_dir,
                    self.settings.model_dir,
                )
        return self._model
