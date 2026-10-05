"use client"

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { RecallRating } from "@/lib/memory"
import {
  type ConversationTurnMemoryInput,
  createEmptyLearningMemory,
  type ExpressionStudyMemoryInput,
  getLearningMemoryFingerprint,
  type LearnerProfile,
  type LearningMemorySnapshotRow,
  type LearningMemoryState,
  type LearningMemorySyncStatus,
  mergeLearningMemory,
  type PracticeMemoryWrite,
  parseLearningMemory,
  parseLearningMemorySnapshot,
  recordConversationMemory,
  recordExpressionStudy,
  recordReviewMemory,
  recordShadowingMemory,
  type ShadowingAttemptMemoryInput,
  savePracticeMemoryDocument,
  updateLearnerProfile,
} from "@/lib/memory"
import { isDemoMode } from "@/lib/runtime-mode"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export const learningMemoryStorageKey = "moss:learning-memory:v1"
const deviceIdStorageKey = "moss:device-id:v1"
const syncDelayMs = 700
const maxSyncAttempts = 3

type LearningMemoryContextValue = {
  state: LearningMemoryState
  hydrated: boolean
  syncStatus: LearningMemorySyncStatus
  lastSyncedAt: string | null
  syncError: string
  recordConversationTurn: (input: ConversationTurnMemoryInput) => void
  rateReview: (itemId: string, rating: RecallRating) => void
  recordShadowingAttempt: (input: ShadowingAttemptMemoryInput) => void
  recordExpressionStudy: (input: ExpressionStudyMemoryInput) => void
  updateProfile: (profile: Partial<LearnerProfile>) => void
  resetMemory: () => void
  syncNow: () => void
}

const LearningMemoryContext = createContext<LearningMemoryContextValue | null>(null)

function createDeviceId() {
  const storedId = window.localStorage.getItem(deviceIdStorageKey)
  if (storedId) {
    return storedId
  }

  const id =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  window.localStorage.setItem(deviceIdStorageKey, id)
  return id
}

export function getUserLearningMemoryStorageKey(userId: string) {
  return `${learningMemoryStorageKey}:${userId}`
}

function parseSnapshotRow(value: unknown): LearningMemorySnapshotRow | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== "object") {
    return null
  }

  const candidate = row as Partial<LearningMemorySnapshotRow>
  if (
    typeof candidate.revision !== "number" ||
    typeof candidate.updated_at !== "string" ||
    typeof candidate.device_id !== "string"
  ) {
    return null
  }

  return candidate as LearningMemorySnapshotRow
}

function getSyncErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown }
    if (candidate.code === "PGRST202" || candidate.code === "PGRST205") {
      return "云端记忆结构尚未初始化，请执行 Supabase 更新脚本。"
    }
    if (typeof candidate.message === "string" && candidate.message) {
      return candidate.message
    }
  }
  return "学习记忆同步失败，本机记录不受影响。"
}

