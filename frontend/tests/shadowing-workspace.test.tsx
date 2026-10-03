// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ShadowingWorkspace } from "@/features/shadowing/shadowing-workspace"
import type { ShadowingRecording } from "@/features/shadowing/use-shadowing-recorder"
import {
  createDefaultLearningMemory,
  createEmptyLearningMemory,
  type LearningMemoryState,
} from "@/lib/memory"
import type { ShadowingAssessment } from "@/lib/shadowing-assessment"

const mocks = vi.hoisted(() => ({
  onComplete: null as null | ((result: ShadowingRecording) => void),
  play: vi.fn(),
  recordShadowingAttempt: vi.fn(),
  reset: vi.fn(),
  speakWithVoice: vi.fn(),
  state: null as LearningMemoryState | null,
  start: vi.fn(),
  stop: vi.fn(),
  recorder: {
    elapsedSeconds: 0,
    playing: false,
    processing: false,
    recording: false,
    result: null as null | {
      audioUrl: string
      assessment: ShadowingAssessment
      waveform: number[]
    },
  },
}))

vi.mock("@/components/learning-memory-provider", () => ({
  useLearningMemory: () => ({
    state: mocks.state,
    recordShadowingAttempt: mocks.recordShadowingAttempt,
  }),
}))

vi.mock("@/features/speech/use-local-tts", () => ({
  useLocalTts: () => ({
    config: { version: 2, engine: "kokoro", voice: "af_heart" },
    playbackState: "idle",
    speakWithVoice: mocks.speakWithVoice,
    stop: vi.fn(),
  }),
}))

vi.mock("@/features/shadowing/use-shadowing-recorder", () => ({
  useShadowingRecorder: (options: { onComplete: (result: ShadowingRecording) => void }) => {
    mocks.onComplete = options.onComplete
    return {
      ...mocks.recorder,
      play: mocks.play,
      reset: mocks.reset,
      start: mocks.start,
      stop: mocks.stop,
      stopPlayback: vi.fn(),
    }
  },
}))

beforeEach(() => {
  mocks.state = createEmptyLearningMemory(new Date("2026-08-29T08:00:00.000Z"))
})

afterEach(() => {
  cleanup()
  mocks.onComplete = null
  mocks.recorder.result = null
  mocks.recordShadowingAttempt.mockReset()
  mocks.speakWithVoice.mockReset().mockResolvedValue(undefined)
  mocks.start.mockReset()
})

describe("ShadowingWorkspace", () => {
  it("shows measured scores and saves the completed attempt", () => {
    const view = render(<ShadowingWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))
    expect(
      (screen.getByRole("button", { name: "进入应用" }) as HTMLButtonElement).disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "开始录音" }))
    expect(mocks.start).toHaveBeenCalledOnce()

    const assessment: ShadowingAssessment = {
      overallScore: 82,
      clarityScore: 84,
      fluencyScore: 79,
      rhythmScore: 83,
      durationSeconds: 4.2,
      voicedRatio: 0.68,
    }
    mocks.recorder.result = {
      audioUrl: "blob:recording",
      assessment,
      waveform: Array.from({ length: 20 }, () => 50),
    }
    view.rerender(<ShadowingWorkspace />)

    expect(screen.getByRole("region", { name: "跟读评分" }).textContent).toContain("82")
    expect(
      (screen.getByRole("button", { name: "回放本次" }) as HTMLButtonElement).disabled,
    ).toBe(false)
    expect(
      (screen.getByRole("button", { name: "进入应用" }) as HTMLButtonElement).disabled,
    ).toBe(false)

    act(() => {
      mocks.onComplete?.({
        assessment,
        audioUrl: "blob:recording",
        waveform: Array.from({ length: 20 }, () => 50),
      })
    })
    expect(screen.getByRole("region", { name: "录音对比" }).textContent).toContain("本次录音")

    fireEvent.click(screen.getByRole("button", { name: "重新录音" }))
    expect(mocks.start).toHaveBeenCalledTimes(2)
    act(() => {
      mocks.onComplete?.({
        assessment: { ...assessment, overallScore: 88 },
        audioUrl: "blob:recording-2",
        waveform: Array.from({ length: 20 }, () => 60),
      })
    })
    expect(screen.getByRole("region", { name: "录音对比" }).textContent).toContain("之前录音")
    expect(screen.getByText("+6")).toBeTruthy()

    expect(mocks.recordShadowingAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "shadowing-coffee-2",
        overallScore: 82,
        sentence: "Could I get a latte with oat milk, please?",
      }),
    )
  })

  it("creates a targeted exercise from the requested learning memory", () => {
    mocks.state = createDefaultLearningMemory(new Date("2026-08-29T08:00:00.000Z"))
    mocks.state.items = mocks.state.items.map((item) =>
      item.id === "polite-request" ? { ...item, answer: "Could I get...?" } : item,
    )
    render(<ShadowingWorkspace initialMemoryItemId="polite-request" />)

    expect(screen.getAllByText("Could I get something?").length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("tab", { name: "03去应用" }))
    expect(screen.getByRole("link", { name: "去餐厅用餐复用" }).getAttribute("href")).toBe(
      "/workspace/conversation?scene=restaurant&memory=polite-request",
    )

    const assessment = {
      overallScore: 82,
      clarityScore: 84,
      fluencyScore: 79,
      rhythmScore: 83,
      durationSeconds: 4.2,
      voicedRatio: 0.68,
    }
    mocks.onComplete?.({
      assessment,
      audioUrl: "blob:target-recording",
      waveform: Array.from({ length: 20 }, () => 50),
    })
    expect(mocks.recordShadowingAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "shadowing-memory-polite-request",
        sceneId: "restaurant",
        sentence: "Could I get something?",
      }),
    )
  })

  it("uses two voices for a multi-turn script and keeps translations off by default", async () => {
    render(<ShadowingWorkspace />)

    expect(screen.getByRole("list", { name: "咖啡店点单预设对话" }).children).toHaveLength(6)
    expect(screen.getByText("Could I get a latte with oat milk, please?")).toBeTruthy()
    expect(screen.queryByText("早上好！今天想先来点什么？")).toBeNull()

    fireEvent.click(screen.getByRole("switch", { name: "显示中文翻译" }))
    expect(screen.getByText("早上好！今天想先来点什么？")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "播放整段" }))
    await waitFor(() => expect(mocks.speakWithVoice).toHaveBeenCalledTimes(6))
    expect(mocks.speakWithVoice.mock.calls[0]?.[1]).toMatchObject({
      value: "kokoro:af_heart",
    })
    expect(mocks.speakWithVoice.mock.calls[1]?.[1]).toMatchObject({
      value: "kokoro:am_michael",
    })

    fireEvent.click(screen.getByRole("button", { name: "互换角色" }))

    expect(screen.getByRole("button", { name: "扮演：咖啡店店员" })).toBeTruthy()
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))
    expect(screen.getByText("现在扮演咖啡店店员。")).toBeTruthy()
    expect(
      screen.getAllByText("Good morning! What can I get started for you today?").length,
    ).toBeGreaterThan(0)
  })
})
