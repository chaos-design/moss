"use client"

import { CalendarDaysIcon, ChartSplineIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { PageHeading } from "@/components/page-heading"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LearningActivityChart } from "@/features/analytics/learning-activity-chart"
import {
  LearningNextAction,
  LearningScoreSummary,
  LearningWeakPoints,
} from "@/features/analytics/learning-analytics-summary"
import {
  createLearningAnalytics,
  getNextLocalDayDelay,
  type LearningAnalyticsPeriod,
  learningAnalyticsPeriods,
} from "@/lib/learning-analytics"

const periodDescriptions: Record<Exclude<LearningAnalyticsPeriod, "stage">, string> = {
  "7d": "最近 7 个自然日",
  "30d": "最近 30 个自然日",
}

export function LearningAnalyticsWorkspace() {
  const { state } = useLearningMemory()
  const [period, setPeriod] = useState<LearningAnalyticsPeriod>("7d")
  const [today, setToday] = useState(() => new Date())
  const analytics = useMemo(
    () => createLearningAnalytics(state, period, today),
    [period, state, today],
  )
  const periodDescription =
    period === "stage" ? `当前 ${analytics.currentStage} 阶段` : periodDescriptions[period]

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setToday(new Date())
    }, getNextLocalDayDelay(today))
    return () => window.clearTimeout(timer)
  }, [today])

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <PageHeading
        eyebrow="Learning analytics"
        title="看见能力变化，而不只是学习时长。"
        description="趋势由对话、跟读和复习数据共同计算；问题会按重复频率与影响程度排序。"
        icon={ChartSplineIcon}
        motif="analytics"
        actions={
          <Select
            items={learningAnalyticsPeriods}
            value={period}
            onValueChange={(value) => {
              if (value === "7d" || value === "30d" || value === "stage") {
                setPeriod(value)
              }
            }}
          >
            <SelectTrigger aria-label="选择分析周期">
              <CalendarDaysIcon aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {learningAnalyticsPeriods.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      />

      <LearningScoreSummary summary={analytics.summary} />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="min-w-0 overflow-hidden rounded-lg border bg-card p-4 md:p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg font-semibold">每日有效练习</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {periodDescription} · 按功能统计真实学习事件
              </p>
            </div>
          </div>
          <LearningActivityChart
            activity={analytics.activity}
            eventCount={analytics.summary.eventCount}
          />
        </section>

        <LearningWeakPoints weakPoints={analytics.weakPoints} />
      </div>

      <LearningNextAction state={state} />
    </div>
  )
}
