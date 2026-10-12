// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LearningAnalyticsWorkspace } from "@/features/analytics/learning-analytics-workspace"
import {
  createDefaultLearningMemory,
  type LearningMemoryEvent,
  type LearningMemoryState,
} from "@/lib/memory"

const mocks = vi.hoisted(() => ({
  state: null as LearningMemoryState | null,
}))

vi.mock("@/components/learning-memory-provider", () => ({
  useLearningMemory: () => ({ state: mocks.state }),
}))

function createEvent(
  id: string,
  type: LearningMemoryEvent["type"],
  itemId: string,
  sceneId: string,
  successful: boolean,
  daysAgo: number,
): LearningMemoryEvent {
  const occurredAt = new Date()
  occurredAt.setDate(occurredAt.getDate() - daysAgo)
  return {
    id,
    type,
    itemId,
    sceneId,
    successful,
    occurredAt: occurredAt.toISOString(),
  }
}

function selectPeriod(name: string) {
  fireEvent.click(screen.getByRole("combobox", { name: "选择分析周期" }))
  const option = screen.getByRole("option", { name })
  fireEvent.pointerDown(option, { pointerType: "mouse" })
  fireEvent.click(option)
}

beforeEach(() => {
  mocks.state = createDefaultLearningMemory(new Date())
  mocks.state.events = [
    createEvent("recent", "conversation", "polite-request", "coffee", true, 0),
    createEvent("older", "review", "clarify-trade-off", "meeting", false, 10),
  ]
})

afterEach(() => {
  cleanup()
})

describe("LearningAnalyticsWorkspace", () => {
  it("updates metrics, activity context, and weak points from one period control", async () => {
    render(<LearningAnalyticsWorkspace />)

    const summary = screen.getByRole("region", { name: "真实能力指标" })
    const weakPoints = screen.getByRole("region", { name: "周期薄弱点" })
    expect(summary.textContent).toContain("有效练习1")
    expect(screen.getByText(/最近 7 个自然日/)).toBeTruthy()
    expect(within(weakPoints).getByText("当前周期没有重复失误。")).toBeTruthy()

    selectPeriod("最近 30 天")

    await waitFor(() => {
      expect(summary.textContent).toContain("有效练习2")
      expect(screen.getByText(/最近 30 个自然日/)).toBeTruthy()
      expect(within(weakPoints).getByText("礼貌澄清")).toBeTruthy()
    })

    selectPeriod("本阶段")

    await waitFor(() => {
      expect(summary.textContent).toContain("有效练习1")
      expect(screen.getByText(/当前 A2 阶段/)).toBeTruthy()
      expect(within(weakPoints).getByText("当前周期没有重复失误。")).toBeTruthy()
    })
  })

  it("styles the next-action banner with theme tokens instead of an inverted surface", () => {
    render(<LearningAnalyticsWorkspace />)

    const banner = screen.getByText("NEXT BEST ACTION").closest("section")
    expect(banner).toBeTruthy()
    expect(banner?.className).toContain("bg-accent")
    expect(banner?.className).toContain("border-primary")
    expect(banner?.className).not.toContain("bg-foreground")

    // 行动按钮改用主色（琥珀），与主题色板保持一致，而不是反色卡片上的次级按钮。
    const cta = banner?.querySelector("a")
    expect(cta?.className).toContain("bg-primary")
  })
})
