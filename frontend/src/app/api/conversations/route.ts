import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { type ConversationSession, parseConversationSession } from "@/lib/conversation-history"
import { isDemoMode } from "@/lib/runtime-mode"
import {
  conversationHistoryPageSize,
  deleteConversationSession,
  listConversationSessions,
  upsertConversationSession,
} from "@/lib/server/conversation-repository"
import { consumeSharedRateLimit } from "@/lib/server/rate-limit"
import { getSupabaseServerClient } from "@/lib/supabase/server"

const maxMessagesPerSession = 200

type AuthenticationResult =
  | { authenticated: false; response: NextResponse }
  | { authenticated: true; client: SupabaseClient; userId: string }

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status })
}

function isBoundedString(value: string, maximumLength: number) {
  return value.trim().length > 0 && value.length <= maximumLength
}

function isValidSessionPayload(
  session: ReturnType<typeof parseConversationSession>,
): session is ConversationSession {
  return Boolean(
    session &&
      isBoundedString(session.id, 160) &&
      isBoundedString(session.sceneId, 80) &&
      isBoundedString(session.sceneTitle, 120) &&
      isBoundedString(session.partnerName, 120) &&
      Number.isInteger(session.durationSeconds) &&
      session.durationSeconds >= 0 &&
      session.durationSeconds <= 86_400 &&
      Number.isFinite(Date.parse(session.startedAt)) &&
      Number.isFinite(Date.parse(session.updatedAt)) &&
      session.messages.length <= maxMessagesPerSession &&
      session.messages.every(
        (message) =>
          isBoundedString(message.id, 160) &&
          isBoundedString(message.content, 12_000) &&
          message.translation.length <= 12_000 &&
          message.note.length <= 4_000,
      ),
  )
}

async function authenticate(): Promise<AuthenticationResult> {
  if (isDemoMode()) {
    return {
      authenticated: false,
      response: errorResponse("service_not_configured", "云端会话未启用。", 503),
    }
  }
  const client = await getSupabaseServerClient()
  if (!client) {
    return {
      authenticated: false,
      response: errorResponse("service_not_configured", "服务端认证尚未配置。", 503),
    }
  }
  const {
    data: { user },
    error,
  } = await client.auth.getUser()
  if (error || !user) {
    return {
      authenticated: false,
      response: errorResponse("unauthorized", "请先登录后再同步对话。", 401),
    }
  }
  const rateLimit = await consumeSharedRateLimit({
    client,
    bucket: "conversation-sync",
  })
  if (!rateLimit) {
    return {
      authenticated: false,
      response: errorResponse(
        "rate_limit_unavailable",
        "请求保护服务暂时不可用，请稍后再试。",
        503,
      ),
    }
  }
  if (rateLimit.limited) {
    return {
      authenticated: false,
      response: errorResponse("rate_limited", "对话同步过于频繁，请稍后再试。", 429),
    }
  }
  return { authenticated: true, client, userId: user.id }
}

function parseHistoryOffset(request: Request) {
  const cursor = new URL(request.url).searchParams.get("cursor")
  if (cursor === null) {
    return 0
  }
  if (!/^(0|[1-9]\d*)$/.test(cursor)) {
    return null
  }
  const offset = Number(cursor)
  return Number.isSafeInteger(offset) ? offset : null
}

export async function GET(request: Request) {
  const offset = parseHistoryOffset(request)
  if (offset === null) {
    return errorResponse("invalid_request", "历史分页游标格式不正确。", 400)
  }

  const auth = await authenticate()
  if (!auth.authenticated) {
    return auth.response
  }

  try {
    const page = await listConversationSessions({
      ...auth,
      offset,
      pageSize: conversationHistoryPageSize,
    })
    return NextResponse.json({
      data: {
        nextCursor: page.nextOffset === null ? null : String(page.nextOffset),
        sessions: page.sessions,
        userId: auth.userId,
      },
    })
  } catch {
    return errorResponse(
      "conversation_history_failed",
      "云端对话暂时无法读取，本机记录不受影响。",
      502,
    )
  }
}

export async function PUT(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse("invalid_json", "请求体必须是有效 JSON。", 400)
  }

  const session = parseConversationSession(body)
  if (!isValidSessionPayload(session)) {
    return errorResponse("invalid_request", "对话记录格式不正确。", 400)
  }

  const auth = await authenticate()
  if (!auth.authenticated) {
    return auth.response
  }

  try {
    await upsertConversationSession({ ...auth, session })
    return NextResponse.json({ data: { stored: true } })
  } catch {
    return errorResponse(
      "conversation_persistence_failed",
      "云端对话暂时无法保存，本机记录不受影响。",
      502,
    )
  }
}

export async function DELETE(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim()
  if (!sessionId || sessionId.length > 160) {
    return errorResponse("invalid_request", "会话标识格式不正确。", 400)
  }

  const auth = await authenticate()
  if (!auth.authenticated) {
    return auth.response
  }

  try {
    await deleteConversationSession({ ...auth, sessionId })
    return NextResponse.json({ data: { deleted: true } })
  } catch {
    return errorResponse(
      "conversation_delete_failed",
      "云端对话暂时无法删除，本机记录不受影响。",
      502,
    )
  }
}
