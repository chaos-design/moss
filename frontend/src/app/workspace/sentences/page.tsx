import { BookMarkedIcon } from "lucide-react"
import type { Metadata } from "next"
import { PageHeading } from "@/components/page-heading"
import { SentenceList } from "@/features/agent/sentence-list"

export const metadata: Metadata = {
  title: "句子列表",
  description: "查看在对话、复习和跟读中形成的真实表达记录。",
}

export default function SentencesPage() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeading
        eyebrow="Sentence library"
        title="把用过的表达带到下一个场景。"
        description="这里仅收录真实练习形成的句子、词汇、语法和发音记忆，并按复习节奏持续更新。"
        icon={BookMarkedIcon}
        motif="notebook"
      />
      <SentenceList />
    </div>
  )
}
