import { describe, expect, it } from "vitest"
import { maximumTtsTextLength, speechRequestTimeoutMs } from "@/lib/server/speech-gateway"
import {
  getDefaultFishAudioEndpoint,
  getDefaultFishAudioModel,
  getDefaultLocalApiEndpoint,
  getDefaultLocalApiModel,
  maximumSpeechApiKeyLength,
  maximumSpeechEndpointLength,
  maximumSpeechModelLength,
} from "@/lib/speech-config"
import {
  getLocalApiRuleDefaults,
  isAdapterSupportedFormat,
  isAudioContentType,
  isPlausibleAudioPayload,
  speechRules,
  testSynthesisDefaults,
} from "@/lib/speech-rules"

const audioBytes = (values: number[]) => new Uint8Array(values).buffer

describe("shared speech rules", () => {
  it("is the single source for the local interface preset and limit constants", () => {
    expect(getDefaultLocalApiEndpoint("asr")).toBe(speechRules.services.localApi.baseUrl)
    expect(getDefaultLocalApiEndpoint("tts")).toBe(speechRules.services.localApi.baseUrl)
    expect(getDefaultLocalApiModel("asr")).toBe(speechRules.models.localApi.asr)
    expect(getDefaultLocalApiModel("tts")).toBe(speechRules.models.localApi.tts)
    expect(maximumSpeechApiKeyLength).toBe(speechRules.limits.maxApiKeyLength)
    expect(maximumSpeechEndpointLength).toBe(speechRules.limits.maxEndpointLength)
    expect(maximumSpeechModelLength).toBe(speechRules.limits.maxModelLength)
    expect(maximumTtsTextLength).toBe(speechRules.limits.maxTtsTextLength)
    expect(speechRequestTimeoutMs).toBe(speechRules.limits.speechRequestTimeoutMs)
  })

  it("keeps the local model, voice and format defaults coherent", () => {
    expect(getLocalApiRuleDefaults()).toEqual({
      ttsModel: speechRules.models.localApi.tts,
      asrModel: speechRules.models.localApi.asr,
      defaultVoice: speechRules.voice.default,
      defaultFormat: speechRules.formats.default,
      timeoutSeconds: speechRules.limits.adapterTimeoutSeconds,
      maxAudioBytes: speechRules.limits.maxAsrAudioBytes,
      maxTextLength: speechRules.limits.maxTtsTextLength,
      port: speechRules.services.localApi.port,
    })
    expect(testSynthesisDefaults.format).toBe(speechRules.formats.default)
    expect(speechRules.voice.aliases[testSynthesisDefaults.voice as "alloy"]).toBe(
      speechRules.voice.default,
    )
  })

  it("only accepts formats the local adapter can actually emit", () => {
    expect(isAdapterSupportedFormat("mp3")).toBe(true)
    expect(isAdapterSupportedFormat("wav")).toBe(true)
    expect(isAdapterSupportedFormat("aac")).toBe(false)
    expect(isAdapterSupportedFormat("flac")).toBe(false)
    expect(Object.keys(speechRules.formats.adapterSupported)).toEqual([
      "mp3",
      "opus",
      "pcm",
      "wav",
    ])
  })

  it("keeps the Fish Audio adapter preset, formats and provider rules coherent", () => {
    // 5584 服务与 5583 共用同一套 OpenAI 兼容路由，只是端口与上游不同。
    expect(speechRules.services.fishAudio.baseUrl).toBe("http://127.0.0.1:5584/v1")
    expect(speechRules.services.fishAudio.routes).toEqual(speechRules.services.localApi.routes)
    expect(getDefaultFishAudioEndpoint("asr")).toBe(speechRules.services.fishAudio.baseUrl)
    expect(getDefaultFishAudioEndpoint("tts")).toBe(speechRules.services.fishAudio.baseUrl)
    expect(getDefaultFishAudioModel("asr")).toBe(speechRules.models.fishAudio.asr)
    expect(getDefaultFishAudioModel("tts")).toBe(speechRules.models.fishAudio.tts)

    const fishFormats = speechRules.formats.fishAudioSupported as Record<
      string,
      { outputFormat: string; contentType: string; sampleRate: number }
    >
    expect(Object.keys(fishFormats)).toEqual(["mp3", "opus", "pcm", "wav"])
    for (const format of Object.keys(fishFormats)) {
      // Fish Audio 原生接受这些格式名，转发时无需改名。
      expect(fishFormats[format].outputFormat).toBe(format)
      expect(fishFormats[format].contentType).toMatch(/^audio\//)
    }

    // OpenAI 别名没有真实 Fish Audio 模型，全部映射到空串 = 内置默认音色。
    const fish = speechRules.fishAudio
    expect(Object.keys(fish.voiceAliases)).toEqual(Object.keys(speechRules.voice.aliases))
    expect(Object.values(fish.voiceAliases).every((value) => value === "")).toBe(true)
    expect(fish.speed.min).toBe(speechRules.speed.min)
    expect(fish.speed.max).toBe(speechRules.speed.max)
    expect(fish.latency).toBe("balanced")
  })

  it("recognizes audio content types even with a charset suffix", () => {
    expect(isAudioContentType("audio/mpeg")).toBe(true)
    expect(isAudioContentType("audio/wav; charset=binary")).toBe(true)
    expect(isAudioContentType("application/json")).toBe(false)
  })

  it("validates known container magic numbers before declaring a synthesis usable", () => {
    expect(isPlausibleAudioPayload(audioBytes([0x49, 0x44, 0x33, 1, 2]), "audio/mpeg")).toBe(
      true,
    )
    expect(isPlausibleAudioPayload(audioBytes([0xff, 0xfb, 0x90, 0x00]), "audio/mpeg")).toBe(
      true,
    )
    expect(
      isPlausibleAudioPayload(audioBytes([0x52, 0x49, 0x46, 0x46, 0, 0]), "audio/wav"),
    ).toBe(true)
    expect(
      isPlausibleAudioPayload(audioBytes([0x4f, 0x67, 0x67, 0x53, 0, 0]), "audio/ogg"),
    ).toBe(true)
    // Raw PCM has no container header; length is the only usable check.
    expect(isPlausibleAudioPayload(audioBytes([1, 2, 3, 4]), "audio/pcm")).toBe(true)
  })

  it("rejects truncated, mismatched or non-audio payloads", () => {
    expect(isPlausibleAudioPayload(audioBytes([0x49, 0x44, 0x33]), "audio/mpeg")).toBe(false)
    expect(isPlausibleAudioPayload(audioBytes([1, 2, 3, 4, 5]), "audio/mpeg")).toBe(false)
    expect(isPlausibleAudioPayload(audioBytes([1, 2, 3, 4, 5]), "audio/wav")).toBe(false)
    expect(isPlausibleAudioPayload(audioBytes([1, 2]), "audio/pcm")).toBe(false)
  })
})
