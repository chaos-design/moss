"use client"

import { type Dispatch, useCallback, useEffect, useRef } from "react"
import {
  type ConversationMessage,
  type ConversationRuntimeEvent,
  createOpeningMessage,
  createSessionId,
  createVisibleMessages,
} from "@/features/conversation/conversation-machine"
import {
  type ConversationSession,
  conversationHistoryStorageKey,
  conversationResumeWindowMs,
  findResumableConversationSession,
  getUserConversationHistoryStorageKey,
  mergeConversationHistories,
  readConversationHistory,
  removeConversationSession,
  saveConversationSession,
  writeConversationHistory,
} from "@/lib/conversation-history"
import type { ConversationScene } from "@/lib/conversation-scenes"
import {
  deleteCloudConversationSession,
  loadCloudConversationHistory,
  saveCloudConversationSession,
} from "@/lib/conversation-sync"
import { getSupabasePublicConfig } from "@/lib/supabase/config"

export function useConversationSessions({
  currentSessionId,
  dispatch,
  initialMessages,
  resumeWindowMs = conversationResumeWindowMs,
  scene,
}: {
  currentSessionId: string
  dispatch: Dispatch<ConversationRuntimeEvent>
  initialMessages: ConversationMessage[]
  resumeWindowMs?: number
  scene: ConversationScene
}) {
  const messagesRef = useRef(initialMessages)
  const historyRef = useRef<ConversationSession[]>([])
  const currentSessionIdRef = useRef(currentSessionId)
  const sessionStartedAtRef = useRef(new Date().toISOString())
  const callSecondsRef = useRef(0)
  const storageKeyRef = useRef(conversationHistoryStorageKey)
  const hasLocalInteractionRef = useRef(false)

  const markLocalInteraction = useCallback(() => {
    hasLocalInteractionRef.current = true
  }, [])

  const updateVisibleHistory = useCallback(
    (nextHistory: ConversationSession[]) => {
      historyRef.current = nextHistory
      dispatch({
        type: "history-updated",
        history: nextHistory.filter((session) => session.sceneId === scene.id),
      })
    },
    [dispatch, scene.id],
  )

  const persistSession = useCallback(
    (nextMessages: ConversationMessage[]) => {
      const persistentMessages = createVisibleMessages(nextMessages)
      if (!persistentMessages.some((message) => message.role === "user")) {
        return
      }
      const now = new Date().toISOString()
      const session: ConversationSession = {
        id: currentSessionIdRef.current,
        sceneId: scene.id,
        sceneTitle: scene.title,
        partnerName: scene.partnerName,
        startedAt: sessionStartedAtRef.current,
        updatedAt: now,
        durationSeconds: callSecondsRef.current,
        status: "active",
        messages: persistentMessages,
      }
      updateVisibleHistory(
        saveConversationSession(historyRef.current, session, storageKeyRef.current),
      )
      hasLocalInteractionRef.current = true
      void saveCloudConversationSession(session).catch(() => {})
    },
    [scene.id, scene.partnerName, scene.title, updateVisibleHistory],
  )

  useEffect(() => {
    const storedHistory = readConversationHistory()
    const resumableSession = findResumableConversationSession(
      storedHistory,
      scene.id,
      new Date(),
      resumeWindowMs,
    )
    updateVisibleHistory(storedHistory)
    if (resumableSession) {
      currentSessionIdRef.current = resumableSession.id
      sessionStartedAtRef.current = resumableSession.startedAt
      callSecondsRef.current = resumableSession.durationSeconds
      messagesRef.current = resumableSession.messages
      dispatch({ type: "session-restored", session: resumableSession })
    }

    if (!getSupabasePublicConfig()) {
      return
    }

    const abortController = new AbortController()
    void loadCloudConversationHistory(abortController.signal)
      .then((result) => {
        if (!result) {
          return
        }
        const userStorageKey = getUserConversationHistoryStorageKey(result.userId)
        const userHistory = readConversationHistory(userStorageKey)
        const localHistory = mergeConversationHistories(historyRef.current, userHistory)
        const cloudById = new Map(result.sessions.map((session) => [session.id, session]))
        const pendingUploads = localHistory.filter((session) => {
          const cloudSession = cloudById.get(session.id)
          return !cloudSession || session.updatedAt > cloudSession.updatedAt
        })
        const merged = mergeConversationHistories(localHistory, result.sessions)
        storageKeyRef.current = userStorageKey
        writeConversationHistory(merged, userStorageKey)
        window.localStorage.removeItem(conversationHistoryStorageKey)
        updateVisibleHistory(merged)
        for (const session of pendingUploads) {
          void saveCloudConversationSession(session).catch(() => {})
        }

        if (hasLocalInteractionRef.current) {
          return
        }
        const cloudResumable = findResumableConversationSession(
          merged,
          scene.id,
          new Date(),
          resumeWindowMs,
        )
        if (!cloudResumable) {
          return
        }
        currentSessionIdRef.current = cloudResumable.id
        sessionStartedAtRef.current = cloudResumable.startedAt
        callSecondsRef.current = cloudResumable.durationSeconds
        messagesRef.current = cloudResumable.messages
        dispatch({ type: "session-restored", session: cloudResumable })
      })
      .catch(() => {})

    return () => abortController.abort()
  }, [dispatch, resumeWindowMs, scene.id, updateVisibleHistory])

  const resetSession = useCallback(
    (completeCurrent = true) => {
      if (completeCurrent && messagesRef.current.some((message) => message.role === "user")) {
        const now = new Date().toISOString()
        const current = historyRef.current.find(
          (session) => session.id === currentSessionIdRef.current,
        )
        if (current) {
          const completed = { ...current, status: "completed" as const, updatedAt: now }
          updateVisibleHistory(
            saveConversationSession(historyRef.current, completed, storageKeyRef.current),
          )
          void saveCloudConversationSession(completed).catch(() => {})
        }
      }

      const nextSessionId = createSessionId(scene.id)
      const opening = createOpeningMessage(scene)
      currentSessionIdRef.current = nextSessionId
      sessionStartedAtRef.current = new Date().toISOString()
      callSecondsRef.current = 0
      messagesRef.current = [opening]
      hasLocalInteractionRef.current = true
      dispatch({ type: "session-reset", currentSessionId: nextSessionId, opening })
    },
    [dispatch, scene, updateVisibleHistory],
  )

  const findSession = useCallback(
    (sessionId: string) =>
      historyRef.current.find(
        (session) => session.id === sessionId && session.sceneId === scene.id,
      ),
    [scene.id],
  )

  const restoreSession = useCallback(
    (session: ConversationSession) => {
      const now = new Date().toISOString()
      const completedSessions: ConversationSession[] = []
      const historyWithCompletedCurrent = historyRef.current.map((item) => {
        if (
          item.sceneId !== scene.id ||
          item.id === session.id ||
          item.status === "completed"
        ) {
          return item
        }
        const completed = { ...item, status: "completed" as const, updatedAt: now }
        completedSessions.push(completed)
        return completed
      })
      const resumedSession = {
        ...session,
        status: "active" as const,
        updatedAt: now,
      }
      updateVisibleHistory(
        saveConversationSession(
          historyWithCompletedCurrent,
          resumedSession,
          storageKeyRef.current,
        ),
      )
      for (const completed of completedSessions) {
        void saveCloudConversationSession(completed).catch(() => {})
      }
      void saveCloudConversationSession(resumedSession).catch(() => {})
      currentSessionIdRef.current = resumedSession.id
      sessionStartedAtRef.current = resumedSession.startedAt
      callSecondsRef.current = resumedSession.durationSeconds
      messagesRef.current = resumedSession.messages
      hasLocalInteractionRef.current = true
      dispatch({ type: "session-restored", session: resumedSession })
    },
    [dispatch, scene.id, updateVisibleHistory],
  )

  const deleteSession = useCallback(
    (sessionId: string) => {
      updateVisibleHistory(
        removeConversationSession(historyRef.current, sessionId, storageKeyRef.current),
      )
      hasLocalInteractionRef.current = true
      void deleteCloudConversationSession(sessionId).catch(() => {})
      return sessionId === currentSessionIdRef.current
    },
    [updateVisibleHistory],
  )

  return {
    callSecondsRef,
    currentSessionIdRef,
    deleteSession,
    findSession,
    markLocalInteraction,
    messagesRef,
    persistSession,
    resetSession,
    restoreSession,
  }
}
