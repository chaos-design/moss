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

const chartConfig = {
  conversation: {
    label: "AI 对话",
    color: "var(--chart-1)",
  },
  shadowing: {
    label: "影子跟读",
    color: "var(--chart-2)",
  },
  review: {
    label: "智能复习",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig

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
        <Line
          type="monotone"
          dataKey="conversation"
          stroke="var(--color-conversation)"
          strokeWidth={2}
          dot={showDots ? { r: 3 } : false}
        />
        <Line
          type="monotone"
          dataKey="shadowing"
          stroke="var(--color-shadowing)"
          strokeWidth={2}
          dot={showDots ? { r: 3 } : false}
        />
        <Line
          type="monotone"
          dataKey="review"
          stroke="var(--color-review)"
          strokeWidth={2}
          dot={showDots ? { r: 3 } : false}
        />
      </LineChart>
    </ChartContainer>
  )
}
