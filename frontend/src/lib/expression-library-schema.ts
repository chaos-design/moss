import { type SceneCategory, sceneCategories } from "@/lib/demo-data"
import type { IdiomaticExpressionContext } from "@/lib/idiomatic-expressions"

export type ExpressionKind = "collocation" | "idiom" | "phrasal-verb" | "sentence-pattern"
export type ExpressionSource = "builtin" | "imported"

/** 复习时展示的拓展例句；译文可选，缺失时只显示英文。 */
export type ExpressionExample = {
  text: string
  translation?: string
}

export type ExpressionLibraryItem = {
  id: string
  clientId: string
  phrase: string
  meaning: string
  why: string
  origin: string
  example: string
  /** 例句译文按条目提供，缺失时不显示展开按钮。 */
  exampleTranslation?: string
  /** 用法讲解：句法位置、常见搭配与语域限制。 */
  usage?: string
  /** 记忆提示：画面、对比或易错点。 */
  memoryTip?: string
  /** 主例句之外的拓展例句。 */
  examples?: readonly ExpressionExample[]
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

/** AI 生成结果尚未落为库条目，因此没有 clientId；导入时再创建稳定身份。 */
export type ExpressionGeneratedItem = Omit<ExpressionImportItem, "clientId">

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

/** 拓展例句在 CSV 中以 JSON 字符串承载，在 JSON/API 中直接使用数组。 */
export function normalizeExpressionExamples(value: unknown): ExpressionExample[] | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined
  }
  let rows: unknown = value
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows) as unknown
    } catch {
      return undefined
    }
  }
  if (!Array.isArray(rows) || rows.length > 4) {
    return undefined
  }
  const examples: ExpressionExample[] = []
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return undefined
    }
    const record = row as Record<string, unknown>
    const text = typeof record.text === "string" ? record.text.trim() : ""
    const translation =
      typeof record.translation === "string" ? record.translation.trim() : undefined
    if (!text || text.length > 500 || (translation && translation.length > 500)) {
      return undefined
    }
    examples.push({ text, ...(translation ? { translation } : {}) })
  }
  return examples
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

/** 把粘贴的短语拆成唯一表达文本，兼容换行、逗号、分号与顿号（中英文）。不设业务上限。 */
export function parseExpressionPhraseBatch(input: string): string[] {
  const seen = new Set<string>()
  const phrases: string[] = []
  for (const raw of input.split(/[\n,，;；、]+/)) {
    const phrase = raw.trim()
    if (!phrase) {
      continue
    }
    const key = normalizeExpressionPhrase(phrase)
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    phrases.push(phrase)
  }
  return phrases
}

/**
 * 按表达文本反查分组可写入的身份。同一表达出现在多个场景时整组加入，保证「越多越好」的
 * 批量导入不会因为场景歧义漏掉条目。
 */
export function resolvePhrasesToIdentities(
  items: readonly Pick<ExpressionLibraryItem, "phrase" | "sceneCategory">[],
  phrases: readonly string[],
) {
  const byPhrase = new Map<string, Set<string>>()
  for (const item of items) {
    const key = normalizeExpressionPhrase(item.phrase)
    const identities = byPhrase.get(key) ?? new Set<string>()
    identities.add(createExpressionIdentity(item))
    byPhrase.set(key, identities)
  }
  const identities = new Set<string>()
  const matched: string[] = []
  const unmatched: string[] = []
  for (const phrase of phrases) {
    const found = byPhrase.get(normalizeExpressionPhrase(phrase))
    if (found && found.size > 0) {
      for (const identity of found) {
        identities.add(identity)
      }
      matched.push(phrase)
    } else {
      unmatched.push(phrase)
    }
  }
  return { identities: [...identities], matched, unmatched }
}
