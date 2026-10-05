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
import { useMemo } from "react"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  createMemoryTargetHref,
  getDueMemoryItems,
  getLearningMemoryStats,
  learningActivityLabels,
} from "@/lib/memory"
import { cn } from "@/lib/utils"

const kindLabels = {
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
  const stats = useMemo(() => getLearningMemoryStats(state), [state])
  const dueIds = useMemo(
    () => new Set(getDueMemoryItems(state).map((item) => item.id)),
    [state],
  )
  const items = useMemo(
    () => [...state.items].sort((left, right) => left.strength - right.strength),
    [state.items],
  )

  return (
    <>
      <section className="grid grid-cols-2 border-y sm:grid-cols-4">
        <MemoryStat label="长期记忆" value={String(stats.memoryCount)} />
        <MemoryStat label="需要找回" value={String(stats.dueCount)} />
        <MemoryStat label="累计找回率" value={`${stats.recallRate}%`} />
        <MemoryStat label="对话准确度" value={`${stats.conversationAccuracy}%`} />
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="font-serif text-lg font-semibold">Moss 的长期记忆</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              每条记忆保留来源、强度和下一次迁移场景。
            </p>
          </div>
          <Badge variant="outline">按记忆强度排序</Badge>
        </header>
        <Separator />

        {items.map((item, index) => {
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
                        value={item.intervalDays === 0 ? "10 分钟" : `${item.intervalDays} 天`}
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
                        <CircleGaugeIcon className="size-4 text-primary" aria-hidden="true" />
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
                        <p className="mt-2 text-xs text-muted-foreground">回到原场景继续巩固</p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
              {index < items.length - 1 ? <Separator /> : null}
            </article>
          )
        })}
      </section>

      <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <BookOpenCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        Moss 不会只记录“学过”。对话、复习和跟读结果会持续改变每条记忆的强度与下一步安排。
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
