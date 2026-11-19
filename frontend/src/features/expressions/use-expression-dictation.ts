"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLocalTts } from "@/features/speech/use-local-tts"
import { useSpeechConfig } from "@/features/speech/use-speech-config"
import { checkDictation } from "@/lib/expression-study"
import { transcribeSpeechAudio } from "@/lib/speech-client"

/**
 * 地道表达的「跟读听写」一次性练习：TTS 朗读例句 → 学习者复述并录音 →
 * 走应用自己的 /api/speech/asr 上传识别 → 与目标表达做容错比对。
 *
 * 刻意不复用对话的 useVoiceCallRuntime：那是为连续通话设计的状态机（回声守卫、
 * 静默触发器、自动请求回复），语义过重。这里只需要「一句一录一判」。
 */
export type DictationPhase = "idle" | "playing" | "recording" | "transcribing" | "result"

export type DictationVerdict = { passed: boolean; similarity: number }

export function useExpressionDictation() {
  const { speak, stop: stopSpeech } = useLocalTts()
  const { resolved } = useSpeechConfig()
  const [phase, setPhase] = useState<DictationPhase>("idle")
  const [transcript, setTranscript] = useState("")
  const [verdict, setVerdict] = useState<DictationVerdict | null>(null)
  const [error, setError] = useState("")
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const controllerRef = useRef<AbortController | null>(null)

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop()
    })
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  useEffect(
    () => () => {
      controllerRef.current?.abort()
      release()
      stopSpeech()
    },
    [release, stopSpeech],
  )

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setPhase("idle")
    setTranscript("")
    setVerdict(null)
    setError("")
  }, [])

  const play = useCallback(
    async (text: string) => {
      setError("")
      setPhase("playing")
      try {
        await speak(text, { speed: 0.9 })
        setPhase("idle")
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "语音播放失败")
        setPhase("idle")
      }
    },
    [speak],
  )

  const startRecording = useCallback(async () => {
    setError("")
    setVerdict(null)
    setTranscript("")
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("当前浏览器不支持录音，请改用闪卡或填空方式。")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      )
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setPhase("recording")
    } catch {
      setError("无法访问麦克风，请检查浏览器权限。")
      setPhase("idle")
      release()
    }
  }, [release])

  const stopAndCheck = useCallback(
    async (expected: string) => {
      const recorder = recorderRef.current
      if (!recorder || recorder.state === "inactive") {
        return
      }
      setPhase("transcribing")
      const audio = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          })
          release()
          resolve(blob)
        }
        recorder.stop()
      })
      const controller = new AbortController()
      controllerRef.current = controller
      try {
        const { text } = await transcribeSpeechAudio({
          endpoint: resolved.asr,
          audio,
          language: "en",
          signal: controller.signal,
        })
        setTranscript(text)
        setVerdict(checkDictation(expected, text))
        setPhase("result")
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return
        }
        setError(caught instanceof Error ? caught.message : "语音识别失败，请重试。")
        setPhase("idle")
      } finally {
        controllerRef.current = null
      }
    },
    [release, resolved.asr],
  )

  return {
    phase,
    transcript,
    verdict,
    error,
    play,
    startRecording,
    stopAndCheck,
    reset,
    supported:
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined",
  }
}
