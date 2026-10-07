import { NextResponse } from "next/server"
import { getAiProviderConfig, requestAiText } from "@/lib/ai-provider"
import {
  applyTutorModeToConversation,
  parseProviderConversation,
} from "@/lib/conversation-feedback"
import { isTutorMode, type TutorMode } from "@/lib/conversation-prefs"
import { getConversationScene } from "@/lib/conversation-scenes"
import { getDemoConversationReply } from "@/lib/demo-conversation"
import type {
  ConversationMemoryContextItem,
  ConversationMemoryPayload,
  ConversationShortTermMemory,
} from "@/lib/memory"
import {
  createConversationPrompt,
  getLongTermMemory,
  resolveConversationMemory,
  saveConversationMemory,
} from "@/lib/memory/server"
import {
  decryptModelConfigEnvelope,
  getModelConfigPublicKey,
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

type ChatTurn = {
  role: "assistant" | "user"
  content: string
}

type ConversationRequest = {
  sceneId: string
  language: "auto" | "bilingual" | "english"
  tutorMode?: TutorMode
  memory?: ConversationMemoryPayload | ConversationMemoryContextItem[]
  messages: ChatTurn[]
  conversationPrompt?: string
  modelConfigEnvelope?: ModelConfigEnvelope
}

export { getUnansweredUserInputs } from "@/lib/memory/server"

const rateLimitWindowMs = 60_000
const requestLimit = 20

// Some OpenAI-compatible providers are slow reasoning models that take 60-90s for a cold turn even
// on short prompts. Keep the upstream timeout above that band so a valid config is not aborted
// prematurely, and lift the platform function limit to match. On serverless hosts the effective
// ceiling is still the plan's maxDuration cap.
const providerTimeoutMs = 110_000
export const maxDuration = 120

export function GET() {
  return NextResponse.json(getModelConfigPublicKey(), {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

function isValidMemoryItem(value: unknown): value is ConversationMemoryContextItem {
  if (!value || typeof value !== "object") {
    return false
  }
  const item = value as Partial<ConversationMemoryContextItem>
  return (
    typeof item.id === "string" &&
    item.id.length <= 100 &&
    typeof item.label === "string" &&
    item.label.length <= 120 &&
    typeof item.expression === "string" &&
    item.expression.length <= 500 &&
    typeof item.source === "string" &&
    item.source.length <= 120 &&
    typeof item.guidance === "string" &&
    item.guidance.length <= 500 &&
    typeof item.strength === "number" &&
    item.strength >= 0 &&
    item.strength <= 100
  )
}

function isValidShortTermMemory(value: unknown): value is ConversationShortTermMemory {
  if (!value || typeof value !== "object") {
    return false
  }
  const memory = value as Partial<ConversationShortTermMemory>
  return (
    typeof memory.sceneId === "string" &&
    memory.sceneId.length <= 80 &&
    typeof memory.activeGoal === "string" &&
    memory.activeGoal.length <= 500 &&
    typeof memory.turnCount === "number" &&
    memory.turnCount >= 0 &&
    memory.turnCount <= 24 &&
    Array.isArray(memory.recentUserInputs) &&
    memory.recentUserInputs.length <= 3 &&
    memory.recentUserInputs.every((input) => typeof input === "string" && input.length <= 4_000)
  )
}

function isValidMemory(value: unknown) {
  if (value === undefined) {
    return true
  }
  if (Array.isArray(value)) {
    return value.length <= 5 && value.every(isValidMemoryItem)
  }
  if (!value || typeof value !== "object") {
    return false
  }
  const memory = value as Partial<ConversationMemoryPayload>
  return (
    isValidShortTermMemory(memory.shortTerm) &&
    Array.isArray(memory.longTerm) &&
    memory.longTerm.length <= 5 &&
    memory.longTerm.every(isValidMemoryItem)
  )
}

// The transport ceiling matches the preference cap: the learner owns the whole prompt, so this is
// only an admission limit on request size, not a second place where prompt text gets truncated.
function isValidConversationPrompt(value: unknown): value is string | undefined {
  if (value === undefined) {
    return true
  }
  return typeof value === "string" && value.length <= 12_000
}

function isValidRequest(value: unknown): value is ConversationRequest {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<ConversationRequest>
  return (
    typeof candidate.sceneId === "string" &&
    candidate.sceneId.length <= 80 &&
    (candidate.language === "auto" ||
      candidate.language === "bilingual" ||
      candidate.language === "english") &&
    (candidate.tutorMode === undefined || isTutorMode(candidate.tutorMode)) &&
    isValidConversationPrompt(candidate.conversationPrompt) &&
    isValidMemory(candidate.memory) &&
    !("modelConfig" in candidate) &&
    isValidModelConfigEnvelope(candidate.modelConfigEnvelope) &&
    Array.isArray(candidate.messages) &&
    candidate.messages.length > 0 &&
    candidate.messages.length <= 24 &&
    candidate.messages.every(
      (message) =>
        (message.role === "assistant" || message.role === "user") &&
        typeof message.content === "string" &&
        message.content.length > 0 &&
        message.content.length <= 4_000,
    )
  )
}

export async function PUT(request: Request) {
  let envelope: unknown
  try {
    const body = (await request.json()) as { modelConfigEnvelope?: unknown }
    envelope = body.modelConfigEnvelope
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "请求体必须是有效 JSON。" } },
      { status: 400 },
    )
  }

  if (!isValidModelConfigEnvelope(envelope) || !envelope) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "模型配置密文格式无效。" } },
      { status: 400 },
    )
  }

  let decrypted: unknown
  try {
    decrypted = decryptModelConfigEnvelope(envelope)
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
  if (
    isRateLimited({
      key: `conversation:validate:${decrypted.baseUrl}`,
      limit: requestLimit,
      windowMs: rateLimitWindowMs,
    })
  ) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "验证请求过于频繁，请稍后再试。" } },
      { status: 429 },
    )
  }

  try {
    await requestAiText({
      config: toProviderConfig(decrypted),
      messages: [{ role: "user", content: "Reply with OK." }],
      temperature: 0,
      maxTokens: 128,
      signal: AbortSignal.timeout(15_000),
    })
    return NextResponse.json({ data: { valid: true } })
  } catch {
    return NextResponse.json(
      { error: { code: "provider_unavailable", message: "模型服务连接验证失败。" } },
      { status: 502 },
    )
  }
}

