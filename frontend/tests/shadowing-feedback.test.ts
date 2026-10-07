import { describe, expect, it } from "vitest"
import type { ShadowingAssessment } from "@/lib/shadowing-assessment"
import { getShadowingNextStep, getShadowingScoreDimensions } from "@/lib/shadowing-feedback"

const assessment: ShadowingAssessment = {
  overallScore: 78,
  clarityScore: 82,
  fluencyScore: 71,
  rhythmScore: 80,
  durationSeconds: 4.2,
  voicedRatio: 0.64,
}

describe("shadowing score dimensions", () => {
  it("puts acoustic clarity first when acting as the partner", () => {
    const dimensions = getShadowingScoreDimensions("partner", assessment)
    expect(dimensions.map((dimension) => dimension.label)).toEqual([
      "角色发声",
      "角色连贯",
      "角色节奏",
    ])
    expect(dimensions.map((dimension) => dimension.value)).toEqual([82, 71, 80])
  })

  it("puts continuity first when acting as the learner", () => {
    const dimensions = getShadowingScoreDimensions("learner", assessment)
    expect(dimensions.map((dimension) => dimension.label)).toEqual([
      "表达连贯",
      "表达发声",
      "表达节奏",
    ])
    expect(dimensions.map((dimension) => dimension.value)).toEqual([71, 82, 80])
  })

  it("describes the actual audio measurements without claiming speech or intent recognition", () => {
    for (const role of ["partner", "learner"] as const) {
      for (const dimension of getShadowingScoreDimensions(role, assessment)) {
        expect(dimension.hint.length).toBeGreaterThan(0)
        expect(dimension.hint).not.toMatch(/发音准确|理解|问句|请求/)
      }
    }
  })
})

describe("shadowing next step", () => {
  it("adapts suggestions to the role being practised", () => {
    expect(getShadowingNextStep("partner", assessment, "oat milk")).toContain("扮演角色")
    expect(getShadowingNextStep("learner", assessment, "oat milk")).toContain("表达时")
  })

  it("offers slower playback after a weak take", () => {
    const weak = { ...assessment, overallScore: 40 }
    expect(getShadowingNextStep("partner", weak, "oat milk")).toContain("0.75×")
    expect(getShadowingNextStep("learner", weak, "oat milk")).toContain("0.75×")
  })
})
