"use client"

import {
  ArrowRightIcon,
  AudioLinesIcon,
  BookOpenCheckIcon,
  CalendarClockIcon,
  CircleGaugeIcon,
  HistoryIcon,
  LanguagesIcon,
  MessageCircleMoreIcon,
  SpellCheck2Icon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIncrementalList } from "@/components/use-incremental-list"
import type { SentenceKindFilter } from "@/lib/learning-inbox"
import {
  createMemoryTargetHref,
  getDueMemoryItems,
  getLearningMemoryStats,
  type LearningMemoryKind,
  learningActivityLabels,
} from "@/lib/memory"
import { cn } from "@/lib/utils"

const kindLabels: Record<LearningMemoryKind, string> = {
  expression: "表达",
  grammar: "语法",
  pronunciation: "发音",
  vocabulary: "词汇",
}

const kindIcons = {
  expression: MessageCircleMoreIcon,
  grammar: SpellCheck2Icon,
  pronunciation: AudioLinesIcon,
  vocabulary: LanguagesIcon,
}

const kindFilters: Array<{ value: SentenceKindFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "expression", label: "表达" },
  { value: "vocabulary", label: "词汇" },
  { value: "grammar", label: "语法" },
  { value: "pronunciation", label: "发音" },
]

function formatMemoryDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function getReviewTiming(value: string) {
  const difference = new Date(value).getTime() - Date.now()
  if (difference <= 0) {
    return "现在到期"
  }

  const hours = Math.ceil(difference / (60 * 60 * 1000))
  if (hours < 24) {
    return `${hours} 小时后`
  }
  return `${Math.ceil(hours / 24)} 天后`
}

