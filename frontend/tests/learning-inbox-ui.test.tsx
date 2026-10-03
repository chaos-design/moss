// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LearningNotifications } from "@/components/learning-notifications"
import { LearningAgentDashboard } from "@/features/agent/learning-agent-dashboard"
import { SentenceList } from "@/features/agent/sentence-list"
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

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-29T08:00:00.000Z"))
  mocks.state = createEmptyLearningMemory(new Date())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
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

  it("lists every due memory and links each reminder to review", () => {
    mocks.state = createDefaultLearningMemory(new Date())
    render(<LearningNotifications />)

    fireEvent.click(screen.getByRole("button", { name: "查看学习提醒，2 条待复习" }))

    expect(screen.getByText("2 条记忆已到找回时间")).toBeTruthy()
    expect(
      screen.getAllByRole("link", { name: /Could/ }).map((link) => link.getAttribute("href")),
    ).toEqual([
      "/workspace/review?memory=polite-request",
      "/workspace/review?memory=clarify-trade-off",
    ])
  })
})

describe("sentence list", () => {
  it("shows the empty state without placeholder records", () => {
    render(<SentenceList />)

    expect(screen.getByText("还没有记录句子")).toBeTruthy()
    expect(screen.getAllByText("0", { selector: "p" })).toHaveLength(3)
  })

  it("renders all recorded items and filters by type", () => {
    mocks.state = createDefaultLearningMemory(new Date())
    render(<SentenceList />)

    const list = screen.getByRole("region", { name: "已记录句子" })
    const links = within(list).getAllByRole("link")
    expect(links).toHaveLength(mocks.state.items.length)
    expect(
      links
        .find((link) => link.textContent?.includes("Could you clarify"))
        ?.getAttribute("href"),
    ).toBe("/workspace/review?memory=clarify-trade-off")

    fireEvent.click(screen.getByRole("tab", { name: "词汇" }))

    const filteredList = screen.getByRole("region", { name: "已记录句子" })
    expect(within(filteredList).getAllByRole("link")).toHaveLength(1)
    expect(screen.getByText("Do you still have this in stock?")).toBeTruthy()
    expect(screen.queryByText("Could you clarify the trade-off?")).toBeNull()
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
