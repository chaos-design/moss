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

  it("matches doubled-consonant verb endings", () => {
    // 用不带助动词的句子定位词形本身（助动词纳入高亮是另一条已测规则）。
    expect(highlightedText("We saw him running late.", "run late")).toEqual(["running late"])
    expect(highlightedText("They stopped the car.", "stop the car")).toEqual([
      "stopped the car",
    ])
    // w/x/y 结尾不双写。
    expect(highlightedText("We watched her showing off.", "show off")).toEqual(["showing off"])
  })

  it("tolerates inserted adjectives and plural noun endings", () => {
    expect(highlightedText("The tool has a steep learning curve.", "a learning curve")).toEqual(
      ["a steep learning curve"],
    )
    expect(highlightedText("We scored a few quick wins.", "quick win")).toEqual(["quick wins"])
  })

  it("includes auxiliaries and negative adverbs in verb-phrase highlights", () => {
    expect(highlightedText("Don't give up! You're almost there.", "give up")).toEqual([
      "give up",
    ])
    expect(highlightedText("He gave up smoking last year.", "give up")).toEqual(["gave up"])
    expect(highlightedText("He is giving up too soon.", "give up")).toEqual(["is giving up"])
    expect(highlightedText("I have never given up on my dream.", "give up")).toEqual([
      "have never given up",
    ])
    expect(highlightedText("She has already given up.", "give up")).toEqual([
      "has already given up",
    ])
    expect(highlightedText("They will not give up easily.", "give up")).toEqual([
      "will not give up",
    ])
  })

  it("tolerates a function word inserted between phrase words", () => {
    // need lecture 在例句里被插入冠词 a。
    expect(highlightedText("You need a lecture on grammar.", "need lecture")).toEqual([
      "need a lecture",
    ])
    expect(highlightedText("We need the lecture to be shorter.", "need lecture")).toEqual([
      "need the lecture",
    ])
    // 只放宽一个虚词，不吞掉实词，避免把无关表达误命中。
    expect(splitExpressionHighlights("You need extra help today.", "need lecture")).toEqual([
      { text: "You need extra help today.", highlighted: false },
    ])
  })

  it("leaves the sentence untouched when the phrase is absent", () => {
    const segments = splitExpressionHighlights("This sentence has no target.", "hit the road")
    expect(segments).toEqual([{ text: "This sentence has no target.", highlighted: false }])
  })

  it("highlights the built-in examples that swap pronouns, objects and contractions", () => {
    // play it by ear：宾语 it 落到具体名词短语（the afternoon）。
    expect(
      highlightedText(
        "We may finish early, so let's play the afternoon by ear.",
        "play it by ear",
      ),
    ).toEqual(["play the afternoon by ear"])
    // cross that bridge…：主语 you 换成 we。
    expect(
      highlightedText(
        "We may need a larger venue, but we will cross that bridge when we come to it.",
        "cross that bridge when you come to it",
      ),
    ).toEqual(["cross that bridge when we come to it"])
    // on someone's radar：占位符展开成多词所有格名词短语。
    expect(
      highlightedText(
        "The accessibility issue is now on the leadership team's radar.",
        "on someone's radar",
      ),
    ).toEqual(["on the leadership team's radar"])
    // had better / would rather：缩约为 'd。
    expect(highlightedText("You'd better check the numbers again.", "had better")).toEqual([
      "You'd better",
    ])
    expect(
      highlightedText("I'd rather wait than send the wrong file.", "would rather"),
    ).toEqual(["I'd rather"])
  })

  it("keeps the verb-swap tail fallback for content-word heads", () => {
    // 动词换用（cost → paid）时靠尾部兜底高亮，这是词库覆盖要求的既有行为。
    expect(
      highlightedText(
        "I paid an arm and a leg for the last-minute ticket.",
        "cost an arm and a leg",
      ),
    ).toEqual(["an arm and a leg"])
  })
})
