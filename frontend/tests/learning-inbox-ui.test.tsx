// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LearningNotifications } from "@/components/learning-notifications"
import { LearningAgentDashboard } from "@/features/agent/learning-agent-dashboard"
import { MemoryNotebook } from "@/features/agent/memory-notebook"
import { SentenceList } from "@/features/agent/sentence-list"
import { getDueSentenceItems } from "@/lib/learning-inbox"
import {
  createDefaultLearningMemory,
  createEmptyLearningMemory,
  type LearningMemoryState,
} from "@/lib/memory"

const mocks = vi.hoisted(() => ({
  state: null as LearningMemoryState | null,
}))

vi.mock("@/components/learning-memory-provider", () => ({
  useLearningMemory: () => ({ state: mocks.state }),
}))

let intersectionCallback: IntersectionObserverCallback = () => {}

function triggerIntersection() {
  act(() => {
    intersectionCallback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-29T08:00:00.000Z"))
  mocks.state = createEmptyLearningMemory(new Date())
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback
      }

      disconnect() {}
      observe() {}
      unobserve() {}
      takeRecords() {
        return []
      }

      readonly root = null
      readonly rootMargin = "360px 0px"
      readonly thresholds = [0]
    },
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("learning notifications", () => {
  it("shows an actionable empty state", () => {
    render(<LearningNotifications />)

    const trigger = screen.getByRole("button", { name: "查看学习提醒" })
    trigger.focus()
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger)

    expect(screen.getByText("今天的找回任务已处理完")).toBeTruthy()
    expect(screen.getByRole("link", { name: "查看全部句子" }).getAttribute("href")).toBe(
      "/workspace/sentences",
    )
  })

  it("lists the earliest due memories and caps the popover", () => {
    if (!mocks.state) {
      throw new Error("Missing memory state")
    }
    mocks.state = createDefaultLearningMemory(new Date())
    const dueItems = getDueSentenceItems(mocks.state.items, new Date())
    render(<LearningNotifications />)

    fireEvent.click(
      screen.getByRole("button", {
        name: `查看学习提醒，${dueItems.length} 条待复习`,
      }),
    )

    expect(screen.getByText(`${dueItems.length} 条记忆已到找回时间`)).toBeTruthy()
    const links = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/workspace/review?memory="))
    // 弹层只显示最早到期的 5 条，其余提示去复习页。
    expect(links).toHaveLength(Math.min(5, dueItems.length))
    expect(links[0]?.getAttribute("href")).toBe(`/workspace/review?memory=${dueItems[0]?.id}`)
    if (dueItems.length > 5) {
      expect(screen.getByText(/仅显示最早到期的 5 条/)).toBeTruthy()
    }
  })
})

describe("sentence list", () => {
  it("shows the empty state without placeholder records", () => {
    render(<SentenceList />)

    expect(screen.getByText("还没有记录句子")).toBeTruthy()
    expect(screen.getAllByText("0", { selector: "p" })).toHaveLength(3)
  })

  it("renders the first batch and loads more at the sentinel", () => {
    if (!mocks.state) {
      throw new Error("Missing memory state")
    }
    mocks.state = createDefaultLearningMemory(new Date())
    render(<SentenceList />)

    const list = screen.getByRole("region", { name: "已记录句子" })
    expect(within(list).getAllByRole("link")).toHaveLength(12)
    expect(screen.getByText(`已显示 12 / ${mocks.state.items.length} 条`)).toBeTruthy()

    triggerIntersection()

    expect(within(list).getAllByRole("link")).toHaveLength(24)
  })

  it("filters by type and keeps only the matching records", () => {
    if (!mocks.state) {
      throw new Error("Missing memory state")
    }
    mocks.state = createDefaultLearningMemory(new Date())
    render(<SentenceList />)

    fireEvent.click(screen.getByRole("tab", { name: "词汇" }))

    const filteredList = screen.getByRole("region", { name: "已记录句子" })
    const links = within(filteredList).getAllByRole("link")
    const vocabularyCount = mocks.state.items.filter(
      (item) => item.kind === "vocabulary",
    ).length
    expect(links).toHaveLength(Math.min(12, vocabularyCount))
    expect(screen.getByText("Do you still have this in stock?")).toBeTruthy()
    expect(screen.queryByText("Could you clarify the trade-off?")).toBeNull()
  })
})

describe("memory notebook", () => {
  it("keeps a compact count and filter bar sticky above the long list", () => {
    if (!mocks.state) {
      throw new Error("Missing memory state")
    }
    mocks.state = createDefaultLearningMemory(new Date())
    render(<MemoryNotebook />)

    const filterBar = screen
      .getByRole("tablist", { name: "筛选记忆类型" })
      .closest("div.sticky")
    expect(filterBar?.className).toContain("sticky")
    expect(filterBar?.className).toContain("top-16")
    expect(filterBar?.textContent).toContain("长期记忆")
    expect(filterBar?.textContent).toContain(String(mocks.state.items.length))
  })

  it("renders twelve memories first and appends the next batch on scroll", () => {
    if (!mocks.state) {
      throw new Error("Missing memory state")
    }
    mocks.state = createDefaultLearningMemory(new Date())
    render(<MemoryNotebook />)

    const list = screen.getByRole("heading", { name: "Moss 的长期记忆" }).closest("section")
    if (!list) {
      throw new Error("Missing memory list")
    }
    expect(within(list).getAllByRole("article")).toHaveLength(12)
    expect(screen.getByText(`已显示 12 / ${mocks.state.items.length} 条`)).toBeTruthy()

    triggerIntersection()

    expect(within(list).getAllByRole("article")).toHaveLength(24)
  })

  it("filters memories by kind from the sticky bar", () => {
    if (!mocks.state) {
      throw new Error("Missing memory state")
    }
    mocks.state = createDefaultLearningMemory(new Date())
    render(<MemoryNotebook />)

    fireEvent.click(screen.getByRole("tab", { name: "语法" }))

    const list = screen.getByRole("heading", { name: "Moss 的长期记忆" }).closest("section")
    if (!list) {
      throw new Error("Missing memory list")
    }
    const grammarCount = mocks.state.items.filter((item) => item.kind === "grammar").length
    expect(within(list).getAllByRole("article")).toHaveLength(Math.min(12, grammarCount))
    expect(screen.getByText(`语法 · ${grammarCount} 条`)).toBeTruthy()
  })
})

describe("learning dashboard", () => {
  it("uses a dense waterfall layout with theme-aware guidance and more learning signals", () => {
    mocks.state = createDefaultLearningMemory(new Date())
    const view = render(<LearningAgentDashboard />)

    const waterfall = Array.from(view.container.querySelectorAll("div")).find((element) =>
      element.className.includes("columns-1"),
    )
    const recommendation = screen.getByText("Moss 的今日建议").closest("section")

    expect(waterfall?.className).toContain("lg:columns-2")
    expect(recommendation?.className).toContain("bg-accent/25")
    expect(recommendation?.className).not.toContain("bg-[#20332e]")
    expect(screen.getByRole("heading", { name: "最近练过的场景" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "练习构成" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "下一批迁移目标" })).toBeTruthy()
  })
})
