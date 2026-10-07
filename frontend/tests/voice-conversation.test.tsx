// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { setConversationPrefs } from "@/features/conversation/use-conversation-prefs"
import {
  useVoiceConversation,
  voiceIdleReminderDelayMs,
  voiceIdleReminderLimit,
} from "@/features/conversation/use-voice-conversation"
import {
  type ConversationSession,
  conversationHistoryStorageKey,
} from "@/lib/conversation-history"
import { defaultConversationPrefs } from "@/lib/conversation-prefs"
import { getConversationScene } from "@/lib/conversation-scenes"
import { networkFailureMessage } from "@/lib/user-error"

const localTts = vi.hoisted(() => ({
  prepare: vi.fn(),
  previewVoice: vi.fn(),
  speak: vi.fn(),
  stop: vi.fn(),
}))

const offlineAsr = vi.hoisted(() => ({
  engine: "",
  onEngineFallback: (_engine: "qwen3-asr" | "sensevoice") => {},
  onSpeechStart: () => {},
  onTranscript: (_text: string, _language?: string) => {},
  prepare: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}))

const modelConfigCrypto = vi.hoisted(() => ({
  createEnvelope: vi.fn(),
  resetPublicKey: vi.fn(),
}))

vi.mock("@/features/speech/use-local-tts", () => ({
  useLocalTts: () => ({
    playbackState: "idle",
    prepare: localTts.prepare,
    previewVoice: localTts.previewVoice,
    speak: localTts.speak,
    stop: localTts.stop,
  }),
}))

vi.mock("@/features/speech/use-streaming-asr", () => ({
  useStreamingAsr: ({
    engine,
    onEngineFallback,
    onProcessingChange: _onProcessingChange,
    onPartial: _onPartial,
    onSpeechStart,
    onTranscript,
  }: {
    engine?: string
    onEngineFallback?: (engine: "qwen3-asr" | "sensevoice") => void
    onProcessingChange: (processing: boolean) => void
    onPartial: (transcript: string) => void
    onSpeechStart?: () => void
    onTranscript: (transcript: string, language?: string) => void
  }) => {
    offlineAsr.engine = engine ?? ""
    offlineAsr.onEngineFallback = onEngineFallback ?? (() => {})
    offlineAsr.onSpeechStart = onSpeechStart ?? (() => {})
    offlineAsr.onTranscript = onTranscript
    return {
      available: true,
      loadingProgress: 100,
      pause: offlineAsr.stop,
      prepare: offlineAsr.prepare,
      start: offlineAsr.start,
      stop: offlineAsr.stop,
    }
  },
}))

vi.mock("@/lib/model-config-envelope", () => ({
  createModelConfigEnvelope: modelConfigCrypto.createEnvelope,
  resetModelConfigPublicKey: modelConfigCrypto.resetPublicKey,
}))

vi.mock("@/lib/conversation-sync", () => ({
  deleteCloudConversationSession: vi.fn().mockResolvedValue(false),
  loadCloudConversationHistory: vi.fn().mockResolvedValue(null),
  saveCloudConversationSession: vi.fn().mockResolvedValue(false),
}))

const audioTrack = {
  enabled: true,
  stop: vi.fn(),
}
const mediaStream = {
  getAudioTracks: () => [audioTrack],
  getTracks: () => [audioTrack],
}
const getUserMedia = vi.fn()
const fetchMock = vi.fn()

function seedHistoricalConversation() {
  const scene = getConversationScene("coffee")
  const session: ConversationSession = {
    id: "historical-session",
    sceneId: scene.id,
    sceneTitle: scene.title,
    partnerName: scene.partnerName,
    startedAt: "2026-08-29T08:00:00.000Z",
    updatedAt: "2026-08-29T08:05:00.000Z",
    durationSeconds: 42,
    status: "completed",
    messages: [
      {
        id: "historical-opening",
        role: "assistant",
        content: scene.opening.content,
        translation: scene.opening.translation,
        note: "",
        timestamp: "00:00",
      },
      {
        id: "historical-question",
        role: "user",
        content: "I'd like a latte, please.",
        inputMode: "text",
        translation: "",
        note: "",
        timestamp: "00:18",
      },
      {
        id: "historical-answer",
        role: "assistant",
        content: "Certainly. Would you like anything else?",
        translation: "当然。还需要别的吗？",
        note: "",
        timestamp: "00:42",
      },
    ],
  }
  window.localStorage.setItem(
    conversationHistoryStorageKey,
    JSON.stringify({ version: 1, sessions: [session] }),
  )
  return { scene, session }
}

