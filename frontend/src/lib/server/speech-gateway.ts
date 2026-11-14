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

// 「无法连接」的提示要指出该启动哪个服务：本机端口与 pnpm 命令一一对应，
// 端口号取自规则表，避免提示文案与文档漂移。非本机地址返回空串，提示保持通用。
function localStartCommand(endpoint: string): string {
  let port = ""
  try {
    port = new URL(endpoint).port
  } catch {
    return ""
  }
  if (port === String(speechRules.services.localApi.port)) {
    return "pnpm elevenlabs:start"
  }
  if (port === String(speechRules.services.fishAudio.port)) {
    return "pnpm fishaudio:start"
  }
  if (port === String(speechRules.services.asr.port)) {
    return "pnpm asr:start"
  }
  if (port === String(speechRules.services.ttsGateway.port)) {
    return "pnpm tts:start"
  }
  return ""
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

type UpstreamFailure = {
  status: number
  code: string
  reason: string
}

/**
 * 还原上游失败的本来含义。
 *
 * 本机 5583/5584 适配器把上游的凭据、余额、限流和超时都包成 502，如果网关再统一压成
 * 502，学习者只会看到「接口返回 502」而无法判断该改密钥、充值还是等一会儿。这里按上游
 * 状态码与错误码分流：诊断结果给出可执行的原因，客户端再按状态决定是否降级。
 */
function classifyUpstreamFailure(
  service: SpeechService,
  upstreamStatus: number,
  upstreamCode: string,
): UpstreamFailure {
  const noun = service === "asr" ? "语音识别" : "语音合成"
  const code = upstreamCode.toLowerCase()
  if (upstreamStatus === 402 || code.includes("payment_required")) {
    return {
      status: 402,
      code: "speech_payment_required",
      reason: `${noun}服务的上游账户余额不足，请改用免费模型或先充值。`,
    }
  }
  if (
    upstreamStatus === 401 ||
    upstreamStatus === 403 ||
    /unauthor|invalid_api_key|authentication|invalid_token/.test(code)
  ) {
    return {
      status: 401,
      code: "speech_credentials_invalid",
      reason: `${noun}服务的上游凭据无效，请检查服务端 API Key 是否完整有效。`,
    }
  }
  if (code.includes("not_configured")) {
    return {
      status: 503,
      code: "speech_not_configured",
      reason: `${noun}服务尚未配置上游密钥。`,
    }
  }
  if (upstreamStatus === 429 || code.includes("rate_limited")) {
    return {
      status: 429,
      code: "speech_rate_limited",
      reason: `${noun}服务请求过于频繁，请稍后重试。`,
    }
  }
  if (upstreamStatus === 504 || code.includes("timeout")) {
    return {
      status: 504,
      code: "speech_timeout",
      reason: `${noun}服务响应超时，请稍后重试。`,
    }
  }
  if (upstreamStatus === 503 || code.includes("unreachable")) {
    return {
      status: 503,
      code: "speech_unavailable",
      reason: `${noun}服务暂时不可用，请确认服务已启动且网络或代理可达。`,
    }
  }
  if (
    [400, 404, 409, 422].includes(upstreamStatus) ||
    code.includes("request_rejected") ||
    code.startsWith("invalid_") ||
    code.includes("unsupported_")
  ) {
    return {
      status: 400,
      code: "speech_request_rejected",
      reason: `${noun}服务拒绝了请求参数，请检查模型、音色与音频格式。`,
    }
  }
  return {
    status: 502,
    code: "speech_upstream_error",
    reason: `${noun}服务返回 ${upstreamStatus}，请检查接口地址与密钥。`,
  }
}

async function describeUpstreamFailure(service: SpeechService, response: Response) {
  const upstream = await extractUpstreamError(response)
  const failure = classifyUpstreamFailure(service, response.status, upstream.code ?? "")
  // 上游状态码与错误码一起回传：设置页据此给出下一步动作，学习者仍看到完整可读的句子。
  const detail = [upstream.code ?? null, upstream.detail ?? null].filter(Boolean).join("，")
  const message = `${failure.reason}（上游 ${response.status}${detail ? `，${detail}` : ""}）`
  return new SpeechGatewayError(failure.code, message, failure.status, true)
}

export async function transcribeSpeechAudio(input: {
  endpoint: SpeechApiEndpoint
  audio: ArrayBuffer
  mimeType: string
  language?: string
}) {
  const form = new FormData()
  // 文件扩展名与实际容器保持一致：上游会按文件名/类型判断音频格式。
  const fileExtension = input.mimeType.includes("wav")
    ? "wav"
    : input.mimeType.includes("mp4")
      ? "m4a"
      : input.mimeType.includes("ogg")
        ? "ogg"
        : "webm"
  form.append(
    "file",
    new Blob([input.audio], { type: input.mimeType || "audio/webm" }),
    `speech.${fileExtension}`,
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
    const startCommand = localStartCommand(input.endpoint.endpoint)
    throw new SpeechGatewayError(
      "speech_endpoint_unreachable",
      `无法连接语音识别接口（${input.endpoint.endpoint}），请确认服务已启动${
        startCommand ? `；本机服务先运行 ${startCommand}` : ""
      }，或改用浏览器识别。`,
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
    const startCommand = localStartCommand(input.endpoint.endpoint)
    throw new SpeechGatewayError(
      "speech_endpoint_unreachable",
      `无法连接语音合成接口（${input.endpoint.endpoint}），请确认服务已启动${
        startCommand ? `；本机服务先运行 ${startCommand}` : ""
      }，或改用浏览器合成。`,
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
