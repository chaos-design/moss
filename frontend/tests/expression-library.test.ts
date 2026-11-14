import { describe, expect, it } from "vitest"
import { splitExpressionHighlights } from "@/lib/expression-highlight"
import {
  builtInExpressionItems,
  createImportedExpressionItem,
  expressionSceneCategories,
  mergeExpressionLibraryItems,
} from "@/lib/expression-library"

describe("expression library", () => {
  it("contains 1040 unique, complete expressions across every scene category", () => {
    expect(builtInExpressionItems).toHaveLength(1_040)
    expect(
      new Set(builtInExpressionItems.map((item) => item.phrase.toLocaleLowerCase())).size,
    ).toBe(1_040)
    expect(
      builtInExpressionItems.every(
        (item) =>
          item.meaning &&
          item.why &&
          item.origin &&
          item.example &&
          /[a-z]/i.test(item.phrase) &&
          /[\u3400-\u9fff]/u.test(item.meaning) &&
          /[\u3400-\u9fff]/u.test(item.why) &&
          /[.!?]$/.test(item.example),
      ),
    ).toBe(true)

    for (const category of expressionSceneCategories) {
      expect(
        builtInExpressionItems.filter((item) => item.sceneCategory === category.value).length,
      ).toBeGreaterThanOrEqual(90)
    }
  })

  it("gives every reviewed idiom a Chinese translation of its example", () => {
    const reviewed = builtInExpressionItems.filter((item) =>
      item.id.startsWith("builtin:reviewed:"),
    )
    expect(reviewed).toHaveLength(140)
    for (const item of reviewed) {
      expect(item.exampleTranslation, item.phrase).toBeTruthy()
      expect(/[\u3400-\u9fff]/u.test(item.exampleTranslation ?? "")).toBe(true)
    }
  })

  it("adds usage notes, memory tips and extra examples to every reviewed idiom", () => {
    const reviewed = builtInExpressionItems.filter((item) =>
      item.id.startsWith("builtin:reviewed:"),
    )
    expect(reviewed).toHaveLength(140)
    for (const item of reviewed) {
      expect(item.usage?.trim(), item.phrase).toBeTruthy()
      expect(item.memoryTip?.trim(), item.phrase).toBeTruthy()
      expect(item.examples?.length, item.phrase).toBeGreaterThanOrEqual(2)
      for (const example of item.examples ?? []) {
        expect(/[.!?]$/.test(example.text), `${item.phrase}: ${example.text}`).toBe(true)
        expect(
          /[\u3400-\u9fff]/u.test(example.translation ?? ""),
          `${item.phrase}: ${example.text}`,
        ).toBe(true)
        // 拓展例句必须真的出现目标表达，否则复习时看不到高亮。
        expect(
          splitExpressionHighlights(example.text, item.phrase).some(
            (segment) => segment.highlighted,
          ),
          `${item.phrase}: ${example.text}`,
        ).toBe(true)
      }
    }
  })

  it("lets an imported expression replace the same built-in phrase in one scene", () => {
    const builtIn = builtInExpressionItems.find((item) => item.phrase === "keep tabs on")
    if (!builtIn) {
      throw new Error("Missing built-in expression")
    }
    const imported = createImportedExpressionItem({
      clientId: "custom-tabs",
      phrase: builtIn.phrase,
      meaning: "自定义含义",
      why: "自定义解释",
      origin: "自定义来源",
      example: "Please keep tabs on the latest result.",
      context: builtIn.context,
      kind: builtIn.kind,
      sceneCategory: builtIn.sceneCategory,
    })

    const merged = mergeExpressionLibraryItems([builtIn], [imported])

    expect(merged).toEqual([imported])
  })
})
