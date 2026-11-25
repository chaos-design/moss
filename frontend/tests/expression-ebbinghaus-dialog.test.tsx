// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExpressionEbbinghausWorkspace } from "@/features/expressions/expression-ebbinghaus-dialog"
import type { ExpressionLibraryItem } from "@/lib/expression-library-schema"
import { createExpressionMemoryItemId, type LearningMemoryItem } from "@/lib/memory"

vi.mock("@/components/expression-text", () => ({
  ExpressionText: ({ text }: { text: string }) => <span>{text}</span>,
}))

function item(phrase: string, clientId: string): ExpressionLibraryItem {
  return {
    id: `builtin:${clientId}`,
    clientId,
    phrase,
    meaning: `含义：${phrase}`,
    why: "原因",
    origin: "来源",
    example: `Use ${phrase} here.`,
    context: "通用",
    kind: "idiom",
    sceneCategory: "work",
    source: "builtin",
  }
}

const pool = [item("rule of thumb", "a"), item("break the ice", "b")]

afterEach(cleanup)

function renderDialog(options?: {
  catalogItems?: readonly ExpressionLibraryItem[]
  memoryItems?: readonly LearningMemoryItem[]
}) {
  const onLearn = vi.fn()
  const onRate = vi.fn()
  const onProgress = vi.fn()
  const onExit = vi.fn()
  render(
    <ExpressionEbbinghausWorkspace
      pool={pool}
      catalogItems={options?.catalogItems ?? pool}
      memoryItems={options?.memoryItems ?? []}
      onExit={onExit}
      onLearn={onLearn}
      onRate={onRate}
      onProgress={onProgress}
    />,
  )
  return { onLearn, onRate, onProgress, onExit }
}

describe("expression ebbinghaus workspace", () => {
  it("runs learn, recall and re-memorize as one cycle", () => {
    const { onLearn, onRate, onProgress } = renderDialog()

    expect(screen.getByText(/艾宾浩斯记忆 · ① 学习/)).toBeTruthy()
    // 学习阶段：逐条揭示并写入长期记忆。
    fireEvent.click(screen.getByRole("button", { name: /揭示答案/ }))
    fireEvent.click(screen.getByRole("button", { name: /记住了，下一题/ }))
    fireEvent.click(screen.getByRole("button", { name: /揭示答案/ }))
    fireEvent.click(screen.getByRole("button", { name: /记住了，下一题/ }))

    expect(onLearn).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenCalledTimes(2)

    // 复习阶段：一条忘记进入再记忆，一条记得直接进入完成页统计。
    expect(screen.getByText(/艾宾浩斯记忆 · ② 复习/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /显示表达/ }))
    fireEvent.click(screen.getByRole("button", { name: /忘记了/ }))
    fireEvent.click(screen.getByRole("button", { name: /显示表达/ }))
    fireEvent.click(screen.getByRole("button", { name: /记得/ }))

    expect(onRate).toHaveBeenCalledTimes(2)
    expect(onRate).toHaveBeenCalledWith(createExpressionMemoryItemId("a"), "again")
    expect(onRate).toHaveBeenCalledWith(createExpressionMemoryItemId("b"), "good")

    // 再记忆阶段：失败项重新学习一次后进入完成页。
    expect(screen.getByText(/艾宾浩斯记忆 · ③ 再记忆/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /再看一次/ }))
    fireEvent.click(screen.getByRole("button", { name: /重新记住了/ }))

    expect(screen.getByText("这一轮记忆循环完成了")).toBeTruthy()
    expect(onLearn).toHaveBeenCalledTimes(3)
    expect(onProgress).toHaveBeenCalledTimes(3)
  })

  it("labels freshly learned recall separately from genuinely due reviews", () => {
    const dueMemory: LearningMemoryItem = {
      id: createExpressionMemoryItemId("c"),
      kind: "expression",
      label: "keep tabs on",
      cue: "主动学习并记住“keep tabs on”",
      answer: "keep tabs on",
      explanation: "测试记忆",
      sourceSceneId: "work",
      sourceSceneTitle: "职场",
      transferTargets: [],
      strength: 50,
      encounters: 1,
      successfulRecalls: 1,
      lapseCount: 0,
      intervalDays: 1,
      easeFactor: 2.5,
      repetitions: 1,
      lastSeenAt: "2026-11-19T08:00:00.000Z",
      nextReviewAt: "2026-11-19T08:00:00.000Z",
    }
    renderDialog({
      catalogItems: [...pool, item("keep tabs on", "c")],
      memoryItems: [dueMemory],
    })

    // 学完两条后进入复习，第一条是刚学条目。
    fireEvent.click(screen.getByRole("button", { name: /揭示答案/ }))
    fireEvent.click(screen.getByRole("button", { name: /记住了，下一题/ }))
    fireEvent.click(screen.getByRole("button", { name: /揭示答案/ }))
    fireEvent.click(screen.getByRole("button", { name: /记住了，下一题/ }))

    expect(screen.getByText("刚学 · 即时召回")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /显示表达/ }))
    fireEvent.click(screen.getByRole("button", { name: /记得/ }))
    fireEvent.click(screen.getByRole("button", { name: /显示表达/ }))
    fireEvent.click(screen.getByRole("button", { name: /记得/ }))

    // 第三条来自长期记忆的到期队列。
    expect(screen.getByText("已到期 · 间隔复习")).toBeTruthy()
    expect(screen.getByText(/这条已到复习时间/)).toBeTruthy()
  })
})
