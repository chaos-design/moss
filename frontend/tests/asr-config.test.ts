import { describe, expect, it } from "vitest"
import { asrEngineOptions, defaultAsrEngine, parseAsrEngine } from "@/lib/asr-config"

describe("asr config", () => {
  it("defaults to SenseVoice and restores supported engines", () => {
    expect(parseAsrEngine(null)).toBe(defaultAsrEngine)
    expect(parseAsrEngine('{"version":1,"engine":"sensevoice"}')).toBe("sensevoice")
    expect(parseAsrEngine('{"version":1,"engine":"funasr"}')).toBe("funasr")
  })

  it("rejects unknown persisted engines", () => {
    expect(parseAsrEngine('{"version":1,"engine":"whisper"}')).toBe(defaultAsrEngine)
    expect(parseAsrEngine("invalid")).toBe(defaultAsrEngine)
  })

  it("exposes local model and standard FunASR connections", () => {
    expect(asrEngineOptions.map((option) => option.value)).toEqual([
      "qwen3-asr",
      "sensevoice",
      "funasr",
    ])
    expect(asrEngineOptions.find((option) => option.value === "funasr")).toMatchObject({
      label: "FunASR（外部）",
      description: "标准 2-pass，需单独启动",
    })
  })
})
