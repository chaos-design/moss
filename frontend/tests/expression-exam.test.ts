import { describe, expect, it } from "vitest"
import {
  buildExpressionExamQuestion,
  createExpressionCatalog,
  resolveExamKind,
} from "@/features/review/expression-exam"
import { builtInExpressionItems } from "@/lib/expression-library"
import { createExpressionMemoryItemId, type LearningMemoryItem } from "@/lib/memory"

const pool = builtInExpressionItems
const catalog = createExpressionCatalog(pool)

function memoryItemFor(phrase: string): LearningMemoryItem {
  const expression = pool.find((item) => item.phrase === phrase)
  if (!expression) {
    throw new Error(`Missing expression: ${phrase}`)
  }
  return {
    id: createExpressionMemoryItemId(expression.clientId),
    kind: "expression",
    label: expression.phrase,
    cue: expression.meaning,
    answer: expression.phrase,
    explanation: expression.why,
    sourceSceneId: expression.sceneCategory,
    sourceSceneTitle: "社交关系",
    transferTargets: [],
    strength: 40,
    encounters: 2,
    successfulRecalls: 1,
    lapseCount: 0,
    intervalDays: 2,
    easeFactor: 2.2,
    repetitions: 1,
    lastSeenAt: "2026-11-01T08:00:00.000Z",
    nextReviewAt: "2026-11-02T08:00:00.000Z",
  }
}

describe("expression exam", () => {
  it("rotates through the three question types instead of repeating one drill", () => {
    expect(resolveExamKind(0)).toBe("meaning-choice")
    expect(resolveExamKind(1)).toBe("phrase-choice")
    expect(resolveExamKind(2)).toBe("cloze")
    expect(resolveExamKind(3)).toBe("meaning-choice")
  })

  it("builds a stable four-option meaning question", () => {
    const item = memoryItemFor("keep tabs on")
    const expression = catalog.get(item.id)
    if (!expression) {
      throw new Error("Missing catalog entry")
    }
    const question = buildExpressionExamQuestion({
      item,
      expression,
      pool,
      attempt: 0,
    })
    if (!question) {
      throw new Error("Missing question")
    }

    expect(question.kind).toBe("meaning-choice")
    expect(question.prompt).toBe("keep tabs on")
    expect(question.phrase).toBe("keep tabs on")
    expect(question.options).toHaveLength(4)
    expect(new Set(question.options.map((option) => option.label)).size).toBe(4)
    const correct = question.options.find((option) => option.id === question.correctOptionId)
    expect(correct?.label).toBe(expression.meaning)
    // 作答后展示的学习支架与题库内容同源，三种题型共用。
    expect(question.usage).toBe(expression.usage)
    expect(question.memoryTip).toBe(expression.memoryTip)
    expect(question.examples).toEqual(expression.examples)

    // 同一题必须稳定：重渲染不会换题或换选项顺序。
    const repeated = buildExpressionExamQuestion({ item, expression, pool, attempt: 0 })
    expect(repeated).toEqual(question)
  })

  it("asks for the English expression when the Chinese meaning is the prompt", () => {
    const item = memoryItemFor("call it a day")
    const expression = catalog.get(item.id)
    if (!expression) {
      throw new Error("Missing catalog entry")
    }
    const question = buildExpressionExamQuestion({ item, expression, pool, attempt: 1 })
    if (!question) {
      throw new Error("Missing question")
    }

    expect(question.kind).toBe("phrase-choice")
    expect(question.prompt).toBe(expression.meaning)
    const correct = question.options.find((option) => option.id === question.correctOptionId)
    expect(correct?.label).toBe("call it a day")
  })

  it("blanks the expression inside the example for a cloze question", () => {
    const item = memoryItemFor("spill the beans")
    const expression = catalog.get(item.id)
    if (!expression) {
      throw new Error("Missing catalog entry")
    }
    const question = buildExpressionExamQuestion({ item, expression, pool, attempt: 2 })
    if (!question) {
      throw new Error("Missing question")
    }

    expect(question.kind).toBe("cloze")
    expect(question.prompt).toContain("_____")
    expect(question.prompt.toLowerCase()).not.toContain("spill the beans")
    const correct = question.options.find((option) => option.id === question.correctOptionId)
    expect(correct?.label).toBe("spill the beans")
  })

  it("falls back to a meaning question when the phrase cannot be blanked out", () => {
    const item = memoryItemFor("keep someone in the loop")
    const expression = catalog.get(item.id)
    if (!expression) {
      throw new Error("Missing catalog entry")
    }
    const question = buildExpressionExamQuestion({ item, expression, pool, attempt: 2 })
    if (!question) {
      throw new Error("Missing question")
    }

    // 例句写的是具体人名，短语无法原样挖空，因此改用释义题而不是给出无效填空。
    expect(question.kind).toBe("meaning-choice")
    expect(question.prompt).toBe("keep someone in the loop")
  })

  it("returns null when the catalog cannot supply four distinct options", () => {
    const item = memoryItemFor("keep tabs on")
    const expression = catalog.get(item.id)
    if (!expression) {
      throw new Error("Missing catalog entry")
    }

    expect(
      buildExpressionExamQuestion({ item, expression, pool: [expression], attempt: 0 }),
    ).toBeNull()
  })
})
