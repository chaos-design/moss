import { describe, expect, it } from "vitest"
import {
  builtInExpressionItems,
  createImportedExpressionItem,
  expressionSceneCategories,
  mergeExpressionLibraryItems,
} from "@/lib/expression-library"

describe("expression library", () => {
  it("contains 1000 unique, complete expressions across every scene category", () => {
    expect(builtInExpressionItems).toHaveLength(1_000)
    expect(
      new Set(builtInExpressionItems.map((item) => item.phrase.toLocaleLowerCase())).size,
    ).toBe(1_000)
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
