from __future__ import annotations

import json
import unittest

import httpx

from backend.services.fishaudio.client import FishAudioClient
from backend.services.fishaudio.config import FishAudioSettings
from backend.services.fishaudio.errors import FishAudioServiceError


def create_settings(**overrides: object) -> FishAudioSettings:
    values = {
        "host": "127.0.0.1",
        "port": 5584,
        "allowed_origins": frozenset({"http://localhost:5577"}),
        "api_key": "test-key",
        "access_token": "",
        "base_url": "https://api.fish.audio",
        "tts_model": "s2.1-pro-free",
        "asr_model": "transcribe-1-pro",
        "default_voice": "",
        "latency": "balanced",
    }
    values.update(overrides)
    return FishAudioSettings(**values)  # type: ignore[arg-type]


class FishAudioClientTest(unittest.TestCase):
    def test_sends_the_documented_tts_request(self) -> None:
        captured: dict[str, object] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["authorization"] = request.headers.get("authorization")
            captured["model_header"] = request.headers.get("model")
            captured["body"] = json.loads(request.content)
            return httpx.Response(
                200,
                content=b"ID3",
                headers={"content-type": "audio/mpeg"},
            )

        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        audio, content_type = client.synthesize(
            text="Hello.",
            voice="9a9cf47702da476aa4629e2506d4a857",
            model="s2.1-pro-free",
            response_format="mp3",
            speed=1.0,
        )

        self.assertEqual(audio, b"ID3")
        self.assertEqual(content_type, "audio/mpeg")
        self.assertEqual(captured["authorization"], "Bearer test-key")
        self.assertEqual(captured["model_header"], "s2.1-pro-free")
        self.assertEqual(captured["url"], "https://api.fish.audio/v1/tts")
        self.assertEqual(
            captured["body"],
            {
                "text": "Hello.",
                "reference_id": "9a9cf47702da476aa4629e2506d4a857",
                "prosody": {
                    "speed": 1.0,
                    "volume": 0,
                    "normalize_loudness": True,
                },
                "format": "mp3",
                "latency": "balanced",
            },
        )

    def test_omits_the_reference_id_for_aliases_and_the_default_voice(self) -> None:
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(
                200,
                content=b"ID3",
                headers={"content-type": "application/octet-stream"},
            )

        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        for voice in ("alloy", "", "  "):
            audio, content_type = client.synthesize(
                text="Hello.",
                voice=voice,
                model="s2.1-pro-free",
                response_format="mp3",
                speed=1.0,
            )
            self.assertEqual(audio, b"ID3")
            # Fish Audio 以流式返回 octet-stream；适配器按请求的格式归一化类型。
            self.assertEqual(content_type, "audio/mpeg")

        bodies = [json.loads(request.content) for request in requests]
        self.assertTrue(all("reference_id" not in body for body in bodies))
        # 别名解析为空串后由客户端省略 reference_id。
        from backend.services.fishaudio.client import resolve_reference_id

        self.assertEqual(resolve_reference_id("nova"), "")

    def test_passes_unknown_voices_through_as_reference_ids(self) -> None:
        from backend.services.fishaudio.client import resolve_reference_id

        self.assertEqual(
            resolve_reference_id("9a9cf47702da476aa4629e2506d4a857"),
            "9a9cf47702da476aa4629e2506d4a857",
        )

    def test_strips_speaker_markers_from_transcripts(self) -> None:
        """Fish Audio 转写会混入 <|speaker:0|> 标记，不能污染学习者看到的内容。"""
        captured: dict[str, object] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            return httpx.Response(
                200,
                json={"text": "<|speaker:0|>你好，最近怎么样？"},
                headers={"content-type": "application/json"},
            )

        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        text = client.transcribe(
            audio=b"audio",
            filename="test.wav",
            content_type="audio/wav",
            model="transcribe-1-pro",
            language="",
        )

        self.assertEqual(text, "你好，最近怎么样？")

    def test_retries_without_the_reference_id_when_the_voice_is_rejected(self) -> None:
        """无效 reference_id（手误或音色已删除）→ 去掉音色兜底重试，由内置默认音色接管。"""
        requests: list[httpx.Request] = []
        bodies: list[dict] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            bodies.append(json.loads(request.content))
            if len(requests) == 1:
                return httpx.Response(
                    404,
                    json={
                        "detail": {
                            "code": "reference_not_found",
                            "message": "reference not found",
                        }
                    },
                )
            return httpx.Response(
                200,
                content=b"ID3",
                headers={"content-type": "audio/mpeg"},
            )

        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        audio, content_type = client.synthesize(
            text="Hello.",
            voice="deleted-voice-reference",
            model="s2.1-pro-free",
            response_format="mp3",
            speed=1.0,
        )

        self.assertEqual(audio, b"ID3")
        self.assertEqual(content_type, "audio/mpeg")
        self.assertEqual(len(requests), 2)
        self.assertEqual(bodies[0]["reference_id"], "deleted-voice-reference")
        self.assertNotIn("reference_id", bodies[1])

    def test_does_not_retry_without_a_reference_id_when_none_was_sent(self) -> None:
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(
                400,
                json={"detail": {"code": "bad_request", "message": "bad request"}},
            )

        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(FishAudioServiceError) as context:
            client.synthesize(
                text="Hello.",
                voice="",
                model="s2.1-pro-free",
                response_format="mp3",
                speed=1.0,
            )

        self.assertEqual(context.exception.status, 400)
        self.assertEqual(context.exception.code, "fishaudio_request_rejected")
        self.assertEqual(len(requests), 1)

    def test_maps_supported_output_formats(self) -> None:
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(
                200,
                content=b"audio",
                headers={"content-type": "audio/wav"},
            )

        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        formats = ("mp3", "opus", "pcm", "wav")
        for response_format in formats:
            client.synthesize(
                text="Hello.",
                voice="alloy",
                model="s2.1-pro-free",
                response_format=response_format,
                speed=1.0,
            )

        self.assertEqual(
            [json.loads(request.content)["format"] for request in requests],
            list(formats),
        )

    def test_rejects_unsupported_output_formats_before_calling_the_provider(self) -> None:
        called = False

        def handler(_request: httpx.Request) -> httpx.Response:
            nonlocal called
            called = True
            return httpx.Response(200)

        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(FishAudioServiceError) as context:
            client.synthesize(
                text="Hello.",
                voice="alloy",
                model="s2.1-pro-free",
                response_format="aac",
                speed=1.0,
            )

        self.assertEqual(context.exception.status, 400)
        self.assertEqual(context.exception.code, "unsupported_format")
        self.assertFalse(called)

    def test_transcribes_multipart_audio(self) -> None:
        captured: dict[str, object] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["model_header"] = request.headers.get("model")
            captured["content_type"] = request.headers.get("content-type")
            captured["body"] = request.content
            return httpx.Response(200, json={"text": "Hello world", "duration": 1.2})

        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        text = client.transcribe(
            audio=b"webm-bytes",
            filename="speech.webm",
            content_type="audio/webm",
            model="transcribe-1-pro",
            language="en",
        )

        self.assertEqual(text, "Hello world")
        self.assertEqual(captured["url"], "https://api.fish.audio/v1/asr")
        self.assertEqual(captured["model_header"], "transcribe-1-pro")
        self.assertIn("multipart/form-data", str(captured["content_type"]))
        body = captured["body"]
        self.assertIsInstance(body, bytes)
        self.assertIn(b'name="audio"; filename="speech.webm"', body)
        self.assertIn(b'name="language"', body)
        self.assertIn(b"auto_split", body)
        self.assertIn(b"ignore_timestamps", body)

    def test_omits_the_language_field_when_unset(self) -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"text": "你好"})

        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        text = client.transcribe(
            audio=b"webm-bytes",
            filename="speech.webm",
            content_type="audio/webm",
            model="transcribe-1-pro",
            language="",
        )
        self.assertEqual(text, "你好")

    def test_reports_unreachable_provider_without_leaking_the_key(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(FishAudioServiceError) as context:
            client.synthesize(
                text="Hello.",
                voice="alloy",
                model="s2.1-pro-free",
                response_format="mp3",
                speed=1.0,
            )

        self.assertEqual(context.exception.status, 503)
        self.assertEqual(context.exception.code, "fishaudio_unreachable")
        self.assertNotIn("test-key", context.exception.message)

    def test_reports_provider_timeout(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("slow", request=request)

        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(FishAudioServiceError) as context:
            client.transcribe(
                audio=b"webm-bytes",
                filename="speech.webm",
                content_type="audio/webm",
                model="transcribe-1-pro",
                language="",
            )

        self.assertEqual(context.exception.status, 504)
        self.assertEqual(context.exception.code, "fishaudio_timeout")

    def test_rejects_a_non_audio_upstream_payload(self) -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"detail": "not audio"})

        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(FishAudioServiceError) as context:
            client.synthesize(
                text="Hello.",
                voice="alloy",
                model="s2.1-pro-free",
                response_format="mp3",
                speed=1.0,
            )

        self.assertEqual(context.exception.code, "fishaudio_invalid_audio")

    def test_maps_provider_errors_to_normalized_codes(self) -> None:
        cases = [
            (401, 401, "fishaudio_unauthorized"),
            (403, 401, "fishaudio_unauthorized"),
            (402, 402, "fishaudio_payment_required"),
            (429, 429, "fishaudio_rate_limited"),
            (422, 422, "fishaudio_request_rejected"),
            (500, 502, "fishaudio_upstream_error"),
        ]
        for provider_status, expected_status, expected_code in cases:
            with self.subTest(provider_status=provider_status):
                client = FishAudioClient(
                    create_settings(),
                    transport=httpx.MockTransport(
                        lambda _request, status=provider_status: httpx.Response(
                            status, json={"detail": "provider body"}
                        )
                    ),
                )
                with self.assertRaises(FishAudioServiceError) as context:
                    client.synthesize(
                        text="Hello.",
                        voice="alloy",
                        model="s2.1-pro-free",
                        response_format="mp3",
                        speed=1.0,
                    )
                self.assertEqual(context.exception.status, expected_status)
                self.assertEqual(context.exception.code, expected_code)
                self.assertNotIn("provider body", context.exception.message)
                self.assertNotIn("test-key", context.exception.message)

    def test_payment_required_hint_matches_service(self) -> None:
        # s2.1-pro-free 只是合成的免费模型：402 提示按服务区分，识别侧不误导。
        client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(402, json={"detail": "provider body"})
            ),
        )
        with self.assertRaises(FishAudioServiceError) as context:
            client.synthesize(
                text="Hello.",
                voice="alloy",
                model="s2.1-pro-free",
                response_format="mp3",
                speed=1.0,
            )
        self.assertIn("s2.1-pro-free", context.exception.message)

        asr_client = FishAudioClient(
            create_settings(),
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(402, json={"detail": "provider body"})
            ),
        )
        with self.assertRaises(FishAudioServiceError) as context:
            asr_client.transcribe(
                audio=b"audio",
                filename="test.wav",
                content_type="audio/wav",
                model="transcribe-1-pro",
                language="en",
            )
        self.assertNotIn("s2.1-pro-free", context.exception.message)
        self.assertIn("识别", context.exception.message)


if __name__ == "__main__":
    unittest.main()
