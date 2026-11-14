import { describe, expect, it } from "vitest"
import {
  apiBargeInThresholdBoost,
  apiTurnEndSilenceMs,
  apiTurnMaxDurationMs,
  createApiAsrTurnTracker,
} from "@/features/speech/api-asr-turn-detection"

const FRAME_MS = 100

function feedFrames(
  tracker: ReturnType<typeof createApiAsrTurnTracker>,
  rms: number,
  frames: number,
) {
  const events: Array<ReturnType<typeof tracker.feed>> = []
  for (let index = 0; index < frames; index += 1) {
    events.push(tracker.feed(rms, FRAME_MS))
  }
  return events
}

describe("createApiAsrTurnTracker", () => {
  it("ignores noise during the calibration window and adapts the floor", () => {
    const tracker = createApiAsrTurnTracker()
    // 校准期 500ms 内持续的环境噪声（高于初始噪声底但低于自适应后的阈值）不得触发说话。
    const events = feedFrames(tracker, 0.03, 8)
    expect(events.every((event) => event === "none")).toBe(true)
  })

  it("emits speech-start after sustained speech and speech-end after silence", () => {
    const speechStarts: number[] = []
    const speechEnds: string[] = []
    const tracker = createApiAsrTurnTracker({
      onSpeechStart: () => speechStarts.push(1),
      onSpeechEnd: (reason) => speechEnds.push(reason),
    })
    feedFrames(tracker, 0.01, 6) // 先校准到安静环境
    const events = feedFrames(tracker, 0.2, 40)

    // 说话确认需要 320ms：约第 4 帧（100ms/帧）触发一次 start。
    expect(speechStarts).toHaveLength(1)
    expect(events.filter((event) => event === "speech-start")).toHaveLength(1)

    // 静音超过 apiTurnEndSilenceMs 后触发一次 end。
    feedFrames(tracker, 0.005, Math.ceil(apiTurnEndSilenceMs / FRAME_MS))
    expect(speechEnds).toEqual(["silence"])
  })

  it("does not treat a short blip as speech", () => {
    const speechStarts: number[] = []
    const tracker = createApiAsrTurnTracker({
      onSpeechStart: () => speechStarts.push(1),
    })
    feedFrames(tracker, 0.01, 6)
    feedFrames(tracker, 0.2, 2) // 200ms，低于 320ms 的说话确认
    feedFrames(tracker, 0.01, 20)
    expect(speechStarts).toHaveLength(0)
  })

  it("barge-in boost keeps playback echo silent while real speech triggers", () => {
    const speechStarts: number[] = []
    const tracker = createApiAsrTurnTracker({
      thresholdBoost: apiBargeInThresholdBoost,
      onSpeechStart: () => speechStarts.push(1),
    })
    feedFrames(tracker, 0.02, 10) // 校准到有底噪的环境（噪声底主导阈值）
    feedFrames(tracker, 0.05, 10) // 扬声器回声量级：低于 2.5 倍阈值，不触发
    expect(speechStarts).toHaveLength(0)
    feedFrames(tracker, 0.2, 6) // 真实靠近麦克风说话：立即确认打断
    expect(speechStarts).toHaveLength(1)
  })

  it("force-ends an utterance that exceeds the max duration", () => {
    const speechEnds: string[] = []
    const tracker = createApiAsrTurnTracker({
      onSpeechEnd: (reason) => speechEnds.push(reason),
    })
    feedFrames(tracker, 0.01, 6)
    feedFrames(tracker, 0.2, Math.ceil(apiTurnMaxDurationMs / FRAME_MS))
    expect(speechEnds).toContain("max-duration")
    // 强制断句后状态清零：继续说话需要重新确认 speech-start。
    expect(tracker.feed(0.2, FRAME_MS)).toBe("none")
  })

  it("reset clears an active utterance", () => {
    const speechEnds: string[] = []
    const tracker = createApiAsrTurnTracker({
      onSpeechEnd: (reason) => speechEnds.push(reason),
    })
    feedFrames(tracker, 0.01, 6)
    feedFrames(tracker, 0.2, 6)
    tracker.reset()
    feedFrames(tracker, 0.005, Math.ceil(apiTurnEndSilenceMs / FRAME_MS))
    expect(speechEnds).toEqual([])
  })
})
