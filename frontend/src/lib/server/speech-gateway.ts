import {
  getSpeechRequestUrl,
  isValidSpeechEndpoint,
  maximumSpeechApiKeyLength,
  maximumSpeechEndpointLength,
  maximumSpeechModelLength,
  type SpeechService,
} from "@/lib/speech-config"

export type SpeechApiEndpoint = {
  endpoint: string
  apiKey: string
  model: string
}

export const maximumAsrAudioBytes = 8_000_000
export const maximumTtsTextLength = 2_000
export const speechRequestTimeoutMs = 30_000

const allowedBrowserSpeechHosts = ["api.openai.com", "api.anthropic.com"]

export class SpeechGatewayError extends Error {
  readonly code: string
  readonly status: number
  readonly unavailable: boolean

  constructor(code: string, message: string, status: number, unavailable = false) {
    super(message)
    this.name = "SpeechGatewayError"
    this.code = code
    this.status = status
    this.unavailable = unavailable
  }
}

// Browser-supplied endpoints reach the server as request payloads, so they follow the same policy
// as browser-supplied inference endpoints: HTTPS remote hosts, loopback HTTP in development, and
// an explicit production allowlist.
export function isAllowedBrowserSpeechEndpoint(value: string) {
  if (!isValidSpeechEndpoint(value)) {
    return false
  }
  if (process.env.NODE_ENV !== "production") {
    return true
  }
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    const configured = (process.env.AI_ALLOWED_BROWSER_SPEECH_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
    return new Set([...allowedBrowserSpeechHosts, ...configured]).has(hostname)
  } catch {
    return false
  }
}

export function parseSpeechApiEndpoint(value: unknown): SpeechApiEndpoint | null {
  if (!value || typeof value !== "object") {
    return null
  }
  const candidate = value as Partial<SpeechApiEndpoint>
  if (
    typeof candidate.endpoint !== "string" ||
    typeof candidate.apiKey !== "string" ||
    typeof candidate.model !== "string"
  ) {
    return null
  }
  const endpoint = candidate.endpoint.trim()
  const apiKey = candidate.apiKey.trim()
  const model = candidate.model.trim()
  if (
    endpoint.length > maximumSpeechEndpointLength ||
    apiKey.length > maximumSpeechApiKeyLength ||
    model.length === 0 ||
    model.length > maximumSpeechModelLength ||
    !isAllowedBrowserSpeechEndpoint(endpoint)
  ) {
    return null
  }
  return { endpoint, apiKey, model }
}

function buildHeaders(apiKey: string, extra?: Record<string, string>) {
  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...extra,
  }
}

function describeUpstreamFailure(service: SpeechService, response: Response) {
  return new SpeechGatewayError(
    "speech_upstream_error",
    service === "asr"
      ? `语音识别接口返回 ${response.status}，请检查接口地址与密钥。`
      : `语音合成接口返回 ${response.status}，请检查接口地址与密钥。`,
    502,
    true,
  )
}

export async function transcribeSpeechAudio(input: {
  endpoint: SpeechApiEndpoint
  audio: ArrayBuffer
  mimeType: string
  language?: string
}) {
  const form = new FormData()
  form.append(
    "file",
    new Blob([input.audio], { type: input.mimeType || "audio/webm" }),
    "speech.webm",
  )
  form.append("model", input.endpoint.model)
  form.append("response_format", "json")
  if (input.language) {
    form.append("language", input.language)
  }

  let response: Response
  try {
    response = await fetch(getSpeechRequestUrl("asr", input.endpoint.endpoint), {
      method: "POST",
      headers: buildHeaders(input.endpoint.apiKey),
      body: form,
      signal: AbortSignal.timeout(speechRequestTimeoutMs),
    })
  } catch {
    throw new SpeechGatewayError(
      "speech_endpoint_unreachable",
      "无法连接语音识别接口，请确认服务已启动或改用其他识别方式。",
      502,
      true,
    )
  }

  if (!response.ok) {
    throw describeUpstreamFailure("asr", response)
  }

  let text: unknown
  try {
    const payload = (await response.json()) as { text?: unknown }
    text = payload.text
  } catch {
    throw new SpeechGatewayError(
      "speech_invalid_response",
      "语音识别接口返回了无效结果。",
      502,
      true,
    )
  }
  if (typeof text !== "string" || !text.trim()) {
    return { text: "" }
  }
  return { text: text.trim() }
}

export async function synthesizeSpeechAudio(input: {
  endpoint: SpeechApiEndpoint
  text: string
  voice: string
  speed: number
  format?: string
}) {
  let response: Response
  try {
    response = await fetch(getSpeechRequestUrl("tts", input.endpoint.endpoint), {
      method: "POST",
      headers: buildHeaders(input.endpoint.apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: input.endpoint.model,
        input: input.text,
        voice: input.voice,
        speed: input.speed,
        response_format: input.format ?? "mp3",
      }),
      signal: AbortSignal.timeout(speechRequestTimeoutMs),
    })
  } catch {
    throw new SpeechGatewayError(
      "speech_endpoint_unreachable",
      "无法连接语音合成接口，请确认服务已启动或改用系统语音。",
      502,
      true,
    )
  }

  if (!response.ok) {
    throw describeUpstreamFailure("tts", response)
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.startsWith("audio/")) {
    throw new SpeechGatewayError(
      "speech_invalid_response",
      "语音合成接口返回了无效音频。",
      502,
      true,
    )
  }
  return { audio: await response.arrayBuffer(), contentType }
}
