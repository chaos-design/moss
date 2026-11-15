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
  // 学习位置/等级筛选/随机模式是本地持久化状态；清空后每个用例都从默认状态开始。
  window.localStorage.clear()
  // jsdom 没有实现 scrollIntoView：侧栏定位（恢复后自动定位与计数器点击）会调用它。
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  // Match the real recorder: automatic turn advancement resets its current result.
  mocks.reset.mockImplementation(() => {
    mocks.recorder.result = null
  })
})

afterEach(() => {
  cleanup()
  mocks.onComplete = null
  mocks.recorder.result = null
  mocks.recorder.recording = false
  mocks.recordShadowingAttempt.mockReset()
  mocks.speakWithVoice.mockReset().mockResolvedValue(undefined)
  mocks.start.mockReset()
  mocks.stop.mockReset()
  mocks.reset.mockReset()
})

describe("ShadowingWorkspace", () => {
  it("records on Space keydown and stops on keyup in the shadowing stage", () => {
    render(<ShadowingWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))

    // Hold-to-record keeps begin and end on one key, so a take never needs a pointer round trip.
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          key: " ",
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(mocks.stop).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          code: "Space",
          key: " ",
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect(mocks.stop).toHaveBeenCalledOnce()
  })

  it("follows the active line inside the transcript without scrolling the whole page", () => {
    const view = render(<ShadowingWorkspace />)
    fireEvent.click(screen.getByRole("switch", { name: "录完后自动播放对方台词" }))
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))
    const container = view.container
      .querySelector<HTMLDivElement>('[data-shadowing-line="coffee-4"]')
      ?.closest<HTMLDivElement>(".overflow-y-auto")
    const line = container?.querySelector<HTMLElement>('[data-shadowing-line="coffee-4"]')
    expect(container).toBeTruthy()
    expect(line).toBeTruthy()
    if (!container || !line) {
      return
    }
    container.getBoundingClientRect = () => ({ top: 100, bottom: 300, height: 200 }) as DOMRect
    line.getBoundingClientRect = () => ({ top: 330, bottom: 370, height: 40 }) as DOMRect
    container.scrollTop = 0

    fireEvent.click(
      screen.getByRole("button", {
        name: "选择学习者台词：Iced, please, and could I have it to go?",
      }),
    )

    expect(container.scrollTop).toBe(86)
    expect(container.className).toContain("overflow-y-auto")
  })

  it("advertises the hold-Space shortcut next to the record button", () => {
    render(<ShadowingWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))

    // The button already said what it did; the key hint says how to do it without looking.
    expect(screen.getByTitle("按住空格开始录音，松开停止").textContent).toContain("空格")
  })

  it("ignores the shortcut outside the shadowing stage", () => {
    render(<ShadowingWorkspace />)

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          key: " ",
          bubbles: true,
          cancelable: true,
        }),
      )
    })

    expect(mocks.start).not.toHaveBeenCalled()
  })

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
    expect(mocks.recordShadowingAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "shadowing-coffee-2",
        overallScore: 82,
        sentence: "Could I get a latte with oat milk, please?",
      }),
    )

    // 自动接话把目标推进到本角色的下一句，并 reset 当前录音；右侧仍须显示刚录完
    // 的成绩和原台词，不能把它错标为下一句的评分。
    expect(screen.getByRole("region", { name: "跟读操作" }).textContent).toContain(
      "Iced, please, and could I have it to go?",
    )
    const feedback = screen.getByRole("region", { name: "跟读评分" })
    expect(feedback.textContent).toContain("82")
    expect(feedback.textContent).toContain("Could I get a latte with oat milk, please?")
    expect(feedback.textContent).toContain("（上一句）")
    expect(feedback.textContent).not.toContain("问句可辨识度")
    expect(feedback.textContent).toContain("表达连贯")
    fireEvent.click(
      screen.getByRole("button", {
        name: "选择学习者台词：Could I get a latte with oat milk, please?",
      }),
    )
    expect(screen.getByRole("region", { name: "录音对比" }).textContent).toContain("本次录音")
  })

  it("attributes feedback to the recorded role when swapping roles", () => {
    const assessment: ShadowingAssessment = {
      overallScore: 82,
      clarityScore: 84,
      fluencyScore: 79,
      rhythmScore: 83,
      durationSeconds: 4.2,
      voicedRatio: 0.68,
    }
    render(<ShadowingWorkspace />)
    fireEvent.click(screen.getByRole("switch", { name: "录完后自动播放对方台词" }))
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))
    act(() => {
      mocks.onComplete?.({ assessment, audioUrl: "blob:learner", waveform: [] })
    })
    expect(screen.getByRole("region", { name: "跟读评分" }).textContent).toContain("表达连贯")

    fireEvent.click(screen.getByRole("button", { name: "互换角色" }))
    expect(screen.getByRole("region", { name: "跟读评分" }).textContent).not.toContain("82")
    act(() => {
      mocks.onComplete?.({
        assessment: { ...assessment, overallScore: 65 },
        audioUrl: "blob:partner",
        waveform: [],
      })
    })
    const feedback = screen.getByRole("region", { name: "跟读评分" })
    expect(feedback.textContent).toContain("65")
    expect(feedback.textContent).toContain("角色发声")
    expect(feedback.textContent).not.toContain("表达连贯")
  })

  it("keeps takes of the same line comparable when auto partner turns are off", () => {
    const assessment: ShadowingAssessment = {
      overallScore: 82,
      clarityScore: 84,
      fluencyScore: 79,
      rhythmScore: 83,
      durationSeconds: 4.2,
      voicedRatio: 0.68,
    }
    const view = render(<ShadowingWorkspace />)
    fireEvent.click(screen.getByRole("switch", { name: "录完后自动播放对方台词" }))
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))
    mocks.recorder.result = {
      audioUrl: "blob:recording",
      assessment,
      waveform: Array.from({ length: 20 }, () => 50),
    }
    view.rerender(<ShadowingWorkspace />)
    mocks.speakWithVoice.mockClear()

    act(() => {
      mocks.onComplete?.({
        assessment,
        audioUrl: "blob:recording",
        waveform: Array.from({ length: 20 }, () => 50),
      })
    })

    // 关闭后不播放提示、不推进目标，同一句的历次录音仍可比较分数。
    expect(mocks.speakWithVoice).not.toHaveBeenCalled()
    expect(screen.getByRole("region", { name: "跟读操作" }).textContent).toContain(
      "Could I get a latte with oat milk, please?",
    )
    expect(screen.getByRole("region", { name: "录音对比" }).textContent).toContain("本次录音")

    fireEvent.click(screen.getByRole("button", { name: "重新录音" }))
    expect(mocks.start).toHaveBeenCalledOnce()
    act(() => {
      mocks.onComplete?.({
        assessment: { ...assessment, overallScore: 88 },
        audioUrl: "blob:recording-2",
        waveform: Array.from({ length: 20 }, () => 60),
      })
    })

    expect(screen.getByRole("region", { name: "录音对比" }).textContent).toContain("之前录音")
    expect(screen.getByText("+6")).toBeTruthy()
  })

  it("plays the partner cue, then each reply, across a full role run", async () => {
    render(<ShadowingWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))

    // 进入跟读阶段先听到对方的开场，学习者听到问题再开口。
    expect(mocks.speakWithVoice.mock.calls[0]?.[0]).toBe(
      "Good morning! What can I get started for you today?",
    )
    expect(screen.getByRole("region", { name: "跟读操作" }).textContent).toContain(
      "Could I get a latte with oat milk, please?",
    )

    const assessment: ShadowingAssessment = {
      overallScore: 82,
      clarityScore: 84,
      fluencyScore: 79,
      rhythmScore: 83,
      durationSeconds: 4.2,
      voicedRatio: 0.68,
    }
    for (const [index, expectedLine] of [
      "Iced, please, and could I have it to go?",
      "That's right. Thank you.",
      "It's Alex. Could I also get a cup of hot water on the side?",
      "Card, please. Oh — could you make the latte with less ice?",
      "Thanks a lot. I'll grab a seat by the window.",
    ].entries()) {
      await act(async () => {
        mocks.onComplete?.({
          assessment,
          audioUrl: `blob:recording-${index}`,
          waveform: Array.from({ length: 20 }, () => 50),
        })
      })
      expect(screen.getByRole("region", { name: "跟读操作" }).textContent).toContain(
        expectedLine,
      )
    }

    // 每轮只播一次接话，已播过的台词不作为下一轮的提示重复播放。
    expect(mocks.speakWithVoice.mock.calls.map((call) => call[0])).toEqual([
      "Good morning! What can I get started for you today?",
      "Of course. Would you like that hot or iced?",
      "Absolutely. A medium iced oat latte to go.",
      "Great choice. That will be four fifty, and what name for the order?",
      "Of course. Card or cash today?",
      "No problem, easy on the ice. We'll call your name in a few minutes.",
    ])
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "跟读操作" }).textContent).toContain(
        "这是你在这段对话里的最后一句",
      ),
    )

    // 最后一句之后不再接话，避免回绕到已练过的台词。
    await act(async () => {
      mocks.onComplete?.({
        assessment,
        audioUrl: "blob:recording-final",
        waveform: Array.from({ length: 20 }, () => 50),
      })
    })
    expect(mocks.speakWithVoice).toHaveBeenCalledTimes(6)
    expect(screen.getByRole("region", { name: "跟读操作" }).textContent).toContain(
      "Thanks a lot. I'll grab a seat by the window.",
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

    expect(screen.getByRole("list", { name: "咖啡店点单预设对话" }).children).toHaveLength(12)
    expect(screen.getByText("Could I get a latte with oat milk, please?")).toBeTruthy()
    expect(screen.queryByText("早上好！今天想先来点什么？")).toBeNull()

    fireEvent.click(screen.getByRole("switch", { name: "显示中文翻译" }))
    expect(screen.getByText("早上好！今天想先来点什么？")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "播放整段" }))
    await waitFor(() => expect(mocks.speakWithVoice).toHaveBeenCalledTimes(12))
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

  it("keeps the reference waveform shape while recording and highlights it with the brand color", () => {
    const view = render(<ShadowingWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))

    // 待机时是参考波形，第一根条来自 referenceWaveform，也没有 pulse 高亮。
    const waveform = screen.getByRole("img", { name: "音频波形" })
    expect(waveform.firstElementChild?.getAttribute("style")).toContain("height: 18%")
    expect(waveform.firstElementChild?.className).not.toContain("animate-pulse")

    mocks.recorder.recording = true
    view.rerender(<ShadowingWorkspace />)

    // 录音时不改变形状，只靠颜色 + pulse 让「正在录音」醒目。
    expect(waveform.firstElementChild?.getAttribute("style")).toContain("height: 18%")
    expect(waveform.firstElementChild?.className).toContain("animate-pulse")
    expect(waveform.firstElementChild?.className).toContain("bg-primary")
  })

  it("restores the last learning position and locates it in the sidebar", () => {
    window.localStorage.setItem(
      "moss:shadowing-position:v1",
      JSON.stringify({ dialogueId: "shopping", lineId: "shopping-2", role: "learner" }),
    )
    render(<ShadowingWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))

    // 恢复后选中场景与目标句都对上，侧栏自动定位到该场景。
    expect(screen.getByRole("button", { name: /商店购物/ }).getAttribute("aria-pressed")).toBe(
      "true",
    )
    expect(screen.getByRole("region", { name: "跟读操作" }).textContent).toContain(
      "I'm after a winter coat. Do you have this one in a medium?",
    )
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it("persists navigation and locates the selected scene from the counter", () => {
    render(<ShadowingWorkspace />)

    fireEvent.click(screen.getByRole("button", { name: /商店购物/ }))
    const position = JSON.parse(
      window.localStorage.getItem("moss:shadowing-position:v1") ?? "{}",
    ) as { dialogueId?: string; role?: string }
    expect(position).toMatchObject({ dialogueId: "shopping", role: "learner" })

    // 「N/M」计数器是定位入口：点击把选中条目平滑滚回可视区。
    const locateStub = vi.mocked(HTMLElement.prototype.scrollIntoView)
    const before = locateStub.mock.calls.length
    fireEvent.click(screen.getByRole("button", { name: "定位当前学习的场景" }))
    expect(locateStub.mock.calls.length).toBeGreaterThan(before)
    expect(locateStub.mock.calls.at(-1)?.[0]).toMatchObject({ behavior: "smooth" })
  })

  it("plays the focus word without entering the partner-turn flow", async () => {
    render(<ShadowingWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))

    // 进入跟读阶段会先播对方的提示句；等提示播完再试听发音，避免串台。
    await waitFor(() => expect(mocks.speakWithVoice).toHaveBeenCalled())
    await act(async () => {})
    mocks.speakWithVoice.mockClear()

    fireEvent.click(screen.getByRole("button", { name: "播放 oat 发音" }))

    expect(mocks.speakWithVoice).toHaveBeenCalledWith(
      "oat",
      expect.anything(),
      expect.anything(),
    )
    // 面板不会把「听发音」误显示成对方接话的回合：两个功能互不牵连。
    expect(screen.getByRole("region", { name: "跟读操作" }).textContent).not.toContain(
      "正在接话",
    )
  })

  it("blurs media buttons after click so Space returns to the push-to-talk shortcut", () => {
    render(<ShadowingWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))

    const sampleButton = screen.getByRole("button", { name: /听示范/ })
    const sampleBlurSpy = vi.spyOn(sampleButton, "blur")
    fireEvent.click(sampleButton)
    expect(sampleBlurSpy).toHaveBeenCalled()

    const recordButton = screen.getByRole("button", { name: "开始录音" })
    const recordBlurSpy = vi.spyOn(recordButton, "blur")
    fireEvent.click(recordButton)
    expect(recordBlurSpy).toHaveBeenCalled()
    expect(mocks.start).toHaveBeenCalledOnce()
  })

  it("filters the working set by level for the sidebar, counter, and persistence", () => {
    render(<ShadowingWorkspace />)

    fireEvent.click(screen.getByRole("button", { name: "C1" }))

    expect(screen.queryByRole("button", { name: /商店购物/ })).toBeNull()
    expect(screen.getByRole("button", { name: /商务谈判/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: "定位当前学习的场景" }).textContent).toMatch(
      /^1\/\d+$/,
    )
    expect(window.localStorage.getItem("moss:shadowing-filter:v1")).toBe(JSON.stringify("C1"))

    fireEvent.click(screen.getByRole("button", { name: "全部" }))
    expect(screen.getByRole("button", { name: /商店购物/ })).toBeTruthy()
  })

  it("jumps to a random other scene from the dice and toggles continuous random mode", () => {
    render(<ShadowingWorkspace />)

    // 头部只有一个随机入口（跳换按钮）；连续模式是中栏工具栏的开关，不再是第二个头部按钮。
    expect(screen.queryByRole("button", { name: "开启随机连续学习" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "随机选择一个场景" }))
    const position = JSON.parse(
      window.localStorage.getItem("moss:shadowing-position:v1") ?? "{}",
    ) as { dialogueId?: string }
    expect(position.dialogueId).not.toBe("coffee")
    // 随机跳换后侧栏平滑滚动到新场景。
    expect(
      vi.mocked(HTMLElement.prototype.scrollIntoView).mock.calls.at(-1)?.[0],
    ).toMatchObject({
      behavior: "smooth",
    })

    fireEvent.click(screen.getByRole("switch", { name: "随机连续学习" }))
    expect(
      screen.getByRole("switch", { name: "随机连续学习" }).getAttribute("aria-checked"),
    ).toBe("true")
    expect(window.localStorage.getItem("moss:shadowing-random:v1")).toBe("true")
  })

  it("auto-advances to a random scene after the last line when random mode is on", () => {
    render(<ShadowingWorkspace />)
    fireEvent.click(screen.getByRole("switch", { name: "随机连续学习" }))
    fireEvent.click(screen.getByRole("tab", { name: "02跟角色" }))

    // 咖啡场景的最后一句学习者台词（coffee-6），录完没有下一句。
    fireEvent.click(
      screen.getByRole("button", {
        name: "选择学习者台词：Thanks a lot. I'll grab a seat by the window.",
      }),
    )
    act(() => {
      mocks.onComplete?.({
        assessment: {
          overallScore: 82,
          clarityScore: 84,
          fluencyScore: 79,
          rhythmScore: 83,
          durationSeconds: 4.2,
          voicedRatio: 0.68,
        },
        audioUrl: "blob:final",
        waveform: [],
      })
    })

    // 随机连续模式：没有下一句时自动进入另一个随机场景，提示台词开始播放。
    const position = JSON.parse(
      window.localStorage.getItem("moss:shadowing-position:v1") ?? "{}",
    ) as { dialogueId?: string }
    expect(position.dialogueId).not.toBe("coffee")
    expect(mocks.speakWithVoice).toHaveBeenCalled()
  })
})
