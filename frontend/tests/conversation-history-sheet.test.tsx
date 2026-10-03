// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ConversationHistorySheet } from "@/features/conversation/conversation-history-sheet"
import type { ConversationSession } from "@/lib/conversation-history"

afterEach(cleanup)

const session: ConversationSession = {
  id: "session-1",
  sceneId: "coffee",
  sceneTitle: "咖啡店点单",
  partnerName: "Mia",
  startedAt: "2026-08-29T08:00:00.000Z",
  updatedAt: "2026-08-29T08:01:00.000Z",
  durationSeconds: 60,
  status: "active",
  messages: [
    {
      id: "opening",
      role: "assistant",
      content: "What can I get for you?",
      translation: "想喝点什么？",
      note: "",
      timestamp: "00:00",
    },
  ],
}

describe("ConversationHistorySheet", () => {
  it("keeps long history within the viewport and scrolls the session list", () => {
    render(
      <ConversationHistorySheet
        currentSessionId="another-session"
        onDelete={vi.fn()}
        onSelect={vi.fn()}
        sessions={[session]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "打开历史对话" }))

    const sheet = document.querySelector('[data-slot="sheet-content"]')
    const historyList = document.querySelector("[data-conversation-history-list]")
    expect(sheet?.className).toContain("max-h-dvh")
    expect(sheet?.className).toContain("overflow-hidden")
    expect(historyList?.className).toContain("overflow-y-auto")
    expect(historyList?.className).toContain("overscroll-contain")
  })

  it("opens a history item as a continued conversation", () => {
    const onSelect = vi.fn()
    render(
      <ConversationHistorySheet
        currentSessionId="another-session"
        onDelete={vi.fn()}
        onSelect={onSelect}
        sessions={[session]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "打开历史对话" }))
    fireEvent.click(screen.getByRole("button", { name: "继续 咖啡店点单 对话" }))

    expect(onSelect).toHaveBeenCalledWith("session-1")
    expect(screen.queryByRole("dialog", { name: "历史对话" })).toBeNull()
  })

  it("requires confirmation before deleting a history session", () => {
    const onDelete = vi.fn()
    render(
      <ConversationHistorySheet
        currentSessionId="another-session"
        onDelete={onDelete}
        onSelect={vi.fn()}
        sessions={[session]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "打开历史对话" }))
    fireEvent.click(screen.getByRole("button", { name: "删除 咖啡店点单 对话" }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByText("删除这段历史对话？")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }))

    expect(onDelete).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledWith("session-1")
  })
})
