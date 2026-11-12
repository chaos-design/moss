import { NextResponse } from "next/server"
import { isRateLimited } from "@/lib/server/rate-limit"
import {
  maximumTtsTextLength,
  parseSpeechApiEndpoint,
  SpeechGatewayError,
  synthesizeSpeechAudio,
} from "@/lib/server/speech-gateway"
import { speechRules } from "@/lib/speech-rules"

const maximumRequestBytes = speechRules.limits.maxSpeechRequestBytes
const allowedFormats = new Set(speechRules.formats.routeAllowed)

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

  // 音色按服务而定：OpenAI 兼容云端通常必填；本机适配器与自建网关可留空，由服务端默认音色接管。
  const voice = typeof candidate.voice === "string" ? candidate.voice.trim().slice(0, 120) : ""

  const speed =
    typeof candidate.speed === "number" && Number.isFinite(candidate.speed)
      ? Math.min(speechRules.speed.max, Math.max(speechRules.speed.min, candidate.speed))
      : speechRules.speed.default
  const format =
    typeof candidate.format === "string" && allowedFormats.has(candidate.format)
      ? candidate.format
      : speechRules.formats.default

  if (
    isRateLimited({
      key: `speech-tts:${endpoint.endpoint}`,
      limit: speechRules.limits.ttsRateLimitPerMinute,
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
