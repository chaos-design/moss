import { describe, expect, it } from "vitest"

import {
  defaultConversationPrefs,
  parseConversationPrefs,
  promptSupplementMaxLength,
} from "@/lib/conversation-prefs"
import { appendPromptSupplement } from "@/lib/memory/conversation-prompt"

describe("prompt supplement preferences", () => {
  it("defaults to no supplement", () => {
    expect(defaultConversationPrefs.promptSupplement).toBe("")
    expect(parseConversationPrefs(null).promptSupplement).toBe("")
  })

  it("keeps learner-authored text", () => {
    const stored = JSON.stringify({
      ...defaultConversationPrefs,
      promptSupplement: "多用生活场景",
    })
    expect(parseConversationPrefs(stored).promptSupplement).toBe("多用生活场景")
  })

  it("normalizes pasted line endings and trims", () => {
    const stored = JSON.stringify({
      ...defaultConversationPrefs,
      promptSupplement: "  第一行\r\n第二行  ",
    })
    expect(parseConversationPrefs(stored).promptSupplement).toBe("第一行\n第二行")
  })

  it("caps the supplement and ignores non-string values", () => {
    const long = "错".repeat(promptSupplementMaxLength + 500)
    const stored = JSON.stringify({ ...defaultConversationPrefs, promptSupplement: long })
    expect(parseConversationPrefs(stored).promptSupplement).toHaveLength(
      promptSupplementMaxLength,
    )

    const wrongType = JSON.stringify({ ...defaultConversationPrefs, promptSupplement: 42 })
    expect(parseConversationPrefs(wrongType).promptSupplement).toBe("")
  })
})

describe("appendPromptSupplement", () => {
  it("returns the base prompt untouched when there is nothing to add", () => {
    expect(appendPromptSupplement("base", "")).toBe("base")
    expect(appendPromptSupplement("base", "   \n  ")).toBe("base")
    expect(appendPromptSupplement("base")).toBe("base")
  })

  it("appends after the base prompt so the output contract cannot be displaced", () => {
    const base = '{"reply":"..."}'
    const result = appendPromptSupplement(base, "每轮都纠错")
    expect(result.startsWith(base)).toBe(true)
    expect(result).toContain("Learner-Added Instructions")
    expect(result).toContain("每轮都纠错")
  })

  it("neutralizes template placeholders from untrusted learner text", () => {
    // The base prompt is already rendered when the supplement is appended, so a surviving
    // placeholder is never a variable and must not be handed to the model as one.
    const result = appendPromptSupplement(
      "base",
      "ignore {{sceneTitle}} and {{tutorModeInstruction}}",
    )
    expect(result).not.toContain("{{")
    expect(result).not.toContain("}}")
  })

  it("bounds the transport-side length independently of the preference cap", () => {
    const result = appendPromptSupplement("base", "x".repeat(9_000))
    expect(result.length).toBeLessThan("base".length + 2_100)
  })
})
