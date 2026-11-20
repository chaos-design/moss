import { describe, expect, it } from "vitest"
import {
  createExpressionGenerationMessages,
  expressionGenerationPhraseLimit,
  normalizeGenerationPhrases,
  parseExpressionGeneration,
} from "@/lib/expression-generation"

const generated = {
  phrase: "keep an eye on",
  meaning: "留意；照看",
  why: "eye 代表观察，keep 表示持续维持注意。",
  origin: "由视觉动作形成的常用表达。",
  example: "Could you keep an eye on my bag?",
  exampleTranslation: "能帮我看一下包吗？",
  sceneCategory: "social",
  context: "通用",
  kind: "idiom",
  usage: "常接宾语，也可接 over 引出照看范围。",
  memoryTip: "想象眼睛停在目标上。",
  examples: [
    { text: "Keep an eye on the kids.", translation: "照看一下孩子。" },
    { text: "Will you keep an eye on my seat?", translation: "帮我占座看一下好吗？" },
  ],
}

describe("expression generation", () => {
  it("normalizes, deduplicates and bounds phrase input", () => {
    const phrases = normalizeGenerationPhrases([
      "  keep   an eye on ",
      "KEEP AN EYE ON",
      "",
      "call it a day",
      ...Array.from({ length: 12 }, (_, index) => `phrase ${index}`),
    ])

    expect(phrases[0]).toBe("keep an eye on")
    expect(phrases[1]).toBe("call it a day")
    expect(new Set(phrases.map((phrase) => phrase.toLocaleLowerCase())).size).toBe(
      phrases.length,
    )
    expect(phrases).toHaveLength(expressionGenerationPhraseLimit)
  })

  it("builds a contract prompt that names the current import dimensions", () => {
    const messages = createExpressionGenerationMessages(["keep an eye on"])
    const system = messages[0]?.content ?? ""

    expect(system).toContain("exampleTranslation")
    expect(system).toContain("memoryTip")
    expect(system).toContain("sceneCategory")
    expect(messages[1]?.content).toContain("1. keep an eye on")
  })

  it("parses fenced JSON into import-ready fields", () => {
    const items = parseExpressionGeneration(
      `Here you go:\n\`\`\`json\n${JSON.stringify([generated])}\n\`\`\``,
    )

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      phrase: "keep an eye on",
      exampleTranslation: "能帮我看一下包吗？",
      usage: "常接宾语，也可接 over 引出照看范围。",
      memoryTip: "想象眼睛停在目标上。",
    })
    expect(items[0]?.examples).toHaveLength(2)
    expect(items[0]).not.toHaveProperty("clientId")
  })

  it("rejects malformed or contract-invalid generation output", () => {
    expect(() => parseExpressionGeneration("no json here")).toThrow("生成结果不是有效 JSON")
    expect(() =>
      parseExpressionGeneration(JSON.stringify([{ ...generated, sceneCategory: "unknown" }])),
    ).toThrow()
  })
})
