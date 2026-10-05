import type { SpeechEndpoint } from "@/lib/speech-config"

export class SpeechApiClientError extends Error {
  readonly unavailable: boolean

  constructor(message: string, unavailable = false) {
    super(message)
    this.name = "SpeechApiClientError"
    this.unavailable = unavailable
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

function isUnavailableStatus(status: number) {
  return status === 502 || status === 503 || status === 504
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
