import { isValidModelEndpoint } from "@/lib/model-config"

// Speech services support three transports so the workspace stays usable without the local
// Python sidecars: the loopback WebSocket/HTTP services, an OpenAI-compatible HTTP API, or the
// browser's own Web Speech engines.
export type SpeechTransport = "api" | "browser" | "local"

export type SpeechService = "asr" | "tts"

export type SpeechEndpoint = {
  transport: SpeechTransport
  endpoint: string
  apiKey: string
  model: string
  // Synthesis voice understood by an OpenAI-compatible endpoint. Ignored by the other transports.
  voice?: string
}

export type SpeechConfig = {
  version: 1
  asr: SpeechEndpoint
  tts: SpeechEndpoint
}

export const speechConfigStorageKey = "moss:speech-config:v1"
export const speechTransports: readonly SpeechTransport[] = ["local", "api", "browser"]

export const speechTransportLabels: Record<SpeechTransport, string> = {
  local: "本机服务",
  api: "HTTP API",
  browser: "浏览器引擎",
}

export const defaultSpeechConfig: SpeechConfig = {
  version: 1,
  asr: { transport: "local", endpoint: "", apiKey: "", model: "", voice: "" },
  tts: { transport: "local", endpoint: "", apiKey: "", model: "", voice: "" },
}

export const apiVoicePrefix = "api:"

export type SpeechVoiceOption = {
  value: string
  label: string
  name: string
  language: string
  quality: string
  voice: string
}

// Names accepted by common OpenAI-compatible speech endpoints. Free text stays available because
// self-hosted gateways frequently rename or add voices.
export const apiTtsVoiceOptions: SpeechVoiceOption[] = [
  {
    value: `${apiVoicePrefix}alloy`,
    label: "alloy",
    name: "Alloy",
    language: "英文中性",
    quality: "API 音色",
    voice: "alloy",
  },
  {
    value: `${apiVoicePrefix}echo`,
    label: "echo",
    name: "Echo",
    language: "英文男声",
    quality: "API 音色",
    voice: "echo",
  },
  {
    value: `${apiVoicePrefix}fable`,
    label: "fable",
    name: "Fable",
    language: "英文男声",
    quality: "API 音色",
    voice: "fable",
  },
  {
    value: `${apiVoicePrefix}onyx`,
    label: "onyx",
    name: "Onyx",
    language: "英文男声",
    quality: "API 音色",
    voice: "onyx",
  },
  {
    value: `${apiVoicePrefix}nova`,
    label: "nova",
    name: "Nova",
    language: "英文女声",
    quality: "API 音色",
    voice: "nova",
  },
  {
    value: `${apiVoicePrefix}shimmer`,
    label: "shimmer",
    name: "Shimmer",
    language: "英文女声",
    quality: "API 音色",
    voice: "shimmer",
  },
]

export const defaultApiTtsVoice = "alloy"

export function getSelectedApiVoiceValue(endpoint: SpeechEndpoint) {
  const voice = endpoint.voice || defaultApiTtsVoice
  return `${apiVoicePrefix}${voice}`
}

export function parseApiVoiceValue(value: string) {
  return value.startsWith(apiVoicePrefix) ? value.slice(apiVoicePrefix.length) : value
}

const defaultAsrApiEndpoint = "https://api.openai.com/v1"
const defaultTtsApiEndpoint = "https://api.openai.com/v1"
const defaultAsrApiModel = "whisper-1"
const defaultTtsApiModel = "tts-1"

export const maximumSpeechApiKeyLength = 400
export const maximumSpeechEndpointLength = 300
export const maximumSpeechModelLength = 120

function isSpeechTransport(value: unknown): value is SpeechTransport {
  return typeof value === "string" && speechTransports.includes(value as SpeechTransport)
}

