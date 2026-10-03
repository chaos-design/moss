import { NextResponse } from "next/server"
import { getAiProviderConfig, requestAiText } from "@/lib/ai-provider"
import { removeMarkdownEmphasis } from "@/lib/conversation-feedback"
import {
  decryptModelConfigEnvelope,
  ModelConfigKeyExpiredError,
} from "@/lib/model-config-crypto"
import type { ModelConfigEnvelope } from "@/lib/model-config-envelope"
import { isDemoMode } from "@/lib/runtime-mode"
import {
  type BrowserModelConfig,
  isValidBrowserModelConfig,
  isValidModelConfigEnvelope,
  toProviderConfig,
} from "@/lib/server/browser-model-config"
import { consumeSharedRateLimit, isRateLimited } from "@/lib/server/rate-limit"
import { getSupabaseServerClient } from "@/lib/supabase/server"

type TranslationRequest = {
  text: string
  modelConfigEnvelope?: ModelConfigEnvelope
}

function isValidRequest(value: unknown): value is TranslationRequest {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<TranslationRequest>
  return (
    typeof candidate.text === "string" &&
    candidate.text.trim().length > 0 &&
    candidate.text.length <= 4_000 &&
    !("modelConfig" in candidate) &&
    isValidModelConfigEnvelope(candidate.modelConfigEnvelope)
  )
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "请求体必须是有效 JSON。" } },
      { status: 400 },
    )
  }

  if (!isValidRequest(body)) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "待翻译内容格式不正确。" } },
      { status: 400 },
    )
  }

  if (isDemoMode()) {
    return NextResponse.json({
      data: {
        translation: "当前回复已使用演示翻译；连接模型后可获取新回复的实时中文翻译。",
      },
    })
  }

  let clientModelConfig: BrowserModelConfig | undefined
  if (body.modelConfigEnvelope) {
    let decrypted: unknown
    try {
      decrypted = decryptModelConfigEnvelope(body.modelConfigEnvelope)
    } catch (error) {
      if (error instanceof ModelConfigKeyExpiredError) {
        return NextResponse.json(
          {
            error: {
              code: "model_config_key_expired",
              message: "模型配置加密密钥已更新，请重试。",
            },
          },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: { code: "invalid_model_config_envelope", message: "模型配置密文无效。" } },
        { status: 400 },
      )
    }
    if (!isValidBrowserModelConfig(decrypted) || !decrypted) {
      return NextResponse.json(
        { error: { code: "invalid_model_config", message: "模型配置格式无效。" } },
        { status: 400 },
      )
    }
    clientModelConfig = decrypted
  }

  const supabase = await getSupabaseServerClient()
  if (!supabase && !clientModelConfig) {
    return NextResponse.json(
      { error: { code: "service_not_configured", message: "服务端认证尚未配置。" } },
      { status: 503 },
    )
  }

  const authResult = supabase ? await supabase.auth.getUser() : null
  const user = authResult?.data.user
  if ((!user || authResult.error) && !clientModelConfig) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "请先登录后再使用翻译。" } },
      { status: 401 },
    )
  }

  const sharedRateLimit =
    user && supabase
      ? await consumeSharedRateLimit({
          client: supabase,
          bucket: "translation",
        })
      : undefined
  if (sharedRateLimit === null && !clientModelConfig) {
    return NextResponse.json(
      {
        error: {
          code: "rate_limit_unavailable",
          message: "请求保护服务暂时不可用，请稍后再试。",
        },
      },
      { status: 503 },
    )
  }
  const clientKey = user?.id ?? clientModelConfig?.baseUrl ?? "anonymous"
  const rateLimited =
    sharedRateLimit?.limited ??
    isRateLimited({
      key: `translation:${clientKey}`,
      limit: 30,
      windowMs: 60_000,
    })
  if (rateLimited) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "翻译请求过于频繁，请稍后再试。" } },
      { status: 429 },
    )
  }

  const providerConfig = clientModelConfig
    ? toProviderConfig(clientModelConfig)
    : getAiProviderConfig()
  if (!providerConfig) {
    return NextResponse.json(
      { error: { code: "service_not_configured", message: "AI 服务尚未配置。" } },
      { status: 503 },
    )
  }

  try {
    const translation = await requestAiText({
      config: providerConfig,
      temperature: 0.2,
      maxTokens: 320,
      messages: [
        {
          role: "system",
          content:
            "Translate the supplied English into concise, natural Simplified Chinese. Return only the translation as plain text without Markdown.",
        },
        { role: "user", content: body.text },
      ],
      signal: AbortSignal.timeout(20_000),
    })

    return NextResponse.json({
      data: { translation: removeMarkdownEmphasis(translation) },
    })
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "provider_unavailable",
          message: "翻译服务暂时不可用，请稍后重试。",
        },
      },
      { status: 502 },
    )
  }
}
