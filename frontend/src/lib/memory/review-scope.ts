import type { LearningMemoryItem, LearningMemoryState } from "./learning-memory"

/**
 * 复习范围：一次只练一类内容，或把两类混在一组里。
 *
 * 「地道表达」指从词库主动加入长期记忆的条目（id 前缀 `expression-library-`）；其余条目
 * 来自对话、跟读与场景练习，统一算作「场景」。范围只影响队列构成，不改变间隔重复算法。
 */
export const reviewScopes = ["mixed", "expression", "scene"] as const

export type ReviewScope = (typeof reviewScopes)[number]

export const reviewScopeStorageKey = "moss:review-scope:v1"

export const reviewScopeLabels: Record<ReviewScope, string> = {
  mixed: "混合",
  expression: "地道表达",
  scene: "场景",
}

export const reviewScopeDescriptions: Record<ReviewScope, string> = {
  mixed: "地道表达与场景记忆混排，按到期时间与强度调度。",
  expression: "只复习词库里主动加入的表达，用考题确认释义、拼写与用法。",
  scene: "只复习对话与跟读留下的情境记忆，按线索找回完整表达。",
}

const libraryExpressionItemPrefix = "expression-library-"

export function isLibraryExpressionMemoryItem(item: Pick<LearningMemoryItem, "id">) {
  return item.id.startsWith(libraryExpressionItemPrefix)
}

export function matchesReviewScope(item: LearningMemoryItem, scope: ReviewScope) {
  if (scope === "mixed") {
    return true
  }
  const isExpression = isLibraryExpressionMemoryItem(item)
  return scope === "expression" ? isExpression : !isExpression
}

export function parseReviewScope(value: string | null | undefined): ReviewScope {
  return reviewScopes.includes(value as ReviewScope) ? (value as ReviewScope) : "mixed"
}

/**
 * 按范围取队列：先排到期项，数量不足三条时用范围内最弱的条目补足；目标记忆固定首位。
 * 与 `getReviewQueue` 的区别只在候选集合，调度顺序完全一致。
 */
export function getScopedReviewQueue(
  state: LearningMemoryState,
  options: {
    now?: Date
    targetMemoryItemId?: string
    scope?: ReviewScope
  } = {},
) {
  const now = options.now ?? new Date()
  const scope = options.scope ?? "mixed"
  const scopedItems = state.items.filter((item) => matchesReviewScope(item, scope))
  const nowTime = now.getTime()
  const dueItems = [...scopedItems]
    .filter((item) => new Date(item.nextReviewAt).getTime() <= nowTime)
    .sort((left, right) => {
      const dueDifference =
        new Date(left.nextReviewAt).getTime() - new Date(right.nextReviewAt).getTime()
      return dueDifference || left.strength - right.strength
    })
  const dueIds = new Set(dueItems.map((item) => item.id))
  const defaultQueue =
    dueItems.length >= 3
      ? dueItems
      : [
          ...dueItems,
          ...scopedItems
            .filter((item) => !dueIds.has(item.id))
            .sort((left, right) => left.strength - right.strength),
        ].slice(0, 3)
  const target = scopedItems.find((item) => item.id === options.targetMemoryItemId)
  return target
    ? [target, ...defaultQueue.filter((item) => item.id !== target.id)]
    : defaultQueue
}
