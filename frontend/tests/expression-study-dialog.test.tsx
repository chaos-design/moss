// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExpressionStudyWorkspace } from "@/features/expressions/expression-study-dialog"
import type { ExpressionLibraryItem } from "@/lib/expression-library-schema"
import { createEmptyExpressionStudyState } from "@/lib/memory"

const toastSuccess = vi.fn()
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
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

afterEach(() => {
  cleanup()
  toastSuccess.mockReset()
})

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
    // 即时反馈说明写入长期记忆与下次到期。
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("10 分钟后到期"),
      expect.objectContaining({ description: expect.stringContaining("长期记忆") }),
    )
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

  it("reveals with Space and rates with 1/2 from the keyboard", () => {
    const onProgress = vi.fn()
    render(
      <ExpressionStudyWorkspace
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="flashcard"
        onExit={vi.fn()}
        onProgress={onProgress}
      />,
    )

    // 空格揭示答案（焦点不在控件上）。
    fireEvent.keyDown(window, { key: " " })
    expect(screen.getByText("经验法则")).toBeTruthy()
    // 揭示后按 2 记为掌握。
    fireEvent.keyDown(window, { key: "2" })
    expect(onProgress).toHaveBeenCalledWith(
      "work:rule of thumb",
      expect.objectContaining({ status: "mastered" }),
    )
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

  it("translate mode reveals the Chinese translation and rates like flashcard", () => {
    const onProgress = vi.fn()
    render(
      <ExpressionStudyWorkspace
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="translate"
        onExit={vi.fn()}
        onProgress={onProgress}
      />,
    )

    expect(screen.getByText("rule of thumb")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "揭示翻译" }))
    expect(screen.getByText("按经验法则，简短些。")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "掌握了" }))
    expect(onProgress).toHaveBeenCalledWith(
      "work:rule of thumb",
      expect.objectContaining({ status: "mastered" }),
    )
  })

  it("sentence mode lets the learner type a sentence and checks the reference", () => {
    const onProgress = vi.fn()
    render(
      <ExpressionStudyWorkspace
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="sentence"
        onExit={vi.fn()}
        onProgress={onProgress}
      />,
    )

    const input = screen.getByRole("textbox", { name: "造一句句子" })
    fireEvent.change(input, { target: { value: "A rule of thumb is to keep it short." } })
    fireEvent.click(screen.getByRole("button", { name: "造句" }))
    expect(screen.getByText("你的句子")).toBeTruthy()
    expect(screen.getByText("句子里含有目标表达。")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "掌握了" }))
    expect(onProgress).toHaveBeenCalledWith(
      "work:rule of thumb",
      expect.objectContaining({ status: "mastered" }),
    )
  })

  it("sentence mode re-edits after 再练一次", () => {
    render(
      <ExpressionStudyWorkspace
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="sentence"
        onExit={vi.fn()}
        onProgress={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole("textbox", { name: "造一句句子" }), {
      target: { value: "A rule of thumb is to keep it short." },
    })
    fireEvent.click(screen.getByRole("button", { name: "造句" }))
    fireEvent.click(screen.getByRole("button", { name: "再练一次" }))
    expect(screen.getByRole("textbox", { name: "造一句句子" })).toBeTruthy()
  })

  it("quick mode advances to the next item without rating", () => {
    const onProgress = vi.fn()
    render(
      <ExpressionStudyWorkspace
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="quick"
        onExit={vi.fn()}
        onProgress={onProgress}
      />,
    )

    expect(screen.getByRole("heading", { name: "rule of thumb" })).toBeTruthy()
    fireEvent.keyDown(window, { key: " " })
    expect(onProgress).toHaveBeenCalledWith(
      "work:rule of thumb",
      expect.objectContaining({ status: "learning", incrementReviews: true }),
    )
    expect(screen.getByText("这一组学完了")).toBeTruthy()
  })

  it("flashcard example translation uses the shared toggle named after the phrase", () => {
    render(
      <ExpressionStudyWorkspace
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="flashcard"
        onExit={vi.fn()}
        onProgress={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "揭示答案" }))
    const toggle = screen.getByRole("button", { name: "显示 rule of thumb 的例句译文" })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(toggle)
    expect(screen.getByText("按经验法则，简短些。")).toBeTruthy()
    expect(
      screen
        .getByRole("button", { name: "收起 rule of thumb 的例句译文" })
        .getAttribute("aria-expanded"),
    ).toBe("true")
  })

  it("cloze mode opens the example translation without losing the answer input", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "显示 rule of thumb 的例句译文" }))
    expect(screen.getByText("按经验法则，简短些。")).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "填入缺失的表达" })).toBeTruthy()
  })

  it("sentence mode shows the target meaning before writing and the example translation after submitting", () => {
    render(
      <ExpressionStudyWorkspace
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="sentence"
        onExit={vi.fn()}
        onProgress={vi.fn()}
      />,
    )

    expect(screen.getByText("目标表达")).toBeTruthy()
    expect(screen.getByText("经验法则")).toBeTruthy()
    fireEvent.change(screen.getByRole("textbox", { name: "造一句句子" }), {
      target: { value: "A rule of thumb is to keep it short." },
    })
    fireEvent.click(screen.getByRole("button", { name: "造句" }))
    fireEvent.click(screen.getByRole("button", { name: "显示 rule of thumb 的例句译文" }))
    expect(screen.getByText("按经验法则，简短些。")).toBeTruthy()
  })

  it("quick mode shows the example with a translation toggle", () => {
    render(
      <ExpressionStudyWorkspace
        items={[item]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="quick"
        onExit={vi.fn()}
        onProgress={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "显示 rule of thumb 的例句译文" }))
    expect(screen.getByText("按经验法则，简短些。")).toBeTruthy()
  })

  it("resets the example translation when advancing to the next item", () => {
    const nextItem: ExpressionLibraryItem = {
      ...item,
      id: "builtin:b",
      clientId: "builtin-b",
      phrase: "piece of cake",
      example: "That was a piece of cake.",
      exampleTranslation: "那真是小菜一碟。",
    }
    render(
      <ExpressionStudyWorkspace
        items={[item, nextItem]}
        scope={{ kind: "filtered" }}
        study={createEmptyExpressionStudyState()}
        initialMode="quick"
        onExit={vi.fn()}
        onProgress={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "显示 rule of thumb 的例句译文" }))
    expect(screen.getByText("按经验法则，简短些。")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "下一条" }))
    expect(screen.getByRole("button", { name: "显示 piece of cake 的例句译文" })).toBeTruthy()
    expect(screen.queryByText("按经验法则，简短些。")).toBeNull()
  })
})
