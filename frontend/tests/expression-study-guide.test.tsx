// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ExpressionStudyGuide } from "@/features/expressions/expression-study-guide"

afterEach(cleanup)

describe("ExpressionStudyGuide", () => {
  it("explains the current flashcard mode, the four ratings and where learning goes", () => {
    render(<ExpressionStudyGuide target={{ kind: "mode", mode: "flashcard" }} />)

    expect(screen.getByText("闪卡自测怎么玩")).toBeTruthy()
    expect(screen.getByText("看表达，先在脑子里回忆，再核对")).toBeTruthy()
    // 四档评分与含义
    expect(screen.getByText("忘记了")).toBeTruthy()
    expect(screen.getByText("很轻松")).toBeTruthy()
    expect(screen.getByText("完全没想起来")).toBeTruthy()
    expect(screen.getByText("延长间隔")).toBeTruthy()
    // 学完之后
    expect(screen.getByText(/学完的表达会写入长期记忆/)).toBeTruthy()
  })

  it("shows the ebbinghaus three-stage explanation", () => {
    render(<ExpressionStudyGuide target={{ kind: "ebbinghaus" }} />)

    expect(screen.getByText("艾宾浩斯记忆循环怎么走")).toBeTruthy()
    expect(screen.getByText(/即时召回/)).toBeTruthy()
  })

  it("collapses and expands on demand", () => {
    render(<ExpressionStudyGuide target={{ kind: "mode", mode: "cloze" }} />)

    const toggle = screen.getByRole("button", { name: /例句填空怎么玩/ })
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText("四档评分决定下次什么时候复习")).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByText("四档评分决定下次什么时候复习")).toBeTruthy()
  })
})
