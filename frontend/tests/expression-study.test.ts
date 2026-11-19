import { describe, expect, it } from "vitest"
import type { ExpressionLibraryItem } from "@/lib/expression-library-schema"
import {
  buildCloze,
  checkClozeAnswer,
  checkDictation,
  resolveStudyItems,
} from "@/lib/expression-study"

function item(
  phrase: string,
  sceneCategory: ExpressionLibraryItem["sceneCategory"],
  example: string,
  id: string,
): ExpressionLibraryItem {
  return {
    id: `builtin:${id}`,
    clientId: `builtin-${id}`,
    phrase,
    meaning: "含义",
    why: "原因",
    origin: "来源",
    example,
    context: "通用",
    kind: "idiom",
    sceneCategory,
    source: "builtin",
  }
}

const a = item("rule of thumb", "work", "As a rule of thumb, keep it short.", "a")
const b = item("break the ice", "social", "A joke can break the ice.", "b")
const c = item("keep tabs on", "work", "Can you keep tabs on the delivery?", "c")

describe("expression study logic", () => {
  it("builds a cloze from the same span the library highlights", () => {
    expect(buildCloze(a)).toEqual({
      before: "As a ",
      answer: "rule of thumb",
      after: ", keep it short.",
    })
    expect(buildCloze(c)?.answer).toBe("keep tabs on")
  })

  it("accepts case, punctuation and inflection in cloze answers", () => {
    expect(checkClozeAnswer("keep tabs on", "KEEPS TABS ON")).toBe(true)
    expect(checkClozeAnswer("break the ice", "break the ice!")).toBe(true)
    expect(checkClozeAnswer("rule of thumb", "rule of")).toBe(false)
    expect(checkClozeAnswer("rule of thumb", "rules of thumbs")).toBe(true)
  })

  it("scores dictation with tolerance for punctuation and missing function words", () => {
    const clean = checkDictation(
      "Can you keep tabs on the delivery?",
      "can you keep tabs on the delivery",
    )
    expect(clean.passed).toBe(true)
    expect(clean.similarity).toBe(1)

    const partial = checkDictation(
      "Can you keep tabs on the delivery?",
      "you keep tabs delivery",
    )
    expect(partial.similarity).toBeLessThan(1)
    expect(partial.passed).toBe(false)

    expect(checkDictation("rule of thumb", " totally wrong words here ").passed).toBe(false)
  })

  it("resolves favorites, groups and progress scopes by expression identity", () => {
    const filtered = [a, b, c]
    const favoriteIdentities = new Set(["work:rule of thumb"])
    const progressByIdentity = { "work:keep tabs on": "learning" as const }

    expect(
      resolveStudyItems({
        filteredItems: filtered,
        favoriteIdentities,
        progressByIdentity,
        scope: { kind: "favorites" },
      }).map((entry) => entry.id),
    ).toEqual([a.id])
    expect(
      resolveStudyItems({
        filteredItems: filtered,
        favoriteIdentities,
        progressByIdentity,
        groupItemIds: ["social:break the ice"],
        scope: { kind: "group", groupId: "g1" },
      }).map((entry) => entry.id),
    ).toEqual([b.id])
    expect(
      resolveStudyItems({
        filteredItems: filtered,
        favoriteIdentities,
        progressByIdentity,
        scope: { kind: "review", status: "learning" },
      }).map((entry) => entry.id),
    ).toEqual([c.id])
  })
})
