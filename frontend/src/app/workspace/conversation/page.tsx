import type { Metadata } from "next"
import { ConversationWorkspace } from "@/features/conversation/conversation-workspace"
import { getConversationScene } from "@/lib/conversation-scenes"

export const metadata: Metadata = {
  title: "AI 对话",
  description: "在连续情景中进行中英文对话、纠错与知识找回。",
}

export default async function ConversationPage({
  searchParams,
}: {
  searchParams: Promise<{
    memory?: string | string[]
    scene?: string | string[]
  }>
}) {
  const resolvedSearchParams = await searchParams
  const requestedScene = Array.isArray(resolvedSearchParams.scene)
    ? resolvedSearchParams.scene[0]
    : resolvedSearchParams.scene
  const scene = getConversationScene(requestedScene)
  const focusMemoryItemId = Array.isArray(resolvedSearchParams.memory)
    ? resolvedSearchParams.memory[0]
    : resolvedSearchParams.memory

  return (
    <ConversationWorkspace
      key={`${scene.id}:${focusMemoryItemId ?? ""}`}
      focusMemoryItemId={focusMemoryItemId}
      scene={scene}
      restoreLastScene={!requestedScene}
    />
  )
}
