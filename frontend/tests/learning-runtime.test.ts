import { describe, expect, it } from "vitest"
import { canAdvanceLearningNode, rankWeakPoints } from "@/lib/learning-runtime"

describe("rankWeakPoints", () => {
  it("prioritizes severe, repeated, recent issues", () => {
    const now = new Date("2026-08-23T00:00:00.000Z")
    const ranked = rankWeakPoints(
      [
        {
          skill: "polite-requests",
          severity: 5,
          occurrences: 7,
          lastSeenAt: "2026-08-22T00:00:00.000Z",
          improving: false,
        },
        {
          skill: "past-tense",
          severity: 2,
          occurrences: 2,
          lastSeenAt: "2026-07-01T00:00:00.000Z",
          improving: true,
        },
      ],
      now,
    )

    expect(ranked[0]?.skill).toBe("polite-requests")
    expect(ranked[0]?.priority).toBeGreaterThan(ranked[1]?.priority ?? 0)
  })
})

describe("canAdvanceLearningNode", () => {
  it("requires every measurable threshold", () => {
    expect(
      canAdvanceLearningNode({
        completedScenes: 6,
        requiredScenes: 6,
        recallRate: 0.82,
        accuracy: 0.78,
      }),
    ).toBe(true)

    expect(
      canAdvanceLearningNode({
        completedScenes: 6,
        requiredScenes: 6,
        recallRate: 0.79,
        accuracy: 0.9,
      }),
    ).toBe(false)
  })
})
