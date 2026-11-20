// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExpressionEbbinghausDialog } from "@/features/expressions/expression-ebbinghaus-dialog"
import type { ExpressionLibraryItem } from "@/lib/expression-library-schema"
import { createExpressionMemoryItemId } from "@/lib/memory"

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

function renderDialog() {
  const onLearn = vi.fn()
  const onRate = vi.fn()
  const onProgress = vi.fn()
  const onClose = vi.fn()
  render(
    <ExpressionEbbinghausDialog
      open
      pool={pool}
      catalogItems={pool}
      memoryItems={[]}
      onClose={onClose}
      onLearn={onLearn}
      onRate={onRate}
      onProgress={onProgress}
    />,
  )
  return { onLearn, onRate, onProgress, onClose }
}

describe("expression ebbinghaus dialog", () => {
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
})
