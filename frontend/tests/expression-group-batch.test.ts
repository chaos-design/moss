import { describe, expect, it } from "vitest"
import {
  createExpressionIdentity,
  type ExpressionLibraryItem,
  parseExpressionPhraseBatch,
  resolvePhrasesToIdentities,
} from "@/lib/expression-library-schema"

function makeItem(
  phrase: string,
  sceneCategory: ExpressionLibraryItem["sceneCategory"],
): ExpressionLibraryItem {
  return {
    id: `imported:${sceneCategory}:${phrase}`,
    clientId: `${sceneCategory}-${phrase}`,
    phrase,
    meaning: "含义",
    why: "解释",
    origin: "来源",
    example: `Use ${phrase} here.`,
    context: "通用",
    kind: "idiom",
    sceneCategory,
    source: "imported",
  }
}

describe("expression phrase batch", () => {
  it("splits and deduplicates phrases across mixed separators", () => {
    expect(
      parseExpressionPhraseBatch(
        "keep an eye on\nrule of thumb，Call It a Day; keep  an eye on、\n",
      ),
    ).toEqual(["keep an eye on", "rule of thumb", "Call It a Day"])
  })

  it("resolves one phrase to every scene it appears in and reports unmatched input", () => {
    const items = [
      makeItem("keep an eye on", "social"),
      makeItem("keep an eye on", "health"),
      makeItem("rule of thumb", "work"),
    ]
    const { identities, matched, unmatched } = resolvePhrasesToIdentities(items, [
      "Keep  An Eye On",
      "rule of thumb",
      "not in library",
    ])

    expect([...identities].sort()).toEqual(
      [
        createExpressionIdentity(items[0]),
        createExpressionIdentity(items[1]),
        createExpressionIdentity(items[2]),
      ].sort(),
    )
    expect(matched).toHaveLength(2)
    expect(unmatched).toEqual(["not in library"])
  })

  it("returns no identities when nothing matches", () => {
    expect(
      resolvePhrasesToIdentities([makeItem("rule of thumb", "work")], ["missing"]).identities,
    ).toEqual([])
  })
})
