// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  browserPrepare: vi.fn<(stream?: MediaStream) => Promise<void>>(),
  browserStart: vi.fn<(stream?: MediaStream) => Promise<void>>(),
  browserStop: vi.fn(),
  streamingPrepare: vi.fn<() => Promise<void>>(),
  streamingStart: vi.fn<(stream: MediaStream) => Promise<void>>(),
  streamingStop: vi.fn(),
}))

vi.mock("@/features/speech/use-streaming-asr", () => ({
  useStreamingAsr: () => ({
    available: true,
    loadingProgress: 42,
    pause: vi.fn(),
    prepare: mocks.streamingPrepare,
    start: mocks.streamingStart,
    stop: mocks.streamingStop,
  }),
}))

vi.mock("@/features/speech/use-browser-asr", () => ({
  useBrowserAsr: () => ({
    available: true,
    pause: vi.fn(),
    prepare: mocks.browserPrepare,
    start: mocks.browserStart,
    stop: mocks.browserStop,
  }),
}))

import { useAsrSession } from "@/features/speech/use-asr-session"
import { setSpeechConfig } from "@/features/speech/use-speech-config"
import { defaultSpeechConfig } from "@/lib/speech-config"

function AsrSessionProbe({
  onTransportFallback,
}: {
  onTransportFallback: (error: Error) => void
}) {
  const session = useAsrSession({
    context: "Scenario: coffee",
    onError: vi.fn(),
    onPartial: vi.fn(),
    onProcessingChange: vi.fn(),
    onTranscript: vi.fn(),
    onTransportFallback,
  })

  return (
    <div>
      <span data-testid="transport">{session.transport}</span>
      <span data-testid="available">{String(session.available)}</span>
      <span data-testid="progress">{String(session.loadingProgress)}</span>
      <button type="button" onClick={() => void session.prepare()}>
        prepare
      </button>
      <button
        type="button"
        onClick={() => {
          void session.start({} as MediaStream)
        }}
      >
        start
      </button>
      <button type="button" onClick={session.stop}>
        stop
      </button>
    </div>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  setSpeechConfig(() => defaultSpeechConfig)
  class FakeSpeechRecognition {}
  Object.assign(window, { SpeechRecognition: FakeSpeechRecognition })
  mocks.streamingPrepare.mockReset().mockResolvedValue(undefined)
  mocks.streamingStart.mockReset().mockResolvedValue(undefined)
  mocks.browserPrepare.mockReset().mockResolvedValue(undefined)
  mocks.browserStart.mockReset().mockResolvedValue(undefined)
  mocks.streamingStop.mockReset()
  mocks.browserStop.mockReset()
})

afterEach(() => {
  cleanup()
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition
})

describe("useAsrSession", () => {
  it("uses the local streaming service by default", async () => {
    const onTransportFallback = vi.fn()
    render(<AsrSessionProbe onTransportFallback={onTransportFallback} />)

    expect(screen.getByTestId("transport").textContent).toBe("local")
    expect(screen.getByTestId("available").textContent).toBe("true")
    expect(screen.getByTestId("progress").textContent).toBe("42")

    await act(async () => {
      screen.getByRole("button", { name: "prepare" }).click()
    })

    expect(mocks.streamingPrepare).toHaveBeenCalledTimes(1)
    expect(mocks.browserPrepare).not.toHaveBeenCalled()
    expect(onTransportFallback).not.toHaveBeenCalled()
  })

  it("falls back to the browser engine when the local service is not running", async () => {
    const onTransportFallback = vi.fn()
    mocks.streamingPrepare.mockRejectedValue(
      new Error("无法连接 ASR 服务，请运行 pnpm asr:start"),
    )
    render(<AsrSessionProbe onTransportFallback={onTransportFallback} />)

    await act(async () => {
      screen.getByRole("button", { name: "prepare" }).click()
    })

    expect(mocks.browserPrepare).toHaveBeenCalledTimes(1)
    expect(onTransportFallback).toHaveBeenCalledTimes(1)
    expect(onTransportFallback.mock.calls[0]?.[0]).toBeInstanceOf(Error)
    expect(screen.getByTestId("transport").textContent).toBe("browser")
    expect(screen.getByTestId("progress").textContent).toBe("null")
    // The fallback stays in effect for the rest of the session instead of retrying every turn.
    await act(async () => {
      screen.getByRole("button", { name: "prepare" }).click()
    })
    expect(mocks.streamingPrepare).toHaveBeenCalledTimes(1)
    expect(mocks.browserPrepare).toHaveBeenCalledTimes(2)
  })

  it("recovers when the connection fails after preparation", async () => {
    const onTransportFallback = vi.fn()
    mocks.streamingStart.mockRejectedValue(new Error("ASR 服务连接已关闭"))
    render(<AsrSessionProbe onTransportFallback={onTransportFallback} />)

    await act(async () => {
      screen.getByRole("button", { name: "start" }).click()
    })

    expect(mocks.browserStart).toHaveBeenCalledTimes(1)
    expect(onTransportFallback).toHaveBeenCalledTimes(1)
  })

  it("skips the browser backend entirely when the browser transport is configured", async () => {
    setSpeechConfig((current) => ({
      ...current,
      asr: { ...current.asr, transport: "browser" },
      tts: { ...current.tts, transport: "browser" },
    }))
    mocks.streamingPrepare.mockRejectedValue(new Error("unreachable"))
    const onTransportFallback = vi.fn()
    render(<AsrSessionProbe onTransportFallback={onTransportFallback} />)

    await act(async () => {
      screen.getByRole("button", { name: "prepare" }).click()
    })

    expect(mocks.browserPrepare).toHaveBeenCalledTimes(1)
    expect(mocks.streamingPrepare).not.toHaveBeenCalled()
    expect(onTransportFallback).not.toHaveBeenCalled()
    expect(screen.getByTestId("transport").textContent).toBe("browser")
  })
})
