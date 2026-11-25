import { describe, expect, it } from "vitest"
import {
  buildEbbinghausLearnQueue,
  buildExpressionCatalogByClientId,
  getClientIdFromExpressionMemoryId,
  getDueExpressionMemoryItems,
  needsRememorize,
} from "@/lib/expression-ebbinghaus"
import type { ExpressionLibraryItem } from "@/lib/expression-library-schema"
import { createExpressionMemoryItemId, type LearningMemoryItem } from "@/lib/memory"

function item(phrase: string, clientId: string): ExpressionLibraryItem {
  return {
    id: `builtin:${clientId}`,
    clientId,
    phrase,
    meaning: "含义",
    why: "原因",
    origin: "来源",
    example: `Use ${phrase} here.`,
    context: "通用",
    kind: "idiom",
    sceneCategory: "work",
    source: "builtin",
  }
}

function memoryItem(
  clientId: string,
  strength: number,
  nextReviewAt: string,
): LearningMemoryItem {
  return {
    id: createExpressionMemoryItemId(clientId),
    kind: "expression",
    label: clientId,
    cue: `主动学习并记住“${clientId}”`,
    answer: clientId,
    explanation: "测试记忆",
    sourceSceneId: "work",
    sourceSceneTitle: "职场",
    transferTargets: [],
    strength,
    encounters: 1,
    successfulRecalls: 1,
    lapseCount: 0,
    intervalDays: 1,
    easeFactor: 2.5,
    repetitions: 1,
    lastSeenAt: nextReviewAt,
    nextReviewAt,
  }
}

const a = item("rule of thumb", "a")
const b = item("break the ice", "b")
const c = item("keep tabs on", "c")

describe("ebbinghaus planning", () => {
  it("prefers expressions that are not in long-term memory yet", () => {
    const queue = buildEbbinghausLearnQueue(
      [a, b, c],
      [memoryItem("b", 90, "2026-11-21T08:00:00.000Z")],
      2,
    )
    expect(queue.map((entry) => entry.clientId)).toEqual(["a", "c"])
  })

  it("fills the batch with the weakest existing memories", () => {
    const queue = buildEbbinghausLearnQueue(
      [a, b, c],
      [
        memoryItem("a", 80, "2026-11-21T08:00:00.000Z"),
        memoryItem("b", 20, "2026-11-21T08:00:00.000Z"),
        memoryItem("c", 50, "2026-11-21T08:00:00.000Z"),
      ],
      2,
    )
    expect(queue.map((entry) => entry.clientId)).toEqual(["b", "c"])
  })

  it("returns due expression memories ordered by due time", () => {
    const now = new Date("2026-11-20T08:00:00.000Z")
    const due = getDueExpressionMemoryItems(
      [
        memoryItem("later", 40, "2026-11-21T08:00:00.000Z"),
        memoryItem("overdue", 60, "2026-11-19T08:00:00.000Z"),
        memoryItem("due", 30, "2026-11-20T07:00:00.000Z"),
        { ...memoryItem("scene", 10, "2026-11-19T08:00:00.000Z"), id: "conversation-turn-1" },
      ],
      now,
      2,
    )
    expect(due.map((entry) => entry.id)).toEqual([
      createExpressionMemoryItemId("overdue"),
      createExpressionMemoryItemId("due"),
    ])
  })

  it("sends only failed ratings back to re-memorization", () => {
    expect(needsRememorize("again")).toBe(true)
    expect(needsRememorize("hard")).toBe(true)
    expect(needsRememorize("good")).toBe(false)
    expect(needsRememorize("easy")).toBe(false)
  })

  it("maps memory ids back to library items for display", () => {
    const catalog = buildExpressionCatalogByClientId([a, b])
    expect(getClientIdFromExpressionMemoryId(createExpressionMemoryItemId("b"))).toBe("b")
    expect(getClientIdFromExpressionMemoryId("conversation-turn-1")).toBeNull()
    expect(catalog.get("a")?.phrase).toBe("rule of thumb")
  })
})
