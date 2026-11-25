// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WorkspaceHeader } from "@/components/workspace-header"
import { createEmptyLearningMemory, type LearningMemoryState } from "@/lib/memory"

const memoryMocks = vi.hoisted(() => ({
  state: null as LearningMemoryState | null,
  syncNow: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    accountLabel: "学习账户",
    requireSignIn: vi.fn(),
  }),
}))

vi.mock("@/components/learning-memory-provider", () => ({
  useLearningMemory: () => ({
    state: memoryMocks.state,
    syncNow: memoryMocks.syncNow,
    syncStatus: "local",
  }),
}))

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => null,
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn(), theme: "light" }),
}))

beforeEach(() => {
  memoryMocks.state = createEmptyLearningMemory(new Date("2026-10-05T08:00:00.000Z"))
  memoryMocks.syncNow.mockReset()
})

afterEach(() => {
  cleanup()
})

describe("WorkspaceHeader", () => {
  it("collapses the brand wordmark below sm so the sticky row fits a 390px viewport", () => {
    render(<WorkspaceHeader />)

    const header = screen.getByRole("banner")
    const brand = within(header).getByRole("link", { name: "Moss 学习首页" })

    // nowrap 的品牌全称作宽超过 170px：390px 视口下连「Moss」字样都会把整行撑到 480px，
    // 因此文字列在 sm（640px）以下整体视觉隐藏，只留 32px 标记。
    expect(brand.className).toContain("max-sm:[&>span:last-child]:hidden")
    // 文字列仍保留在 DOM 中：低于 sm 只是视觉隐藏，而不是被移除。
    expect(brand.textContent).toContain("Moss")
  })

  it("keeps the sticky header opaque on every workspace page", () => {
    render(<WorkspaceHeader />)

    const header = screen.getByRole("banner")
    expect(header.className).toContain("sticky")
    expect(header.className).toContain("bg-background")
  })
})