function parseSpeechEndpoint(value: unknown): SpeechEndpoint {
  if (!value || typeof value !== "object") {
    return { transport: "local", endpoint: "", apiKey: "", model: "", voice: "" }
  }
  const candidate = value as Partial<SpeechEndpoint>
  return {
    transport: isSpeechTransport(candidate.transport) ? candidate.transport : "local",
    endpoint:
      typeof candidate.endpoint === "string" ? candidate.endpoint.trim().slice(0, 500) : "",
    apiKey:
      typeof candidate.apiKey === "string"
        ? candidate.apiKey.trim().slice(0, maximumSpeechApiKeyLength)
        : "",
    model:
      typeof candidate.model === "string"
        ? candidate.model.trim().slice(0, maximumSpeechModelLength)
        : "",
    voice: typeof candidate.voice === "string" ? candidate.voice.trim().slice(0, 120) : "",
  }
}

export function parseSpeechConfig(value: string | null): SpeechConfig {
  if (!value) {
    return defaultSpeechConfig
  }
  try {
    const parsed = JSON.parse(value) as { version?: unknown; asr?: unknown; tts?: unknown }
    return {
      version: 1,
      asr: parseSpeechEndpoint(parsed.asr),
      tts: parseSpeechEndpoint(parsed.tts),
    }
  } catch {
    return defaultSpeechConfig
  }
}

// Environment values provide public endpoint defaults only. Credentials are entered in the
// browser and stay in this one storage key.
export function getEnvironmentSpeechEndpoint(service: SpeechService): SpeechEndpoint {
  return {
    transport: "local",
    endpoint: "",
    apiKey: "",
    model:
      service === "asr"
        ? process.env.NEXT_PUBLIC_ASR_API_MODEL || defaultAsrApiModel
        : process.env.NEXT_PUBLIC_TTS_API_MODEL || defaultTtsApiModel,
    voice: "",
  }
}

export function getDefaultApiEndpoint(service: SpeechService) {
  const configured =
    service === "asr"
      ? process.env.NEXT_PUBLIC_ASR_API_URL
      : process.env.NEXT_PUBLIC_TTS_API_URL
  return (
    configured?.trim() || (service === "asr" ? defaultAsrApiEndpoint : defaultTtsApiEndpoint)
  ).replace(/\/+$/, "")
}

export function getDefaultLocalEndpoint(service: SpeechService) {
  const configured =
    service === "asr"
      ? process.env.NEXT_PUBLIC_ASR_SERVICE_URL
      : process.env.NEXT_PUBLIC_TTS_SERVICE_URL
  return (
    configured?.trim() ||
    (service === "asr" ? "ws://127.0.0.1:5580/v1/asr/stream" : "http://127.0.0.1:5578")
  )
}

// Fills empty fields from environment defaults so a stored partial config stays usable.
export function resolveSpeechEndpoint(
  config: SpeechEndpoint,
  service: SpeechService,
): SpeechEndpoint {
  const fallback = getEnvironmentSpeechEndpoint(service)
  return {
    transport: config.transport,
    endpoint:
      config.endpoint || (config.transport === "api" ? getDefaultApiEndpoint(service) : ""),
    apiKey: config.apiKey || fallback.apiKey,
    model: config.model || fallback.model,
    voice: config.voice || fallback.voice,
  }
}

export function resolveSpeechConfig(config: SpeechConfig): SpeechConfig {
  return {
    version: 1,
    asr: resolveSpeechEndpoint(config.asr, "asr"),
    tts: resolveSpeechEndpoint(config.tts, "tts"),
  }
}

// Reuses the inference endpoint policy: HTTPS for remote hosts, loopback HTTP in development.
export function isValidSpeechEndpoint(endpoint: string) {
  return isValidModelEndpoint(endpoint)
}

export function getSpeechRequestUrl(service: SpeechService, endpoint: string) {
  const baseUrl = endpoint.trim().replace(/\/+$/, "")
  const suffix = service === "asr" ? "/audio/transcriptions" : "/audio/speech"
  return baseUrl.endsWith(suffix) ? baseUrl : `${baseUrl}${suffix}`
}

export function describeSpeechTransport(service: SpeechService, transport: SpeechTransport) {
  if (transport === "browser") {
    return service === "asr" ? "浏览器语音识别" : "浏览器语音合成"
  }
  if (transport === "api") {
    return service === "asr" ? "HTTP 语音识别接口" : "HTTP 语音合成接口"
  }
  return service === "asr" ? "本机 ASR 服务" : "本机 TTS 服务"
}
