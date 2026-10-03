import { NextResponse } from "next/server"
import { getAiProviderConfig } from "@/lib/ai-provider"
import { type PracticeMemoryWrite, persistPracticeMemory } from "@/lib/memory/server"
import { isDemoMode } from "@/lib/runtime-mode"
import { consumeSharedRateLimit } from "@/lib/server/rate-limit"
import { getSupabaseServerClient } from "@/lib/supabase/server"

function isBoundedString(value: unknown, maximumLength: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength
}

function isScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
}

function isValidPracticeMemory(value: unknown): value is PracticeMemoryWrite {
  if (!value || typeof value !== "object") {
    return false
  }
  const memory = value as Partial<PracticeMemoryWrite>
  if (
    !isBoundedString(memory.sourceId, 160) ||
    !isBoundedString(memory.sceneId, 80) ||
    !isBoundedString(memory.sceneTitle, 120) ||
    !isBoundedString(memory.label, 120) ||
    !isBoundedString(memory.expression, 1_000) ||
    !isBoundedString(memory.explanation, 1_000) ||
    !isScore(memory.strength)
  ) {
    return false
  }

  if (memory.sourceType === "review") {
    return (
      (memory.rating === "again" ||
        memory.rating === "hard" ||
        memory.rating === "good" ||
        memory.rating === "easy") &&
      typeof memory.successful === "boolean"
    )
  }

  return (
    memory.sourceType === "shadowing" &&
    isBoundedString(memory.focusWord, 120) &&
    isScore(memory.overallScore) &&
    isScore(memory.clarityScore) &&
    isScore(memory.fluencyScore) &&
    isScore(memory.rhythmScore) &&
    typeof memory.durationSeconds === "number" &&
    Number.isFinite(memory.durationSeconds) &&
    memory.durationSeconds >= 0 &&
    memory.durationSeconds <= 3_600
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

  if (!isValidPracticeMemory(body)) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "学习结果格式不正确。" } },
      { status: 400 },
    )
  }

  if (isDemoMode()) {
    return NextResponse.json({ data: { stored: false } }, { status: 202 })
  }

  const supabase = await getSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json(
      { error: { code: "service_not_configured", message: "服务端认证尚未配置。" } },
      { status: 503 },
    )
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "请先登录后再同步学习结果。" } },
      { status: 401 },
    )
  }

  const rateLimit = await consumeSharedRateLimit({
    client: supabase,
    bucket: "memory-document",
  })
  if (!rateLimit) {
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
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "学习结果同步过于频繁，请稍后再试。" } },
      { status: 429 },
    )
  }

  const provider = getAiProviderConfig()
  if (!provider?.embeddingModel) {
    return NextResponse.json({ data: { stored: false } }, { status: 202 })
  }

  try {
    const stored = await persistPracticeMemory({
      client: supabase,
      provider,
      userId: user.id,
      memory: body,
    })
    return NextResponse.json({ data: { stored } })
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "memory_persistence_failed",
          message: "长期记忆暂时无法同步，本机学习记录不受影响。",
        },
      },
      { status: 502 },
    )
  }
}
