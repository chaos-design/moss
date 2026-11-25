"use client"

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  EyeIcon,
  RotateCcwIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { ExpressionText } from "@/components/expression-text"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ExpressionStudyGuide } from "@/features/expressions/expression-study-guide"
import {
  buildEbbinghausLearnQueue,
  buildExpressionCatalogByClientId,
  getClientIdFromExpressionMemoryId,
  getDueExpressionMemoryItems,
  needsRememorize,
} from "@/lib/expression-ebbinghaus"
import {
  createExpressionIdentity,
  type ExpressionLibraryItem,
  expressionKindLabels,
  expressionSceneCategoryLabels,
} from "@/lib/expression-library"
import type { RecallRating } from "@/lib/memory"
import {
  createExpressionMemoryItemId,
  type ExpressionProgressStatus,
  type ExpressionProgressUpdate,
  type LearningMemoryItem,
} from "@/lib/memory"
import { cn } from "@/lib/utils"

type Phase = "learn" | "review" | "rememorize" | "done"

/**
 * 复习卡片只关心「给出什么线索、答案是什么」，不绑定具体词库条目类型。
 * `origin` 区分刚学完的即时首次召回（学习步骤）与真正到期的间隔复习，避免把两者混为一谈。
 */
type ReviewStep = {
  id: string
  phrase: string
  meaning: string
  context: string
  example?: string
  exampleTranslation?: string
  item?: ExpressionLibraryItem
  origin: "fresh" | "due"
}

const ratings: Array<{
  label: string
  detail: string
  value: RecallRating
  variant: "default" | "outline"
}> = [
  { label: "忘记了", detail: "进入再记忆", value: "again", variant: "outline" },
  { label: "有点难", detail: "进入再记忆", value: "hard", variant: "outline" },
  { label: "记得", detail: "正常间隔", value: "good", variant: "default" },
  { label: "很轻松", detail: "延长间隔", value: "easy", variant: "outline" },
]

function toReviewStep(item: ExpressionLibraryItem): ReviewStep {
  return {
    id: createExpressionMemoryItemId(item.clientId),
    phrase: item.phrase,
    meaning: item.meaning,
    context: item.context,
    example: item.example,
    exampleTranslation: item.exampleTranslation,
    item,
    origin: "fresh",
  }
}

function stepFromMemoryItem(
  memoryItem: LearningMemoryItem,
  catalog: Map<string, ExpressionLibraryItem>,
): ReviewStep {
  const clientId = getClientIdFromExpressionMemoryId(memoryItem.id)
  const item = clientId ? catalog.get(clientId) : undefined
  if (item) {
    return { ...toReviewStep(item), id: memoryItem.id, origin: "due" }
  }
  return {
    id: memoryItem.id,
    phrase: memoryItem.answer,
    meaning: memoryItem.cue,
    context: memoryItem.explanation,
    origin: "due",
  }
}

