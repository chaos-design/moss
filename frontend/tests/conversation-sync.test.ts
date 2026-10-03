import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ConversationSession } from "@/lib/conversation-history"
import {
  deleteCloudConversationSession,
  loadCloudConversationHistory,
  saveCloudConversationSession,
} from "@/lib/conversation-sync"

const session: ConversationSession = {
  id: "coffee-session-1",
  sceneId: "coffee",
  sceneTitle: "咖啡店点单",
  partnerName: "Mia",
  startedAt: "2026-08-28T08:00:00.000Z",
  updatedAt: "2026-08-28T08:05:00.000Z",
  durationSeconds: 42,
  status: "active",
  messages: [],
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("conversation cloud sync", () => {
  it("loads sessions and the authenticated user identity", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { nextCursor: null, sessions: [session], userId: "user-1" },
        }),
      ),
    )

    await expect(loadCloudConversationHistory()).resolves.toEqual({
      sessions: [session],
      userId: "user-1",
    })
  })

  it("loads every cloud history page without imposing a client-side total limit", async () => {
    const olderSession = {
      ...session,
      id: "coffee-session-older",
      updatedAt: "2026-08-27T08:05:00.000Z",
    }
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { nextCursor: "50", sessions: [session], userId: "user-1" },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { nextCursor: null, sessions: [olderSession], userId: "user-1" },
          }),
        ),
      )

    await expect(loadCloudConversationHistory()).resolves.toEqual({
      sessions: [session, olderSession],
      userId: "user-1",
    })
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/conversations",
      "/api/conversations?cursor=50",
    ])
  })

  it("rejects a repeated cloud cursor instead of looping forever", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { nextCursor: "50", sessions: [session], userId: "user-1" },
        }),
      ),
    )

    await expect(loadCloudConversationHistory()).rejects.toThrow("invalid response")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("saves and deletes by stable client session identity", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: {} })))

    await expect(saveCloudConversationSession(session)).resolves.toBe(true)
    await expect(deleteCloudConversationSession(session.id)).resolves.toBe(true)

    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/conversations",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(session),
      }),
    ])
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/conversations?sessionId=coffee-session-1",
      { method: "DELETE" },
    ])
  })

  it("degrades for signed-out or unconfigured sessions", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))

    await expect(loadCloudConversationHistory()).resolves.toBeNull()
    await expect(saveCloudConversationSession(session)).resolves.toBe(false)
    await expect(deleteCloudConversationSession(session.id)).resolves.toBe(false)
  })

  it("serializes writes for one session so completion cannot be overwritten", async () => {
    let resolveFirst: ((response: Response) => void) | undefined
    fetchMock
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFirst = resolve
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} })))

    const activeWrite = saveCloudConversationSession({ ...session, status: "active" })
    const completedWrite = saveCloudConversationSession({
      ...session,
      status: "completed",
      updatedAt: "2026-08-28T08:06:00.000Z",
    })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    resolveFirst?.(new Response(JSON.stringify({ data: {} })))
    await activeWrite
    await completedWrite

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).status).toBe("completed")
  })

  it("surfaces retryable server failures to the caller", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }))

    await expect(loadCloudConversationHistory()).rejects.toThrow("unavailable")
    await expect(saveCloudConversationSession(session)).rejects.toThrow("could not be saved")
    await expect(deleteCloudConversationSession(session.id)).rejects.toThrow(
      "could not be deleted",
    )
  })
})
