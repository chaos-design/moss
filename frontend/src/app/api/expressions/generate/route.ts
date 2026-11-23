import { NextResponse } from "next/server"
import { AiProviderStatusError, requestAiText } from "@/lib/ai-provider"
import {
  createExpressionGenerationMessages,
  expressionGenerationPhraseLimit,
  expressionGenerationPhraseMaxLength,
  normalizeGenerationPhrases,
  parseExpressionGeneration,
} from "@/lib/expression-generation"
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
  resolveProviderConfig,
} from "@/lib/server/browser-model-config"
import { isRateLimited } from "@/lib/server/rate-limit"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { resolveSessionUser } from "@/lib/supabase/session"

export const maxDuration = 120

type GenerationRequest = {
  phrases: string[]
  modelConfigEnvelope?: ModelConfigEnvelope
}

const rateLimitWindowMs = 60_000
const rateLimit = 12
const providerTimeoutMs = 60_000

function isValidRequest(value: unknown): value is GenerationRequest {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<GenerationRequest>
  return (
    !("modelConfig" in candidate) &&
    Array.isArray(candidate.phrases) &&
    candidate.phrases.length > 0 &&
    candidate.phrases.length <= expressionGenerationPhraseLimit &&
    candidate.phrases.every(
      (phrase) =>
        typeof phrase === "string" &&
        phrase.trim().length > 0 &&
        phrase.length <= expressionGenerationPhraseMaxLength,
    ) &&
    isValidModelConfigEnvelope(candidate.modelConfigEnvelope)
  )
}

function createDemoItems(phrases: readonly string[]) {
  return phrases.map((phrase) => ({
    phrase,
    meaning: "演示生成的中文含义，请导入前核对。",
    why: "演示数据：根据实际表达补齐语义推导。",
    origin: "演示数据：连接模型后会生成审慎的来源说明。",
    example: `You can use ${phrase} in a natural conversation.`,
    exampleTranslation: `你可以在自然对话中使用 ${phrase}。`,
    sceneCategory: "social" as const,
    context: "通用" as const,
    kind: "collocation" as const,
    usage: "演示数据：补充常见搭配与语域限制。",
    memoryTip: "演示数据：补充一条便于回忆的线索。",
    examples: [
      { text: `Try ${phrase} when the moment fits.`, translation: `合适时试试 ${phrase}。` },
      {
        text: `That is a natural way to say ${phrase}.`,
        translation: `这样说 ${phrase} 很自然。`,
      },
    ],
  }))
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
      { error: { code: "invalid_request", message: "待生成短语格式不正确。" } },
      { status: 400 },
    )
  }
  const phrases = normalizeGenerationPhrases(body.phrases)
  if (phrases.length === 0) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "请至少输入一个有效短语。" } },
      { status: 400 },
    )
  }

  if (isDemoMode()) {
    return NextResponse.json({ data: { items: createDemoItems(phrases) } })
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
  const { providerConfig, usingClientConfig } = resolveProviderConfig(clientModelConfig)

  const supabase = await getSupabaseServerClient()
  if (!supabase && !usingClientConfig) {
    return NextResponse.json(
      { error: { code: "service_not_configured", message: "服务端认证尚未配置。" } },
      { status: 503 },
    )
  }
  const sessionUser = supabase ? await resolveSessionUser(supabase) : null
  if (!sessionUser && !usingClientConfig) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "请先登录后再生成表达数据。" } },
      { status: 401 },
    )
  }

  const clientKey =
    sessionUser?.id ??
    (usingClientConfig ? clientModelConfig?.baseUrl : undefined) ??
    "anonymous"
  if (
    isRateLimited({
      key: `expression-generate:${clientKey}`,
      limit: rateLimit,
      windowMs: rateLimitWindowMs,
    })
  ) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "生成请求过于频繁，请稍后再试。" } },
      { status: 429 },
    )
  }

  if (!providerConfig) {
    return NextResponse.json(
      { error: { code: "service_not_configured", message: "AI 服务尚未配置。" } },
      { status: 503 },
    )
  }

  try {
    const content = await requestAiText({
      config: providerConfig,
      temperature: 0.2,
      maxTokens: 4_000,
      messages: createExpressionGenerationMessages(phrases),
      signal: AbortSignal.timeout(providerTimeoutMs),
    })
    return NextResponse.json({ data: { items: parseExpressionGeneration(content) } })
  } catch (error) {
    if (error instanceof AiProviderStatusError && error.status === 429) {
      return NextResponse.json(
        {
          error: {
            code: "provider_rate_limited",
            message: "模型服务请求过于频繁，请稍后再试。",
          },
        },
        { status: 429 },
      )
    }
    const message = error instanceof Error ? error.message : ""
    if (message.startsWith("生成结果")) {
      return NextResponse.json(
        { error: { code: "invalid_generation", message } },
        { status: 502 },
      )
    }
    return NextResponse.json(
      { error: { code: "provider_unavailable", message: "AI 服务暂时不可用，请稍后重试。" } },
      { status: 502 },
    )
  }
}