export function ExpressionEbbinghausWorkspace({
  pool,
  catalogItems,
  memoryItems,
  onExit,
  onLearn,
  onRate,
  onProgress,
}: {
  pool: ExpressionLibraryItem[]
  catalogItems: readonly ExpressionLibraryItem[]
  memoryItems: readonly LearningMemoryItem[]
  onExit: () => void
  onLearn: (item: ExpressionLibraryItem) => void
  onRate: (memoryItemId: string, rating: RecallRating) => void
  onProgress: (identity: string, update: ExpressionProgressUpdate) => void
}) {
  const catalog = useMemo(() => buildExpressionCatalogByClientId(catalogItems), [catalogItems])

  // 一次会话只编排一次：组件由 workspace 用 session.id 作 key，重新进入会拿到全新状态。
  const [learnQueue] = useState(() => buildEbbinghausLearnQueue(pool, memoryItems))
  const [reviewQueue] = useState(() => {
    const learnedIds = new Set(
      learnQueue.map((item) => createExpressionMemoryItemId(item.clientId)),
    )
    const due = getDueExpressionMemoryItems(memoryItems).filter(
      (item) => !learnedIds.has(item.id),
    )
    return [
      ...learnQueue.map(toReviewStep),
      ...due.map((item) => stepFromMemoryItem(item, catalog)),
    ]
  })
  const [phase, setPhase] = useState<Phase>("learn")
  const [learnIndex, setLearnIndex] = useState(0)
  const [learnRevealed, setLearnRevealed] = useState(false)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [reviewRevealed, setReviewRevealed] = useState(false)
  const [rememorizeQueue, setRememorizeQueue] = useState<ReviewStep[]>([])
  const [rememorizeIndex, setRememorizeIndex] = useState(0)
  const [rememorizeRevealed, setRememorizeRevealed] = useState(false)
  const [counts, setCounts] = useState({
    learned: 0,
    reviewed: 0,
    freshReviewed: 0,
    dueReviewed: 0,
    rememorized: 0,
  })
  const [ratingCounts, setRatingCounts] = useState<Record<RecallRating, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  })

  const learnItem = learnQueue[learnIndex]
  const reviewStep = reviewQueue[reviewIndex]
  const rememorizeStep = rememorizeQueue[rememorizeIndex]

  const phaseSteps =
    phase === "learn"
      ? learnQueue.length
      : phase === "review"
        ? reviewQueue.length
        : rememorizeQueue.length
  const phaseIndex =
    phase === "learn" ? learnIndex : phase === "review" ? reviewIndex : rememorizeIndex
  const percent = phaseSteps > 0 ? Math.round(((phaseIndex + 1) / phaseSteps) * 100) : 100

  function advanceLearn(status: ExpressionProgressStatus) {
    if (!learnItem) {
      return
    }
    onLearn(learnItem)
    onProgress(createExpressionIdentity(learnItem), { status, incrementReviews: true })
    setCounts((current) => ({ ...current, learned: current.learned + 1 }))
    setLearnRevealed(false)
    if (learnIndex + 1 >= learnQueue.length) {
      setPhase(reviewQueue.length > 0 ? "review" : "done")
      return
    }
    setLearnIndex((current) => current + 1)
  }

  function handleRating(rating: RecallRating) {
    if (!reviewStep) {
      return
    }
    onRate(reviewStep.id, rating)
    setRatingCounts((current) => ({ ...current, [rating]: current[rating] + 1 }))
    setCounts((current) => ({
      ...current,
      reviewed: current.reviewed + 1,
      freshReviewed: current.freshReviewed + (reviewStep.origin === "fresh" ? 1 : 0),
      dueReviewed: current.dueReviewed + (reviewStep.origin === "due" ? 1 : 0),
    }))

    const needsRetry = needsRememorize(rating) && Boolean(reviewStep.item)
    if (needsRetry) {
      setRememorizeQueue((current) => [...current, reviewStep])
      setCounts((current) => ({ ...current, rememorized: current.rememorized + 1 }))
    }

    setReviewRevealed(false)
    if (reviewIndex + 1 >= reviewQueue.length) {
      setPhase(needsRetry || rememorizeQueue.length > 0 ? "rememorize" : "done")
      return
    }
    setReviewIndex((current) => current + 1)
  }

  function advanceRememorize() {
    if (!rememorizeStep?.item) {
      return
    }
    onLearn(rememorizeStep.item)
    onProgress(createExpressionIdentity(rememorizeStep.item), {
      status: "learning",
      incrementReviews: true,
    })
    setRememorizeRevealed(false)
    if (rememorizeIndex + 1 >= rememorizeQueue.length) {
      setPhase("done")
      return
    }
    setRememorizeIndex((current) => current + 1)
  }

  const phaseTitle =
    phase === "learn"
      ? "① 学习"
      : phase === "review"
        ? "② 复习"
        : phase === "rememorize"
          ? "③ 再记忆"
          : "记忆循环完成"

  return (
    <section className="flex min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-card">
      <header className="shrink-0 border-b px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="返回词库"
              onClick={onExit}
            >
              <ArrowLeftIcon />
            </Button>
            <h1 className="flex min-w-0 items-center gap-2 truncate text-base font-semibold">
              <BrainCircuitIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
              艾宾浩斯记忆 · {phaseTitle}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ExpressionStudyGuide target={{ kind: "ebbinghaus" }} />
            {phase !== "done" && phaseSteps > 0 ? (
              <span className="text-xs text-muted-foreground">
                {Math.min(phaseIndex + 1, phaseSteps)} / {phaseSteps}
              </span>
            ) : null}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          学习后立刻进入找回与再记忆，间隔与强度由长期记忆算法真实排期。
        </p>
        {phase !== "done" ? <Progress value={percent} className="mt-1" /> : null}
      </header>

      {phase === "learn" ? (
        learnItem ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">{expressionKindLabels[learnItem.kind]}</Badge>
              <Badge variant="outline">
                {expressionSceneCategoryLabels[learnItem.sceneCategory]}
              </Badge>
              <Badge variant="outline">首次学习</Badge>
            </div>
            <h3 className="break-words font-serif text-2xl font-semibold leading-snug">
              {learnItem.phrase}
            </h3>
            {!learnRevealed ? (
              <div className="grid gap-4 py-4">
                <p className="text-sm text-muted-foreground">
                  先在脑中回想它的含义和用法，再揭示答案。记住后这条表达会排入复习队列。
                </p>
                <Button type="button" onClick={() => setLearnRevealed(true)}>
                  <EyeIcon data-icon="inline-start" />
                  揭示答案
                </Button>
              </div>
            ) : (
              <div className="mt-4 grid gap-4">
                <div>
                  <p className="text-xs font-medium text-foreground">含义</p>
                  <p className="mt-1 leading-7">{learnItem.meaning}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">为什么这样表达</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {learnItem.why}
                  </p>
                </div>
                <blockquote className="border-l-2 border-primary/35 pl-3 font-serif text-sm leading-7">
                  <ExpressionText text={learnItem.example} phrase={learnItem.phrase} />
                </blockquote>
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLearnRevealed(false)}
                  >
                    <RotateCcwIcon data-icon="inline-start" />
                    再想一次
                  </Button>
                  <Button type="button" onClick={() => advanceLearn("learning")}>
                    记住了，下一题
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyPhase text="当前筛选结果里没有可学习的表达。" onClose={onExit} />
        )
      ) : null}

      {phase === "review" ? (
        reviewStep ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[10px] font-semibold uppercase text-primary">
                Recall from memory
              </p>
              <Badge variant={reviewStep.origin === "fresh" ? "secondary" : "default"}>
                {reviewStep.origin === "fresh" ? "刚学 · 即时召回" : "已到期 · 间隔复习"}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {reviewStep.origin === "fresh"
                ? "这条刚学完，先做一次即时回忆；真正的间隔复习会在到期后由复习页承接。"
                : "这条已到复习时间，按找回难度评分会真实重排下次到期时间。"}
            </p>
            <h3 className="mt-4 font-serif text-2xl font-semibold leading-snug">
              {reviewStep.meaning}
            </h3>
            {reviewStep.context ? (
              <p className="mt-2 text-sm text-muted-foreground">{reviewStep.context}</p>
            ) : null}
            {!reviewRevealed ? (
              <div className="mt-6 grid gap-4">
                <Button type="button" onClick={() => setReviewRevealed(true)}>
                  <EyeIcon data-icon="inline-start" />
                  显示表达
                </Button>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 border-y py-5">
                <p className="font-serif text-xl leading-8">{reviewStep.phrase}</p>
                {reviewStep.example ? (
                  <blockquote className="border-l-2 border-primary/35 pl-3 font-serif text-sm leading-7">
                    <ExpressionText text={reviewStep.example} phrase={reviewStep.phrase} />
                  </blockquote>
                ) : null}
                <div>
                  <p className="text-xs font-medium text-foreground">这次找回来了吗？</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {ratings.map((rating) => (
                      <Button
                        key={rating.value}
                        type="button"
                        variant={rating.variant}
                        className="h-14 flex-col gap-0.5 py-2.5"
                        onClick={() => handleRating(rating.value)}
                      >
                        <span>{rating.label}</span>
                        <span className="text-[10px] font-normal opacity-65">
                          {rating.detail}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyPhase text="复习队列为空。" onClose={onExit} />
        )
      ) : null}

      {phase === "rememorize" ? (
        rememorizeStep ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <p className="font-mono text-[10px] font-semibold uppercase text-primary">
              Re-learn
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              这条刚才没找回来。再读一遍并重新记住，它会以更短的间隔回到复习队列。
            </p>
            <h3 className="mt-4 break-words font-serif text-2xl font-semibold leading-snug">
              {rememorizeStep.phrase}
            </h3>
            {!rememorizeRevealed ? (
              <div className="mt-6 grid gap-4">
                <Button type="button" onClick={() => setRememorizeRevealed(true)}>
                  <EyeIcon data-icon="inline-start" />
                  再看一次
                </Button>
              </div>
            ) : (
              <div className="mt-5 grid gap-4">
                <p className="leading-7">{rememorizeStep.meaning}</p>
                {rememorizeStep.example ? (
                  <blockquote className="border-l-2 border-primary/35 pl-3 font-serif text-sm leading-7">
                    <ExpressionText
                      text={rememorizeStep.example}
                      phrase={rememorizeStep.phrase}
                    />
                  </blockquote>
                ) : null}
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRememorizeRevealed(false)}
                  >
                    再读一遍
                  </Button>
                  <Button type="button" onClick={advanceRememorize}>
                    重新记住了
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyPhase text="没有需要再记忆的表达。" onClose={onExit} />
        )
      ) : null}

      {phase === "done" ? (
        <div className="px-5 py-14 text-center" aria-live="polite">
          <CheckCircle2Icon
            className="mx-auto size-10 text-[var(--success)]"
            aria-hidden="true"
          />
          <h3 className="mt-4 font-serif text-xl font-semibold">这一轮记忆循环完成了</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            学习 {counts.learned} 条 · 即时召回 {counts.freshReviewed} 条 · 到期复习{" "}
            {counts.dueReviewed} 条 · 再记忆 {counts.rememorized} 条
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {(
              [
                ["忘记了", ratingCounts.again],
                ["有点难", ratingCounts.hard],
                ["记得", ratingCounts.good],
                ["很轻松", ratingCounts.easy],
              ] as const
            ).map(([label, count]) => (
              <span
                key={label}
                className="rounded-full border bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {label} {count}
              </span>
            ))}
          </div>
          <p className="mx-auto mt-5 max-w-md text-xs leading-6 text-muted-foreground">
            这些表达已按真实间隔排入长期记忆。到期后在复习页继续找回，别只用「再学一组」代替复习。
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button type="button" variant="outline" onClick={onExit}>
              返回词库
            </Button>
            <Link href="/workspace/review" className={cn(buttonVariants())}>
              去复习页
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function EmptyPhase({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="px-5 py-16 text-center" aria-live="polite">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button type="button" className="mt-5" onClick={onClose}>
        返回词库
      </Button>
    </div>
  )
}
