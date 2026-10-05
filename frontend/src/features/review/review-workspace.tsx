"use client"

import {
  ArrowRightIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  Clock3Icon,
  MapPinIcon,
  RotateCcwIcon,
  SparklesIcon,
  Volume2Icon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useLocalTts } from "@/features/speech/use-local-tts"
import type { LearningMemoryItem, RecallRating } from "@/lib/memory"
import { createMemoryTargetHref, getReviewQueue } from "@/lib/memory"
import { cn } from "@/lib/utils"

const ratings = [
  { label: "忘记了", detail: "10 分钟后", value: "again", variant: "outline" as const },
  { label: "有点难", detail: "缩短间隔", value: "hard", variant: "outline" as const },
  { label: "记得", detail: "正常间隔", value: "good", variant: "default" as const },
  { label: "很轻松", detail: "延长间隔", value: "easy", variant: "outline" as const },
] satisfies Array<{
  label: string
  detail: string
  value: RecallRating
  variant: "default" | "outline"
}>

export function ReviewWorkspace({ initialMemoryItemId }: { initialMemoryItemId?: string }) {
  const { hydrated, state, rateReview, recordRecallAttempt, syncStatus } = useLearningMemory()
  const { speak } = useLocalTts()
  const [lockedQueueIds, setLockedQueueIds] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)
  const [reviewedIds, setReviewedIds] = useState<string[]>([])
  const [revealed, setRevealed] = useState(false)
  const [completed, setCompleted] = useState(false)
  // 线索呈现的时间戳让回想尝试有真实时长，而不是一个恒为 0 的占位。
  const [cueShownAt, setCueShownAt] = useState<number | null>(null)
  const [memoryReady, setMemoryReady] = useState(
    () => hydrated && syncStatus !== "connecting" && syncStatus !== "syncing",
  )
  const queueIds =
    lockedQueueIds ??
    getReviewQueue(state, new Date(), initialMemoryItemId).map((item) => item.id)
  const queue = queueIds
    .map((id) => state.items.find((item) => item.id === id))
    .filter((item) => item !== undefined)
  const item = queue[index]
  const completedFocus = queue[0]
  const completedTarget = completedFocus
    ? (completedFocus.transferTargets[0] ?? {
        sceneId: completedFocus.sourceSceneId,
        sceneTitle: completedFocus.sourceSceneTitle,
      })
    : null
  const initialSyncSettled = hydrated && syncStatus !== "connecting" && syncStatus !== "syncing"

  // 切换到任何一条记忆都重新开始计时，让下次尝试的时长只覆盖当前这条。
  useEffect(() => {
    setCueShownAt(performance.now())
  }, [index, lockedQueueIds])

  useEffect(() => {
    if (initialSyncSettled) {
      setMemoryReady(true)
    }
  }, [initialSyncSettled])

  function handleReveal() {
    if (!item) {
      return
    }
    // 揭示答案本身就是一次可观测的回想尝试，与随后给出的自评分开记录。
    recordRecallAttempt({
      itemId: item.id,
      elapsedMs: cueShownAt === null ? 0 : performance.now() - cueShownAt,
    })
    setRevealed(true)
  }

  function handleRating(rating: (typeof ratings)[number]) {
    if (!item) {
      return
    }

    setLockedQueueIds(queue.map((candidate) => candidate.id))
    rateReview(item.id, rating.value)
    toast.success(`已记录：${rating.label}`)
    const nextReviewedIds = Array.from(new Set([...reviewedIds, item.id]))
    setReviewedIds(nextReviewedIds)
    if (nextReviewedIds.length >= queue.length) {
      setCompleted(true)
      setRevealed(false)
      return
    }
    const nextIndex = queue.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && !nextReviewedIds.includes(candidate.id),
    )
    const firstUnreviewedIndex = queue.findIndex(
      (candidate) => !nextReviewedIds.includes(candidate.id),
    )
    setIndex(nextIndex >= 0 ? nextIndex : Math.max(firstUnreviewedIndex, 0))
    setRevealed(false)
  }

  function selectReview(reviewIndex: number) {
    setLockedQueueIds(queue.map((candidate) => candidate.id))
    setIndex(reviewIndex)
    setRevealed(false)
  }

  function playAnswer() {
    if (!item) {
      return
    }
    void speak(item.answer, { speed: 0.9 }).catch((error) => {
      toast.error(error instanceof Error ? error.message : "TTS 播放失败")
    })
  }

  if (!memoryReady) {
    return (
      <section
        className="grid min-h-[520px] place-items-center border-y px-5 py-12 text-center"
        aria-live="polite"
      >
        <div>
          <BrainCircuitIcon
            className="mx-auto size-10 animate-pulse text-primary"
            aria-hidden="true"
          />
          <p className="mt-4 text-sm font-medium">正在读取学习记忆</p>
        </div>
      </section>
    )
  }

  if (!item && !completed) {
    return (
      <section className="flex min-h-[520px] flex-col items-center justify-center border-y px-5 py-12 text-center">
        <BrainCircuitIcon className="size-10 text-primary" aria-hidden="true" />
        <h2 className="mt-4 font-serif text-2xl font-semibold">暂无真实复习记录</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          完成一次对话并获得表达反馈后，需要巩固的内容会按实际表现进入这里。
        </p>
        <Link href="/workspace/scenes" className={cn(buttonVariants(), "mt-6")}>
          选择练习场景
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </section>
    )
  }

  if (completed) {
    return (
      <section className="flex min-h-[520px] flex-col items-center justify-center rounded-lg border bg-card px-5 py-12 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-[color-mix(in_oklch,var(--success),transparent_85%)] text-[var(--success)]">
          <CheckCircle2Icon className="size-6" aria-hidden="true" />
        </span>
        <p className="mt-5 font-mono text-[10px] font-semibold uppercase text-primary">
          Memory updated
        </p>
        <h2 className="mt-2 font-serif text-2xl font-semibold">本组记忆已经更新</h2>
        <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
          Moss 已根据你的找回难度重排复习时间。现在进入新场景，主动使用刚刚找回的表达。
        </p>
        <Link
          href={
            completedFocus && completedTarget
              ? createMemoryTargetHref(
                  `/workspace/conversation?scene=${encodeURIComponent(completedTarget.sceneId)}`,
                  completedFocus.id,
                )
              : "/workspace/scenes"
          }
          className={cn(buttonVariants({ size: "lg" }), "mt-6")}
        >
          {completedTarget ? `去${completedTarget.sceneTitle}复用` : "选择新场景"}
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </section>
    )
  }

  const progress = ((index + (revealed ? 0.5 : 0)) / queue.length) * 100

  return (
    <section className="grid min-h-0 min-w-0 gap-4 lg:h-full lg:grid-cols-[220px_minmax(0,1fr)_260px] xl:grid-cols-[248px_minmax(0,1fr)_300px]">
      <ReviewQueue
        currentIndex={index}
        items={queue}
        reviewedIds={reviewedIds}
        onSelect={selectReview}
      />

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card lg:h-full">
        <header className="shrink-0 px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <Badge variant="secondary" className="max-w-48 truncate">
                {item.sourceSceneTitle}
              </Badge>
              <span className="text-xs text-muted-foreground">
                第 {index + 1} 条，共 {queue.length} 条
              </span>
            </div>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress
            value={progress}
            className="mt-3"
            aria-label={`本组复习进度 ${Math.round(progress)}%`}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-y">
          <div className="flex min-h-full flex-col justify-center px-5 py-9 md:px-12">
            <div className="mx-auto w-full max-w-2xl text-center">
              <p className="font-mono text-[10px] font-semibold uppercase text-primary">
                Recall from context
              </p>
              <h2 className="mt-4 font-serif text-2xl font-semibold leading-10 md:text-3xl">
                {item.cue}
              </h2>

              {revealed ? (
                <div className="mt-8 border-y py-6">
                  <p className="text-xs text-muted-foreground">推荐表达</p>
                  <div className="mt-3 flex items-start justify-center gap-2">
                    <p className="font-serif text-xl leading-8 md:text-2xl">{item.answer}</p>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="mt-0.5"
                      aria-label="播放推荐表达"
                      onClick={playAnswer}
                    >
                      <Volume2Icon />
                    </Button>
                  </div>
                  <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
                    {item.explanation}
                  </p>
                </div>
              ) : (
                <div className="mt-7 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <RotateCcwIcon className="size-4 text-primary" aria-hidden="true" />
                  <span>先从情境中完整说出表达，再查看答案。</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="shrink-0 p-4">
          {revealed ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ratings.map((rating) => (
                <Button
                  key={rating.value}
                  variant={rating.variant}
                  className="h-14 flex-col gap-0.5 py-2.5"
                  onClick={() => handleRating(rating)}
                >
                  <span>{rating.label}</span>
                  <span className="text-[10px] font-normal opacity-65">{rating.detail}</span>
                </Button>
              ))}
            </div>
          ) : (
            <Button className="w-full" size="lg" onClick={handleReveal}>
              显示答案
            </Button>
          )}
        </footer>
      </div>

      <ReviewEvidence item={item} />
    </section>
  )
}

