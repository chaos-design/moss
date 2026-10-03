import { CompassIcon } from "lucide-react"
import type { Metadata } from "next"
import { PageHeading } from "@/components/page-heading"
import { SceneLibrary, SceneLibrarySummary } from "@/features/scenes/scene-library"

export const metadata: Metadata = {
  title: "场景库",
  description: "按语言等级选择高频生活、出行与职场场景。",
}

export default function ScenesPage() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeading
        eyebrow="Scene library"
        title="把语言放回具体情景。"
        description="按 A2 到 C1 选择合适难度，在具体任务中练习词汇、句型与文化语境。"
        icon={CompassIcon}
        motif="scenes"
        actions={<SceneLibrarySummary />}
      />
      <SceneLibrary />
    </div>
  )
}
