"use client"

import { BrainCircuitIcon, TargetIcon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import type {
  LearningAnalyticsSummary as LearningAnalyticsSummaryData,
  LearningAnalyticsWeakPoint,
} from "@/lib/learning-analytics"
import type { LearningMemoryState } from "@/lib/memory"
import { createLearningPlan } from "@/lib/memory"
import { cn } from "@/lib/utils"

export function LearningScoreSummary({ summary }: { summary: LearningAnalyticsSummaryData }) {
  const items: Array<{ label: string; value: string; detail?: string }> = [
    {
      label: "表达准确度",
      value:
        summary.conversationAccuracy === null ? "暂无数据" : `${summary.conversationAccuracy}%`,
    },
    {
      label: "找回成功率",
      value: summary.recallRate === null ? "暂无数据" : `${summary.recallRate}%`,
    },
    {
      label: "主动回想",
      // 回想尝试与自评分开统计：前者是"被想起过"，后者才有成败结论。
      detail: `${summary.unresolvedAttempts} 次未确认`,
      value: String(summary.recallAttempts),
    },
    { label: "活跃记忆", value: String(summary.activeMemoryCount) },
    { label: "有效练习", value: String(summary.eventCount) },
  ]

  return (
    <section aria-label="真实能力指标" className="grid grid-cols-2 border-y sm:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`px-3 py-4 sm:px-5 ${
            index % 2 === 0 ? "border-r" : ""
          } ${index < 2 ? "border-b sm:border-b-0" : ""} ${
            index === 1 || index === 2 ? "sm:border-r" : ""
          }`}
        >
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <strong className="mt-2 block font-serif text-2xl font-semibold">{item.value}</strong>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {item.detail ?? "来自实际学习记录"}
          </p>
        </div>
      ))}
    </section>
  )
}

export function LearningWeakPoints({
  weakPoints,
}: {
  weakPoints: LearningAnalyticsWeakPoint[]
}) {
  return (
    <section className="min-w-0 rounded-lg border bg-card" aria-label="周期薄弱点">
      <header className="flex items-center gap-2 p-4">
        <TargetIcon className="size-4 text-primary" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold">高频薄弱点</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            按当前周期失误次数与记忆强度排序
          </p>
        </div>
      </header>
      {weakPoints.length > 0 ? (
        <div>
          {weakPoints.map(({ failureCount, item }) => (
            <div key={item.id} className="border-b px-4 py-4 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{item.label}</h3>
                <Badge variant="outline">{failureCount} 次失误</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {item.answer} · 当前强度 {item.strength}%
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          当前周期没有重复失误。
        </p>
      )}
    </section>
  )
}

export function LearningNextAction({ state }: { state: LearningMemoryState }) {
  const plan = useMemo(() => createLearningPlan(state), [state])

  return (
    <section className="rounded-lg border border-primary/20 bg-accent p-5 text-foreground md:p-6">
      <div className="flex items-start gap-3">
        <BrainCircuitIcon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-mono text-[10px] font-medium text-accent-foreground/80">
            NEXT BEST ACTION
          </p>
          <h2 className="mt-1 font-serif text-xl font-semibold">
            {plan ? plan.headline : "先完成一次真实场景对话"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-accent-foreground">
            {plan
              ? plan.reason
              : "当前没有可用于计算建议的学习记录，Moss 不会用模拟成绩填充分析。"}
          </p>
          <Link
            href={plan?.steps[0]?.href ?? "/workspace/scenes"}
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "mt-4")}
          >
            {plan ? "开始建议练习" : "选择场景"}
          </Link>
        </div>
      </div>
    </section>
  )
}
