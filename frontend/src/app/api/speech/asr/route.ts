import { NextResponse } from "next/server"
import { isRateLimited } from "@/lib/server/rate-limit"
import {
  maximumAsrAudioBytes,
  parseSpeechApiEndpoint,
  SpeechGatewayError,
  transcribeSpeechAudio,
} from "@/lib/server/speech-gateway"

const maximumRequestBytes = 12_000_000

type TranscriptionRequest = {
  endpoint: unknown
  audioBase64: unknown
  mimeType?: unknown
  language?: unknown
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status })
}

function decodeAudio(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null
  }
  try {
    return Buffer.from(value, "base64")
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > maximumRequestBytes) {
    return errorResponse("request_too_large", "单段语音不能超过 8 MB。", 413)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse("invalid_json", "请求体必须是有效 JSON。", 400)
  }

  const candidate = (body ?? {}) as TranscriptionRequest
  const endpoint = parseSpeechApiEndpoint(candidate.endpoint)
  if (!endpoint) {
    return errorResponse(
      "invalid_speech_endpoint",
      "语音识别接口地址或模型配置不正确，请重新填写。",
      400,
    )
  }

  const audio = decodeAudio(candidate.audioBase64)
  if (!audio || audio.byteLength === 0) {
    return errorResponse("invalid_audio", "没有收到可识别的语音数据。", 400)
  }
  if (audio.byteLength > maximumAsrAudioBytes) {
    return errorResponse("request_too_large", "单段语音不能超过 8 MB。", 413)
  }

  if (
    isRateLimited({
      key: `speech-asr:${endpoint.endpoint}`,
      limit: 120,
      windowMs: 60_000,
    })
  ) {
    return errorResponse("rate_limited", "语音识别请求过于频繁，请稍后再试。", 429)
  }

  const language = typeof candidate.language === "string" ? candidate.language.trim() : ""
  const mimeType = typeof candidate.mimeType === "string" ? candidate.mimeType : "audio/webm"

  try {
    const result = await transcribeSpeechAudio({
      endpoint,
      audio: audio.buffer.slice(
        audio.byteOffset,
        audio.byteOffset + audio.byteLength,
      ) as ArrayBuffer,
      language: language || undefined,
      mimeType,
    })
    return NextResponse.json({ data: { text: result.text } })
  } catch (error) {
    if (error instanceof SpeechGatewayError) {
      return errorResponse(error.code, error.message, error.status)
    }
    return errorResponse("asr_failed", "语音识别暂时不可用，请稍后重试。", 502)
  }
}
