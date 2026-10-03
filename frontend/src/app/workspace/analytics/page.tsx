import type { Metadata } from "next"
import { LearningAnalyticsWorkspace } from "@/features/analytics/learning-analytics-workspace"

export const metadata: Metadata = {
  title: "学习分析",
  description: "查看学习趋势、薄弱点与阶段性进步。",
}

export default function AnalyticsPage() {
  return <LearningAnalyticsWorkspace />
}
