import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { POST } from "@/app/api/speech/tts/test/route"
import { resetRateLimitStore } from "@/lib/server/rate-limit"
import { speechRules, testSynthesisDefaults } from "@/lib/speech-rules"

const endpoint = {
  endpoint: "https://speech.example.com/v1",
  apiKey: "sk-test",
  model: "tts-1",
}

function testRequest(body: unknown) {
  return new Request("https://moss.local/api/speech/tts/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

/** A minimal but recognizable MP3 frame (ID3 header plus payload). */
function mp3Response() {
  return new Response(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02]), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  })
}

beforeEach(() => {
  resetRateLimitStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("POST /api/speech/tts/test", () => {
  it("reports a usable synthesis without returning the audio bytes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mp3Response())
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(testRequest({ endpoint }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.ok).toBe(true)
    expect(result.contentType).toBe("audio/mpeg")
    expect(result.bytes).toBe(8)
    expect(result.model).toBe(endpoint.model)
    expect(result.voice).toBe(testSynthesisDefaults.voice)
    expect(result.format).toBe(speechRules.formats.default)
    expect(result.checks).toEqual({ audioContentType: true, plausiblePayload: true })
    expect(typeof result.durationMs).toBe("number")
    expect(response.headers.get("cache-control")).toBe("no-store")

    // The diagnostic route must keep using the standard speech path so any
    // OpenAI-compatible endpoint works, not just the local 5583 adapter.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://speech.example.com/v1/audio/speech")
    const upstream = JSON.parse(String(init.body))
    expect(upstream.input).toBe(testSynthesisDefaults.text)
    expect(upstream.voice).toBe(testSynthesisDefaults.voice)
    expect(upstream.response_format).toBe(testSynthesisDefaults.format)
    expect(upstream.model).toBe(endpoint.model)
  })

  it("honors explicit test parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mp3Response())
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      testRequest({
        endpoint,
        text: "Could I get a coffee?",
        voice: "onyx",
        format: "wav",
        speed: 1.8,
      }),
    )
    const result = await response.json()

    expect(result.ok).toBe(true)
    expect(result.voice).toBe("onyx")
    expect(result.format).toBe("wav")
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const upstream = JSON.parse(String(init.body))
    expect(upstream.input).toBe("Could I get a coffee?")
    expect(upstream.response_format).toBe("wav")
    expect(upstream.speed).toBe(1.8)
  })

  it("flags a non-audio response as a failed diagnostic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "nope" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    const response = await POST(testRequest({ endpoint }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe("speech_invalid_response")
    expect(result.bytes).toBe(0)
  })

  it("flags a truncated or mismatched audio payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3, 4, 5]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        }),
      ),
    )

    const response = await POST(testRequest({ endpoint }))
    const result = await response.json()

    expect(result.ok).toBe(false)
    expect(result.checks.plausiblePayload).toBe(false)
    expect(result.error.code).toBe("speech_invalid_response")
  })

  it("returns an actionable diagnostic when the upstream is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 502 })))

    const response = await POST(testRequest({ endpoint }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.ok).toBe(false)
    expect(result.status).toBe(502)
    expect(result.error.code).toBe("speech_upstream_error")
    expect(result.error.message).toContain("502")
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it("reports a thrown network error without breaking the settings page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))

    const response = await POST(testRequest({ endpoint }))
    const result = await response.json()

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe("speech_endpoint_unreachable")
  })

  it("rejects an invalid endpoint before calling any upstream", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      testRequest({ endpoint: { ...endpoint, endpoint: "http://192.168.1.5/v1" } }),
    )

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe("invalid_speech_endpoint")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
