import type { ShadowingAssessment, ShadowingUtteranceRole } from "./shadowing-assessment"

export type ShadowingScoreDimension = {
  label: string
  value: number
  hint: string
}

type DimensionKey = "clarity" | "fluency" | "rhythm"

/** These are acoustic proxies, not a judgement of the words or intent of the line. */
const dimensionCopy: Record<
  ShadowingUtteranceRole,
  Record<DimensionKey, { label: string; hint: string }>
> = {
  partner: {
    clarity: { label: "角色发声", hint: "发声强弱与背景音的对比。" },
    fluency: { label: "角色连贯", hint: "有效发声占比和最长停顿。" },
    rhythm: { label: "角色节奏", hint: "录音时长与这句示范时长的接近程度。" },
  },
  learner: {
    clarity: { label: "表达发声", hint: "发声强弱与背景音的对比。" },
    fluency: { label: "表达连贯", hint: "有效发声占比和最长停顿。" },
    rhythm: { label: "表达节奏", hint: "录音时长与这句示范时长的接近程度。" },
  },
}

/** Put the component that carries more weight for the selected role first. */
export function getShadowingScoreDimensions(
  utteranceRole: ShadowingUtteranceRole,
  assessment: ShadowingAssessment,
): ShadowingScoreDimension[] {
  const copy = dimensionCopy[utteranceRole]
  const order: DimensionKey[] =
    utteranceRole === "partner"
      ? ["clarity", "fluency", "rhythm"]
      : ["fluency", "clarity", "rhythm"]
  return order.map((key) => ({
    label: copy[key].label,
    value:
      key === "clarity"
        ? assessment.clarityScore
        : key === "fluency"
          ? assessment.fluencyScore
          : assessment.rhythmScore,
    hint: copy[key].hint,
  }))
}

/** Actionable next step grounded in an actual measured acoustic dimension. */
export function getShadowingNextStep(
  utteranceRole: ShadowingUtteranceRole,
  assessment: ShadowingAssessment,
  focusWord: string,
) {
  if (assessment.overallScore >= 85) {
    return "本次发声与示范时长接近，可以进入场景应用。"
  }
  if (assessment.overallScore >= 70) {
    return utteranceRole === "partner"
      ? `扮演角色时试着突出 ${focusWord}，减少长停顿。`
      : `表达时试着把 ${focusWord} 前后的停顿连起来。`
  }
  return `先用 0.75× 听 ${focusWord}，再恢复到 1.0× 重新录制这一句。`
}
