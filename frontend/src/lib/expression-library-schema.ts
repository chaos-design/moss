import { type SceneCategory, sceneCategories } from "@/lib/demo-data"
import type { IdiomaticExpressionContext } from "@/lib/idiomatic-expressions"

export type ExpressionKind = "collocation" | "idiom" | "phrasal-verb" | "sentence-pattern"
export type ExpressionSource = "builtin" | "imported"

export type ExpressionLibraryItem = {
  id: string
  clientId: string
  phrase: string
  meaning: string
  why: string
  origin: string
  example: string
  context: IdiomaticExpressionContext
  kind: ExpressionKind
  sceneCategory: SceneCategory
  source: ExpressionSource
  createdAt?: string
  updatedAt?: string
}

export type ExpressionImportItem = Omit<
  ExpressionLibraryItem,
  "createdAt" | "id" | "source" | "updatedAt"
>

export const expressionSceneCategories = sceneCategories.filter(
  (category): category is (typeof sceneCategories)[number] & { value: SceneCategory } =>
    category.value !== "all",
)

export const expressionSceneCategoryLabels = Object.fromEntries(
  expressionSceneCategories.map((category) => [category.value, category.label]),
) as Record<SceneCategory, string>

export const expressionKindLabels: Record<ExpressionKind, string> = {
  collocation: "固定搭配",
  idiom: "习语",
  "phrasal-verb": "短语动词",
  "sentence-pattern": "实用句型",
}

export function normalizeExpressionPhrase(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim()
}

export function createExpressionIdentity(
  item: Pick<ExpressionLibraryItem, "phrase" | "sceneCategory">,
) {
  return `${item.sceneCategory}:${normalizeExpressionPhrase(item.phrase)}`
}

function hashExpressionIdentity(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function createImportedExpressionItem(
  item: Omit<ExpressionImportItem, "clientId"> & { clientId?: string },
): ExpressionLibraryItem {
  const identity = createExpressionIdentity(item)
  const clientId = item.clientId?.trim() || `expression-${hashExpressionIdentity(identity)}`
  return {
    ...item,
    clientId,
    id: `imported:${clientId}`,
    source: "imported",
  }
}
