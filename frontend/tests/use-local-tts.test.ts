import { describe, expect, it } from "vitest"
import { splitSpeechText } from "@/features/speech/use-local-tts"

describe("local TTS text chunking", () => {
  it("keeps short sentences intact", () => {
    expect(splitSpeechText("Could I get a coffee, please?")).toEqual([
      "Could I get a coffee, please?",
    ])
  })

  it("bounds long sentences so the first audio can start sooner", () => {
    const chunks = splitSpeechText(
      "This is a deliberately long sentence with enough words to require several smaller synthesis requests.",
      32,
    )

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 32)).toBe(true)
    expect(chunks.join(" ")).toBe(
      "This is a deliberately long sentence with enough words to require several smaller synthesis requests.",
    )
  })
})
