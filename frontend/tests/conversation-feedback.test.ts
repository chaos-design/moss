import { describe, expect, it } from "vitest"
import {
  analyzeConversationInput,
  applyTutorModeToConversation,
  createExpressionValidation,
  fillExpressionPlaceholder,
  getCorrectionSegments,
  getOriginalErrorSegments,
  parseProviderConversation,
  removeMarkdownEmphasis,
  stripMarkdown,
} from "@/lib/conversation-feedback"

describe("conversation feedback", () => {
  it("keeps word boundaries when filling scene expression placeholders", () => {
    expect(fillExpressionPlaceholder("From my perspective...")).toBe("From my perspective that")
    expect(fillExpressionPlaceholder("Could I get...?")).toBe("Could I get that?")
    expect(fillExpressionPlaceholder("I have ... to declare.")).toBe("I have that to declare.")
  })

  it("flattens Markdown into plain text while keeping line breaks", () => {
    expect(stripMarkdown("**Great question!** Here is how you can respond.")).toBe(
      "Great question! Here is how you can respond.",
    )
    expect(
      stripMarkdown("### Tips\n- Say hello\n- Ask a question\n1. Smile\n2. Speak clearly"),
    ).toBe("Tips\n• Say hello\n• Ask a question\n1. Smile\n2. Speak clearly")
    expect(stripMarkdown("Try `Could I get...` or [this link](https://example.com).")).toBe(
      "Try Could I get... or this link.",
    )
    expect(stripMarkdown("```js\nconst a = 1\n```")).toBe("const a = 1")
    expect(stripMarkdown("A quote:\n> stay calm").includes(">")).toBe(false)
    expect(stripMarkdown("no markdown here")).toBe("no markdown here")
  })

  it("removes Markdown formatting from provider replies", () => {
    const result = parseProviderConversation(
      JSON.stringify({
        reply: "## Nice work\nYou can answer with:\n- Yes, please.\n- No, thank you.",
        translation: "做得好。",
        recall: "",
        inputAnalysis: { language: "english", intent: "scene_reply" },
        validation: {
          status: "accurate",
          corrected: "Yes, please.",
          explanation: "自然。",
          issues: [],
          examples: [],
        },
      }),
      "yes please",
    )

    expect(result.content).toBe(
      "Nice work\nYou can answer with:\n• Yes, please.\n• No, thank you.",
    )
    expect(result.content).not.toContain("##")
    expect(result.content).not.toContain("- ")
  })

  it("removes emoji from every provider-generated display field", () => {
    const result = parseProviderConversation(
      JSON.stringify({
        reply: "Nice work! 🎉",
        translation: "做得好。👏",
        recall: "继续复用这个表达 🔁",
        validation: {
          status: "improve",
          corrected: "I'd like a latte. ☕",
          explanation: "语气更自然。💡",
          issues: [
            {
              kind: "register",
              original: "I want",
              corrected: "I'd like ✅",
              explanation: "服务场景中更礼貌。🙂",
            },
          ],
          examples: [{ english: "I'd like tea. 🍵", chinese: "我想要茶。🫖" }],
        },
      }),
      "I want a latte.",
    )

    expect(JSON.stringify(result)).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(result.content).toBe("Nice work!")
    expect(result.validation.corrected).toBe("I'd like a latte.")
  })

  it("returns a concrete correction without Markdown markers", () => {
    const validation = createExpressionValidation(
      "**I want** a latte",
      "Could I get...?",
      "饮品定制",
    )

    expect(validation).toMatchObject({
      status: "improve",
      corrected: "I'd like a latte",
      explanation: "服务场景中使用 I'd like... 会比 I want... 更自然、礼貌。",
      issues: [
        {
          kind: "register",
          original: "I want",
          corrected: "I'd like",
        },
      ],
    })
    expect(validation.examples).toHaveLength(3)
    expect(removeMarkdownEmphasis("Try **Could I get...**")).toBe("Try Could I get...")
  })

  it("detects Chinese, English, and code-switched translation requests", () => {
    expect(analyzeConversationInput("I would like to play basketball.")).toEqual({
      language: "english",
      intent: "scene_reply",
    })
    expect(analyzeConversationInput("我想打球怎么说")).toEqual({
      language: "chinese",
      intent: "translation_request",
    })
    expect(analyzeConversationInput("could you teach me how to say 我想打球")).toEqual({
      language: "mixed",
      intent: "translation_request",
    })
  })

  it("treats Chinese translation targets as guidance instead of learner errors", () => {
    const validation = createExpressionValidation(
      "could you teach me how to say 我想打球",
      "Could I get...?",
      "自然交流",
    )

    expect(validation).toMatchObject({
      status: "guidance",
      corrected: "I want to play basketball.",
      issues: [],
    })
    expect(validation.examples.map((example) => example.english)).toContain(
      "I usually play basketball with my friends.",
    )

    const providerResult = parseProviderConversation(
      "“我想打球”可以说成 I want to play ball。",
      "我想打球怎么说",
    )
    expect(providerResult.content).toBe("I want to play basketball.")
    expect(providerResult.translation).toBe("可以说：“I want to play basketball.”")
  })

  it("keeps Chinese provider text out of the main assistant reply", () => {
    const result = parseProviderConversation(
      JSON.stringify({
        reply:
          "Sure, I can help.\n建议：用 Would it be possible to sound polite.\n你可以先确认时间。",
        recall: "",
        inputAnalysis: { language: "mixed", intent: "language_question" },
        validation: {
          status: "guidance",
          corrected: "Would it be possible to reschedule?",
          explanation: "这句更礼貌。",
          issues: [],
          examples: [],
        },
      }),
      "怎么说能礼貌一点",
    )

    expect(result.content).toBe("Sure, I can help.")
    expect(result.content).not.toMatch(/[\u3400-\u9fff]/)
    expect(result.translation).toContain("你可以先确认时间。")
    expect(result.validation.corrected).toBe("Would it be possible to reschedule?")
  })

  it("parses structured provider feedback and strips emphasis syntax", () => {
    const result = parseProviderConversation(
      JSON.stringify({
        reply: "**What size would you like?**",
        translation: "你想要多大杯？",
        recall: "复用 **Could I get...**",
        inputAnalysis: {
          language: "english",
          intent: "scene_reply",
        },
        validation: {
          status: "improve",
          corrected: "**I'd like a latte.**",
          explanation: "语气更自然。",
          issues: [
            {
              kind: "register",
              original: "I want",
              corrected: "**I'd like**",
              explanation: "服务场景中更礼貌。",
            },
          ],
          examples: [
            {
              english: "**I'd like a coffee, please.**",
              chinese: "我想要一杯咖啡。",
            },
          ],
        },
      }),
      "I want a latte.",
    )

    expect(result.content).toBe("What size would you like?")
    expect(result.recall).toBe("复用 Could I get...")
    expect(result.validation.corrected).toBe("I'd like a latte.")
    expect(result.inputAnalysis.language).toBe("english")
    expect(result.validation.issues[0]?.original).toBe("I want")
    expect(result.validation.examples[0]?.english).toBe("I'd like a coffee, please.")
  })

  it("removes Chinese support content in immersive English mode", () => {
    const parsed = parseProviderConversation(
      JSON.stringify({
        reply: "What size would you like?",
        translation: "你想要多大杯？",
        recall: "Reuse Could I get... from 餐厅点单。",
        validation: {
          status: "improve",
          corrected: "I'd like a latte.",
          explanation: "Use a polite request. 服务场景更自然。",
          issues: [
            {
              kind: "register",
              original: "I want",
              corrected: "I'd like",
              explanation: "This sounds more polite. 语气更自然。",
            },
          ],
          examples: [{ english: "I'd like tea.", chinese: "我想要茶。" }],
        },
      }),
      "I want a latte.",
    )

    expect(applyTutorModeToConversation(parsed, "coach")).toBe(parsed)
    expect(applyTutorModeToConversation(parsed, "english")).toMatchObject({
      content: "What size would you like?",
      translation: "",
      recall: "Reuse Could I get... from",
      validation: {
        explanation: "",
        issues: [{ explanation: "" }],
        examples: [{ english: "I'd like tea.", chinese: "" }],
      },
    })
  })

  it("keeps validation useful when a provider returns plain text", () => {
    const result = parseProviderConversation(
      "Would you like that hot or iced?",
      "I want a latte",
      "Could I get...?",
      "饮品定制",
    )

    expect(result.content).toBe("Would you like that hot or iced?")
    expect(result.validation).toMatchObject({
      status: "improve",
      corrected: "I'd like a latte",
    })
  })

  it("extracts wrapped provider JSON and hides malformed structured output", () => {
    const wrapped = parseProviderConversation(
      `Here is the response:
      {"reply":"I agree. What would you like to order?","translation":"我同意。你想点什么？","recall":"","validation":{"status":"improve","corrected":"I agree with you.","explanation":"agree 前不加 am。","issues":[{"kind":"grammar","original":"I am agree","corrected":"I agree","explanation":"agree 是动词。"}],"examples":[]}}
      End of response.`,
      "I am agree with you.",
    )
    expect(wrapped.content).toBe("I agree. What would you like to order?")
    expect(wrapped.validation.issues[0]?.kind).toBe("grammar")

    const malformed = parseProviderConversation(
      '{"reply":"unfinished","validation":{"status":"improve"',
      "I am agree with you.",
    )
    expect(malformed.content).toBe(
      "I understand what you mean. Continue with the suggested expression below.",
    )
    expect(malformed.content).not.toContain('"validation"')
  })

  it("marks changed words for explicit visual highlighting", () => {
    expect(
      getCorrectionSegments("I want a latte", "I'd like a latte")
        .filter((segment) => segment.changed)
        .map((segment) => segment.text),
    ).toEqual(["I'd", "like"])

    expect(
      getOriginalErrorSegments("I am agree with you.", "I agree with you.", [
        {
          kind: "grammar",
          original: "I am agree",
          corrected: "I agree",
          explanation: "agree 前不加 am。",
        },
      ])
        .filter((segment) => segment.changed)
        .map((segment) => segment.text),
    ).toEqual(["I am agree"])
  })
})
