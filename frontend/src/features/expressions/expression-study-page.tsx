"use client"

import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { ExpressionEbbinghausWorkspace } from "@/features/expressions/expression-ebbinghaus-dialog"
import { ExpressionStudyWorkspace } from "@/features/expressions/expression-study-dialog"
import { ExpressionStudyGuide } from "@/features/expressions/expression-study-guide"
import { useExpressionLibrarySource } from "@/features/expressions/use-expression-library-source"
import {
  type ExpressionLibraryItem,
  expressionSceneCategoryLabels,
} from "@/lib/expression-library"
import {
  type ExpressionStudyMode,
  type ExpressionStudyScope,
  resolveStudyItems,
} from "@/lib/expression-study"
import { createExpressionMemoryItemId } from "@/lib/memory"

export function ExpressionStudyPage({
  scope,
  mode,
  session,
}: {
  scope: ExpressionStudyScope
  mode: ExpressionStudyMode
  session: number
}) {
  const router = useRouter()
  const { state, recordExpressionStudy, recordExpressionProgress, rateReview } =
    useLearningMemory()
  const { allItems, filteredItems, favoriteIdentities, studyGroups, progressByIdentity } =
    useExpressionLibrarySource(state.expressionStudy.filters.value)
  // 随机学习已经固化为分组，这里只保留 group/filtered 等范围；random 仅供历史 URL 兼容。

  const sessionItems = useMemo(() => {
    const groupItemIds =
      scope.kind === "group"
        ? studyGroups.find((candidate) => candidate.id === scope.groupId)?.itemIds
        : undefined
    return resolveStudyItems({
      filteredItems,
      favoriteIdentities,
      groupItemIds,
      progressByIdentity,
      scope,
    })
  }, [scope, session, filteredItems, favoriteIdentities, studyGroups, progressByIdentity])

  const exit = () => router.push("/workspace/expressions")

  const studyMemory = useMemo(
    () => (item: ExpressionLibraryItem) =>
      recordExpressionStudy({
        itemId: createExpressionMemoryItemId(item.clientId),
        sceneCategory: item.sceneCategory,
        sceneTitle: expressionSceneCategoryLabels[item.sceneCategory],
        label: item.phrase,
        phrase: item.phrase,
        explanation: item.why,
        example: item.example,
        libraryKind: item.kind,
      }),
    [recordExpressionStudy],
  )

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-col gap-4">
      <ExpressionStudyGuide
        target={scope.kind === "ebbinghaus" ? { kind: "ebbinghaus" } : { kind: "mode", mode }}
      />
      {scope.kind === "ebbinghaus" ? (
        <ExpressionEbbinghausWorkspace
          pool={sessionItems}
          catalogItems={allItems}
          memoryItems={state.items}
          onExit={exit}
          onLearn={studyMemory}
          onRate={rateReview}
          onProgress={recordExpressionProgress}
        />
      ) : (
        <ExpressionStudyWorkspace
          items={sessionItems}
          scope={scope}
          study={state.expressionStudy}
          initialMode={mode}
          onExit={exit}
          onProgress={recordExpressionProgress}
          onStudyMemory={studyMemory}
        />
      )}
    </div>
  )
}
