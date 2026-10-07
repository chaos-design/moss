import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getSupabaseServerClient = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient,
}))

import { POST } from "@/app/api/translation/route"
import { getModelConfigPublicKey } from "@/lib/model-config-crypto"
import {
  encryptModelConfigWithKey,
  type ModelConfigEnvelope,
} from "@/lib/model-config-envelope"
import { resetRateLimitStore } from "@/lib/server/rate-limit"

function createRequest(
  text = "How can I help you?",
  modelConfigEnvelope?: ModelConfigEnvelope,
) {
  return new Request("https://moss.local/api/translation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, modelConfigEnvelope }),
  })
}

function createSupabase(
  userId: string | null,
  rpc = vi.fn().mockResolvedValue({
    data: [
      {
        limited: false,
        remaining: 29,
        reset_at: "2026-08-29T08:01:00.000Z",
      },
    ],
    error: null,
  }),
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
    rpc,
  }
}

beforeEach(() => {
  resetRateLimitStore()
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "")
  vi.stubEnv("AI_BASE_URL", "")
  vi.stubEnv("AI_API_KEY", "")
  vi.stubEnv("AI_MODEL_NAME", "")
  getSupabaseServerClient.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("POST /api/translation", () => {
  it("rejects malformed, empty, and oversized input", async () => {
    const malformed = await POST(
      new Request("https://moss.local/api/translation", {
        method: "POST",
        body: "{broken",
      }),
    )
    const empty = await POST(createRequest(""))
    const oversized = await POST(createRequest("a".repeat(4_001)))

    expect(malformed.status).toBe(400)
    expect(empty.status).toBe(400)
    expect(oversized.status).toBe(400)
  })

  it("rejects unauthenticated translation requests", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase(null))

    const response = await POST(createRequest())

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      error: { code: "unauthorized" },
    })
  })

  it("supports local demo mode without calling an external provider", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(createRequest())

    expect(response.status).toBe(200)
    expect((await response.json()).data.translation).toContain("演示翻译")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("enforces the translation request rate limit", async () => {
    let requests = 0
    const rpc = vi.fn().mockImplementation(async () => {
      requests += 1
      return {
        data: [
          {
            limited: requests > 30,
            remaining: Math.max(30 - requests, 0),
            reset_at: "2026-08-29T08:01:00.000Z",
          },
        ],
        error: null,
      }
    })
    getSupabaseServerClient.mockResolvedValue(createSupabase("rate-limited-user", rpc))
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_API_KEY", "secret")
    vi.stubEnv("AI_MODEL_NAME", "model")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ choices: [{ message: { content: "翻译" } }] }), {
            status: 200,
          }),
        ),
      ),
    )

    const responses = await Promise.all(Array.from({ length: 31 }, () => POST(createRequest())))

    expect(responses.slice(0, 30).every((response) => response.status === 200)).toBe(true)
    expect(responses[30]?.status).toBe(429)
    expect(await responses[30]?.json()).toMatchObject({
      error: { code: "rate_limited" },
    })
    expect(rpc).toHaveBeenCalledTimes(31)
  })

  it("fails closed when the shared rate limiter is unavailable", async () => {
    getSupabaseServerClient.mockResolvedValue(
      createSupabase(
        "user-1",
        vi.fn().mockResolvedValue({
          data: null,
          error: new Error("rate limiter unavailable"),
        }),
      ),
    )
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(createRequest())

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: { code: "rate_limit_unavailable" },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("uses bounded local limiting for encrypted browser model config", async () => {
    getSupabaseServerClient.mockResolvedValue(
      createSupabase(
        "user-1",
        vi.fn().mockResolvedValue({
          data: null,
          error: new Error("rate limiter unavailable"),
        }),
      ),
    )
    const envelope = await encryptModelConfigWithKey(
      {
        apiKey: "browser-secret",
        baseUrl: "https://api.example.com/v1",
        model: "example-model",
        apiType: "chat-completions",
      },
      getModelConfigPublicKey(),
    )
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "翻译" } }] }), {
          status: 200,
        }),
      ),
    )

    const response = await POST(createRequest("Translate me.", envelope))

    expect(response.status).toBe(200)
    expect((await response.json()).data.translation).toBe("翻译")
  })

  it("returns a plain-text translation for an authenticated user", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase("user-1"))
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_API_KEY", "secret")
    vi.stubEnv("AI_MODEL_NAME", "model")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "**我能为你做些什么？**" } }],
          }),
          { status: 200 },
        ),
      ),
    )

    const response = await POST(createRequest())

    expect(response.status).toBe(200)
    expect((await response.json()).data.translation).toBe("我能为你做些什么？")
  })

  it("does not expose provider failure details to the client", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase("user-1"))
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_API_KEY", "secret")
    vi.stubEnv("AI_MODEL_NAME", "model")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })))

    const response = await POST(createRequest())

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: {
        code: "provider_unavailable",
        message: "翻译服务暂时不可用，请稍后重试。",
      },
    })
  })

  it("reports an upstream provider rate limit instead of an outage", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase("user-1"))
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_API_KEY", "secret")
    vi.stubEnv("AI_MODEL_NAME", "model")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })))

    const response = await POST(createRequest())

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({
      error: {
        code: "provider_rate_limited",
        message: "模型服务请求过于频繁，请稍后再试。",
      },
    })
  })
})
