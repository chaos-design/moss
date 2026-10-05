import { describe, expect, it } from "vitest"
import {
  createLearningAnalytics,
  getCurrentLearningStage,
  getLearningAnalyticsEvents,
  getNextLocalDayDelay,
} from "@/lib/learning-analytics"
import {
  createDefaultLearningMemory,
  type LearningMemoryEvent,
  type LearningMemoryState,
} from "@/lib/memory"

const now = new Date("2026-08-29T12:00:00")

function createEvent(
  id: string,
  type: LearningMemoryEvent["type"],
  itemId: string,
  sceneId: string,
  successful: boolean,
  daysAgo: number,
): LearningMemoryEvent {
  const occurredAt = new Date(now)
  occurredAt.setDate(occurredAt.getDate() - daysAgo)
  return {
    id,
    type,
    itemId,
    sceneId,
    successful,
    occurredAt: occurredAt.toISOString(),
  }
}

function createAnalyticsState(): LearningMemoryState {
  const state = createDefaultLearningMemory(now)
  return {
    ...state,
    events: [
      createEvent("today-conversation", "conversation", "polite-request", "coffee", true, 0),
      createEvent("six-days-review", "review", "polite-request", "coffee", false, 6),
      createEvent("seven-days-shadowing", "shadowing", "theta-sound", "coffee", true, 7),
      createEvent(
        "twenty-nine-days-review",
        "review",
        "clarify-trade-off",
        "meeting",
        true,
        29,
      ),
      createEvent(
        "thirty-days-conversation",
        "conversation",
        "clarify-trade-off",
        "meeting",
        false,
        30,
      ),
      {
        ...createEvent("invalid", "review", "polite-request", "coffee", false, 0),
        occurredAt: "invalid",
      },
    ],
  }
}

describe("learning analytics", () => {
  it("uses inclusive natural-day boundaries for 7 and 30 day periods", () => {
    const state = createAnalyticsState()

    expect(getLearningAnalyticsEvents(state, "7d", now).map((event) => event.id)).toEqual([
      "today-conversation",
      "six-days-review",
    ])
    expect(getLearningAnalyticsEvents(state, "30d", now).map((event) => event.id)).toEqual([
      "today-conversation",
      "six-days-review",
      "seven-days-shadowing",
      "twenty-nine-days-review",
    ])
  })

  it("filters the stage period by the current learning-map level", () => {
    const state = createAnalyticsState()

    expect(getCurrentLearningStage(state)).toBe("A2")
    expect(getLearningAnalyticsEvents(state, "stage", now).map((event) => event.id)).toEqual([
      "today-conversation",
      "six-days-review",
      "seven-days-shadowing",
    ])
  })

  it("derives every summary region from the selected period", () => {
    const analytics = createLearningAnalytics(createAnalyticsState(), "7d", now)

    expect(analytics.activity).toHaveLength(7)
    expect(analytics.activity.reduce((sum, day) => sum + day.conversation, 0)).toBe(1)
    expect(analytics.activity.reduce((sum, day) => sum + day.review, 0)).toBe(1)
    expect(analytics.summary).toEqual({
      activeMemoryCount: 1,
      conversationAccuracy: 100,
      eventCount: 2,
      recallRate: 0,
    })
    expect(analytics.weakPoints).toEqual([
      expect.objectContaining({
        failureCount: 1,
        item: expect.objectContaining({ id: "polite-request" }),
      }),
    ])
  })

  it("keeps all stage dates and returns a stable empty chart point", () => {
    const state = createAnalyticsState()
    const activity = createLearningAnalytics(state, "stage", now).activity
    expect(activity).toHaveLength(8)
    expect(activity[2]).toMatchObject({
      conversation: 0,
      review: 0,
      shadowing: 0,
      expression: 0,
    })

    const empty = createLearningAnalytics({ ...state, events: [] }, "stage", now)
    expect(empty.activity).toEqual([
      expect.objectContaining({
        conversation: 0,
        review: 0,
        shadowing: 0,
        expression: 0,
      }),
    ])
  })

  it("counts every learning activity type, including expression study", () => {
    const state = createAnalyticsState()
    state.events.push(
      createEvent("today-expression", "expression", "expression-library-item-1", "work", true, 0),
    )

    const analytics = createLearningAnalytics(state, "7d", now)
    const today = analytics.activity.at(-1)

    expect(today?.expression).toBe(1)
    expect(today?.conversation).toBe(1)
    expect(today?.review).toBe(0)
    // 词库学习使用词库分类而不是场景 ID，因此不进入按场景筛选的阶段口径。
    expect(analytics.summary.eventCount).toBe(3)
    // 表达学习不是回忆尝试，也不计入对话准确度。
    expect(analytics.summary.recallRate).toBe(0)
    expect(analytics.summary.conversationAccuracy).toBe(100)
  })

  it("distinguishes missing samples from a zero-percent result", () => {
    const state = createAnalyticsState()
    state.events = [
      createEvent("shadowing-only", "shadowing", "theta-sound", "coffee", true, 0),
    ]

    expect(createLearningAnalytics(state, "7d", now).summary).toMatchObject({
      conversationAccuracy: null,
      recallRate: null,
    })
  })

  it("calculates the delay until the next local calendar day", () => {
    expect(getNextLocalDayDelay(new Date("2026-08-29T23:59:50"))).toBe(10_000)
  })
})