export async function POST(request: Request) {
  const demoMode = isDemoMode()

  // The browser sends only an encrypted model-config envelope. Plaintext modelConfig payloads
  // are rejected so provider credentials cannot reappear in network request previews.
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
      { error: { code: "invalid_request", message: "场景或对话消息格式不正确。" } },
      { status: 400 },
    )
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
        {
          error: {
            code: "invalid_model_config_envelope",
            message: "模型配置密文无效。",
          },
        },
        { status: 400 },
      )
    }
    if (!isValidBrowserModelConfig(decrypted) || !decrypted) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_model_config",
            message: "模型配置格式无效。",
          },
        },
        { status: 400 },
      )
    }
    clientModelConfig = decrypted
  }
  const usingClientConfig = Boolean(clientModelConfig)

  let clientKey = "demo"
  let userId = ""
  let supabase: Awaited<ReturnType<typeof getSupabaseServerClient>> = null

  if (!demoMode) {
    supabase = await getSupabaseServerClient()
    // Server-key mode still requires configured auth and a signed-in learner. Bring-your-own-key
    // requests authenticate with the learner's own provider key, so they run without login.
    if (!supabase && !usingClientConfig) {
      return NextResponse.json(
        {
          error: {
            code: "service_not_configured",
            message: "服务端认证尚未配置。",
          },
        },
        { status: 503 },
      )
    }

    if (supabase) {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()
      if (user && !error) {
        clientKey = user.id
        userId = user.id
      } else if (!usingClientConfig) {
        return NextResponse.json(
          { error: { code: "unauthorized", message: "请先登录后再开始对话。" } },
          { status: 401 },
        )
      }
    }

    if (usingClientConfig && !userId) {
      // Group anonymous bring-your-own-key traffic per endpoint without touching the key material.
      clientKey = `byok:${clientModelConfig?.baseUrl}`
    }
  }

  const sharedRateLimit =
    userId && supabase
      ? await consumeSharedRateLimit({
          client: supabase,
          bucket: "conversation-generate",
        })
      : undefined
  if (sharedRateLimit === null && !usingClientConfig) {
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
  const rateLimited =
    sharedRateLimit?.limited ??
    isRateLimited({
      key: `conversation:generate:${clientKey}`,
      limit: requestLimit,
      windowMs: rateLimitWindowMs,
    })
  if (rateLimited) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "请求过于频繁，请稍后再试。" } },
      { status: 429 },
    )
  }

  const scene = getConversationScene(body.sceneId)
  const tutorMode = body.tutorMode ?? "coach"

  if (demoMode) {
    const latestUserContent =
      [...body.messages].reverse().find((message) => message.role === "user")?.content ?? ""

    const reply = getDemoConversationReply(
      scene.id,
      latestUserContent,
      scene.focusPhrases[0]?.[1],
      scene.tags[0],
    )
    const rememberedItem = getLongTermMemory(body)[0]

    return NextResponse.json({
      data: applyTutorModeToConversation(
        {
          ...reply,
          recall: rememberedItem
            ? tutorMode === "english"
              ? `Recall ${rememberedItem.expression} and reuse it in this turn before asking for a hint.`
              : `Agent 记忆：你在“${rememberedItem.source}”学过 ${rememberedItem.expression}。本轮尝试主动复用，不要等提示。`
            : reply.recall,
        },
        tutorMode,
      ),
    })
  }

  const providerConfig = clientModelConfig
    ? toProviderConfig(clientModelConfig)
    : getAiProviderConfig()
  if (!providerConfig) {
    return NextResponse.json(
      {
        error: {
          code: "service_not_configured",
          message: "AI 服务尚未配置。",
        },
      },
      { status: 503 },
    )
  }

  const latestUserContent =
    [...body.messages].reverse().find((message) => message.role === "user")?.content ?? ""
  const longTermMemory = await resolveConversationMemory({
    client: supabase,
    provider: providerConfig,
    localMemory: getLongTermMemory(body),
    query: [scene.title, scene.objective, latestUserContent, ...scene.tags].join("\n"),
    sceneId: scene.id,
  })

  try {
    const content = await requestAiText({
      config: providerConfig,
      temperature: 0.6,
      maxTokens: 1200,
      messages: [
        {
          role: "system",
          content: createConversationPrompt({ ...body, tutorMode }, longTermMemory),
        },
        ...body.messages.slice(-12),
      ],
      signal: AbortSignal.timeout(providerTimeoutMs),
    })
    const parsed = parseProviderConversation(
      content,
      latestUserContent,
      scene.focusPhrases[0]?.[1],
      scene.tags[0],
    )

    await saveConversationMemory({
      client: supabase,
      provider: providerConfig,
      userId,
      memory: {
        sourceId: `${scene.id}:${Date.now()}`,
        sceneId: scene.id,
        sceneTitle: scene.title,
        label: scene.focusPhrases[0]?.[0] ?? scene.tags[0] ?? "场景表达",
        expression: parsed.validation.corrected || latestUserContent,
        explanation: parsed.validation.explanation,
        accurate: parsed.validation.status !== "improve",
      },
    })

    return NextResponse.json({
      data: applyTutorModeToConversation(parsed, tutorMode),
    })
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "provider_unavailable",
          message: "AI 服务暂时不可用，请稍后重试。",
        },
      },
      { status: 502 },
    )
  }
}
