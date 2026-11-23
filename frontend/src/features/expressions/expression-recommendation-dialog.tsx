"use client"

import { FolderPlusIcon, PlayIcon, SparklesIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ExpressionLibraryItem } from "@/lib/expression-library-schema"
import {
  buildExpressionRecommendations,
  type ExpressionRecommendation,
  type ExpressionRecommendationDimension,
  expressionRecommendationDimensions,
  getRecommendedGroupId,
} from "@/lib/expression-recommendations"
import type { ExpressionProgressStatus, ExpressionStudyState } from "@/lib/memory"

export function ExpressionRecommendationDialog({
  open,
  onOpenChange,
  items,
  progressByIdentity,
  study,
  onJoin,
  onStart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: readonly ExpressionLibraryItem[]
  progressByIdentity: Readonly<Record<string, ExpressionProgressStatus>>
  study: ExpressionStudyState
  onJoin: (recommendation: ExpressionRecommendation) => void
  onStart: (recommendation: ExpressionRecommendation) => void
}) {
  const [dimension, setDimension] = useState<ExpressionRecommendationDimension>("level")
  // 推荐分组只在弹窗打开时构建，避免每次进入词库都为 1170 条表达扫描全部维度。
  const recommendations = useMemo(
    () =>
      open
        ? buildExpressionRecommendations({ items, progressByIdentity })
        : ([] as ExpressionRecommendation[]),
    [items, open, progressByIdentity],
  )
  const activeDimension =
    expressionRecommendationDimensions.find((item) => item.value === dimension) ??
    expressionRecommendationDimensions[0]
  const visible = useMemo(
    () => recommendations.filter((recommendation) => recommendation.dimension === dimension),
    [dimension, recommendations],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(70vh,34rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 pr-6 text-base">
            <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
            推荐分组
          </DialogTitle>
          <DialogDescription>{activeDimension.description}</DialogDescription>
        </DialogHeader>

        <div className="border-b px-5 py-2">
          <Tabs
            value={dimension}
            onValueChange={(value) => setDimension(value as ExpressionRecommendationDimension)}
          >
            <TabsList className="w-full">
              {expressionRecommendationDimensions.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="flex-1">
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              当前没有可用推荐。
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((recommendation) => {
                const groupId = getRecommendedGroupId(recommendation.id)
                const group = study.groups[groupId]
                const joined = Boolean(group && !group.deletedAt)
                const disabled = recommendation.count === 0
                return (
                  <li
                    key={recommendation.id}
                    className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium">{recommendation.name}</p>
                        <Badge variant="secondary">{recommendation.count} 条</Badge>
                        {joined ? <Badge variant="outline">已加入</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {recommendation.description}
                      </p>
                      {recommendation.samplePhrases.length > 0 ? (
                        <p className="mt-1 truncate font-serif text-xs text-muted-foreground">
                          例如：{recommendation.samplePhrases.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={disabled}
                        aria-label={`${joined ? "继续学习" : "加入并学习"}推荐分组 ${recommendation.name}`}
                        onClick={() => {
                          onJoin(recommendation)
                          onStart(recommendation)
                        }}
                      >
                        <PlayIcon data-icon="inline-start" />
                        {joined ? "继续学习" : "加入并学习"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        aria-label={`仅加入推荐分组 ${recommendation.name}`}
                        onClick={() => onJoin(recommendation)}
                      >
                        <FolderPlusIcon data-icon="inline-start" />
                        仅加入
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
