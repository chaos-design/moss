import type { ExpressionExample, ExpressionLibraryItem } from "@/lib/expression-library-schema"
import type { LearningMemoryItem } from "@/lib/memory"
import { createExpressionMemoryItemId } from "@/lib/memory"

/**
 * 地道表达的考试式复习。
 *
 * 复习不是再看一遍卡片：先给出一道题，四个选项里只有一个正确，作答后再看释义依据。
 * 题型在释义选择、表达选择和例句填空之间轮换，同一道题在同一次渲染里必须稳定，
 * 因此所有随机性都来自条目 id 与题号的确定性哈希，而不是 `Math.random()`。
 */

export type ExpressionExamKind = "meaning-choice" | "phrase-choice" | "cloze"

export const expressionExamKindLabels: Record<ExpressionExamKind, string> = {
  "meaning-choice": "释义选择",
  "phrase-choice": "表达选择",
  cloze: "例句填空",
}

const examKindOrder: readonly ExpressionExamKind[] = [
  "meaning-choice",
  "phrase-choice",
  "cloze",
]

export type ExpressionExamOption = {
  id: string
  label: string
}

export type ExpressionExamQuestion = {
  kind: ExpressionExamKind
  instruction: string
  prompt: string
  hint?: string
  options: ExpressionExamOption[]
  correctOptionId: string
  /** 目标表达原形，用于例句高亮与拓展内容。 */
  phrase: string
  explanation: string
  example: string
  exampleTranslation?: string
  /** 主例句之外的迁移例句，作答后展示。 */
  examples?: readonly ExpressionExample[]
  usage?: string
  memoryTip?: string
}

const optionIds = ["a", "b", "c", "d"] as const
const minimumOptionCount = 4

function hashValue(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededOrder<T>(values: readonly T[], seed: string, key: (value: T) => string) {
  return values
    .map((value, index) => ({
      value,
      score: hashValue(`${seed}:${key(value)}:${index}`),
    }))
    .sort((left, right) => left.score - right.score)
    .map((entry) => entry.value)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 把例句里的表达替换成空格。例句常用词形变化（spill → spilled）或具体人名替换占位符
 * （someone → Maya），因此先按原形匹配，再允许首词带上 -s/-ed/-ing 词尾；两者都不成立
 * 时返回 null，由调用方改用释义题，而不是给出一个没有空格的填空题。
 */
function blankOutExample(example: string, phrase: string) {
  const [head, ...tail] = phrase.split(/\s+/)
  if (!head) {
    return null
  }
  const headPattern = escapeRegExp(head)
  const tailPattern = tail.map(escapeRegExp).join("\\s+")
  const patterns = tailPattern
    ? [
        new RegExp(`\\b${headPattern}\\s+${tailPattern}\\b`, "i"),
        new RegExp(`\\b${headPattern}(?:s|es|ed|d|ing)\\s+${tailPattern}\\b`, "i"),
      ]
    : [
        new RegExp(`\\b${headPattern}\\b`, "i"),
        new RegExp(`\\b${headPattern}(?:s|es|ed|d|ing)\\b`, "i"),
      ]
  for (const pattern of patterns) {
    if (pattern.test(example)) {
      return example.replace(pattern, "_____")
    }
  }
  return null
}

export function createExpressionCatalog(
  items: readonly ExpressionLibraryItem[],
): Map<string, ExpressionLibraryItem> {
  return new Map(
    items.map((item) => [createExpressionMemoryItemId(item.clientId), item] as const),
  )
}

export function resolveExamKind(attempt: number): ExpressionExamKind {
  const index = Math.abs(Math.trunc(attempt)) % examKindOrder.length
  return examKindOrder[index] ?? "meaning-choice"
}

export function buildExpressionExamQuestion(input: {
  item: LearningMemoryItem
  expression: ExpressionLibraryItem
  pool: readonly ExpressionLibraryItem[]
  attempt: number
}): ExpressionExamQuestion | null {
  const { item, expression, pool } = input
  // 题号决定题型；同一题的选项顺序与题号绑定，重渲染不会换题。
  const seed = `${item.id}:${input.attempt}`
  let kind = resolveExamKind(input.attempt)

  const distinctPhrases = pool.filter((candidate) => candidate.phrase !== expression.phrase)
  const distinctMeanings = distinctPhrases.filter(
    (candidate) => candidate.meaning !== expression.meaning,
  )
  if (
    distinctPhrases.length < minimumOptionCount - 1 ||
    distinctMeanings.length < minimumOptionCount - 1
  ) {
    return null
  }

  const blankedExample = blankOutExample(expression.example, expression.phrase)
  if (kind === "cloze" && !blankedExample) {
    kind = "meaning-choice"
  }

  const correctLabel =
    kind === "phrase-choice" || kind === "cloze" ? expression.phrase : expression.meaning
  const candidatePool = kind === "meaning-choice" ? distinctMeanings : distinctPhrases
  const key =
    kind === "meaning-choice"
      ? (value: ExpressionLibraryItem) => value.meaning
      : (value: ExpressionLibraryItem) => value.phrase
  const distractors: string[] = []
  for (const candidate of seededOrder(candidatePool, `${seed}:distractors`, key)) {
    const label = key(candidate)
    if (label && label !== correctLabel && !distractors.includes(label)) {
      distractors.push(label)
    }
    if (distractors.length === minimumOptionCount - 1) {
      break
    }
  }
  if (distractors.length < minimumOptionCount - 1) {
    return null
  }

  const optionLabels = seededOrder(
    [correctLabel, ...distractors],
    `${seed}:options`,
    (label) => label,
  )
  const options = optionLabels.map((label, index) => ({
    id: optionIds[index] ?? String(index),
    label,
  }))
  const correctOption = options.find((option) => option.label === correctLabel)
  if (!correctOption) {
    return null
  }

  // 作答后要展示的内容：主例句、拓展例句、用法与记忆提示。三个题型共用同一份，
  // 避免只在某一种题型里出现学习支架。
  const revealed = {
    phrase: expression.phrase,
    example: expression.example,
    ...(expression.exampleTranslation
      ? { exampleTranslation: expression.exampleTranslation }
      : {}),
    ...(expression.examples?.length ? { examples: expression.examples } : {}),
    ...(expression.usage ? { usage: expression.usage } : {}),
    ...(expression.memoryTip ? { memoryTip: expression.memoryTip } : {}),
  }

  if (kind === "phrase-choice") {
    return {
      kind,
      instruction: "选出对应的英文表达",
      prompt: expression.meaning,
      hint: `来自「${item.sourceSceneTitle}」`,
      options,
      correctOptionId: correctOption.id,
      explanation: expression.why,
      ...revealed,
    }
  }

  if (kind === "cloze") {
    return {
      kind,
      instruction: "选出例句中缺少的表达",
      prompt: blankedExample ?? expression.example,
      hint: expression.meaning,
      options,
      correctOptionId: correctOption.id,
      explanation: expression.why,
      ...revealed,
    }
  }

  return {
    kind,
    instruction: "选出最贴近的中文含义",
    prompt: expression.phrase,
    hint: `来自「${item.sourceSceneTitle}」`,
    options,
    correctOptionId: correctOption.id,
    explanation: expression.why,
    ...revealed,
  }
}
