export type AiProviderApiType = "anthropic-messages" | "chat-completions" | "custom"

export type AiProviderConfig = {
  apiKey: string
  baseUrl: string
  model: string
  apiType: AiProviderApiType
  embeddingModel?: string
}

export type AiChatMessage = {
  role: "assistant" | "system" | "user"
  content: string
}

function normalizeEnvironmentValue(value: string | undefined) {
  const normalized = value?.trim()
  return normalized || null
}

function parseAiProviderApiType(value: string | undefined, baseUrl: string): AiProviderApiType {
  if (value === "anthropic-messages") {
    return "anthropic-messages"
  }
  if (value === "chat-completions") {
    return "chat-completions"
  }
  return /anthropic\.com/i.test(baseUrl) ? "anthropic-messages" : "chat-completions"
}

export function getAiProviderConfig(): AiProviderConfig | null {
  const apiKey = normalizeEnvironmentValue(process.env.AI_API_KEY)
  const baseUrl = normalizeEnvironmentValue(process.env.AI_BASE_URL)
  const model =
    normalizeEnvironmentValue(process.env.AI_MODEL_NAME) ??
    normalizeEnvironmentValue(process.env.AI_MODEL)
  const embeddingModel = normalizeEnvironmentValue(process.env.AI_EMBEDDING_MODEL)

  if (!apiKey || !baseUrl || !model) {
    return null
  }

  return {
    apiKey,
    baseUrl,
    model,
    apiType: parseAiProviderApiType(process.env.AI_API_TYPE, baseUrl),
    ...(embeddingModel ? { embeddingModel } : {}),
  }
}

/**
 * Carries the upstream HTTP status so route handlers can tell a provider quota or auth failure
 * apart from a provider being unreachable, without leaking upstream response details to learners.
 */
export class AiProviderStatusError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`AI provider returned ${status}`)
    this.name = "AiProviderStatusError"
    this.status = status
  }
}

function getAiRequestUrl(config: AiProviderConfig) {
  const baseUrl = config.baseUrl.replace(/\/+$/, "")
  if (config.apiType === "custom") {
    return baseUrl
  }
  const suffix = config.apiType === "anthropic-messages" ? "/messages" : "/chat/completions"
  return baseUrl.endsWith(suffix) ? baseUrl : `${baseUrl}${suffix}`
}

function stringifyTextContent(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (!Array.isArray(value)) {
    return ""
  }
  return value
    .map((item) => {
      if (typeof item === "string") {
        return item
      }
      if (!item || typeof item !== "object") {
        return ""
      }
      const candidate = item as { text?: unknown; content?: unknown }
      return typeof candidate.text === "string"
        ? candidate.text
        : typeof candidate.content === "string"
          ? candidate.content
          : ""
    })
    .filter(Boolean)
    .join("\n")
}

function extractAiResponseText(value: unknown): string {
  if (!value || typeof value !== "object") {
    return ""
  }
  const payload = value as {
    choices?: Array<{
      text?: unknown
      message?: { content?: unknown }
      delta?: { content?: unknown }
    }>
    content?: unknown
    message?: { content?: unknown }
    output_text?: unknown
  }
  const choice = payload.choices?.[0]
  return (
    stringifyTextContent(choice?.message?.content) ||
    stringifyTextContent(choice?.text) ||
    stringifyTextContent(choice?.delta?.content) ||
    stringifyTextContent(payload.content) ||
    stringifyTextContent(payload.message?.content) ||
    stringifyTextContent(payload.output_text)
  ).trim()
}

function isReasoningTokenExhausted(value: unknown) {
  if (!value || typeof value !== "object") {
    return false
  }
  const choice = (
    value as {
      choices?: Array<{
        finish_reason?: unknown
        message?: { content?: unknown; reasoning_content?: unknown }
      }>
    }
  ).choices?.[0]
  return (
    choice?.finish_reason === "length" &&
    !stringifyTextContent(choice.message?.content) &&
    stringifyTextContent(choice.message?.reasoning_content).length > 0
  )
}

export async function requestAiText({
  config,
  messages,
  temperature,
  maxTokens = 1024,
  signal,
}: {
  config: AiProviderConfig
  messages: AiChatMessage[]
  temperature: number
  maxTokens?: number
  signal: AbortSignal
}) {
  const anthropic = config.apiType === "anthropic-messages"
  const systemContent = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
  const runtimeMarker = "\n## Runtime Context\n"
  const runtimeMarkerIndex = systemContent.indexOf(runtimeMarker)
  const cachedSystemContent =
    runtimeMarkerIndex >= 0 ? systemContent.slice(0, runtimeMarkerIndex) : systemContent
  const runtimeSystemContent =
    runtimeMarkerIndex >= 0 ? systemContent.slice(runtimeMarkerIndex + 1) : ""
  let anthropicMessages = messages.filter((message) => message.role !== "system")
  while (anthropicMessages[0]?.role === "assistant") {
    anthropicMessages = anthropicMessages.slice(1)
  }
  const sendRequest = (tokenBudget: number) =>
    fetch(getAiRequestUrl(config), {
      method: "POST",
      headers: anthropic
        ? {
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
          }
        : {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
      body: JSON.stringify(
        anthropic
          ? {
              model: config.model,
              max_tokens: tokenBudget,
              temperature,
              ...(systemContent
                ? {
                    system: [
                      {
                        type: "text",
                        text: cachedSystemContent,
                        cache_control: { type: "ephemeral" },
                      },
                      ...(runtimeSystemContent
                        ? [{ type: "text", text: runtimeSystemContent }]
                        : []),
                    ],
                  }
                : {}),
              messages: anthropicMessages.map((message) => ({
                role: message.role,
                content: message.content,
              })),
            }
          : {
              model: config.model,
              temperature,
              max_tokens: tokenBudget,
              messages,
            },
      ),
      redirect: "error",
      signal,
    })

  let response = await sendRequest(maxTokens)
  if (!response.ok) {
    throw new AiProviderStatusError(response.status)
  }

  let payload = await response.json()
  let text = extractAiResponseText(payload)
  if (!anthropic && !text && isReasoningTokenExhausted(payload)) {
    const retryTokenBudget = Math.min(8_192, Math.max(4_096, maxTokens * 3))
    response = await sendRequest(retryTokenBudget)
    if (!response.ok) {
      throw new AiProviderStatusError(response.status)
    }
    payload = await response.json()
    text = extractAiResponseText(payload)
  }
  if (!text) {
    throw new Error("AI provider returned an empty response")
  }

  return text
}
