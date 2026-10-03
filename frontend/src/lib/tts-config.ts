export type TtsEngine = "audio8" | "kokoro" | "cosyvoice"

export const audio8VoicePrefix = "audio8:"
export const kokoroVoicePrefix = "kokoro:"
export const cosyVoicePrefix = "cosyvoice:"

export type KokoroVoiceDescriptor = {
  id: string
  name: string
  language: string
  grade: string
}

// Voice ids and grades mirror the Kokoro v1.0 voice pack used by the Python service.
// An id absent from that pack makes synthesis fail. Voices are ordered best-grade first
// within each accent + gender.
export const kokoroVoices: KokoroVoiceDescriptor[] = [
  { id: "zf_001", name: "普通话女声 01", language: "普通话女声", grade: "v1.1" },
  { id: "zf_024", name: "普通话女声 24", language: "普通话女声", grade: "v1.1" },
  { id: "zf_049", name: "普通话女声 49", language: "普通话女声", grade: "v1.1" },
  { id: "zf_099", name: "普通话女声 99", language: "普通话女声", grade: "v1.1" },
  { id: "zm_009", name: "普通话男声 09", language: "普通话男声", grade: "v1.1" },
  { id: "zm_025", name: "普通话男声 25", language: "普通话男声", grade: "v1.1" },
  { id: "zm_050", name: "普通话男声 50", language: "普通话男声", grade: "v1.1" },
  { id: "zm_100", name: "普通话男声 100", language: "普通话男声", grade: "v1.1" },
  { id: "af_heart", name: "Heart", language: "美式女声", grade: "A" },
  { id: "af_bella", name: "Bella", language: "美式女声", grade: "A-" },
  { id: "af_nicole", name: "Nicole", language: "美式女声", grade: "B-" },
  { id: "af_aoede", name: "Aoede", language: "美式女声", grade: "C+" },
  { id: "af_kore", name: "Kore", language: "美式女声", grade: "C+" },
  { id: "af_sarah", name: "Sarah", language: "美式女声", grade: "C+" },
  { id: "af_alloy", name: "Alloy", language: "美式女声", grade: "C" },
  { id: "af_nova", name: "Nova", language: "美式女声", grade: "C" },
  { id: "af_sky", name: "Sky", language: "美式女声", grade: "C-" },
  { id: "af_jessica", name: "Jessica", language: "美式女声", grade: "D" },
  { id: "af_river", name: "River", language: "美式女声", grade: "D" },
  { id: "am_fenrir", name: "Fenrir", language: "美式男声", grade: "C+" },
  { id: "am_michael", name: "Michael", language: "美式男声", grade: "C+" },
  { id: "am_puck", name: "Puck", language: "美式男声", grade: "C+" },
  { id: "am_echo", name: "Echo", language: "美式男声", grade: "D" },
  { id: "am_eric", name: "Eric", language: "美式男声", grade: "D" },
  { id: "am_liam", name: "Liam", language: "美式男声", grade: "D" },
  { id: "am_onyx", name: "Onyx", language: "美式男声", grade: "D" },
  { id: "am_santa", name: "Santa", language: "美式男声", grade: "D-" },
  { id: "am_adam", name: "Adam", language: "美式男声", grade: "F+" },
  { id: "bf_emma", name: "Emma", language: "英式女声", grade: "B-" },
  { id: "bf_isabella", name: "Isabella", language: "英式女声", grade: "C" },
  { id: "bf_alice", name: "Alice", language: "英式女声", grade: "D" },
  { id: "bf_lily", name: "Lily", language: "英式女声", grade: "D" },
  { id: "bm_fable", name: "Fable", language: "英式男声", grade: "C" },
  { id: "bm_george", name: "George", language: "英式男声", grade: "C" },
  { id: "bm_lewis", name: "Lewis", language: "英式男声", grade: "D+" },
  { id: "bm_daniel", name: "Daniel", language: "英式男声", grade: "D" },
]

export const kokoroDefaultVoice = "af_bella"
export const cosyVoiceDefaultVoice = "english_female"

export const cosyVoiceOptions = [
  {
    id: "english_female",
    name: "CosyVoice English Female",
    language: "英文女声",
  },
  {
    id: "english_male",
    name: "CosyVoice English Male",
    language: "英文男声",
  },
] as const

export type TtsVoiceOption = {
  value: string
  label: string
  name: string
  language: string
  quality: string
  engine: TtsEngine
  voice?: string
}

const audio8VoiceOption: TtsVoiceOption = {
  value: `${audio8VoicePrefix}multilingual`,
  label: "Audio8 · Multilingual",
  name: "Audio8 Multilingual",
  language: "中英双语",
  quality: "Audio8 0.6B",
  engine: "audio8",
  voice: "multilingual",
}

const kokoroVoiceOptions: TtsVoiceOption[] = kokoroVoices.map((voice) => ({
  value: `${kokoroVoicePrefix}${voice.id}`,
  label: `Kokoro · ${voice.name}`,
  name: voice.name,
  language: voice.language,
  quality: `Kokoro · ${voice.grade}`,
  engine: "kokoro",
  voice: voice.id,
}))

