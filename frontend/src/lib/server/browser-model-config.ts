import type { AiProviderConfig } from "@/lib/ai-provider"
import { isValidModelEndpoint } from "@/lib/model-config"
import type { ModelConfigEnvelope } from "@/lib/model-config-envelope"

export type BrowserModelConfig = {
  apiKey: string
  baseUrl: string
  model: string
  apiType: "anthropic-messages" | "chat-completions" | "custom"
}

const defaultBrowserModelHosts = ["api.anthropic.com", "api.openai.com"]

export function isAllowedBrowserModelEndpoint(value: string) {
  if (!isValidModelEndpoint(value)) {
    return false
  }
  if (process.env.NODE_ENV !== "production") {
    return true
  }

  try {
    const url = new URL(value)
    const configuredHosts = (process.env.AI_ALLOWED_BROWSER_MODEL_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
    return new Set([...defaultBrowserModelHosts, ...configuredHosts]).has(
      url.hostname.toLowerCase(),
    )
  } catch {
    return false
  }
}

export function isValidBrowserModelConfig(value: unknown): value is BrowserModelConfig {
  if (value === undefined) {
    return true
  }
  if (!value || typeof value !== "object") {
    return false
  }
  const config = value as Partial<BrowserModelConfig>
  return (
    typeof config.apiKey === "string" &&
    config.apiKey.trim().length > 0 &&
    config.apiKey.length <= 400 &&
    typeof config.baseUrl === "string" &&
    isAllowedBrowserModelEndpoint(config.baseUrl) &&
    typeof config.model === "string" &&
    config.model.trim().length > 0 &&
    config.model.length <= 200 &&
    (config.apiType === "anthropic-messages" ||
      config.apiType === "chat-completions" ||
      config.apiType === "custom")
  )
}

export function isValidModelConfigEnvelope(value: unknown): value is ModelConfigEnvelope {
  if (value === undefined) {
    return true
  }
  if (!value || typeof value !== "object") {
    return false
  }
  const envelope = value as Partial<ModelConfigEnvelope>
  return (
    envelope.version === 1 &&
    typeof envelope.keyId === "string" &&
    envelope.keyId.length > 0 &&
    envelope.keyId.length <= 64 &&
    typeof envelope.wrappedKey === "string" &&
    envelope.wrappedKey.length > 0 &&
    envelope.wrappedKey.length <= 512 &&
    typeof envelope.iv === "string" &&
    envelope.iv.length > 0 &&
    envelope.iv.length <= 32 &&
    typeof envelope.ciphertext === "string" &&
    envelope.ciphertext.length > 0 &&
    envelope.ciphertext.length <= 8_192
  )
}

export function toProviderConfig(modelConfig: BrowserModelConfig): AiProviderConfig {
  return {
    apiKey: modelConfig.apiKey,
    baseUrl: modelConfig.baseUrl,
    model: modelConfig.model,
    apiType: modelConfig.apiType,
  }
}
