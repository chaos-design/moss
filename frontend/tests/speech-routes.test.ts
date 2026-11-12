import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { POST as asrPost } from "@/app/api/speech/asr/route"
import { POST as ttsPost } from "@/app/api/speech/tts/route"
import { resetRateLimitStore } from "@/lib/server/rate-limit"
import { isAllowedBrowserSpeechEndpoint } from "@/lib/server/speech-gateway"

const validEndpoint = {
  endpoint: "https://speech.example.com/v1",
  apiKey: "sk-test",
  model: "whisper-1",
}

function asrRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://moss.local/api/speech/asr", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

function ttsRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://moss.local/api/speech/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

function base64(value: string) {
  return Buffer.from(value).toString("base64")
}

beforeEach(() => {
  resetRateLimitStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("loopback speech endpoint policy", () => {
  it("allows a local gateway in production while keeping the remote allowlist explicit", () => {
    vi.stubEnv("NODE_ENV", "production")

    expect(isAllowedBrowserSpeechEndpoint("http://127.0.0.1:5583/v1")).toBe(true)
    expect(isAllowedBrowserSpeechEndpoint("http://localhost:5583/v1")).toBe(true)
    expect(isAllowedBrowserSpeechEndpoint("http://[::1]:5583/v1")).toBe(true)
    expect(isAllowedBrowserSpeechEndpoint("https://speech.example.com/v1")).toBe(false)
    expect(isAllowedBrowserSpeechEndpoint("http://192.168.1.5:5583/v1")).toBe(false)
    expect(isAllowedBrowserSpeechEndpoint("http://user:pass@127.0.0.1:5583/v1")).toBe(false)

    vi.stubEnv("AI_ALLOWED_BROWSER_SPEECH_HOSTS", "speech.example.com")
    expect(isAllowedBrowserSpeechEndpoint("https://speech.example.com/v1")).toBe(true)
  })
})

describe("local ASR and TTS gateway", () => {
  it("proxies both services to a loopback OpenAI-compatible interface", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/audio/transcriptions")) {
        return Promise.resolve(
          new Response(JSON.stringify({ text: "hello" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }
      return Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        }),
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    const localEndpoint = {
      endpoint: "http://127.0.0.1:5583/v1",
      apiKey: "local-token",
      model: "local-model",
    }
    const asr = await asrPost(
      asrRequest({ audioBase64: base64("audio"), endpoint: localEndpoint }),
    )
    const tts = await ttsPost(
      ttsRequest({ endpoint: localEndpoint, text: "Hello", voice: "alloy" }),
    )

    expect(asr.status).toBe(200)
    expect(await asr.json()).toEqual({ data: { text: "hello" } })
    expect(tts.status).toBe(200)
    const [asrUrl] = fetchMock.mock.calls[0] as [string, RequestInit]
    const [ttsUrl, ttsInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(asrUrl).toBe("http://127.0.0.1:5583/v1/audio/transcriptions")
    expect(ttsUrl).toBe("http://127.0.0.1:5583/v1/audio/speech")
    expect(ttsInit.headers as Record<string, string>).toMatchObject({
      Authorization: "Bearer local-token",
    })
  })
})

describe("POST /api/speech/asr", () => {
  it("rejects malformed bodies, unusable endpoints, and empty audio", async () => {
    const malformed = await asrPost(
      new Request("https://moss.local/api/speech/asr", { method: "POST", body: "{" }),
    )
    expect(malformed.status).toBe(400)

    const insecure = await asrPost(
      asrRequest({
        audioBase64: base64("audio"),
        endpoint: { ...validEndpoint, endpoint: "http://speech.example.com/v1" },
      }),
    )
    expect(insecure.status).toBe(400)
    expect((await insecure.json()).error.code).toBe("invalid_speech_endpoint")

    const emptyAudio = await asrPost(asrRequest({ audioBase64: "", endpoint: validEndpoint }))
    expect(emptyAudio.status).toBe(400)
    expect((await emptyAudio.json()).error.code).toBe("invalid_audio")
  })

  it("forwards requests without a model so the service can apply its own default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "hi" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await asrPost(
      asrRequest({
        audioBase64: base64("audio"),
        endpoint: { ...validEndpoint, model: "" },
      }),
    )

    expect(response.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://speech.example.com/v1/audio/transcriptions")
    // 空模型按契约省略字段，而不是替学习者填一个默认值。
    expect((init.body as FormData).has("model")).toBe(false)
  })

  it("rejects oversized payloads before contacting the provider", async () => {
    const tooLarge = await asrPost(
      asrRequest(
        { audioBase64: base64("audio"), endpoint: validEndpoint },
        { "content-length": "13000000" },
      ),
    )
    expect(tooLarge.status).toBe(413)
  })

  it("forwards multipart audio upstream and returns the recognized text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: " Could I get a latte? " }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await asrPost(
      asrRequest({
        audioBase64: base64("fake-audio"),
        endpoint: validEndpoint,
        language: "zh",
        mimeType: "audio/webm",
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { text: "Could I get a latte?" } })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://speech.example.com/v1/audio/transcriptions")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test")
    const form = init.body as FormData
    expect(form.get("model")).toBe("whisper-1")
    expect(form.get("language")).toBe("zh")
  })

  it("normalizes upstream failures into a degraded-service response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))
    const unreachable = await asrPost(
      asrRequest({ audioBase64: base64("audio"), endpoint: validEndpoint }),
    )
    expect(unreachable.status).toBe(502)
    expect((await unreachable.json()).error.code).toBe("speech_endpoint_unreachable")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })))
    const rejected = await asrPost(
      asrRequest({ audioBase64: base64("audio"), endpoint: validEndpoint }),
    )
    expect(rejected.status).toBe(502)
    expect((await rejected.json()).error.message).toContain("401")
  })

  it("rate limits repeated recognition requests per endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: "hi" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    let limited: Response | null = null
    for (let attempt = 0; attempt < 121; attempt += 1) {
      const response = await asrPost(
        asrRequest({ audioBase64: base64("audio"), endpoint: validEndpoint }),
      )
      if (response.status === 429) {
        limited = response
        break
      }
    }

    if (!limited) {
      throw new Error("expected the recognition route to rate limit repeated requests")
    }
    expect((await limited.json()).error.code).toBe("rate_limited")
  })
})

