"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { normalizeSpeechTranscript } from "@/lib/call-runtime"
import {
  SpeechApiClientError,
  supportsBrowserSpeechRecognition,
  transcribeSpeechAudio,
} from "@/lib/speech-client"
import type { SpeechEndpoint } from "@/lib/speech-config"

type BrowserRecognitionAlternative = { transcript: string }
type BrowserRecognitionResult = {
  isFinal: boolean
  0: BrowserRecognitionAlternative
}
type BrowserRecognitionEventLike = {
  resultIndex: number
  results: {
    length: number
    [index: number]: BrowserRecognitionResult
  }
}
type BrowserRecognitionErrorEventLike = { error: string; message?: string }

type BrowserRecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: BrowserRecognitionEventLike) => void) | null
  onerror: ((event: BrowserRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
}

type BrowserRecognitionConstructor = new () => BrowserRecognitionInstance

function getRecognitionConstructor(): BrowserRecognitionConstructor | null {
  if (!supportsBrowserSpeechRecognition()) {
    return null
  }
  const scope = window as Window & {
    SpeechRecognition?: BrowserRecognitionConstructor
    webkitSpeechRecognition?: BrowserRecognitionConstructor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

function describeRecognitionError(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return new Error("浏览器拒绝了语音识别权限，请检查麦克风授权")
  }
  if (error === "audio-capture") {
    return new Error("没有检测到可用的麦克风输入")
  }
  if (error === "network") {
    return new Error("浏览器语音识别服务连接失败")
  }
  return new Error(`浏览器语音识别失败：${error}`)
}

function selectAudioMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return ""
  }
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find(
      (type) => MediaRecorder.isTypeSupported(type),
    ) ?? ""
  )
}

export type BrowserAsrOptions = {
  endpoint: SpeechEndpoint
  onError: (error: Error) => void
  onPartial: (text: string) => void
  onProcessingChange: (processing: boolean) => void
  onSpeechStart?: () => void
  onTranscript: (text: string, language?: string) => void
}

/**
 * Web Speech API backend. It replaces the local streaming service when it is unavailable or the
 * learner selects it explicitly, so voice practice keeps working without any sidecar process.
 */
