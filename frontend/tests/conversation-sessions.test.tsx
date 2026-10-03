// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react"
import { useReducer } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  conversationRuntimeReducer,
  createConversationRuntimeState,
} from "@/features/conversation/conversation-machine"
import { useConversationSessions } from "@/features/conversation/use-conversation-sessions"
import {
  type ConversationSession,
  conversationHistoryStorageKey,
  getUserConversationHistoryStorageKey,
} from "@/lib/conversation-history"
import { getConversationScene } from "@/lib/conversation-scenes"

const cloud = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  loadHistory: vi.fn(),
  saveSession: vi.fn(),
}))

vi.mock("@/lib/conversation-sync", () => ({
  deleteCloudConversationSession: cloud.deleteSession,
  loadCloudConversationHistory: cloud.loadHistory,
  saveCloudConversationSession: cloud.saveSession,
}))

vi.mock("@/lib/supabase/config", () => ({
  getSupabasePublicConfig: () => ({
    googleAuthEnabled: false,
    publishableKey: "publishable",
    url: "https://example.supabase.co",
  }),
}))

const scene = getConversationScene("coffee")
const cloudSession: ConversationSession = {
  id: "cloud-session",
  sceneId: scene.id,
  sceneTitle: scene.title,
  partnerName: scene.partnerName,
  startedAt: new Date(Date.now() - 120_000).toISOString(),
  updatedAt: new Date(Date.now() - 60_000).toISOString(),
  durationSeconds: 24,
  status: "active",
  messages: [
    {
      id: "opening",
      role: "assistant",
      content: scene.opening.content,
      translation: scene.opening.translation,
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
}

beforeEach(() => {
  window.localStorage.clear()
  cloud.loadHistory.mockReset().mockResolvedValue({
    sessions: [cloudSession],
    userId: "user-1",
  })
  cloud.saveSession.mockReset().mockResolvedValue(true)
  cloud.deleteSession.mockReset().mockResolvedValue(true)
})

describe("useConversationSessions", () => {
  it("restores cloud history and moves storage into the authenticated namespace", async () => {
    const { result, unmount } = renderHook(() => {
      const [runtime, dispatch] = useReducer(
        conversationRuntimeReducer,
        scene,
        createConversationRuntimeState,
      )
      useConversationSessions({
        currentSessionId: runtime.currentSessionId,
        dispatch,
        initialMessages: runtime.messages,
        scene,
      })
      return runtime
    })

    await waitFor(() => expect(result.current.currentSessionId).toBe("cloud-session"))
    expect(result.current.messages[1]?.content).toBe("Could I get a latte?")
    expect(window.localStorage.getItem(conversationHistoryStorageKey)).toBeNull()
    expect(
      window.localStorage.getItem(getUserConversationHistoryStorageKey("user-1")),
    ).toContain("cloud-session")
    unmount()
  })

  it("keeps a local save when the cloud write fails", async () => {
    cloud.loadHistory.mockResolvedValue(null)
    cloud.saveSession.mockRejectedValue(new Error("offline"))

    const { result, unmount } = renderHook(() => {
      const [runtime, dispatch] = useReducer(
        conversationRuntimeReducer,
        scene,
        createConversationRuntimeState,
      )
      const sessions = useConversationSessions({
        currentSessionId: runtime.currentSessionId,
        dispatch,
        initialMessages: runtime.messages,
        scene,
      })
      return { runtime, sessions }
    })

    act(() => {
      result.current.sessions.persistSession([
        ...result.current.runtime.messages,
        {
          id: "question",
          role: "user",
          content: "Could I get a latte?",
          inputMode: "text",
          translation: "",
          note: "",
          timestamp: "00:08",
        },
      ])
    })

    expect(result.current.runtime.history).toHaveLength(1)
    expect(window.localStorage.getItem(conversationHistoryStorageKey)).toContain(
      "Could I get a latte?",
    )
    await waitFor(() => expect(cloud.saveSession).toHaveBeenCalledOnce())
    unmount()
  })

  it("merges delayed cloud history without replacing a locally started session", async () => {
    let resolveCloud:
      | ((value: { sessions: ConversationSession[]; userId: string }) => void)
      | undefined
    cloud.loadHistory.mockReturnValue(
      new Promise((resolve) => {
        resolveCloud = resolve
      }),
    )

    const { result, unmount } = renderHook(() => {
      const [runtime, dispatch] = useReducer(
        conversationRuntimeReducer,
        scene,
        createConversationRuntimeState,
      )
      const sessions = useConversationSessions({
        currentSessionId: runtime.currentSessionId,
        dispatch,
        initialMessages: runtime.messages,
        scene,
      })
      return { runtime, sessions }
    })
    const localSessionId = result.current.runtime.currentSessionId

    act(() => result.current.sessions.markLocalInteraction())
    await act(async () => {
      resolveCloud?.({ sessions: [cloudSession], userId: "user-1" })
    })

    await waitFor(() =>
      expect(result.current.runtime.history).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "cloud-session" })]),
      ),
    )
    expect(result.current.runtime.currentSessionId).toBe(localSessionId)
    expect(result.current.runtime.messages).toHaveLength(1)
    unmount()
  })

  it("completes the previous active session before resuming a history item", async () => {
    cloud.loadHistory.mockResolvedValue(null)
    const activeSession: ConversationSession = {
      ...cloudSession,
      id: "active-session",
      updatedAt: new Date(Date.now() - 30_000).toISOString(),
    }
    const historicalSession: ConversationSession = {
      ...cloudSession,
      id: "historical-session",
      status: "completed",
      updatedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      messages: [
        cloudSession.messages[0],
        {
          ...cloudSession.messages[1],
          id: "historical-question",
          content: "What did I order last time?",
        },
      ],
    }
    window.localStorage.setItem(
      conversationHistoryStorageKey,
      JSON.stringify({
        version: 1,
        sessions: [activeSession, historicalSession],
      }),
    )

    const renderSessions = () =>
      renderHook(() => {
        const [runtime, dispatch] = useReducer(
          conversationRuntimeReducer,
          scene,
          createConversationRuntimeState,
        )
        const sessions = useConversationSessions({
          currentSessionId: runtime.currentSessionId,
          dispatch,
          initialMessages: runtime.messages,
          scene,
        })
        return { runtime, sessions }
      })
    const firstRender = renderSessions()
    const { result } = firstRender

    await waitFor(() => expect(result.current.runtime.currentSessionId).toBe("active-session"))
    act(() => result.current.sessions.restoreSession(historicalSession))

    expect(result.current.runtime.currentSessionId).toBe("historical-session")
    expect(result.current.runtime.messages[1]?.content).toBe("What did I order last time?")
    expect(result.current.runtime.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "active-session", status: "completed" }),
        expect.objectContaining({ id: "historical-session", status: "active" }),
      ]),
    )
    const stored = JSON.parse(
      window.localStorage.getItem(conversationHistoryStorageKey) ?? "{}",
    ) as { sessions: ConversationSession[] }
    expect(stored.sessions[0]?.id).toBe("historical-session")
    expect(stored.sessions.filter((item) => item.status === "active")).toHaveLength(1)
    await waitFor(() => expect(cloud.saveSession).toHaveBeenCalledTimes(2))
    firstRender.unmount()

    const restoredRender = renderSessions()
    await waitFor(() =>
      expect(restoredRender.result.current.runtime.currentSessionId).toBe("historical-session"),
    )
    restoredRender.unmount()
  })
})
