export type ModelProvider = "anthropic" | "custom" | "openai" | "openai-compatible"
export type ModelApiType = "anthropic-messages" | "chat-completions" | "custom"

export type LocalModelConfig = {
  version: 2
  enabled: boolean
  provider: ModelProvider
  apiType: ModelApiType
  endpoint: string
  model: string
  apiKey: string
}

export type SavedModelConfig = Omit<LocalModelConfig, "enabled" | "version"> & {
  id: string
  name: string
}

export type LocalModelConfigCollection = {
  version: 3
  activeConfigId: string | null
  configs: SavedModelConfig[]
}

export const modelConfigStorageKey = "moss:model-config:v1"

export const defaultModelConfig: LocalModelConfig = {
  version: 2,
  enabled: false,
  provider: "openai-compatible",
  apiType: "chat-completions",
  endpoint: "",
  model: "",
  apiKey: "",
}

export const defaultModelConfigCollection: LocalModelConfigCollection = {
  version: 3,
  activeConfigId: null,
  configs: [],
}

function parseLegacyModelConfig(value: unknown): LocalModelConfig | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const parsed = value as Partial<LocalModelConfig> & { version?: number }
  if (
    typeof parsed.provider !== "string" ||
    typeof parsed.model !== "string" ||
    typeof parsed.endpoint !== "string" ||
    typeof parsed.apiKey !== "string"
  ) {
    return null
  }

  return {
    version: 2,
    enabled: parsed.version === 2 ? Boolean(parsed.enabled) : true,
    provider: isModelProvider(parsed.provider) ? parsed.provider : defaultModelConfig.provider,
    apiType:
      parsed.apiType === "anthropic-messages" ||
      parsed.apiType === "chat-completions" ||
      parsed.apiType === "custom"
        ? parsed.apiType
        : parsed.provider === "anthropic"
          ? "anthropic-messages"
          : "chat-completions",
    endpoint: parsed.endpoint,
    model: parsed.model,
    apiKey: parsed.apiKey,
  }
}

function parseSavedModelConfig(value: unknown): SavedModelConfig | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const parsed = value as Partial<SavedModelConfig>
  if (
    typeof parsed.id !== "string" ||
    !parsed.id.trim() ||
    typeof parsed.name !== "string" ||
    typeof parsed.provider !== "string" ||
    !isModelProvider(parsed.provider) ||
    (parsed.apiType !== "anthropic-messages" &&
      parsed.apiType !== "chat-completions" &&
      parsed.apiType !== "custom") ||
    typeof parsed.endpoint !== "string" ||
    typeof parsed.model !== "string" ||
    typeof parsed.apiKey !== "string"
  ) {
    return null
  }

  return {
    id: parsed.id,
    name: parsed.name.trim() || parsed.model.trim() || "未命名配置",
    provider: parsed.provider,
    apiType: parsed.apiType,
    endpoint: parsed.endpoint,
    model: parsed.model,
    apiKey: parsed.apiKey,
  }
}

export function parseModelConfigCollection(value: string | null): LocalModelConfigCollection {
  if (!value) {
    return defaultModelConfigCollection
  }

  try {
    const parsed = JSON.parse(value) as {
      version?: number
      activeConfigId?: unknown
      configs?: unknown
    }
    if (parsed.version === 3 && Array.isArray(parsed.configs)) {
      const configs = parsed.configs
        .map(parseSavedModelConfig)
        .filter((config): config is SavedModelConfig => config !== null)
      const requestedActiveId =
        typeof parsed.activeConfigId === "string" ? parsed.activeConfigId : null
      const activeConfigId = configs.some((config) => config.id === requestedActiveId)
        ? requestedActiveId
        : null

      return { version: 3, activeConfigId, configs }
    }

    const legacyConfig = parseLegacyModelConfig(parsed)
    if (!legacyConfig) {
      return defaultModelConfigCollection
    }
    const migratedConfig: SavedModelConfig = {
      id: "migrated-default",
      name: legacyConfig.model.trim() || "默认配置",
      provider: legacyConfig.provider,
      apiType: legacyConfig.apiType,
      endpoint: legacyConfig.endpoint,
      model: legacyConfig.model,
      apiKey: legacyConfig.apiKey,
    }
    return {
      version: 3,
      activeConfigId: legacyConfig.enabled ? migratedConfig.id : null,
      configs: [migratedConfig],
    }
  } catch {
    return defaultModelConfigCollection
  }
}

export function toLocalModelConfig(config: SavedModelConfig, enabled = true): LocalModelConfig {
  return {
    version: 2,
    enabled,
    provider: config.provider,
    apiType: config.apiType,
    endpoint: config.endpoint,
    model: config.model,
    apiKey: config.apiKey,
  }
}

export function getActiveModelConfig(
  collection: LocalModelConfigCollection,
): LocalModelConfig | null {
  if (!collection.activeConfigId) {
    return null
  }
  const activeConfig = collection.configs.find(
    (config) => config.id === collection.activeConfigId,
  )
  return activeConfig ? toLocalModelConfig(activeConfig) : null
}

export function parseLocalModelConfig(value: string | null): LocalModelConfig {
  return getActiveModelConfig(parseModelConfigCollection(value)) ?? defaultModelConfig
}

export type ModelInferenceConfig = {
  apiKey: string
  baseUrl: string
  model: string
  apiType: ModelApiType
}

// Inference-only projection of the local model config. It is the single payload the client is
// allowed to forward to inference endpoints; the config is never otherwise sent to Supabase,
// logs, or unrelated APIs. Returns null when the config is incomplete or the endpoint is invalid.
export function getModelInferenceConfig(config: LocalModelConfig): ModelInferenceConfig | null {
  if (!isModelConfigComplete(config)) {
    return null
  }

  return {
    apiKey: config.apiKey.trim(),
    baseUrl: config.endpoint.trim().replace(/\/+$/, ""),
    model: config.model.trim(),
    apiType: config.apiType,
  }
}

export function getModelRequestUrl(endpoint: string, apiType: ModelApiType) {
  const baseUrl = endpoint.trim().replace(/\/+$/, "")
  if (!baseUrl) {
    return ""
  }

  if (apiType === "custom") {
    return baseUrl
  }
  const suffix = apiType === "anthropic-messages" ? "/messages" : "/chat/completions"
  return baseUrl.endsWith(suffix) ? baseUrl : `${baseUrl}${suffix}`
}

function parseIpv4Address(hostname: string) {
  const parts = hostname.split(".")
  if (parts.length !== 4) {
    return null
  }
  const octets = parts.map(Number)
  return octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? octets
    : null
}

export function isPrivateModelEndpointHostname(hostname: string) {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "metadata" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true
  }

  const ipv4 = parseIpv4Address(normalized)
  if (ipv4) {
    const [first = 0, second = 0] = ipv4
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    )
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("::ffff:")
  )
}

export function isValidModelEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint)
    if (url.username || url.password) {
      return false
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
    const localDevelopmentEndpoint =
      process.env.NODE_ENV !== "production" &&
      (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")

    return (
      localDevelopmentEndpoint ||
      (url.protocol === "https:" && !isPrivateModelEndpointHostname(hostname))
    )
  } catch {
    return false
  }
}

export function isModelConfigComplete(config: LocalModelConfig) {
  return Boolean(
    config.enabled &&
      config.model.trim() &&
      config.apiKey.trim() &&
      isValidModelEndpoint(config.endpoint),
  )
}

function isModelProvider(value: string): value is ModelProvider {
  return ["anthropic", "custom", "openai", "openai-compatible"].includes(value)
}
