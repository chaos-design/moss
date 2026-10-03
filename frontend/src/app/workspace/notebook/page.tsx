import { ArrowRightIcon, BrainCircuitIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { PageHeading } from "@/components/page-heading"
import { buttonVariants } from "@/components/ui/button"
import { MemoryNotebook } from "@/features/agent/memory-notebook"

export const metadata: Metadata = {
  title: "长期记忆",
  description: "查看 AI 学习 Agent 保存的表达、问题、记忆强度与迁移计划。",
}

export default function NotebookPage() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeading
        eyebrow="Learning memory"
        title="每次使用，都在重写下一步。"
        description="Moss 记录表达来自哪里、是否成功找回，以及下一次应该放进哪个真实场景。"
        icon={BrainCircuitIcon}
        motif="notebook"
        actions={
          <Link href="/workspace/review" className={buttonVariants()}>
            开始记忆找回
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        }
      />
      <MemoryNotebook />
    </div>
  )
}
