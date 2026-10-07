// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import ConversationLoading from "@/app/workspace/conversation/loading"
import WorkspaceLoading from "@/app/workspace/loading"
import { navigationSections } from "@/lib/navigation-sections"

afterEach(cleanup)

describe("workspace route loading state", () => {
  it("announces the pending navigation instead of freezing the previous page", () => {
    render(<WorkspaceLoading />)

    const status = screen.getByRole("status")
    expect(status.getAttribute("aria-busy")).toBe("true")
    expect(status.getAttribute("aria-label")).toBe("正在加载页面")
    expect(status.textContent).toContain("正在加载页面内容，请稍候。")
  })

  it("reserves layout space with placeholder blocks instead of an empty viewport", () => {
    const view = render(<WorkspaceLoading />)

    const placeholders = view.container.querySelectorAll('[data-slot="skeleton"]')
    expect(placeholders.length).toBeGreaterThanOrEqual(6)
    expect(view.container.querySelector('[data-slot="skeleton"]')?.className).toContain(
      "animate-pulse",
    )
  })

  it("gives the conversation route a placeholder with its own insets", () => {
    // The shell drops its padding on this route so the transcript runs edge to edge. Without a
    // dedicated boundary the shared placeholder would render flush against the left and top edges.
    const { container } = render(<ConversationLoading />)

    const status = screen.getByRole("status")
    expect(status.getAttribute("aria-busy")).toBe("true")
    expect(status.getAttribute("aria-label")).toBe("正在加载对话页面")
    expect(status.textContent).toContain("正在加载对话页面，请稍候。")

    const header = container.querySelector("header")
    expect(header?.className).toContain("px-4")
    expect(header?.className).toContain("md:px-5")

    const transcript = container.querySelector('[data-slot="conversation-loading-transcript"]')
    expect(transcript?.className).toContain("px-5")
    expect(transcript?.className).toContain("md:px-8")

    // A placeholder transcript must stay out of the accessibility tree's live regions so it does
    // not announce itself alongside the outer status.
    expect(transcript?.getAttribute("role")).toBeNull()
  })

  it("keeps navigation metadata independent from the scene catalog", () => {
    // The persistent sidebar renders from this module alone, so scene content never has to be
    // part of the workspace shell bundle.
    const sections = navigationSections as ReadonlyArray<{
      items: ReadonlyArray<{ href: string }>
    }>

    expect(sections.flatMap((section) => section.items.map((item) => item.href))).toEqual([
      "/workspace",
      "/workspace/conversation",
      "/workspace/shadowing",
      "/workspace/map",
      "/workspace/scenes",
      "/workspace/expressions",
      "/workspace/review",
      "/workspace/analytics",
      "/workspace/notebook",
      "/workspace/sentences",
      "/workspace/settings",
    ])
  })
})
