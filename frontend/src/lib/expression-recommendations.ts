import {
  createExpressionIdentity,
  type ExpressionKind,
  type ExpressionLibraryItem,
  expressionKindLabels,
  expressionSceneCategories,
  expressionSceneCategoryLabels,
} from "@/lib/expression-library-schema"
import type { ExpressionProgressStatus } from "@/lib/memory/expression-study-state"

export type ExpressionRecommendationDimension =
  | "level"
  | "scene"
  | "kind"
  | "context"
  | "progress"

export const expressionRecommendationDimensions: ReadonlyArray<{
  value: ExpressionRecommendationDimension
  label: string
  description: string
}> = [
  {
    value: "level",
    label: "等级",
    description: "按词数、表达类型和语境保守分层，不是逐条 CEFR 标注。",
  },
  { value: "scene", label: "场景", description: "按词库现有的 10 类场景归档。" },
  { value: "kind", label: "类型", description: "按习语、搭配、短语动词和实用句型归档。" },
  { value: "context", label: "语境", description: "按条目现有的日常、职场与通用语境归档。" },
  {
    value: "progress",
    label: "进度",
    description: "按本机学习进度动态筛选，切换进度后会自动更新。",
  },
]

export type ExpressionRecommendation = {
  id: string
  name: string
  dimension: ExpressionRecommendationDimension
  description: string
  count: number
  identities: string[]
  samplePhrases: string[]
}

type RecommendationSpec = {
  id: string
  name: string
  dimension: ExpressionRecommendationDimension
  description: string
  matches: (item: ExpressionLibraryItem, context: ExpressionRecommendationContext) => boolean
}

export type ExpressionRecommendationContext = {
  progressByIdentity: Readonly<Record<string, ExpressionProgressStatus>>
}

type RecommendationLevel = "A2" | "B1" | "B2" | "C1"

function phraseWordCount(phrase: string) {
  return phrase.normalize("NFKC").trim().split(/\s+/).filter(Boolean).length
}

/**
 * 逐条 CEFR 标注并不存在，这里按词数、表达类型和语境做保守分层，且每一条只落入一个等级。
 * 长句型和习语后移，短日常搭配优先放前面的等级，避免推荐组之间大量重复。
 */
function inferRecommendationLevel(item: ExpressionLibraryItem): RecommendationLevel {
  const words = phraseWordCount(item.phrase)
  if (item.kind === "sentence-pattern" || words >= 6) {
    return "C1"
  }
  if (item.kind === "idiom" || words >= 4) {
    return "B2"
  }
  if (words <= 2 && item.context === "日常") {
    return "A2"
  }
  return "B1"
}

const levelRecommendations: RecommendationSpec[] = [
  {
    id: "level-A2",
    name: "A2 · 入门常用",
    dimension: "level",
    description: "两词以内的日常高频搭配，适合先建立表达直觉。",
    matches: (item) => inferRecommendationLevel(item) === "A2",
  },
  {
    id: "level-B1",
    name: "B1 · 进阶常用",
    dimension: "level",
    description: "中等长度的搭配与短语动词，覆盖日常和通用语境。",
    matches: (item) => inferRecommendationLevel(item) === "B1",
  },
  {
    id: "level-B2",
    name: "B2 · 熟练表达",
    dimension: "level",
    description: "习语和较长搭配，需要理解语义推导与使用场景。",
    matches: (item) => inferRecommendationLevel(item) === "B2",
  },
  {
    id: "level-C1",
    name: "C1 · 挑战表达",
    dimension: "level",
    description: "长句型与多词表达，适合进阶输出训练。",
    matches: (item) => inferRecommendationLevel(item) === "C1",
  },
]

const sceneRecommendations: RecommendationSpec[] = expressionSceneCategories.map(
  (category) => ({
    id: `scene-${category.value}`,
    name: expressionSceneCategoryLabels[category.value],
    dimension: "scene",
    description: `词库中归入「${expressionSceneCategoryLabels[category.value]}」的表达。`,
    matches: (item) => item.sceneCategory === category.value,
  }),
)

const expressionKinds: ExpressionKind[] = [
  "idiom",
  "collocation",
  "phrasal-verb",
  "sentence-pattern",
]

const kindRecommendations: RecommendationSpec[] = expressionKinds.map((kind) => ({
  id: `kind-${kind}`,
  name: expressionKindLabels[kind],
  dimension: "kind",
  description: `按表达类型筛选「${expressionKindLabels[kind]}」。`,
  matches: (item) => item.kind === kind,
}))

const contextRecommendations: RecommendationSpec[] = (["日常", "职场", "通用"] as const).map(
  (context) => ({
    id: `context-${context}`,
    name: `${context}语境`,
    dimension: "context",
    description: `条目语境标记为「${context}」的表达。`,
    matches: (item) => item.context === context,
  }),
)

const progressRecommendations: RecommendationSpec[] = [
  {
    id: "progress-learning",
    name: "继续攻克",
    dimension: "progress",
    description: "已标记为学习中，适合继续推进的表达。",
    matches: (item, context) =>
      context.progressByIdentity[createExpressionIdentity(item)] === "learning",
  },
  {
    id: "progress-mastered",
    name: "巩固掌握",
    dimension: "progress",
    description: "已标记为掌握，适合间隔回顾的表达。",
    matches: (item, context) =>
      context.progressByIdentity[createExpressionIdentity(item)] === "mastered",
  },
  {
    id: "progress-new",
    name: "尚未学习",
    dimension: "progress",
    description: "还没有进度记录的表达，适合从头挑选。",
    matches: (item, context) => {
      const status = context.progressByIdentity[createExpressionIdentity(item)]
      return status === undefined || status === "new"
    },
  },
]

const recommendationSpecs: RecommendationSpec[] = [
  ...levelRecommendations,
  ...sceneRecommendations,
  ...kindRecommendations,
  ...contextRecommendations,
  ...progressRecommendations,
]

/** 推荐分组落为个人分组时使用的稳定 ID，重复加入只会补齐条目，不会建出多个同名组。 */
export function getRecommendedGroupId(recommendationId: string) {
  return `recommended:${recommendationId}`
}

export function buildExpressionRecommendations({
  items,
  progressByIdentity = {},
  dimensions,
}: {
  items: readonly ExpressionLibraryItem[]
  progressByIdentity?: Readonly<Record<string, ExpressionProgressStatus>>
  dimensions?: readonly ExpressionRecommendationDimension[]
}): ExpressionRecommendation[] {
  const context: ExpressionRecommendationContext = { progressByIdentity }
  const specs = dimensions
    ? recommendationSpecs.filter((spec) => dimensions.includes(spec.dimension))
    : recommendationSpecs
  return specs.map((spec) => {
    const matched = items.filter((item) => spec.matches(item, context))
    return {
      id: spec.id,
      name: spec.name,
      dimension: spec.dimension,
      description: spec.description,
      count: matched.length,
      identities: matched.map(createExpressionIdentity),
      samplePhrases: matched.slice(0, 3).map((item) => item.phrase),
    }
  })
}
