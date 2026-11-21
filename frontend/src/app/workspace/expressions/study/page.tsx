import { GraduationCapIcon } from "lucide-react"
import type { Metadata } from "next"
import { PageHeading } from "@/components/page-heading"
import { Badge } from "@/components/ui/badge"
import { ExpressionStudyPage } from "@/features/expressions/expression-study-page"
import {
  type ExpressionStudyScope,
  expressionStudyModeLabels,
  expressionStudyScopeLabels,
  parseExpressionStudyMode,
  parseExpressionStudyScope,
} from "@/lib/expression-study"

export const metadata: Metadata = {
  title: "学习地道表达",
  description: "在独立学习页里用闪卡、填空、听写或艾宾浩斯记忆循环巩固地道表达。",
}

function scopeTitle(scope: ExpressionStudyScope) {
  if (scope.kind === "ebbinghaus") {
    return "艾宾浩斯记忆循环"
  }
  if (scope.kind === "random") {
    return `随机学 ${scope.count} 条`
  }
  return "学习地道表达"
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function ExpressionStudyRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const scope = parseExpressionStudyScope({
    scope: first(params.scope),
    groupId: first(params.groupId),
    status: first(params.status),
    count: first(params.count),
  })
  const mode = parseExpressionStudyMode(first(params.mode))
  const session = Number(first(params.session) ?? 0) || 0

  return (
    <div className="flex min-h-0 flex-col gap-5 lg:h-[calc(100svh-7.5rem)]">
      <PageHeading
        eyebrow="Study session"
        title={scopeTitle(scope)}
        description="先主动回想，再核对与自评；每条都会写入长期记忆，到点后到复习页找回。"
        icon={GraduationCapIcon}
        motif="notebook"
        actions={
          <>
            <Badge variant="secondary">{expressionStudyScopeLabels[scope.kind]}</Badge>
            <Badge variant="outline">{expressionStudyModeLabels[mode]}</Badge>
          </>
        }
        className="shrink-0"
      />
      <div className="min-h-0 flex-1">
        <ExpressionStudyPage
          key={`${scope.kind}-${session}`}
          scope={scope}
          mode={mode}
          session={session}
        />
      </div>
    </div>
  )
}
