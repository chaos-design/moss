import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
  persistPracticeMemory: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}))

vi.mock("@/lib/memory/server", () => ({
  persistPracticeMemory: mocks.persistPracticeMemory,
}))

import { POST } from "@/app/api/memory-documents/route"
import { resetRateLimitStore } from "@/lib/server/rate-limit"

const reviewMemory = {
  sourceType: "review",
  sourceId: "clarify-trade-off",
  sceneId: "meeting",
  sceneTitle: "项目会议",
  label: "澄清取舍",
  expression: "Could you clarify the trade-off?",
  explanation: "Use clarify before the detail that needs explanation.",
  strength: 68,
  rating: "good",
  successful: true,
}

function createRequest(body: unknown) {
  return new Request("https://moss.local/api/memory-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function createSupabase(
  userId: string | null = "user-1",
  rpc = vi.fn().mockResolvedValue({
    data: [
      {
        limited: false,
        remaining: 59,
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
  vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
  vi.stubEnv("AI_API_KEY", "secret")
  vi.stubEnv("AI_MODEL_NAME", "chat-model")
  vi.stubEnv("AI_EMBEDDING_MODEL", "embedding-model")
  mocks.getSupabaseServerClient.mockReset()
  mocks.persistPracticeMemory.mockReset().mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("POST /api/memory-documents", () => {
  it("rejects malformed learning results before authentication", async () => {
    const response = await POST(createRequest({ ...reviewMemory, strength: 101 }))

    expect(response.status).toBe(400)
    expect(mocks.getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it("requires an authenticated learner", async () => {
    mocks.getSupabaseServerClient.mockResolvedValue(createSupabase(null))

    const response = await POST(createRequest(reviewMemory))

    expect(response.status).toBe(401)
    expect(mocks.persistPracticeMemory).not.toHaveBeenCalled()
  })

  it("degrades without failing when embeddings are not configured", async () => {
    vi.stubEnv("AI_EMBEDDING_MODEL", "")
    mocks.getSupabaseServerClient.mockResolvedValue(createSupabase())

    const response = await POST(createRequest(reviewMemory))

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ data: { stored: false } })
    expect(mocks.persistPracticeMemory).not.toHaveBeenCalled()
  })

  it("persists a validated result for the authenticated user", async () => {
    const supabase = createSupabase()
    mocks.getSupabaseServerClient.mockResolvedValue(supabase)

    const response = await POST(createRequest(reviewMemory))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { stored: true } })
    expect(mocks.persistPracticeMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        client: supabase,
        userId: "user-1",
        memory: reviewMemory,
      }),
    )
  })

  it("fails closed when the shared rate limiter is unavailable", async () => {
    mocks.getSupabaseServerClient.mockResolvedValue(
      createSupabase(
        "user-1",
        vi.fn().mockResolvedValue({
          data: null,
          error: new Error("rate limiter unavailable"),
        }),
      ),
    )

    const response = await POST(createRequest(reviewMemory))

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: { code: "rate_limit_unavailable" },
    })
    expect(mocks.persistPracticeMemory).not.toHaveBeenCalled()
  })
  it("normalizes provider or database failures", async () => {
    mocks.getSupabaseServerClient.mockResolvedValue(createSupabase())
    mocks.getSupabaseServerClient.mockResolvedValue(createSupabase())
    mocks.persistPracticeMemory.mockRejectedValue(new Error("private provider details"))

    const response = await POST(createRequest(reviewMemory))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: {
        code: "memory_persistence_failed",
        message: "长期记忆暂时无法同步，本机学习记录不受影响。",
      },
    })
  })
})