describe("POST /api/speech/tts", () => {
  it("validates text and endpoint before any upstream call", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect((await ttsPost(ttsRequest({ endpoint: validEndpoint, text: "  " }))).status).toBe(
      400,
    )
    expect(
      (
        await ttsPost(
          ttsRequest({
            endpoint: { ...validEndpoint, endpoint: "https://user:pass@speech.example.com/v1" },
            text: "hi",
            voice: "alloy",
          }),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await ttsPost(
          ttsRequest({
            endpoint: { ...validEndpoint, endpoint: "http://speech.example.com/v1" },
            text: "hi",
            voice: "alloy",
          }),
        )
      ).status,
    ).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("streams provider audio back with its content type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        }),
      ),
    )

    const response = await ttsPost(
      ttsRequest({
        endpoint: { ...validEndpoint, model: "tts-1" },
        text: "Hello",
        voice: "alloy",
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("audio/mpeg")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("forwards synthesis without a voice so the service can apply its own default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await ttsPost(
      ttsRequest({ endpoint: validEndpoint, text: "Hello", voice: "" }),
    )

    expect(response.status).toBe(200)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    // 空音色按契约省略字段；Fish Audio 等服务据此使用内置默认音色。
    expect(body).not.toHaveProperty("voice")
    expect(body).toHaveProperty("input", "Hello")
  })

  it("rejects non-audio provider responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>error</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    )

    const response = await ttsPost(
      ttsRequest({ endpoint: validEndpoint, text: "Hello", voice: "alloy" }),
    )

    expect(response.status).toBe(502)
    expect((await response.json()).error.code).toBe("speech_invalid_response")
  })
})
