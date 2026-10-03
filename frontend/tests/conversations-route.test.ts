import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteConversationSession: vi.fn(),
  getSupabaseServerClient: vi.fn(),
  listConversationSessions: vi.fn(),
  upsertConversationSession: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}))

vi.mock("@/lib/server/conversation-repository", () => ({
  conversationHistoryPageSize: 50,
  deleteConversationSession: mocks.deleteConversationSession,
  listConversationSessions: mocks.listConversationSessions,
  upsertConversationSession: mocks.upsertConversationSession,
}))

import { DELETE, GET, PUT } from "@/app/api/conversations/route"
import { resetRateLimitStore } from "@/lib/server/rate-limit"

const session = {
  id: "coffee-session-1",
  sceneId: "coffee",
  sceneTitle: "咖啡店点单",
  partnerName: "Mia",
  startedAt: "2026-08-28T08:00:00.000Z",
  updatedAt: "2026-08-28T08:05:00.000Z",
  durationSeconds: 42,
  status: "active",
  messages: [
    {
      id: "opening",
      role: "assistant",
      content: "What can I get for you?",
      translation: "您想要点什么？",
      note: "",
      timestamp: "00:00",
    },
    {
      id: "question",
      role: "user",
      content: "Could I get a latte?",
      inputMode: "text",
      translation: "",
      note: "",
      timestamp: "00:08",
    },
  ],
} as const

function createSupabase(
  userId: string | null = "user-1",
  rpc = vi.fn().mockResolvedValue({
    data: [
      {
        limited: false,
        remaining: 119,
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
  mocks.getSupabaseServerClient.mockReset().mockResolvedValue(createSupabase())
  mocks.listConversationSessions.mockReset().mockResolvedValue({
    nextOffset: null,
    sessions: [session],
  })
  mocks.upsertConversationSession.mockReset().mockResolvedValue(undefined)
  mocks.deleteConversationSession.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("/api/conversations", () => {
  it("returns authenticated cloud history", async () => {
    const response = await GET(new Request("https://moss.local/api/conversations"))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: { nextCursor: null, sessions: [session], userId: "user-1" },
    })
    expect(mocks.listConversationSessions).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, pageSize: 50, userId: "user-1" }),
    )
  })

  it("passes a validated pagination cursor to the repository", async () => {
    mocks.listConversationSessions.mockResolvedValue({
      nextOffset: 100,
      sessions: [session],
    })

    const response = await GET(new Request("https://moss.local/api/conversations?cursor=50"))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { nextCursor: "100" },
    })
    expect(mocks.listConversationSessions).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 50 }),
    )
  })

  it("rejects malformed pagination cursors before authentication", async () => {
    const response = await GET(
      new Request("https://moss.local/api/conversations?cursor=not-a-number"),
    )

    expect(response.status).toBe(400)
    expect(mocks.getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it("upserts a validated session for the authenticated user", async () => {
    const response = await PUT(
      new Request("https://moss.local/api/conversations", {
        method: "PUT",
        body: JSON.stringify(session),
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.upsertConversationSession).toHaveBeenCalledWith(
      expect.objectContaining({ session, userId: "user-1" }),
    )
  })

  it("rejects malformed sessions before authentication", async () => {
    const response = await PUT(
      new Request("https://moss.local/api/conversations", {
        method: "PUT",
        body: JSON.stringify({ ...session, messages: "invalid" }),
      }),
    )

    expect(response.status).toBe(400)
    expect(mocks.getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it("deletes only the authenticated user's session identity", async () => {
    const response = await DELETE(
      new Request("https://moss.local/api/conversations?sessionId=coffee-session-1", {
        method: "DELETE",
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.deleteConversationSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "coffee-session-1",
        userId: "user-1",
      }),
    )
  })

  it("requires authentication", async () => {
    mocks.getSupabaseServerClient.mockResolvedValue(createSupabase(null))

    expect((await GET(new Request("https://moss.local/api/conversations"))).status).toBe(401)
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

    const response = await GET(new Request("https://moss.local/api/conversations"))

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: { code: "rate_limit_unavailable" },
    })
    expect(mocks.listConversationSessions).not.toHaveBeenCalled()
  })
})
