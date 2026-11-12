import { afterEach, describe, expect, it, vi } from "vitest"
import {
  apiTtsVoiceOptions,
  describeSpeechTransport,
  getDefaultApiEndpoint,
  getDefaultLocalApiEndpoint,
  getDefaultLocalApiModel,
  getDefaultLocalEndpoint,
  getSelectedApiVoiceValue,
  getSpeechRequestUrl,
  isLoopbackSpeechEndpoint,
  isValidSpeechEndpoint,
  parseApiVoiceValue,
  parseSpeechConfig,
  resolveSpeechConfig,
  type SpeechConfig,
  speechConfigStorageKey,
} from "@/lib/speech-config"

function createConfig(overrides: Partial<SpeechConfig> = {}): SpeechConfig {
  return { version: 1, asr: { ...overrides.asr }, tts: { ...overrides.tts } } as SpeechConfig
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("speech configuration", () => {
  it("offers a configurable loopback interface preset for both ASR and TTS", () => {
    expect(isLoopbackSpeechEndpoint(getDefaultLocalApiEndpoint("asr"))).toBe(true)
    expect(isLoopbackSpeechEndpoint(getDefaultLocalApiEndpoint("tts"))).toBe(true)
    expect(getDefaultLocalApiModel("asr")).toBeTruthy()
    expect(getDefaultLocalApiModel("tts")).toBeTruthy()
    // Both services reach the local gateway through the OpenAI-compatible proxy contract.
    expect(getSpeechRequestUrl("asr", getDefaultLocalApiEndpoint("asr"))).toContain(
      "/audio/transcriptions",
    )
    expect(getSpeechRequestUrl("tts", getDefaultLocalApiEndpoint("tts"))).toContain(
      "/audio/speech",
    )
  })

  it("reads local interface defaults from the public environment", () => {
    vi.stubEnv("NEXT_PUBLIC_ASR_LOCAL_API_URL", "http://localhost:5599/v1/")
    vi.stubEnv("NEXT_PUBLIC_ASR_LOCAL_API_MODEL", "local-asr")
    vi.stubEnv("NEXT_PUBLIC_TTS_LOCAL_API_URL", "http://127.0.0.1:5599/v1")
    vi.stubEnv("NEXT_PUBLIC_TTS_LOCAL_API_MODEL", "local-tts")

    expect(getDefaultLocalApiEndpoint("asr")).toBe("http://localhost:5599/v1")
    expect(getDefaultLocalApiModel("asr")).toBe("local-asr")
    expect(getDefaultLocalApiEndpoint("tts")).toBe("http://127.0.0.1:5599/v1")
    expect(getDefaultLocalApiModel("tts")).toBe("local-tts")
  })

  it("accepts loopback speech endpoints without opening private-network hosts", () => {
    expect(isLoopbackSpeechEndpoint("http://127.0.0.1:5583/v1")).toBe(true)
    expect(isLoopbackSpeechEndpoint("http://localhost:5583/v1")).toBe(true)
    expect(isLoopbackSpeechEndpoint("ws://127.0.0.1:5580/v1/asr/stream")).toBe(true)
    expect(isLoopbackSpeechEndpoint("http://[::1]:5583/v1")).toBe(true)
    expect(isLoopbackSpeechEndpoint("http://192.168.1.5:5578")).toBe(false)
    expect(isLoopbackSpeechEndpoint("http://user:pass@127.0.0.1:5583/v1")).toBe(false)

    expect(isValidSpeechEndpoint("http://127.0.0.1:5583/v1")).toBe(true)
    expect(isValidSpeechEndpoint("http://speech.example.com/v1")).toBe(false)
    expect(isValidSpeechEndpoint("https://192.168.1.5/v1")).toBe(false)
  })

  it("keeps loopback endpoints valid in a production build", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(isValidSpeechEndpoint("http://127.0.0.1:5583/v1")).toBe(true)
    expect(isValidSpeechEndpoint("ws://127.0.0.1:5580/v1/asr/stream")).toBe(true)
    expect(isValidSpeechEndpoint("http://speech.example.com/v1")).toBe(false)
  })

  it("falls back to the local transports for missing or invalid storage", () => {
    expect(parseSpeechConfig(null)).toEqual({
      version: 1,
      asr: { transport: "local", endpoint: "", apiKey: "", model: "", voice: "" },
      tts: { transport: "local", endpoint: "", apiKey: "", model: "", voice: "" },
    })
    expect(parseSpeechConfig("{oops").asr.transport).toBe("local")
    expect(
      parseSpeechConfig(JSON.stringify({ version: 1, asr: { transport: "smoke-signals" } })).asr
        .transport,
    ).toBe("local")
    expect(speechConfigStorageKey).toBe("moss:speech-config:v1")
  })

  it("fills API defaults only for the API transport", () => {
    const resolved = resolveSpeechConfig(
      parseSpeechConfig(
        JSON.stringify({
          version: 1,
          asr: { transport: "api", endpoint: "", apiKey: "", model: "" },
          tts: { transport: "local", endpoint: "", apiKey: "", model: "" },
        }),
      ),
    )

    expect(resolved.asr.endpoint).toBe(getDefaultApiEndpoint("asr"))
    expect(resolved.asr.model).toBe("whisper-1")
    // The local transport keeps an empty endpoint so the client falls back to its environment URL.
    expect(resolved.tts.endpoint).toBe("")
    expect(getDefaultLocalEndpoint("asr")).toContain("ws://")
    expect(getDefaultLocalEndpoint("tts")).toContain("http://")
  })

  it("builds OpenAI-compatible request URLs without duplicating paths", () => {
    expect(getSpeechRequestUrl("asr", "https://speech.example.com/v1")).toBe(
      "https://speech.example.com/v1/audio/transcriptions",
    )
    expect(
      getSpeechRequestUrl("asr", "https://speech.example.com/v1/audio/transcriptions"),
    ).toBe("https://speech.example.com/v1/audio/transcriptions")
    expect(getSpeechRequestUrl("tts", "https://speech.example.com/v1/")).toBe(
      "https://speech.example.com/v1/audio/speech",
    )
  })

  it("signs and shapes API requests from the stored credential", () => {
    // The browser never calls a speech provider directly: `/api/speech/*` owns URL building,
    // credential use, and the endpoint policy. Only the shared URL contract is asserted here.
    expect(getSpeechRequestUrl("asr", "https://speech.example.com/v1")).toBe(
      "https://speech.example.com/v1/audio/transcriptions",
    )
    expect(getSpeechRequestUrl("tts", "https://speech.example.com/v1")).toBe(
      "https://speech.example.com/v1/audio/speech",
    )
  })

  it("rejects remote HTTP and credential-bearing endpoints", () => {
    expect(isValidSpeechEndpoint("https://speech.example.com/v1")).toBe(true)
    expect(isValidSpeechEndpoint("http://speech.example.com/v1")).toBe(false)
    expect(isValidSpeechEndpoint("https://user:pass@speech.example.com/v1")).toBe(false)
    expect(isValidSpeechEndpoint("not-a-url")).toBe(false)
  })

  it("keeps a provider voice name and maps it to the selector value", () => {
    const parsed = parseSpeechConfig(
      JSON.stringify({
        version: 1,
        asr: { transport: "local" },
        tts: { transport: "api", endpoint: "", apiKey: "", model: "", voice: " nova " },
      }),
    )

    expect(parsed.tts.voice).toBe("nova")
    expect(getSelectedApiVoiceValue(parsed.tts)).toBe("api:nova")
    // An unset voice falls back to the most neutral provider default.
    expect(getSelectedApiVoiceValue({ ...parsed.tts, voice: "" })).toBe("api:alloy")
    expect(parseApiVoiceValue("api:nova")).toBe("nova")
    expect(apiTtsVoiceOptions.map((option) => option.voice)).toContain("nova")
  })

  it("names every transport in learner-facing language", () => {
    expect(describeSpeechTransport("asr", "local")).toBe("本机 ASR 服务")
    expect(describeSpeechTransport("tts", "api")).toBe("HTTP 语音合成接口")
    expect(describeSpeechTransport("asr", "browser")).toBe("浏览器语音识别")
    expect(createConfig().version).toBe(1)
  })
})
