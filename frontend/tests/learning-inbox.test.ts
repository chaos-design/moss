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
    expect(items[0]?.id).toBe("clarify-trade-off")
    expect(getSentenceSourceCount(items)).toBe(5)
  })

  it("filters by memory kind", () => {
    const vocabulary = getSentenceItems(state.items, "vocabulary")

    expect(vocabulary.map((item) => item.id)).toEqual(["in-stock"])
  })

  it("orders due reminders from most overdue to least overdue", () => {
    const dueItems = getDueSentenceItems(state.items, now)

    expect(dueItems.map((item) => item.id)).toEqual(["polite-request", "clarify-trade-off"])
  })
})
