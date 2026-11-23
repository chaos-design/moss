import { type AiProviderConfig, getAiProviderConfig } from "@/lib/ai-provider"
import { isValidModelEndpoint } from "@/lib/model-config"
import type { ModelConfigEnvelope } from "@/lib/model-config-envelope"

export type BrowserModelConfig = {
  apiKey: string
  baseUrl: string
  model: string
  apiType: "anthropic-messages" | "chat-completions" | "custom"
}

// Production allowlists BYOK base URLs by exact hostname. Ship the mainstream public inference
// hosts so learners can bring their own key without operator setup; anything else must be added
// through AI_ALLOWED_BROWSER_MODEL_HOSTS (comma-separated exact hostnames, no wildcards). Private,
// loopback, and link-local hosts stay rejected by isValidModelEndpoint regardless of this list.
const defaultBrowserModelHosts = [
  "api.anthropic.com",
  "api.baichuan-ai.com",
  "api.deepseek.com",
  "api.fireworks.ai",
  "api.groq.com",
  "api.hunyuan.cloud.tencent.com",
  "api.lingyiwanwu.com",
  "api.minimax.chat",
  "api.mistral.ai",
  "api.moonshot.cn",
  "api.openai.com",
  "api.siliconflow.cn",
  "api.stepfun.com",
  "api.together.xyz",
  "api.x.ai",
  "api.z.ai",
  "ark.cn-beijing.volces.com",
  "dashscope.aliyuncs.com",
  "generativelanguage.googleapis.com",
  "open.bigmodel.cn",
  "openrouter.ai",
]

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

/**
 * 推理配置的唯一解析入口：服务端 AI_* 环境变量是默认来源，浏览器 BYOK 配置只在服务端
 * 未配置时回退。`usingClientConfig` 表示实际使用的来源，供鉴权与限流判定，避免客户端带了
 * 配置就绕过门槛、实际却仍走服务端配置。
 */
export function resolveProviderConfig(clientModelConfig?: BrowserModelConfig): {
  providerConfig: AiProviderConfig | null
  usingClientConfig: boolean
} {
  const serverConfig = getAiProviderConfig()
  if (serverConfig) {
    return { providerConfig: serverConfig, usingClientConfig: false }
  }
  return {
    providerConfig: clientModelConfig ? toProviderConfig(clientModelConfig) : null,
    usingClientConfig: Boolean(clientModelConfig),
  }
}
