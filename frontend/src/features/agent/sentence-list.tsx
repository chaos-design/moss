"use client"

import {
  ArrowRightIcon,
  AudioLinesIcon,
  LanguagesIcon,
  MessageCircleMoreIcon,
  SpellCheck2Icon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getDueSentenceItems,
  getSentenceItems,
  getSentenceSourceCount,
  type SentenceKindFilter,
} from "@/lib/learning-inbox"
import {
  createMemoryTargetHref,
  type LearningMemoryItem,
  type LearningMemoryKind,
} from "@/lib/memory"

const kindOptions: Array<{ value: SentenceKindFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "expression", label: "表达" },
  { value: "vocabulary", label: "词汇" },
  { value: "grammar", label: "语法" },
  { value: "pronunciation", label: "发音" },
]

const kindLabels: Record<LearningMemoryKind, string> = {
  expression: "表达",
  vocabulary: "词汇",
  grammar: "语法",
  pronunciation: "发音",
}

const kindIcons = {
  expression: MessageCircleMoreIcon,
  vocabulary: LanguagesIcon,
  grammar: SpellCheck2Icon,
  pronunciation: AudioLinesIcon,
}

function formatReviewDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function getSentenceHref(item: LearningMemoryItem, due: boolean) {
  if (due) {
    return createMemoryTargetHref("/workspace/review", item.id)
  }
  if (item.kind === "pronunciation") {
    return createMemoryTargetHref("/workspace/shadowing", item.id)
  }
  return createMemoryTargetHref(
    `/workspace/conversation?scene=${encodeURIComponent(item.sourceSceneId)}`,
    item.id,
  )
}

export function SentenceList() {
  const { state } = useLearningMemory()
  const [filter, setFilter] = useState<SentenceKindFilter>("all")
  const dueIds = useMemo(
    () => new Set(getDueSentenceItems(state.items).map((item) => item.id)),
    [state.items],
  )
  const sourceCount = useMemo(() => getSentenceSourceCount(state.items), [state.items])
  const filteredItems = useMemo(
    () => getSentenceItems(state.items, filter),
    [filter, state.items],
  )

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-3 border-y" aria-label="句子列表概览">
        <SentenceStat label="已记录" value={String(state.items.length)} />
        <SentenceStat label="待复习" value={String(dueIds.size)} />
        <SentenceStat label="来源场景" value={String(sourceCount)} />
      </section>

      <Tabs
        value={filter}
        onValueChange={(value) => setFilter(value as SentenceKindFilter)}
        className="gap-4"
      >
        <div className="sticky top-16 z-30 -mx-4 overflow-x-auto bg-background px-4 py-2 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          <TabsList
            className="h-9 min-w-max justify-start border bg-card p-1 shadow-sm"
            aria-label="筛选句子类型"
          >
            {kindOptions.map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="min-w-16 px-3 data-active:border-border data-active:bg-secondary data-active:ring-1 data-active:ring-border"
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {kindOptions.map((option) => (
          <TabsContent key={option.value} value={option.value}>
            {option.value === filter ? (
              <SentenceRows items={filteredItems} dueIds={dueIds} filter={filter} />
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function SentenceRows({
  items,
  dueIds,
  filter,
}: {
  items: LearningMemoryItem[]
  dueIds: ReadonlySet<string>
  filter: SentenceKindFilter
}) {
  if (items.length === 0) {
    return (
      <section className="border-y px-5 py-14 text-center" aria-live="polite">
        <p className="font-serif text-lg font-semibold">
          {filter === "all"
            ? "还没有记录句子"
            : `还没有${kindOptions.find((item) => item.value === filter)?.label}记录`}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          完成对话、复习、跟读或表达学习后，真实使用过的表达会出现在这里。点击进入练习，
          练习本身才会更新这条记忆。
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card" aria-label="已记录句子">
      {items.map((item, index) => {
        const Icon = kindIcons[item.kind]
        const due = dueIds.has(item.id)
        return (
          <article key={item.id} className={index > 0 ? "border-t" : undefined}>
            <Link
              href={getSentenceHref(item, due)}
              className="group grid min-w-0 gap-4 px-4 py-4 outline-none transition-colors hover:bg-secondary/45 focus-visible:bg-secondary/45 sm:grid-cols-[minmax(0,1fr)_180px_20px] sm:items-center md:px-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <Badge variant="secondary">{kindLabels[item.kind]}</Badge>
                  {due ? <Badge variant="outline">待复习</Badge> : null}
                  <span className="text-xs text-muted-foreground">{item.sourceSceneTitle}</span>
                </div>
                <h2 className="mt-2 font-serif text-base leading-7 sm:text-lg">
                  {item.answer}
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {item.explanation}
                </p>
              </div>

              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-muted-foreground">记忆强度</span>
                  <strong className="font-mono">{item.strength}%</strong>
                </div>
                <Progress
                  value={item.strength}
                  className="mt-2"
                  aria-label={`${item.label}记忆强度 ${item.strength}%`}
                />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {due ? "已到复习时间" : `下次复习 ${formatReviewDate(item.nextReviewAt)}`}
                </p>
              </div>

              <ArrowRightIcon
                className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
                aria-hidden="true"
              />
            </Link>
          </article>
        )
      })}
    </section>
  )
}

function SentenceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r px-3 py-4 last:border-r-0 sm:px-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold">{value}</p>
    </div>
  )
}
