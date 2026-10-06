// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReviewWorkspace } from "@/features/review/review-workspace"
import {
  createDefaultLearningMemory,
  createEmptyLearningMemory,
  type LearningMemoryState,
  type LearningMemorySyncStatus,
} from "@/lib/memory"

const mocks = vi.hoisted(() => ({
  recordRecallAttempt: vi.fn(),
  rateReview: vi.fn(),
  state: null as LearningMemoryState | null,
  syncStatus: "local" as LearningMemorySyncStatus,
}))

vi.mock("@/components/learning-memory-provider", () => ({
  useLearningMemory: () => ({
    hydrated: true,
    rateReview: mocks.rateReview,
    recordRecallAttempt: mocks.recordRecallAttempt,
    state: mocks.state,
    syncStatus: mocks.syncStatus,
  }),
}))

vi.mock("@/features/speech/use-local-tts", () => ({
  useLocalTts: () => ({
    speak: vi.fn().mockResolvedValue(undefined),
  }),
}))

beforeEach(() => {
  mocks.syncStatus = "local"
  mocks.rateReview.mockReset()
  mocks.recordRecallAttempt.mockReset()
  mocks.state = createDefaultLearningMemory(new Date("2026-08-29T08:00:00.000Z"))
  mocks.state.items = mocks.state.items.map((item) => ({
    ...item,
    nextReviewAt: "2026-08-28T08:00:00.000Z",
  }))
})

afterEach(cleanup)

describe("ReviewWorkspace", () => {
  it("uses the same three-region desktop layout as shadowing", () => {
    render(<ReviewWorkspace />)

    const queue = screen.getByRole("heading", { name: "复习队列" }).closest("aside")
    const workspace = queue?.parentElement
    const evidence = screen.getByRole("heading", { name: "记忆依据" }).closest("aside")

    expect(workspace?.className).toContain("lg:grid")
    expect(workspace?.className).toContain("lg:grid-cols-[220px_minmax(0,1fr)_260px]")
    expect(workspace?.firstElementChild).toBe(queue)
    expect(workspace?.lastElementChild).toBe(evidence)
  })

  it("records a recall attempt when the answer is revealed, not when it is rated", () => {
    render(<ReviewWorkspace />)
    const focus = mocks.state?.items.find((item) => item.id === "clarify-trade-off")
    if (!focus) {
      throw new Error("Missing review memory")
    }

    expect(mocks.recordRecallAttempt).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "显示答案" }))

    // 揭示答案就是一次可观测的回想尝试，与随后的自评分开记录。
    expect(mocks.recordRecallAttempt).toHaveBeenCalledTimes(1)
    expect(mocks.recordRecallAttempt).toHaveBeenCalledWith({
      itemId: focus.id,
      elapsedMs: expect.any(Number),
    })
    // 自评仍然只发生在评分动作上。
    expect(mocks.rateReview).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /记得/ }))

    expect(mocks.rateReview).toHaveBeenCalledWith(focus.id, "good")
    expect(mocks.recordRecallAttempt).toHaveBeenCalledTimes(1)
  })

  it("opens a requested memory first and keeps it through the transfer action", () => {
    const requested = mocks.state?.items.find((item) => item.id === "clarify-trade-off")
    if (!mocks.state || !requested) {
      throw new Error("Missing requested review memory")
    }
    mocks.state = { ...mocks.state, items: [requested] }

    render(<ReviewWorkspace initialMemoryItemId="clarify-trade-off" />)

    expect(screen.getByText(requested.cue)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "显示答案" }))
    fireEvent.click(screen.getByRole("button", { name: /记得/ }))

    expect(
      screen.getByRole("link", { name: "去一对一工作沟通复用" }).getAttribute("href"),
    ).toBe("/workspace/conversation?scene=one-on-one&memory=clarify-trade-off")
  })

  it("waits for initial cloud memory before fixing the targeted review queue", () => {
    mocks.state = createEmptyLearningMemory(new Date("2026-08-29T08:00:00.000Z"))
    mocks.syncStatus = "connecting"
    const view = render(<ReviewWorkspace initialMemoryItemId="clarify-trade-off" />)

    expect(screen.getByText("正在读取学习记忆")).toBeTruthy()
    expect(screen.queryByText("暂无真实复习记录")).toBeNull()

    mocks.state = createDefaultLearningMemory(new Date("2026-08-29T08:00:00.000Z"))
    mocks.syncStatus = "synced"
    view.rerender(<ReviewWorkspace initialMemoryItemId="clarify-trade-off" />)

    expect(screen.getByText("在会议中请对方进一步解释一个取舍")).toBeTruthy()

    mocks.syncStatus = "syncing"
    view.rerender(<ReviewWorkspace initialMemoryItemId="clarify-trade-off" />)
    expect(screen.queryByText("正在读取学习记忆")).toBeNull()
    expect(screen.getByText("在会议中请对方进一步解释一个取舍")).toBeTruthy()
  })
})
