// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { splitSpeechText, useLocalTts } from "@/features/speech/use-local-tts"
import { setSpeechConfig } from "@/features/speech/use-speech-config"
import { setTtsConfig } from "@/features/speech/use-tts-config"
import { defaultSpeechConfig } from "@/lib/speech-config"
import { defaultTtsConfig } from "@/lib/tts-config"

const audioBytes = new Uint8Array([82, 73, 70, 70])

function audioResponse(contentType: string) {
  return new Response(audioBytes, {
    status: 200,
    headers: { "Content-Type": contentType },
  })
}

// jsdom 没有可播放的 Audio 与 object URL：与 local-tts.test 的桩保持同一契约。
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

describe("local TTS text chunking", () => {
  it("keeps short sentences intact", () => {
    expect(splitSpeechText("Could I get a coffee, please?")).toEqual([
      "Could I get a coffee, please?",
    ])
  })

  it("bounds long sentences so the first audio can start sooner", () => {
    const chunks = splitSpeechText(
      "This is a deliberately long sentence with enough words to require several smaller synthesis requests.",
      32,
    )

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 32)).toBe(true)
    expect(chunks.join(" ")).toBe(
      "This is a deliberately long sentence with enough words to require several smaller synthesis requests.",
    )
  })
})

describe("useLocalTts playback voice resolution", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    window.localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("Audio", MockAudio)
    URL.createObjectURL = vi.fn(() => "blob:playback")
    URL.revokeObjectURL = vi.fn()
    setTtsConfig(() => defaultTtsConfig)
    setSpeechConfig(() => defaultSpeechConfig)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sends the speech-config voice when the playback transport is an API endpoint", async () => {
    fetchMock.mockResolvedValue(audioResponse("audio/mpeg"))
    setTtsConfig(() => ({ version: 2, engine: "kokoro", voice: "af_heart" }))
    setSpeechConfig((current) => ({
      ...current,
      tts: {
        transport: "api",
        endpoint: "https://speech.example.com/v1",
        apiKey: "sk-test",
        model: "tts-1",
        voice: "nova",
      },
    }))
    const { result } = renderHook(() => useLocalTts())

    await act(async () => {
      await result.current.speak("Hello there.")
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe("/api/speech/tts")
    const payload = JSON.parse(String(init.body))
    // 本机音色库的 af_heart 不得漏进接口请求：api 播报只使用配置的接口音色。
    expect(payload.voice).toBe("nova")
    expect(payload.endpoint).toEqual({
      apiKey: "sk-test",
      endpoint: "https://speech.example.com/v1",
      model: "tts-1",
    })
  })

  it("sends one concrete default voice when no API voice is configured", async () => {
    // 连续两次播报各需要一份新的 Response body。
    fetchMock.mockImplementation(() => Promise.resolve(audioResponse("audio/mpeg")))
    setSpeechConfig((current) => ({
      ...current,
      tts: {
        transport: "api",
        endpoint: "https://speech.example.com/v1",
        apiKey: "sk-test",
        model: "tts-1",
        voice: "",
      },
    }))
    const { result } = renderHook(() => useLocalTts())

    await act(async () => {
      await result.current.speak("Hello there.")
    })

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    // 播放音色恒定：未配置时固定发 alloy，保证配置未变时逐句音色一致，
    // 不会因为省略字段而被上游按请求各自挑音色。
    expect(payload.voice).toBe("alloy")

    // 同一会话的第二句复用同一音色，逐句不会因 provider 各自挑音色而漂移。
    await act(async () => {
      await result.current.speak("One more sentence.")
    })
    const secondPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(secondPayload.voice).toBe("alloy")
  })

  it("keeps the local registry voice for the loopback gateway", async () => {
    fetchMock.mockResolvedValue(audioResponse("audio/wav"))
    setTtsConfig(() => ({ version: 2, engine: "kokoro", voice: "af_heart" }))
    setSpeechConfig((current) => ({
      ...current,
      tts: { transport: "local", endpoint: "", apiKey: "", model: "", voice: "nova" },
    }))
    const { result } = renderHook(() => useLocalTts())

    await act(async () => {
      await result.current.speak("Hello there.")
    })

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe("http://127.0.0.1:5578/v1/tts/synthesize")
    const payload = JSON.parse(String(init.body))
    expect(payload.voice).toBe("af_heart")
    expect(payload.engine).toBe("kokoro")
  })
})
