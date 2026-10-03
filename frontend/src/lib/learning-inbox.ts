import type { LearningMemoryItem, LearningMemoryKind } from "@/lib/memory"

export type SentenceKindFilter = "all" | LearningMemoryKind

export function getSentenceItems(
  items: readonly LearningMemoryItem[],
  filter: SentenceKindFilter = "all",
) {
  return items
    .filter((item) => filter === "all" || item.kind === filter)
    .sort(
      (left, right) =>
        new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime(),
    )
}

export function getDueSentenceItems(items: readonly LearningMemoryItem[], now = new Date()) {
  const nowTime = now.getTime()
  return items
    .filter((item) => new Date(item.nextReviewAt).getTime() <= nowTime)
    .sort(
      (left, right) =>
        new Date(left.nextReviewAt).getTime() - new Date(right.nextReviewAt).getTime(),
    )
}

export function getSentenceSourceCount(items: readonly LearningMemoryItem[]) {
  return new Set(items.map((item) => item.sourceSceneId)).size
}
