// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { SettingsIcon } from "lucide-react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppNavigation } from "@/components/app-navigation"
import { Brand } from "@/components/brand"
import { PageHeading } from "@/components/page-heading"
import { SidebarLearningProgress } from "@/components/workspace-shell"
import { createDefaultLearningMemory } from "@/lib/memory"

const linkStatus = vi.hoisted(() => ({ pending: false }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace/settings",
}))

vi.mock("next/link", async () => {
  const actual = await vi.importActual<typeof import("next/link")>("next/link")
  return { ...actual, useLinkStatus: () => ({ pending: linkStatus.pending }) }
})

afterEach(() => {
  cleanup()
  linkStatus.pending = false
})

describe("workspace navigation", () => {
  it("renders shared page headers without a border", () => {
    const view = render(
      <PageHeading
        eyebrow="Preferences"
        title="学习配置"
        description="调整学习和对话偏好。"
        icon={SettingsIcon}
        motif="settings"
      />,
    )

    const headerClassName = view.container.querySelector("header")?.className
    expect(headerClassName).not.toContain("border")
    expect(headerClassName).not.toContain("pb-")
  })

  it("uses a recognizable settings gear in collapsed navigation", () => {
    render(<AppNavigation collapsed />)

    const settingsLink = screen.getByRole("link", { name: "偏好设置" })

    expect(settingsLink.querySelector(".lucide-settings")).toBeTruthy()
    expect(screen.getByRole("link", { name: "地道表达" }).getAttribute("href")).toBe(
      "/workspace/expressions",
    )
  })

  it("marks the clicked destination as pending through the link status hook", () => {
    linkStatus.pending = false
    const view = render(<AppNavigation />)
    const settingsLink = screen.getByRole("link", { name: "偏好设置" })

    expect(settingsLink.querySelector(".animate-spin")).toBeNull()
    expect(settingsLink.textContent).not.toContain("正在打开页面")

    linkStatus.pending = true
    view.rerender(<AppNavigation />)

    expect(settingsLink.querySelector(".animate-spin")).toBeTruthy()
    expect(settingsLink.textContent).toContain("正在打开页面")
  })

  it("summarizes learning progress as average memory strength", () => {
    const state = createDefaultLearningMemory(new Date("2026-08-29T08:00:00.000Z"))
    const expectedStrength = Math.round(
      state.items.reduce((total, item) => total + item.strength, 0) / state.items.length,
    )

    const view = render(<SidebarLearningProgress collapsed={false} state={state} />)

    expect(screen.getByText("记忆强度")).toBeTruthy()
    expect(screen.getByText(`${expectedStrength}%`)).toBeTruthy()
    expect(
      screen.getByText(`${state.items.length} 条记忆 · ${state.events.length} 次练习`),
    ).toBeTruthy()

    view.rerender(<SidebarLearningProgress collapsed state={state} />)
    expect(
      screen.getByRole("button", { name: `平均记忆强度 ${expectedStrength}%` }),
    ).toBeTruthy()
  })

  it("points the brand out of the workspace so it acts as an exit", () => {
    render(<Brand />)

    expect(screen.getByRole("link", { name: "Moss 学习首页" }).getAttribute("href")).toBe("/")
  })

  it("keeps the brand destination overridable per route", () => {
    render(<Brand href="/workspace" />)

    expect(screen.getByRole("link", { name: "Moss 学习首页" }).getAttribute("href")).toBe(
      "/workspace",
    )
  })
})
