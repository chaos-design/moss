import { describe, expect, it } from "vitest"
import { defaultAsrEngine } from "@/lib/asr-config"
import {
  buildLocalServiceSelection,
  defaultLocalServiceConfig,
  getAsrEngineOptionsForService,
  getDefaultLocalService,
  getLocalService,
  getLocalServiceOptions,
  matchLocalService,
  parseLocalServiceConfig,
  resolveEngineForService,
  resolveGatewayVoiceForService,
  resolveLocalService,
} from "@/lib/local-service-config"
import { defaultSpeechConfig } from "@/lib/speech-config"
import { speechRules } from "@/lib/speech-rules"
import { ttsVoiceOptions } from "@/lib/tts-config"

const asrServices = getLocalServiceOptions("asr")
const ttsServices = getLocalServiceOptions("tts")

describe("local service catalog", () => {
  it("matches the MOSS services declared in the shared rule table", () => {
    expect(asrServices.map((option) => option.id)).toEqual([
      "moss-asr",
      "funasr",
      "local-api",
      "fish-audio",
    ])
    expect(ttsServices.map((option) => option.id)).toEqual([
      "moss-tts",
      "local-api",
      "fish-audio",
    ])
    expect(asrServices[0].endpoint).toBe(speechRules.services.asr.url)
    expect(ttsServices[0].endpoint).toBe(speechRules.services.ttsGateway.url)
    expect(getLocalService("asr", "local-api").endpoint).toBe(
      speechRules.services.localApi.baseUrl,
    )
    expect(getLocalService("tts", "fish-audio").endpoint).toBe(
      speechRules.services.fishAudio.baseUrl,
    )
  })

  it("resolves adapter models from the shared model table, not a second copy", () => {
    expect(getLocalService("asr", "local-api").model).toBe(speechRules.models.localApi.asr)
    expect(getLocalService("tts", "local-api").model).toBe(speechRules.models.localApi.tts)
    expect(getLocalService("asr", "fish-audio").model).toBe(speechRules.models.fishAudio.asr)
    expect(getLocalService("tts", "fish-audio").model).toBe(speechRules.models.fishAudio.tts)
  })

  it("resolves the selected service from an address or the effective engine", () => {
    expect(matchLocalService("asr", "http://127.0.0.1:5584/v1")?.id).toBe("fish-audio")
    expect(matchLocalService("asr", "https://speech.example.com/v1")).toBeNull()
    expect(resolveLocalService("asr", "", "funasr").id).toBe("funasr")
    expect(resolveLocalService("asr", "", "sensevoice").id).toBe("moss-asr")
    expect(getDefaultLocalService("tts").id).toBe("moss-tts")
  })

  it("filters engines and voices to the selected service", () => {
    expect(
      getAsrEngineOptionsForService(getLocalService("asr", "moss-asr")).map((o) => o.value),
    ).toEqual(["qwen3-asr", "sensevoice"])
    expect(
      getAsrEngineOptionsForService(getLocalService("asr", "funasr")).map((o) => o.value),
    ).toEqual(["funasr"])
    expect(getAsrEngineOptionsForService(getLocalService("asr", "fish-audio"))).toEqual([])
    expect(getLocalService("tts", "moss-tts").voices).toBe("gateway")
    expect(getLocalService("tts", "fish-audio").voices).toBe("fishaudio")
  })

  it("falls back to the service default instead of keeping a mismatched value", () => {
    expect(
      resolveEngineForService(getLocalService("asr", "moss-asr"), undefined, "funasr"),
    ).toBe(defaultAsrEngine)
    expect(
      resolveEngineForService(getLocalService("asr", "funasr"), "funasr", "sensevoice"),
    ).toBe("funasr")
    expect(
      resolveEngineForService(getLocalService("asr", "fish-audio"), "funasr", "funasr"),
    ).toBeNull()
    expect(resolveGatewayVoiceForService("alloy", ttsVoiceOptions[0].value)).toBe(
      ttsVoiceOptions[0].value,
    )
    expect(resolveGatewayVoiceForService("audio8:multilingual", "alloy")).toBe(
      "audio8:multilingual",
    )
  })
})

