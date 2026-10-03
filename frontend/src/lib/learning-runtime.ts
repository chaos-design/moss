export type LearningSignal = {
  skill: string
  severity: number
  occurrences: number
  lastSeenAt: string
  improving: boolean
}

export type RankedWeakPoint = LearningSignal & {
  priority: number
}

export function rankWeakPoints(signals: LearningSignal[], now: Date): RankedWeakPoint[] {
  return signals
    .map((signal) => {
      const ageDays = Math.max(
        0,
        (now.getTime() - new Date(signal.lastSeenAt).getTime()) / 86_400_000,
      )
      const recency = Math.max(0.2, 1 - ageDays / 30)
      const improvementDiscount = signal.improving ? 0.8 : 1
      const priority =
        signal.severity * 0.5 +
        Math.min(signal.occurrences, 10) * 0.3 +
        recency * 2 * improvementDiscount

      return { ...signal, priority: Number(priority.toFixed(2)) }
    })
    .sort((left, right) => right.priority - left.priority)
}

export function canAdvanceLearningNode(metrics: {
  completedScenes: number
  requiredScenes: number
  recallRate: number
  accuracy: number
}) {
  return (
    metrics.completedScenes >= metrics.requiredScenes &&
    metrics.recallRate >= 0.8 &&
    metrics.accuracy >= 0.75
  )
}
