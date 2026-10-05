import { NextResponse } from "next/server"
import { isRateLimited } from "@/lib/server/rate-limit"
import {
  maximumTtsTextLength,
  parseSpeechApiEndpoint,
  SpeechGatewayError,
  synthesizeSpeechAudio,
} from "@/lib/server/speech-gateway"

const maximumRequestBytes = 64_000
const allowedFormats = new Set(["mp3", "opus", "aac", "flac", "wav", "pcm"])

type SynthesisRequest = {
  endpoint: unknown
  text?: unknown
  voice?: unknown
  speed?: unknown
  format?: unknown
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status })
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > maximumRequestBytes) {
    return errorResponse("request_too_large", "单次合成内容过长。", 413)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse("invalid_json", "请求体必须是有效 JSON。", 400)
  }

  const candidate = (body ?? {}) as SynthesisRequest
  const endpoint = parseSpeechApiEndpoint(candidate.endpoint)
  if (!endpoint) {
    return errorResponse(
      "invalid_speech_endpoint",
      "语音合成接口地址或模型配置不正确，请重新填写。",
      400,
    )
  }

  const text = typeof candidate.text === "string" ? candidate.text.trim() : ""
  if (!text || text.length > maximumTtsTextLength) {
    return errorResponse("invalid_request", "合成文本为空或超出长度限制。", 400)
  }

  const voice = typeof candidate.voice === "string" ? candidate.voice.trim().slice(0, 120) : ""
  if (!voice) {
    return errorResponse("invalid_request", "请选择要使用的音色。", 400)
  }

  const speed =
    typeof candidate.speed === "number" && Number.isFinite(candidate.speed)
      ? Math.min(2, Math.max(0.5, candidate.speed))
      : 1
  const format =
    typeof candidate.format === "string" && allowedFormats.has(candidate.format)
      ? candidate.format
      : "mp3"

  if (
    isRateLimited({
      key: `speech-tts:${endpoint.endpoint}`,
      limit: 240,
      windowMs: 60_000,
    })
  ) {
    return errorResponse("rate_limited", "语音合成请求过于频繁，请稍后再试。", 429)
  }

  try {
    const result = await synthesizeSpeechAudio({
      endpoint,
      format,
      speed,
      text,
      voice,
    })
    return new NextResponse(result.audio, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof SpeechGatewayError) {
      return errorResponse(error.code, error.message, error.status)
    }
    return errorResponse("tts_failed", "语音合成暂时不可用，请稍后重试。", 502)
  }
}
