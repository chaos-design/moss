// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useBrowserAsr } from "@/features/speech/use-browser-asr"
import type { SpeechEndpoint } from "@/lib/speech-config"

class FakeRecognition {
  static instances: FakeRecognition[] = []
  lang = ""
  continuous = false
  interimResults = false
  maxAlternatives = 0
  started = false
  stopped = false
  aborted = false
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  onspeechstart: (() => void) | null = null
  onspeechend: (() => void) | null = null

  constructor() {
    FakeRecognition.instances.push(this)
  }

  start() {
    this.started = true
  }

  stop() {
    this.stopped = true
  }

  abort() {
    this.aborted = true
  }

  emit(transcript: string, isFinal: boolean, index = 0) {
    this.onresult?.({
      resultIndex: index,
      results: { length: index + 1, [index]: { isFinal, 0: { transcript } } },
    })
  }
}

// jsdom's Blob drops the payload and has no arrayBuffer(); this keeps the browser contract
// (parts concatenate into bytes) so the API transport can be exercised end to end.
class FakeBlob {
  private readonly parts: unknown[]
  readonly type: string

  constructor(parts: unknown[] = [], options?: { type?: string }) {
    this.parts = parts
    this.type = options?.type ?? ""
  }

  get size() {
    return this.parts.reduce<number>((total, part) => total + byteLengthOf(part), 0)
  }

  async arrayBuffer() {
    const parts = this.parts
    const merged = new Uint8Array(this.size)
    let offset = 0
    for (const part of parts) {
      const bytes = new Uint8Array(await arrayBufferOf(part))
      merged.set(bytes, offset)
      offset += bytes.byteLength
    }
    return merged.buffer
  }
}

function byteLengthOf(part: unknown) {
  if (part && typeof (part as { arrayBuffer?: unknown }).arrayBuffer === "function") {
    return (part as { size?: number }).size ?? 0
  }
  return new TextEncoder().encode(String(part)).byteLength
}