describe("per-service local configuration", () => {
  it("parses and rejects malformed saved values", () => {
    expect(parseLocalServiceConfig(null)).toEqual(defaultLocalServiceConfig)
    expect(
      parseLocalServiceConfig(
        JSON.stringify({
          asrEngines: { "moss-asr": "sensevoice", bad: "unknown" },
          ttsVoices: { "fish-audio": "9a9cf47702da", bad: 42 },
        }),
      ),
    ).toEqual({
      version: 1,
      asrEngines: { "moss-asr": "sensevoice" },
      ttsVoices: { "fish-audio": "9a9cf47702da" },
    })
    expect(parseLocalServiceConfig("{")).toEqual(defaultLocalServiceConfig)
  })

  it("saves the leaving service and restores the target service without cross-use", () => {
    const first = buildLocalServiceSelection({
      service: "asr",
      option: getLocalService("asr", "funasr"),
      previousId: "moss-asr",
      current: { ...defaultSpeechConfig.asr },
      engine: "qwen3-asr",
      gatewayVoice: ttsVoiceOptions[0].value,
      saved: defaultLocalServiceConfig,
    })
    expect(first.patch).toEqual({ endpoint: "", transport: "local", model: "", voice: "" })
    expect(first.engine).toBe("funasr")
    expect(first.saved.asrEngines).toEqual({ "moss-asr": "qwen3-asr", funasr: "funasr" })

    const back = buildLocalServiceSelection({
      service: "asr",
      option: getLocalService("asr", "moss-asr"),
      previousId: "funasr",
      current: { ...defaultSpeechConfig.asr },
      engine: "funasr",
      gatewayVoice: ttsVoiceOptions[0].value,
      saved: first.saved,
    })
    expect(back.engine).toBe("qwen3-asr")
  })

  it("keeps adapter voices separate and aligns the transport when selecting an adapter", () => {
    const toFish = buildLocalServiceSelection({
      service: "tts",
      option: getLocalService("tts", "fish-audio"),
      previousId: "moss-tts",
      current: { ...defaultSpeechConfig.tts },
      engine: defaultAsrEngine,
      gatewayVoice: "audio8:multilingual",
      saved: defaultLocalServiceConfig,
    })
    expect(toFish.patch.transport).toBe("api")
    expect(toFish.patch.endpoint).toBe(speechRules.services.fishAudio.baseUrl)
    expect(toFish.patch.model).toBe(speechRules.models.fishAudio.tts)
    expect(toFish.patch.voice).toBe("")
    expect(toFish.saved.ttsVoices["moss-tts"]).toBe("audio8:multilingual")

    const savedWithFishVoice = {
      ...toFish.saved,
      ttsVoices: { ...toFish.saved.ttsVoices, "fish-audio": "9a9cf47702da" },
    }
    const toLocalApi = buildLocalServiceSelection({
      service: "tts",
      option: getLocalService("tts", "local-api"),
      previousId: "fish-audio",
      current: { ...defaultSpeechConfig.tts, transport: "api", voice: "9a9cf47702da" },
      engine: defaultAsrEngine,
      gatewayVoice: "audio8:multilingual",
      saved: savedWithFishVoice,
    })
    // 5583 不会沿用 5584 的 reference_id。
    expect(toLocalApi.patch.voice).toBe("")
    expect(toLocalApi.saved.ttsVoices["fish-audio"]).toBe("9a9cf47702da")

    const backToFish = buildLocalServiceSelection({
      service: "tts",
      option: getLocalService("tts", "fish-audio"),
      previousId: "local-api",
      current: { ...defaultSpeechConfig.tts, transport: "api", voice: "" },
      engine: defaultAsrEngine,
      gatewayVoice: "audio8:multilingual",
      saved: toLocalApi.saved,
    })
    expect(backToFish.patch.voice).toBe("9a9cf47702da")
  })
})
