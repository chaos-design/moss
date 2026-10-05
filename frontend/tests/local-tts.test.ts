// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getTtsServiceUrl, TtsClientError, TtsClientPlayer } from "@/lib/tts-client"

class MockAudio {
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  onplay: (() => void) | null = null

  constructor(readonly src: string) {}

  load() {}

  pause() {}

  async play() {
    this.onplay?.()
    this.onended?.()
  }

  removeAttribute() {}
}

class MockSpeechSynthesisUtterance {
  lang = ""
  rate = 1
  voice: SpeechSynthesisVoice | null = null
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null

  constructor(readonly text: string) {}
}

const fetchMock = vi.fn()
const createObjectUrl = vi.fn(() => "blob:audio8")
const revokeObjectUrl = vi.fn()
const browserSpeak = vi.fn((utterance: MockSpeechSynthesisUtterance) => {
  utterance.onstart?.()
  utterance.onend?.()
})
const browserCancel = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  createObjectUrl.mockClear()
  revokeObjectUrl.mockClear()
  browserSpeak.mockClear()
  browserCancel.mockClear()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("Audio", MockAudio)
  vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance)
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      cancel: browserCancel,
      getVoices: () => [
        { lang: "en-US", name: "System English" },
        { lang: "zh-CN", name: "System Chinese" },
      ],
      speak: browserSpeak,
    },
  })
  URL.createObjectURL = createObjectUrl
  URL.revokeObjectURL = revokeObjectUrl
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("TTS service client", () => {
  it("only permits a loopback TTS endpoint", () => {
    expect(getTtsServiceUrl()).toBe("http://127.0.0.1:5578")
    expect(getTtsServiceUrl("http://localhost:6600/")).toBe("http://localhost:6600")
    expect(() => getTtsServiceUrl("https://tts.example.com")).toThrow(TtsClientError)
  })

  it("requests a local WAV and plays it in the browser", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([82, 73, 70, 70]), {
        status: 200,
        headers: { "Content-Type": "audio/wav" },
      }),
    )
    const onStart = vi.fn()
    const player = new TtsClientPlayer("audio8", "multilingual")

    await player.speak("  Hello locally.  ", { speed: 0.75, seed: 7, onStart })

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:5578/v1/tts/synthesize",
      expect.objectContaining({
        body: JSON.stringify({
          engine: "audio8",
          text: "Hello locally.",
          speed: 0.75,
          seed: 7,
          voice: "multilingual",
        }),
      }),
    )
    expect(onStart).toHaveBeenCalledOnce()
    expect(createObjectUrl).toHaveBeenCalledOnce()
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:audio8")
  })

  it("reuses synthesized audio for repeated playback", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([82, 73, 70, 70]), {
        status: 200,
        headers: { "Content-Type": "audio/wav" },
      }),
    )
    const player = new TtsClientPlayer("audio8", "multilingual")

    await player.speak("Play this again.")
    await player.speak("Play this again.")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(createObjectUrl).toHaveBeenCalledTimes(2)
  })

  it("preloads audio without playing and reuses it on speak", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([82, 73, 70, 70]), {
        status: 200,
        headers: { "Content-Type": "audio/wav" },
      }),
    )
    const player = new TtsClientPlayer("audio8", "multilingual")

    await player.preload("Prepare this sentence.")
    expect(createObjectUrl).not.toHaveBeenCalled()

    await player.speak("Prepare this sentence.")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(createObjectUrl).toHaveBeenCalledOnce()
  })

  it("shares an in-flight synthesis request for the same audio", async () => {
    let resolveFetch: ((response: Response) => void) | undefined
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
    )
    const firstPlayer = new TtsClientPlayer("audio8", "multilingual")
    const secondPlayer = new TtsClientPlayer("audio8", "multilingual")

    const firstPlayback = firstPlayer.speak("Play this together.")
    const secondPlayback = secondPlayer.speak("Play this together.")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveFetch?.(
      new Response(new Uint8Array([82, 73, 70, 70]), {
        status: 200,
        headers: { "Content-Type": "audio/wav" },
      }),
    )
    await Promise.all([firstPlayback, secondPlayback])

    expect(createObjectUrl).toHaveBeenCalledTimes(2)
  })

  it("checks local readiness once during preparation", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
    const player = new TtsClientPlayer("kokoro", "af_bella")

    await player.prepare()
    await player.prepare()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:5578/v1/tts/prepare",
      expect.objectContaining({
        body: JSON.stringify({ engine: "kokoro" }),
        cache: "no-store",
      }),
    )
  })

  it("routes CosyVoice through the same audio service contract", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([82, 73, 70, 70]), {
        status: 200,
        headers: { "Content-Type": "audio/wav" },
      }),
    )
    const player = new TtsClientPlayer("cosyvoice", "english_female")

    await player.speak("Compare this voice.")

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:5578/v1/tts/synthesize",
      expect.objectContaining({
        body: JSON.stringify({
          engine: "cosyvoice",
          text: "Compare this voice.",
          speed: 1,
          seed: 2024,
          voice: "english_female",
        }),
      }),
    )
  })

  it("falls back to browser speech when the local service is not running", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"))
    const onStart = vi.fn()
    const player = new TtsClientPlayer("kokoro", "bf_emma")

    await expect(player.speak("Hello", { speed: 0.8, onStart })).resolves.toBeUndefined()

    expect(browserSpeak).toHaveBeenCalledOnce()
    expect(browserSpeak.mock.calls[0][0]).toMatchObject({
      lang: "en-GB",
      rate: 0.8,
      text: "Hello",
    })
    expect(onStart).toHaveBeenCalledOnce()
    expect(createObjectUrl).not.toHaveBeenCalled()
  })

  it("keeps using browser speech after readiness detects a stopped service", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"))
    const player = new TtsClientPlayer("audio8", "multilingual")

    await player.prepare()
    await player.speak("Continue without the service.")

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(browserSpeak).toHaveBeenCalledOnce()
  })

  it("keeps service-side synthesis errors visible instead of masking them", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Kokoro 模型尚未安装" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    )
    const player = new TtsClientPlayer("kokoro", "af_bella")

    await expect(player.speak("Service error remains visible.")).rejects.toThrow(
      "Kokoro 模型尚未安装",
    )
    expect(browserSpeak).not.toHaveBeenCalled()
  })

  it("falls back when an optional sidecar is not running", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "cosyvoice_unavailable",
          message: "无法连接本地 CosyVoice 推理进程",
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    const player = new TtsClientPlayer("cosyvoice", "english_female")

    await expect(player.speak("Fallback from CosyVoice.")).resolves.toBeUndefined()
    expect(browserSpeak).toHaveBeenCalledOnce()
  })

  it("routes a configured HTTP API transport through the app speech endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([73, 68, 51]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    )
    const player = new TtsClientPlayer("kokoro", "af_bella", {
      transport: "api",
      endpoint: "https://speech.example.com/v1",
      apiKey: "sk-test",
      model: "tts-1",
    })

    await player.prepare()
    await player.speak("Speak through the API.", { speed: 0.9 })

    // Preparation never contacts the local gateway for the API transport.
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/speech/tts",
      expect.objectContaining({
        body: JSON.stringify({
          endpoint: {
            apiKey: "sk-test",
            endpoint: "https://speech.example.com/v1",
            model: "tts-1",
          },
          format: "mp3",
          speed: 0.9,
          text: "Speak through the API.",
          voice: "af_bella",
        }),
      }),
    )
    expect(browserSpeak).not.toHaveBeenCalled()
  })

  it("falls back to browser speech when a configured API transport is unreachable", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "无法连接语音合成接口" } }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    )
    const player = new TtsClientPlayer("kokoro", "af_bella", {
      transport: "api",
      endpoint: "https://speech.example.com/v1",
      apiKey: "",
      model: "tts-1",
    })

    await expect(player.speak("No sidecar and no API.")).resolves.toBeUndefined()
    expect(browserSpeak).toHaveBeenCalledOnce()
  })

  it("uses system speech directly when the browser transport is selected", async () => {
    const player = new TtsClientPlayer("kokoro", "af_bella", {
      transport: "browser",
      endpoint: "",
      apiKey: "",
      model: "",
    })

    await player.prepare()
    await player.speak("Just the browser.")

    expect(fetchMock).not.toHaveBeenCalled()
    expect(browserSpeak).toHaveBeenCalledOnce()
  })

  it("keeps audio caches separate per transport and endpoint", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(new Uint8Array([82, 73, 70, 70]), {
          status: 200,
          headers: { "Content-Type": "audio/wav" },
        }),
    )

    await new TtsClientPlayer("kokoro", "af_bella").speak("Same sentence.")
    await new TtsClientPlayer("kokoro", "af_bella", {
      transport: "api",
      endpoint: "https://speech.example.com/v1",
      apiKey: "",
      model: "tts-1",
    }).speak("Same sentence.")

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
