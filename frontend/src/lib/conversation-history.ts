import type {
  ConversationInputAnalysis,
  ExpressionValidation,
} from "@/lib/conversation-feedback"

export const conversationHistoryStorageKey = "moss:conversation-history:v1"
export const conversationSceneStorageKey = "moss:conversation-scene:v1"
export const conversationResumeWindowMs = 30 * 60 * 1000

const historyVersion = 1

export type ConversationInputMode = "text" | "voice"
export type ConversationSessionStatus = "active" | "completed"

export type StoredConversationMessage = {
  id: string
  role: "assistant" | "user"
  content: string
  feedbackFor?: string
  inputAnalysis?: ConversationInputAnalysis
  inputMode?: ConversationInputMode
  translation: string
  note: string
  timestamp: string
  validation?: ExpressionValidation
}

export type ConversationSession = {
  id: string
  sceneId: string
  sceneTitle: string
  partnerName: string
  startedAt: string
  updatedAt: string
  durationSeconds: number
  status: ConversationSessionStatus
  messages: StoredConversationMessage[]
}

type ConversationHistoryState = {
  version: typeof historyVersion
  sessions: ConversationSession[]
}

export function isStoredConversationMessage(
  value: unknown,
): value is StoredConversationMessage {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<StoredConversationMessage>
  return (
    typeof candidate.id === "string" &&
    (candidate.role === "assistant" || candidate.role === "user") &&
    typeof candidate.content === "string" &&
    typeof candidate.translation === "string" &&
    typeof candidate.note === "string" &&
    typeof candidate.timestamp === "string" &&
    (candidate.inputMode === undefined ||
      candidate.inputMode === "text" ||
      candidate.inputMode === "voice")
  )
}

export function parseConversationSession(value: unknown): ConversationSession | null {
  if (!value || typeof value !== "object") {
    return null
  }
  const candidate = value as Partial<ConversationSession>
  if (
    typeof candidate.id === "string" &&
    typeof candidate.sceneId === "string" &&
    typeof candidate.sceneTitle === "string" &&
    typeof candidate.partnerName === "string" &&
    typeof candidate.startedAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.durationSeconds === "number" &&
    Array.isArray(candidate.messages) &&
    candidate.messages.every(isStoredConversationMessage)
  ) {
    return {
      ...candidate,
      status: candidate.status === "completed" ? "completed" : "active",
    } as ConversationSession
  }
  return null
}

export function parseConversationHistory(value: string | null): ConversationSession[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as Partial<ConversationHistoryState>
    if (parsed.version !== historyVersion || !Array.isArray(parsed.sessions)) {
      return []
    }
    return parsed.sessions
      .map(parseConversationSession)
      .filter((session): session is ConversationSession => Boolean(session))
  } catch {
    return []
  }
}

export function getUserConversationHistoryStorageKey(userId: string) {
  return `${conversationHistoryStorageKey}:${userId}`
}

export function readConversationHistory(
  storageKey = conversationHistoryStorageKey,
): ConversationSession[] {
  if (typeof window === "undefined") {
    return []
  }
  return parseConversationHistory(window.localStorage.getItem(storageKey))
}

export function writeConversationHistory(
  sessions: ConversationSession[],
  storageKey = conversationHistoryStorageKey,
) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: historyVersion,
        sessions,
      }),
    )
  }
}

export function findResumableConversationSession(
  sessions: ConversationSession[],
  sceneId: string,
  now = new Date(),
  resumeWindowMs = conversationResumeWindowMs,
) {
  const nowTime = now.getTime()
  return sessions
    .filter((session) => session.sceneId === sceneId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .find((session) => {
      const updatedAt = new Date(session.updatedAt).getTime()
      return (
        session.status === "active" &&
        Number.isFinite(updatedAt) &&
        nowTime - updatedAt <= resumeWindowMs
      )
    })
}

export function readLastConversationScene(sessions = readConversationHistory()) {
  if (typeof window === "undefined") {
    return sessions[0]?.sceneId ?? null
  }
  return (
    window.localStorage.getItem(conversationSceneStorageKey) ?? sessions[0]?.sceneId ?? null
  )
}

export function saveLastConversationScene(sceneId: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(conversationSceneStorageKey, sceneId)
  }
}

export function saveConversationSession(
  sessions: ConversationSession[],
  session: ConversationSession,
  storageKey = conversationHistoryStorageKey,
): ConversationSession[] {
  const next = [session, ...sessions.filter((item) => item.id !== session.id)].sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt),
  )

  writeConversationHistory(next, storageKey)
  return next
}

export function removeConversationSession(
  sessions: ConversationSession[],
  sessionId: string,
  storageKey = conversationHistoryStorageKey,
): ConversationSession[] {
  const next = sessions.filter((item) => item.id !== sessionId)
  writeConversationHistory(next, storageKey)
  return next
}

export function mergeConversationHistories(
  ...histories: ConversationSession[][]
): ConversationSession[] {
  const sessions = new Map<string, ConversationSession>()
  for (const history of histories) {
    for (const session of history) {
      const current = sessions.get(session.id)
      if (!current || session.updatedAt >= current.updatedAt) {
        sessions.set(session.id, session)
      }
    }
  }
  return [...sessions.values()].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )
}

export function getConversationTurnCount(messages: StoredConversationMessage[]) {
  return messages.reduce((count, message) => count + (message.role === "user" ? 1 : 0), 0)
}
