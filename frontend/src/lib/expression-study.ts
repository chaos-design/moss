import { splitExpressionHighlights } from "./expression-highlight"
import {
  createExpressionIdentity,
  type ExpressionLibraryItem,
} from "./expression-library-schema"
import type { ExpressionProgressStatus } from "./memory/expression-study-state"

/**
 * 词库内四种学习方式的纯逻辑：闪卡只需要原条目，填空要把例句里的目标表达挖空，
 * 跟读听写要把识别结果与目标表达做容错比对，按分组学习则是先解析候选集合。
 * 这里不依赖 React，便于独立测试判定标准。
 */

export type ExpressionStudyMode = "flashcard" | "cloze" | "dictation"

export const expressionStudyModeLabels: Record<ExpressionStudyMode, string> = {
  flashcard: "闪卡自测",
  cloze: "例句填空",
  dictation: "跟读听写",
}

export type ExpressionStudyScope =
  | { kind: "filtered" }
  | { kind: "favorites" }
  | { kind: "group"; groupId: string }
  | { kind: "review"; status: ExpressionProgressStatus }
  | { kind: "random"; count: number }
  | { kind: "ebbinghaus" }

export const expressionStudyScopeLabels: Record<ExpressionStudyScope["kind"], string> = {
  filtered: "当前筛选结果",
  favorites: "我的收藏",
  group: "学习分组",
  review: "按进度复习",
  random: "随机学习",
  ebbinghaus: "艾宾浩斯记忆",
}

export type Cloze = {
  before: string
  answer: string
  after: string
}

/** 复用例句高亮切分，挖空的位置与词库里高亮的位置严格一致（含词形变化/占位符替换）。 */
export function buildCloze(
  item: Pick<ExpressionLibraryItem, "phrase" | "example">,
): Cloze | null {
  const segments = splitExpressionHighlights(item.example, item.phrase)
  const targetIndex = segments.findIndex((segment) => segment.highlighted)
  if (targetIndex < 0) {
    return null
  }
  return {
    before: segments
      .slice(0, targetIndex)
      .map((segment) => segment.text)
      .join(""),
    answer: segments[targetIndex].text,
    after: segments
      .slice(targetIndex + 1)
      .map((segment) => segment.text)
      .join(""),
  }
}

/** 归一化：NFKC、统一撇号、只留字母数字与空格、折叠空白。大小写不敏感。 */
export function normalizeExpressionText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function stemToken(value: string): string {
  if (value.length <= 3) {
    return value
  }
  if (value.endsWith("ies")) {
    return `${value.slice(0, -3)}y`
  }
  if (value.endsWith("ing") && value.length > 5) {
    return value.slice(0, -3)
  }
  if (value.endsWith("ed") && value.length > 4) {
    return value.slice(0, -2)
  }
  // 只有 s/x/z/ch/sh 结尾的复数才去掉整个 -es（boxes→box、watches→watch）；
  // rules→rule 这类普通 -s 复数要走下面的单 s 规则，否则会误切成 rul。
  const beforeEs = value.slice(0, -2)
  if (value.endsWith("es") && value.length > 4 && /(s|x|z|ch|sh)$/.test(beforeEs)) {
    return beforeEs
  }
  if (value.endsWith("s") && !value.endsWith("ss")) {
    return value.slice(0, -1)
  }
  return value
}

function stemmedTokens(value: string): string[] {
  return normalizeExpressionText(value).split(" ").filter(Boolean).map(stemToken)
}

/**
 * 词干级逐词比对：容忍大小写、标点、复数与时态变化（keep tabs on / keeps tab on），
 * 但不放过漏词和多词。用于填空判定。
 */
export function checkClozeAnswer(expected: string, input: string): boolean {
  const target = stemmedTokens(expected)
  const answer = stemmedTokens(input)
  if (target.length === 0 || target.length !== answer.length) {
    return false
  }
  return target.every((token, index) => token === answer[index])
}

/**
 * 听写容错比对：ASR 常丢冠词、标点或个别虚词，用词干集合的 Dice 相似度而不是逐字相等。
 * 阈值 0.8 表示「大部分实词都听对了」，可通过参数收紧。
 */
export function checkDictation(
  expected: string,
  transcript: string,
  threshold = 0.8,
): { passed: boolean; similarity: number } {
  const target = stemmedTokens(expected)
  const heard = stemmedTokens(transcript)
  if (target.length === 0 || heard.length === 0) {
    return { passed: false, similarity: 0 }
  }
  const heardCounts = new Map<string, number>()
  for (const token of heard) {
    heardCounts.set(token, (heardCounts.get(token) ?? 0) + 1)
  }
  let overlap = 0
  for (const token of target) {
    const remaining = heardCounts.get(token) ?? 0
    if (remaining > 0) {
      overlap += 1
      heardCounts.set(token, remaining - 1)
    }
  }
  const similarity = (2 * overlap) / (target.length + heard.length)
  return { passed: similarity >= threshold, similarity }
}

/**
 * Fisher-Yates 洗牌。`random` 可注入，便于测试固定抽样结果；默认使用 Math.random。
 * 只在 UI 层决定学习顺序，不写入任何持久化状态，因此刷新后会重新抽样。
 */
export function shuffleStudyItems<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(index, Math.floor(random() * (index + 1)))
    const current = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = current
  }
  return result
}

export type StudyScopeInput = {
  filteredItems: readonly ExpressionLibraryItem[]
  favoriteIdentities: ReadonlySet<string>
  groupItemIds?: readonly string[]
  progressByIdentity: Readonly<Record<string, ExpressionProgressStatus>>
  scope: ExpressionStudyScope
  random?: () => number
}

/**
 * 解析学习范围：收藏/分组/复习进度都按表达身份取当前词库里仍存在的条目。
 * 随机范围从当前筛选结果里抽取固定条数；艾宾浩斯范围把整个筛选结果交给记忆法流程自行编排。
 */
export function resolveStudyItems({
  filteredItems,
  favoriteIdentities,
  groupItemIds,
  progressByIdentity,
  scope,
  random = Math.random,
}: StudyScopeInput): ExpressionLibraryItem[] {
  switch (scope.kind) {
    case "filtered":
      return [...filteredItems]
    case "random":
      return shuffleStudyItems(filteredItems, random).slice(
        0,
        Math.max(0, Math.min(Math.floor(scope.count), filteredItems.length)),
      )
    case "ebbinghaus":
      return [...filteredItems]
    case "favorites":
      return filteredItems.filter((item) =>
        favoriteIdentities.has(createExpressionIdentity(item)),
      )
    case "group": {
      const selected = new Set(groupItemIds ?? [])
      return filteredItems.filter((item) => selected.has(createExpressionIdentity(item)))
    }
    case "review":
      return filteredItems.filter(
        (item) => progressByIdentity[createExpressionIdentity(item)] === scope.status,
      )
  }
}
