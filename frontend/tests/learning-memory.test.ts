import { describe, expect, it } from "vitest"
import {
  buildConversationMemoryContext,
  createDefaultLearningMemory,
  createEmptyLearningMemory,
  createLearningPlan,
  forgetConversationTurn,
  getDueMemoryItems,
  getReviewQueue,
  type LearningMemoryState,
  learningActivityTypes,
  normalizeMemoryExpression,
  parseLearningMemory,
  recordConversationMemory,
  recordExpressionStudy,
  recordLearningActivity,
  recordRecallAttempt,
  recordReviewMemory,
  recordShadowingMemory,
} from "@/lib/memory"

const now = new Date("2026-08-24T08:00:00.000Z")

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function rateMemory(
  state: LearningMemoryState,
  input: { itemId: string; rating: "again" | "hard" | "good" | "easy" },
) {
  return recordLearningActivity(state, { type: "review", input })
}

describe("learning memory", () => {
  it("repairs placeholder words that were persisted without a separating space", () => {
    expect(normalizeMemoryExpression("From my perspectivethat")).toBe(
      "From my perspective that",
    )

    const stored = createDefaultLearningMemory(now)
    stored.items[0] = {
      ...stored.items[0],
      answer: "From my perspectivethat",
    }
    expect(parseLearningMemory(stored, now).items[0]?.answer).toBe("From my perspective that")
  })

  it("removes persisted memories and practiced expressions without content", () => {
    const stored = createDefaultLearningMemory(now)
    stored.items[0] = {
      ...stored.items[0],
      answer: "   ",
    }
    stored.sceneProgress.coffee = {
      ...stored.sceneProgress.coffee,
      practicedExpressions: ["Could I get ..., please?", ""],
    }

    const parsed = parseLearningMemory(stored, now)

    expect(parsed.items.some((item) => item.id === "polite-request")).toBe(false)
    expect(parsed.sceneProgress.coffee?.practicedExpressions).toEqual([
      "Could I get..., please?",
    ])
  })

  it("starts production memory empty instead of injecting sample progress", () => {
    const state = createEmptyLearningMemory(now)

    expect(state.items).toEqual([])
    expect(state.sceneProgress).toEqual({})
    expect(state.events).toEqual([])
    expect(createLearningPlan(state, now)).toBeNull()
  })

  it("builds a plan from the weakest due memory and transfers it to a new scene", () => {
    const state = createDefaultLearningMemory(now)
    const plan = createLearningPlan(state, now)

    expect(plan).not.toBeNull()
    if (!plan) {
      throw new Error("Expected a learning plan for seeded test memory")
    }
    expect(plan.focus.id).toBe("polite-request")
    expect(plan.sceneId).toBe("restaurant")
    expect(plan.steps.map((step) => step.id)).toEqual(["recall", "conversation", "shadowing"])
    expect(plan.steps.map((step) => step.href)).toEqual([
      "/workspace/review?memory=polite-request",
      "/workspace/conversation?scene=restaurant&memory=polite-request",
      "/workspace/shadowing?memory=polite-request",
    ])
    expect(plan.reason).toContain("咖啡店点单")
  })

  it("puts a requested memory first in review and keeps unknown ids on the default queue", () => {
    const state = createDefaultLearningMemory(now)
    const defaultQueue = getReviewQueue(state, now)

    expect(getReviewQueue(state, now, "in-stock")[0]?.id).toBe("in-stock")
    expect(getReviewQueue(state, now, "missing-memory")).toEqual(defaultQueue)
  })

  it("raises strength after successful use and records scene progress", () => {
    const state = createDefaultLearningMemory(now)
    const next = recordConversationMemory(
      state,
      {
        turnId: "user-1",
        sceneId: "restaurant",
        sceneTitle: "餐厅用餐",
        userInput: "Could I get the pasta, please?",
        targetExpression: "Could I get ..., please?",
        targetLabel: "礼貌提出请求",
        corrected: "Could I get the pasta, please?",
        explanation: "表达自然。",
        accurate: true,
      },
      now,
    )

    const memory = next.items.find((item) => item.id === "polite-request")
    expect(memory?.strength).toBe(73)
    expect(memory?.successfulRecalls).toBe(4)
    expect(next.sceneProgress.restaurant).toMatchObject({
      turns: 1,
      accurateTurns: 1,
    })
    expect(next.events[0]).toMatchObject({
      type: "conversation",
      successful: true,
      sceneId: "restaurant",
    })
  })

  it("records scene progress without creating an empty memory expression", () => {
    const state = createEmptyLearningMemory(now)
    const next = recordConversationMemory(
      state,
      {
        turnId: "user-2",
        sceneId: "coffee",
        sceneTitle: "咖啡店点单",
        userInput: "Thank you.",
        targetExpression: "",
        targetLabel: "本轮英文表达",
        corrected: "",
        explanation: "需要继续引导。",
        accurate: false,
      },
      now,
    )

    expect(next.items).toEqual([])
    // 回合本身仍被记录，否则重试会把这一轮计成两次；但它不产生记忆条目。
    expect(next.events).toEqual([
      expect.objectContaining({ type: "conversation", itemId: "", sceneId: "coffee" }),
    ])
    expect(next.sceneProgress.coffee?.turns).toBe(1)
    expect(next.sceneProgress.coffee?.practicedExpressions).toEqual([])
  })

  it("reschedules a forgotten item and exposes it as due", () => {
    const state = createDefaultLearningMemory(now)
    const next = recordReviewMemory(state, "clarify-trade-off", "again", now)
    const reviewed = next.items.find((item) => item.id === "clarify-trade-off")
    const afterTenMinutes = new Date(now.getTime() + 10 * 60 * 1000)

    expect(reviewed?.strength).toBe(24)
    expect(reviewed?.repetitions).toBe(0)
    expect(getDueMemoryItems(next, afterTenMinutes).map((item) => item.id)).toContain(
      "clarify-trade-off",
    )
  })

  it("retains the complete learning event history for period analytics", () => {
    const state = createDefaultLearningMemory(now)
    state.events = Array.from({ length: 130 }, (_, index) => ({
      id: `event-${index}`,
      type: "conversation" as const,
      itemId: "polite-request",
      sceneId: "coffee",
      successful: true,
      occurredAt: new Date(now.getTime() - index * 1_000).toISOString(),
    }))

    const next = recordReviewMemory(state, "polite-request", "good", now)

    expect(next.events).toHaveLength(131)
    expect(next.events.slice(1).map((event) => event.id)).toEqual(
      state.events.map((event) => event.id),
    )
  })

  it("returns only memories relevant to the current scene", () => {
    const state = createDefaultLearningMemory(now)
    const context = buildConversationMemoryContext(state, "restaurant")

    expect(context).toHaveLength(1)
    expect(context[0]).toMatchObject({
      id: "polite-request",
      source: "咖啡店点单",
    })
  })

  it("prioritizes the requested relevant memory in conversation context", () => {
    const state = createDefaultLearningMemory(now)
    state.items = state.items.map((item) =>
      item.id === "clarify-trade-off" || item.id === "in-stock"
        ? {
            ...item,
            transferTargets: [
              ...item.transferTargets,
              {
                sceneId: "restaurant",
                sceneTitle: "餐厅用餐",
                reason: "在餐厅场景中主动迁移",
              },
            ],
          }
        : item,
    )

    const context = buildConversationMemoryContext(state, "restaurant", "in-stock")

    expect(context.map((item) => item.id)).toEqual([
      "in-stock",
      "clarify-trade-off",
      "polite-request",
    ])
  })

  it("creates pronunciation memory and preserves measured shadowing scores", () => {
    const state = createEmptyLearningMemory(now)
    const next = recordShadowingMemory(
      state,
      {
        itemId: "shadowing-polite-request",
        sceneId: "coffee",
        sceneTitle: "咖啡店点单",
        label: "oat 发音与节奏",
        sentence: "Could I get a latte with oat milk, please?",
        focusWord: "oat",
        overallScore: 82,
        clarityScore: 84,
        fluencyScore: 79,
        rhythmScore: 83,
        durationSeconds: 4.2,
      },
      now,
    )

    expect(next.items[0]).toMatchObject({
      id: "shadowing-polite-request",
      kind: "pronunciation",
      strength: 52,
      encounters: 1,
    })
    expect(next.events[0]).toMatchObject({
      type: "shadowing",
      successful: true,
      shadowing: {
        overallScore: 82,
        clarityScore: 84,
        fluencyScore: 79,
        rhythmScore: 83,
        durationSeconds: 4.2,
      },
    })
  })

  it("keeps shadowing results separate from the source expression memory", () => {
    const state = createDefaultLearningMemory(now)
    const source = state.items.find((item) => item.id === "polite-request")
    const next = recordShadowingMemory(
      state,
      {
        itemId: "shadowing-memory-polite-request",
        sceneId: "restaurant",
        sceneTitle: "餐厅用餐",
        label: "something 发音与节奏",
        sentence: "Could I get something, please?",
        focusWord: "something",
        overallScore: 82,
        clarityScore: 84,
        fluencyScore: 79,
        rhythmScore: 83,
        durationSeconds: 4.2,
      },
      now,
    )

    expect(next.items.find((item) => item.id === "polite-request")).toEqual(source)
    expect(
      next.items.find((item) => item.id === "shadowing-memory-polite-request"),
    ).toMatchObject({
      kind: "pronunciation",
      sourceSceneId: "restaurant",
    })
  })

  it("brings an expression-library item into memory and schedules it for real recall", () => {
    const state = createEmptyLearningMemory(now)
    const next = recordLearningActivity(
      state,
      {
        type: "expression",
        input: {
          itemId: "expression-library-item-1",
          sceneCategory: "work",
          sceneTitle: "职场协作",
          label: "circle back",
          phrase: "circle back",
          explanation: "circle 表示绕回，back 表示稍后再谈。",
          example: "Let's circle back on this after lunch.",
          libraryKind: "phrasal-verb",
        },
      },
      now,
    )

    expect(next.items[0]).toMatchObject({
      id: "expression-library-item-1",
      kind: "expression",
      answer: "circle back",
      sourceSceneId: "work",
      encounters: 1,
      // 主动学习不是成功找回，因此起点低于对话中真正用出来的表达。
      strength: 49,
    })
    // 词库条目使用词库分类，不写入场景进度，避免污染场景完成度与地图进度。
    expect(next.sceneProgress).toEqual({})
    expect(next.events[0]).toMatchObject({
      type: "expression",
      successful: true,
      itemId: "expression-library-item-1",
    })
    // 立刻排入近期复习，后续间隔由真实评分决定。
    expect(next.items[0]?.nextReviewAt).toBe("2026-08-24T08:10:00.000Z")
    expect(getDueMemoryItems(next).map((item) => item.id)).toEqual([
      "expression-library-item-1",
    ])
  })

  it("classifies studied sentence patterns as grammar so the kind stays producible", () => {
    const state = createEmptyLearningMemory(now)
    const next = recordExpressionStudy(
      state,
      {
        itemId: "expression-library-item-2",
        sceneCategory: "work",
        sceneTitle: "职场协作",
        label: "Would you mind if",
        phrase: "Would you mind if",
        explanation: "用于提出礼貌请求的句型。",
        example: "Would you mind if I sat here?",
        libraryKind: "sentence-pattern",
      },
      now,
    )

    expect(next.items[0]?.kind).toBe("grammar")
  })

  it("increments the same memory item when an expression is studied repeatedly", () => {
    const state = createEmptyLearningMemory(now)
    const input = {
      itemId: "expression-library-item-3",
      sceneCategory: "social",
      sceneTitle: "日常社交",
      label: "keep an eye on",
      phrase: "keep an eye on",
      explanation: "eye 表示观察，keep 表示持续维持注意。",
      example: "Could you keep an eye on my bag?",
      libraryKind: "idiom",
    } as const

    const once = recordExpressionStudy(state, input, now)
    const twice = recordExpressionStudy(once, input, now)

    expect(twice.items).toHaveLength(1)
    expect(twice.items[0]).toMatchObject({
      id: "expression-library-item-3",
      encounters: 2,
      strength: 53,
    })
    expect(twice.events).toHaveLength(2)
  })

  it("records a recall attempt without granting the strength a self-rating would", () => {
    const state = createDefaultLearningMemory(now)
    const before = state.items.find((item) => item.id === "polite-request")

    const afterAttempt = recordRecallAttempt(state, {
      itemId: "polite-request",
      elapsedMs: 8_400,
    })
    const afterRating = rateMemory(
      recordRecallAttempt(afterAttempt, { itemId: "polite-request", elapsedMs: 8_400 }),
      { itemId: "polite-request", rating: "easy" },
    )

    const attempted = afterAttempt.items.find((item) => item.id === "polite-request")
    expect(attempted?.strength).toBe(before?.strength)
    expect(attempted?.encounters).toBe(before?.encounters)
    expect(attempted?.intervalDays).toBe(before?.intervalDays)
    // 观察到的尝试进入事件流，但没有成败结论。
    expect(afterAttempt.events[0]).toMatchObject({
      type: "recall",
      itemId: "polite-request",
      successful: false,
      recall: { elapsedMs: 8_400, rated: false },
    })

    // 自评才决定强度与间隔；回想尝试本身不足以证明想起了目标表达。
    const rated = afterRating.items.find((item) => item.id === "polite-request")
    expect(rated?.strength).toBe(clampScore((before?.strength ?? 0) + 20))
    expect(rated?.intervalDays).toBeGreaterThan(before?.intervalDays ?? 0)
    expect(afterRating.events.filter((event) => event.type === "recall")).toHaveLength(2)
    expect(afterRating.events.filter((event) => event.type === "review")).toHaveLength(1)
  })

  it("treats a retried turn as the same turn instead of a second practice", () => {
    const state = createDefaultLearningMemory(now)
    const turn = {
      turnId: "user-retry",
      sceneId: "restaurant",
      sceneTitle: "餐厅用餐",
      userInput: "Could I get the pasta, please?",
      targetExpression: "Could I get ..., please?",
      targetLabel: "礼貌提出请求",
      corrected: "Could I get the pasta, please?",
      explanation: "表达自然。",
      accurate: true,
    } as const

    const first = recordConversationMemory(state, turn, now)
    const retried = recordConversationMemory(first, turn, new Date(now.getTime() + 60_000))

    // 重试改写同一个回合：场景进度不翻倍，条目计数不翻倍，事件也只有一条。
    expect(retried.sceneProgress.restaurant?.turns).toBe(1)
    expect(retried.sceneProgress.restaurant?.accurateTurns).toBe(1)
    expect(retried.items.find((item) => item.id === "polite-request")?.encounters).toBe(
      first.items.find((item) => item.id === "polite-request")?.encounters,
    )
    expect(retried.items.find((item) => item.id === "polite-request")?.strength).toBe(
      first.items.find((item) => item.id === "polite-request")?.strength,
    )
    expect(retried.events.filter((event) => event.type === "conversation")).toHaveLength(1)
  })

  it("replaces the previous outcome when a retry improves or worsens the turn", () => {
    const state = createEmptyLearningMemory(now)
    const accurate = {
      turnId: "user-turn",
      sceneId: "coffee",
      sceneTitle: "咖啡店点单",
      userInput: "Do you still have this in stock?",
      targetExpression: "Do you still have this in stock?",
      targetLabel: "确认库存",
      corrected: "Do you still have this in stock?",
      explanation: "表达自然。",
      accurate: true,
    } as const

    const first = recordConversationMemory(state, accurate, now)
    const itemId = first.items[0]?.id
    const strengthAfterFirst = first.items[0]?.strength

    // 同一回合重试后被判定为需要改进，结论必须整体改写而不是叠加。
    const retried = recordConversationMemory(
      first,
      { ...accurate, accurate: false },
      new Date(now.getTime() + 60_000),
    )

    expect(retried.items.find((item) => item.id === itemId)?.strength).toBeLessThan(
      strengthAfterFirst ?? 100,
    )
    expect(retried.sceneProgress.coffee?.turns).toBe(1)
    expect(retried.sceneProgress.coffee?.accurateTurns).toBe(0)
    expect(retried.events.filter((event) => event.type === "conversation")).toHaveLength(1)
  })

  it("rolls a deleted turn back out of memory, progress and the transcript count", () => {
    const state = createDefaultLearningMemory(now)
    const recorded = recordConversationMemory(
      state,
      {
        turnId: "user-removed",
        sceneId: "restaurant",
        sceneTitle: "餐厅用餐",
        userInput: "Could I get the pasta, please?",
        targetExpression: "Could I get ..., please?",
        targetLabel: "礼貌提出请求",
        corrected: "Could I get the pasta, please?",
        explanation: "表达自然。",
        accurate: true,
      },
      now,
    )
    const before = recorded.items.find((item) => item.id === "polite-request")

    const forgotten = forgetConversationTurn(recorded, "user-removed", now)
    const after = forgotten.items.find((item) => item.id === "polite-request")

    // 删除回合后，这一轮不再占用任何记忆或进度。
    expect(after?.encounters).toBe((before?.encounters ?? 0) - 1)
    expect(after?.successfulRecalls).toBe((before?.successfulRecalls ?? 0) - 1)
    expect(after?.strength).toBe((before?.strength ?? 0) - 9)
    expect(forgotten.sceneProgress.restaurant?.turns).toBe(0)
    expect(forgotten.sceneProgress.restaurant?.accurateTurns).toBe(0)
    expect(forgotten.sceneProgress.restaurant?.practicedExpressions).toEqual([])
    expect(forgotten.events.some((event) => event.type === "conversation")).toBe(false)
  })

  it("keeps counters non-negative and ignores an unknown turn when forgetting", () => {
    const state = createEmptyLearningMemory(now)

    expect(forgetConversationTurn(state, "missing-turn", now)).toBe(state)

    const failed = recordConversationMemory(
      state,
      {
        turnId: "user-failed",
        sceneId: "coffee",
        sceneTitle: "咖啡店点单",
        userInput: "I want coffee.",
        targetExpression: "Could I get a coffee, please?",
        targetLabel: "礼貌提出请求",
        corrected: "Could I get a coffee, please?",
        explanation: "换成更礼貌的说法。",
        accurate: false,
      },
      now,
    )
    const forgotten = forgetConversationTurn(failed, "user-failed", now)

    expect(forgotten.items[0]?.encounters).toBe(0)
    expect(forgotten.items[0]?.lapseCount).toBe(0)
    expect(forgotten.items[0]?.strength).toBeGreaterThanOrEqual(0)
  })

  it("ignores a recall attempt for an unknown memory item", () => {
    const state = createDefaultLearningMemory(now)

    expect(recordRecallAttempt(state, { itemId: "missing", elapsedMs: 1_000 })).toBe(state)
  })

  it("routes every activity type through the unified writer", () => {
    const state = createDefaultLearningMemory(now)

    // 判别联合里的每个活动都必须能经由统一入口写入对应事件类型。
    const written = [
      recordLearningActivity(state, {
        type: "recall",
        input: { itemId: "polite-request", elapsedMs: 3_000 },
      }),
      recordLearningActivity(state, {
        type: "conversation",
        input: {
          turnId: "user-unified",
          sceneId: "coffee",
          sceneTitle: "咖啡店点单",
          userInput: "Could I get a latte, please?",
          targetExpression: "Could I get ..., please?",
          targetLabel: "礼貌提出请求",
          corrected: "Could I get a latte, please?",
          explanation: "表达自然。",
          accurate: true,
        },
      }),
      recordLearningActivity(state, {
        type: "review",
        input: { itemId: "clarify-trade-off", rating: "good" },
      }),
      recordLearningActivity(state, {
        type: "shadowing",
        input: {
          itemId: "shadowing-polite-request",
          sceneId: "coffee",
          sceneTitle: "咖啡店点单",
          label: "please 发音",
          sentence: "Could I get a latte, please?",
          focusWord: "please",
          overallScore: 82,
          clarityScore: 84,
          fluencyScore: 79,
          rhythmScore: 83,
          durationSeconds: 4.2,
        },
      }),
      recordLearningActivity(state, {
        type: "expression",
        input: {
          itemId: "expression-library-item-1",
          sceneCategory: "work",
          sceneTitle: "职场协作",
          label: "circle back",
          phrase: "circle back",
          explanation: "circle 表示绕回，back 表示稍后再谈。",
          example: "Let's circle back on this after lunch.",
          libraryKind: "phrasal-verb",
        },
      }),
    ].map((next) => next.events[0]?.type)

    expect(written).toEqual(["recall", "conversation", "review", "shadowing", "expression"])
    // 单一词表覆盖所有活动，新增类型不会漏掉任何消费方。
    expect(new Set(written)).toEqual(new Set(learningActivityTypes))
  })

  it("ignores blank expressions instead of creating an empty memory item", () => {
    const state = createEmptyLearningMemory(now)
    const next = recordExpressionStudy(
      state,
      {
        itemId: "expression-library-blank",
        sceneCategory: "social",
        sceneTitle: "日常社交",
        label: "   ",
        phrase: "   ",
        explanation: "空白条目。",
        example: "",
        libraryKind: "idiom",
      },
      now,
    )

    expect(next.items).toEqual([])
    expect(next.events).toEqual([])
  })
})
