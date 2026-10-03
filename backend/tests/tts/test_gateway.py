from __future__ import annotations

import json
import threading
import unittest
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from backend.services.tts.app import create_server, validate_synthesis_request
from backend.services.tts.config import TtsSettings
from backend.services.tts.engines import Audio8Engine, KokoroEngine
from backend.services.tts.errors import TtsServiceError


class FakeEngine:
    id = "kokoro"

    def __init__(self) -> None:
        self.synthesis_count = 0
        self.prepared = False

    def health(self) -> dict[str, bool]:
        return {"ready": True}

    def prepare(self) -> None:
        self.prepared = True

    def synthesize(self, request: dict[str, object]) -> bytes:
        self.synthesis_count += 1
        return b"RIFF"


class FakeRegistry:
    def __init__(self, engine: FakeEngine) -> None:
        self.engine = engine

    def get(self, engine_id: str) -> FakeEngine:
        if engine_id != self.engine.id:
            raise TtsServiceError(400, "unsupported_engine", "unsupported")
        return self.engine

    def health(self) -> dict[str, object]:
        return {self.engine.id: self.engine.health()}


class TtsServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = FakeEngine()
        settings = TtsSettings(
            host="127.0.0.1",
            port=0,
            allowed_origins=frozenset({"http://localhost:5577"}),
            audio8_url="http://127.0.0.1:5582",
            cosyvoice_url="http://127.0.0.1:5581",
            kokoro_model_path=Path("model.onnx"),
            kokoro_voices_path=Path("voices.bin"),
            kokoro_zh_model_path=Path("model-zh.onnx"),
            kokoro_zh_voices_path=Path("voices-zh.bin"),
            kokoro_zh_config_path=Path("config-zh.json"),
        )
        self.server = create_server(settings, FakeRegistry(self.engine))
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

    def test_routes_and_caches_synthesis(self) -> None:
        payload = {
            "engine": "kokoro",
            "text": "Hello.",
            "voice": "af_bella",
            "speed": 0.9,
        }
        with self.post("/v1/tts/synthesize", payload) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers["Content-Type"], "audio/wav")
            self.assertEqual(response.headers["X-TTS-Cache"], "MISS")
            self.assertEqual(response.read(), b"RIFF")
        with self.post("/v1/tts/synthesize", payload) as response:
            self.assertEqual(response.headers["X-TTS-Cache"], "HIT")
        self.assertEqual(self.engine.synthesis_count, 1)

    def test_prepares_selected_engine(self) -> None:
        with self.post("/v1/tts/prepare", {"engine": "kokoro"}) as response:
            self.assertEqual(response.status, 200)
        self.assertTrue(self.engine.prepared)

    def test_rejects_invalid_synthesis_input(self) -> None:
        with self.assertRaises(HTTPError) as context:
            self.post("/v1/tts/synthesize", {"engine": "kokoro", "text": "", "speed": 3})
        self.assertEqual(context.exception.code, 400)
        result = json.loads(context.exception.read())
        self.assertEqual(result["error"], "invalid_text")
        self.assertEqual(self.engine.synthesis_count, 0)

    def test_health_identifies_python_runtime(self) -> None:
        with urlopen(f"{self.base_url}/health", timeout=2) as response:
            result = json.loads(response.read())
        self.assertEqual(result["runtime"], "python")
        self.assertTrue(result["engines"]["kokoro"]["ready"])


class KokoroEngineTest(unittest.TestCase):
    def test_loads_model_once_and_reports_missing_files(self) -> None:
        with TemporaryDirectory() as temporary:
            model_path = Path(temporary) / "model.onnx"
            voices_path = Path(temporary) / "voices.bin"
            loads: list[tuple[Path, Path]] = []
            engine = KokoroEngine(
                model_path,
                voices_path,
                model_factory=lambda model, voices, _config: loads.append((model, voices))
                or object(),
            )

            self.assertFalse(engine.health()["ready"])
            with self.assertRaises(TtsServiceError):
                engine.prepare()

            model_path.touch()
            voices_path.touch()
            engine.prepare()
            engine.prepare()

            self.assertTrue(engine.health()["ready"])
            self.assertTrue(engine.health()["loaded"])
            self.assertEqual(loads, [(model_path, voices_path)])

    def test_uses_the_chinese_model_and_phonemizer_for_v11_voices(self) -> None:
        class FakeModel:
            def __init__(self) -> None:
                self.calls: list[tuple[str, str, bool]] = []

            def create(
                self,
                text: str,
                voice: str,
                speed: float,
                is_phonemes: bool = False,
            ) -> tuple[list[float], int]:
                self.calls.append((text, voice, is_phonemes))
                return [0.0, 0.1], 24_000

        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = [root / name for name in ("en.onnx", "en.bin", "zh.onnx", "zh.bin", "zh.json")]
            for path in paths:
                path.touch()
            model = FakeModel()
            engine = KokoroEngine(
                paths[0],
                paths[1],
                paths[2],
                paths[3],
                paths[4],
                model_factory=lambda *_args: model,
                phonemizer_factory=lambda: lambda _text: ("ni hao", None),
            )

            audio = engine.synthesize(
                {"text": "你好", "voice": "zf_001", "speed": 1.0}
            )

            self.assertTrue(audio.startswith(b"RIFF"))
            self.assertEqual(model.calls, [("ni hao", "zf_001", True)])


class SidecarEngineTest(unittest.TestCase):
    def test_health_rejects_a_different_service_on_the_configured_port(self) -> None:
        class Response:
            status = 200

            def __enter__(self) -> "Response":
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            def read(self) -> bytes:
                return b'{"ready": true, "service": "moss-asr", "engine": "sherpa-onnx"}'

        engine = Audio8Engine("http://127.0.0.1:5582", opener=lambda *_args, **_kwargs: Response())

        self.assertFalse(engine.health()["ready"])

    def test_reports_a_missing_sidecar_route_as_unavailable(self) -> None:
        def missing_route(request: object, **_kwargs: object) -> object:
            raise HTTPError(
                getattr(request, "full_url", "http://127.0.0.1:5582/synthesize"),
                404,
                "Not Found",
                {},
                BytesIO(b'{"error": "not_found"}'),
            )

        engine = Audio8Engine("http://127.0.0.1:5582", opener=missing_route)

        with self.assertRaises(TtsServiceError) as context:
            engine.synthesize(
                {
                    "text": "Hello.",
                    "voice": "multilingual",
                    "speed": 1.0,
                    "seed": 2_024,
                }
            )
        self.assertEqual(context.exception.status, 503)
        self.assertEqual(context.exception.code, "audio8_unavailable")


class RequestValidationTest(unittest.TestCase):
    def test_normalizes_defaults(self) -> None:
        self.assertEqual(
            validate_synthesis_request({"engine": "kokoro", "text": " Hello "}),
            {
                "engine": "kokoro",
                "seed": 2_024,
                "speed": 1.0,
                "text": "Hello",
                "voice": None,
            },
        )


if __name__ == "__main__":
    unittest.main()
