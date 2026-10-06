// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import HomePage from "@/app/page"
import { sceneItems } from "@/lib/demo-data"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("home page", () => {
  it("renders an automatic scene carousel with thumbnail previews", () => {
    vi.useFakeTimers()
    render(<HomePage />)

    expect(document.querySelector("header")?.className).not.toContain("border")
    expect(screen.getByRole("heading", { level: 1, name: "Moss" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "开始这段对话" }).getAttribute("href")).toBe(
      "/workspace/conversation?scene=coffee",
    )
    expect(screen.queryByRole("navigation", { name: "首页操作" })).toBeNull()
    expect(screen.getByText("忙碌早晨的咖啡店")).toBeTruthy()
    expect(screen.getByText("Of course. Is that for here or to go?")).toBeTruthy()
    expect(screen.getByText("表达焦点")).toBeTruthy()
    expect(screen.getByText("RAG 记忆")).toBeTruthy()
    expect(screen.getByText(/补充 “to go”/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "开始通话" }).getAttribute("href")).toBe(
      "/workspace/conversation?scene=coffee",
    )

    const sceneNavigation = screen.getByRole("navigation", {
      name: "全部场景快捷入口",
    })
    expect(sceneNavigation.children).toHaveLength(sceneItems.length)
    expect(within(sceneNavigation).getAllByRole("link")).toHaveLength(
      sceneItems.filter((scene) => scene.status !== "locked").length,
    )
    expect(
      within(sceneNavigation)
        .getByRole("link", { name: "进入工作会议场景" })
        .getAttribute("href"),
    ).toBe("/workspace/conversation?scene=meeting")
    expect(screen.queryByText("01 / 03")).toBeNull()
    expect(screen.queryByRole("link", { name: "查看 80 个场景" })).toBeNull()

    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(
      screen.getByRole("link", {
        name: "工作会议，表达观点、澄清信息并推进讨论。",
      }),
    ).toBeTruthy()
    expect(screen.getByRole("heading", { name: "长期记忆" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "间隔重复" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "个性建议" })).toBeTruthy()
    expect(screen.getByAltText("在咖啡店进行英语情景对话")).toBeTruthy()
  })

  it("links the footer to the project repository in a new tab", () => {
    render(<HomePage />)

    const repository = screen.getByRole("link", { name: "GitHub" })
    expect(repository.getAttribute("href")).toBe("https://github.com/chaos-design/moss")
    expect(repository.getAttribute("target")).toBe("_blank")
    expect(repository.getAttribute("rel")).toBe("noreferrer")
  })
})
