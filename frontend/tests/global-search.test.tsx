// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GlobalSearchDialog } from "@/components/global-search-dialog"
import { searchWorkspace } from "@/lib/global-search"
import { createDefaultLearningMemory } from "@/lib/memory"

const push = vi.hoisted(() => vi.fn())
const memory = createDefaultLearningMemory(new Date("2026-08-28T08:00:00.000Z"))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

vi.mock("@/components/learning-memory-provider", () => ({
  useLearningMemory: () => ({ state: memory }),
}))

afterEach(() => {
  cleanup()
  push.mockReset()
})

describe("global search", () => {
  it("indexes pages, available scenes, and learning memory", () => {
    expect(searchWorkspace(memory.items, "设置")[0]).toMatchObject({
      group: "页面",
      href: "/workspace/settings",
    })
    expect(searchWorkspace(memory.items, "句子列表")[0]).toMatchObject({
      group: "页面",
      href: "/workspace/sentences",
    })
    expect(searchWorkspace(memory.items, "地道表达")[0]).toMatchObject({
      group: "页面",
      href: "/workspace/expressions",
    })
    expect(searchWorkspace(memory.items, "oat milk")).toContainEqual(
      expect.objectContaining({
        group: "学习场景",
        href: "/workspace/conversation?scene=coffee",
      }),
    )
    expect(searchWorkspace(memory.items, "Could I get")).toContainEqual(
      expect.objectContaining({ group: "学习记忆" }),
    )
    expect(searchWorkspace(memory.items, "keep tabs on")).toContainEqual(
      expect.objectContaining({
        group: "学习场景",
        href: "/workspace/conversation?scene=idiomatic-english",
      }),
    )
    expect(searchWorkspace(memory.items, "经验法则")).toContainEqual(
      expect.objectContaining({
        group: "学习场景",
        href: "/workspace/conversation?scene=idiomatic-english",
      }),
    )
    expect(searchWorkspace(memory.items, "Giving a presentation")).toEqual([])
  })

  it("opens globally with the keyboard and navigates from a result", async () => {
    render(<GlobalSearchDialog />)

    const searchTrigger = screen.getAllByRole("button", { name: "打开全局搜索" })[0]
    const shortcutKeys = searchTrigger?.querySelectorAll("kbd")
    expect(searchTrigger?.textContent).toContain("+K")
    expect(shortcutKeys).toHaveLength(2)
    expect(shortcutKeys?.[0]?.querySelector("svg")).toBeTruthy()
    expect(shortcutKeys?.[0]?.className).toBe(shortcutKeys?.[1]?.className)
    expect(shortcutKeys?.[0]?.className).toContain("size-6")
    fireEvent.keyDown(window, { key: "k", metaKey: true })
    const input = await screen.findByRole("combobox", {
      name: "搜索页面、场景或学习记忆",
    })
    fireEvent.change(input, { target: { value: "coffee" } })

    expect(await screen.findByRole("option", { name: /咖啡店点单/ })).toBeTruthy()
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/workspace/conversation?scene=coffee"),
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("filters complete results with horizontal category tabs", async () => {
    render(<GlobalSearchDialog />)

    fireEvent.click(screen.getAllByRole("button", { name: "打开全局搜索" })[0] as HTMLElement)
    fireEvent.click(await screen.findByRole("tab", { name: /场景/ }))

    const results = screen.getByRole("listbox", { name: "搜索结果" })
    expect(results.className).toContain("overflow-y-auto")
    expect(screen.getByRole("option", { name: /咖啡店点单/ })).toBeTruthy()
    expect(screen.queryByRole("option", { name: /偏好设置/ })).toBeNull()
  })

  it("shows a clear empty state", async () => {
    render(<GlobalSearchDialog />)

    fireEvent.click(screen.getAllByRole("button", { name: "打开全局搜索" })[0] as HTMLElement)
    fireEvent.change(
      await screen.findByRole("combobox", { name: "搜索页面、场景或学习记忆" }),
      {
        target: { value: "no-result-phrase" },
      },
    )

    expect(await screen.findByText("没有找到相关内容")).toBeTruthy()
  })
})
