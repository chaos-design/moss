// @vitest-environment jsdom

import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { VoiceActivity } from "@/features/conversation/voice-activity"
import type { VoiceCallStatus } from "@/lib/call-runtime"

describe("VoiceActivity", () => {
  it("gives every active call phase its own color so the stage reads at a glance", () => {
    // 连接=蓝、离线识别=紫、思考=琥珀、可以说话=绿、播报中=品牌色：
    // 与头部状态徽章共用同一套状态色，四个阶段不再混在一个琥珀色里。
    const phases: Array<[VoiceCallStatus, string]> = [
      ["connecting", "text-[var(--chart-4)]"],
      ["transcribing", "text-[var(--chart-5)]"],
      ["thinking", "text-[var(--chart-3)]"],
      ["listening", "text-[var(--success)]"],
      ["speaking", "text-primary"],
    ]
    for (const [status, color] of phases) {
      const view = render(<VoiceActivity status={status} />)
      expect(view.container.firstElementChild?.className).toContain(color)
      view.unmount()
    }
  })

  it("keeps idle and muted phases in the neutral color", () => {
    for (const status of ["idle", "muted", "ended"] as const) {
      const view = render(<VoiceActivity status={status} />)
      expect(view.container.firstElementChild?.className).toContain("text-muted-foreground")
      view.unmount()
    }
  })
})
