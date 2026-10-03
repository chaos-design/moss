import { describe, expect, it } from "vitest"
import { assessShadowingAttempt, estimateShadowingDuration } from "@/lib/shadowing-assessment"

describe("shadowing assessment", () => {
  it("estimates a shorter target duration at a faster playback speed", () => {
    const sentence = "Could I get a latte with oat milk, please?"

    expect(estimateShadowingDuration(sentence, 1.25)).toBeLessThan(
      estimateShadowingDuration(sentence, 0.75),
    )
  })

  it("scores an audible, steady attempt from measured samples", () => {
    const samples = Array.from({ length: 180 }, (_, index) =>
      index % 12 < 9 ? 0.075 + (index % 4) * 0.004 : 0.006,
    )
    const assessment = assessShadowingAttempt({
      durationSeconds: 4.1,
      expectedDurationSeconds: 4,
      rmsSamples: samples,
    })

    expect(assessment.overallScore).toBeGreaterThanOrEqual(70)
    expect(assessment.clarityScore).toBeGreaterThan(0)
    expect(assessment.voicedRatio).toBeGreaterThan(0.5)
  })

  it("does not award a score to silent input", () => {
    const assessment = assessShadowingAttempt({
      durationSeconds: 4,
      expectedDurationSeconds: 4,
      rmsSamples: Array.from({ length: 120 }, () => 0.002),
    })

    expect(assessment).toMatchObject({
      overallScore: 0,
      clarityScore: 0,
      fluencyScore: 0,
      rhythmScore: 0,
    })
  })
})
