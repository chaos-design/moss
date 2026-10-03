import type { Metadata } from "next"
import { LearningMapWorkspace } from "@/features/analytics/learning-map-workspace"

export const metadata: Metadata = {
  title: "Learning Map",
  description: "根据真实练习记录查看语言学习阶段与动态进度。",
}

export default function LearningMapPage() {
  return <LearningMapWorkspace />
}
