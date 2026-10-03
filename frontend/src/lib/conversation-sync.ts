import type { ConversationSession } from "@/lib/conversation-history"

type ConversationHistoryResponse = {
  data?: {
    nextCursor?: string | null
    sessions?: ConversationSession[]
    userId?: string
  }
}

const sessionOperations = new Map<string, Promise<unknown>>()

async function readJson(response: Response): Promise<ConversationHistoryResponse> {
  try {
    return (await response.json()) as ConversationHistoryResponse
  } catch {
    return {}
  }
}

async function enqueueSessionOperation<T>(
  sessionId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = sessionOperations.get(sessionId) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  sessionOperations.set(sessionId, current)
  try {
    return await current
  } finally {
    if (sessionOperations.get(sessionId) === current) {
      sessionOperations.delete(sessionId)
    }
  }
}

export async function loadCloudConversationHistory(signal?: AbortSignal) {
  const sessions: ConversationSession[] = []
  const visitedCursors = new Set<string>()
  let cursor: string | null = null
  let userId: string | null = null

  while (true) {
    const path = cursor
      ? `/api/conversations?cursor=${encodeURIComponent(cursor)}`
      : "/api/conversations"
    const response = await fetch(path, {
      method: "GET",
      signal,
    })
    if (response.status === 401 || response.status === 503) {
      return null
    }
    if (!response.ok) {
      throw new Error("Cloud conversation history is unavailable.")
    }

    const payload = await readJson(response)
    const pageUserId = payload.data?.userId
    const pageSessions = payload.data?.sessions
    const nextCursor = payload.data?.nextCursor ?? null
    if (
      typeof pageUserId !== "string" ||
      !Array.isArray(pageSessions) ||
      (nextCursor !== null && typeof nextCursor !== "string") ||
      (userId !== null && userId !== pageUserId) ||
      (nextCursor !== null && visitedCursors.has(nextCursor))
    ) {
      throw new Error("Cloud conversation history returned an invalid response.")
    }

    userId = pageUserId
    sessions.push(...pageSessions)
    if (nextCursor === null) {
      return { sessions, userId }
    }
    visitedCursors.add(nextCursor)
    cursor = nextCursor
  }
}

export async function saveCloudConversationSession(session: ConversationSession) {
  return enqueueSessionOperation(session.id, async () => {
    const response = await fetch("/api/conversations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    })
    if (response.status === 401 || response.status === 503) {
      return false
    }
    if (!response.ok) {
      throw new Error("Cloud conversation session could not be saved.")
    }
    return true
  })
}

export async function deleteCloudConversationSession(sessionId: string) {
  return enqueueSessionOperation(sessionId, async () => {
    const response = await fetch(
      `/api/conversations?sessionId=${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
    )
    if (response.status === 401 || response.status === 503) {
      return false
    }
    if (!response.ok) {
      throw new Error("Cloud conversation session could not be deleted.")
    }
    return true
  })
}