export function LearningMemoryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LearningMemoryState>(() => createEmptyLearningMemory())
  const [hydrated, setHydrated] = useState(false)
  const [syncStatus, setSyncStatus] = useState<LearningMemorySyncStatus>("connecting")
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [syncError, setSyncError] = useState("")

  const stateRef = useRef(state)
  const localStorageKeyRef = useRef(learningMemoryStorageKey)
  const hasStoredLocalMemoryRef = useRef(false)
  const cloudReadyRef = useRef(false)
  const cloudInitializingRef = useRef(false)
  const syncInFlightRef = useRef(false)
  const pendingSyncRef = useRef(false)
  const remoteRevisionRef = useRef(0)
  const deviceIdRef = useRef("")
  const userIdRef = useRef("")
  const clientRef = useRef<SupabaseClient | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSyncedFingerprintRef = useRef("")
  const runCloudSyncRef = useRef<(candidate?: LearningMemoryState) => Promise<void>>(
    async () => {},
  )
  const initializeCloudMemoryRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    const storedValue = window.localStorage.getItem(learningMemoryStorageKey)
    hasStoredLocalMemoryRef.current = Boolean(storedValue)
    if (storedValue) {
      try {
        const storedState = parseLearningMemory(JSON.parse(storedValue))
        stateRef.current = storedState
        setState(storedState)
      } catch {
        const fallback = createEmptyLearningMemory()
        stateRef.current = fallback
        setState(fallback)
      }
    }
    deviceIdRef.current = createDeviceId()
    setHydrated(true)
  }, [])

  useEffect(() => {
    stateRef.current = state
    if (hydrated) {
      window.localStorage.setItem(localStorageKeyRef.current, JSON.stringify(state))
    }
  }, [hydrated, state])

  const runCloudSync = useCallback(async (candidate?: LearningMemoryState) => {
    const client = clientRef.current
    const userId = userIdRef.current
    if (!client || !userId || !cloudReadyRef.current) {
      return
    }
    if (!window.navigator.onLine) {
      setSyncStatus("offline")
      return
    }
    if (syncInFlightRef.current) {
      pendingSyncRef.current = true
      return
    }

    syncInFlightRef.current = true
    setSyncStatus("syncing")
    setSyncError("")
    let stateToSync = candidate ?? stateRef.current

    try {
      for (let attempt = 0; attempt < maxSyncAttempts; attempt += 1) {
        const expectedRevision = remoteRevisionRef.current
        const { data, error } = await client.rpc("sync_learning_memory", {
          p_device_id: deviceIdRef.current,
          p_expected_revision: expectedRevision,
          p_state: stateToSync,
        })
        if (error) {
          throw error
        }

        const row = parseSnapshotRow(data)
        if (!row) {
          throw new Error("Supabase 未返回有效的学习记忆快照。")
        }

        remoteRevisionRef.current = row.revision
        const remoteState = parseLearningMemorySnapshot(row)
        const writeSucceeded =
          row.device_id === deviceIdRef.current &&
          getLearningMemoryFingerprint(remoteState) ===
            getLearningMemoryFingerprint(stateToSync)

        if (writeSucceeded) {
          lastSyncedFingerprintRef.current = getLearningMemoryFingerprint(remoteState)
          setLastSyncedAt(row.updated_at)
          setSyncStatus("synced")
          return
        }

        stateToSync = mergeLearningMemory(stateToSync, remoteState)
        stateRef.current = stateToSync
        setState(stateToSync)
      }

      throw new Error("其他设备正在持续更新，请稍后再次同步。")
    } catch (error) {
      setSyncStatus(window.navigator.onLine ? "error" : "offline")
      setSyncError(getSyncErrorMessage(error))
    } finally {
      syncInFlightRef.current = false
      if (pendingSyncRef.current) {
        pendingSyncRef.current = false
        window.setTimeout(() => {
          void runCloudSyncRef.current()
        }, syncDelayMs)
      }
    }
  }, [])

  runCloudSyncRef.current = runCloudSync

  useEffect(() => {
    if (!hydrated) {
      return
    }

    if (isDemoMode()) {
      setSyncStatus("local")
      return
    }

    const client = getSupabaseBrowserClient()
    if (!client) {
      setSyncStatus("local")
      return
    }

    let disposed = false

    async function initializeCloudMemory() {
      if (cloudInitializingRef.current || cloudReadyRef.current) {
        return
      }
      if (!window.navigator.onLine) {
        setSyncStatus("offline")
        return
      }

      cloudInitializingRef.current = true
      setSyncStatus("connecting")
      const {
        data: { user },
        error: userError,
      } = await client.auth.getUser()

      if (disposed) {
        cloudInitializingRef.current = false
        return
      }
      if (userError || !user) {
        cloudInitializingRef.current = false
        setSyncStatus("local")
        return
      }

      clientRef.current = client
      userIdRef.current = user.id
      const userStorageKey = getUserLearningMemoryStorageKey(user.id)
      const userStoredValue = window.localStorage.getItem(userStorageKey)
      if (userStoredValue) {
        try {
          const userStoredState = parseLearningMemory(JSON.parse(userStoredValue))
          stateRef.current = userStoredState
          hasStoredLocalMemoryRef.current = true
          setState(userStoredState)
        } catch {
          const fallback = createEmptyLearningMemory()
          stateRef.current = fallback
          hasStoredLocalMemoryRef.current = false
          setState(fallback)
        }
      }
      localStorageKeyRef.current = userStorageKey
      window.localStorage.removeItem(learningMemoryStorageKey)

      const { data, error } = await client
        .from("learning_memory_snapshots")
        .select("state, revision, updated_at, device_id")
        .eq("user_id", user.id)
        .maybeSingle()

      if (disposed) {
        cloudInitializingRef.current = false
        return
      }
      if (error) {
        cloudInitializingRef.current = false
        setSyncStatus(window.navigator.onLine ? "error" : "offline")
        setSyncError(getSyncErrorMessage(error))
        return
      }

      const row = parseSnapshotRow(data)
      if (row) {
        remoteRevisionRef.current = row.revision
        const remoteState = parseLearningMemorySnapshot(row)
        const nextState = hasStoredLocalMemoryRef.current
          ? mergeLearningMemory(stateRef.current, remoteState)
          : remoteState
        stateRef.current = nextState
        lastSyncedFingerprintRef.current = getLearningMemoryFingerprint(remoteState)
        window.localStorage.setItem(userStorageKey, JSON.stringify(nextState))
        setState(nextState)
        setLastSyncedAt(row.updated_at)
        setSyncStatus("synced")
      }

      cloudReadyRef.current = true
      if (!row) {
        window.localStorage.setItem(userStorageKey, JSON.stringify(stateRef.current))
      }
      channelRef.current = client
        .channel(`learning-memory:${user.id}:${deviceIdRef.current}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "learning_memory_snapshots",
            filter: `user_id=eq.${user.id}`,
          },
          (payload: { new: unknown }) => {
            const incomingRow = parseSnapshotRow(payload.new)
            if (!incomingRow || incomingRow.device_id === deviceIdRef.current) {
              return
            }

            remoteRevisionRef.current = Math.max(
              remoteRevisionRef.current,
              incomingRow.revision,
            )
            const remoteState = parseLearningMemorySnapshot(incomingRow)
            lastSyncedFingerprintRef.current = getLearningMemoryFingerprint(remoteState)
            setLastSyncedAt(incomingRow.updated_at)
            setSyncStatus("synced")
            setState((current) => {
              const merged = mergeLearningMemory(current, remoteState)
              stateRef.current = merged
              return merged
            })
          },
        )
        .subscribe()

      if (!row) {
        void runCloudSyncRef.current(stateRef.current)
      }
      cloudInitializingRef.current = false
    }

    initializeCloudMemoryRef.current = initializeCloudMemory
    void initializeCloudMemory().catch((error) => {
      cloudInitializingRef.current = false
      setSyncStatus(window.navigator.onLine ? "error" : "offline")
      setSyncError(getSyncErrorMessage(error))
    })

    return () => {
      disposed = true
      cloudReadyRef.current = false
      cloudInitializingRef.current = false
      initializeCloudMemoryRef.current = async () => {}
      userIdRef.current = ""
      const channel = channelRef.current
      channelRef.current = null
      if (channel) {
        void client.removeChannel(channel)
      }
    }
  }, [hydrated])

  useEffect(() => {
    if (!hydrated || !cloudReadyRef.current) {
      return
    }
    if (getLearningMemoryFingerprint(state) === lastSyncedFingerprintRef.current) {
      return
    }

    const timer = window.setTimeout(() => {
      void runCloudSyncRef.current(state)
    }, syncDelayMs)
    return () => window.clearTimeout(timer)
  }, [hydrated, state])

  useEffect(() => {
    function handleOffline() {
      if (cloudReadyRef.current) {
        setSyncStatus("offline")
      }
    }

    function handleOnline() {
      if (cloudReadyRef.current) {
        void runCloudSyncRef.current()
      } else {
        void initializeCloudMemoryRef.current()
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== localStorageKeyRef.current || !event.newValue) {
        return
      }
      try {
        const incomingState = parseLearningMemory(JSON.parse(event.newValue))
        setState((current) => {
          const merged = mergeLearningMemory(current, incomingState)
          stateRef.current = merged
          return merged
        })
      } catch {
        // Ignore malformed writes from another tab and retain the current state.
      }
    }

    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)
    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  const saveVectorMemory = useCallback((memory: PracticeMemoryWrite) => {
    if (!clientRef.current || !userIdRef.current) {
      return
    }
    void savePracticeMemoryDocument(memory).then((stored) => {
      if (!stored) {
        setSyncError("学习结果已保存在本机，长期向量记忆写入失败。")
      }
    })
  }, [])

  const recordConversationTurn = useCallback((input: ConversationTurnMemoryInput) => {
    const nextState = recordConversationMemory(stateRef.current, input)
    stateRef.current = nextState
    setState(nextState)
  }, [])

  const rateReview = useCallback(
    (itemId: string, rating: RecallRating) => {
      const currentItem = stateRef.current.items.find((item) => item.id === itemId)
      if (!currentItem) {
        return
      }
      const nextState = recordReviewMemory(stateRef.current, itemId, rating)
      const nextItem = nextState.items.find((item) => item.id === itemId)
      stateRef.current = nextState
      setState(nextState)
      if (!nextItem) {
        return
      }
      saveVectorMemory({
        sourceType: "review",
        sourceId: nextItem.id,
        sceneId: nextItem.sourceSceneId,
        sceneTitle: nextItem.sourceSceneTitle,
        label: nextItem.label,
        expression: nextItem.answer,
        explanation: nextItem.explanation || "根据本轮找回结果调整复习计划。",
        strength: nextItem.strength,
        rating,
        successful: rating !== "again",
      })
    },
    [saveVectorMemory],
  )

  const recordShadowingAttempt = useCallback(
    (input: ShadowingAttemptMemoryInput) => {
      const nextState = recordShadowingMemory(stateRef.current, input)
      const nextItem = nextState.items.find((item) => item.id === input.itemId)
      stateRef.current = nextState
      setState(nextState)
      if (nextItem) {
        saveVectorMemory({
          sourceType: "shadowing",
          sourceId: nextItem.id,
          sceneId: nextItem.sourceSceneId,
          sceneTitle: nextItem.sourceSceneTitle,
          label: nextItem.label,
          expression: nextItem.answer,
          explanation: nextItem.explanation || "根据跟读评分继续改善发音和节奏。",
          strength: nextItem.strength,
          focusWord: input.focusWord,
          overallScore: input.overallScore,
          clarityScore: input.clarityScore,
          fluencyScore: input.fluencyScore,
          rhythmScore: input.rhythmScore,
          durationSeconds: input.durationSeconds,
        })
      }
      const client = clientRef.current
      const userId = userIdRef.current
      if (!client || !userId) {
        return
      }
      void client
        .from("shadowing_attempts")
        .insert({
          user_id: userId,
          scene_id: null,
          sentence: input.sentence,
          audio_path: null,
          pronunciation_score: input.clarityScore,
          intonation_score: input.fluencyScore,
          rhythm_score: input.rhythmScore,
          feedback: {
            exerciseId: input.itemId,
            logicalSceneId: input.sceneId,
            overallScore: input.overallScore,
            durationSeconds: input.durationSeconds,
          },
        })
        .then(({ error }) => {
          if (error) {
            setSyncError("跟读结果已保存在本机，云端明细写入失败。")
          }
        })
    },
    [saveVectorMemory],
  )

  const recordExpressionStudyAttempt = useCallback(
    (input: ExpressionStudyMemoryInput) => {
      const nextState = recordExpressionStudy(stateRef.current, input)
      const nextItem = nextState.items.find((item) => item.id === input.itemId)
      stateRef.current = nextState
      setState(nextState)
      if (!nextItem) {
        return
      }
      saveVectorMemory({
        sourceType: "expression",
        sourceId: nextItem.id,
        sceneId: input.sceneCategory,
        sceneTitle: input.sceneTitle,
        label: nextItem.label,
        expression: nextItem.answer,
        explanation: nextItem.explanation || input.explanation,
        strength: nextItem.strength,
        libraryKind: input.libraryKind,
        example: input.example,
      })
    },
    [saveVectorMemory],
  )

  const updateProfile = useCallback((profile: Partial<LearnerProfile>) => {
    const nextState = updateLearnerProfile(stateRef.current, profile)
    stateRef.current = nextState
    setState(nextState)
  }, [])

  const resetMemory = useCallback(() => {
    const nextState = createEmptyLearningMemory()
    stateRef.current = nextState
    setState(nextState)
  }, [])

  const syncNow = useCallback(() => {
    if (cloudReadyRef.current) {
      void runCloudSyncRef.current()
    } else {
      void initializeCloudMemoryRef.current()
    }
  }, [])

  const value = useMemo(
    () => ({
      state,
      hydrated,
      syncStatus,
      lastSyncedAt,
      syncError,
      recordConversationTurn,
      rateReview,
      recordShadowingAttempt,
      recordExpressionStudy: recordExpressionStudyAttempt,
      updateProfile,
      resetMemory,
      syncNow,
    }),
    [
      state,
      hydrated,
      syncStatus,
      lastSyncedAt,
      syncError,
      recordConversationTurn,
      rateReview,
      recordShadowingAttempt,
      recordExpressionStudyAttempt,
      updateProfile,
      resetMemory,
      syncNow,
    ],
  )

  return (
    <LearningMemoryContext.Provider value={value}>{children}</LearningMemoryContext.Provider>
  )
}

export function useLearningMemory() {
  const context = useContext(LearningMemoryContext)
  if (!context) {
    throw new Error("useLearningMemory must be used within LearningMemoryProvider")
  }
  return context
}
