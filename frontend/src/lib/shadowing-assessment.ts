export type ShadowingAssessment = {
  overallScore: number
  clarityScore: number
  fluencyScore: number
  rhythmScore: number
  durationSeconds: number
  voicedRatio: number
}

type ShadowingAssessmentInput = {
  durationSeconds: number
  expectedDurationSeconds: number
  rmsSamples: number[]
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function percentile(sortedValues: number[], ratio: number) {
  if (sortedValues.length === 0) {
    return 0
  }
  return sortedValues[
    Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * ratio))
  ]
}

export function estimateShadowingDuration(sentence: string, speed = 1) {
  const words = sentence.trim().split(/\s+/).filter(Boolean).length
  const punctuationPauses = sentence.match(/[,;:]/g)?.length ?? 0
  const normalizedSpeed = Math.min(1.5, Math.max(0.5, speed))
  return Math.max(1.5, words / 2.35 / normalizedSpeed + punctuationPauses * 0.18)
}

export function assessShadowingAttempt({
  durationSeconds,
  expectedDurationSeconds,
  rmsSamples,
}: ShadowingAssessmentInput): ShadowingAssessment {
  const normalizedDuration = Math.max(0, durationSeconds)
  const samples = rmsSamples.filter((sample) => Number.isFinite(sample) && sample >= 0)
  const sortedSamples = [...samples].sort((left, right) => left - right)
  const noiseFloor = percentile(sortedSamples, 0.2)
  const signalLevel = percentile(sortedSamples, 0.9)
  const threshold = Math.max(0.012, noiseFloor + (signalLevel - noiseFloor) * 0.22)
  const voiced = samples.map((sample) => sample >= threshold)
  const voicedCount = voiced.filter(Boolean).length
  const voicedRatio = samples.length > 0 ? voicedCount / samples.length : 0

  if (samples.length === 0 || signalLevel < 0.012 || voicedRatio < 0.05) {
    return {
      overallScore: 0,
      clarityScore: 0,
      fluencyScore: 0,
      rhythmScore: 0,
      durationSeconds: Number(normalizedDuration.toFixed(1)),
      voicedRatio: Number(voicedRatio.toFixed(2)),
    }
  }

  const sampleSeconds = normalizedDuration / samples.length
  let longestPauseSeconds = 0
  let currentPauseSamples = 0
  for (const active of voiced) {
    if (active) {
      longestPauseSeconds = Math.max(longestPauseSeconds, currentPauseSamples * sampleSeconds)
      currentPauseSamples = 0
    } else {
      currentPauseSamples += 1
    }
  }
  longestPauseSeconds = Math.max(longestPauseSeconds, currentPauseSamples * sampleSeconds)

  const signalContrast = Math.max(0, signalLevel - noiseFloor)
  const clarityScore = clampScore(42 + signalContrast * 620 + Math.min(voicedRatio, 0.7) * 28)
  const fluencyScore = clampScore(
    100 - Math.abs(voicedRatio - 0.68) * 105 - Math.max(0, longestPauseSeconds - 0.8) * 20,
  )
  const durationRatio =
    expectedDurationSeconds > 0 ? normalizedDuration / expectedDurationSeconds : 1
  const rhythmScore = clampScore(100 - Math.abs(durationRatio - 1) * 72)
  const overallScore = clampScore(clarityScore * 0.35 + fluencyScore * 0.35 + rhythmScore * 0.3)

  return {
    overallScore,
    clarityScore,
    fluencyScore,
    rhythmScore,
    durationSeconds: Number(normalizedDuration.toFixed(1)),
    voicedRatio: Number(voicedRatio.toFixed(2)),
  }
}
