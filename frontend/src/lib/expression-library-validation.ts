import type { SceneCategory } from "@/lib/demo-data"
import {
  type ExpressionKind,
  type ExpressionLibraryItem,
  normalizeExpressionExamples,
} from "@/lib/expression-library-schema"
import type { IdiomaticExpressionContext } from "@/lib/idiomatic-expressions"

const expressionContexts = new Set<IdiomaticExpressionContext>(["日常", "职场", "通用"])
const expressionKinds = new Set<ExpressionKind>([
  "collocation",
  "idiom",
  "phrasal-verb",
  "sentence-pattern",
])
const expressionCategories = new Set<SceneCategory>([
  "clothing",
  "dining",
  "housing",
  "transport",
  "work",
  "social",
  "health",
  "services",
  "learning",
  "emergency",
])

export function parseImportedExpressionItem(value: unknown): ExpressionLibraryItem | null {
  if (!value || typeof value !== "object") {
    return null
  }
  const item = value as Partial<ExpressionLibraryItem>
  if (
    typeof item.clientId !== "string" ||
    !item.clientId.trim() ||
    item.clientId.length > 160 ||
    typeof item.phrase !== "string" ||
    !item.phrase.trim() ||
    item.phrase.length > 120 ||
    typeof item.meaning !== "string" ||
    !item.meaning.trim() ||
    item.meaning.length > 500 ||
    typeof item.why !== "string" ||
    !item.why.trim() ||
    item.why.length > 1_000 ||
    typeof item.origin !== "string" ||
    !item.origin.trim() ||
    item.origin.length > 1_000 ||
    typeof item.example !== "string" ||
    !item.example.trim() ||
    item.example.length > 500 ||
    !expressionContexts.has(item.context as IdiomaticExpressionContext) ||
    !expressionKinds.has(item.kind as ExpressionKind) ||
    !expressionCategories.has(item.sceneCategory as SceneCategory)
  ) {
    return null
  }
  const phrase = item.phrase.normalize("NFKC").replace(/\s+/g, " ").trim()
  const exampleTranslation =
    typeof item.exampleTranslation === "string" ? item.exampleTranslation.trim() : ""
  const usage = typeof item.usage === "string" ? item.usage.trim() : ""
  const memoryTip = typeof item.memoryTip === "string" ? item.memoryTip.trim() : ""
  const examples = normalizeExpressionExamples(item.examples)
  return {
    clientId: item.clientId.trim(),
    context: item.context as IdiomaticExpressionContext,
    example: item.example.trim(),
    ...(exampleTranslation && exampleTranslation.length <= 500 ? { exampleTranslation } : {}),
    id: typeof item.id === "string" && item.id ? item.id : `imported:${item.clientId.trim()}`,
    kind: item.kind as ExpressionKind,
    meaning: item.meaning.trim(),
    ...(memoryTip && memoryTip.length <= 500 ? { memoryTip } : {}),
    origin: item.origin.trim(),
    phrase,
    sceneCategory: item.sceneCategory as SceneCategory,
    source: "imported",
    ...(usage && usage.length <= 1_000 ? { usage } : {}),
    why: item.why.trim(),
    ...(examples && examples.length > 0 ? { examples } : {}),
    ...(typeof item.createdAt === "string" ? { createdAt: item.createdAt } : {}),
    ...(typeof item.updatedAt === "string" ? { updatedAt: item.updatedAt } : {}),
  }
}
