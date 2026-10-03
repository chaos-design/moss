import { LibraryBigIcon } from "lucide-react"
import type { Metadata } from "next"
import { PageHeading } from "@/components/page-heading"
import { ExpressionLibraryWorkspace } from "@/features/expressions/expression-library-workspace"

export const metadata: Metadata = {
  title: "地道表达",
  description: "按真实生活与工作场景检索、理解和管理高频英语表达。",
}

export default function ExpressionsPage() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeading
        eyebrow="Expression library"
        title="地道表达库"
        description="高频词组、固定搭配与实用句型按场景归档，完整保留含义、语义推导、来源和例句。"
        icon={LibraryBigIcon}
        motif="notebook"
      />
      <ExpressionLibraryWorkspace />
    </div>
  )
}
