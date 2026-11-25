// @vitest-environment jsdom

import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { VoiceActivity } from "@/features/conversation/voice-activity"
import type { VoiceCallStatus } from "@/lib/call-runtime"

describe("VoiceActivity", () => {
  it("gives every active call phase its own color so the stage reads at a glance", () => {
    // 连接=蓝、录音中=红、识别=紫、思考=琥珀、可以说话=绿、播报中=品牌色：
    // 与头部状态徽章共用同一套状态色，录音中是唯一红色阶段——学习者开口的瞬间
    // 就能确认「真的在录」。
    const phases: Array<[VoiceCallStatus, string]> = [
      ["connecting", "text-[var(--chart-4)]"],
      ["recording", "text-[var(--chart-1)]"],
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

  it("labels the recording phase for assistive technology", () => {
    const view = render(<VoiceActivity status="recording" />)
    expect(view.getByRole("img", { name: "正在录音，聆听你的发言" })).toBeTruthy()
    view.unmount()
  })

  it("keeps idle and muted phases in the neutral color", () => {
    for (const status of ["idle", "muted", "ended"] as const) {
      const view = render(<VoiceActivity status={status} />)
      expect(view.container.firstElementChild?.className).toContain("text-muted-foreground")
      view.unmount()
    }
  })
})
