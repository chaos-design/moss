"use client"

import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { ExpressionEbbinghausWorkspace } from "@/features/expressions/expression-ebbinghaus-dialog"
import { ExpressionStudyWorkspace } from "@/features/expressions/expression-study-dialog"
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
    // session 变化时重新解析：随机范围会重新洗牌，其他范围结果不变。
  }, [scope, session, filteredItems, favoriteIdentities, studyGroups, progressByIdentity])

  const exit = () => router.push("/workspace/expressions")

  const reshuffle = () => {
    const params = new URLSearchParams(window.location.search)
    params.set("session", String(session + 1))
    router.push(`/workspace/expressions/study?${params.toString()}`)
  }

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
    <div className="flex min-h-0 flex-1 justify-center">
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
          onReshuffle={scope.kind === "random" ? reshuffle : undefined}
        />
      )}
    </div>
  )
}
