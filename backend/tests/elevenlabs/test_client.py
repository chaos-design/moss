from __future__ import annotations

import json
import unittest

import httpx

from backend.services.elevenlabs.client import ElevenLabsClient
from backend.services.elevenlabs.config import ElevenLabsSettings
from backend.services.elevenlabs.errors import ElevenLabsServiceError


def create_settings(**overrides: object) -> ElevenLabsSettings:
    values = {
        "host": "127.0.0.1",
        "port": 5583,
        "allowed_origins": frozenset({"http://localhost:5577"}),
        "api_key": "test-key",
        "access_token": "",
        "base_url": "https://api.elevenlabs.io",
        "tts_model": "eleven_v4",
        "asr_model": "scribe_v2",
        "default_voice": "JBFqnCBsd6RMkjVDRZzb",
    }
    values.update(overrides)
    return ElevenLabsSettings(**values)  # type: ignore[arg-type]


class ElevenLabsClientTest(unittest.TestCase):
    def test_sends_the_documented_tts_request(self) -> None:
        captured: dict[str, object] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["api_key"] = request.headers.get("xi-api-key")
            captured["body"] = json.loads(request.content)
            return httpx.Response(
                200,
                content=b"ID3",
                headers={"content-type": "audio/mpeg"},
            )

        client = ElevenLabsClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        audio, content_type = client.synthesize(
            text="Hello.",
            voice="JBFqnCBsd6RMkjVDRZzb",
            model="eleven_v4",
            response_format="mp3",
            speed=1.0,
        )

        self.assertEqual(audio, b"ID3")
        self.assertEqual(content_type, "audio/mpeg")
        self.assertEqual(captured["api_key"], "test-key")
        self.assertEqual(
            captured["url"],
            "https://api.elevenlabs.io/v1/text-to-speech/"
            "JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128",
        )
        self.assertEqual(
            captured["body"],
            {
                "text": "Hello.",
                "model_id": "eleven_v4",
                "voice_settings": {"speed": 1.0},
            },
        )

    def test_falls_back_to_the_default_voice_when_the_voice_is_empty(self) -> None:
        captured: dict[str, object] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            return httpx.Response(
                200,
                content=b"ID3",
                headers={"content-type": "audio/mpeg"},
            )

        client = ElevenLabsClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        client.synthesize(
            text="Hello.",
            voice="  ",
            model="eleven_v4",
            response_format="mp3",
            speed=1.0,
        )

        self.assertEqual(
            captured["url"],
            "https://api.elevenlabs.io/v1/text-to-speech/"
            "JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128",
        )

    def test_retries_with_the_default_voice_when_the_voice_is_rejected(self) -> None:
        """voice_not_found → 兜底重试默认音色；覆盖设置页手误音色名（如 multilingual）的场景。"""
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            if len(requests) == 1:
                return httpx.Response(
                    404,
                    json={
                        "detail": {
                            "status": "not_found",
                            "code": "voice_not_found",
                            "message": "voice not found",
                        }
                    },
                )
            return httpx.Response(
                200,
                content=b"ID3",
                headers={"content-type": "audio/mpeg"},
            )

        client = ElevenLabsClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        audio, content_type = client.synthesize(
            text="Hey, it has been a while!",
            voice="multilingual",
            model="eleven_v4",
            response_format="mp3",
            speed=0.92,
        )

        self.assertEqual(audio, b"ID3")
        self.assertEqual(content_type, "audio/mpeg")
        self.assertEqual(len(requests), 2)
        self.assertIn("multilingual", requests[0].url.path)
        self.assertIn("JBFqnCBsd6RMkjVDRZzb", requests[1].url.path)

    def test_retries_with_the_default_model_when_the_model_is_rejected(self) -> None:
        requests: list[httpx.Request] = []
        bodies: list[dict] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            bodies.append(json.loads(request.content))
            if len(requests) == 1:
                return httpx.Response(
                    400,
                    json={
                        "detail": {
                            "status": "bad_request",
                            "code": "bad_request",
                            "message": (
                                "An invalid ID has been received: 'bogus-model'. "
                                "Make sure to provide a correct model_id."
                            ),
                        }
                    },
                )
            return httpx.Response(
                200,
                content=b"ID3",
                headers={"content-type": "audio/mpeg"},
            )

        client = ElevenLabsClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        audio, _ = client.synthesize(
            text="Hello.",
            voice="alloy",
            model="bogus-model",
            response_format="mp3",
            speed=1.0,
        )

        self.assertEqual(audio, b"ID3")
        self.assertEqual(len(requests), 2)
        self.assertEqual(bodies[0]["model_id"], "bogus-model")
        self.assertEqual(bodies[1]["model_id"], "eleven_v4")

    def test_does_not_retry_when_the_failure_cannot_be_fallen_back(self) -> None:
        """凭据、余额、限流等不可兜底失败只请求一次，避免重复消耗配额或放大限流。"""
        cases = [
            (401, "elevenlabs_unauthorized"),
            (402, "elevenlabs_payment_required"),
            (429, "elevenlabs_rate_limited"),
        ]
        for provider_status, expected_code in cases:
            with self.subTest(provider_status=provider_status):
                requests: list[httpx.Request] = []

                def handler(
                    request: httpx.Request,
                    status: int = provider_status,
                ) -> httpx.Response:
                    requests.append(request)
                    return httpx.Response(
                        status,
                        json={"detail": {"status": "error", "code": "ignored", "message": "x"}},
                    )

                client = ElevenLabsClient(
                    create_settings(),
                    transport=httpx.MockTransport(handler),
                )
                with self.assertRaises(ElevenLabsServiceError) as context:
                    client.synthesize(
                        text="Hello.",
                        voice="alloy",
                        model="eleven_v4",
                        response_format="mp3",
                        speed=1.0,
                    )
                self.assertEqual(context.exception.code, expected_code)
                self.assertEqual(len(requests), 1)

    def test_keeps_the_actionable_hint_when_the_voice_fallback_also_fails(self) -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                404,
                json={
                    "detail": {
                        "status": "not_found",
                        "code": "voice_not_found",
                        "message": "voice not found",
                    }
                },
            )

        client = ElevenLabsClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(ElevenLabsServiceError) as context:
            client.synthesize(
                text="Hello.",
                voice="multilingual",
                model="eleven_v4",
                response_format="mp3",
                speed=1.0,
            )
        self.assertEqual(context.exception.status, 404)
        self.assertEqual(context.exception.code, "elevenlabs_request_rejected")
        self.assertIn("默认音色", context.exception.message)

    def test_maps_openai_voice_aliases_and_clamps_speed(self) -> None:
        captured: dict[str, object] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["path"] = request.url.path
            captured["body"] = json.loads(request.content)
            return httpx.Response(
                200,
                content=b"ID3",
                headers={"content-type": "audio/mpeg"},
            )

        client = ElevenLabsClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        client.synthesize(
            text="Hello.",
            voice="alloy",
            model="eleven_v4",
            response_format="mp3",
            speed=2.0,
        )

        self.assertEqual(
            captured["path"],
            "/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb",
        )
        self.assertEqual(captured["body"]["voice_settings"], {"speed": 1.2})

    def test_maps_supported_output_formats(self) -> None:
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(
                200,
                content=b"audio",
                headers={"content-type": "audio/wav"},
            )

        client = ElevenLabsClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        for response_format in ("mp3", "opus", "pcm", "wav"):
            client.synthesize(
                text="Hello.",
                voice="alloy",
                model="eleven_v4",
                response_format=response_format,
                speed=1.0,
            )

        self.assertEqual(
            [request.url.params["output_format"] for request in requests],
            ["mp3_44100_128", "opus_48000_128", "pcm_16000", "wav_44100"],
        )

    def test_rejects_unsupported_output_formats_before_calling_the_provider(self) -> None:
        called = False

        def handler(_request: httpx.Request) -> httpx.Response:
            nonlocal called
            called = True
            return httpx.Response(200)

        client = ElevenLabsClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(ElevenLabsServiceError) as context:
            client.synthesize(
                text="Hello.",
                voice="alloy",
                model="eleven_v4",
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
            captured["content_type"] = request.headers.get("content-type")
            captured["body"] = request.content
            return httpx.Response(200, json={"text": "Hello world"})

        client = ElevenLabsClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        text = client.transcribe(
            audio=b"webm-bytes",
            filename="speech.webm",
            content_type="audio/webm",
            model="scribe_v2",
            language="en",
        )

        self.assertEqual(text, "Hello world")
        self.assertEqual(captured["url"], "https://api.elevenlabs.io/v1/speech-to-text")
        self.assertIn("multipart/form-data", str(captured["content_type"]))
        body = captured["body"]
        self.assertIsInstance(body, bytes)
        self.assertIn(b'name="model_id"', body)
        self.assertIn(b"scribe_v2", body)
        self.assertIn(b'name="language_code"', body)
        self.assertIn(b'name="file"; filename="speech.webm"', body)

    def test_reports_unreachable_provider_without_leaking_the_key(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        client = ElevenLabsClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(ElevenLabsServiceError) as context:
            client.synthesize(
                text="Hello.",
                voice="alloy",
                model="eleven_v4",
                response_format="mp3",
                speed=1.0,
            )

        self.assertEqual(context.exception.status, 503)
        self.assertEqual(context.exception.code, "elevenlabs_unreachable")
        self.assertNotIn("test-key", context.exception.message)

    def test_reports_provider_timeout(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("slow", request=request)

        client = ElevenLabsClient(
            create_settings(),
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(ElevenLabsServiceError) as context:
            client.transcribe(
                audio=b"webm-bytes",
                filename="speech.webm",
                content_type="audio/webm",
                model="scribe_v2",
                language="",
            )

        self.assertEqual(context.exception.status, 504)
        self.assertEqual(context.exception.code, "elevenlabs_timeout")

    def test_maps_provider_errors_to_normalized_codes(self) -> None:
        cases = [
            (401, 401, "elevenlabs_unauthorized"),
            (403, 401, "elevenlabs_unauthorized"),
            (402, 402, "elevenlabs_payment_required"),
            (429, 429, "elevenlabs_rate_limited"),
            (422, 422, "elevenlabs_request_rejected"),
            (500, 502, "elevenlabs_upstream_error"),
        ]
        for provider_status, expected_status, expected_code in cases:
            with self.subTest(provider_status=provider_status):
                client = ElevenLabsClient(
                    create_settings(),
                    transport=httpx.MockTransport(
                        lambda _request, status=provider_status: httpx.Response(
                            status, json={"detail": "provider body"}
                        )
                    ),
                )
                with self.assertRaises(ElevenLabsServiceError) as context:
                    client.synthesize(
                        text="Hello.",
                        voice="alloy",
                        model="eleven_v4",
                        response_format="mp3",
                        speed=1.0,
                    )
                self.assertEqual(context.exception.status, expected_status)
                self.assertEqual(context.exception.code, expected_code)
                self.assertNotIn("provider body", context.exception.message)
                self.assertNotIn("test-key", context.exception.message)

    def test_treats_a_key_id_400_as_unauthorized(self) -> None:
        client = ElevenLabsClient(
            create_settings(),
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    400,
                    json={
                        "detail": {
                            "type": "authentication_error",
                            "code": "invalid_api_key",
                            "message": "API key ID used as API key",
                        }
                    },
                )
            ),
        )
        with self.assertRaises(ElevenLabsServiceError) as context:
            client.synthesize(
                text="Hello.",
                voice="alloy",
                model="eleven_v4",
                response_format="mp3",
                speed=1.0,
            )

        self.assertEqual(context.exception.status, 401)
        self.assertEqual(context.exception.code, "elevenlabs_unauthorized")
        # 只透传机器码，方便定位；不回传上游自由文本或密钥。
        self.assertIn("invalid_api_key", context.exception.message)
        self.assertNotIn("API key ID used as API key", context.exception.message)
        self.assertNotIn("test-key", context.exception.message)


if __name__ == "__main__":
    unittest.main()
