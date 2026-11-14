import { describe, expect, it } from "vitest"
import { splitExpressionHighlights } from "@/lib/expression-highlight"

function highlightedText(value: string, phrase: string) {
  return splitExpressionHighlights(value, phrase)
    .filter((segment) => segment.highlighted)
    .map((segment) => segment.text)
}

describe("expression highlight", () => {
  it("marks the exact phrase without changing the surrounding sentence", () => {
    const sentence = "Could you keep tabs on the delivery and let me know if it is delayed?"
    const segments = splitExpressionHighlights(sentence, "keep tabs on")

    expect(highlightedText(sentence, "keep tabs on")).toEqual(["keep tabs on"])
    expect(segments.map((segment) => segment.text).join("")).toBe(sentence)
  })

  it("matches case-insensitively and with a plural or past-tense head", () => {
    expect(highlightedText("She always Keeps tabs on the numbers.", "keep tabs on")).toEqual([
      "Keeps tabs on",
    ])
    expect(highlightedText("He spilled the beans at lunch.", "spill the beans")).toEqual([
      "spilled the beans",
    ])
    expect(highlightedText("They called it a day at six.", "call it a day")).toEqual([
      "called it a day",
    ])
  })

  it("matches irregular past tense and possessive placeholders", () => {
    expect(highlightedText("A joke about the venue broke the ice.", "break the ice")).toEqual([
      "broke the ice",
    ])
    expect(
      highlightedText("My hands are tied on this one.", "someone's hands are tied"),
    ).toEqual(["My hands are tied"])
    expect(highlightedText("Don't pull my leg.", "pull someone's leg")).toEqual(["pull my leg"])
  })

  it("tolerates inserted adjectives and plural noun endings", () => {
    expect(highlightedText("The tool has a steep learning curve.", "a learning curve")).toEqual(
      ["a steep learning curve"],
    )
    expect(highlightedText("We scored a few quick wins.", "quick win")).toEqual(["quick wins"])
  })

  it("leaves the sentence untouched when the phrase is absent", () => {
    const segments = splitExpressionHighlights("This sentence has no target.", "hit the road")
    expect(segments).toEqual([{ text: "This sentence has no target.", highlighted: false }])
  })
})
