"use client"

import { useCallback, useEffect, useReducer, useRef } from "react"
import { toast } from "sonner"
import {
  type ConversationMessage,
  conversationRuntimeReducer,
  createConversationRuntimeState,
  createMessageId,
  createUserMessage,
} from "@/features/conversation/conversation-machine"
import {
  isConversationAbort,
  requestConversationReply,
} from "@/features/conversation/conversation-transport"
import { useConversationPrefs } from "@/features/conversation/use-conversation-prefs"
import { useConversationSessions } from "@/features/conversation/use-conversation-sessions"
import { useVoiceCallRuntime } from "@/features/conversation/use-voice-call-runtime"
import { formatCallDuration, normalizeSpeechTranscript } from "@/lib/call-runtime"
import {
  analyzeConversationInput,
  createExpressionValidation,
} from "@/lib/conversation-feedback"
import type { ConversationInputMode } from "@/lib/conversation-history"
import type { ConversationScene } from "@/lib/conversation-scenes"
import type { ConversationMemoryContextItem, ConversationTurnMemoryInput } from "@/lib/memory"
import { describeUserError } from "@/lib/user-error"

export type { ConversationMessage } from "@/features/conversation/conversation-machine"
export type { ConversationVoiceOption } from "@/features/conversation/use-voice-call-runtime"
export {
  voiceIdleReminderDelayMs,
  voiceIdleReminderLimit,
} from "@/features/conversation/use-voice-call-runtime"

function waitForQuestionWindow(delayMs: number, signal: AbortSignal) {
  if (delayMs <= 0) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort)
      resolve()
    }, delayMs)
    const handleAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException("Request aborted", "AbortError"))
    }
    signal.addEventListener("abort", handleAbort, { once: true })
  })
}

