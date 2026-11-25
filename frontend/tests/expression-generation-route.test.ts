import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getSupabaseServerClient = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient,
}))

import { POST } from "@/app/api/expressions/generate/route"
import { getModelConfigPublicKey } from "@/lib/model-config-crypto"
import {
  encryptModelConfigWithKey,
  type ModelConfigEnvelope,
} from "@/lib/model-config-envelope"
import { resetRateLimitStore } from "@/lib/server/rate-limit"

const generatedItem = {
  phrase: "keep an eye on",
  meaning: "留意；照看",
  why: "eye 代表观察，keep 表示持续维持注意。",
  origin: "由视觉动作形成的常用表达。",
  example: "Could you keep an eye on my bag?",
  exampleTranslation: "能帮我看一下包吗？",
  sceneCategory: "social",
  context: "通用",
  kind: "idiom",
  usage: "常接宾语。",
  memoryTip: "想象眼睛停在目标上。",
  examples: [{ text: "Keep an eye on the kids.", translation: "照看一下孩子。" }],
}

function createRequest(
  phrases: unknown = ["keep an eye on"],
  modelConfigEnvelope?: ModelConfigEnvelope,
) {
  return new Request("https://moss.local/api/expressions/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phrases, modelConfigEnvelope }),
  })
}

function createSupabase(userId: string | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
  }
}

function mockProvider(content: string) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
    )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
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

describe("POST /api/expressions/generate", () => {
  it("rejects malformed and empty phrase input", async () => {
    const malformed = await POST(
      new Request("https://moss.local/api/expressions/generate", {
        method: "POST",
        body: "{broken",
      }),
    )
    const empty = await POST(createRequest([]))
    const oversized = await POST(createRequest([{ phrase: "keep an eye on" }]))

    expect(malformed.status).toBe(400)
    expect(empty.status).toBe(400)
    expect(oversized.status).toBe(400)
  })

  it("returns structured demo items without calling a provider", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(createRequest(["call it a day"]))

    expect(response.status).toBe(200)
    expect((await response.json()).data.items[0]).toMatchObject({
      phrase: "call it a day",
      exampleTranslation: expect.any(String),
      examples: expect.any(Array),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("requires login when no browser model config is supplied", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase(null))

    const response = await POST(createRequest())

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } })
  })

  it("generates import-ready items with an encrypted browser model config", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase(null))
    const envelope = await encryptModelConfigWithKey(
      {
        apiKey: "browser-secret",
        baseUrl: "https://api.example.com/v1",
        model: "example-model",
        apiType: "chat-completions",
      },
      getModelConfigPublicKey(),
    )
    const fetchMock = mockProvider(JSON.stringify([generatedItem]))

    const response = await POST(createRequest(["keep an eye on"], envelope))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data.items[0]).toMatchObject({
      phrase: "keep an eye on",
      usage: "常接宾语。",
      memoryTip: "想象眼睛停在目标上。",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not expose provider failure details", async () => {
    getSupabaseServerClient.mockResolvedValue(createSupabase(null))
    const envelope = await encryptModelConfigWithKey(
      {
        apiKey: "browser-secret",
        baseUrl: "https://api.example.com/v1",
        model: "example-model",
        apiType: "chat-completions",
      },
      getModelConfigPublicKey(),
    )
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })))

    const response = await POST(createRequest(["keep an eye on"], envelope))

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({
      error: { code: "provider_unavailable" },
    })
  })
})
