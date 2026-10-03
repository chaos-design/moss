import { AudioWaveformIcon } from "lucide-react"
import type { Metadata } from "next"
import { PageHeading } from "@/components/page-heading"
import { Badge } from "@/components/ui/badge"
import { ShadowingWorkspace } from "@/features/shadowing/shadowing-workspace"

export const metadata: Metadata = {
  title: "影子跟读",
  description: "按听力、跟读和应用三个阶段练习真实语音表达。",
}

export default async function ShadowingPage({
  searchParams,
}: {
  searchParams: Promise<{ memory?: string | string[] }>
}) {
  const resolvedSearchParams = await searchParams
  const initialMemoryItemId = Array.isArray(resolvedSearchParams.memory)
    ? resolvedSearchParams.memory[0]
    : resolvedSearchParams.memory

  return (
    <div className="flex min-h-0 flex-col gap-4 lg:h-[calc(100svh-7.5rem)] lg:overflow-hidden">
      <PageHeading
        eyebrow="Shadowing session"
        title="跟住整段对话，换个角色再来。"
        description="从场景库选择多轮脚本，模拟任意一方，在听对话、跟角色和真实应用之间连续练习。"
        icon={AudioWaveformIcon}
        motif="shadowing"
        actions={<Badge variant="outline">今日已练 8 分钟</Badge>}
        className="shrink-0"
      />
      <div className="min-h-0 flex-1">
        <ShadowingWorkspace
          key={initialMemoryItemId ?? "default"}
          initialMemoryItemId={initialMemoryItemId}
        />
      </div>
    </div>
  )
}
