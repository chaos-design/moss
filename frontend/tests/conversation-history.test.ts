// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest"
import {
  type ConversationSession,
  conversationHistoryStorageKey,
  conversationSceneStorageKey,
  findResumableConversationSession,
  getUserConversationHistoryStorageKey,
  mergeConversationHistories,
  parseConversationHistory,
  readLastConversationScene,
  removeConversationSession,
  saveConversationSession,
  saveLastConversationScene,
} from "@/lib/conversation-history"

function createSession(id: string, updatedAt: string): ConversationSession {
  return {
    id,
    sceneId: "coffee",
    sceneTitle: "咖啡店点单",
    partnerName: "Emma",
    startedAt: "2026-08-25T08:00:00.000Z",
    updatedAt,
    durationSeconds: 42,
    status: "active",
    messages: [
      {
        id: `${id}-opening`,
        role: "assistant",
        content: "What can I get for you?",
        translation: "您想要点什么？",
        note: "",
        timestamp: "00:00",
      },
      {
        id: `${id}-user`,
        role: "user",
        content: "Could I get a latte?",
        inputMode: "voice",
        translation: "",
        note: "",
        timestamp: "00:08",
      },
    ],
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe("conversation history", () => {
  it("persists complete sessions and keeps the newest update first", () => {
    const older = createSession("older", "2026-08-25T08:10:00.000Z")
    const newer = createSession("newer", "2026-08-25T09:10:00.000Z")

    const sessions = saveConversationSession(saveConversationSession([], older), newer)
    const stored = parseConversationHistory(
      window.localStorage.getItem(conversationHistoryStorageKey),
    )

    expect(sessions.map((session) => session.id)).toEqual(["newer", "older"])
    expect(stored[0]?.messages[1]).toMatchObject({
      content: "Could I get a latte?",
      inputMode: "voice",
    })
  })

  it("keeps every local session instead of silently truncating older history", () => {
    const history = Array.from({ length: 30 }, (_, index) =>
      createSession(
        `session-${index}`,
        new Date(Date.UTC(2026, 7, 25, 8, index)).toISOString(),
      ),
    )

    const sessions = history.reduce(
      (current, session) => saveConversationSession(current, session),
      [] as ConversationSession[],
    )
    const stored = parseConversationHistory(
      window.localStorage.getItem(conversationHistoryStorageKey),
    )
    const merged = mergeConversationHistories(sessions.slice(0, 15), sessions.slice(15))

    expect(sessions).toHaveLength(30)
    expect(stored).toHaveLength(30)
    expect(merged).toHaveLength(30)
    expect(stored.at(-1)?.id).toBe("session-0")
  })

  it("updates a session by identity and supports removal", () => {
    const initial = createSession("session", "2026-08-25T08:10:00.000Z")
    const updated = {
      ...initial,
      updatedAt: "2026-08-25T08:20:00.000Z",
      durationSeconds: 60,
    }

    const sessions = saveConversationSession(saveConversationSession([], initial), updated)
    const remaining = removeConversationSession(sessions, "session")

    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.durationSeconds).toBe(60)
    expect(remaining).toEqual([])
  })

  it("ignores invalid or incompatible stored values", () => {
    expect(parseConversationHistory("{broken")).toEqual([])
    expect(parseConversationHistory(JSON.stringify({ version: 2, sessions: [] }))).toEqual([])
  })

  it("migrates legacy sessions to active status", () => {
    const { status: _status, ...legacy } = createSession("legacy", "2026-08-25T08:10:00.000Z")

    expect(
      parseConversationHistory(JSON.stringify({ version: 1, sessions: [legacy] }))[0]?.status,
    ).toBe("active")
  })

  it("resumes the latest session only within the thirty-minute window", () => {
    const recent = createSession("recent", "2026-08-25T09:45:00.000Z")
    const stale = createSession("stale", "2026-08-25T09:29:59.000Z")
    const currentTime = new Date("2026-08-25T10:00:00.000Z")

    expect(findResumableConversationSession([stale, recent], "coffee", currentTime)?.id).toBe(
      "recent",
    )
    expect(findResumableConversationSession([stale], "coffee", currentTime)).toBeUndefined()
    expect(
      findResumableConversationSession([stale], "coffee", currentTime, 45 * 60 * 1000)?.id,
    ).toBe("stale")
  })

  it("does not automatically resume completed sessions", () => {
    const completed = {
      ...createSession("completed", "2026-08-25T09:55:00.000Z"),
      status: "completed" as const,
    }

    expect(
      findResumableConversationSession(
        [completed],
        "coffee",
        new Date("2026-08-25T10:00:00.000Z"),
      ),
    ).toBeUndefined()
  })

  it("merges local and cloud history by the latest session update", () => {
    const local = createSession("shared", "2026-08-25T09:40:00.000Z")
    const cloud = {
      ...createSession("shared", "2026-08-25T09:50:00.000Z"),
      durationSeconds: 90,
    }

    expect(mergeConversationHistories([local], [cloud])).toEqual([cloud])
    expect(getUserConversationHistoryStorageKey("user-1")).toBe(
      `${conversationHistoryStorageKey}:user-1`,
    )
  })

  it("persists the last selected scene and falls back to recent history", () => {
    const recent = createSession("recent", "2026-08-25T09:45:00.000Z")

    expect(readLastConversationScene([recent])).toBe("coffee")
    saveLastConversationScene("meeting")
    expect(window.localStorage.getItem(conversationSceneStorageKey)).toBe("meeting")
    expect(readLastConversationScene([recent])).toBe("meeting")
  })
})
