import { type AsrEngine, asrEngineOptions, defaultAsrEngine } from "@/lib/asr-config"
import type { SpeechEndpoint, SpeechService, SpeechTransport } from "@/lib/speech-config"
import { speechRules } from "@/lib/speech-rules"
import { defaultTtsConfig, getSelectedVoiceValue, ttsVoiceOptions } from "@/lib/tts-config"

/**
 * MOSS 本机服务可用项与「按服务 ID 独立匹配」的规则。选项来自通用规则配置
 * `speech-rules.json` 的 `localServices`，模型名复用 `models` 以免出现第二份默认值。
 * 详见 docs/detailed-design.md「语音服务接入设置」。
 */

type RawLocalService = {
  id: string
  label: string
  endpoint: string
  transport: SpeechTransport
  engines?: AsrEngine[]
  voices?: "gateway" | "elevenlabs" | "fishaudio"
  modelSource?: "localApi" | "fishAudio"
}

export type LocalServiceOption = Omit<RawLocalService, "modelSource"> & { model: string }

export type LocalServiceConfig = {
  version: 1
  /** serviceId -> 该服务上次使用的识别引擎 */
  asrEngines: Record<string, string>
  /** serviceId -> 该服务上次使用的音色（本机网关音色值或接口音色名） */
  ttsVoices: Record<string, string>
}

export const localServiceConfigStorageKey = "moss:speech-local-config:v1"

export const defaultLocalServiceConfig: LocalServiceConfig = {
  version: 1,
  asrEngines: {},
  ttsVoices: {},
}

const rawCatalog = speechRules.localServices as unknown as {
  asr: RawLocalService[]
  tts: RawLocalService[]
}

function resolveModel(service: SpeechService, option: RawLocalService): string {
  if (!option.modelSource) {
    return ""
  }
  const group = speechRules.models[option.modelSource]
  return service === "asr" ? group.asr : group.tts
}

export function getLocalServiceOptions(service: SpeechService): LocalServiceOption[] {
  return rawCatalog[service].map((option) => {
    const { modelSource: _modelSource, ...rest } = option
    return { ...rest, model: resolveModel(service, option) }
  })
}

export function getDefaultLocalService(service: SpeechService): LocalServiceOption {
  return getLocalServiceOptions(service)[0]
}

export function getLocalService(service: SpeechService, id: string): LocalServiceOption {
  return (
    getLocalServiceOptions(service).find((option) => option.id === id) ??
    getDefaultLocalService(service)
  )
}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, "")
}

/** 只在地址与清单完全一致时认作某个本机服务；自建或公网地址返回 null。 */
export function matchLocalService(
  service: SpeechService,
  endpoint: string,
): LocalServiceOption | null {
  const normalized = normalizeEndpoint(endpoint)
  if (!normalized) {
    return null
  }
  return (
    getLocalServiceOptions(service).find(
      (option) => normalizeEndpoint(option.endpoint) === normalized,
    ) ?? null
  )
}

/**
 * 由当前配置反推所选本机服务。空地址是合法的（沿用环境变量默认值），此时 ASR
 * 用识别引擎区分本机 ASR 服务与 FunASR 外部服务；未知地址回退到首个本机服务。
 */
export function resolveLocalService(
  service: SpeechService,
  endpoint: string,
  engine?: AsrEngine,
): LocalServiceOption {
  const matched = matchLocalService(service, endpoint)
  if (matched) {
    return matched
  }
  const options = getLocalServiceOptions(service)
  if (!normalizeEndpoint(endpoint) && service === "asr" && engine === "funasr") {
    return options.find((option) => option.id === "funasr") ?? options[0]
  }
  return options[0]
}

export function getAsrEngineOptionsForService(option: LocalServiceOption) {
  if (!option.engines?.length) {
    return []
  }
  return asrEngineOptions.filter((item) => option.engines?.includes(item.value))
}

/** 按服务过滤后的识别引擎；保存值或当前值不合法时回退到该服务自己的默认值。 */
export function resolveEngineForService(
  option: LocalServiceOption,
  saved: string | undefined,
  current: AsrEngine,
): AsrEngine | null {
  const allowed = getAsrEngineOptionsForService(option)
  if (!allowed.length) {
    return null
  }
  if (saved && allowed.some((item) => item.value === saved)) {
    return saved as AsrEngine
  }
  if (allowed.some((item) => item.value === current)) {
    return current
  }
  return allowed.some((item) => item.value === defaultAsrEngine)
    ? defaultAsrEngine
    : (allowed[0].value as AsrEngine)
}

