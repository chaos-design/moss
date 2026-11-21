// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ExpressionStudyGuide } from "@/features/expressions/expression-study-guide"

afterEach(cleanup)

describe("ExpressionStudyGuide", () => {
  it("stays collapsed until the learner opens the on-demand hint", () => {
    render(<ExpressionStudyGuide target={{ kind: "mode", mode: "flashcard" }} />)

    // 默认收起：玩法说明只是一个紧凑按钮，详细内容不在文档里。
    expect(screen.getByRole("button", { name: "玩法说明" })).toBeTruthy()
    expect(screen.queryByText("闪卡自测怎么玩")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "玩法说明" }))

    expect(screen.getByText("闪卡自测怎么玩")).toBeTruthy()
    expect(screen.getByText("看表达，先在脑子里回忆，再核对")).toBeTruthy()
    expect(screen.getByText("忘记了")).toBeTruthy()
    expect(screen.getByText("很轻松")).toBeTruthy()
    expect(screen.getByText("完全没想起来")).toBeTruthy()
    expect(screen.getByText("延长间隔")).toBeTruthy()
    expect(screen.getByText(/学完的表达会写入长期记忆/)).toBeTruthy()
  })

  it("shows the ebbinghaus three-stage explanation on demand", () => {
    render(<ExpressionStudyGuide target={{ kind: "ebbinghaus" }} />)

    fireEvent.click(screen.getByRole("button", { name: "玩法说明" }))

    expect(screen.getByText("艾宾浩斯记忆循环怎么走")).toBeTruthy()
    expect(screen.getByText(/即时召回/)).toBeTruthy()
  })
})
