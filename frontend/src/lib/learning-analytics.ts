import { type SceneLevel, sceneItems } from "@/lib/demo-data"
import { getCurrentLearningLevel } from "@/lib/learning-progress"
import type {
  LearningActivityType,
  LearningMemoryEvent,
  LearningMemoryItem,
  LearningMemoryState,
} from "@/lib/memory/learning-memory"
import { learningActivityTypes } from "@/lib/memory/learning-memory"

export const learningAnalyticsPeriods = [
  { label: "最近 7 天", value: "7d" },
  { label: "最近 30 天", value: "30d" },
  { label: "本阶段", value: "stage" },
] as const

export type LearningAnalyticsPeriod = (typeof learningAnalyticsPeriods)[number]["value"]

/** 每种学习活动在每日活跃度里各占一个计数键，直接由单一词表派生。 */
export type LearningActivityPoint = {
  date: string
  label: string
} & Record<LearningActivityType, number>

export type LearningAnalyticsSummary = {
  activeMemoryCount: number
  conversationAccuracy: number | null
  eventCount: number
  /** 被实际想起过的次数，与"得出结论"的 review 事件分开统计。 */
  recallAttempts: number
  /** 揭示答案后没有给出自评的尝试数，代表尚未确认的记忆。 */
  unresolvedAttempts: number
  recallRate: number | null
}

export type LearningAnalyticsWeakPoint = {
  failureCount: number
  item: LearningMemoryItem
}

export type LearningAnalyticsView = {
  activity: LearningActivityPoint[]
  currentStage: SceneLevel
  events: LearningMemoryEvent[]
  summary: LearningAnalyticsSummary
  weakPoints: LearningAnalyticsWeakPoint[]
}

const dayLabelFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
})

function startOfDay(value: Date) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function getDayKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function percentage(successful: number, total: number) {
  return total > 0 ? Math.round((successful / total) * 100) : null
}

export function getNextLocalDayDelay(now = new Date()) {
  const nextDay = startOfDay(now)
  nextDay.setDate(nextDay.getDate() + 1)
  return Math.max(0, nextDay.getTime() - now.getTime())
}

export function getCurrentLearningStage(state: LearningMemoryState): SceneLevel {
  return getCurrentLearningLevel(sceneItems, state.sceneProgress)
}

export function getLearningAnalyticsEvents(
  state: LearningMemoryState,
  period: LearningAnalyticsPeriod,
  now = new Date(),
) {
  const endDate = startOfDay(now)
  endDate.setDate(endDate.getDate() + 1)
  const end = endDate.getTime()
  const validEvents = state.events.filter((event) => {
    const occurredAt = new Date(event.occurredAt).getTime()
    return Number.isFinite(occurredAt) && occurredAt < end
  })
  if (period === "stage") {
    const currentStage = getCurrentLearningStage(state)
    const stageSceneIds = new Set(
      sceneItems.filter((scene) => scene.level === currentStage).map((scene) => scene.id),
    )
    return validEvents.filter((event) => stageSceneIds.has(event.sceneId))
  }

  const dayCount = period === "7d" ? 7 : 30
  const startDate = startOfDay(now)
  startDate.setDate(startDate.getDate() - (dayCount - 1))
  const start = startDate.getTime()
  return validEvents.filter((event) => {
    const occurredAt = new Date(event.occurredAt).getTime()
    return occurredAt >= start && occurredAt < end
  })
}

function createActivityPoint(date: Date): LearningActivityPoint {
  const counts = {} as Record<LearningActivityType, number>
  for (const type of learningActivityTypes) {
    counts[type] = 0
  }
  return { date: getDayKey(date), label: dayLabelFormatter.format(date), ...counts }
}

function createActivityRange(start: Date, end: Date) {
  const points: LearningActivityPoint[] = []
  const cursor = startOfDay(start)
  const finalDay = startOfDay(end).getTime()
  while (cursor.getTime() <= finalDay) {
    points.push(createActivityPoint(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return points
}

export function getLearningActivity(
  events: readonly LearningMemoryEvent[],
  period: LearningAnalyticsPeriod,
  now = new Date(),
) {
  const periodStart = startOfDay(now)
  if (period === "stage" && events.length > 0) {
    let earliestEventTime = now.getTime()
    for (const event of events) {
      earliestEventTime = Math.min(earliestEventTime, new Date(event.occurredAt).getTime())
    }
    periodStart.setTime(earliestEventTime)
  } else if (period !== "stage") {
    periodStart.setDate(periodStart.getDate() - (period === "7d" ? 6 : 29))
  }
  const points = createActivityRange(periodStart, now)

  const pointsByDate = new Map(points.map((point) => [point.date, point]))
  for (const event of events) {
    const occurredAt = new Date(event.occurredAt)
    if (!Number.isFinite(occurredAt.getTime())) {
      continue
    }
    const point = pointsByDate.get(getDayKey(occurredAt))
    if (point) {
      point[event.type] += 1
    }
  }
  return points
}

export function createLearningAnalytics(
  state: LearningMemoryState,
  period: LearningAnalyticsPeriod,
  now = new Date(),
): LearningAnalyticsView {
  const events = getLearningAnalyticsEvents(state, period, now)
  const conversationEvents = events.filter((event) => event.type === "conversation")
  const reviewEvents = events.filter((event) => event.type === "review")
  // 回想尝试记录"被想起过"，自评记录"得出结论"。两者分开才能区分
  // 练过但没结论（reveal 后未评分）与真正完成的一次回忆。
  const recallEvents = events.filter((event) => event.type === "recall")
  const failureCounts = new Map<string, number>()
  for (const event of events) {
    // 回想尝试没有成败结论，把它算作失误会把"练过"误读成"没记住"。
    if (event.type !== "recall" && !event.successful) {
      failureCounts.set(event.itemId, (failureCounts.get(event.itemId) ?? 0) + 1)
    }
  }

  const weakPoints = state.items
    .flatMap((item) => {
      const failureCount = failureCounts.get(item.id) ?? 0
      return failureCount > 0 ? [{ failureCount, item }] : []
    })
    .sort(
      (left, right) =>
        right.failureCount - left.failureCount || left.item.strength - right.item.strength,
    )
    .slice(0, 4)

  return {
    activity: getLearningActivity(events, period, now),
    currentStage: getCurrentLearningStage(state),
    events,
    summary: {
      // 只统计真正落到记忆条目上的练习，没有目标表达的回合不计入活跃记忆。
      activeMemoryCount: new Set(
        events.filter((event) => event.itemId).map((event) => event.itemId),
      ).size,
      conversationAccuracy: percentage(
        conversationEvents.filter((event) => event.successful).length,
        conversationEvents.length,
      ),
      eventCount: events.length,
      recallAttempts: recallEvents.length,
      // 揭示答案后没有给出结论的尝试，说明这条记忆还没被真正确认。
      unresolvedAttempts: recallEvents.filter((event) => event.recall?.rated === false).length,
      recallRate: percentage(
        reviewEvents.filter((event) => event.successful).length,
        reviewEvents.length,
      ),
    },
    weakPoints,
  }
}