const gatewayVoiceValues = new Set(ttsVoiceOptions.map((option) => option.value))

/** 本机 TTS 网关音色按服务独立回退，绝不把接口音色名当作网关音色使用。 */
export function resolveGatewayVoiceForService(
  saved: string | undefined,
  current: string,
): string {
  if (saved && gatewayVoiceValues.has(saved)) {
    return saved
  }
  if (gatewayVoiceValues.has(current)) {
    return current
  }
  return getSelectedVoiceValue(defaultTtsConfig)
}

export function parseLocalServiceConfig(value: string | null): LocalServiceConfig {
  if (!value) {
    return defaultLocalServiceConfig
  }
  try {
    const parsed = JSON.parse(value) as Partial<LocalServiceConfig>
    const asrEngines: Record<string, string> = {}
    const ttsVoices: Record<string, string> = {}
    for (const [id, engine] of Object.entries(parsed.asrEngines ?? {})) {
      if (
        typeof id === "string" &&
        typeof engine === "string" &&
        asrEngineOptions.some((option) => option.value === engine)
      ) {
        asrEngines[id] = engine
      }
    }
    for (const [id, voice] of Object.entries(parsed.ttsVoices ?? {})) {
      if (typeof id === "string" && typeof voice === "string" && voice.length <= 120) {
        ttsVoices[id] = voice
      }
    }
    return { version: 1, asrEngines, ttsVoices }
  } catch {
    return defaultLocalServiceConfig
  }
}

export type LocalServiceSelectionInput = {
  service: SpeechService
  option: LocalServiceOption
  previousId: string
  current: SpeechEndpoint
  engine: AsrEngine
  gatewayVoice: string
  saved: LocalServiceConfig
}

export type LocalServiceSelection = {
  /** 写入 moss:speech-config:v1 的字段补丁 */
  patch: Partial<SpeechEndpoint>
  /** 写入 moss:speech-local-config:v1 的完整配置 */
  saved: LocalServiceConfig
  /** 需要同步给对话页当前生效引擎的值；null 表示该服务没有识别引擎字段 */
  engine: AsrEngine | null
  /** 需要同步给对话页当前生效音色的值；null 表示音色走接口音色字段 */
  gatewayVoice: string | null
}

/**
 * 选择本机服务时一次性完成：保存离开服务的值、恢复目标服务的值、对齐接入方式与
 * 模型，并给出要同步给对话页的当前生效引擎/音色。地址只允许来自选项清单。
 */
export function buildLocalServiceSelection(
  input: LocalServiceSelectionInput,
): LocalServiceSelection {
  const { service, option, previousId, current, engine, gatewayVoice, saved } = input
  const nextSaved: LocalServiceConfig = {
    version: 1,
    asrEngines: { ...saved.asrEngines },
    ttsVoices: { ...saved.ttsVoices },
  }
  const previous = getLocalService(service, previousId)

  if (service === "asr") {
    const allowed = getAsrEngineOptionsForService(previous)
    if (allowed.some((item) => item.value === engine)) {
      nextSaved.asrEngines[previousId] = engine
    }
  } else {
    if (previous.voices === "gateway" && gatewayVoiceValues.has(gatewayVoice)) {
      nextSaved.ttsVoices[previousId] = gatewayVoice
    } else if (previous.voices && current.voice) {
      nextSaved.ttsVoices[previousId] = current.voice
    }
  }

  const patch: Partial<SpeechEndpoint> = {
    // 本机流式/网关服务留空以沿用环境变量默认值；本机适配器写入清单里的地址。
    endpoint: option.transport === "api" ? option.endpoint : "",
    transport: option.transport,
    model: option.model,
    // 接口音色也按服务独立保存/恢复，避免把 5583 的 voice ID 带到 5584。
    voice: option.transport === "api" ? (nextSaved.ttsVoices[option.id] ?? "") : "",
  }

  const nextEngine =
    service === "asr"
      ? resolveEngineForService(option, nextSaved.asrEngines[option.id], engine)
      : null
  const nextGatewayVoice =
    service === "tts" && option.voices === "gateway"
      ? resolveGatewayVoiceForService(nextSaved.ttsVoices[option.id], gatewayVoice)
      : null

  if (nextEngine) {
    nextSaved.asrEngines[option.id] = nextEngine
  }
  if (nextGatewayVoice) {
    nextSaved.ttsVoices[option.id] = nextGatewayVoice
  }

  return { patch, saved: nextSaved, engine: nextEngine, gatewayVoice: nextGatewayVoice }
}