export function useBrowserAsr({
  endpoint,
  onError,
  onPartial,
  onProcessingChange,
  onSpeechStart,
  onTranscript,
}: BrowserAsrOptions) {
  const [available, setAvailable] = useState(false)
  const recognitionRef = useRef<BrowserRecognitionInstance | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const activeRef = useRef(false)
  const processingRef = useRef(false)
  const onErrorRef = useRef(onError)
  const onPartialRef = useRef(onPartial)
  const onProcessingChangeRef = useRef(onProcessingChange)
  const onSpeechStartRef = useRef(onSpeechStart)
  const onTranscriptRef = useRef(onTranscript)
  const endpointRef = useRef(endpoint)
  const requestIdRef = useRef(0)

  onErrorRef.current = onError
  onPartialRef.current = onPartial
  onProcessingChangeRef.current = onProcessingChange
  onSpeechStartRef.current = onSpeechStart
  onTranscriptRef.current = onTranscript
  endpointRef.current = endpoint

  const setProcessing = useCallback((processing: boolean) => {
    processingRef.current = processing
    onProcessingChangeRef.current(processing)
  }, [])

  const teardown = useCallback(() => {
    activeRef.current = false
    requestIdRef.current += 1
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.onspeechstart = null
      recognition.onspeechend = null
      recognition.abort()
    }
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null
      recorder.ondataavailable = null
      recorder.stop()
    }
    chunksRef.current = []
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop()
    }
    streamRef.current = null
    setProcessing(false)
    onPartialRef.current("")
  }, [setProcessing])

  const transcribeRecordedChunk = useCallback(async () => {
    const recorder = recorderRef.current
    const mimeType = recorder?.mimeType || selectAudioMimeType()
    if (recorder && recorder.state === "recording") {
      recorder.stop()
    }
    const audio =
      chunksRef.current.length > 0
        ? new Blob(chunksRef.current, mimeType ? { type: mimeType } : undefined)
        : null
    chunksRef.current = []
    if (!audio || audio.size === 0) {
      return
    }
    const requestId = requestIdRef.current
    setProcessing(true)
    try {
      const { text } = await transcribeSpeechAudio({
        audio,
        endpoint: endpointRef.current,
      })
      if (requestId !== requestIdRef.current || !text) {
        return
      }
      onTranscriptRef.current(text)
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      onErrorRef.current(
        error instanceof SpeechApiClientError || error instanceof Error
          ? error
          : new Error("语音识别接口暂时不可用"),
      )
    } finally {
      if (requestId === requestIdRef.current) {
        setProcessing(false)
      }
    }
  }, [setProcessing])

  const start = useCallback(
    async (stream?: MediaStream) => {
      teardown()
      activeRef.current = true
      requestIdRef.current += 1

      if (endpointRef.current.transport === "api") {
        if (typeof MediaRecorder === "undefined") {
          throw new Error("当前浏览器不支持录音上传识别，请改用其他识别方式")
        }
        const mediaStream =
          stream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }))
        streamRef.current = mediaStream
        const recorder = new MediaRecorder(mediaStream, {
          ...(selectAudioMimeType() ? { mimeType: selectAudioMimeType() } : {}),
        })
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data)
          }
        }
        recorder.start(1_000)
        recorderRef.current = recorder
        return
      }

      const Recognition = getRecognitionConstructor()
      if (!Recognition) {
        activeRef.current = false
        throw new Error("当前浏览器不支持系统语音识别")
      }
      // The Web Speech engine captures its own audio; the stream handed over by the call runtime
      // only exists so microphone permission is requested and released in one place.
      const recognition = new Recognition()
      recognition.lang = "zh-CN"
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.onspeechstart = () => {
        onSpeechStartRef.current?.()
      }
      recognition.onresult = (event) => {
        let interim = ""
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          const text = normalizeSpeechTranscript(result?.[0]?.transcript ?? "")
          if (!text) {
            continue
          }
          if (result?.isFinal) {
            setProcessing(false)
            onPartialRef.current("")
            onTranscriptRef.current(text, recognition.lang)
          } else {
            interim = `${interim} ${text}`.trim()
          }
        }
        if (interim) {
          setProcessing(true)
          onPartialRef.current(interim)
        }
      }
      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") {
          return
        }
        onErrorRef.current(describeRecognitionError(event.error))
      }
      recognition.onend = () => {
        // Chrome ends a session after a short silence; keep the microphone turn open so the
        // conversation loop can keep listening without a new call.
        if (activeRef.current) {
          try {
            recognition.start()
          } catch {
            activeRef.current = false
          }
        }
      }
      recognitionRef.current = recognition
      try {
        recognition.start()
      } catch (error) {
        recognitionRef.current = null
        activeRef.current = false
        throw error instanceof Error ? error : new Error("无法启动浏览器语音识别")
      }
    },
    [setProcessing, teardown],
  )

  const pause = useCallback(() => {
    if (endpointRef.current.transport === "api" && recorderRef.current) {
      void transcribeRecordedChunk()
      return
    }
    teardown()
  }, [teardown, transcribeRecordedChunk])

  const stop = useCallback(() => {
    teardown()
  }, [teardown])

  const prepare = useCallback(async () => {
    if (endpointRef.current.transport === "api") {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("当前浏览器不支持录音上传识别，请改用其他识别方式")
      }
      return
    }
    if (!getRecognitionConstructor()) {
      throw new Error("当前浏览器不支持系统语音识别")
    }
  }, [])

  useEffect(() => {
    setAvailable(
      endpoint.transport === "api"
        ? typeof MediaRecorder !== "undefined"
        : supportsBrowserSpeechRecognition(),
    )
    return stop
  }, [endpoint.transport, stop])

  return { available, pause, prepare, start, stop }
}