beforeEach(() => {
  window.localStorage.clear()
  setConversationPrefs(() => defaultConversationPrefs)
  audioTrack.enabled = true
  audioTrack.stop.mockReset()
  getUserMedia.mockReset().mockResolvedValue(mediaStream)
  fetchMock.mockReset().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          content: "Would you like it hot or iced?",
          translation: "你想要热的还是冰的？",
          recall: "继续使用礼貌请求。",
        },
      }),
      { status: 200 },
    ),
  )

  vi.stubGlobal("fetch", fetchMock)
  offlineAsr.prepare.mockReset().mockResolvedValue(undefined)
  offlineAsr.start.mockReset().mockResolvedValue(undefined)
  offlineAsr.stop.mockReset()
  localTts.previewVoice.mockReset().mockResolvedValue(undefined)
  localTts.prepare.mockReset().mockResolvedValue(undefined)
  localTts.speak.mockReset()
  localTts.stop.mockReset()
  localTts.speak.mockImplementation(
    async (_text: string, options?: { onStart?: () => void }) => {
      options?.onStart?.()
    },
  )
  modelConfigCrypto.createEnvelope.mockReset().mockResolvedValue({
    version: 1,
    keyId: "test-key",
    wrappedKey: "wrapped",
    iv: "initialization-vector",
    ciphertext: "encrypted-model-config",
  })
  modelConfigCrypto.resetPublicKey.mockReset()
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getSupportedConstraints: () => ({ voiceIsolation: true }),
      getUserMedia,
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useVoiceConversation", () => {
  it("restores the latest session for the scene after a refresh", async () => {
    const scene = getConversationScene("coffee")
    const updatedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    window.localStorage.setItem(
      conversationHistoryStorageKey,
      JSON.stringify({
        version: 1,
        sessions: [
          {
            id: "recent-session",
            sceneId: scene.id,
            sceneTitle: scene.title,
            partnerName: scene.partnerName,
            startedAt: updatedAt,
            updatedAt,
            durationSeconds: 18,
            messages: [
              {
                id: "opening",
                role: "assistant",
                content: scene.opening.content,
                translation: scene.opening.translation,
                note: "",
                timestamp: "00:00",
              },
              {
                id: "question",
                role: "user",
                content: "Could you clarify the price?",
                inputMode: "text",
                translation: "",
                note: "",
                timestamp: "00:18",
              },
            ],
          },
        ],
      }),
    )

    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await waitFor(() => expect(result.current.currentSessionId).toBe("recent-session"))
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.callSeconds).toBe(18)
    unmount()
  })

  it("reuses the same turn identity when a reply is retried", async () => {
    const scene = getConversationScene("coffee")
    const turnComplete = vi.fn()
    // 每次请求都要新的 Response：默认 mock 返回同一个实例，第二次读取正文会失败。
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              content: "Would you like it hot or iced?",
              translation: "你想要热的还是冰的？",
              recall: "继续使用礼貌请求。",
            },
          }),
          { status: 200 },
        ),
    )
    const { result, unmount } = renderHook(() =>
      useVoiceConversation({ scene, onTurnComplete: turnComplete }),
    )

    act(() => result.current.setDraft("Could I get a latte, please?"))
    act(() => result.current.sendDraft())
    await waitFor(() => expect(turnComplete).toHaveBeenCalledTimes(1))

    act(() => result.current.retryLastReply())
    await waitFor(() => expect(turnComplete).toHaveBeenCalledTimes(2))

    const first = turnComplete.mock.calls[0]?.[0]
    const retried = turnComplete.mock.calls[1]?.[0]
    // 重试复用同一条学习者消息，因此回合身份必须相同，否则记忆会把重试
    // 当成第二次练习而重复计数。
    expect(retried.turnId).toBe(first.turnId)
    expect(first.turnId).toBeTruthy()
    unmount()
  })

  it("reports the removed turn when a learner deletes their own message", async () => {
    const scene = getConversationScene("coffee")
    const forgetTurn = vi.fn()
    const turnComplete = vi.fn()
    const { result, unmount } = renderHook(() =>
      useVoiceConversation({ scene, onForgetTurn: forgetTurn, onTurnComplete: turnComplete }),
    )

    act(() => result.current.setDraft("Could I get a latte, please?"))
    act(() => result.current.sendDraft())
    await waitFor(() => expect(turnComplete).toHaveBeenCalledTimes(1))

    const turnId = turnComplete.mock.calls[0]?.[0].turnId
    const userMessage = result.current.messages.find((message) => message.id === turnId)
    if (!userMessage) {
      throw new Error("Missing the learner turn that produced the memory event")
    }

    act(() => result.current.deleteMessage(userMessage.id))

    // 记录已从转写删除，这一轮必须同步退出记忆，否则进度与转写不一致。
    expect(forgetTurn).toHaveBeenCalledWith(turnId)
    unmount()
  })

  it("continues a selected history topic with its complete message context", async () => {
    const { scene, session } = seedHistoricalConversation()
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await waitFor(() => expect(result.current.history).toHaveLength(1))
    act(() => result.current.loadConversation(session.id))
    expect(result.current.messages).toEqual(session.messages)

    act(() => result.current.setDraft("Could I add a blueberry muffin?"))
    act(() => result.current.sendDraft())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(request.messages).toEqual([
      { role: "assistant", content: scene.opening.content },
      { role: "user", content: "I'd like a latte, please." },
      {
        role: "assistant",
        content: "Certainly. Would you like anything else?",
      },
      { role: "user", content: "Could I add a blueberry muffin?" },
    ])
    await waitFor(() => expect(result.current.messages).toHaveLength(5))
    unmount()
  })

  it("starts listening without replaying the opening when continuing history", async () => {
    const { scene, session } = seedHistoricalConversation()
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await waitFor(() => expect(result.current.history).toHaveLength(1))
    act(() => result.current.loadConversation(session.id))
    await act(async () => {
      await result.current.startCall()
    })

    expect(result.current.callSeconds).toBe(42)
    expect(result.current.callStatus).toBe("listening")
    expect(offlineAsr.start).toHaveBeenCalledOnce()
    expect(localTts.speak).not.toHaveBeenCalled()

    act(() => result.current.endCall())
    unmount()
  })

  it("does not recreate the current history item when it is deleted during a call", async () => {
    const { scene, session } = seedHistoricalConversation()
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await waitFor(() => expect(result.current.history).toHaveLength(1))
    act(() => result.current.loadConversation(session.id))
    await act(async () => {
      await result.current.startCall()
    })

    act(() => result.current.deleteConversation(session.id))

    expect(result.current.callActive).toBe(false)
    expect(result.current.history).toEqual([])
    expect(audioTrack.stop).toHaveBeenCalledOnce()
    expect(
      JSON.parse(window.localStorage.getItem(conversationHistoryStorageKey) ?? "{}").sessions,
    ).toEqual([])
    unmount()
  })

  it("persists the selected ASR engine and passes it to streaming recognition", async () => {
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    expect(result.current.selectedAsrEngine).toBe("sensevoice")
    expect(offlineAsr.engine).toBe("sensevoice")

    act(() => result.current.selectAsrEngine("qwen3-asr"))

    expect(result.current.selectedAsrEngine).toBe("qwen3-asr")
    expect(offlineAsr.engine).toBe("qwen3-asr")
    expect(window.localStorage.getItem("moss:asr-config:v1")).toContain("qwen3-asr")

    act(() => result.current.selectAsrEngine("funasr"))

    expect(result.current.selectedAsrEngine).toBe("funasr")
    expect(offlineAsr.engine).toBe("funasr")

    act(() => offlineAsr.onEngineFallback("sensevoice"))

    expect(result.current.selectedAsrEngine).toBe("sensevoice")
    expect(window.localStorage.getItem("moss:asr-config:v1")).toContain("sensevoice")
    unmount()
  })

  it("shows voice mode immediately while microphone permission is pending", async () => {
    let resolveMicrophone: ((stream: typeof mediaStream) => void) | undefined
    getUserMedia.mockReturnValueOnce(
      new Promise<typeof mediaStream>((resolve) => {
        resolveMicrophone = resolve
      }),
    )
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => {
      void result.current.startCall()
    })

    expect(result.current.callActive).toBe(true)
    expect(result.current.callStatus).toBe("connecting")

    await act(async () => {
      resolveMicrophone?.(mediaStream)
    })
    expect(result.current.callStatus).toBe("listening")

    act(() => result.current.endCall())
    unmount()
  })

  it("stops a microphone stream that arrives after the call has ended", async () => {
    let resolveMicrophone: ((stream: typeof mediaStream) => void) | undefined
    getUserMedia.mockReturnValueOnce(
      new Promise<typeof mediaStream>((resolve) => {
        resolveMicrophone = resolve
      }),
    )
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))
    let startPromise: Promise<void> | undefined

    act(() => {
      startPromise = result.current.startCall()
    })
    act(() => result.current.endCall())
    await act(async () => {
      resolveMicrophone?.(mediaStream)
      await startPromise
    })

    expect(result.current.callActive).toBe(false)
    expect(result.current.callStatus).toBe("ended")
    expect(audioTrack.stop).toHaveBeenCalledOnce()
    expect(offlineAsr.start).not.toHaveBeenCalled()
    unmount()
  })

  it("pauses ASR for the full duration of assistant speech", async () => {
    let finishSpeech: (() => void) | undefined
    localTts.speak.mockImplementationOnce(
      (_text: string, options?: { onStart?: () => void }) => {
        options?.onStart?.()
        return new Promise<void>((resolve) => {
          finishSpeech = resolve
        })
      },
    )
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await act(async () => {
      await result.current.startCall()
    })

    expect(result.current.callStatus).toBe("speaking")
    expect(offlineAsr.stop).toHaveBeenCalled()
    expect(offlineAsr.start).not.toHaveBeenCalled()

    await act(async () => {
      finishSpeech?.()
    })

    await waitFor(() => expect(offlineAsr.start).toHaveBeenCalledOnce())
    expect(result.current.callStatus).toBe("listening")
    act(() => result.current.endCall())
    unmount()
  })

  it("drops a delayed ASR transcript that repeats the assistant playback", async () => {
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await act(async () => {
      await result.current.startCall()
    })
    act(() => {
      offlineAsr.onTranscript(scene.opening.content, "en")
    })
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1_900))
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.messages).toHaveLength(1)

    act(() => result.current.endCall())
    unmount()
  })

  it("keeps the learner message unblocked while feedback arrives with the AI reply", async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve
      }),
    )
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await act(async () => {
      await result.current.startCall()
    })
    act(() => {
      offlineAsr.onTranscript("I want a latte.")
    })

    await waitFor(
      () => {
        expect(result.current.messages).toHaveLength(2)
        expect(result.current.pending).toBe(true)
      },
      { timeout: 2_500 },
    )
    expect(result.current.messages[1]?.validation).toBeUndefined()

    await act(async () => {
      resolveRequest?.(
        new Response(
          JSON.stringify({
            data: {
              content: "Of course. What size would you like?",
              translation: "当然。你想要多大杯？",
              recall: "",
              validation: {
                status: "improve",
                corrected: "I'd like a latte.",
                explanation: "服务场景中使用 I'd like 会更自然。",
                issues: [
                  {
                    kind: "register",
                    original: "I want",
                    corrected: "I'd like",
                    explanation: "服务场景中更礼貌。",
                  },
                ],
                examples: [
                  {
                    english: "I'd like a coffee, please.",
                    chinese: "我想要一杯咖啡。",
                  },
                ],
              },
            },
          }),
          { status: 200 },
        ),
      )
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3)
    })
    expect(result.current.messages[2]).toMatchObject({
      role: "assistant",
      feedbackFor: "I want a latte.",
      validation: {
        status: "improve",
        corrected: "I'd like a latte.",
      },
    })

    act(() => {
      result.current.endCall()
    })
    unmount()
  })

  it("auditions a specific voice option with a short sample instead of the opening line", async () => {
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await waitFor(() => {
      expect(result.current.voiceOptions.length).toBeGreaterThan(1)
    })
    expect(result.current.previewingVoice).toBeNull()

    await act(async () => {
      result.current.previewVoice("kokoro:af_bella")
    })

    expect(localTts.previewVoice).toHaveBeenCalledTimes(1)
    const [target, sample] = localTts.previewVoice.mock.calls[0] ?? []
    // The player identifies a voice by engine plus voice id; the selector value never reaches it.
    expect(target).toMatchObject({ engine: "kokoro", voice: "af_bella" })
    // The audition uses a short fixed line, never the full scene opening.
    expect(typeof sample).toBe("string")
    expect((sample as string).length).toBeLessThanOrEqual(60)
    expect(sample).not.toBe(scene.opening.content)

    unmount()
  })

  it("ignores previews for an unknown voice value", async () => {
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await act(async () => {
      result.current.previewVoice("does-not-exist")
    })

    expect(localTts.previewVoice).not.toHaveBeenCalled()
    expect(result.current.previewingVoice).toBeNull()
    unmount()
  })

  it("runs a voice turn and restores listening after the AI response", async () => {
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await waitFor(() => {
      expect(result.current.voiceOptions.length).toBeGreaterThan(1)
    })
    expect(result.current.voiceOptions[0]?.value).toBe("audio8:multilingual")
    expect(
      result.current.voiceOptions.some((option) => option.value === "kokoro:af_bella"),
    ).toBe(true)
    expect(
      result.current.voiceOptions.some((option) => option.value === "cosyvoice:english_female"),
    ).toBe(true)
    expect(result.current.selectedVoice).toBe("kokoro:af_heart")

    await act(async () => {
      await result.current.startCall()
    })

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        autoGainControl: false,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16_000,
        voiceIsolation: true,
      }),
    })
    expect(result.current.callActive).toBe(true)
    expect(result.current.callStatus).toBe("listening")

    await act(async () => {
      offlineAsr.onTranscript("  Could   I get a latte with oat milk? ")
    })

    await waitFor(
      () => {
        expect(result.current.messages).toHaveLength(3)
      },
      { timeout: 2_500 },
    )
    expect(result.current.messages[1]?.content).toBe("Could I get a latte with oat milk?")
    expect(result.current.messages[2]?.role).toBe("assistant")
    expect(result.current.messages[1]?.validation).toBeUndefined()
    expect(result.current.messages[2]?.feedbackFor).toBe("Could I get a latte with oat milk?")
    expect(result.current.messages[2]?.validation?.status).toBe("accurate")
    expect(result.current.callStatus).toBe("listening")
    expect(localTts.speak).toHaveBeenCalledWith(
      scene.opening.content,
      expect.objectContaining({ speed: 0.92 }),
    )

    const conversationCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/conversation",
    )
    const request = JSON.parse(String(conversationCall?.[1]?.body))
    expect(request).toMatchObject({
      sceneId: "coffee",
      language: "auto",
    })

    act(() => {
      result.current.toggleMute()
    })
    expect(audioTrack.enabled).toBe(false)
    expect(result.current.callStatus).toBe("muted")

    act(() => {
      result.current.endCall()
    })
    expect(result.current.callStatus).toBe("ended")
    expect(audioTrack.stop).toHaveBeenCalled()

    unmount()
  })

  it("combines consecutive recognized segments before requesting one AI reply", async () => {
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await act(async () => {
      await result.current.startCall()
    })
    act(() => {
      offlineAsr.onTranscript("Could I get a latte?")
      offlineAsr.onTranscript("And make it decaf, please.")
    })

    await waitFor(
      () => {
        expect(result.current.messages).toHaveLength(3)
      },
      { timeout: 2_500 },
    )

    expect(result.current.messages[1]).toMatchObject({
      role: "user",
      content: "Could I get a latte? And make it decaf, please.",
      inputMode: "voice",
    })
    expect(fetchMock.mock.calls.filter((call) => call[0] === "/api/conversation")).toHaveLength(
      1,
    )

    act(() => {
      result.current.endCall()
    })
    unmount()
  })

  it("ignores recognized speech outside Chinese and English", async () => {
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await act(async () => {
      await result.current.startCall()
    })
    act(() => {
      offlineAsr.onTranscript("bonjour", "fr")
      offlineAsr.onTranscript("こんにちは", "ja")
    })
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1_300))
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.callStatus).toBe("listening")

    act(() => result.current.endCall())
    unmount()
  })

  it("hangs up after the maximum number of unanswered silence reminders", async () => {
    vi.useFakeTimers()
    try {
      const scene = getConversationScene("coffee")
      const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

      await act(async () => {
        await result.current.startCall()
      })
      for (let reminder = 0; reminder < voiceIdleReminderLimit; reminder += 1) {
        await act(async () => {
          vi.advanceTimersByTime(voiceIdleReminderDelayMs)
          await Promise.resolve()
        })
        expect(result.current.callActive).toBe(true)
        expect(result.current.idlePrompt).toBeTruthy()
        if (reminder === 0) {
          act(() => {
            offlineAsr.onSpeechStart()
            offlineAsr.onTranscript("bonjour", "fr")
          })
        }
      }

      await act(async () => {
        vi.advanceTimersByTime(voiceIdleReminderDelayMs)
        await Promise.resolve()
      })

      expect(result.current.callActive).toBe(false)
      expect(result.current.callStatus).toBe("ended")
      expect(localTts.speak).toHaveBeenCalledTimes(voiceIdleReminderLimit + 1)
      expect(audioTrack.stop).toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it("aborts an unfinished AI response when the learner asks another question", async () => {
    let resolveFirstRequest: ((response: Response) => void) | undefined
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFirstRequest = resolve
      }),
    )
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await act(async () => {
      await result.current.startCall()
    })
    act(() => {
      offlineAsr.onTranscript("What sizes do you have?")
    })
    await waitFor(
      () => {
        expect(result.current.pending).toBe(true)
      },
      { timeout: 2_500 },
    )

    const firstRequestSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal
    act(() => {
      offlineAsr.onSpeechStart()
      offlineAsr.onTranscript("Can I have a medium one?")
    })
    expect(firstRequestSignal.aborted).toBe(true)
    expect(result.current.pending).toBe(false)

    await waitFor(
      () => {
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(result.current.messages).toHaveLength(4)
      },
      { timeout: 2_500 },
    )
    expect(result.current.messages.map((message) => message.content)).toEqual([
      scene.opening.content,
      "What sizes do you have?",
      "Can I have a medium one?",
      "Would you like it hot or iced?",
    ])
    expect(localTts.stop).toHaveBeenCalled()

    resolveFirstRequest?.(
      new Response(
        JSON.stringify({
          data: {
            content: "This stale answer must be ignored.",
            translation: "",
            recall: "",
          },
        }),
        { status: 200 },
      ),
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.messages).toHaveLength(4)

    act(() => {
      result.current.endCall()
    })
    unmount()
  })

  it("lets typed input interrupt a pending reply and sends all unanswered questions", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            content: "Trade means an exchange, and it is used when people exchange goods.",
            translation: "trade 表示交换，用于交换商品等场景。",
            recall: "",
          },
        }),
        { status: 200 },
      ),
    )
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => result.current.setDraft("trade 这个是什么意思"))
    act(() => result.current.sendDraft())
    await waitFor(() => expect(result.current.pending).toBe(true))
    act(() => result.current.setDraft("什么场景下使用"))
    act(() => result.current.sendDraft())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(requestBody.messages.slice(-2)).toEqual([
      { role: "user", content: "trade 这个是什么意思" },
      { role: "user", content: "什么场景下使用" },
    ])
    await waitFor(() => expect(result.current.messages.at(-1)?.role).toBe("assistant"))
    unmount()
  })

  it("stops spoken output as soon as the learner starts talking", async () => {
    let finishAssistantSpeech: (() => void) | undefined
    localTts.speak.mockResolvedValueOnce(undefined).mockImplementationOnce(
      (_text: string, options?: { onStart?: () => void }) =>
        new Promise<void>((resolve) => {
          options?.onStart?.()
          finishAssistantSpeech = resolve
        }),
    )
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    await act(async () => {
      await result.current.startCall()
    })
    act(() => {
      offlineAsr.onTranscript("Could I get a latte?")
    })
    await waitFor(
      () => {
        expect(result.current.callStatus).toBe("speaking")
      },
      { timeout: 2_500 },
    )

    act(() => {
      offlineAsr.onSpeechStart()
    })
    expect(localTts.stop).toHaveBeenCalled()
    expect(result.current.callStatus).toBe("listening")

    await act(async () => {
      finishAssistantSpeech?.()
    })
    expect(result.current.callStatus).toBe("listening")

    act(() => {
      result.current.endCall()
    })
    unmount()
  })

  it("does not submit typed drafts while voice mode is active", async () => {
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => {
      result.current.setDraft("This should stay in the text composer.")
    })
    await act(async () => {
      await result.current.startCall()
    })
    act(() => {
      result.current.sendDraft()
    })

    expect(result.current.callActive).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()

    act(() => {
      result.current.endCall()
    })
    unmount()
  })

  it("automatically speaks an AI reply after typed input", async () => {
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => {
      result.current.setDraft("Could I get a latte, please?")
    })
    act(() => {
      result.current.sendDraft()
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3)
    })
    expect(result.current.messages[1]).toMatchObject({
      inputMode: "text",
      role: "user",
    })
    expect(localTts.speak).toHaveBeenCalledWith(
      "Would you like it hot or iced?",
      expect.objectContaining({ speed: 0.92 }),
    )
    expect(result.current.history).toHaveLength(1)
    const savedSessionId = result.current.currentSessionId

    act(() => {
      result.current.startNewConversation()
    })
    expect(result.current.messages).toHaveLength(1)
    expect(
      JSON.parse(window.localStorage.getItem(conversationHistoryStorageKey) ?? "{}").sessions[0]
        .status,
    ).toBe("completed")

    act(() => {
      result.current.loadConversation(savedSessionId)
    })
    expect(result.current.messages).toHaveLength(3)

    unmount()
  })

  it("sends the current tutor mode with each inference request", async () => {
    setConversationPrefs((current) => ({ ...current, tutorMode: "english" }))
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => {
      result.current.setDraft("Could I get a latte, please?")
    })
    act(() => {
      result.current.sendDraft()
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3)
    })

    const conversationCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/conversation",
    )
    const request = JSON.parse(String(conversationCall?.[1]?.body))
    expect(request.tutorMode).toBe("english")

    unmount()
  })

  it("sends the saved browser model config only as an encrypted envelope", async () => {
    window.localStorage.setItem(
      "moss:model-config:v1",
      JSON.stringify({
        version: 2,
        enabled: true,
        provider: "openai-compatible",
        apiType: "chat-completions",
        endpoint: "https://byo.example.com/v1",
        model: "byo-model",
        apiKey: "browser-secret",
      }),
    )
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => {
      result.current.setDraft("Could I get a latte, please?")
    })
    act(() => {
      result.current.sendDraft()
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3)
    })

    const conversationCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/conversation",
    )
    const request = JSON.parse(String(conversationCall?.[1]?.body))
    expect(modelConfigCrypto.createEnvelope).toHaveBeenCalledWith({
      apiKey: "browser-secret",
      baseUrl: "https://byo.example.com/v1",
      model: "byo-model",
      apiType: "chat-completions",
    })
    expect(request.modelConfig).toBeUndefined()
    expect(request.modelConfigEnvelope).toEqual({
      version: 1,
      keyId: "test-key",
      wrappedKey: "wrapped",
      iv: "initialization-vector",
      ciphertext: "encrypted-model-config",
    })
    expect(JSON.stringify(request)).not.toContain("browser-secret")
    expect(JSON.stringify(request)).not.toContain("https://byo.example.com/v1")

    unmount()
  })

  it("refreshes the public key and retries once when the server key rotates", async () => {
    window.localStorage.setItem(
      "moss:model-config:v1",
      JSON.stringify({
        version: 2,
        enabled: true,
        provider: "openai-compatible",
        apiType: "chat-completions",
        endpoint: "https://byo.example.com/v1",
        model: "byo-model",
        apiKey: "browser-secret",
      }),
    )
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "model_config_key_expired",
              message: "模型配置加密密钥已更新，请重试。",
            },
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              content: "Would you like it hot or iced?",
              translation: "你想要热的还是冰的？",
              recall: "",
            },
          }),
          { status: 200 },
        ),
      )
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => {
      result.current.setDraft("Could I get a latte, please?")
    })
    act(() => {
      result.current.sendDraft()
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3)
    })
    expect(modelConfigCrypto.resetPublicKey).toHaveBeenCalledOnce()
    expect(modelConfigCrypto.createEnvelope).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.filter((call) => call[0] === "/api/conversation")).toHaveLength(
      2,
    )
    unmount()
  })

  it("omits modelConfig when no browser model config is saved", async () => {
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => {
      result.current.setDraft("Could I get a latte, please?")
    })
    act(() => {
      result.current.sendDraft()
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3)
    })

    const conversationCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/conversation",
    )
    const request = JSON.parse(String(conversationCall?.[1]?.body))
    expect(request.modelConfig).toBeUndefined()
    expect(request.modelConfigEnvelope).toBeUndefined()

    unmount()
  })

  it("keeps AI errors visible without sending or saving them as conversation context", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: "AI 服务暂时不可用：AI provider returned 400" },
          }),
          { status: 502 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              content: "Thanks. Would you like it hot or iced?",
              translation: "谢谢。你想要热的还是冰的？",
              recall: "",
            },
          }),
          { status: 200 },
        ),
      )
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => {
      result.current.setDraft("A latte, please.")
    })
    act(() => {
      result.current.sendDraft()
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3)
    })
    // The upstream detail is technical output: the transcript keeps an actionable message and
    // never carries `AI provider returned 400`.
    expect(result.current.messages[2]).toMatchObject({
      role: "assistant",
      content: "服务暂时不可用，请稍后重试。",
      transient: true,
      variant: "error",
    })
    const savedAfterError = JSON.parse(
      window.localStorage.getItem(conversationHistoryStorageKey) ?? "{}",
    )
    expect(savedAfterError.sessions[0].messages).toHaveLength(2)

    act(() => result.current.retryLastReply())

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3)
    })
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(
      secondRequest.messages.map((message: { content: string }) => message.content),
    ).toEqual([scene.opening.content, "A latte, please."])
    const savedAfterReply = JSON.parse(
      window.localStorage.getItem(conversationHistoryStorageKey) ?? "{}",
    )
    expect(
      savedAfterReply.sessions[0].messages.map(
        (message: { content: string }) => message.content,
      ),
    ).toEqual([
      scene.opening.content,
      "A latte, please.",
      "Thanks. Would you like it hot or iced?",
    ])

    unmount()
  })

  it("never stores a network or parse failure verbatim in the transcript", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    fetchMock.mockResolvedValueOnce(
      new Response("<!DOCTYPE html><html><body>502 Bad Gateway</body></html>", { status: 502 }),
    )
    const scene = getConversationScene("coffee")

    for (const expected of [networkFailureMessage, "服务暂时不可用，请稍后重试。"]) {
      const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

      act(() => {
        result.current.setDraft("A latte, please.")
      })
      act(() => {
        result.current.sendDraft()
      })

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(3)
      })
      const errorTurn = result.current.messages[2]
      expect(errorTurn).toMatchObject({ role: "assistant", transient: true, variant: "error" })
      expect(errorTurn.content).toBe(expected)

      unmount()
      window.localStorage.clear()
    }

    const saved = JSON.parse(window.localStorage.getItem(conversationHistoryStorageKey) ?? "{}")
    const persisted = JSON.stringify(saved)
    expect(persisted).not.toContain("Failed to fetch")
    expect(persisted).not.toContain("SyntaxError")
    expect(persisted).not.toContain("502")
  })

  it("deletes a recognized message together with the reply it produced", async () => {
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => {
      result.current.setDraft("I wants a latte")
    })
    act(() => {
      result.current.sendDraft()
    })

    await waitFor(() => expect(result.current.messages).toHaveLength(3))
    const learnerTurn = result.current.messages[1]
    expect(learnerTurn).toMatchObject({ role: "user", content: "I wants a latte" })

    act(() => {
      result.current.deleteMessage(learnerTurn.id)
    })

    // The partner answered the mis-recognized turn, so that answer goes with it. Leaving it would
    // show a reply to a question the learner can no longer see.
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].role).toBe("assistant")

    unmount()
  })

  it("omits the conversation prompt from the request when none is customized", async () => {
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => {
      result.current.setDraft("A latte, please.")
    })
    act(() => {
      result.current.sendDraft()
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).not.toHaveProperty("conversationPrompt")

    unmount()
  })

  it("sends the configured conversation prompt with the request", async () => {
    setConversationPrefs((current) => ({
      ...current,
      conversationPrompt: "每轮都纠正我的语法错误。",
    }))
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => {
      result.current.setDraft("A latte, please.")
    })
    act(() => {
      result.current.sendDraft()
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.conversationPrompt).toBe("每轮都纠正我的语法错误。")

    unmount()
  })

  it("marks a reply that missed the output contract so the transcript names the prompt", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            content: "I understand what you mean.",
            translation: "",
            recall: "",
            contractApplied: false,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    const scene = getConversationScene("coffee")
    const { result, unmount } = renderHook(() => useVoiceConversation({ scene }))

    act(() => {
      result.current.setDraft("A latte, please.")
    })
    act(() => {
      result.current.sendDraft()
    })

    await waitFor(() => {
      expect(result.current.messages.at(-1)?.variant).toBe("prompt")
    })
    // A parsed reply is a normal turn, so nothing is flagged.
    expect(result.current.messages.at(-1)?.variant).not.toBe("error")

    unmount()
  })
})
