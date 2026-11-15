import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}))

import { POST as asrPost } from "@/app/api/speech/asr/route"
import { POST as ttsPost } from "@/app/api/speech/tts/route"
import { resetRateLimitStore } from "@/lib/server/rate-limit"
import { isAllowedBrowserSpeechEndpoint, speechRateLimitKey } from "@/lib/server/speech-gateway"

const validEndpoint = {
  endpoint: "https://speech.example.com/v1",
  apiKey: "sk-test",
  model: "whisper-1",
}

function createSupabase(userId: string | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }
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
  mocks.getSupabaseServerClient.mockReset().mockResolvedValue(null)
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

  it("restricts production loopback proxies to the rule-table speech ports", () => {
    vi.stubEnv("NODE_ENV", "production")

    // 四个规则表语音端口可用：5578 网关、5580 ASR、5583/5584 适配器。
    expect(isAllowedBrowserSpeechEndpoint("http://127.0.0.1:5578/v1")).toBe(true)
    expect(isAllowedBrowserSpeechEndpoint("http://127.0.0.1:5580/v1")).toBe(true)
    expect(isAllowedBrowserSpeechEndpoint("http://127.0.0.1:5583/v1")).toBe(true)
    expect(isAllowedBrowserSpeechEndpoint("http://127.0.0.1:5584/v1")).toBe(true)
    // 换端口即可探测本机其他服务——生产环境拒绝，dev 环境保持开放便于本地调试。
    expect(isAllowedBrowserSpeechEndpoint("http://127.0.0.1:5585/v1")).toBe(false)
    expect(isAllowedBrowserSpeechEndpoint("http://127.0.0.1:9000/v1")).toBe(false)
    expect(isAllowedBrowserSpeechEndpoint("http://localhost:6379/v1")).toBe(false)
    expect(isAllowedBrowserSpeechEndpoint("http://127.0.0.1/v1")).toBe(false)
    expect(isAllowedBrowserSpeechEndpoint("http://127.0.0.1:5583/v1")).toBe(true)

    vi.stubEnv("NODE_ENV", "development")
    expect(isAllowedBrowserSpeechEndpoint("http://127.0.0.1:9000/v1")).toBe(true)
  })

  it("keys rate limits by the requester instead of the request body endpoint", () => {
    const request = new Request("https://moss.local/api/speech/tts", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    })

    expect(speechRateLimitKey(request, "tts", "user-1")).toBe("speech-tts:user-1")
    expect(speechRateLimitKey(request, "asr", null)).toBe("speech-asr:203.0.113.7")
    expect(speechRateLimitKey(new Request("https://moss.local"), "tts-test", null)).toBe(
      "speech-tts-test:unknown",
    )
  })
})

describe("production loopback access control", () => {
  const loopbackEndpoint = {
    endpoint: "http://127.0.0.1:5583/v1",
    apiKey: "local-token",
    model: "local-model",
  }

  function audioFetchMock() {
    return vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    )
  }

  it("rejects an anonymous loopback request in production unless the deployment opts in", async () => {
    vi.stubEnv("NODE_ENV", "production")
    mocks.getSupabaseServerClient.mockResolvedValue(null)

    const rejected = await ttsPost(ttsRequest({ endpoint: loopbackEndpoint, text: "Hello" }))
    expect(rejected.status).toBe(401)
    expect((await rejected.json()).error.code).toBe("speech_unauthorized")

    // 自托管未配置认证服务的部署按部署文档显式 opt-in 后，匿名回环代理恢复可用。
    vi.stubEnv("MOSS_ALLOW_ANONYMOUS_LOOPBACK_SPEECH", "true")
    vi.stubGlobal("fetch", audioFetchMock())
    const allowed = await ttsPost(ttsRequest({ endpoint: loopbackEndpoint, text: "Hello" }))
    expect(allowed.status).toBe(200)
  })

  it("allows a signed-in learner and keeps anonymous users out when auth is configured", async () => {
    vi.stubEnv("NODE_ENV", "production")
    mocks.getSupabaseServerClient.mockResolvedValue(createSupabase(null))
    const anonymous = await ttsPost(ttsRequest({ endpoint: loopbackEndpoint, text: "Hello" }))
    expect(anonymous.status).toBe(401)

    mocks.getSupabaseServerClient.mockResolvedValue(createSupabase("user-1"))
    vi.stubGlobal("fetch", audioFetchMock())
    const ok = await ttsPost(ttsRequest({ endpoint: loopbackEndpoint, text: "Hello" }))
    expect(ok.status).toBe(200)
  })

  it("keeps public HTTPS endpoints available without a session", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("AI_ALLOWED_BROWSER_SPEECH_HOSTS", "speech.example.com")
    mocks.getSupabaseServerClient.mockResolvedValue(createSupabase(null))
    vi.stubGlobal("fetch", audioFetchMock())

    const response = await ttsPost(
      ttsRequest({ endpoint: validEndpoint, text: "Hello", voice: "alloy" }),
    )
    expect(response.status).toBe(200)
  })

  it("rejects loopback proxies to ports outside the rule table", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await ttsPost(
      ttsRequest({
        endpoint: { ...loopbackEndpoint, endpoint: "http://127.0.0.1:9200/v1" },
        text: "Hello",
      }),
    )
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe("invalid_speech_endpoint")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("local ASR and TTS gateway", () => {
  it("proxies both services to a loopback OpenAI-compatible interface", async () => {
    vi.stubEnv("NODE_ENV", "production")
    // 未配置认证服务的自托管部署按文档显式开启匿名回环访问。
    vi.stubEnv("MOSS_ALLOW_ANONYMOUS_LOOPBACK_SPEECH", "true")
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

  it("keeps an unreachable endpoint as 502 while separating credential failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))
    const unreachable = await asrPost(
      asrRequest({ audioBase64: base64("audio"), endpoint: validEndpoint }),
    )
    expect(unreachable.status).toBe(502)
    expect((await unreachable.json()).error.code).toBe("speech_endpoint_unreachable")

    // 上游 401 是凭据问题，不再压成 502；客户端按 401 决定降级并提示原因。
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })))
    const rejected = await asrPost(
      asrRequest({ audioBase64: base64("audio"), endpoint: validEndpoint }),
    )
    expect(rejected.status).toBe(401)
    const rejectedBody = (await rejected.json()) as { error: { code: string; message: string } }
    expect(rejectedBody.error.code).toBe("speech_credentials_invalid")
    expect(rejectedBody.error.message).toContain("401")
    expect(rejectedBody.error.message).toContain("凭据")
  })

  it("surfaces the upstream JSON error code and reason for recognition", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "not_configured",
              message: "尚未配置 FISH_API_KEY，Fish Audio 适配服务不可用。",
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )
    const response = await asrPost(
      asrRequest({ audioBase64: base64("audio"), endpoint: validEndpoint }),
    )
    expect(response.status).toBe(503)
    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe("speech_not_configured")
    expect(body.error.message).toContain("503")
    expect(body.error.message).toContain("not_configured")
    expect(body.error.message).toContain("尚未配置 FISH_API_KEY")
  })

  it("maps adapter quota failures to a payment-required response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "fishaudio_payment_required", message: "余额不足" },
          }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )
    const response = await asrPost(
      asrRequest({ audioBase64: base64("audio"), endpoint: validEndpoint }),
    )
    expect(response.status).toBe(402)
    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe("speech_payment_required")
    expect(body.error.message).toContain("fishaudio_payment_required")
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
