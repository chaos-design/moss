import { describe, expect, it } from "vitest"
import {
  formatCallDuration,
  getVoiceCallStatusDescription,
  getVoiceCallStatusLabel,
  isLikelyPlaybackEcho,
  normalizeSpeechTranscript,
} from "@/lib/call-runtime"

describe("voice call runtime", () => {
  it("formats call duration without allowing negative values", () => {
    expect(formatCallDuration(0)).toBe("00:00")
    expect(formatCallDuration(65.9)).toBe("01:05")
    expect(formatCallDuration(-10)).toBe("00:00")
  })

  it("normalizes browser speech transcripts", () => {
    expect(normalizeSpeechTranscript("  Could   I get a latte?  ")).toBe("Could I get a latte?")
  })

  it("detects delayed ASR echoes without blocking unrelated learner speech", () => {
    const spoken =
      "We have fresh blueberry muffins and almond croissants. Which one would you like?"

    expect(
      isLikelyPlaybackEcho("We have fresh blueberry muffins and almond croissants", spoken),
    ).toBe(true)
    expect(isLikelyPlaybackEcho("Could I have the chocolate cake instead?", spoken)).toBe(false)
  })

  it("provides a user-facing label for each active state", () => {
    expect(getVoiceCallStatusLabel("listening")).toBe("可以说话")
    expect(getVoiceCallStatusLabel("transcribing")).toBe("正在离线识别")
    expect(getVoiceCallStatusLabel("speaking")).toBe("正在回应")
    expect(getVoiceCallStatusLabel("ended")).toBe("通话已结束")
    expect(getVoiceCallStatusDescription("listening")).toBe("麦克风已开启，直接开始说话。")
  })
})
