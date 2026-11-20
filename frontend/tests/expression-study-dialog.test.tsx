// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExpressionStudyWorkspace } from "@/features/expressions/expression-study-dialog"
import type { ExpressionLibraryItem } from "@/lib/expression-library-schema"
import { createEmptyExpressionStudyState } from "@/lib/memory"

vi.mock("@/features/expressions/use-expression-dictation", () => ({
  useExpressionDictation: () => ({
    phase: "idle",
    transcript: "",
    verdict: null,
    error: "",
    play: vi.fn(),
    startRecording: vi.fn(),
    stopAndCheck: vi.fn(),
    reset: vi.fn(),
    supported: true,
  }),
}))

const item: ExpressionLibraryItem = {
  id: "builtin:a",
  clientId: "builtin-a",
  phrase: "rule of thumb",
  meaning: "经验法则",
  why: "来自经验而非精确计算。",
  origin: "传统说法。",
  example: "As a rule of thumb, keep it short.",
  exampleTranslation: "按经验法则，简短些。",
  context: "通用",
  kind: "idiom",
  sceneCategory: "work",
  source: "builtin",
}

afterEach(() => cleanup())

describe("ExpressionStudyWorkspace", () => {
  it("runs a flashcard round and records both progress and long-term memory on mastery", () => {
    const onProgress = vi.fn()
    const onStudyMemory = vi.fn()
    render(
      <ExpressionStudyWorkspace
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="flashcard"
        onExit={vi.fn()}
        onProgress={onProgress}
        onStudyMemory={onStudyMemory}
      />,
    )

    expect(screen.getByText("rule of thumb")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "揭示答案" }))
    expect(screen.getByText("经验法则")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "掌握了" }))
    expect(onProgress).toHaveBeenCalledWith(
      "work:rule of thumb",
      expect.objectContaining({ status: "mastered", incrementReviews: true }),
    )
    expect(onStudyMemory).toHaveBeenCalledWith(item)
    expect(screen.getByText("这一组学完了")).toBeTruthy()
  })

  it("also writes long-term memory when the learner only marks practice", () => {
    const onStudyMemory = vi.fn()
    render(
      <ExpressionStudyWorkspace
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="flashcard"
        onExit={vi.fn()}
        onProgress={vi.fn()}
        onStudyMemory={onStudyMemory}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "揭示答案" }))
    fireEvent.click(screen.getByRole("button", { name: "再练一次" }))
    expect(onStudyMemory).toHaveBeenCalledWith(item)
  })

  it("checks a cloze answer and shows the correct phrase when it is wrong", () => {
    render(
      <ExpressionStudyWorkspace
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="cloze"
        onExit={vi.fn()}
        onProgress={vi.fn()}
      />,
    )

    const input = screen.getByRole("textbox", { name: "填入缺失的表达" })
    fireEvent.change(input, { target: { value: "rules of thumbs" } })
    fireEvent.click(screen.getByRole("button", { name: "检查答案" }))
    expect(screen.getByText("填对了")).toBeTruthy()
  })
})
