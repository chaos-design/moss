import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getSupabaseServerClient = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient,
}))

import { getUnansweredUserInputs, POST, PUT } from "@/app/api/conversation/route"
import { getModelConfigPublicKey } from "@/lib/model-config-crypto"
import { encryptModelConfigWithKey } from "@/lib/model-config-envelope"
import { isAllowedBrowserModelEndpoint } from "@/lib/server/browser-model-config"
import { resetRateLimitStore } from "@/lib/server/rate-limit"

async function encryptModelConfig(config: {
  apiKey: string
  baseUrl: string
  model: string
  apiType: "anthropic-messages" | "chat-completions" | "custom"
}) {
  return encryptModelConfigWithKey(config, getModelConfigPublicKey())
}

function createConversationRequest(
  sceneId = "coffee",
  memory?: Array<{
    id: string
    label: string
    expression: string
    source: string
    guidance: string
    strength: number
  }>,
) {
  return new Request("https://moss.local/api/conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sceneId,
      language: "bilingual",
      tutorMode: "coach",
      memory,
      messages: [{ role: "user", content: "A latte, please." }],
    }),
  })
}

function createSupabase(
  userId: string | null,
  rpc = vi.fn().mockResolvedValue({
    data: [
      {
        limited: false,
        remaining: 19,
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
  vi.stubEnv("AI_API_TYPE", "")
  vi.stubEnv("AI_ALLOWED_BROWSER_MODEL_HOSTS", "")
  vi.stubEnv("AI_MODEL_NAME", "")
  vi.stubEnv("AI_MODEL", "")
  getSupabaseServerClient.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("POST /api/conversation authentication", () => {
  it("collects every consecutive unanswered learner message in order", () => {
    expect(
      getUnansweredUserInputs([
        { role: "user", content: "old question" },
        { role: "assistant", content: "old answer" },
        { role: "user", content: "What does trade mean?" },
        { role: "user", content: "When should I use it?" },
      ]),
    ).toEqual(["What does trade mean?", "When should I use it?"])
  })

  it("rejects plaintext model configuration fields", async () => {
    getSupabaseServerClient.mockResolvedValue(null)
    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          messages: [{ role: "user", content: "A latte, please." }],
          modelConfig: {
            apiKey: "must-not-appear",
            baseUrl: "https://api.example.com/v1",
            model: "example-model",
            apiType: "chat-completions",
          },
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } })
  })

  it("rejects unsupported tutor modes", async () => {
    getSupabaseServerClient.mockResolvedValue(null)
    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          tutorMode: "strict",
          messages: [{ role: "user", content: "A latte, please." }],
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } })
  })

  it("rejects an oversized prompt supplement", async () => {
    getSupabaseServerClient.mockResolvedValue(null)
    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          messages: [{ role: "user", content: "A latte, please." }],
          promptSupplement: "x".repeat(4_001),
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } })
  })

  it("rejects a non-string prompt supplement", async () => {
    getSupabaseServerClient.mockResolvedValue(null)
    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          messages: [{ role: "user", content: "A latte, please." }],
          promptSupplement: { hijack: true },
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } })
  })

  it("asks the client to refresh an expired encryption key", async () => {
    getSupabaseServerClient.mockResolvedValue(null)
    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          messages: [{ role: "user", content: "A latte, please." }],
          modelConfigEnvelope: {
            version: 1,
            keyId: "expired-key",
            wrappedKey: "wrapped",
            iv: "initialization-vector",
            ciphertext: "encrypted-model-config",
          },
        }),
      }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: { code: "model_config_key_expired" },
    })
  })

  it("validates a browser model through the encrypted same-origin route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
        status: 200,
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const response = await PUT(
      new Request("https://moss.local/api/conversation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelConfigEnvelope: await encryptModelConfig({
            apiKey: "browser-secret",
            baseUrl: "https://api.example.com/v1",
            model: "example-model",
            apiType: "chat-completions",
          }),
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { valid: true } })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer browser-secret" }),
        redirect: "error",
      }),
    )
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      max_tokens: 128,
      messages: [{ role: "user", content: "Reply with OK." }],
    })
  })

  it("restricts browser-provided model hosts in production", () => {
    vi.stubEnv("NODE_ENV", "production")

    expect(isAllowedBrowserModelEndpoint("https://api.openai.com/v1")).toBe(true)
    expect(isAllowedBrowserModelEndpoint("https://custom.example.com/v1")).toBe(false)

    vi.stubEnv("AI_ALLOWED_BROWSER_MODEL_HOSTS", "custom.example.com")
    expect(isAllowedBrowserModelEndpoint("https://custom.example.com/v1")).toBe(true)
  })

  it("fails closed when Supabase is unavailable", async () => {
    getSupabaseServerClient.mockResolvedValue(null)

    const response = await POST(createConversationRequest())

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: { code: "service_not_configured" },
    })
  })

  it("rejects unauthenticated requests", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase(null))

    const response = await POST(createConversationRequest())

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      error: { code: "unauthorized" },
    })
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

    const response = await POST(createConversationRequest())

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: { code: "rate_limit_unavailable" },
    })
  })

  it("keeps explicit demo mode local and does not call the provider", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_API_KEY", "secret")
    vi.stubEnv("AI_MODEL_NAME", "model")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(createConversationRequest("meeting"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.source).toBe("demo")
    expect(body.data.content).toContain("extra week")
    expect(body.data.validation).toMatchObject({
      status: "accurate",
      corrected: "A latte, please.",
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it("removes Chinese support from immersive English demo replies", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")
    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          tutorMode: "english",
          memory: [
            {
              id: "polite-request",
              label: "礼貌提出请求",
              expression: "Could I get ..., please?",
              source: "餐厅用餐",
              guidance: "迁移到咖啡店",
              strength: 48,
            },
          ],
          messages: [{ role: "user", content: "I want a latte." }],
        }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.content).toContain("hot or iced")
    expect(body.data.translation).toBe("")
    expect(body.data.recall).toBe(
      "Recall Could I get..., please? and reuse it in this turn before asking for a hint.",
    )
    expect(body.data.recall).not.toMatch(/[\u3400-\u9fff]/)
    expect(body.data.validation.explanation).toBe("")
    expect(body.data.validation.examples).toEqual([
      expect.objectContaining({ chinese: "" }),
      expect.objectContaining({ chinese: "" }),
      expect.objectContaining({ chinese: "" }),
    ])
  })

  it("recognizes mixed and Chinese translation requests without marking them as errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")
    const inputs = [
      {
        content: "could you teach me how to say 我想打球",
        language: "mixed",
      },
      {
        content: "我想打球怎么说",
        language: "chinese",
      },
    ] as const

    for (const input of inputs) {
      const request = new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          messages: [{ role: "user", content: input.content }],
        }),
      })
      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.data).toMatchObject({
        content: "I want to play basketball.",
        inputAnalysis: {
          language: input.language,
          intent: "translation_request",
        },
        validation: {
          status: "guidance",
          corrected: "I want to play basketball.",
          issues: [],
        },
      })
      expect(body.data.validation.examples).toHaveLength(3)
    }
  })

  it("accepts separated short-term and long-term memory", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")
    const request = new Request("https://moss.local/api/conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sceneId: "coffee",
        language: "bilingual",
        memory: {
          shortTerm: {
            sceneId: "coffee",
            activeGoal: "完成礼貌点单",
            turnCount: 2,
            recentUserInputs: ["A latte, please."],
          },
          longTerm: [
            {
              id: "polite-request",
              label: "礼貌请求",
              expression: "Could I get ..., please?",
              source: "餐厅用餐",
              guidance: "迁移到咖啡店",
              strength: 48,
            },
          ],
        },
        messages: [{ role: "user", content: "A latte, please." }],
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.recall).toContain("餐厅用餐")
    expect(body.data.recall).toContain("Could I get ..., please?")
  })

  it("uses the authenticated user and configured provider", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase("user-1"))
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_API_KEY", "secret")
    vi.stubEnv("AI_MODEL_NAME", "model")
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "What size would you like?",
                  translation: "你想要多大杯？",
                  recall: "继续使用礼貌请求。",
                  validation: {
                    status: "accurate",
                    corrected: "A latte, please.",
                    explanation: "表达自然。",
                  },
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      createConversationRequest("coffee", [
        {
          id: "polite-request",
          label: "礼貌提出请求",
          expression: "Could I get ..., please?",
          source: "餐厅用餐",
          guidance: "迁移到咖啡店",
          strength: 48,
        },
      ]),
    )
    const responseBody = await response.json()

    expect(response.status).toBe(200)
    expect(responseBody.data.validation.status).toBe("accurate")
    expect(fetchMock).toHaveBeenCalledOnce()
    const providerRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(providerRequest).toMatchObject({
      model: "model",
      max_tokens: 1200,
    })
    expect(providerRequest.messages[0].content).toContain("Do not use Markdown")
    expect(providerRequest.messages[0].content).toContain(
      "The reply field must contain English only",
    )
    expect(providerRequest.messages[0].content).toContain(
      "answer every question once in a single response",
    )
    expect(providerRequest.messages[0].content).toContain(
      "Coach gently after responding to meaning.",
    )
    expect(providerRequest.messages[0].content).toContain("餐厅用餐")
    expect(providerRequest.messages[0].content).toContain("Could I get ..., please?")
  })

  it("retries once when reasoning exhausts the visible response budget", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase("user-1"))
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_API_KEY", "secret")
    vi.stubEnv("AI_MODEL_NAME", "reasoning-model")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "length",
                message: {
                  content: "",
                  reasoning_content: "internal reasoning",
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    reply: "Certainly. Would you like room for milk?",
                    translation: "当然。需要留出加奶的空间吗？",
                    validation: {
                      status: "accurate",
                      corrected: "A latte, please.",
                      explanation: "表达自然。",
                    },
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(createConversationRequest())
    const body = await response.json()
    const retryRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))

    expect(response.status).toBe(200)
    expect(body.data.content).toBe("Certainly. Would you like room for milk?")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(retryRequest.max_tokens).toBe(4096)
  })

  it("supports Anthropic Messages API fields", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase("user-1"))
    vi.stubEnv("AI_BASE_URL", "https://api.anthropic.com/v1")
    vi.stubEnv("AI_API_KEY", "secret")
    vi.stubEnv("AI_MODEL_NAME", "claude-sonnet")
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                reply: "Would you like anything else?",
                translation: "还需要别的吗？",
                validation: {
                  status: "accurate",
                  corrected: "A latte, please.",
                  explanation: "表达自然。",
                  issues: [],
                  examples: [],
                },
              }),
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "bilingual",
          messages: [
            { role: "assistant", content: "Welcome in. What would you like today?" },
            { role: "user", content: "A latte, please." },
          ],
        }),
      }),
    )
    const responseBody = await response.json()

    expect(response.status).toBe(200)
    expect(responseBody.data.content).toBe("Would you like anything else?")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        headers: expect.objectContaining({
          "anthropic-version": "2023-06-01",
          "x-api-key": "secret",
        }),
      }),
    )
    const providerRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(providerRequest).toMatchObject({
      model: "claude-sonnet",
      max_tokens: 1200,
    })
    expect(providerRequest.system[0]).toMatchObject({
      type: "text",
      cache_control: { type: "ephemeral" },
    })
    expect(providerRequest.system[0].text).toContain(
      "The reply field must contain English only",
    )
    expect(providerRequest.system[1].text).toContain("## Runtime Context")
    expect(providerRequest.messages).toEqual([{ role: "user", content: "A latte, please." }])
  })

  it("uses the browser model config without requiring a Supabase login", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase(null))
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "Sure. What size would you like?",
                  translation: "好的。要多大杯？",
                  validation: {
                    status: "accurate",
                    corrected: "A latte, please.",
                    explanation: "表达自然。",
                  },
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          messages: [{ role: "user", content: "A latte, please." }],
          modelConfigEnvelope: await encryptModelConfig({
            apiKey: "browser-secret",
            baseUrl: "https://byo.example.com/v1",
            model: "byo-model",
            apiType: "chat-completions",
          }),
        }),
      }),
    )
    const responseBody = await response.json()

    expect(response.status).toBe(200)
    expect(responseBody.data.content).toBe("Sure. What size would you like?")
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://byo.example.com/v1/chat/completions")
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer browser-secret",
    })
    const providerRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(providerRequest.model).toBe("byo-model")
  })

  it("keeps authenticated BYOK available when the shared limiter is unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42804", message: "rate limiter unavailable" },
    })
    getSupabaseServerClient.mockResolvedValue(createSupabase("user-1", rpc))
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "Sure. What size would you like?",
                  translation: "好的。要多大杯？",
                  validation: {
                    status: "accurate",
                    corrected: "A latte, please.",
                    explanation: "表达自然。",
                  },
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          messages: [{ role: "user", content: "A latte, please." }],
          modelConfigEnvelope: await encryptModelConfig({
            apiKey: "browser-secret",
            baseUrl: "https://byo.example.com/v1",
            model: "byo-model",
            apiType: "chat-completions",
          }),
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_bucket: "conversation-generate",
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://byo.example.com/v1/chat/completions",
      expect.anything(),
    )
  })

  it("uses a custom model endpoint as the complete request URL", async () => {
    getSupabaseServerClient.mockResolvedValue(null)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "What would you like?",
                  validation: { status: "accurate", corrected: "Hello." },
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          messages: [{ role: "user", content: "Hello." }],
          modelConfigEnvelope: await encryptModelConfig({
            apiKey: "browser-secret",
            baseUrl: "https://byo.example.com/inference",
            model: "custom-model",
            apiType: "custom",
          }),
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://byo.example.com/inference")
  })

  it("runs the browser model config even when Supabase auth is unavailable", async () => {
    getSupabaseServerClient.mockResolvedValue(null)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                reply: "Anything else?",
                validation: { status: "accurate", corrected: "A latte, please." },
              }),
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          messages: [{ role: "user", content: "A latte, please." }],
          modelConfigEnvelope: await encryptModelConfig({
            apiKey: "browser-secret",
            baseUrl: "https://api.anthropic.com/v1",
            model: "claude-byo",
            apiType: "anthropic-messages",
          }),
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-api-key": "browser-secret" }),
      }),
    )
  })

  it("rejects an insecure browser model config endpoint", async () => {
    getSupabaseServerClient.mockResolvedValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          messages: [{ role: "user", content: "A latte, please." }],
          modelConfigEnvelope: await encryptModelConfig({
            apiKey: "browser-secret",
            baseUrl: "http://169.254.169.254/v1",
            model: "byo-model",
            apiType: "chat-completions",
          }),
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "invalid_model_config" } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("enforces the conversation request rate limit", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")

    const responses = await Promise.all(
      Array.from({ length: 21 }, () => POST(createConversationRequest())),
    )

    expect(responses.slice(0, 20).every((response) => response.status === 200)).toBe(true)
    expect(responses[20]?.status).toBe(429)
    expect(await responses[20]?.json()).toMatchObject({
      error: { code: "rate_limited" },
    })
  })

  it("rejects HTTPS browser model config endpoints on private networks", async () => {
    vi.stubEnv("NODE_ENV", "production")
    getSupabaseServerClient.mockResolvedValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      new Request("https://moss.local/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: "coffee",
          language: "auto",
          messages: [{ role: "user", content: "A latte, please." }],
          modelConfigEnvelope: await encryptModelConfig({
            apiKey: "browser-secret",
            baseUrl: "https://127.0.0.1/v1",
            model: "byo-model",
            apiType: "chat-completions",
          }),
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "invalid_model_config" } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not expose provider failure details to the client", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase("user-1"))
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_API_KEY", "secret")
    vi.stubEnv("AI_MODEL_NAME", "model")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })))

    const response = await POST(createConversationRequest())

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: {
        code: "provider_unavailable",
        message: "AI 服务暂时不可用，请稍后重试。",
      },
    })
  })
})
