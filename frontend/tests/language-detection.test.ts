import { describe, expect, it } from "vitest"
import {
  detectInputLanguageImmediately,
  isMeaningfulSpeechTranscript,
  isSupportedSpeechTranscript,
} from "@/lib/language-detection"

describe("language detection", () => {
  it.each([
    ["Could I get a coffee, please?", "english"],
    ["我想要一杯咖啡", "chinese"],
    ["Could I get 一杯咖啡, please?", "mixed"],
    ["123...", "unknown"],
  ] as const)("detects %s as %s without blocking on the model", (input, expected) => {
    expect(detectInputLanguageImmediately(input)).toBe(expected)
  })
})

describe("speech language filtering", () => {
  it("accepts Chinese, English, and mixed transcripts", () => {
    expect(isSupportedSpeechTranscript("Could you explain 这个短语?", "en")).toBe(true)
    expect(isSupportedSpeechTranscript("可以再说一次吗？", "zh-CN")).toBe(true)
  })

  it("rejects unsupported language labels and scripts", () => {
    expect(isSupportedSpeechTranscript("bonjour", "fr")).toBe(false)
    expect(isSupportedSpeechTranscript("こんにちは")).toBe(false)
    expect(isSupportedSpeechTranscript("안녕하세요")).toBe(false)
  })

  it("rejects blank, punctuation-only, and filler-only recognition results", () => {
    expect(isMeaningfulSpeechTranscript("   ")).toBe(false)
    expect(isMeaningfulSpeechTranscript("...?!")).toBe(false)
    expect(isMeaningfulSpeechTranscript("嗯")).toBe(false)
    expect(isMeaningfulSpeechTranscript("um")).toBe(false)
    expect(isMeaningfulSpeechTranscript("I")).toBe(true)
  })
})
