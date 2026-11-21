import type { ExpressionLibraryItem } from "./expression-library-schema"
import { createExpressionMemoryItemId, type LearningMemoryItem } from "./memory/learning-memory"
import { isLibraryExpressionMemoryItem } from "./memory/review-scope"
import type { RecallRating } from "./memory/spaced-repetition"

/**
 * 艾宾浩斯记忆循环的纯编排逻辑：学习（未入长期记忆的条目优先）→ 复习（到期条目）
 * → 再记忆（评分「忘记了/有点难」的条目）。这里不依赖 React，便于独立测试；
 * 真正的间隔与强度变化交给 `recordExpressionStudy` 与 `rateReview` 写入长期记忆。
 */
export const ebbinghausBatchSize = 8

/** 忘记与吃力都算「没找回」，需要当场再记忆一次。 */
export function needsRememorize(rating: RecallRating): boolean {
  return rating === "again" || rating === "hard"
}

/**
 * 从当前筛选结果里挑本轮要学习的表达：先选尚未进入长期记忆的，不足再按记忆强度从弱到强补齐。
 * 学习顺序保持稳定，不在这里随机，避免同一轮里条目跳来跳去。
 */
export function buildEbbinghausLearnQueue(
  pool: readonly ExpressionLibraryItem[],
  memoryItems: readonly LearningMemoryItem[],
  limit = ebbinghausBatchSize,
): ExpressionLibraryItem[] {
  if (limit <= 0) {
    return []
  }
  const strengthByMemoryId = new Map(memoryItems.map((item) => [item.id, item.strength]))
  const memoryIds = new Set(strengthByMemoryId.keys())
  const fresh = pool.filter(
    (item) => !memoryIds.has(createExpressionMemoryItemId(item.clientId)),
  )
  if (fresh.length >= limit) {
    return fresh.slice(0, limit)
  }
  const existing = pool
    .filter((item) => memoryIds.has(createExpressionMemoryItemId(item.clientId)))
    .sort(
      (left, right) =>
        (strengthByMemoryId.get(createExpressionMemoryItemId(left.clientId)) ?? 0) -
        (strengthByMemoryId.get(createExpressionMemoryItemId(right.clientId)) ?? 0),
    )
  return [...fresh, ...existing].slice(0, limit)
}

/** 到期的地道表达记忆，按到期时间升序，用于复习阶段。 */
export function getDueExpressionMemoryItems(
  memoryItems: readonly LearningMemoryItem[],
  now = new Date(),
  limit = ebbinghausBatchSize,
): LearningMemoryItem[] {
  if (limit <= 0) {
    return []
  }
  const nowTime = now.getTime()
  return memoryItems
    .filter(
      (item) =>
        isLibraryExpressionMemoryItem(item) && new Date(item.nextReviewAt).getTime() <= nowTime,
    )
    .sort((left, right) => {
      const dueDifference =
        new Date(left.nextReviewAt).getTime() - new Date(right.nextReviewAt).getTime()
      return dueDifference || left.strength - right.strength
    })
    .slice(0, limit)
}

/** 记忆条目 id 形如 `expression-library-<clientId>`，反查词库条目用于展示与再记忆。 */
export function getClientIdFromExpressionMemoryId(memoryItemId: string): string | null {
  const prefix = "expression-library-"
  return memoryItemId.startsWith(prefix) ? memoryItemId.slice(prefix.length) : null
}

export function buildExpressionCatalogByClientId(items: readonly ExpressionLibraryItem[]) {
  const catalog = new Map<string, ExpressionLibraryItem>()
  for (const item of items) {
    catalog.set(item.clientId, item)
  }
  return catalog
}
