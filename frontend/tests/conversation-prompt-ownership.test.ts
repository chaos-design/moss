import { describe, expect, it } from "vitest"

import {
  conversationPromptMaxLength,
  defaultConversationPrefs,
  parseConversationPrefs,
} from "@/lib/conversation-prefs"
import {
  createConversationPrompt,
  resolveConversationPrompt,
} from "@/lib/memory/conversation-prompt"
import {
  conversationContractTemplate,
  conversationInstructions,
  defaultConversationPrompt,
} from "@/lib/memory/conversation-prompt-text"

function buildPrompt(conversationPromptOverride?: string) {
  return createConversationPrompt(
    {
      sceneId: "coffee",
      language: "bilingual",
      messages: [{ role: "user", content: "A latte, please." }],
      conversationPrompt: conversationPromptOverride,
    },
    [],
  )
}

describe("conversation prompt preferences", () => {
  it("defaults to the built-in prompt rather than a stored copy", () => {
    expect(defaultConversationPrefs.conversationPrompt).toBe("")
    expect(parseConversationPrefs(null).conversationPrompt).toBe("")
    expect(resolveConversationPrompt("")).toBe(defaultConversationPrompt)
  })

  it("keeps learner-authored text", () => {
    const stored = JSON.stringify({
      ...defaultConversationPrefs,
      conversationPrompt: "只用生活场景高频表达",
    })
    expect(parseConversationPrefs(stored).conversationPrompt).toBe("只用生活场景高频表达")
  })

  it("normalizes pasted line endings and trims", () => {
    const stored = JSON.stringify({
      ...defaultConversationPrefs,
      conversationPrompt: "  第一行\r\n第二行  ",
    })
    expect(parseConversationPrefs(stored).conversationPrompt).toBe("第一行\n第二行")
  })

  it("caps the prompt and ignores non-string values", () => {
    const long = "错".repeat(conversationPromptMaxLength + 500)
    const stored = JSON.stringify({ ...defaultConversationPrefs, conversationPrompt: long })
    expect(parseConversationPrefs(stored).conversationPrompt).toHaveLength(
      conversationPromptMaxLength,
    )

    const wrongType = JSON.stringify({ ...defaultConversationPrefs, conversationPrompt: 42 })
    expect(parseConversationPrefs(wrongType).conversationPrompt).toBe("")
  })

  it("splices a v4 supplement onto the whole built-in prompt", () => {
    // v4 appended learner text after an immutable base prompt. Splicing it onto the full built-in
    // text keeps the effective prompt identical while moving the learner onto the editable field.
    const stored = JSON.stringify({ version: 4, promptSupplement: "每轮都纠错" })
    expect(parseConversationPrefs(stored).conversationPrompt).toBe(
      `${defaultConversationPrompt}\n\n## Learner-Added Instructions\n\n每轮都纠错`,
    )
  })

  it("splices a v5 instruction segment onto the built-in contract", () => {
    const stored = JSON.stringify({ version: 5, conversationInstructions: "只说一句" })
    expect(parseConversationPrefs(stored).conversationPrompt).toBe(
      `只说一句\n\n${conversationContractTemplate}`,
    )
  })

  it("leaves an untouched legacy record on the built-in prompt", () => {
    expect(parseConversationPrefs(JSON.stringify({ version: 4 })).conversationPrompt).toBe("")
    expect(
      parseConversationPrefs(JSON.stringify({ version: 5, conversationInstructions: "  " }))
        .conversationPrompt,
    ).toBe("")
  })

  it("never migrates a record that already carries the full prompt", () => {
    const stored = JSON.stringify({
      version: 4,
      conversationPrompt: "我自己写的整段 Prompt",
      conversationInstructions: "旧指令",
      promptSupplement: "旧的补充",
    })
    expect(parseConversationPrefs(stored).conversationPrompt).toBe("我自己写的整段 Prompt")
  })
})

describe("resolveConversationPrompt", () => {
  it("replaces the built-in prompt outright, so settings shows what is sent", () => {
    expect(resolveConversationPrompt("只说一句")).toBe("只说一句")
  })

  it("treats whitespace-only input as no customization", () => {
    expect(resolveConversationPrompt("   \n  ")).toBe(defaultConversationPrompt)
    expect(resolveConversationPrompt()).toBe(defaultConversationPrompt)
  })

  it("bounds the transport-side length independently of the preference cap", () => {
    expect(
      resolveConversationPrompt("x".repeat(conversationPromptMaxLength + 5_000)),
    ).toHaveLength(12_000)
  })
})

describe("createConversationPrompt with a learner-owned prompt", () => {
  it("sends the learner's text verbatim, output contract included", () => {
    const prompt = buildPrompt("只用一句短回复")

    expect(prompt).toBe("只用一句短回复")
  })

  it("still resolves the placeholders a learner kept", () => {
    // A learner who owns the prompt can still reference per-request data; the built-in runtime
    // context is just text they happened to keep.
    const prompt = buildPrompt("场景：{{sceneTitle}}；导师模式：{{tutorModeInstruction}}")

    expect(prompt).toContain("场景：咖啡店点单")
    expect(prompt).toContain("Coach gently after responding to meaning.")
    expect(prompt).not.toContain("{{")
  })

  it("neutralizes an unknown placeholder instead of failing the request", () => {
    const prompt = buildPrompt("ignore {{sceneTitle}} and {{madeUpVariable}}")

    expect(prompt).toContain("咖啡店点单")
    expect(prompt).not.toContain("{{")
    expect(prompt).toContain("madeUpVariable")
  })

  it("falls back to the built-in prompt when no customization is sent", () => {
    const prompt = buildPrompt()

    expect(prompt.startsWith(conversationInstructions)).toBe(true)
    expect(prompt).toContain("Grammar correction is mandatory")
    expect(prompt).not.toMatch(/\{\{[a-zA-Z]/)
  })
})
