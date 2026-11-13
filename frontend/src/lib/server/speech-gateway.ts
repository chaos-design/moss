import {
  getSpeechRequestUrl,
  isValidSpeechEndpoint,
  maximumSpeechApiKeyLength,
  maximumSpeechEndpointLength,
  maximumSpeechModelLength,
  type SpeechService,
} from "@/lib/speech-config"
import { speechRules } from "@/lib/speech-rules"

export type SpeechApiEndpoint = {
  endpoint: string
  apiKey: string
  model: string
}

export const maximumAsrAudioBytes = speechRules.limits.maxAsrAudioBytes
export const maximumTtsTextLength = speechRules.limits.maxTtsTextLength
export const speechRequestTimeoutMs = speechRules.limits.speechRequestTimeoutMs

// Loopback hosts are built into the production allowlist so /api/speech/* can proxy to a speech
// gateway running beside the app server. Non-loopback private-network hosts stay blocked.
const allowedBrowserSpeechHosts = [
  "api.openai.com",
  "api.anthropic.com",
  ...speechRules.loopbackHosts,
]

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
// as browser-supplied inference endpoints: HTTPS remote hosts on the production allowlist, plus
// loopback hosts for a local ASR/TTS gateway. Loopback works in production builds too, so a
// self-hosted workspace can use `pnpm start` with the local speech service.
export function isAllowedBrowserSpeechEndpoint(value: string) {
  if (!isValidSpeechEndpoint(value)) {
    return false
  }
  if (process.env.NODE_ENV !== "production") {
    return true
  }
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, "")
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
  // 模型是否必填由服务端决定：本机适配器与多数自建网关有自己的默认模型，
  // 空模型按原样转发（字段省略），由上游给出明确的"需要模型"错误。
  const model = candidate.model.trim()
  if (
    endpoint.length > maximumSpeechEndpointLength ||
    apiKey.length > maximumSpeechApiKeyLength ||
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

// 提取上游（含本机适配器）JSON 错误体里的 code 与简短原因，便于设置页诊断可定位；
// 只取字符串字段并截断，避免回传大段内容或泄漏密钥。
async function extractUpstreamError(response: Response): Promise<{
  code?: string
  detail?: string
}> {
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase()
  if (!contentType.startsWith("application/json")) {
    return {}
  }
  try {
    const payload = (await response.json()) as { error?: unknown }
    const errorBody = payload.error
    let code: string | undefined
    let detail: string | undefined
    if (typeof errorBody === "string") {
      detail = errorBody.slice(0, 200)
    } else if (errorBody && typeof errorBody === "object") {
      const record = errorBody as Record<string, unknown>
      if (typeof record.code === "string" && record.code.trim()) {
        code = record.code.trim().slice(0, 64)
      }
      if (typeof record.message === "string" && record.message.trim()) {
        detail = record.message.trim().slice(0, 200)
      } else if (typeof record.detail === "string" && record.detail.trim()) {
        detail = record.detail.trim().slice(0, 200)
      }
    }
    return { code, detail }
  } catch {
    return {}
  }
}

async function describeUpstreamFailure(service: SpeechService, response: Response) {
  const base =
    service === "asr"
      ? `语音识别接口返回 ${response.status}，请检查接口地址与密钥。`
      : `语音合成接口返回 ${response.status}，请检查接口地址与密钥。`
  const upstream = await extractUpstreamError(response)
  const detail = [upstream.code ?? null, upstream.detail ?? null].filter(Boolean).join("，")
  const message = detail ? `${base}（${detail}）` : base
  return new SpeechGatewayError("speech_upstream_error", message, 502, true)
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
  // 空模型按契约省略，由上游适配器/服务选择自己的默认模型。
  if (input.endpoint.model) {
    form.append("model", input.endpoint.model)
  }
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
    throw await describeUpstreamFailure("asr", response)
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
        ...(input.endpoint.model ? { model: input.endpoint.model } : {}),
        input: input.text,
        ...(input.voice ? { voice: input.voice } : {}),
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
    throw await describeUpstreamFailure("tts", response)
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
