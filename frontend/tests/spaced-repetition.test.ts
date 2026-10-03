import { describe, expect, it } from "vitest"
import { scheduleReview } from "@/lib/memory"

describe("scheduleReview", () => {
  const reviewedAt = new Date("2026-08-23T08:00:00.000Z")

  it("resets a forgotten item to a short relearning interval", () => {
    const result = scheduleReview(
      { intervalDays: 8, easeFactor: 2.4, repetitions: 4 },
      "again",
      reviewedAt,
    )

    expect(result.intervalDays).toBe(0)
    expect(result.repetitions).toBe(0)
    expect(result.easeFactor).toBeCloseTo(2.2)
    expect(result.dueAt).toBe("2026-08-23T08:10:00.000Z")
  })

  it("schedules a first successful recall in the following days", () => {
    const result = scheduleReview(
      { intervalDays: 0, easeFactor: 2.5, repetitions: 0 },
      "good",
      reviewedAt,
    )

    expect(result.intervalDays).toBe(3)
    expect(result.repetitions).toBe(1)
    expect(result.dueAt).toBe("2026-08-26T08:00:00.000Z")
  })

  it("rewards an easy recall with a longer interval and higher ease", () => {
    const result = scheduleReview(
      { intervalDays: 6, easeFactor: 2.4, repetitions: 3 },
      "easy",
      reviewedAt,
    )

    expect(result.intervalDays).toBe(20)
    expect(result.easeFactor).toBeCloseTo(2.55)
    expect(result.repetitions).toBe(4)
  })
})
