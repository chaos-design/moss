// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useShadowingRecorder } from "@/features/shadowing/use-shadowing-recorder"

const createObjectUrl = vi.fn()
const revokeObjectUrl = vi.fn()
const stopTrack = vi.fn()

class MockMediaRecorder {
  static isTypeSupported() {
    return true
  }

  mimeType = "audio/webm"
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  state = "inactive"

  start() {
    this.state = "recording"
  }

  stop() {
    this.state = "inactive"
    this.ondataavailable?.({ data: new Blob(["recording"]) })
    this.onstop?.()
  }
}

class MockAudioContext {
  createMediaStreamSource() {
    return { connect: vi.fn() }
  }

  createAnalyser() {
    return {
      fftSize: 0,
      getFloatTimeDomainData: (samples: Float32Array) => {
        samples.fill(0.08)
      },
    }
  }

  close() {
    return Promise.resolve()
  }
}

beforeEach(() => {
  createObjectUrl.mockReset()
  createObjectUrl
    .mockReturnValueOnce("blob:first-recording")
    .mockReturnValueOnce("blob:second-recording")
  revokeObjectUrl.mockReset()
  stopTrack.mockReset()
  vi.stubGlobal("MediaRecorder", MockMediaRecorder)
  vi.stubGlobal("AudioContext", MockAudioContext)
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  )
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: stopTrack }],
      }),
    },
  })
  URL.createObjectURL = createObjectUrl
  URL.revokeObjectURL = revokeObjectUrl
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("useShadowingRecorder", () => {
  it("keeps earlier audio available across immediate re-recording and releases it on unmount", async () => {
    const completed = vi.fn()
    const view = renderHook(() =>
      useShadowingRecorder({
        expectedDurationSeconds: 2,
        onComplete: completed,
      }),
    )

    await act(async () => {
      await view.result.current.start()
    })
    act(() => view.result.current.stop())
    expect(completed).toHaveBeenCalledTimes(1)

    await act(async () => {
      await view.result.current.start()
    })
    expect(revokeObjectUrl).not.toHaveBeenCalled()
    act(() => view.result.current.stop())
    expect(completed).toHaveBeenCalledTimes(2)

    view.unmount()
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:first-recording")
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:second-recording")
  })
})
