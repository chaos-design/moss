import { describe, expect, it } from "vitest"
import {
  applyVoiceSelection,
  cosyVoiceOptions,
  defaultTtsConfig,
  getSelectedVoiceValue,
  getShadowingVoicePair,
  kokoroVoices,
  parseTtsConfig,
  ttsVoiceOptions,
} from "@/lib/tts-config"

describe("tts config", () => {
  it("defaults new users to the highest-rated English Kokoro voice", () => {
    expect(parseTtsConfig(null)).toEqual(defaultTtsConfig)
    expect(defaultTtsConfig.engine).toBe("kokoro")
    expect(defaultTtsConfig.voice).toBe("af_heart")
    expect(defaultTtsConfig.version).toBe(2)
    expect(getSelectedVoiceValue(defaultTtsConfig)).toBe("kokoro:af_heart")
  })

  it("exposes Audio8, CosyVoice, and every Kokoro voice", () => {
    expect(ttsVoiceOptions[0]?.value).toBe("audio8:multilingual")
    expect(ttsVoiceOptions).toHaveLength(kokoroVoices.length + cosyVoiceOptions.length + 1)
    expect(ttsVoiceOptions.filter((option) => option.engine === "audio8")).toHaveLength(1)
    expect(ttsVoiceOptions.filter((option) => option.engine === "cosyvoice")).toHaveLength(
      cosyVoiceOptions.length,
    )
    expect(ttsVoiceOptions.filter((option) => option.engine === "kokoro")).toHaveLength(
      kokoroVoices.length,
    )
  })

  it("switches engine and voice together when a Kokoro option is selected", () => {
    const next = applyVoiceSelection(defaultTtsConfig, "kokoro:bf_emma")
    expect(next.engine).toBe("kokoro")
    expect(next.voice).toBe("bf_emma")
    expect(getSelectedVoiceValue(next)).toBe("kokoro:bf_emma")

    const back = applyVoiceSelection(next, "audio8:multilingual")
    expect(back.engine).toBe("audio8")
    expect(getSelectedVoiceValue(back)).toBe("audio8:multilingual")
  })

  it("pairs the selected AI role voice with a distinct shadowing voice", () => {
    expect(getShadowingVoicePair(defaultTtsConfig)).toMatchObject({
      partner: { value: "kokoro:af_heart" },
      learner: { value: "kokoro:am_michael" },
    })
    expect(
      getShadowingVoicePair({
        version: 2,
        engine: "cosyvoice",
        voice: "english_male",
      }),
    ).toMatchObject({
      partner: { value: "cosyvoice:english_male" },
      learner: { value: "cosyvoice:english_female" },
    })
    expect(
      getShadowingVoicePair({
        version: 2,
        engine: "audio8",
        voice: "multilingual",
      }).learner.value,
    ).toBe("kokoro:am_michael")
  })

  it("ignores unknown selections and falls back on invalid stored values", () => {
    expect(applyVoiceSelection(defaultTtsConfig, "unknown")).toEqual(defaultTtsConfig)
    const restored = parseTtsConfig(
      JSON.stringify({ engine: "kokoro", kokoroVoice: "not-real", kokoroDevice: "gpu" }),
    )
    expect(restored.engine).toBe("kokoro")
    expect(restored.voice).toBe("af_bella")
    expect(restored).not.toHaveProperty("kokoroDevice")
  })

  it("migrates the retired bare 'af' voice to the default voice", () => {
    // The Kokoro v1.0 voice pack has no aggregate "af" voice; persisted config must not keep it or
    // synthesis fails with `Voice "af" not found`.
    expect(kokoroVoices.some((voice) => voice.id === "af")).toBe(false)
    const restored = parseTtsConfig(JSON.stringify({ engine: "kokoro", kokoroVoice: "af" }))
    expect(restored.voice).toBe("af_bella")
    expect(kokoroVoices.some((voice) => voice.id === restored.voice)).toBe(true)
  })

  it("migrates a valid v1 Kokoro selection", () => {
    expect(
      parseTtsConfig(JSON.stringify({ version: 1, engine: "kokoro", kokoroVoice: "bf_emma" })),
    ).toEqual({
      version: 2,
      engine: "kokoro",
      voice: "bf_emma",
    })
  })

  it("migrates removed ChatTTS selections to Kokoro", () => {
    expect(
      parseTtsConfig(JSON.stringify({ version: 2, engine: "chattts", voice: "" })),
    ).toEqual({
      version: 2,
      engine: "kokoro",
      voice: "af_bella",
    })
  })

  it("only lists voice ids that exist in the Kokoro v1.0 voice pack", () => {
    const validIds = new Set([
      "zf_001",
      "zf_024",
      "zf_049",
      "zf_099",
      "zm_009",
      "zm_025",
      "zm_050",
      "zm_100",
      "af_heart",
      "af_alloy",
      "af_aoede",
      "af_bella",
      "af_jessica",
      "af_kore",
      "af_nicole",
      "af_nova",
      "af_river",
      "af_sarah",
      "af_sky",
      "am_adam",
      "am_echo",
      "am_eric",
      "am_fenrir",
      "am_liam",
      "am_michael",
      "am_onyx",
      "am_puck",
      "am_santa",
      "bf_emma",
      "bf_isabella",
      "bm_george",
      "bm_lewis",
      "bf_alice",
      "bf_lily",
      "bm_daniel",
      "bm_fable",
    ])
    for (const voice of kokoroVoices) {
      expect(validIds.has(voice.id)).toBe(true)
    }
    expect(validIds.has("af_bella")).toBe(true)
  })

  it("switches to an independent CosyVoice engine and validates persisted voice ids", () => {
    const next = applyVoiceSelection(defaultTtsConfig, "cosyvoice:english_male")
    expect(next).toEqual({ version: 2, engine: "cosyvoice", voice: "english_male" })
    expect(getSelectedVoiceValue(next)).toBe("cosyvoice:english_male")

    const restored = parseTtsConfig(
      JSON.stringify({ version: 2, engine: "cosyvoice", voice: "unknown" }),
    )
    expect(restored.voice).toBe("english_female")
  })
})
