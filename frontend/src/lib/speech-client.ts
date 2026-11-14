import type { SpeechEndpoint } from "@/lib/speech-config"

export class SpeechApiClientError extends Error {
  readonly unavailable: boolean
  /** 触发该错误的 HTTP 状态码；网络层失败（fetch 抛错）没有状态码。 */
  readonly status?: number

  constructor(message: string, unavailable = false, status?: number) {
    super(message)
    this.name = "SpeechApiClientError"
    this.unavailable = unavailable
    this.status = status
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: { message?: string } }
    return payload.error?.message?.trim() || fallback
  } catch {
    return fallback
  }
}

// 401/402 与 5xx 一样属于「这条链路现在不可用」：凭据失效或余额不足时仍应回退浏览器识别，
// 而不是把学习者挡在对话之外。诊断信息由设置页的测试入口负责展示。
function isUnavailableStatus(status: number) {
  return status === 401 || status === 402 || status === 502 || status === 503 || status === 504
}

/** 5xx 与网络瞬断可自动重试；4xx（参数 / 凭据 / 限流）重试无意义，直接亮重试按钮。 */
export function isRetryableRecognitionFailure(error: unknown) {
  if (!(error instanceof SpeechApiClientError)) {
    return false
  }
  return error.status === undefined || error.status >= 500
}

async function blobToBase64(blob: Blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < buffer.length; index += chunkSize) {
    binary += String.fromCharCode(...buffer.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

// Routes through the app's own endpoint so a browser-supplied API key and endpoint never need
// third-party CORS support, and so upstream failures share one error contract.
export async function transcribeSpeechAudio(input: {
  endpoint: SpeechEndpoint
  audio: Blob
  language?: string
  signal?: AbortSignal
}) {
  const audioBase64 = await blobToBase64(input.audio)
  let response: Response
  try {
    response = await fetch("/api/speech/asr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64,
        endpoint: {
          apiKey: input.endpoint.apiKey,
          endpoint: input.endpoint.endpoint,
          model: input.endpoint.model,
        },
        language: input.language,
        mimeType: input.audio.type || "audio/webm",
      }),
      signal: input.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error
    }
    throw new SpeechApiClientError("无法连接语音识别服务", true)
  }

  if (!response.ok) {
    throw new SpeechApiClientError(
      await readErrorMessage(response, "语音识别接口暂时不可用，请稍后重试。"),
      isUnavailableStatus(response.status),
      response.status,
    )
  }

  try {
    const payload = (await response.json()) as { data?: { text?: unknown } }
    const text = payload.data?.text
    return { text: typeof text === "string" ? text.trim() : "" }
  } catch {
    throw new SpeechApiClientError("语音识别接口返回了无效结果。")
  }
}

export function supportsBrowserSpeechRecognition() {
  if (typeof window === "undefined") {
    return false
  }
  const scope = window as Window & {
    SpeechRecognition?: unknown
    webkitSpeechRecognition?: unknown
  }
  return Boolean(scope.SpeechRecognition || scope.webkitSpeechRecognition)
}
