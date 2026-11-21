import { parseExpressionImportRows } from "@/lib/expression-import"
import {
  type ExpressionGeneratedItem,
  expressionKindLabels,
  expressionSceneCategories,
} from "@/lib/expression-library-schema"

export const expressionGenerationPhraseLimit = 10
export const expressionGenerationPhraseMaxLength = 120

export function normalizeGenerationPhrases(input: readonly string[]) {
  const seen = new Set<string>()
  const phrases: string[] = []
  for (const raw of input) {
    const phrase = raw.normalize("NFKC").replace(/\s+/g, " ").trim()
    if (!phrase || phrase.length > expressionGenerationPhraseMaxLength) {
      continue
    }
    const key = phrase.toLocaleLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    phrases.push(phrase)
    if (phrases.length >= expressionGenerationPhraseLimit) {
      break
    }
  }
  return phrases
}

const categoryHint = expressionSceneCategories
  .map((category) => `${category.value}（${category.label}）`)
  .join("、")
const kindHint = Object.entries(expressionKindLabels)
  .map(([value, label]) => `${value}（${label}）`)
  .join("、")

const systemPrompt = `You build structured records for a Chinese learner's English expression library. Return ONLY one JSON array, no prose and no code fences. Each object must use exactly these fields:
phrase, meaning, why, origin, example, exampleTranslation, sceneCategory, context, kind, usage, memoryTip, examples.
Rules:
- Keep each requested phrase verbatim as the phrase value; do not translate or expand it.
- meaning, why, origin, exampleTranslation, usage, memoryTip are Simplified Chinese; example and the nested example text are natural English.
- why explains the literal image or semantic reasoning; origin is a cautious usage/source note, never a disputed certainty.
- example must contain the target expression in a complete sentence. exampleTranslation translates that sentence.
- examples is an array of 2 objects {text, translation}, each a different complete example with the expression highlighted by exact wording when possible.
- sceneCategory must be one of: ${categoryHint}.
- context must be one of 日常, 职场, 通用.
- kind must be one of: ${kindHint}.
- Do not add clientId, id, source, createdAt, updatedAt or any extra field.`

export function createExpressionGenerationMessages(phrases: readonly string[]) {
  return [
    { role: "system" as const, content: systemPrompt },
    {
      role: "user" as const,
      content: `Generate one record for each phrase below:\n${phrases
        .map((phrase, index) => `${index + 1}. ${phrase}`)
        .join("\n")}`,
    },
  ]
}

function extractJsonArray(content: string) {
  const candidate = content.trim()
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced?.[1] ?? candidate
  const start = body.indexOf("[")
  const end = body.lastIndexOf("]")
  if (start < 0 || end <= start) {
    throw new Error("生成结果不是 JSON 数组")
  }
  return body.slice(start, end + 1)
}

/** 先按导入契约校验，再把生成结果还原成纯导入字段交给现有预检流程。 */
export function parseExpressionGeneration(content: string): ExpressionGeneratedItem[] {
  let rows: unknown
  try {
    rows = JSON.parse(extractJsonArray(content)) as unknown
  } catch {
    throw new Error("生成结果不是有效 JSON")
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("生成结果没有可用表达")
  }
  const result = parseExpressionImportRows(rows, 1)
  if (result.items.length === 0) {
    throw new Error(result.issues[0]?.message ?? "生成结果未通过字段校验")
  }
  return result.items.map((item) => {
    const { clientId: _clientId, id: _id, source: _source, ...importItem } = item
    return importItem
  })
}
