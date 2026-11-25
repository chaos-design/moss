// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ExpressionText } from "@/components/expression-text"

afterEach(cleanup)

describe("ExpressionText", () => {
  it("renders the target phrase as bold blue text on a highlighted blue pill", () => {
    const { container } = render(
      <ExpressionText text="As a rule of thumb, keep it short." phrase="rule of thumb" />,
    )

    const mark = container.querySelector("mark")
    expect(mark).not.toBeNull()
    expect(mark?.textContent).toBe("rule of thumb")
    // 参考样式：蓝色加粗文字 + 一层更醒目的圆角蓝色底（chart-4 @40%），不用浏览器默认黄底。
    expect(mark?.className).toContain("font-bold")
    expect(mark?.className).toContain("text-chart-4")
    expect(mark?.className).toContain("bg-chart-4/40")
    expect(mark?.className).toContain("rounded-sm")
    expect(mark?.className).not.toMatch(/bg-(primary|yellow)/)
  })

  it("leaves the surrounding text unchanged and unhighlighted", () => {
    const { container } = render(
      <ExpressionText text="As a rule of thumb, keep it short." phrase="rule of thumb" />,
    )

    const spans = [...container.querySelectorAll("span")]
    expect(spans.some((span) => span.textContent === "As a ")).toBe(true)
    expect(spans.some((span) => span.textContent === ", keep it short.")).toBe(true)
  })
})