function ReviewQueue({
  currentIndex,
  items,
  onSelect,
  reviewedIds,
}: {
  currentIndex: number
  items: LearningMemoryItem[]
  onSelect: (index: number) => void
  reviewedIds: string[]
}) {
  return (
    <aside className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card lg:h-full lg:min-h-0">
      <header className="shrink-0 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BrainCircuitIcon className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">复习队列</h2>
          </div>
          <Badge variant="outline">{items.length} 条</Badge>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">按到期时间与记忆强度排序</p>
      </header>
      <div className="flex gap-1 overflow-x-auto overscroll-contain p-2 pt-0 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
        {items.map((review, reviewIndex) => {
          const current = reviewIndex === currentIndex
          const finished = reviewedIds.includes(review.id)
          return (
            <Button
              key={review.id}
              type="button"
              variant={current ? "secondary" : "ghost"}
              className="h-auto min-w-[218px] justify-start px-2 py-2.5 text-left lg:min-w-0"
              aria-current={current ? "step" : undefined}
              disabled={finished}
              onClick={() => onSelect(reviewIndex)}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border bg-background font-mono text-[10px]",
                  current && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {finished ? (
                  <CheckCircle2Icon className="size-3.5 text-[var(--success)]" />
                ) : (
                  reviewIndex + 1
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{review.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {review.strength}%
                  </span>
                </span>
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                  {review.sourceSceneTitle} · {review.intervalDays} 天
                </span>
              </span>
            </Button>
          )
        })}
      </div>
    </aside>
  )
}

function ReviewEvidence({ item }: { item: LearningMemoryItem }) {
  const recallRate =
    item.encounters > 0 ? Math.round((item.successfulRecalls / item.encounters) * 100) : 0

  return (
    <aside className="flex min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain lg:h-full lg:min-h-0">
      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold">记忆依据</h2>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border">
          <MemoryMetric label="当前强度" value={`${item.strength}%`} />
          <MemoryMetric label="累计找回率" value={`${recallRate}%`} />
          <MemoryMetric
            label="成功次数"
            value={`${item.successfulRecalls}/${item.encounters}`}
          />
          <MemoryMetric label="遗忘次数" value={String(item.lapseCount)} />
        </dl>
        <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Clock3Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>当前间隔 {item.intervalDays} 天，评分后会立即重排下次复习时间。</span>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2">
          <MapPinIcon className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold">迁移场景</h2>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {item.transferTargets.length > 0 ? (
            item.transferTargets.map((target) => (
              <Link
                key={target.sceneId}
                href={createMemoryTargetHref(
                  `/workspace/conversation?scene=${encodeURIComponent(target.sceneId)}`,
                  item.id,
                )}
                className="group rounded-md border bg-background p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                  {target.sceneTitle}
                  <ArrowRightIcon
                    className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
                  {target.reason}
                </span>
              </Link>
            ))
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              暂无额外迁移场景，完成本轮后回到来源场景继续使用。
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold">来源与说明</h2>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{item.explanation}</p>
        <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">
          来自 {item.sourceSceneTitle}
        </p>
      </section>
    </aside>
  )
}

function MemoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background p-3">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm font-semibold">{value}</dd>
    </div>
  )
}
