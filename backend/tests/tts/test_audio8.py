from __future__ import annotations

import json
import threading
import unittest
import wave
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import Request, urlopen

from backend.services.tts.runtimes.audio8.app import create_server
from backend.services.tts.runtimes.audio8.config import Audio8Settings
import numpy as np

from backend.services.tts.runtimes.audio8.engine import Audio8Runtime, _adjust_speed, _wav_bytes


class FakeRuntime:
    def __init__(self) -> None:
        self.prepared = False
        self.request = None

    def health(self) -> dict[str, object]:
        return {"ready": True, "voices": ["multilingual"]}

    def prepare(self) -> None:
        self.prepared = True

    def synthesize(self, text: str, voice: str, speed: float, seed: int) -> bytes:
        self.request = (text, voice, speed, seed)
        return b"RIFF"


class Audio8ServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.runtime = FakeRuntime()
        settings = Audio8Settings(
            host="127.0.0.1",
            port=0,
            model_dir=Path("model"),
            model_id="Audio8/Audio8-TTS-Preview-0.6b",
            device="cpu",
            max_new_tokens=1024,
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

    def test_prepares_and_synthesizes_multilingual_audio(self) -> None:
        with self.post("/prepare", {}) as response:
            self.assertEqual(response.status, 200)
        with self.post(
            "/synthesize",
            {
                "text": "你好，welcome to Moss.",
                "voice": "multilingual",
                "speed": 0.95,
                "seed": 7,
            },
        ) as response:
            self.assertEqual(response.headers["Content-Type"], "audio/wav")
            self.assertEqual(response.read(), b"RIFF")

        self.assertTrue(self.runtime.prepared)
        self.assertEqual(
            self.runtime.request,
            ("你好，welcome to Moss.", "multilingual", 0.95, 7),
        )


class Audio8RuntimeTest(unittest.TestCase):
    def test_model_files_are_required_before_lazy_load(self) -> None:
        with TemporaryDirectory() as temporary:
            model_dir = Path(temporary)
            settings = Audio8Settings(
                host="127.0.0.1",
                port=5582,
                model_dir=model_dir,
                model_id="Audio8/Audio8-TTS-Preview-0.6b",
                device="cpu",
                max_new_tokens=1024,
            )
            loads = []
            runtime = Audio8Runtime(
                settings,
                model_factory=lambda path, device: loads.append((path, device)) or object(),
            )
            self.assertFalse(runtime.health()["ready"])

            (model_dir / "config.json").touch()
            (model_dir / "model.safetensors").touch()
            runtime.prepare()
            runtime.prepare()

            self.assertTrue(runtime.health()["loaded"])
            self.assertEqual(loads, [(model_dir, "cpu")])

    def test_encodes_wav_and_applies_requested_speed(self) -> None:
        samples = np.linspace(-0.5, 0.5, 100, dtype=np.float32)
        faster = _adjust_speed(samples, 1.25)
        self.assertEqual(faster.size, 80)

        with wave.open(BytesIO(_wav_bytes(faster, 44_100)), "rb") as audio:
            self.assertEqual(audio.getframerate(), 44_100)
            self.assertEqual(audio.getnchannels(), 1)
            self.assertEqual(audio.getnframes(), 80)


if __name__ == "__main__":
    unittest.main()
