// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReviewWorkspace } from "@/features/review/review-workspace"
import { builtInExpressionItems } from "@/lib/expression-library"
import {
  createDefaultLearningMemory,
  createEmptyLearningMemory,
  createExpressionMemoryItemId,
  getScopedReviewQueue,
  type LearningMemoryItem,
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

const reviewExpression = builtInExpressionItems[0]

function expressionMemoryItem(): LearningMemoryItem {
  if (!reviewExpression) {
    throw new Error("Missing built-in expression")
  }
  return {
    id: createExpressionMemoryItemId(reviewExpression.clientId),
    kind: "expression",
    label: reviewExpression.phrase,
    cue: reviewExpression.meaning,
    answer: reviewExpression.phrase,
    explanation: reviewExpression.why,
    sourceSceneId: reviewExpression.sceneCategory,
    sourceSceneTitle: "社交关系",
    transferTargets: [],
    strength: 45,
    encounters: 1,
    successfulRecalls: 0,
    lapseCount: 0,
    intervalDays: 1,
    easeFactor: 2.3,
    repetitions: 0,
    lastSeenAt: "2026-08-28T08:00:00.000Z",
    nextReviewAt: "2026-08-28T08:00:00.000Z",
  }
}

beforeEach(() => {
  window.localStorage.clear()
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
    // 队列首位由到期时间与强度决定，不再固定为某一条示例记忆。
    const focus = mocks.state ? getScopedReviewQueue(mocks.state)[0] : undefined
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

  it("separates idiomatic expression review from scene review", () => {
    if (!mocks.state) {
      throw new Error("Missing memory state")
    }
    mocks.state.items = [expressionMemoryItem(), ...mocks.state.items]

    render(<ReviewWorkspace />)
    const scopeGroup = screen.getAllByRole("group", { name: "复习范围" })[0]
    if (!scopeGroup) {
      throw new Error("Missing scope switch")
    }

    fireEvent.click(within(scopeGroup).getByRole("button", { name: "地道表达" }))
    expect(screen.getByRole("button", { name: "地道表达" }).getAttribute("aria-pressed")).toBe(
      "true",
    )
    // 只有一条词库表达，场景记忆不会混进「地道表达」范围。
    expect(screen.getByText("第 1 条，共 1 条")).toBeTruthy()
    expect(screen.queryByText("在会议中请对方进一步解释一个取舍")).toBeNull()
  })

  it("only queues scene memories when the scene scope is active", () => {
    if (!mocks.state) {
      throw new Error("Missing memory state")
    }
    mocks.state.items = [expressionMemoryItem(), ...mocks.state.items]

    render(<ReviewWorkspace />)
    const scopeGroup = screen.getAllByRole("group", { name: "复习范围" })[0]
    if (!scopeGroup) {
      throw new Error("Missing scope switch")
    }

    fireEvent.click(within(scopeGroup).getByRole("button", { name: "场景" }))
    const sceneCount = mocks.state
      ? getScopedReviewQueue(mocks.state, { scope: "scene" }).length
      : 0
    expect(sceneCount).toBeGreaterThan(0)
    expect(screen.getByText(`第 1 条，共 ${sceneCount} 条`)).toBeTruthy()
    expect(screen.queryByText(reviewExpression.phrase)).toBeNull()
    expect(screen.queryByText(reviewExpression.meaning)).toBeNull()
  })

  it("asks an exam question for a library expression and scores the answer", () => {
    if (!mocks.state || !reviewExpression) {
      throw new Error("Missing memory state")
    }
    const expressionItem = expressionMemoryItem()
    mocks.state.items = [expressionItem]

    render(<ReviewWorkspace initialMemoryItemId={expressionItem.id} />)

    // 题干是英文表达，四个中文释义选项，作答前不显示答案。
    expect(screen.getByRole("heading", { name: reviewExpression.phrase })).toBeTruthy()
    expect(screen.getByText("选出最贴近的中文含义")).toBeTruthy()
    const options = within(screen.getByRole("group", { name: "选项" })).getAllByRole("button")
    expect(options).toHaveLength(4)
    expect(screen.queryByRole("button", { name: /记得/ })).toBeNull()

    const wrongOption = options.find(
      (option) => !option.textContent?.includes(reviewExpression.meaning),
    )
    if (!wrongOption) {
      throw new Error("Missing distractor option")
    }
    fireEvent.click(wrongOption)

    expect(screen.getByText("这道题没有答对")).toBeTruthy()
    expect(screen.getByText("正确答案：")).toBeTruthy()
    expect(screen.getByText(reviewExpression.example)).toBeTruthy()
    expect(mocks.recordRecallAttempt).toHaveBeenCalledWith({
      itemId: expressionItem.id,
      elapsedMs: expect.any(Number),
    })

    fireEvent.click(screen.getByRole("button", { name: /记得/ }))
    expect(mocks.rateReview).toHaveBeenCalledWith(expressionItem.id, "good")
  })
})
