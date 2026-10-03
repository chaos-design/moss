"use client"

import { ArrowRightIcon, BellIcon, CheckCircle2Icon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { getDueSentenceItems } from "@/lib/learning-inbox"
import { createMemoryTargetHref } from "@/lib/memory"

function formatDueTime(value: string) {
  const date = new Date(value)
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function LearningNotifications() {
  const { state } = useLearningMemory()
  const dueItems = useMemo(() => getDueSentenceItems(state.items), [state.items])
  const countLabel = dueItems.length > 99 ? "99+" : String(dueItems.length)

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={
              dueItems.length > 0 ? `查看学习提醒，${dueItems.length} 条待复习` : "查看学习提醒"
            }
          />
        }
      >
        <BellIcon aria-hidden="true" />
        {dueItems.length > 0 ? (
          <span className="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[9px] leading-4 text-primary-foreground">
            {countLabel}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-24px))] gap-0 p-0">
        <PopoverHeader className="border-b px-4 py-3">
          <PopoverTitle>学习提醒</PopoverTitle>
          <PopoverDescription>
            {dueItems.length > 0
              ? `${dueItems.length} 条记忆已到找回时间`
              : "当前没有需要处理的复习"}
          </PopoverDescription>
        </PopoverHeader>

        {dueItems.length > 0 ? (
          <div className="max-h-80 overflow-y-auto py-1">
            {dueItems.map((item) => (
              <Link
                key={item.id}
                href={createMemoryTargetHref("/workspace/review", item.id)}
                className="group flex min-w-0 items-start gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
              >
                <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{item.label}</span>
                  <span className="mt-1 block font-serif text-sm leading-5">{item.answer}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {item.sourceSceneTitle} · 原定 {formatDueTime(item.nextReviewAt)}
                  </span>
                </span>
                <ArrowRightIcon
                  className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-3 px-4 py-5">
            <CheckCircle2Icon
              className="mt-0.5 size-5 shrink-0 text-[var(--success)]"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium">今天的找回任务已处理完</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                新的提醒会根据实际练习结果和复习时间生成。
              </p>
            </div>
          </div>
        )}

        <div className="border-t p-2">
          <Link
            href="/workspace/sentences"
            className="flex min-h-9 items-center justify-between rounded-md px-2 text-xs font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            查看全部句子
            <ArrowRightIcon className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
