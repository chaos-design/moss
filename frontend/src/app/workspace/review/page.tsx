import { BrainCircuitIcon } from "lucide-react"
import type { Metadata } from "next"
import { PageHeading } from "@/components/page-heading"
import { Badge } from "@/components/ui/badge"
import { ReviewWorkspace } from "@/features/review/review-workspace"

export const metadata: Metadata = {
  title: "智能复习",
  description: "根据记忆强度和间隔重复计划完成情景找回。",
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ memory?: string | string[] }>
}) {
  const resolvedSearchParams = await searchParams
  const initialMemoryItemId = Array.isArray(resolvedSearchParams.memory)
    ? resolvedSearchParams.memory[0]
    : resolvedSearchParams.memory

  return (
    <div className="flex min-h-0 flex-col gap-5 lg:h-[calc(100svh-7.5rem)]">
      <PageHeading
        eyebrow="Smart recall"
        title="先找回，再确认。"
        description="系统优先安排正在变弱的表达，并把它们放回原来的使用场景。"
        icon={BrainCircuitIcon}
        motif="review"
        actions={<Badge variant="outline">预计 8 分钟</Badge>}
        className="shrink-0"
      />
      <div className="min-h-0 flex-1">
        <ReviewWorkspace
          key={initialMemoryItemId ?? "default"}
          initialMemoryItemId={initialMemoryItemId}
        />
      </div>
    </div>
  )
}
