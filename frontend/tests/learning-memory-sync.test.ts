import { describe, expect, it } from "vitest"
import {
  createDefaultLearningMemory,
  getLearningMemoryFingerprint,
  mergeLearningMemory,
} from "@/lib/memory"

const baseTime = new Date("2026-08-24T08:00:00.000Z")

describe("mergeLearningMemory", () => {
  it("merges independent device progress without losing memories or events", () => {
    const local = createDefaultLearningMemory(baseTime)
    const remote = structuredClone(local)

    local.items[0] = {
      ...local.items[0],
      strength: 76,
      encounters: 7,
      lastSeenAt: "2026-08-24T09:00:00.000Z",
    }
    local.events = [
      {
        id: "local-event",
        type: "review",
        itemId: local.items[0].id,
        sceneId: "coffee",
        successful: true,
        occurredAt: "2026-08-24T09:00:00.000Z",
      },
    ]
    local.updatedAt = "2026-08-24T09:00:00.000Z"

    remote.items[1] = {
      ...remote.items[1],
      strength: 54,
      encounters: 5,
      lastSeenAt: "2026-08-24T10:00:00.000Z",
    }
    remote.events = [
      {
        id: "remote-event",
        type: "conversation",
        itemId: remote.items[1].id,
        sceneId: "meeting",
        successful: true,
        occurredAt: "2026-08-24T10:00:00.000Z",
      },
    ]
    remote.profile.goal = "完成英文工作汇报"
    remote.updatedAt = "2026-08-24T10:00:00.000Z"

    const merged = mergeLearningMemory(local, remote)

    expect(merged.profile.goal).toBe("完成英文工作汇报")
    expect(merged.items.find((item) => item.id === local.items[0].id)?.strength).toBe(76)
    expect(merged.items.find((item) => item.id === remote.items[1].id)?.strength).toBe(54)
    expect(merged.events.map((event) => event.id)).toEqual(["remote-event", "local-event"])
  })

  it("keeps counters monotonic while taking the latest scheduling result", () => {
    const local = createDefaultLearningMemory(baseTime)
    const remote = structuredClone(local)

    local.items[0] = {
      ...local.items[0],
      strength: 72,
      encounters: 9,
      successfulRecalls: 5,
      lastSeenAt: "2026-08-24T11:00:00.000Z",
      nextReviewAt: "2026-08-30T11:00:00.000Z",
    }
    remote.items[0] = {
      ...remote.items[0],
      strength: 35,
      encounters: 8,
      successfulRecalls: 6,
      lastSeenAt: "2026-08-24T10:00:00.000Z",
      nextReviewAt: "2026-08-24T10:10:00.000Z",
    }

    const mergedItem = mergeLearningMemory(local, remote).items.find(
      (item) => item.id === local.items[0].id,
    )

    expect(mergedItem).toMatchObject({
      strength: 72,
      encounters: 9,
      successfulRecalls: 6,
      nextReviewAt: "2026-08-30T11:00:00.000Z",
    })
  })

  it("merges the complete event history without silently truncating older records", () => {
    const local = createDefaultLearningMemory(baseTime)
    const remote = structuredClone(local)
    local.events = Array.from({ length: 130 }, (_, index) => ({
      id: `event-${index}`,
      type: "conversation" as const,
      itemId: "polite-request",
      sceneId: "coffee",
      successful: index % 2 === 0,
      occurredAt: new Date(baseTime.getTime() + index * 1_000).toISOString(),
    }))

    const merged = mergeLearningMemory(local, remote)

    expect(merged.events).toHaveLength(130)
    expect(merged.events[0]?.id).toBe("event-129")
    expect(merged.events.at(-1)?.id).toBe("event-0")
  })
})

describe("getLearningMemoryFingerprint", () => {
  it("is stable when JSON object keys arrive in a different order", () => {
    const state = createDefaultLearningMemory(baseTime)
    const reordered = {
      updatedAt: state.updatedAt,
      events: state.events,
      sceneProgress: state.sceneProgress,
      items: state.items,
      profile: state.profile,
      version: state.version,
    }

    expect(getLearningMemoryFingerprint(state)).toBe(getLearningMemoryFingerprint(reordered))
  })
})
