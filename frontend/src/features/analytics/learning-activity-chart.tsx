"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { LearningActivityPoint } from "@/lib/learning-analytics"
import {
  type LearningActivityType,
  learningActivityLabels,
  learningActivityTypes,
} from "@/lib/memory"

// 每种学习活动各占一个固定图表色，新增活动类型只在此追加而不会打乱已有配色。
const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

const chartConfig = Object.fromEntries(
  learningActivityTypes.map((type, index) => [
    type,
    { label: learningActivityLabels[type], color: chartColors[index] ?? "var(--chart-1)" },
  ]),
) satisfies ChartConfig

export function LearningActivityChart({
  activity,
  eventCount,
}: {
  activity: LearningActivityPoint[]
  eventCount: number
}) {
  if (eventCount === 0) {
    return (
      <div
        className="grid h-[280px] min-h-[280px] place-items-center text-center text-sm text-muted-foreground"
        role="status"
      >
        当前周期暂无学习事件
      </div>
    )
  }

  const showDots = activity.length <= 14

  return (
    <ChartContainer config={chartConfig} className="h-[280px] min-h-[280px] w-full">
      <LineChart accessibilityLayer data={activity} margin={{ left: -18, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={18}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
        {learningActivityTypes.map((type) => (
          <Line
            key={type}
            type="monotone"
            dataKey={type satisfies LearningActivityType}
            stroke={`var(--color-${type})`}
            strokeWidth={2}
            dot={showDots ? { r: 3 } : false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
