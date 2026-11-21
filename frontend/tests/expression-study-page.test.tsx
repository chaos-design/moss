// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExpressionStudyPage } from "@/features/expressions/expression-study-page"
import { createEmptyLearningMemory } from "@/lib/memory"

const routerPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}))

const memoryMocks = vi.hoisted(() => ({
  recordExpressionStudy: vi.fn(),
  recordExpressionProgress: vi.fn(),
  rateReview: vi.fn(),
}))

vi.mock("@/components/learning-memory-provider", () => ({
  useLearningMemory: () => ({
    state: createEmptyLearningMemory(),
    recordExpressionStudy: memoryMocks.recordExpressionStudy,
    recordExpressionProgress: memoryMocks.recordExpressionProgress,
    rateReview: memoryMocks.rateReview,
  }),
}))

vi.mock("@/features/expressions/use-expression-library-source", () => ({
  useExpressionLibrarySource: () => ({
    allItems: [],
    filteredItems: [
      {
        id: "builtin:a",
        clientId: "builtin-a",
        phrase: "rule of thumb",
        meaning: "经验法则",
        why: "来自经验。",
        origin: "传统说法。",
        example: "As a rule of thumb, keep it short.",
        context: "通用",
        kind: "idiom",
        sceneCategory: "work",
        source: "builtin",
      },
    ],
    favoriteIdentities: new Set<string>(),
    studyGroups: [],
    progressByIdentity: {},
  }),
}))

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

vi.mock("@/components/expression-text", () => ({
  ExpressionText: ({ text }: { text: string }) => <span>{text}</span>,
}))

afterEach(() => {
  cleanup()
  memoryMocks.recordExpressionStudy.mockReset()
  memoryMocks.recordExpressionProgress.mockReset()
  routerPush.mockReset()
})

describe("ExpressionStudyPage", () => {
  it("writes progress and long-term memory when a study item is completed", () => {
    render(<ExpressionStudyPage scope={{ kind: "filtered" }} mode="flashcard" session={0} />)

    fireEvent.click(screen.getByRole("button", { name: "揭示答案" }))
    fireEvent.click(screen.getByRole("button", { name: "掌握了" }))

    expect(memoryMocks.recordExpressionProgress).toHaveBeenCalledWith(
      "work:rule of thumb",
      expect.objectContaining({ status: "mastered", incrementReviews: true }),
    )
    expect(memoryMocks.recordExpressionStudy).toHaveBeenCalledWith(
      expect.objectContaining({ label: "rule of thumb", phrase: "rule of thumb" }),
    )
  })

  it("exits back to the library", () => {
    render(<ExpressionStudyPage scope={{ kind: "filtered" }} mode="flashcard" session={0} />)
    fireEvent.click(screen.getByRole("button", { name: "返回词库" }))
    expect(routerPush).toHaveBeenCalledWith("/workspace/expressions")
  })
})