const cosyVoiceTtsOptions: TtsVoiceOption[] = cosyVoiceOptions.map((voice) => ({
  value: `${cosyVoicePrefix}${voice.id}`,
  label: voice.name,
  name: voice.name,
  language: voice.language,
  quality: "CosyVoice 300M SFT",
  engine: "cosyvoice",
  voice: voice.id,
}))

export const ttsVoiceOptions: TtsVoiceOption[] = [
  audio8VoiceOption,
  ...cosyVoiceTtsOptions,
  ...kokoroVoiceOptions,
]

export type TtsConfig = {
  version: 2
  engine: TtsEngine
  voice: string
}

export const ttsConfigStorageKey = "moss:tts-config:v2"
export const legacyTtsConfigStorageKey = "moss:tts-config:v1"

export const defaultTtsConfig: TtsConfig = {
  version: 2,
  engine: "kokoro",
  voice: "af_heart",
}

function isKokoroVoice(value: string): boolean {
  return kokoroVoices.some((voice) => voice.id === value)
}

function isCosyVoice(value: string): boolean {
  return cosyVoiceOptions.some((voice) => voice.id === value)
}

export function parseTtsConfig(value: string | null): TtsConfig {
  if (!value) {
    return defaultTtsConfig
  }

  try {
    const parsed = JSON.parse(value) as Partial<TtsConfig> & { kokoroVoice?: unknown }
    const engine =
      parsed.engine === "audio8" || parsed.engine === "kokoro" || parsed.engine === "cosyvoice"
        ? parsed.engine
        : defaultTtsConfig.engine
    const legacyVoice = typeof parsed.kokoroVoice === "string" ? parsed.kokoroVoice : ""
    const voice = typeof parsed.voice === "string" ? parsed.voice : legacyVoice
    return {
      version: 2,
      engine,
      voice:
        engine === "kokoro"
          ? isKokoroVoice(voice)
            ? voice
            : kokoroDefaultVoice
          : engine === "cosyvoice"
            ? isCosyVoice(voice)
              ? voice
              : cosyVoiceDefaultVoice
            : "multilingual",
    }
  } catch {
    return defaultTtsConfig
  }
}

// Maps the persisted config to the single option value shown in the voice selector.
export function getSelectedVoiceValue(config: TtsConfig): string {
  if (config.engine === "kokoro") {
    return `${kokoroVoicePrefix}${config.voice}`
  }
  if (config.engine === "cosyvoice") {
    return `${cosyVoicePrefix}${config.voice}`
  }
  return `${audio8VoicePrefix}multilingual`
}

const companionVoiceValues: Record<string, string> = {
  [`${cosyVoicePrefix}english_female`]: `${cosyVoicePrefix}english_male`,
  [`${cosyVoicePrefix}english_male`]: `${cosyVoicePrefix}english_female`,
  [`${kokoroVoicePrefix}af_heart`]: `${kokoroVoicePrefix}am_michael`,
  [`${kokoroVoicePrefix}af_bella`]: `${kokoroVoicePrefix}am_michael`,
  [`${kokoroVoicePrefix}bf_emma`]: `${kokoroVoicePrefix}bm_george`,
  [`${kokoroVoicePrefix}bf_isabella`]: `${kokoroVoicePrefix}bm_george`,
  [`${kokoroVoicePrefix}bm_fable`]: `${kokoroVoicePrefix}bf_emma`,
  [`${kokoroVoicePrefix}bm_george`]: `${kokoroVoicePrefix}bf_emma`,
}

export function getShadowingVoicePair(config: TtsConfig): {
  learner: TtsVoiceOption
  partner: TtsVoiceOption
} {
  const selectedValue = getSelectedVoiceValue(config)
  const partner =
    ttsVoiceOptions.find((option) => option.value === selectedValue) ?? audio8VoiceOption
  const kokoroVoice = config.voice
  const fallbackValue =
    config.engine === "kokoro"
      ? kokoroVoice.startsWith("af_")
        ? `${kokoroVoicePrefix}am_michael`
        : kokoroVoice.startsWith("am_")
          ? `${kokoroVoicePrefix}af_heart`
          : kokoroVoice.startsWith("bf_")
            ? `${kokoroVoicePrefix}bm_george`
            : kokoroVoice.startsWith("bm_")
              ? `${kokoroVoicePrefix}bf_emma`
              : kokoroVoice.startsWith("zf_")
                ? `${kokoroVoicePrefix}zm_009`
                : `${kokoroVoicePrefix}zf_001`
      : `${kokoroVoicePrefix}am_michael`
  const companionValue = companionVoiceValues[selectedValue] ?? fallbackValue
  const learner =
    ttsVoiceOptions.find((option) => option.value === companionValue) ??
    ttsVoiceOptions.find((option) => option.value === `${kokoroVoicePrefix}am_michael`) ??
    partner

  return { learner, partner }
}

// Applies a selector choice back onto the config, switching engine and voice together.
export function applyVoiceSelection(config: TtsConfig, optionValue: string): TtsConfig {
  const option = ttsVoiceOptions.find((item) => item.value === optionValue)
  if (!option) {
    return config
  }
  return { ...config, engine: option.engine, voice: option.voice ?? "" }
}
