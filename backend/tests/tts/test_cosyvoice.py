from __future__ import annotations

import json
import threading
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import Request, urlopen

from backend.services.tts.runtimes.cosyvoice.app import create_server
from backend.services.tts.runtimes.cosyvoice.config import CosyVoiceSettings
from backend.services.tts.runtimes.cosyvoice.engine import CosyVoiceRuntime


class FakeRuntime:
    def __init__(self) -> None:
        self.prepared = False
        self.request = None

    def health(self) -> dict[str, object]:
        return {"ready": True, "voices": ["english_female", "english_male"]}

    def prepare(self) -> None:
        self.prepared = True

    def synthesize(self, text: str, voice: str, speed: float, seed: int) -> bytes:
        self.request = (text, voice, speed, seed)
        return b"RIFF"


class CosyVoiceServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.runtime = FakeRuntime()
        settings = CosyVoiceSettings(
            host="127.0.0.1",
            port=0,
            runtime_dir=Path("runtime"),
            model_dir=Path("model"),
        )
        self.server = create_server(settings, self.runtime)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def post(self, path: str, payload: dict[str, object]) -> object:
        request = Request(
            f"{self.base_url}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        return urlopen(request, timeout=2)

    def test_prepares_without_synthesis(self) -> None:
        with self.post("/prepare", {}) as response:
            self.assertEqual(response.status, 200)
        self.assertTrue(self.runtime.prepared)

    def test_returns_wav_for_named_voice(self) -> None:
        with self.post(
            "/synthesize",
            {
                "text": "Compare this voice.",
                "voice": "english_female",
                "speed": 0.95,
                "seed": 7,
            },
        ) as response:
            self.assertEqual(response.headers["Content-Type"], "audio/wav")
            self.assertEqual(response.read(), b"RIFF")
        self.assertEqual(
            self.runtime.request,
            ("Compare this voice.", "english_female", 0.95, 7),
        )


class CosyVoiceRuntimeTest(unittest.TestCase):
    def test_runtime_and_model_are_required_before_lazy_load(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            settings = CosyVoiceSettings(
                host="127.0.0.1",
                port=5581,
                runtime_dir=root / "runtime",
                model_dir=root / "model",
            )
            loads = []
            runtime = CosyVoiceRuntime(
                settings,
                model_factory=lambda runtime_dir, model_dir: loads.append(
                    (runtime_dir, model_dir)
                )
                or object(),
            )
            self.assertFalse(runtime.health()["ready"])

            (settings.runtime_dir / "cosyvoice" / "cli").mkdir(parents=True)
            (settings.runtime_dir / "cosyvoice" / "cli" / "cosyvoice.py").touch()
            settings.model_dir.mkdir()
            for name in (
                "cosyvoice.yaml",
                "llm.pt",
                "flow.pt",
                "hift.pt",
                "spk2info.pt",
                "speech_tokenizer_v1.onnx",
            ):
                (settings.model_dir / name).touch()

            runtime.prepare()
            runtime.prepare()
            self.assertTrue(runtime.health()["loaded"])
            self.assertEqual(loads, [(settings.runtime_dir, settings.model_dir)])


if __name__ == "__main__":
    unittest.main()
