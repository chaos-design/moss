import type { SceneCategory } from "@/lib/demo-data"
import generatedLibrary from "@/lib/expression-library.generated.json"
import {
  createExpressionIdentity,
  type ExpressionLibraryItem,
} from "@/lib/expression-library-schema"
import { idiomaticExpressionNotes } from "@/lib/idiomatic-expressions"

type GeneratedExpressionEntry = Omit<
  ExpressionLibraryItem,
  "clientId" | "createdAt" | "id" | "source" | "updatedAt"
>

const reviewedCategoryOverrides: Partial<Record<string, SceneCategory>> = {
  "a learning curve": "learning",
  "a piece of cake": "dining",
  "at the drop of a hat": "transport",
  "bite the bullet": "emergency",
  "blow off steam": "health",
  "cost an arm and a leg": "clothing",
  "cross that bridge when you come to it": "transport",
  "get cold feet": "social",
  "get the hang of": "learning",
  "give someone the benefit of the doubt": "social",
  "hit the road": "transport",
  "in hot water": "emergency",
  "in the long run": "learning",
  "let the cat out of the bag": "social",
  "make ends meet": "housing",
  "not my cup of tea": "dining",
  "on thin ice": "emergency",
  "pull yourself together": "health",
  "read between the lines": "learning",
  "red tape": "services",
  "rule of thumb": "learning",
  "someone's hands are tied": "services",
  "take something with a grain of salt": "dining",
  "the last straw": "social",
  "touch and go": "health",
}

function inferReviewedCategory(
  phrase: string,
  context: ExpressionLibraryItem["context"],
): SceneCategory {
  return reviewedCategoryOverrides[phrase] ?? (context === "职场" ? "work" : "social")
}

const reviewedItems: ExpressionLibraryItem[] = idiomaticExpressionNotes.map((note, index) => ({
  ...note,
  id: `builtin:reviewed:${index + 1}`,
  clientId: `builtin-reviewed-${index + 1}`,
  kind: "idiom",
  sceneCategory: inferReviewedCategory(note.phrase, note.context),
  source: "builtin",
}))

const generatedItems: ExpressionLibraryItem[] = (
  generatedLibrary.entries as GeneratedExpressionEntry[]
).map((entry, index) => ({
  ...entry,
  id: `builtin:generated:${index + 101}`,
  clientId: `builtin-generated-${index + 101}`,
  source: "builtin",
}))

export const builtInExpressionItems: readonly ExpressionLibraryItem[] = [
  ...reviewedItems,
  ...generatedItems,
]

if (builtInExpressionItems.length !== 1_000) {
  throw new Error(`Built-in expression library must contain 1000 items.`)
}

export function mergeExpressionLibraryItems(
  builtInItems: readonly ExpressionLibraryItem[],
  importedItems: readonly ExpressionLibraryItem[],
) {
  const items = new Map(
    builtInItems.map((item) => [createExpressionIdentity(item), item] as const),
  )
  for (const item of importedItems) {
    items.set(createExpressionIdentity(item), item)
  }
  return [...items.values()]
}

export {
  createExpressionIdentity,
  createImportedExpressionItem,
  type ExpressionImportItem,
  type ExpressionKind,
  type ExpressionLibraryItem,
  type ExpressionSource,
  expressionKindLabels,
  expressionSceneCategories,
  expressionSceneCategoryLabels,
  normalizeExpressionPhrase,
} from "@/lib/expression-library-schema"
