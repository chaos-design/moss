import type { ParseError } from "papaparse"
import {
  createExpressionIdentity,
  createImportedExpressionItem,
  type ExpressionImportItem,
  type ExpressionKind,
  type ExpressionLibraryItem,
  expressionKindLabels,
  expressionSceneCategories,
} from "@/lib/expression-library-schema"

export type ExpressionImportIssue = {
  row: number
  message: string
}

export type ExpressionImportResult = {
  items: ExpressionLibraryItem[]
  issues: ExpressionImportIssue[]
  duplicateCount: number
}

type ImportRecord = Record<string, unknown>

const contextValues = new Set(["日常", "职场", "通用"])
const kindAliases = new Map<string, ExpressionKind>([
  ["collocation", "collocation"],
  ["固定搭配", "collocation"],
  ["idiom", "idiom"],
  ["习语", "idiom"],
  ["phrasal-verb", "phrasal-verb"],
  ["phrasal verb", "phrasal-verb"],
  ["短语动词", "phrasal-verb"],
  ["sentence-pattern", "sentence-pattern"],
  ["sentence pattern", "sentence-pattern"],
  ["实用句型", "sentence-pattern"],
  ["句型", "sentence-pattern"],
])
const categoryAliases = new Map(
  expressionSceneCategories.flatMap((category) => [
    [category.value.toLocaleLowerCase(), category.value] as const,
    [category.label, category.value] as const,
  ]),
)
const fieldAliases = {
  context: ["context", "语境"],
  example: ["example", "例句"],
  kind: ["kind", "type", "类型"],
  meaning: ["meaning", "含义", "中文含义"],
  origin: ["origin", "origin_note", "来源", "词源"],
  phrase: ["phrase", "expression", "表达", "词组"],
  sceneCategory: ["scenecategory", "scene_category", "category", "场景分类", "场景"],
  why: ["why", "reasoning", "解释", "为什么"],
} as const

function normalizeHeader(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase()
}

function getField(record: ImportRecord, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = record[alias]
    if (value !== undefined && value !== null) {
      return String(value).trim()
    }
  }
  return ""
}

function assertField(value: string, label: string, maximumLength: number) {
  if (!value) {
    throw new Error(`缺少${label}`)
  }
  if (value.length > maximumLength) {
    throw new Error(`${label}超过 ${maximumLength} 个字符`)
  }
  return value
}

function parseRecord(value: unknown): ExpressionLibraryItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("每条记录必须是对象")
  }
  const record = Object.fromEntries(
    Object.entries(value as ImportRecord).map(([key, fieldValue]) => [
      normalizeHeader(key),
      fieldValue,
    ]),
  )
  const phrase = assertField(
    getField(record, fieldAliases.phrase).replace(/\s+/g, " "),
    "英文表达",
    120,
  )
  const meaning = assertField(getField(record, fieldAliases.meaning), "中文含义", 500)
  const why = assertField(getField(record, fieldAliases.why), "含义解释", 1_000)
  const origin = assertField(getField(record, fieldAliases.origin), "来源说明", 1_000)
  const example = assertField(getField(record, fieldAliases.example), "英文例句", 500)
  const rawCategory = getField(record, fieldAliases.sceneCategory).toLocaleLowerCase()
  const sceneCategory = categoryAliases.get(rawCategory)
  if (!sceneCategory) {
    throw new Error("场景分类无效")
  }
  const rawContext = getField(record, fieldAliases.context) || "通用"
  if (!contextValues.has(rawContext)) {
    throw new Error("语境只能是日常、职场或通用")
  }
  const rawKind = (getField(record, fieldAliases.kind) || "固定搭配").toLocaleLowerCase()
  const kind = kindAliases.get(rawKind)
  if (!kind) {
    throw new Error(`类型只能是${Object.values(expressionKindLabels).join("、")}`)
  }

  const item: Omit<ExpressionImportItem, "clientId"> = {
    phrase,
    meaning,
    why,
    origin,
    example,
    context: rawContext as ExpressionImportItem["context"],
    kind,
    sceneCategory,
  }
  return createImportedExpressionItem(item)
}

function parseJsonRows(content: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(content) as unknown
  } catch {
    throw new Error("JSON 格式错误，请检查括号、引号和逗号")
  }
  if (Array.isArray(parsed)) {
    return parsed
  }
  if (parsed && typeof parsed === "object") {
    const object = parsed as {
      data?: { expression_library_items?: unknown }
      entries?: unknown
      items?: unknown
    }
    if (Array.isArray(object.items)) {
      return object.items
    }
    if (Array.isArray(object.entries)) {
      return object.entries
    }
    if (Array.isArray(object.data?.expression_library_items)) {
      return object.data.expression_library_items
    }
  }
  throw new Error("JSON 顶层必须是数组，或包含 items/entries 数组")
}

export function parseExpressionJsonImport(content: string): ExpressionImportResult {
  if (!content.trim()) {
    throw new Error("JSON 数据为空")
  }
  return parseExpressionImportRows(parseJsonRows(content), 2)
}

async function parseCsvRows(content: string) {
  const Papa = (await import("papaparse")).default
  const result = Papa.parse<ImportRecord>(content, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  })
  const fatalErrors = result.errors.filter(
    (error: ParseError) => error.type === "Quotes" || error.type === "Delimiter",
  )
  if (fatalErrors.length > 0) {
    throw new Error(`CSV 格式错误：${fatalErrors[0]?.message ?? "无法解析"}`)
  }
  return result.data
}

export async function parseExpressionImport(
  content: string,
  fileName: string,
): Promise<ExpressionImportResult> {
  if (!content.trim()) {
    throw new Error("导入文件为空")
  }
  if (!fileName.toLocaleLowerCase().endsWith(".csv")) {
    return parseExpressionJsonImport(content)
  }
  return parseExpressionImportRows(await parseCsvRows(content), 2)
}

export function parseExpressionImportRows(
  rows: readonly unknown[],
  rowOffset = 1,
): ExpressionImportResult {
  const items: ExpressionLibraryItem[] = []
  const issues: ExpressionImportIssue[] = []
  const identities = new Set<string>()
  let duplicateCount = 0

  for (const [index, row] of rows.entries()) {
    try {
      const item = parseRecord(row)
      const identity = createExpressionIdentity(item)
      if (identities.has(identity)) {
        duplicateCount += 1
        continue
      }
      identities.add(identity)
      items.push(item)
    } catch (error) {
      issues.push({
        row: index + rowOffset,
        message: error instanceof Error ? error.message : "记录格式不正确",
      })
    }
  }
  return { items, issues, duplicateCount }
}

export function createExpressionImportTemplate() {
  const headers = [
    "phrase",
    "meaning",
    "why",
    "origin",
    "example",
    "sceneCategory",
    "context",
    "kind",
  ]
  const row = [
    "keep an eye on",
    "留意；照看",
    "eye 代表持续观察，keep 强调让注意力维持在目标上。",
    "由 keep 与 eye 的视觉动作构成，现代英语中常用于提醒持续关注。",
    "Could you keep an eye on my bag for a minute?",
    "social",
    "通用",
    "idiom",
  ]
  return `${headers.join(",")}\n${row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")}\n`
}
