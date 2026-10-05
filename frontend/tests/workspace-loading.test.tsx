// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
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
