import type { SupabaseClient } from "@supabase/supabase-js"
import {
  type ConversationSession,
  isStoredConversationMessage,
  parseConversationSession,
  type StoredConversationMessage,
} from "@/lib/conversation-history"

export const conversationHistoryPageSize = 50

type CloudMessageRow = {
  client_id?: unknown
  content?: unknown
  correction?: unknown
  created_at?: unknown
  role?: unknown
  translation?: unknown
}

type CloudConversationRow = {
  client_id?: unknown
  completed_at?: unknown
  context_snapshot?: unknown
  conversation_messages?: unknown
  last_message_at?: unknown
  scene_key?: unknown
  started_at?: unknown
  status?: unknown
  title?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function parseCloudMessage(value: unknown): StoredConversationMessage | null {
  if (!value || typeof value !== "object") {
    return null
  }
  const row = value as CloudMessageRow
  const correction = asRecord(row.correction)
  const candidate = {
    id: row.client_id,
    role: row.role,
    content: row.content,
    translation: typeof row.translation === "string" ? row.translation : "",
    note: typeof correction.note === "string" ? correction.note : "",
    timestamp: typeof correction.timestamp === "string" ? correction.timestamp : "00:00",
    ...(typeof correction.feedbackFor === "string"
      ? { feedbackFor: correction.feedbackFor }
      : {}),
    ...(correction.inputMode === "text" || correction.inputMode === "voice"
      ? { inputMode: correction.inputMode }
      : {}),
    ...(correction.inputAnalysis &&
    typeof correction.inputAnalysis === "object" &&
    !Array.isArray(correction.inputAnalysis)
      ? { inputAnalysis: correction.inputAnalysis }
      : {}),
    ...(correction.validation &&
    typeof correction.validation === "object" &&
    !Array.isArray(correction.validation)
      ? { validation: correction.validation }
      : {}),
  }

  return isStoredConversationMessage(candidate) ? candidate : null
}

export function parseCloudConversationRows(value: unknown): ConversationSession[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return []
    }
    const row = item as CloudConversationRow
    const context = asRecord(row.context_snapshot)
    const messages = Array.isArray(row.conversation_messages)
      ? [...row.conversation_messages]
          .sort((left, right) => {
            const leftPosition = asRecord(asRecord(left).correction).position
            const rightPosition = asRecord(asRecord(right).correction).position
            return (
              (typeof leftPosition === "number" ? leftPosition : 0) -
              (typeof rightPosition === "number" ? rightPosition : 0)
            )
          })
          .map(parseCloudMessage)
          .filter((message): message is StoredConversationMessage => Boolean(message))
      : []
    const session = parseConversationSession({
      id: row.client_id,
      sceneId: row.scene_key,
      sceneTitle: row.title,
      partnerName: context.partnerName,
      startedAt: row.started_at,
      updatedAt: row.last_message_at,
      durationSeconds: context.durationSeconds,
      status: row.status,
      messages,
    })
    return session ? [session] : []
  })
}

export async function listConversationSessions({
  client,
  offset = 0,
  pageSize = conversationHistoryPageSize,
  userId,
}: {
  client: SupabaseClient
  offset?: number
  pageSize?: number
  userId: string
}) {
  const { data, error } = await client
    .from("conversations")
    .select(
      [
        "client_id",
        "scene_key",
        "title",
        "status",
        "context_snapshot",
        "started_at",
        "last_message_at",
        "completed_at",
        "conversation_messages(client_id, role, content, translation, correction, created_at)",
      ].join(","),
    )
    .eq("user_id", userId)
    .not("client_id", "is", null)
    .order("last_message_at", { ascending: false })
    .order("client_id", { ascending: true })
    .order("created_at", {
      ascending: true,
      referencedTable: "conversation_messages",
    })
    .range(offset, offset + pageSize)

  if (error) {
    throw error
  }
  const rows = Array.isArray(data) ? data : []
  return {
    nextOffset: rows.length > pageSize ? offset + pageSize : null,
    sessions: parseCloudConversationRows(rows.slice(0, pageSize)),
  }
}

export async function upsertConversationSession({
  client,
  session,
  userId,
}: {
  client: SupabaseClient
  session: ConversationSession
  userId: string
}) {
  const { data, error } = await client
    .from("conversations")
    .upsert(
      {
        client_id: session.id,
        completed_at: session.status === "completed" ? session.updatedAt : null,
        context_snapshot: {
          durationSeconds: session.durationSeconds,
          partnerName: session.partnerName,
        },
        last_message_at: session.updatedAt,
        scene_key: session.sceneId,
        scene_id: null,
        started_at: session.startedAt,
        status: session.status,
        title: session.sceneTitle,
        user_id: userId,
      },
      { onConflict: "user_id,client_id" },
    )
    .select("id")
    .single()

  if (error || !data || typeof data.id !== "string") {
    throw error ?? new Error("Conversation upsert did not return an id.")
  }

  const messages = session.messages.map((message, position) => ({
    client_id: message.id,
    content: message.content,
    conversation_id: data.id,
    correction: {
      version: 1,
      position,
      timestamp: message.timestamp,
      note: message.note,
      ...(message.feedbackFor ? { feedbackFor: message.feedbackFor } : {}),
      ...(message.inputMode ? { inputMode: message.inputMode } : {}),
      ...(message.inputAnalysis ? { inputAnalysis: message.inputAnalysis } : {}),
      ...(message.validation ? { validation: message.validation } : {}),
    },
    role: message.role,
    translation: message.translation || null,
    user_id: userId,
  }))

  if (messages.length === 0) {
    return
  }
  const { error: messageError } = await client
    .from("conversation_messages")
    .upsert(messages, { onConflict: "conversation_id,client_id" })
  if (messageError) {
    throw messageError
  }
}

export async function deleteConversationSession({
  client,
  sessionId,
  userId,
}: {
  client: SupabaseClient
  sessionId: string
  userId: string
}) {
  const { error } = await client
    .from("conversations")
    .delete()
    .eq("user_id", userId)
    .eq("client_id", sessionId)
  if (error) {
    throw error
  }
}
