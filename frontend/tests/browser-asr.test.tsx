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
  if (part instanceof ArrayBuffer) {
    return part.byteLength
  }
  if (ArrayBuffer.isView(part)) {
    return part.byteLength
  }
  if (part && typeof (part as { arrayBuffer?: unknown }).arrayBuffer === "function") {
    return (part as { size?: number }).size ?? 0
  }
  return new TextEncoder().encode(String(part)).byteLength
}

async function arrayBufferOf(part: unknown): Promise<ArrayBuffer> {
  if (part instanceof ArrayBuffer) {
    return part
  }
  if (ArrayBuffer.isView(part)) {
    const copy = new ArrayBuffer(part.byteLength)
    new Uint8Array(copy).set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength))
    return copy
  }
  if (
    part &&
    typeof (part as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer === "function"
  ) {
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

type AudioProcessingEventLike = {
  inputBuffer: { getChannelData: (channel: number) => Float32Array }
}

// api 接入的 Web Audio 采集桩：分析器能量由 meterValue 控制（128 = 静音），
// onaudioprocess 由测试显式触发以累积 PCM 帧，其余节点只需满足连线契约。
class ApiAudioGraphStub {
  static latest: ApiAudioGraphStub | null = null
  sampleRate = 48_000
  destination = {}
  meterValue = 128
  private processor: {
    onaudioprocess: ((event: AudioProcessingEventLike) => void) | null
    connect: () => void
    disconnect: () => void
  } | null = null

  constructor() {
    ApiAudioGraphStub.latest = this
  }

  resume() {
    return Promise.resolve()
  }

  createMediaStreamSource() {
    return { connect: vi.fn(), disconnect: vi.fn() }
  }

  createAnalyser() {
    const graph = this
    return {
      fftSize: 0,
      connect: vi.fn(),
      getByteTimeDomainData(buffer: Uint8Array) {
        buffer.fill(graph.meterValue)
      },
    }
  }

  createScriptProcessor() {
    const processor = {
      onaudioprocess: null as ((event: AudioProcessingEventLike) => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    this.processor = processor
    return processor
  }

  createGain() {
    return { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }
  }

  close() {
    return Promise.resolve()
  }

  pushFrame(level: number) {
    this.processor?.onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array(4096).fill(level) },
    })
  }
}

function stubApiAudioGraph() {
  vi.stubGlobal("AudioContext", ApiAudioGraphStub)
}

// 运行时在 start() 里自行 new AudioContext()：实例要在启动后再从 latest 取。
function startedGraph() {
  return ApiAudioGraphStub.latest as ApiAudioGraphStub
}

// 驱动 100ms 一次的能量计测循环；每个 tick 都对齐 armFeedLoop 的 apiMeterIntervalMs。
async function advanceMeterTicks(ticks: number) {
  for (let index = 0; index < ticks; index += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
  }
}

// 说话阶段：每个 tick 推一帧 PCM 并让分析器保持有声能量。
async function speakForTicks(graph: ApiAudioGraphStub, ticks: number) {
  for (let index = 0; index < ticks; index += 1) {
    await act(async () => {
      graph.pushFrame(0.2)
      await vi.advanceTimersByTimeAsync(100)
    })
  }
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

  it("strips bracketed ASR annotations from recognized speech", async () => {
    const onPartial = vi.fn()
    const onTranscript = vi.fn()
    render(
      <BrowserAsrProbe
        endpoint={browserEndpoint}
        onError={vi.fn()}
        onPartial={onPartial}
        onProcessingChange={vi.fn()}
        onSpeechStart={vi.fn()}
        onTranscript={onTranscript}
      />,
    )
    await act(async () => {
      screen.getByRole("button", { name: "start" }).click()
    })

    const recognition = FakeRecognition.instances[0]
    act(() => {
      recognition?.emit("[background noise] could I", false)
    })
    // 实时识别条也不出现识别标注。
    expect(onPartial).toHaveBeenLastCalledWith("could I")

    act(() => {
      recognition?.emit("[background noise] could I get a latte [pause]", true, 1)
    })
    expect(onTranscript).toHaveBeenCalledWith("could I get a latte", recognition?.lang)
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

  it("uploads a completed speech turn as WAV for the API transport", async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { text: "hello there" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)
      // jsdom 的 Blob 丢弃载荷且没有 arrayBuffer()，用可拼接字节的替身维持上传契约。
      vi.stubGlobal("Blob", FakeBlob)
      stubApiAudioGraph()
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

      // 500ms 噪声校准（安静环境），之后保持安静一帧再开始说话。
      await advanceMeterTicks(6)
      const graph = startedGraph()

      // 模拟说话：分析器能量抬高 + PCM 帧进入采集，700ms 足以确认并越过最小发声时长。
      graph.meterValue = 178
      await speakForTicks(graph, 7)

      // 静音超过 apiTurnEndSilenceMs（1.2s）→ 断句上传。
      graph.meterValue = 128
      await advanceMeterTicks(13)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(path).toBe("/api/speech/asr")
      const payload = JSON.parse(String(init.body))
      expect(payload.endpoint).toEqual({
        apiKey: "sk-test",
        endpoint: "https://speech.example.com/v1",
        model: "whisper-1",
      })
      expect(payload.mimeType).toBe("audio/wav")
      // WAV 以 RIFF 头开始（base64 编码后即 UklGR）。
      expect(String(payload.audioBase64).startsWith("UklGR")).toBe(true)
      expect(onTranscript).toHaveBeenCalledWith("hello there")
    } finally {
      vi.useRealTimers()
    }
  })

  it("discards a sub-minimum utterance as noise and keeps the next turn intact", async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { text: "hello there" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)
      vi.stubGlobal("Blob", FakeBlob)
      stubApiAudioGraph()
      Object.assign(navigator, {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
        },
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

      await act(async () => {
        screen.getByRole("button", { name: "start" }).click()
      })
      await advanceMeterTicks(6)
      const graph = startedGraph()

      // 400ms 的能量脉冲：足以确认 speech-start，但低于 apiMinUtteranceMs → 按噪声丢弃。
      graph.meterValue = 178
      await speakForTicks(graph, 4)
      graph.meterValue = 128
      await advanceMeterTicks(13)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(onTranscript).not.toHaveBeenCalled()

      // 丢弃只清空缓冲：后续真实发言仍正常上传。
      graph.meterValue = 178
      await speakForTicks(graph, 7)
      graph.meterValue = 128
      await advanceMeterTicks(13)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(onTranscript).toHaveBeenCalledWith("hello there")
    } finally {
      vi.useRealTimers()
    }
  })

  it("commits consecutive turns in order even when the later turn's upload resolves first", async () => {
    vi.useFakeTimers()
    try {
      // 第一句上传挂起（受控延迟），第二句立即返回：没有串行队列时第二句会反超第一句。
      let resolveFirst: ((response: Response) => void) | null = null
      const firstPending = new Promise<Response>((resolve) => {
        resolveFirst = resolve
      })
      const jsonResponse = (text: string) =>
        new Response(JSON.stringify({ data: { text } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      const fetchMock = vi.fn((...args: unknown[]) => {
        void args
        const callNumber = fetchMock.mock.calls.length // 1-based
        if (callNumber === 1) {
          return firstPending
        }
        return Promise.resolve(jsonResponse("second line"))
      })
      vi.stubGlobal("fetch", fetchMock)
      vi.stubGlobal("Blob", FakeBlob)
      stubApiAudioGraph()
      Object.assign(navigator, {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
        },
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

      await act(async () => {
        screen.getByRole("button", { name: "start" }).click()
      })
      await advanceMeterTicks(6)
      const graph = startedGraph()

      // 第一句：说话 + 静音断句 → 上传排队（挂起中）。
      graph.meterValue = 178
      await speakForTicks(graph, 7)
      graph.meterValue = 128
      await advanceMeterTicks(13)

      // 第二句：说话 + 静音断句 → 上传排在第一句之后。
      graph.meterValue = 178
      await speakForTicks(graph, 7)
      graph.meterValue = 128
      await advanceMeterTicks(13)

      // 两句都已排队，但第一句还没结算：此刻不应有任何提交。
      expect(onTranscript).not.toHaveBeenCalled()

      // 放行第一句上传：串行队列先提交第一句，再启动第二句上传并提交。
      act(() => {
        resolveFirst?.(jsonResponse("first line"))
      })
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(onTranscript.mock.calls.map((call) => call[0])).toEqual([
        "first line",
        "second line",
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it("pauses capture when retries are exhausted so new speech is not uploaded out of order", async () => {
    vi.useFakeTimers()
    try {
      // 上游持续 502：三连同次全部耗尽后应暂停采集，新的断句不再发起上传。
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "speech_unavailable" } }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)
      vi.stubGlobal("Blob", FakeBlob)
      stubApiAudioGraph()
      Object.assign(navigator, {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
        },
      })

      const onError = vi.fn()
      const onTranscript = vi.fn()
      render(
        <BrowserAsrProbe
          endpoint={apiEndpoint}
          onError={onError}
          onPartial={vi.fn()}
          onProcessingChange={vi.fn()}
          onSpeechStart={vi.fn()}
          onTranscript={onTranscript}
        />,
      )

      await act(async () => {
        screen.getByRole("button", { name: "start" }).click()
      })
      await advanceMeterTicks(6)
      const graph = startedGraph()

      // 第一句：说话 + 静音断句 → 触发上传，三次重试全部 502。
      graph.meterValue = 178
      await speakForTicks(graph, 7)
      graph.meterValue = 128
      await advanceMeterTicks(13)

      // 退避 700ms / 1400ms 走完后三次尝试耗尽，进入暂停采集。
      await vi.advanceTimersByTimeAsync(700)
      await vi.advanceTimersByTimeAsync(1400)
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(onError).toHaveBeenCalledTimes(1)

      // 继续说话：采集已暂停，新句子的断句不再产生上传。
      graph.meterValue = 178
      await speakForTicks(graph, 7)
      graph.meterValue = 128
      await advanceMeterTicks(13)
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(onTranscript).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
