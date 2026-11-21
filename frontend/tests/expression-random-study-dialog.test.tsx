// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExpressionRandomStudyDialog } from "@/features/expressions/expression-random-study-dialog"
import type { ExpressionGroup } from "@/lib/memory"

const groups: ExpressionGroup[] = [
  {
    id: "g1",
    name: "面试表达",
    itemIds: ["work:a"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

afterEach(cleanup)

describe("ExpressionRandomStudyDialog", () => {
  it("uses an existing group when confirmed", () => {
    const onConfirm = vi.fn()
    render(
      <ExpressionRandomStudyDialog
        open
        onOpenChange={vi.fn()}
        count={5}
        groups={groups}
        onConfirm={onConfirm}
      />,
    )

    // 默认选中已有分组。
    fireEvent.click(screen.getByRole("button", { name: "抽取并开始学习" }))
    expect(onConfirm).toHaveBeenCalledWith({ kind: "existing", groupId: "g1" })
  })

  it("rejects a new group name that duplicates an existing one", () => {
    const onConfirm = vi.fn()
    render(
      <ExpressionRandomStudyDialog
        open
        onOpenChange={vi.fn()}
        count={5}
        groups={groups}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "创建新分组" }))
    fireEvent.change(screen.getByRole("textbox", { name: "新随机分组名称" }), {
      target: { value: "面试表达" },
    })
    fireEvent.click(screen.getByRole("button", { name: "抽取并开始学习" }))

    expect(screen.getByRole("alert").textContent).toContain("已存在同名分组")
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("accepts a unique new group name", () => {
    const onConfirm = vi.fn()
    render(
      <ExpressionRandomStudyDialog
        open
        onOpenChange={vi.fn()}
        count={10}
        groups={groups}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "创建新分组" }))
    fireEvent.change(screen.getByRole("textbox", { name: "新随机分组名称" }), {
      target: { value: "随机精读" },
    })
    fireEvent.click(screen.getByRole("button", { name: "抽取并开始学习" }))

    expect(onConfirm).toHaveBeenCalledWith({ kind: "new", name: "随机精读" })
  })
})
