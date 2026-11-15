import {
  getSpeechRequestUrl,
  isLoopbackSpeechEndpoint,
  isValidSpeechEndpoint,
  maximumSpeechApiKeyLength,
  maximumSpeechEndpointLength,
  maximumSpeechModelLength,
  type SpeechService,
} from "@/lib/speech-config"
import { speechRules } from "@/lib/speech-rules"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { resolveSessionUser } from "@/lib/supabase/session"

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

// 回环代理只允许规则表里的语音服务端口：端口单一事实来源是规则表，换端口就能绕过限流键的
// 问题因此一起被堵住。侧车（5581/5582）私有于 TTS 网关，前端自身（5577）不在代理范围内。
const allowedLoopbackSpeechPorts = new Set(
  [
    speechRules.services.ttsGateway.port,
    speechRules.services.asr.port,
    speechRules.services.localApi.port,
    speechRules.services.fishAudio.port,
  ].map(String),
)

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
// loopback hosts for a local ASR/TTS gateway restricted to the rule-table speech ports. Loopback
// works in production builds too, so a self-hosted workspace can use `pnpm start` with the local
// speech service; unrestricted port access would turn the proxy into a local port scanner.
export function isAllowedBrowserSpeechEndpoint(value: string) {
  if (!isValidSpeechEndpoint(value)) {
    return false
  }
  if (process.env.NODE_ENV !== "production") {
    return true
  }
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
    if (speechRules.loopbackHosts.includes(hostname)) {
      return allowedLoopbackSpeechPorts.has(url.port)
    }
    const configured = (process.env.AI_ALLOWED_BROWSER_SPEECH_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
    return configured.includes(hostname) || allowedBrowserSpeechHosts.includes(hostname)
  } catch {
    return false
  }
}

// 限流键跟随请求者而不是请求体里的 endpoint：换端口、加 ./ 段都改变不了桶。登录用户按用户
// 分桶，匿名请求按来源 IP（网关会注入 x-forwarded-for / x-real-ip）分桶。
// "tts-test" 是诊断合成端点的独立桶（见 tts/test 路由），与正常合成配额分离。
export function speechRateLimitKey(
  request: Request,
  service: SpeechService | "tts-test",
  userId: string | null,
) {
  if (userId) {
    return `speech-${service}:${userId}`
  }
  const forwarded = request.headers.get("x-forwarded-for")
  const clientIp = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim()
  return `speech-${service}:${clientIp || "unknown"}`
}

export type LoopbackSpeechAccess =
  | { ok: true; userId: string | null }
  | { ok: false; error: SpeechGatewayError }

// 生产环境访问本机回环语音服务要求已登录会话：回环代理背后是部署主机自己的端口与适配器
// 配额，不应向匿名访客开放。未配置认证服务的自托管部署可以显式设置
// MOSS_ALLOW_ANONYMOUS_LOOPBACK_SPEECH=true 开启匿名访问（默认关闭，失败关闭）。
// 开发环境与公网 HTTPS 端点不受影响；登录用户的 id 同时供限流键复用，避免二次鉴权。
export async function authorizeLoopbackSpeech(endpoint: string): Promise<LoopbackSpeechAccess> {
  if (process.env.NODE_ENV !== "production" || !isLoopbackSpeechEndpoint(endpoint)) {
    return { ok: true, userId: null }
  }
  const client = await getSupabaseServerClient()
  if (!client) {
    if (process.env.MOSS_ALLOW_ANONYMOUS_LOOPBACK_SPEECH === "true") {
      return { ok: true, userId: null }
    }
    return {
      ok: false,
      error: new SpeechGatewayError(
        "speech_unauthorized",
        "本机回环语音服务要求登录，或由部署方显式开启匿名访问（MOSS_ALLOW_ANONYMOUS_LOOPBACK_SPEECH=true）。",
        401,
      ),
    }
  }
  const user = await resolveSessionUser(client)
  if (!user) {
    return {
      ok: false,
      error: new SpeechGatewayError(
        "speech_unauthorized",
        "使用本机回环语音服务前请先登录。",
        401,
      ),
    }
  }
  return { ok: true, userId: user.id }
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
