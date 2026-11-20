import type { Metadata } from "next"
import { ExpressionStudyPage } from "@/features/expressions/expression-study-page"
import { parseExpressionStudyMode, parseExpressionStudyScope } from "@/lib/expression-study"

export const metadata: Metadata = {
  title: "学习地道表达",
  description: "在独立学习页里用闪卡、填空、听写或艾宾浩斯记忆循环巩固地道表达。",
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
    <ExpressionStudyPage
      key={`${scope.kind}-${session}`}
      scope={scope}
      mode={mode}
      session={session}
    />
  )
}
