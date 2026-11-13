import { NextResponse } from "next/server"
import { isRateLimited } from "@/lib/server/rate-limit"
import {
  maximumTtsTextLength,
  parseSpeechApiEndpoint,
  SpeechGatewayError,
  synthesizeSpeechAudio,
} from "@/lib/server/speech-gateway"
import { isLoopbackSpeechEndpoint } from "@/lib/speech-config"
import {
  isAudioContentType,
  isPlausibleAudioPayload,
  speechRules,
  testSynthesisDefaults,
} from "@/lib/speech-rules"

/**
 * 「测试合成接口」专用诊断端点。
 *
 * 与 `/api/speech/tts` 不同，这里只回传结构化结果（格式、字节数、耗时、错误码），不回传
 * 音频本体，并额外校验 Content-Type 与音频魔数。它复用同一套合成链路与地址策略，因此对
 * 任何 OpenAI 兼容端点都可用，包括本机 5583 接口。上游失败也以 `ok: false` 的 200 响应
 * 返回，便于设置页直接展示诊断；只有本地参数校验与限流失败才使用标准 4xx 错误。
 */
type TestSynthesisRequest = {
  endpoint: unknown
  text?: unknown
  voice?: unknown
  speed?: unknown
  format?: unknown
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status })
}

function diagnosticResponse(body: Record<string, unknown>) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (
    Number.isFinite(contentLength) &&
    contentLength > speechRules.limits.maxSpeechRequestBytes
  ) {
    return errorResponse("request_too_large", "单次合成内容过长。", 413)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse("invalid_json", "请求体必须是有效 JSON。", 400)
  }

  const candidate = (body ?? {}) as TestSynthesisRequest
  const endpoint = parseSpeechApiEndpoint(candidate.endpoint)
  if (!endpoint) {
    return errorResponse(
      "invalid_speech_endpoint",
      "语音合成接口地址或模型配置不正确，请重新填写。",
      400,
    )
  }

  const text =
    typeof candidate.text === "string" && candidate.text.trim()
      ? candidate.text.trim()
      : testSynthesisDefaults.text
  if (text.length > maximumTtsTextLength) {
    return errorResponse("invalid_request", "合成文本超出长度限制。", 400)
  }

  const rawVoice =
    typeof candidate.voice === "string"
      ? candidate.voice.trim().slice(0, speechRules.limits.maxVoiceLength)
      : ""
  // 显式留空时：本机回环适配器交给服务端默认音色；公网接口保留 OpenAI 兼容默认，避免缺少必填音色。
  const voice =
    rawVoice || (isLoopbackSpeechEndpoint(endpoint.endpoint) ? "" : testSynthesisDefaults.voice)
  const allowedFormats = new Set(speechRules.formats.routeAllowed)
  const format =
    typeof candidate.format === "string" && allowedFormats.has(candidate.format)
      ? candidate.format
      : testSynthesisDefaults.format
  const speed =
    typeof candidate.speed === "number" && Number.isFinite(candidate.speed)
      ? Math.min(speechRules.speed.max, Math.max(speechRules.speed.min, candidate.speed))
      : testSynthesisDefaults.speed

  // 测试请求单独计数，避免验证操作占满正常合成的配额。
  if (
    isRateLimited({
      key: `speech-tts-test:${endpoint.endpoint}`,
      limit: speechRules.limits.ttsRateLimitPerMinute,
      windowMs: 60_000,
    })
  ) {
    return errorResponse("rate_limited", "语音合成请求过于频繁，请稍后再试。", 429)
  }

  const started = Date.now()
  const requestInfo = { model: endpoint.model, voice, format }

  try {
    const result = await synthesizeSpeechAudio({ endpoint, text, voice, speed, format })
    const checks = {
      audioContentType: isAudioContentType(result.contentType),
      plausiblePayload: isPlausibleAudioPayload(result.audio, result.contentType),
    }
    const ok = checks.audioContentType && checks.plausiblePayload
    return diagnosticResponse({
      ok,
      status: ok ? 200 : 502,
      contentType: result.contentType,
      bytes: result.audio.byteLength,
      durationMs: Date.now() - started,
      ...requestInfo,
      checks,
      ...(ok
        ? {}
        : {
            error: {
              code: "speech_invalid_response",
              message: "语音合成接口返回了无效音频。",
            },
          }),
    })
  } catch (error) {
    const gatewayError = error instanceof SpeechGatewayError ? error : null
    return diagnosticResponse({
      ok: false,
      status: gatewayError?.status ?? 502,
      contentType: "",
      bytes: 0,
      durationMs: Date.now() - started,
      ...requestInfo,
      checks: { audioContentType: false, plausiblePayload: false },
      error: {
        code: gatewayError?.code ?? "tts_failed",
        message: gatewayError?.message ?? "语音合成暂时不可用，请稍后重试。",
      },
    })
  }
}
