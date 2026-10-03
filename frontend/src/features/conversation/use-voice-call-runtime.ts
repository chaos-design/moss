"use client"

import { type Dispatch, type MutableRefObject, useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import type {
  ConversationMessage,
  ConversationRuntimeEvent,
} from "@/features/conversation/conversation-machine"
import { useAsrConfig } from "@/features/speech/use-asr-config"
import { useLocalTts } from "@/features/speech/use-local-tts"
import { useStreamingAsr } from "@/features/speech/use-streaming-asr"
import { useTtsConfig } from "@/features/speech/use-tts-config"
import { asrEngineOptions } from "@/lib/asr-config"
import { isLikelyPlaybackEcho, normalizeSpeechTranscript } from "@/lib/call-runtime"
import type { ConversationInputMode } from "@/lib/conversation-history"
import type { ConversationScene } from "@/lib/conversation-scenes"
import { isSupportedSpeechTranscript } from "@/lib/language-detection"
import { getSelectedVoiceValue, ttsVoiceOptions } from "@/lib/tts-config"

export type ConversationVoiceOption = {
  value: string
  label: string
  name: string
  language: string
  quality: string
}

const voiceOptions: ConversationVoiceOption[] = ttsVoiceOptions
export const voiceIdleReminderDelayMs = 60_000
export const voiceIdleReminderLimit = 3
const voiceIdlePrompts = [
  {
    display: "已经一分钟没有听到声音了。你有任何问题吗？可以用中文或英文回答。",
    speech: "Do you have any questions? You can answer in Chinese or English.",
  },
  {
    display: "如果不知道说什么，可以让我重复或解释上一句话。",
    speech: "If you are not sure what to say, ask me to repeat or explain the last sentence.",
  },
  {
    display: "还要继续吗？请用中文或英文回应，否则一分钟后将自动结束。",
    speech:
      "Would you like to continue? Please respond in Chinese or English, or the call will end in one minute.",
  },
] as const

const voicePreviewSample = "Hi there! Let's practice English together."
const chineseVoicePreviewSample = "你好，很高兴和你一起练习。"
const playbackEchoGuardMs = 5_000

function scheduleIdleTask(callback: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 2500 })
    return () => window.cancelIdleCallback(handle)
  }

  const handle = window.setTimeout(callback, 600)
  return () => window.clearTimeout(handle)
}

