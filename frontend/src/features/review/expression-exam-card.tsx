"use client"

import {
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  LightbulbIcon,
  Volume2Icon,
  XCircleIcon,
} from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  type ExpressionExamQuestion,
  expressionExamKindLabels,
} from "@/features/review/expression-exam"
import { cn } from "@/lib/utils"

/**
 * 一道地道表达考题。作答前只给题干和选项；作答后同时给出正误、释义依据和完整例句，
 * 例句译文仍按需展开，避免学习者靠中文直接排除选项。
 */
export function ExpressionExamCard({
  question,
  chosenOptionId,
  answered,
  onChoose,
  onSkip,
  onPlayExample,
}: {
  question: ExpressionExamQuestion
  chosenOptionId: string | null
  answered: boolean
  onChoose: (optionId: string) => void
  onSkip: () => void
  onPlayExample?: () => void
}) {
  const [translationRevealed, setTranslationRevealed] = useState(false)
  const correct = chosenOptionId === question.correctOptionId
  const correctOption = question.options.find(
    (option) => option.id === question.correctOptionId,
  )
  const isCloze = question.kind === "cloze"

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Badge variant="secondary">考试模式</Badge>
        <Badge variant="outline">{expressionExamKindLabels[question.kind]}</Badge>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">{question.instruction}</p>
      <h2
        className={cn(
          "mt-3 text-center font-serif font-semibold",
          isCloze
            ? "text-lg leading-8 md:text-xl md:leading-9"
            : "text-2xl leading-10 md:text-3xl",
        )}
      >
        {question.prompt}
      </h2>
      {question.hint ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">{question.hint}</p>
      ) : null}

      <fieldset className="mt-6 grid gap-2">
        <legend className="sr-only">选项</legend>
        {question.options.map((option) => {
          const chosen = chosenOptionId === option.id
          const isCorrectOption = answered && option.id === question.correctOptionId
          const isWrongChoice = answered && chosen && !isCorrectOption
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={chosen}
              aria-disabled={answered}
              className={cn(
                "flex w-full items-start gap-3 rounded-md border bg-background px-3 py-2.5 text-left text-sm leading-6 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                !answered && "hover:bg-muted",
                chosen && !answered && "border-primary bg-primary/5",
                isCorrectOption &&
                  "border-[var(--success)] bg-[color-mix(in_oklch,var(--success),transparent_92%)]",
                isWrongChoice && "border-destructive bg-destructive/5",
                answered && !isCorrectOption && !isWrongChoice && "opacity-60",
              )}
              onClick={() => {
                if (!answered) {
                  onChoose(option.id)
                }
              }}
            >
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[10px] uppercase">
                {option.id}
              </span>
              <span className="min-w-0 flex-1">{option.label}</span>
              {isCorrectOption ? (
                <CheckCircle2Icon
                  className="mt-0.5 size-4 shrink-0 text-[var(--success)]"
                  aria-hidden="true"
                />
              ) : null}
              {isWrongChoice ? (
                <XCircleIcon
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          )
        })}
      </fieldset>

      {answered ? (
        <div className="mt-6 border-y py-5" aria-live="polite">
          <div className="flex items-center justify-center gap-2">
            {correct ? (
              <CheckCircle2Icon className="size-4 text-[var(--success)]" aria-hidden="true" />
            ) : (
              <XCircleIcon className="size-4 text-destructive" aria-hidden="true" />
            )}
            <p className="text-sm font-semibold">
              {correct ? "回答正确" : chosenOptionId ? "这道题没有答对" : "已直接查看答案"}
            </p>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            正确答案：
            <span className="font-medium text-foreground">{correctOption?.label}</span>
          </p>

          <div className="mt-5 flex items-start justify-center gap-2">
            <p className="font-serif text-lg leading-8">{question.example}</p>
            {onPlayExample ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="mt-1"
                aria-label="播放例句"
                onClick={onPlayExample}
              >
                <Volume2Icon />
              </Button>
            ) : null}
          </div>

          {question.exampleTranslation ? (
            <div className="mt-2 text-center">
              <button
                type="button"
                aria-expanded={translationRevealed}
                className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setTranslationRevealed((current) => !current)}
              >
                {translationRevealed ? (
                  <EyeOffIcon className="size-3.5" aria-hidden="true" />
                ) : (
                  <EyeIcon className="size-3.5" aria-hidden="true" />
                )}
                {translationRevealed ? "收起译文" : "显示译文"}
              </button>
              {translationRevealed ? (
                <p className="mt-1 text-xs leading-6 text-muted-foreground">
                  {question.exampleTranslation}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex items-start gap-2 rounded-md bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
            <LightbulbIcon
              className="mt-0.5 size-3.5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span>{question.explanation}</span>
          </div>
        </div>
      ) : (
        <div className="mt-5 text-center">
          <button
            type="button"
            className="rounded-sm text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onSkip}
          >
            跳过，直接看答案
          </button>
        </div>
      )}
    </div>
  )
}
