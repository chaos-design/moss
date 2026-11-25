import { describe, expect, it } from "vitest"
import {
  createEmptyLearningMemory,
  getReviewQueue,
  getScopedReviewQueue,
  isLibraryExpressionMemoryItem,
  type LearningMemoryItem,
  matchesReviewScope,
  parseReviewScope,
} from "@/lib/memory"

function memoryItem(
  overrides: Partial<LearningMemoryItem> & Pick<LearningMemoryItem, "id">,
): LearningMemoryItem {
  return {
    kind: "expression",
    label: "测试条目",
    cue: "测试线索",
    answer: "test answer",
    explanation: "测试说明",
    sourceSceneId: "social",
    sourceSceneTitle: "社交关系",
    transferTargets: [],
    strength: 40,
    encounters: 2,
    successfulRecalls: 1,
    lapseCount: 0,
    intervalDays: 2,
    easeFactor: 2.3,
    repetitions: 1,
    lastSeenAt: "2026-11-01T08:00:00.000Z",
    nextReviewAt: "2026-11-02T08:00:00.000Z",
    ...overrides,
  }
}

const now = new Date("2026-11-13T08:00:00.000Z")

function stateWith(items: LearningMemoryItem[]) {
  return { ...createEmptyLearningMemory(now), items }
}

const expressionItem = memoryItem({ id: "expression-library-builtin-reviewed-1" })
const sceneItem = memoryItem({
  id: "clarify-trade-off",
  cue: "在会议中请对方进一步解释一个取舍",
})
const secondSceneItem = memoryItem({ id: "polite-request", cue: "在服务场景中礼貌提出请求" })

describe("review scope", () => {
  it("recognizes library expressions by the memory id prefix", () => {
    expect(isLibraryExpressionMemoryItem(expressionItem)).toBe(true)
    expect(isLibraryExpressionMemoryItem(sceneItem)).toBe(false)
    expect(matchesReviewScope(expressionItem, "expression")).toBe(true)
    expect(matchesReviewScope(expressionItem, "scene")).toBe(false)
    expect(matchesReviewScope(sceneItem, "scene")).toBe(true)
  })

  it("parses stored scopes and falls back to the mixed queue", () => {
    expect(parseReviewScope("expression")).toBe("expression")
    expect(parseReviewScope("scene")).toBe("scene")
    expect(parseReviewScope(null)).toBe("mixed")
    expect(parseReviewScope("unknown")).toBe("mixed")
  })

  it("separates idiomatic expressions from scene memories", () => {
    const state = stateWith([expressionItem, sceneItem, secondSceneItem])

    expect(
      getScopedReviewQueue(state, { now, scope: "expression" }).map((item) => item.id),
    ).toEqual([expressionItem.id])
    expect(getScopedReviewQueue(state, { now, scope: "scene" }).map((item) => item.id)).toEqual(
      [sceneItem.id, secondSceneItem.id],
    )
    expect(getScopedReviewQueue(state, { now, scope: "mixed" })).toHaveLength(3)
  })

  it("keeps the default queue unchanged for callers that do not pass a scope", () => {
    const state = stateWith([expressionItem, sceneItem, secondSceneItem])

    expect(getReviewQueue(state, now).map((item) => item.id)).toEqual(
      getScopedReviewQueue(state, { now, scope: "mixed" }).map((item) => item.id),
    )
  })

  it("pins the requested memory only when it belongs to the active scope", () => {
    const state = stateWith([expressionItem, sceneItem, secondSceneItem])

    expect(
      getScopedReviewQueue(state, {
        now,
        scope: "scene",
        targetMemoryItemId: sceneItem.id,
      })[0]?.id,
    ).toBe(sceneItem.id)
    // 跨范围的目标不强行插入，避免「只复习场景」里冒出词库表达。
    expect(
      getScopedReviewQueue(state, {
        now,
        scope: "scene",
        targetMemoryItemId: expressionItem.id,
      }).map((item) => item.id),
    ).not.toContain(expressionItem.id)
  })
})
