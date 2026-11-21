import { describe, expect, it } from "vitest"
import {
  getDueSentenceItems,
  getSentenceItems,
  getSentenceSourceCount,
} from "@/lib/learning-inbox"
import { createDefaultLearningMemory } from "@/lib/memory"

describe("learning inbox", () => {
  const now = new Date("2026-08-29T08:00:00.000Z")
  const state = createDefaultLearningMemory(now)

  it("returns every recorded expression without a result limit", () => {
    const items = getSentenceItems(state.items)

    expect(items).toHaveLength(state.items.length)
    expect(getSentenceSourceCount(items)).toBe(
      new Set(state.items.map((item) => item.sourceSceneId)).size,
    )
  })

  it("filters by memory kind", () => {
    const vocabulary = getSentenceItems(state.items, "vocabulary")

    expect(vocabulary.length).toBeGreaterThan(0)
    expect(vocabulary.every((item) => item.kind === "vocabulary")).toBe(true)
    expect(vocabulary.map((item) => item.id)).toContain("in-stock")
  })

  it("orders due reminders from most overdue to least overdue", () => {
    const dueItems = getDueSentenceItems(state.items, now)

    expect(dueItems.length).toBeGreaterThan(1)
    expect(
      dueItems.every((item) => new Date(item.nextReviewAt).getTime() <= now.getTime()),
    ).toBe(true)
    const reviewTimes = dueItems.map((item) => new Date(item.nextReviewAt).getTime())
    expect(reviewTimes).toEqual([...reviewTimes].sort((left, right) => left - right))
    expect(dueItems.map((item) => item.id)).toContain("polite-request")
  })
})
