// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExpressionStudyDialog } from "@/features/expressions/expression-study-dialog"
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

describe("ExpressionStudyDialog", () => {
  it("runs a flashcard round and records progress when the learner marks mastery", () => {
    const onProgress = vi.fn()
    render(
      <ExpressionStudyDialog
        open
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="flashcard"
        onClose={vi.fn()}
        onProgress={onProgress}
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
    expect(screen.getByText("这一组学完了")).toBeTruthy()
  })

  it("checks a cloze answer and shows the correct phrase when it is wrong", () => {
    render(
      <ExpressionStudyDialog
        open
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="cloze"
        onClose={vi.fn()}
        onProgress={vi.fn()}
      />,
    )

    const input = screen.getByRole("textbox", { name: "填入缺失的表达" })
    fireEvent.change(input, { target: { value: "rules of thumbs" } })
    fireEvent.click(screen.getByRole("button", { name: "检查答案" }))
    expect(screen.getByText("填对了")).toBeTruthy()
  })
})