export function useVoiceConversation({
  scene,
  memoryContext = [],
  onForgetTurn,
  onTurnComplete,
}: {
  scene: ConversationScene
  memoryContext?: ConversationMemoryContextItem[]
  onForgetTurn?: (turnId: string) => void
  onTurnComplete?: (input: ConversationTurnMemoryInput) => void
}) {
  const { prefs } = useConversationPrefs()
  const [runtime, dispatch] = useReducer(
    conversationRuntimeReducer,
    scene,
    createConversationRuntimeState,
  )
  const {
    callActive,
    callSeconds,
    callStatus,
    currentSessionId,
    draft,
    history,
    idlePrompt,
    liveTranscript,
    messages,
    muted,
    pending,
    previewingVoice,
    speakerEnabled,
  } = runtime

  const {
    callSecondsRef,
    deleteSession,
    findSession,
    markLocalInteraction,
    messagesRef,
    persistSession,
    resetSession,
    restoreSession,
  } = useConversationSessions({
    currentSessionId,
    dispatch,
    initialMessages: messages,
    resumeWindowMs: prefs.sessionResumeMinutes * 60_000,
    scene,
  })
  const pendingRef = useRef(false)
  const conversationRequestRef = useRef(0)
  const conversationAbortRef = useRef<AbortController | null>(null)
  const submitMessageRef = useRef<
    (content: string, inputMode?: ConversationInputMode) => Promise<void>
  >(async () => {})

  const cancelRequest = useCallback(() => {
    conversationRequestRef.current += 1
    conversationAbortRef.current?.abort()
    conversationAbortRef.current = null
    pendingRef.current = false
    dispatch({ type: "request-finished" })
  }, [])

  const {
    apiVoice,
    asrEngineOptions,
    asrTransport,
    callActiveRef,
    endCall,
    endCallWithoutPersisting,
    interruptAssistant,
    mutedRef,
    previewVoice,
    selectApiVoice,
    selectAsrTransport,
    selectTtsTransport,
    selectedAsrEngine,
    selectedVoice,
    selectAsrEngine,
    selectVoice,
    speak,
    speakingRef,
    speechPlaybackState,
    speechRecognitionAvailable,
    speechRecognitionProgress,
    startCall: startVoiceCall,
    startRecognition,
    toggleMute,
    toggleSpeaker,
    ttsTransport,
    voiceOptions,
  } = useVoiceCallRuntime({
    callActive,
    callSecondsRef,
    cancelRequest,
    dispatch,
    messagesRef,
    pendingRef,
    persistSession,
    scene,
    submitMessageRef,
    voiceSentenceDelayMs: prefs.voiceSentenceDelayMs,
  })

  const submitMessage = useCallback(
    async (rawContent: string, inputMode: ConversationInputMode = "text", retry = false) => {
      const content = normalizeSpeechTranscript(rawContent)
      if (!content) {
        return
      }

      if (pendingRef.current || speakingRef.current) {
        interruptAssistant()
      }
      const requestId = conversationRequestRef.current + 1
      conversationRequestRef.current = requestId
      const abortController = new AbortController()
      conversationAbortRef.current = abortController
      pendingRef.current = true
      dispatch({ type: "request-started" })

      const requestMessages = retry
        ? messagesRef.current.filter((message) => !message.transient)
        : [
            ...messagesRef.current,
            createUserMessage(content, inputMode, callSecondsRef.current),
          ]
      messagesRef.current = requestMessages
      dispatch({
        type: "message-committed",
        messages: requestMessages,
        clearInput: !retry,
      })
      if (!retry) {
        persistSession(requestMessages)
      }
      // 重试复用同一条学习者消息，因此回合身份在重试前后保持不变。
      const turnMessage = requestMessages.findLast((message) => message.role === "user")
      const turnId = turnMessage?.id ?? createMessageId("user")
      const localInputAnalysis = analyzeConversationInput(content)

      try {
        await waitForQuestionWindow(
          inputMode === "text" ? prefs.consecutiveQuestionDelayMs : 0,
          abortController.signal,
        )
        const result = await requestConversationReply({
          scene,
          memoryContext,
          messages: requestMessages,
          conversationPrompt: prefs.conversationPrompt,
          signal: abortController.signal,
          tutorMode: prefs.tutorMode,
        })
        if (requestId !== conversationRequestRef.current) {
          return
        }

        const validation =
          result.validation ??
          createExpressionValidation(
            content,
            scene.focusPhrases[0]?.[1] ?? "Could you tell me more?",
            scene.tags[0] ?? "自然交流",
          )
        const inputAnalysis = result.inputAnalysis ?? localInputAnalysis
        const assistantMessage: ConversationMessage = {
          id: createMessageId("assistant"),
          role: "assistant",
          content: result.content,
          feedbackFor: content,
          inputAnalysis,
          translation: result.translation,
          note: result.recall,
          timestamp: formatCallDuration(callSecondsRef.current),
          validation,
          // The prompt is entirely the learner's, so a reply that missed the output contract is a
          // configuration problem they can fix. Marking the turn says so instead of letting the
          // degraded reply read as a normal turn.
          ...(result.contractApplied === false ? { variant: "prompt" as const } : {}),
        }
        const nextMessages = [...messagesRef.current, assistantMessage]
        messagesRef.current = nextMessages
        dispatch({ type: "message-committed", messages: nextMessages })
        persistSession(nextMessages)
        conversationAbortRef.current = null
        pendingRef.current = false
        dispatch({ type: "request-finished" })
        onTurnComplete?.({
          turnId,
          sceneId: scene.id,
          sceneTitle: scene.title,
          userInput: content,
          targetExpression:
            validation.status === "guidance"
              ? validation.corrected
              : (scene.focusPhrases[0]?.[1] ?? content),
          targetLabel:
            validation.status === "guidance"
              ? "本轮英文表达"
              : (scene.focusPhrases[0]?.[0] ?? scene.tags[0] ?? "自然表达"),
          corrected: validation.corrected,
          explanation: validation.explanation,
          accurate: validation.status !== "improve",
        })

        speak(assistantMessage.content)
      } catch (error) {
        if (
          requestId !== conversationRequestRef.current ||
          isConversationAbort(error, abortController.signal)
        ) {
          return
        }
        const errorMessage = describeUserError(error, "对话服务暂时不可用，请稍后重试。")
        const errorTurn: ConversationMessage = {
          id: createMessageId("assistant"),
          role: "assistant",
          content: errorMessage,
          translation: "",
          note: "",
          timestamp: formatCallDuration(callSecondsRef.current),
          transient: true,
          variant: "error",
        }
        const nextMessages = [...messagesRef.current, errorTurn]
        messagesRef.current = nextMessages
        dispatch({ type: "message-committed", messages: nextMessages })
        conversationAbortRef.current = null
        pendingRef.current = false
        dispatch({ type: "request-finished" })
        toast.error(errorMessage)
        if (callActiveRef.current && !mutedRef.current) {
          startRecognition()
        }
      }
    },
    [
      interruptAssistant,
      memoryContext,
      onTurnComplete,
      persistSession,
      prefs.conversationPrompt,
      prefs.consecutiveQuestionDelayMs,
      prefs.tutorMode,
      scene,
      speak,
      startRecognition,
    ],
  )

  submitMessageRef.current = submitMessage

  const sendDraft = useCallback(() => {
    if (callActiveRef.current) {
      return
    }
    void submitMessage(draft, "text")
  }, [draft, submitMessage])

  const startCall = useCallback(() => {
    markLocalInteraction()
    return startVoiceCall()
  }, [markLocalInteraction, startVoiceCall])

  const retryLastReply = useCallback(() => {
    const retryMessages = messagesRef.current.filter((message) => !message.transient)
    const latestUserMessage = retryMessages.findLast((message) => message.role === "user")
    if (!latestUserMessage) {
      return
    }
    messagesRef.current = retryMessages
    dispatch({ type: "message-committed", messages: retryMessages })
    void submitMessage(latestUserMessage.content, latestUserMessage.inputMode ?? "text", true)
  }, [messagesRef, submitMessage])

  /**
   * Removes one learner turn together with the partner reply it produced.
   *
   * Speech recognition mis-hears, and a learner needs to drop the bad transcript and re-send it.
   * Deleting only the learner turn would leave the transcript showing a partner answer to a
   * question that is no longer visible, so the pair is removed as a unit and the remaining turns
   * keep their order. When that empties the session, the session is dropped rather than stored:
   * `persistSession` deliberately refuses to keep a transcript without a learner turn.
   */
  const deleteMessage = useCallback(
    (messageId: string) => {
      const current = messagesRef.current
      const index = current.findIndex((message) => message.id === messageId)
      if (index === -1) {
        return
      }
      if (callActiveRef.current) {
        interruptAssistant()
      }
      const removeCount =
        current[index].role === "user" && current[index + 1]?.role === "assistant" ? 2 : 1
      const removed = current.slice(index, index + removeCount)
      const nextMessages = [...current.slice(0, index), ...current.slice(index + removeCount)]
      messagesRef.current = nextMessages
      dispatch({ type: "message-committed", messages: nextMessages })

      // 记录从转写里删掉，这一轮就不该继续计入记忆，否则进度与记录不一致。
      for (const message of removed) {
        if (message.role === "user") {
          onForgetTurn?.(message.id)
        }
      }

      if (nextMessages.some((message) => message.role === "user")) {
        persistSession(nextMessages)
      } else if (deleteSession(currentSessionId)) {
        resetSession(false)
      }
      toast.success("已删除该条消息")
    },
    [
      callActiveRef,
      currentSessionId,
      deleteSession,
      dispatch,
      interruptAssistant,
      messagesRef,
      onForgetTurn,
      persistSession,
      resetSession,
    ],
  )

  const startNewConversation = useCallback(() => {
    if (callActiveRef.current) {
      endCall()
    } else {
      interruptAssistant()
    }
    resetSession()
  }, [endCall, interruptAssistant, resetSession])

  const loadConversation = useCallback(
    (sessionId: string) => {
      const session = findSession(sessionId)
      if (!session) {
        return
      }
      if (callActiveRef.current) {
        endCall()
      } else {
        interruptAssistant()
      }
      restoreSession(session)
    },
    [endCall, findSession, interruptAssistant, restoreSession],
  )

  const deleteConversation = useCallback(
    (sessionId: string) => {
      const deletingCurrentSession = sessionId === currentSessionId
      if (deletingCurrentSession) {
        if (callActiveRef.current) {
          endCallWithoutPersisting()
        } else {
          interruptAssistant()
        }
      }
      if (deleteSession(sessionId)) {
        resetSession(false)
      }
    },
    [
      currentSessionId,
      deleteSession,
      endCallWithoutPersisting,
      interruptAssistant,
      resetSession,
    ],
  )

  useEffect(
    () => () => {
      conversationRequestRef.current += 1
      conversationAbortRef.current?.abort()
      conversationAbortRef.current = null
    },
    [],
  )

  const setDraft = useCallback(
    (nextDraft: string) => {
      markLocalInteraction()
      dispatch({ type: "draft-changed", draft: nextDraft })
    },
    [markLocalInteraction],
  )

  return {
    apiVoice,
    asrTransport,
    callActive,
    callSeconds,
    callStatus,
    currentSessionId,
    deleteConversation,
    deleteMessage,
    draft,
    endCall,
    history,
    idlePrompt,
    liveTranscript,
    loadConversation,
    messages,
    muted,
    pending,
    previewingVoice,
    previewVoice,
    retryLastReply,
    sendDraft,
    setDraft,
    selectedVoice,
    selectedAsrEngine,
    selectApiVoice,
    selectAsrEngine,
    selectAsrTransport,
    selectTtsTransport,
    selectVoice,
    speakerEnabled,
    speechPlaybackState,
    speechRecognitionAvailable,
    speechRecognitionProgress,
    speak,
    startCall,
    startNewConversation,
    toggleMute,
    toggleSpeaker,
    ttsTransport,
    voiceOptions,
    asrEngineOptions,
  }
}
