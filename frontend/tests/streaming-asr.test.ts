// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest"
import {
  calculateAudioRms,
  calculateSpeechThreshold,
  connectWithAsrFallback,
  createAsrStartCommand,
  createFunAsrStartCommand,
  float32ToPcm16Bytes,
  getAsrConnectionError,
  getAsrConnectTimeoutMs,
  getAsrServiceUrl,
  getAsrTimeoutError,
  getFunAsrServiceUrl,
  parseFunAsrServerEvent,
  resamplePcm,
  suppressNoiseFrame,
} from "@/features/speech/use-streaming-asr"

describe("streaming ASR client", () => {
  it("only accepts a loopback WebSocket endpoint", () => {
    expect(getAsrServiceUrl()).toBe("ws://127.0.0.1:5580/v1/asr/stream")
    expect(getAsrServiceUrl("ws://localhost:6600/asr")).toBe("ws://localhost:6600/asr")
    expect(getFunAsrServiceUrl()).toBe("ws://127.0.0.1:10095/")
    expect(() => getAsrServiceUrl("wss://speech.example.com/asr")).toThrow(
      "ASR 服务地址必须使用本机 WebSocket 地址",
    )
    expect(() => getFunAsrServiceUrl("wss://speech.example.com/asr")).toThrow(
      "FunASR 服务地址必须使用本机 WebSocket 地址",
    )
  })

  it("reports the correct startup action for each ASR service", () => {
    expect(getAsrConnectionError("sensevoice").message).toContain("pnpm asr:start")
    expect(getAsrConnectionError("funasr").message).toContain(
      "外部 FunASR 服务（默认端口 10095）",
    )
  })

  it("waits far longer for a slow first engine load than for raw connectivity", () => {
    const connecting = getAsrConnectTimeoutMs("connecting")
    const loadingEngine = getAsrConnectTimeoutMs("loading-engine")

    expect(connecting).toBe(3_000)
    expect(loadingEngine).toBeGreaterThanOrEqual(120_000)
    expect(loadingEngine).toBeGreaterThan(connecting)
  })

  it("distinguishes an unreachable service from a slow engine load", () => {
    // Before the service answers, a timeout means it is unreachable.
    expect(getAsrTimeoutError("connecting", "qwen3-asr").message).toContain("pnpm asr:start")
    // After "ready", a timeout means the model is still loading, not offline.
    expect(getAsrTimeoutError("loading-engine", "qwen3-asr").message).toContain("引擎加载超时")
  })

  it("falls back from an unavailable external FunASR service to SenseVoice", async () => {
    const connect = vi
      .fn<(engine: "funasr" | "qwen3-asr" | "sensevoice") => Promise<string>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("connected")

    await expect(connectWithAsrFallback("funasr", connect)).resolves.toEqual({
      connection: "connected",
      engine: "sensevoice",
    })
    expect(connect.mock.calls.map(([engine]) => engine)).toEqual(["funasr", "sensevoice"])
  })

  it("creates and parses the standard FunASR 2-pass protocol", () => {
    expect(JSON.parse(createFunAsrStartCommand())).toMatchObject({
      mode: "2pass",
      chunk_size: [5, 10, 5],
      audio_fs: 16_000,
      wav_format: "pcm",
      is_speaking: true,
      itn: true,
    })
    expect(
      parseFunAsrServerEvent({
        mode: "2pass-online",
        text: "Could I",
      }),
    ).toEqual({ final: false, text: "Could I" })
    expect(
      parseFunAsrServerEvent({
        mode: "2pass-offline",
        text: "Could I get a latte?",
      }),
    ).toEqual({ final: true, text: "Could I get a latte?" })
    expect(parseFunAsrServerEvent({ mode: "2pass-offline", text: " " })).toBeNull()
  })

  it("converts normalized microphone samples to little-endian PCM16", () => {
    const bytes = float32ToPcm16Bytes(new Float32Array([-2, -0.5, 0, 0.5, 2]))

    expect(Array.from(new Int16Array(bytes))).toEqual([-32768, -16384, 0, 16384, 32767])
    expect(JSON.parse(createAsrStartCommand())).toEqual({
      type: "start",
      sampleRate: 16_000,
      format: "int16",
      engine: "sensevoice",
      languages: ["zh", "en"],
    })
    expect(JSON.parse(createAsrStartCommand(16_000, " Vocabulary: latte. "))).toMatchObject({
      context: "Vocabulary: latte.",
    })
    expect(JSON.parse(createAsrStartCommand(16_000, "", "sensevoice"))).toMatchObject({
      engine: "sensevoice",
    })
  })

  it("resamples browser audio to the recognizer sample rate", () => {
    const source = new Float32Array([0, 0.25, 0.5, 0.75, 1, 0.75])
    const result = resamplePcm(source, 48_000, 16_000)

    expect(Array.from(result)).toEqual([0, 0.75])
    expect(calculateAudioRms(new Float32Array([1, -1]))).toBe(1)
  })

  it("gates background frames using an adaptive noise floor", () => {
    const quietNoise = new Float32Array([0.004, -0.004, 0.003, -0.003])
    const speech = new Float32Array([0.08, -0.06, 0.05, -0.04])
    const threshold = calculateSpeechThreshold(0.01)

    expect(threshold).toBeCloseTo(0.03)
    expect(Array.from(suppressNoiseFrame(quietNoise, threshold, false))).toEqual([0, 0, 0, 0])
    expect(suppressNoiseFrame(speech, threshold, false)).toBe(speech)
  })
})