function combineVoiceSegments(segments: string[]) {
  return normalizeSpeechTranscript(segments.join(" ")).replace(
    /([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,
    "$1",
  )
}

export function useVoiceCallRuntime({
  callActive,
  callSecondsRef,
  cancelRequest,
  dispatch,
  messagesRef,
  pendingRef,
  persistSession,
  scene,
  submitMessageRef,
  voiceSentenceDelayMs,
}: {
  callActive: boolean
  callSecondsRef: MutableRefObject<number>
  cancelRequest: () => void
  dispatch: Dispatch<ConversationRuntimeEvent>
  messagesRef: MutableRefObject<ConversationMessage[]>
  pendingRef: MutableRefObject<boolean>
  persistSession: (messages: ConversationMessage[]) => void
  scene: ConversationScene
  voiceSentenceDelayMs: number
  submitMessageRef: MutableRefObject<
    (content: string, inputMode?: ConversationInputMode) => Promise<void>
  >
}) {
  const {
    playbackState: speechPlaybackState,
    prepare: prepareLocalSpeech,
    previewVoice: playVoicePreview,
    speak: playLocalSpeech,
    stop: stopLocalSpeech,
  } = useLocalTts()
  const { config: ttsConfig, selectVoice } = useTtsConfig()
  const { engine: asrEngine, selectEngine: selectAsrEngine } = useAsrConfig()
  const callActiveRef = useRef(false)
  const mutedRef = useRef(false)
  const speakerEnabledRef = useRef(true)
  const speechRequestRef = useRef(0)
  const speakingRef = useRef(false)
  const shouldListenRef = useRef(false)
  const listeningRef = useRef(false)
  const callStartRequestRef = useRef(0)
  const callStartedAtRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const voiceSegmentsRef = useRef<string[]>([])
  const voiceCommitTimerRef = useRef<number | null>(null)
  const lastAssistantSpeechRef = useRef("")
  const echoGuardUntilRef = useRef(0)
  const idleReminderCountRef = useRef(0)
  const lastVoiceActivityAtRef = useRef(Date.now())
  const previewingVoiceRef = useRef<string | null>(null)

  const stopAssistantSpeech = useCallback(() => {
    speechRequestRef.current += 1
    speakingRef.current = false
    echoGuardUntilRef.current = Date.now() + playbackEchoGuardMs
    stopLocalSpeech()
  }, [stopLocalSpeech])

  const interruptAssistant = useCallback(() => {
    cancelRequest()
    stopAssistantSpeech()
  }, [cancelRequest, stopAssistantSpeech])

  const clearVoiceCommitTimer = useCallback(() => {
    if (voiceCommitTimerRef.current !== null) {
      window.clearTimeout(voiceCommitTimerRef.current)
      voiceCommitTimerRef.current = null
    }
  }, [])

  const resetVoiceTurn = useCallback(() => {
    clearVoiceCommitTimer()
    voiceSegmentsRef.current = []
  }, [clearVoiceCommitTimer])

  const markVoiceActivity = useCallback(() => {
    lastVoiceActivityAtRef.current = Date.now()
    dispatch({ type: "idle-prompt-changed", prompt: null })
  }, [dispatch])

  const resetIdleReminders = useCallback(() => {
    idleReminderCountRef.current = 0
    markVoiceActivity()
  }, [markVoiceActivity])

  const scheduleVoiceTurnCommit = useCallback(() => {
    clearVoiceCommitTimer()
    voiceCommitTimerRef.current = window.setTimeout(() => {
      voiceCommitTimerRef.current = null
      const content = combineVoiceSegments(voiceSegmentsRef.current)
      voiceSegmentsRef.current = []
      if (content) {
        void submitMessageRef.current(content, "voice")
      }
    }, voiceSentenceDelayMs)
  }, [clearVoiceCommitTimer, submitMessageRef, voiceSentenceDelayMs])

  const {
    available: speechRecognitionAvailable,
    loadingProgress: speechRecognitionProgress,
    pause: pauseStreamingAsr,
    prepare: prepareStreamingAsr,
    start: startStreamingRecognition,
    stop: stopStreamingAsr,
  } = useStreamingAsr({
    engine: asrEngine,
    context: [
      `Scenario: ${scene.title}.`,
      `Goal: ${scene.objective}`,
      `Vocabulary: ${scene.focusPhrases.map((phrase) => phrase[1]).join(", ")}.`,
    ].join(" "),
    onEngineFallback: (fallbackEngine) => {
      selectAsrEngine(fallbackEngine)
      const label =
        asrEngineOptions.find((option) => option.value === fallbackEngine)?.label ??
        fallbackEngine
      toast.info(`外部 FunASR 不可用，已自动切换到 ${label}`)
    },
    onError: (error) => {
      listeningRef.current = false
      dispatch({ type: "call-status-changed", status: "manual" })
      toast.error(error.message || "语音识别服务暂时不可用")
    },
    onPartial: (transcript) => {
      if (callActiveRef.current && listeningRef.current) {
        markVoiceActivity()
        clearVoiceCommitTimer()
        dispatch({
          type: "transcript-changed",
          transcript: combineVoiceSegments([
            ...voiceSegmentsRef.current,
            normalizeSpeechTranscript(transcript),
          ]),
        })
      }
    },
    onProcessingChange: (processing) => {
      if (processing && callActiveRef.current) {
        markVoiceActivity()
        dispatch({ type: "call-status-changed", status: "transcribing" })
      } else if (
        callActiveRef.current &&
        !mutedRef.current &&
        !pendingRef.current &&
        !speakingRef.current
      ) {
        dispatch({ type: "call-status-changed", status: "listening" })
      }
    },
    onSpeechStart: () => {
      if (callActiveRef.current && !mutedRef.current) {
        markVoiceActivity()
      }
      if (!pendingRef.current && !speakingRef.current) {
        return
      }
      interruptAssistant()
      if (callActiveRef.current && !mutedRef.current) {
        dispatch({ type: "call-status-changed", status: "listening" })
      }
    },
    onTranscript: (transcript, language) => {
      const normalized = normalizeSpeechTranscript(transcript)
      const echoBlocked =
        Date.now() < echoGuardUntilRef.current &&
        isLikelyPlaybackEcho(normalized, lastAssistantSpeechRef.current)
      if (!callActiveRef.current || !listeningRef.current || echoBlocked) {
        return
      }
      if (normalized && isSupportedSpeechTranscript(normalized, language)) {
        resetIdleReminders()
        voiceSegmentsRef.current.push(normalized)
        dispatch({
          type: "transcript-changed",
          transcript: combineVoiceSegments(voiceSegmentsRef.current),
        })
        scheduleVoiceTurnCommit()
      } else if (callActiveRef.current && !mutedRef.current) {
        dispatch({ type: "call-status-changed", status: "listening" })
      }
    },
  })

  useEffect(() => {
    if (!speechRecognitionAvailable) {
      return
    }

    let cancelled = false
    const cancelIdleTask = scheduleIdleTask(() => {
      if (cancelled) {
        return
      }
      void Promise.allSettled([
        prepareStreamingAsr(),
        speakerEnabledRef.current ? prepareLocalSpeech() : Promise.resolve(),
      ])
    })
    return () => {
      cancelled = true
      cancelIdleTask()
    }
  }, [prepareLocalSpeech, prepareStreamingAsr, speechRecognitionAvailable])

  const stopRecognition = useCallback(() => {
    shouldListenRef.current = false
    listeningRef.current = false
    pauseStreamingAsr()
  }, [pauseStreamingAsr])

  const startRecognition = useCallback(() => {
    if (!callActiveRef.current || mutedRef.current || listeningRef.current) {
      return
    }

    const stream = streamRef.current
    if (!stream) {
      dispatch({ type: "call-status-changed", status: "manual" })
      return
    }

    shouldListenRef.current = true
    listeningRef.current = true
    dispatch({ type: "call-status-changed", status: "connecting" })
    void startStreamingRecognition(stream)
      .then(() => {
        if (callActiveRef.current && !mutedRef.current && !speakingRef.current) {
          dispatch({ type: "call-status-changed", status: "listening" })
        }
      })
      .catch((error) => {
        listeningRef.current = false
        dispatch({ type: "call-status-changed", status: "manual" })
        toast.error(error instanceof Error ? error.message : "语音识别服务暂时不可用")
      })
  }, [dispatch, startStreamingRecognition])

  const speak = useCallback(
    (text: string, force = false) => {
      if (!speakerEnabledRef.current && !force) {
        startRecognition()
        return
      }

      const requestId = speechRequestRef.current + 1
      speechRequestRef.current = requestId
      speakingRef.current = true
      lastAssistantSpeechRef.current = text
      echoGuardUntilRef.current = Number.POSITIVE_INFINITY
      resetVoiceTurn()
      stopRecognition()
      dispatch({ type: "transcript-changed", transcript: "" })
      const finishSpeaking = () => {
        if (requestId !== speechRequestRef.current) {
          return
        }
        speakingRef.current = false
        if (callActiveRef.current && !mutedRef.current) {
          lastVoiceActivityAtRef.current = Date.now()
          echoGuardUntilRef.current = Date.now() + playbackEchoGuardMs
          startRecognition()
        }
      }

      void playLocalSpeech(text, {
        speed: 0.92,
        onStart: () => {
          if (callActiveRef.current) {
            dispatch({ type: "call-status-changed", status: "speaking" })
          }
        },
      })
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : "语音播放失败，请检查当前音色引擎",
          )
        })
        .finally(finishSpeaking)
    },
    [dispatch, playLocalSpeech, resetVoiceTurn, startRecognition, stopRecognition],
  )

  const previewVoice = useCallback(
    (optionValue: string) => {
      const option = ttsVoiceOptions.find((item) => item.value === optionValue)
      if (!option) {
        return
      }
      previewingVoiceRef.current = optionValue
      dispatch({ type: "preview-changed", voice: optionValue })
      const sample = option.voice?.startsWith("z")
        ? chineseVoicePreviewSample
        : voicePreviewSample
      void playVoicePreview(option, sample, { speed: 0.95 })
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : "语音播放失败，请检查当前音色引擎",
          )
        })
        .finally(() => {
          if (previewingVoiceRef.current === optionValue) {
            previewingVoiceRef.current = null
            dispatch({ type: "preview-changed", voice: null })
          }
        })
    },
    [dispatch, playVoicePreview],
  )

  const startCall = useCallback(async () => {
    if (callActiveRef.current) {
      return
    }
    if (!speechRecognitionAvailable) {
      dispatch({ type: "call-status-changed", status: "idle" })
      toast.error("当前浏览器不支持实时语音采集，请继续使用文字输入")
      return
    }
    if (pendingRef.current || speakingRef.current) {
      interruptAssistant()
    }

    const continuingSession = messagesRef.current.some((message) => message.role === "user")
    const initialCallSeconds = continuingSession ? callSecondsRef.current : 0
    const callStartRequest = callStartRequestRef.current + 1
    callStartRequestRef.current = callStartRequest
    callActiveRef.current = true
    callStartedAtRef.current = Date.now() - initialCallSeconds * 1_000
    callSecondsRef.current = initialCallSeconds
    mutedRef.current = false
    dispatch({ type: "call-started", seconds: initialCallSeconds })
    resetIdleReminders()

    let stream: MediaStream
    try {
      const supportedConstraints = navigator.mediaDevices.getSupportedConstraints?.()
      const voiceIsolation = (
        supportedConstraints as MediaTrackSupportedConstraints & { voiceIsolation?: boolean }
      )?.voiceIsolation
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16_000,
          ...(voiceIsolation ? { voiceIsolation: true } : {}),
        },
      })
    } catch {
      if (callStartRequest !== callStartRequestRef.current || !callActiveRef.current) {
        return
      }
      callActiveRef.current = false
      dispatch({ type: "call-failed" })
      toast.error("无法访问麦克风，请检查浏览器权限")
      return
    }

    if (callStartRequest !== callStartRequestRef.current || !callActiveRef.current) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
      return
    }
    streamRef.current = stream

    const [, recognitionPreparation] = await Promise.allSettled([
      speakerEnabledRef.current ? prepareLocalSpeech() : Promise.resolve(),
      prepareStreamingAsr(),
    ])

    if (callStartRequest !== callStartRequestRef.current || !callActiveRef.current) {
      return
    }
    if (recognitionPreparation.status === "rejected") {
      callActiveRef.current = false
      dispatch({ type: "call-failed" })
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop()
      }
      streamRef.current = null
      toast.error(
        recognitionPreparation.reason instanceof Error
          ? recognitionPreparation.reason.message
          : "语音识别服务暂时不可用",
      )
      return
    }

    if (continuingSession) {
      startRecognition()
    } else {
      speak(scene.opening.content)
    }
  }, [
    callSecondsRef,
    dispatch,
    interruptAssistant,
    messagesRef,
    pendingRef,
    prepareLocalSpeech,
    prepareStreamingAsr,
    resetIdleReminders,
    scene.opening.content,
    speak,
    speechRecognitionAvailable,
    startRecognition,
  ])

  const finishCall = useCallback(
    (shouldPersist: boolean) => {
      callStartRequestRef.current += 1
      callActiveRef.current = false
      interruptAssistant()
      dispatch({ type: "call-ended" })
      idleReminderCountRef.current = 0
      resetVoiceTurn()
      shouldListenRef.current = false
      listeningRef.current = false
      stopStreamingAsr()
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop()
      }
      streamRef.current = null
      if (shouldPersist) {
        persistSession(messagesRef.current)
      }
    },
    [
      dispatch,
      interruptAssistant,
      messagesRef,
      persistSession,
      resetVoiceTurn,
      stopStreamingAsr,
    ],
  )

  const endCall = useCallback(() => {
    finishCall(true)
  }, [finishCall])

  const endCallWithoutPersisting = useCallback(() => {
    finishCall(false)
  }, [finishCall])

  const toggleMute = useCallback(() => {
    const nextMuted = !mutedRef.current
    mutedRef.current = nextMuted
    dispatch({ type: "muted-changed", muted: nextMuted })

    for (const track of streamRef.current?.getAudioTracks() ?? []) {
      track.enabled = !nextMuted
    }

    if (nextMuted) {
      resetVoiceTurn()
      stopRecognition()
      dispatch({ type: "transcript-changed", transcript: "" })
      dispatch({ type: "call-status-changed", status: "muted" })
    } else if (streamRef.current) {
      lastVoiceActivityAtRef.current = Date.now()
      startRecognition()
    } else {
      dispatch({ type: "call-status-changed", status: "manual" })
    }
  }, [dispatch, resetVoiceTurn, startRecognition, stopRecognition])

  const toggleSpeaker = useCallback(() => {
    const nextEnabled = !speakerEnabledRef.current
    speakerEnabledRef.current = nextEnabled
    dispatch({ type: "speaker-changed", enabled: nextEnabled })

    if (!nextEnabled) {
      stopAssistantSpeech()
      if (callActiveRef.current && !mutedRef.current) {
        startRecognition()
      }
    }
  }, [dispatch, startRecognition, stopAssistantSpeech])

  useEffect(() => {
    if (!callActive) {
      return
    }

    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - callStartedAtRef.current) / 1000)
      callSecondsRef.current = elapsedSeconds
      dispatch({ type: "call-ticked", seconds: elapsedSeconds })
    }, 1_000)

    return () => window.clearInterval(timer)
  }, [callActive, callSecondsRef, dispatch])

  useEffect(() => {
    if (!callActive) {
      return
    }

    const timer = window.setInterval(() => {
      if (
        mutedRef.current ||
        pendingRef.current ||
        speakingRef.current ||
        Date.now() - lastVoiceActivityAtRef.current < voiceIdleReminderDelayMs
      ) {
        return
      }

      const reminderIndex = idleReminderCountRef.current
      if (reminderIndex >= voiceIdleReminderLimit) {
        endCall()
        toast.info(`连续 ${voiceIdleReminderLimit} 次未收到回应，语音通话已自动结束`)
        return
      }

      const prompt = voiceIdlePrompts[Math.min(reminderIndex, voiceIdlePrompts.length - 1)]
      idleReminderCountRef.current += 1
      lastVoiceActivityAtRef.current = Date.now()
      dispatch({ type: "idle-prompt-changed", prompt: prompt.display })
      speak(prompt.speech, true)
    }, 1_000)

    return () => window.clearInterval(timer)
  }, [callActive, dispatch, endCall, pendingRef, speak])

  useEffect(
    () => () => {
      callStartRequestRef.current += 1
      callActiveRef.current = false
      shouldListenRef.current = false
      resetVoiceTurn()
      stopStreamingAsr()
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop()
      }
      speechRequestRef.current += 1
      stopLocalSpeech()
    },
    [resetVoiceTurn, stopLocalSpeech, stopStreamingAsr],
  )

  return {
    asrEngineOptions,
    callActiveRef,
    endCall,
    endCallWithoutPersisting,
    interruptAssistant,
    mutedRef,
    previewVoice,
    selectedAsrEngine: asrEngine,
    selectedVoice: getSelectedVoiceValue(ttsConfig),
    selectAsrEngine,
    selectVoice,
    speakerEnabledRef,
    speak,
    speakingRef,
    speechPlaybackState,
    speechRecognitionAvailable,
    speechRecognitionProgress,
    startCall,
    startRecognition,
    toggleMute,
    toggleSpeaker,
    voiceOptions,
  }
}
