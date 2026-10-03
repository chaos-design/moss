from __future__ import annotations

import io
import random
import threading
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .config import Audio8Settings


class Audio8RuntimeError(Exception):
    pass


@dataclass(frozen=True)
class LoadedAudio8Model:
    processor: Any
    model: Any
    torch: Any
    device: str


def _load_model(model_dir: Path, device_name: str) -> LoadedAudio8Model:
    import torch
    from transformers import AutoModel, AutoProcessor

    if device_name == "auto":
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"
    else:
        device = device_name
    dtype = torch.bfloat16 if device == "cuda" else torch.float32
    processor = AutoProcessor.from_pretrained(model_dir, trust_remote_code=True)
    model = (
        AutoModel.from_pretrained(
            model_dir,
            trust_remote_code=True,
            dtype=dtype,
        )
        .eval()
        .to(device)
    )
    return LoadedAudio8Model(processor=processor, model=model, torch=torch, device=device)


def _wav_bytes(samples: Any, sample_rate: int) -> bytes:
    import numpy as np

    pcm = np.clip(np.asarray(samples).reshape(-1), -1.0, 1.0)
    pcm = (pcm * 32_767).astype("<i2", copy=False)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return output.getvalue()


def _adjust_speed(samples: Any, speed: float) -> Any:
    import numpy as np

    audio = np.asarray(samples)
    if abs(speed - 1.0) < 0.01 or audio.size < 2:
        return audio
    target_length = max(1, round(audio.size / speed))
    source_positions = np.arange(audio.size, dtype=np.float64)
    target_positions = np.linspace(0, audio.size - 1, target_length)
    return np.interp(target_positions, source_positions, audio).astype(np.float32)


class Audio8Runtime:
    def __init__(
        self,
        settings: Audio8Settings,
        model_factory: Callable[[Path, str], LoadedAudio8Model] = _load_model,
    ) -> None:
        self.settings = settings
        self.model_factory = model_factory
        self._loaded: LoadedAudio8Model | None = None
        self._load_lock = threading.Lock()
        self._synthesis_lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._loaded is not None

    def missing_files(self) -> list[str]:
        required = (self.settings.model_dir / "config.json",)
        missing = [str(path) for path in required if not path.is_file()]
        if self.settings.model_dir.is_dir() and not any(
            self.settings.model_dir.glob("*.safetensors")
        ):
            missing.append(str(self.settings.model_dir / "*.safetensors"))
        return missing

    def health(self) -> dict[str, Any]:
        missing = self.missing_files()
        return {
            "engine": "audio8",
            "loaded": self.loaded,
            "model": self.settings.model_id,
            "ready": not missing,
            "sampleRate": 44_100,
            "voices": ["multilingual"],
            "missing": missing,
        }

    def prepare(self) -> None:
        self._get_model()

    def synthesize(self, text: str, voice: str, speed: float, seed: int) -> bytes:
        if voice not in {"", "multilingual"}:
            raise ValueError(f"不支持的 Audio8 音色：{voice}")
        if len(text) > 150:
            raise ValueError("Audio8 单次合成文本不能超过 150 个字符")

        loaded = self._get_model()
        with self._synthesis_lock:
            random.seed(seed)
            loaded.torch.manual_seed(seed)
            inputs = loaded.processor(text=[text], return_tensors="pt")
            inputs = {name: value.to(loaded.device) for name, value in inputs.items()}
            with loaded.torch.inference_mode():
                output = loaded.model.generate(
                    **inputs,
                    max_new_tokens=self.settings.max_new_tokens,
                    temperature=0.8,
                    top_p=0.95,
                    top_k=50,
                    do_sample=True,
                    return_dict_in_generate=True,
                )
                waveforms, lengths = loaded.model.decode_audio(output.codes)
            length = int(lengths[0])
            samples = waveforms[0, :length].float().cpu().numpy()
        samples = _adjust_speed(samples, speed)
        sample_rate = int(loaded.model.config.codec_sample_rate)
        return _wav_bytes(samples, sample_rate)

    def _get_model(self) -> LoadedAudio8Model:
        if self._loaded is not None:
            return self._loaded
        missing = self.missing_files()
        if missing:
            raise Audio8RuntimeError(
                "Audio8 模型尚未安装，请先运行 pnpm audio8:setup"
            )
        with self._load_lock:
            if self._loaded is None:
                try:
                    self._loaded = self.model_factory(
                        self.settings.model_dir,
                        self.settings.device,
                    )
                except Exception as error:
                    raise Audio8RuntimeError(f"Audio8 模型加载失败：{error}") from error
        return self._loaded