async function arrayBufferOf(part: unknown): Promise<ArrayBuffer> {
  if (part && typeof (part as { arrayBuffer?: unknown }).arrayBuffer === "function") {
    return (part as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer()
  }
  return new TextEncoder().encode(String(part)).buffer
}

const browserEndpoint: SpeechEndpoint = {
  transport: "browser",
  endpoint: "",
  apiKey: "",
  model: "",
}

const apiEndpoint: SpeechEndpoint = {
  transport: "api",
  endpoint: "https://speech.example.com/v1",
  apiKey: "sk-test",
  model: "whisper-1",
}

function BrowserAsrProbe({
  endpoint,
  onError,
  onPartial,
  onProcessingChange,
  onSpeechStart,
  onTranscript,
}: {
  endpoint: SpeechEndpoint
  onError: (error: Error) => void
  onPartial: (text: string) => void
  onProcessingChange: (processing: boolean) => void
  onSpeechStart: () => void
  onTranscript: (text: string, language?: string) => void
}) {
  const session = useBrowserAsr({
    endpoint,
    onError,
    onPartial,
    onProcessingChange,
    onSpeechStart,
    onTranscript,
  })

  return (
    <div>
      <span data-testid="available">{String(session.available)}</span>
      <button
        type="button"
        onClick={() => {
          void session.start()
        }}
      >
        start
      </button>
      <button type="button" onClick={session.pause}>
        pause
      </button>
      <button type="button" onClick={session.stop}>
        stop
      </button>
    </div>
  )
}

beforeEach(() => {
  FakeRecognition.instances = []
  Object.assign(window, { SpeechRecognition: FakeRecognition })
})

afterEach(() => {
  cleanup()
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition
  vi.unstubAllGlobals()
})

describe("useBrowserAsr", () => {
  it("reports availability and forwards interim and final speech results", async () => {
    const onPartial = vi.fn()
    const onTranscript = vi.fn()
    const onSpeechStart = vi.fn()
    const onProcessingChange = vi.fn()
    render(
      <BrowserAsrProbe
        endpoint={browserEndpoint}
        onError={vi.fn()}
        onPartial={onPartial}
        onProcessingChange={onProcessingChange}
        onSpeechStart={onSpeechStart}
        onTranscript={onTranscript}
      />,
    )

    expect(screen.getByTestId("available").textContent).toBe("true")
    await act(async () => {
      screen.getByRole("button", { name: "start" }).click()
    })

    const recognition = FakeRecognition.instances[0]
    expect(recognition?.continuous).toBe(true)
    expect(recognition?.interimResults).toBe(true)

    act(() => {
      recognition?.onspeechstart?.()
      recognition?.emit("could I", false)
    })
    expect(onSpeechStart).toHaveBeenCalledTimes(1)
    expect(onPartial).toHaveBeenCalledWith("could I")

    act(() => {
      recognition?.emit("could I get a latte", true, 1)
    })
    expect(onPartial).toHaveBeenLastCalledWith("")
    expect(onTranscript).toHaveBeenCalledWith("could I get a latte", recognition?.lang)
    expect(onProcessingChange).toHaveBeenLastCalledWith(false)
  })

  it("restarts after a silent end while the turn is still open", async () => {
    render(
      <BrowserAsrProbe
        endpoint={browserEndpoint}
        onError={vi.fn()}
        onPartial={vi.fn()}
        onProcessingChange={vi.fn()}
        onSpeechStart={vi.fn()}
        onTranscript={vi.fn()}
      />,
    )
    await act(async () => {
      screen.getByRole("button", { name: "start" }).click()
    })
    const recognition = FakeRecognition.instances[0]

    act(() => {
      if (recognition) {
        recognition.started = false
        recognition.onend?.()
      }
    })
    expect(recognition?.started).toBe(true)

    act(() => {
      screen.getByRole("button", { name: "stop" }).click()
    })
    expect(recognition?.aborted).toBe(true)

    act(() => {
      if (recognition) {
        recognition.started = false
        recognition.onend?.()
      }
    })
    expect(recognition?.started).toBe(false)
  })

  it("surfaces permission failures as user-facing errors", async () => {
    const onError = vi.fn()
    render(
      <BrowserAsrProbe
        endpoint={browserEndpoint}
        onError={onError}
        onPartial={vi.fn()}
        onProcessingChange={vi.fn()}
        onSpeechStart={vi.fn()}
        onTranscript={vi.fn()}
      />,
    )
    await act(async () => {
      screen.getByRole("button", { name: "start" }).click()
    })

    act(() => {
      FakeRecognition.instances[0]?.onerror?.({ error: "not-allowed" })
    })
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
    expect(onError.mock.calls[0]?.[0].message).toContain("麦克风授权")

    act(() => {
      FakeRecognition.instances[0]?.onerror?.({ error: "no-speech" })
    })
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it("uploads recorded audio to the app endpoint for the API transport", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { text: "hello there" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const stopRecorder = vi.fn()
    // jsdom's Blob drops its payload and has no arrayBuffer(), so both the recorder chunk and the
    // assembled request blob are minimal stand-ins for what a browser produces.
    const audioChunk = {
      arrayBuffer: async () => new TextEncoder().encode("audio-bytes").buffer,
      size: 11,
      type: "audio/webm",
    } as unknown as Blob
    vi.stubGlobal("Blob", FakeBlob)
    class FakeMediaRecorder {
      static isTypeSupported = vi.fn().mockReturnValue(true)
      state = "recording"
      mimeType = "audio/webm"
      ondataavailable: ((event: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      start = vi.fn(() => {
        this.ondataavailable?.({ data: audioChunk })
      })
      stop = stopRecorder
    }
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder)
    const tracks = [{ stop: vi.fn() }]
    Object.assign(navigator, {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => tracks }) },
    })

    const onTranscript = vi.fn()
    render(
      <BrowserAsrProbe
        endpoint={apiEndpoint}
        onError={vi.fn()}
        onPartial={vi.fn()}
        onProcessingChange={vi.fn()}
        onSpeechStart={vi.fn()}
        onTranscript={onTranscript}
      />,
    )
    expect(screen.getByTestId("available").textContent).toBe("true")

    await act(async () => {
      screen.getByRole("button", { name: "start" }).click()
    })

    await act(async () => {
      screen.getByRole("button", { name: "pause" }).click()
    })

    expect(stopRecorder).toHaveBeenCalled()
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe("/api/speech/asr")
    const payload = JSON.parse(String(init.body))
    expect(payload.endpoint).toEqual({
      apiKey: "sk-test",
      endpoint: "https://speech.example.com/v1",
      model: "whisper-1",
    })
    expect(payload.audioBase64).toBe(btoa("audio-bytes"))
    expect(onTranscript).toHaveBeenCalledWith("hello there")
    expect(tracks[0]?.stop).not.toHaveBeenCalled()
  })
})
