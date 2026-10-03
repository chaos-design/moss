import { describe, expect, it } from "vitest"
import {
  type ConversationPrefs,
  defaultConversationPrefs,
  parseConversationPrefs,
  shouldSendOnKey,
} from "@/lib/conversation-prefs"

describe("conversation prefs", () => {
  it("defaults to stacked layout, Enter-to-send, and gentle coaching", () => {
    expect(parseConversationPrefs(null)).toEqual(defaultConversationPrefs)
    expect(defaultConversationPrefs.transcriptLayout).toBe("stacked")
    expect(defaultConversationPrefs.sendShortcut).toBe("enter")
    expect(defaultConversationPrefs.tutorMode).toBe("coach")
    expect(defaultConversationPrefs).toMatchObject({
      sessionResumeMinutes: 30,
      consecutiveQuestionDelayMs: 500,
      voiceSentenceDelayMs: 1800,
    })
  })

  it("restores valid values and falls back on invalid ones", () => {
    const restored = parseConversationPrefs(
      JSON.stringify({
        transcriptLayout: "split",
        sendShortcut: "shift-enter",
        tutorMode: "english",
      }),
    )
    expect(restored.transcriptLayout).toBe("split")
    expect(restored.sendShortcut).toBe("shift-enter")
    expect(restored.tutorMode).toBe("english")

    const fallback = parseConversationPrefs(
      JSON.stringify({ transcriptLayout: "grid", sendShortcut: "cmd", tutorMode: "strict" }),
    )
    expect(fallback).toEqual(defaultConversationPrefs)

    expect(parseConversationPrefs("not json")).toEqual(defaultConversationPrefs)
  })

  it("adds the default tutor mode when restoring a legacy preference record", () => {
    expect(
      parseConversationPrefs(
        JSON.stringify({
          version: 2,
          transcriptLayout: "split",
          sendShortcut: "shift-enter",
          sessionResumeMinutes: 60,
          consecutiveQuestionDelayMs: 900,
          voiceSentenceDelayMs: 2400,
        }),
      ),
    ).toMatchObject({
      version: 3,
      transcriptLayout: "split",
      sendShortcut: "shift-enter",
      tutorMode: "coach",
      sessionResumeMinutes: 60,
      consecutiveQuestionDelayMs: 900,
      voiceSentenceDelayMs: 2400,
    })
  })

  it("restores bounded conversation timing preferences", () => {
    expect(
      parseConversationPrefs(
        JSON.stringify({
          sessionResumeMinutes: 60,
          consecutiveQuestionDelayMs: 900,
          voiceSentenceDelayMs: 2400,
        }),
      ),
    ).toMatchObject({
      sessionResumeMinutes: 60,
      consecutiveQuestionDelayMs: 900,
      voiceSentenceDelayMs: 2400,
    })

    expect(
      parseConversationPrefs(
        JSON.stringify({
          sessionResumeMinutes: 1,
          consecutiveQuestionDelayMs: 9000,
          voiceSentenceDelayMs: 100,
        }),
      ),
    ).toMatchObject({
      sessionResumeMinutes: 5,
      consecutiveQuestionDelayMs: 3000,
      voiceSentenceDelayMs: 800,
    })
  })

  it("sends on bare Enter in enter mode, newline on Shift+Enter", () => {
    const enter: ConversationPrefs["sendShortcut"] = "enter"
    expect(shouldSendOnKey(enter, { key: "Enter", shiftKey: false })).toBe(true)
    expect(shouldSendOnKey(enter, { key: "Enter", shiftKey: true })).toBe(false)
    expect(shouldSendOnKey(enter, { key: "a", shiftKey: false })).toBe(false)
  })

  it("sends on Shift+Enter in shift-enter mode, newline on bare Enter", () => {
    const shift: ConversationPrefs["sendShortcut"] = "shift-enter"
    expect(shouldSendOnKey(shift, { key: "Enter", shiftKey: true })).toBe(true)
    expect(shouldSendOnKey(shift, { key: "Enter", shiftKey: false })).toBe(false)
  })

  it("never sends while an IME composition is active", () => {
    expect(shouldSendOnKey("enter", { key: "Enter", shiftKey: false, isComposing: true })).toBe(
      false,
    )
    expect(
      shouldSendOnKey("shift-enter", { key: "Enter", shiftKey: true, isComposing: true }),
    ).toBe(false)
  })
})