export function MemoryNotebook() {
  const { state } = useLearningMemory()
  const [filter, setFilter] = useState<SentenceKindFilter>("all")
  const stats = useMemo(() => getLearningMemoryStats(state), [state])
  const dueIds = useMemo(
    () => new Set(getDueMemoryItems(state).map((item) => item.id)),
    [state],
  )
  const items = useMemo(
    () =>
      state.items
        .filter((item) => filter === "all" || item.kind === filter)
        .sort((left, right) => left.strength - right.strength),
    [filter, state.items],
  )
  const { reset, sentinelRef, visibleCount } = useIncrementalList({
    total: items.length,
    initial: 12,
    step: 12,
  })
  const visibleItems = items.slice(0, visibleCount)
  const selectedLabel = kindFilters.find((option) => option.value === filter)?.label ?? "全部"

  return (
    <>
      <section className="grid grid-cols-2 border-y sm:grid-cols-4">
        <MemoryStat label="长期记忆" value={String(stats.memoryCount)} />
        <MemoryStat label="需要找回" value={String(stats.dueCount)} />
        <MemoryStat label="累计找回率" value={`${stats.recallRate}%`} />
        <MemoryStat label="对话准确度" value={`${stats.conversationAccuracy}%`} />
      </section>

      <Tabs
        value={filter}
        onValueChange={(value) => {
          setFilter(value as SentenceKindFilter)
          reset()
        }}
        className="gap-4"
      >
        {/* 吸顶条只保留最关键的两项计数与分类筛选，正文和四条统计仍随页面滚动。 */}
        <div className="sticky top-16 z-30 -mx-4 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          <div className="flex min-w-max items-center justify-between gap-4">
            <p className="shrink-0 text-xs text-muted-foreground">
              长期记忆{" "}
              <span className="font-mono text-sm font-semibold text-foreground">
                {stats.memoryCount}
              </span>
              <span className="mx-1.5 text-border">·</span>
              待找回{" "}
              <span className="font-mono text-sm font-semibold text-primary">
                {stats.dueCount}
              </span>
            </p>
            <TabsList
              className="h-8 justify-start border bg-card p-1 shadow-sm"
              aria-label="筛选记忆类型"
            >
              {kindFilters.map((option) => (
                <TabsTrigger
                  key={option.value}
                  value={option.value}
                  className="min-w-12 px-2 text-xs data-active:border-border data-active:bg-secondary data-active:ring-1 data-active:ring-border"
                >
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <TabsContent value={filter}>
          <section className="overflow-hidden rounded-lg border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <h2 className="font-serif text-lg font-semibold">Moss 的长期记忆</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  每条记忆保留来源、强度和下一次迁移场景。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {selectedLabel} · {items.length} 条
                </Badge>
                <Badge variant="outline">按记忆强度排序</Badge>
              </div>
            </header>
            <Separator />

            {visibleItems.length === 0 ? (
              <div className="px-5 py-14 text-center" aria-live="polite">
                <p className="font-serif text-lg font-semibold">
                  {filter === "all" ? "还没有形成长期记忆" : `还没有${selectedLabel}记录`}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  完成对话、复习、跟读或表达学习后，真实使用过的内容会出现在这里。
                </p>
              </div>
            ) : (
              visibleItems.map((item, index) => {
                const Icon = kindIcons[item.kind]
                const transferTarget = item.transferTargets[0]
                const needsReview = dueIds.has(item.id)
                const recallRate =
                  item.encounters > 0
                    ? Math.round((item.successfulRecalls / item.encounters) * 100)
                    : 0
                const latestEvent = state.events.find((event) => event.itemId === item.id)
                const href = needsReview
                  ? createMemoryTargetHref("/workspace/review", item.id)
                  : createMemoryTargetHref(
                      `/workspace/conversation?scene=${encodeURIComponent(
                        transferTarget?.sceneId ?? item.sourceSceneId,
                      )}`,
                      item.id,
                    )

                return (
                  <article key={item.id}>
                    <Link
                      href={href}
                      className="group block p-5 transition-colors hover:bg-secondary/45 md:p-6"
                    >
                      <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Icon className="size-4 text-primary" aria-hidden="true" />
                            <Badge variant="secondary">{kindLabels[item.kind]}</Badge>
                            {needsReview ? <Badge variant="outline">待找回</Badge> : null}
                          </div>
                          <h3 className="mt-3 text-base font-semibold">{item.label}</h3>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            来自 {item.sourceSceneTitle}
                          </p>

                          <div className="mt-5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">记忆强度</span>
                              <span
                                className={cn(
                                  "font-mono font-semibold",
                                  item.strength < 55 ? "text-primary" : "text-[var(--success)]",
                                )}
                              >
                                {item.strength}%
                              </span>
                            </div>
                            <Progress
                              value={item.strength}
                              className="mt-2"
                              aria-label={`${item.label}记忆强度 ${item.strength}%`}
                            />
                          </div>

                          <div className="mt-5 flex items-center gap-1.5 text-xs font-medium text-primary">
                            {needsReview ? "现在找回" : "进入迁移场景"}
                            <ArrowRightIcon
                              className="size-3.5 transition-transform group-hover:translate-x-0.5"
                              aria-hidden="true"
                            />
                          </div>
                        </div>

                        <div className="min-w-0 border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
                          <p className="text-[11px] text-muted-foreground">记忆线索</p>
                          <p className="mt-1 text-sm leading-6">{item.cue}</p>
                          <p className="mt-3 font-serif text-xl leading-8">{item.answer}</p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {item.explanation}
                          </p>

                          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
                            <MemoryMetric
                              label="成功找回"
                              value={`${item.successfulRecalls} / ${item.encounters}`}
                            />
                            <MemoryMetric label="找回率" value={`${recallRate}%`} />
                            <MemoryMetric label="遗忘次数" value={String(item.lapseCount)} />
                            <MemoryMetric
                              label="当前间隔"
                              value={
                                item.intervalDays === 0 ? "10 分钟" : `${item.intervalDays} 天`
                              }
                            />
                          </dl>

                          <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <div className="flex items-start gap-2">
                              <HistoryIcon
                                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <div>
                                <p className="text-[11px] text-muted-foreground">最近接触</p>
                                <p className="mt-1 text-xs leading-5">
                                  {formatMemoryDate(item.lastSeenAt)}
                                  {latestEvent
                                    ? ` · ${learningActivityLabels[latestEvent.type]}${
                                        latestEvent.successful ? "成功" : "需加强"
                                      }`
                                    : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <CalendarClockIcon
                                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <div>
                                <p className="text-[11px] text-muted-foreground">下次复习</p>
                                <p className="mt-1 text-xs leading-5">
                                  {getReviewTiming(item.nextReviewAt)} ·{" "}
                                  {formatMemoryDate(item.nextReviewAt)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-5 border-t pt-4">
                            <div className="flex items-center gap-2">
                              <CircleGaugeIcon
                                className="size-4 text-primary"
                                aria-hidden="true"
                              />
                              <p className="text-xs font-semibold">迁移计划</p>
                            </div>
                            {item.transferTargets.length > 0 ? (
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                {item.transferTargets.map((target) => (
                                  <div key={target.sceneId}>
                                    <p className="text-xs font-medium">{target.sceneTitle}</p>
                                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                      {target.reason}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-xs text-muted-foreground">
                                回到原场景继续巩固
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                    {index < visibleItems.length - 1 ? <Separator /> : null}
                  </article>
                )
              })
            )}
          </section>

          {items.length > 0 ? (
            <>
              <div
                ref={sentinelRef}
                className="grid min-h-8 place-items-center"
                aria-hidden="true"
              />
              <p className="text-center text-xs text-muted-foreground" aria-live="polite">
                已显示 {visibleItems.length} / {items.length} 条
              </p>
            </>
          ) : null}
        </TabsContent>
      </Tabs>

      <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <BookOpenCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        这里只记录真实发生的练习：对话回合、跟读录音、复习评分、表达学习和回想尝试。
        点击条目只是前往练习，不会改变任何记忆。
      </div>
    </>
  )
}

function MemoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r px-3 py-4 last:border-r-0 sm:px-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold">{value}</p>
    </div>
  )
}

function MemoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-3 py-3">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-xs font-semibold">{value}</dd>
    </div>
  )
}
