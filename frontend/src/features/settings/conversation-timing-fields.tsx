"use client"

import { Clock3Icon } from "lucide-react"
import { memo, useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useConversationPrefs } from "@/features/conversation/use-conversation-prefs"
import { settingsCardHeightClass } from "@/features/settings/settings-layout"
import { cn } from "@/lib/utils"

/**
 * One preference field that keeps its typed value locally and only writes on blur.
 *
 * A controlled field bound straight to the shared store writes `localStorage` and notifies every
 * subscriber on each keystroke, so the digit keys of a timing field re-rendered the model-config
 * cards across the same page. Holding the draft here keeps that cost on this subtree.
 */
function BoundedNumberField({
  description,
  id,
  label,
  max,
  min,
  step,
  value,
  onCommit,
}: {
  description: string
  id: string
  label: string
  max: number
  min: number
  step: number
  value: number
  onCommit: (next: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = useCallback(() => {
    const parsed = Number(draft)
    const next = Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, Math.round(parsed)))
      : value
    setDraft(String(next))
    onCommit(next)
  }, [draft, max, min, onCommit, value])

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
      <FieldDescription>{description}</FieldDescription>
    </Field>
  )
}

/**
 * The three timing thresholds, laid out as one full-width row.
 *
 * Split from `SettingsForm` and memoized so its inputs do not re-render the prompt editor or the
 * model-config cards sitting beside them.
 */
export const ConversationTimingFields = memo(function ConversationTimingFields() {
  const { prefs, setPrefs } = useConversationPrefs()

  const commit = useCallback(
    (key: "sessionResumeMinutes" | "consecutiveQuestionDelayMs" | "voiceSentenceDelayMs") =>
      (next: number) =>
        setPrefs((current) => (current[key] === next ? current : { ...current, [key]: next })),
    [setPrefs],
  )

  const commitResume = useCallback(commit("sessionResumeMinutes"), [commit])
  const commitQuestionDelay = useCallback(commit("consecutiveQuestionDelayMs"), [commit])
  const commitVoiceDelay = useCallback(commit("voiceSentenceDelayMs"), [commit])

  return (
    <Card
      className={cn(
        "order-4 rounded-lg lg:col-span-2 lg:col-start-1 lg:row-start-3",
        settingsCardHeightClass,
      )}
    >
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Clock3Icon className="size-4 text-primary" aria-hidden="true" />
          会话与判句
        </CardTitle>
        <CardDescription>控制会话续接、多次提问合并和语音停顿判断。</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 overflow-y-auto overscroll-contain">
        <FieldGroup className="gap-4 lg:grid lg:grid-cols-3 lg:gap-5">
          <BoundedNumberField
            description="超过该时间后进入场景会创建新会话。"
            id="session-resume-minutes"
            label="会话续接时限（分钟）"
            max={240}
            min={5}
            step={5}
            value={prefs.sessionResumeMinutes}
            onCommit={commitResume}
          />
          <BoundedNumberField
            description="等待期间的新问题会合并到同一次回答。"
            id="question-delay"
            label="连续提问合并等待（毫秒）"
            max={3000}
            min={0}
            step={100}
            value={prefs.consecutiveQuestionDelayMs}
            onCommit={commitQuestionDelay}
          />
          <BoundedNumberField
            description="说话停顿后继续等待，避免慢速表达被截断。"
            id="voice-sentence-delay"
            label="语音识别判句等待（毫秒）"
            max={5000}
            min={800}
            step={100}
            value={prefs.voiceSentenceDelayMs}
            onCommit={commitVoiceDelay}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  )
})
