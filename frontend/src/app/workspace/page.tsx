import type { Metadata } from "next"
import { LearningAgentDashboard } from "@/features/agent/learning-agent-dashboard"

export const metadata: Metadata = {
  title: "AI 学习 Agent",
  description: "根据长期学习记忆生成今日计划，并在新场景中主动复用学过的表达。",
}

export default function WorkspacePage() {
  return <LearningAgentDashboard />
}
