import { describe, expect, it } from "vitest"
import {
  type ConversationMessage,
  conversationRuntimeReducer,
  createConversationRuntimeState,
  createUserMessage,
  createVisibleMessages,
} from "@/features/conversation/conversation-machine"
import type { ConversationSession } from "@/lib/conversation-history"
import { getConversationScene } from "@/lib/conversation-scenes"

describe("conversation runtime state machine", () => {
  it("moves through call, request, mute, and end states coherently", () => {
    const initial = createConversationRuntimeState(getConversationScene("coffee"))
    const started = conversationRuntimeReducer(initial, { type: "call-started" })
    const requesting = conversationRuntimeReducer(started, { type: "request-started" })
    const muted = conversationRuntimeReducer(requesting, {
      type: "muted-changed",
      muted: true,
    })
    const ended = conversationRuntimeReducer(muted, { type: "call-ended" })

    expect(started).toMatchObject({
      callActive: true,
      callStatus: "connecting",
      callSeconds: 0,
      muted: false,
    })
    expect(requesting).toMatchObject({ pending: true, callStatus: "thinking" })
    expect(muted.muted).toBe(true)
    expect(ended).toMatchObject({
      callActive: false,
      callStatus: "ended",
      liveTranscript: "",
      idlePrompt: null,
    })
  })

  it("restores a session while clearing transient composer state", () => {
    const scene = getConversationScene("coffee")
    const initial = {
      ...createConversationRuntimeState(scene),
      draft: "unsent",
      pending: true,
      callStatus: "thinking" as const,
      liveTranscript: "partial",
    }
    const session: ConversationSession = {
      id: "saved-session",
      sceneId: scene.id,
      sceneTitle: scene.title,
      partnerName: scene.partnerName,
      startedAt: "2026-08-28T08:00:00.000Z",
      updatedAt: "2026-08-28T08:05:00.000Z",
      durationSeconds: 42,
      status: "active",
      messages: [createUserMessage("A latte, please.", "text", 42)],
    }

    const restored = conversationRuntimeReducer(initial, {
      type: "session-restored",
      session,
    })

    expect(restored).toMatchObject({
      currentSessionId: "saved-session",
      draft: "",
      pending: false,
      callStatus: "idle",
      callSeconds: 42,
      liveTranscript: "",
    })
    expect(restored.messages).toEqual(session.messages)

    const continuedCall = conversationRuntimeReducer(restored, {
      type: "call-started",
      seconds: restored.callSeconds,
    })
    expect(continuedCall).toMatchObject({
      callActive: true,
      callStatus: "connecting",
      callSeconds: 42,
    })
  })

  it("keeps transient failures out of persisted and provider-visible messages", () => {
    const messages: ConversationMessage[] = [
      createUserMessage("Could I get a latte?", "voice", 8),
      {
        id: "temporary-error",
        role: "assistant",
        content: "Temporary failure",
        translation: "",
        note: "",
        timestamp: "00:08",
        transient: true,
        variant: "error",
      },
    ]

    expect(createVisibleMessages(messages)).toEqual([messages[0]])
    expect(messages[0]?.timestamp).toBe("00:08")
  })
})
