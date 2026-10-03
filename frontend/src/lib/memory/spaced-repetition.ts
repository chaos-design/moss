export type RecallRating = "again" | "hard" | "good" | "easy"

export type ReviewState = {
  intervalDays: number
  easeFactor: number
  repetitions: number
  dueAt: string
}

const ratingFactor: Record<RecallRating, number> = {
  again: 0,
  hard: 1.2,
  good: 1,
  easy: 1.3,
}

export function scheduleReview(
  current: Omit<ReviewState, "dueAt">,
  rating: RecallRating,
  reviewedAt: Date,
): ReviewState {
  if (rating === "again") {
    return {
      intervalDays: 0,
      easeFactor: Math.max(1.3, current.easeFactor - 0.2),
      repetitions: 0,
      dueAt: new Date(reviewedAt.getTime() + 10 * 60 * 1000).toISOString(),
    }
  }

  const easeDelta = rating === "hard" ? -0.15 : rating === "easy" ? 0.15 : 0
  const easeFactor = Math.max(1.3, Math.min(3, current.easeFactor + easeDelta))
  const baseInterval =
    current.repetitions === 0 ? 1 : current.repetitions === 1 ? 3 : current.intervalDays
  const intervalDays = Math.max(1, Math.round(baseInterval * easeFactor * ratingFactor[rating]))
  const dueAt = new Date(reviewedAt)
  dueAt.setUTCDate(dueAt.getUTCDate() + intervalDays)

  return {
    intervalDays,
    easeFactor,
    repetitions: current.repetitions + 1,
    dueAt: dueAt.toISOString(),
  }
}
