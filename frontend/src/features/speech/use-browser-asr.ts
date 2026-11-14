"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  type ApiAsrTurnTracker,
  apiBargeInThresholdBoost,
  calculateByteRms,
  createApiAsrTurnTracker,
} from "@/features/speech/api-asr-turn-detection"
import { resamplePcm } from "@/features/speech/use-streaming-asr"
import { encodeWavBlob } from "@/lib/audio-wav"
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

// api 识别上传统一编码为 16kHz 单声道 WAV：与流式识别的采样率一致，
// 25s 上限约 800KB，远低于网关的音频字节上限。
const apiUploadSampleRate = 16_000
const apiMeterIntervalMs = 100

export type BrowserAsrOptions = {
  endpoint: SpeechEndpoint
  /** 暂停采集（助手播报/静音）期间是否保留高阈值打断监听。 */
  bargeInEnabled?: boolean
  onError: (error: Error) => void
  onPartial: (text: string) => void
  onProcessingChange: (processing: boolean) => void
  onSpeechStart?: () => void
  onTranscript: (text: string, language?: string) => void
}

/**
 * Web Speech API backend. It replaces the local streaming service when it is unavailable or the
 * learner selects it explicitly, so voice practice keeps working without any sidecar process.
 * The `api` transport records through the same Web Audio graph that powers turn detection and
 * uploads a WAV per detected turn.
 */
export function useBrowserAsr({
  bargeInEnabled = false,
  endpoint,
  onError,
  onPartial,
  onProcessingChange,
  onSpeechStart,
  onTranscript,
}: BrowserAsrOptions) {
  const [available, setAvailable] = useState(false)
  const recognitionRef = useRef<BrowserRecognitionInstance | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // 麦克风流通常由通话运行时持有并在通话结束时释放；只有这里自己 getUserMedia
  // 的流才允许在本 hook 内停轨，否则下一轮 start() 会拿到无活轨的死流。
  const selfAcquiredStreamRef = useRef(false)
  const activeRef = useRef(false)
  const processingRef = useRef(false)
  // api 接入的静音断句与 PCM 采集共用一张 Web Audio 图：能量检测说「说完一句」
  // 时快照已积累的 PCM 编码为 WAV 上传，采集保持运行，监听不中断。
  const audioGraphRef = useRef<{
    context: AudioContext
    source: MediaStreamAudioSourceNode
    processor: ScriptProcessorNode
    silentGain: GainNode
  } | null>(null)
  const turnAnalyserRef = useRef<AnalyserNode | null>(null)
  const turnMeterBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const turnFeedTimerRef = useRef<number | null>(null)
  const turnTrackerRef = useRef<ApiAsrTurnTracker | null>(null)
  const pcmFramesRef = useRef<Float32Array[]>([])
  const pcmFrameCountRef = useRef(0)
  const capturePausedRef = useRef(false)
  const onErrorRef = useRef(onError)
  const onPartialRef = useRef(onPartial)
  const onProcessingChangeRef = useRef(onProcessingChange)
  const onSpeechStartRef = useRef(onSpeechStart)
  const onTranscriptRef = useRef(onTranscript)
  const endpointRef = useRef(endpoint)
  const bargeInRef = useRef(bargeInEnabled)
  const requestIdRef = useRef(0)

  onErrorRef.current = onError
  onPartialRef.current = onPartial
  onProcessingChangeRef.current = onProcessingChange
  onSpeechStartRef.current = onSpeechStart
  onTranscriptRef.current = onTranscript
  endpointRef.current = endpoint
  bargeInRef.current = bargeInEnabled

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
    pcmFramesRef.current = []
    pcmFrameCountRef.current = 0
    capturePausedRef.current = false
    if (turnFeedTimerRef.current !== null) {
      window.clearInterval(turnFeedTimerRef.current)
      turnFeedTimerRef.current = null
    }
    turnTrackerRef.current = null
    turnAnalyserRef.current = null
    turnMeterBufferRef.current = null
    const graph = audioGraphRef.current
    audioGraphRef.current = null
    if (graph) {
      graph.processor.onaudioprocess = null
      graph.source.disconnect()
      graph.processor.disconnect()
      graph.silentGain.disconnect()
      void graph.context.close().catch(() => {})
    }
    if (selfAcquiredStreamRef.current) {
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop()
      }
      selfAcquiredStreamRef.current = false
    }
    streamRef.current = null
    setProcessing(false)
    onPartialRef.current("")
  }, [setProcessing])

  const uploadRecordedAudio = useCallback(
    async (audio: Blob | null) => {
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
    },
    [setProcessing],
  )

  // VAD 断句用：只快照已积累的 PCM 并编码上传，采集保持运行，监听不中断；
  // 上传与提交期间用户继续说话的内容会进入下一个快照。
  const flushRecordedAudio = useCallback(async () => {
    const graph = audioGraphRef.current
    const frames = pcmFramesRef.current
    const frameCount = pcmFrameCountRef.current
    pcmFramesRef.current = []
    pcmFrameCountRef.current = 0
    if (!graph || frameCount === 0) {
      return
    }
    const samples = new Float32Array(frameCount)
    let offset = 0
    for (const frame of frames) {
      samples.set(frame, offset)
      offset += frame.length
    }
    const resampled = resamplePcm(samples, graph.context.sampleRate, apiUploadSampleRate)
    await uploadRecordedAudio(encodeWavBlob(resampled, apiUploadSampleRate))
  }, [uploadRecordedAudio])

  const start = useCallback(
    async (stream?: MediaStream) => {
      teardown()
      activeRef.current = true
      requestIdRef.current += 1

      if (endpointRef.current.transport === "api") {
        if (typeof window.AudioContext === "undefined") {
          throw new Error("当前浏览器不支持录音上传识别，请改用其他识别方式")
        }
        const mediaStream =
          stream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }))
        selfAcquiredStreamRef.current = !stream
        streamRef.current = mediaStream

        const audioContext = new AudioContext()
        void audioContext.resume().catch(() => {})
        const source = audioContext.createMediaStreamSource(mediaStream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 1024
        source.connect(analyser)
        // ScriptProcessor 与流式识别同一采集模式；接一个静音增益到目的地才能持续触发。
        const processor = audioContext.createScriptProcessor(4096)
        const silentGain = audioContext.createGain()
        silentGain.gain.value = 0
        processor.onaudioprocess = (event) => {
          if (capturePausedRef.current) {
            return
          }
          const frame = new Float32Array(event.inputBuffer.getChannelData(0))
          pcmFramesRef.current.push(frame)
          pcmFrameCountRef.current += frame.length
        }
        source.connect(processor)
        processor.connect(silentGain)
        silentGain.connect(audioContext.destination)

        audioGraphRef.current = { context: audioContext, source, processor, silentGain }
        turnAnalyserRef.current = analyser
        const meterBuffer = new Uint8Array(new ArrayBuffer(analyser.fftSize))
        turnMeterBufferRef.current = meterBuffer
        turnTrackerRef.current = createApiAsrTurnTracker({
          onSpeechStart: () => {
            onSpeechStartRef.current?.()
          },
          onSpeechEnd: () => {
            void flushRecordedAudio()
          },
        })
        turnFeedTimerRef.current = window.setInterval(() => {
          const currentAnalyser = turnAnalyserRef.current
          const tracker = turnTrackerRef.current
          const buffer = turnMeterBufferRef.current
          if (!currentAnalyser || !tracker || !buffer) {
            return
          }
          currentAnalyser.getByteTimeDomainData(buffer)
          tracker.feed(calculateByteRms(buffer), apiMeterIntervalMs)
        }, apiMeterIntervalMs)
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
    [flushRecordedAudio, setProcessing, teardown],
  )

  // 播报期间的打断监听：与采集共用同一张 Web Audio 图，但用高倍阈值——扬声器回声
  // 经噪声底自适应后远低于直接说话的能量，只有真实发言能触发 speech-start；
  // 监听不产生转写与上传，侦测到打断后由运行时立即恢复完整采集。
  const armBargeInMonitor = useCallback(() => {
    if (!turnAnalyserRef.current || turnFeedTimerRef.current !== null) {
      return
    }
    turnTrackerRef.current = createApiAsrTurnTracker({
      thresholdBoost: apiBargeInThresholdBoost,
      onSpeechStart: () => {
        onSpeechStartRef.current?.()
      },
    })
    turnFeedTimerRef.current = window.setInterval(() => {
      const currentAnalyser = turnAnalyserRef.current
      const tracker = turnTrackerRef.current
      const buffer = turnMeterBufferRef.current
      if (!currentAnalyser || !tracker || !buffer) {
        return
      }
      currentAnalyser.getByteTimeDomainData(buffer)
      tracker.feed(calculateByteRms(buffer), apiMeterIntervalMs)
    }, apiMeterIntervalMs)
  }, [])

  const pause = useCallback(() => {
    if (endpointRef.current.transport !== "api") {
      teardown()
      return
    }
    // 先停采集并同步解除采集用检测器（回声不能触发 speech-start 打断播报），
    // 上传已积累音频；随后保留高阈值打断监听，真实发言立即恢复识别。
    capturePausedRef.current = true
    turnTrackerRef.current = null
    if (turnFeedTimerRef.current !== null) {
      window.clearInterval(turnFeedTimerRef.current)
      turnFeedTimerRef.current = null
    }
    void flushRecordedAudio().then(() => {
      if (activeRef.current && bargeInRef.current) {
        armBargeInMonitor()
      }
    })
  }, [armBargeInMonitor, flushRecordedAudio])

  const stop = useCallback(() => {
    teardown()
  }, [teardown])

  const prepare = useCallback(async () => {
    if (endpointRef.current.transport === "api") {
      if (typeof window.AudioContext === "undefined") {
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
        ? typeof window.AudioContext !== "undefined"
        : supportsBrowserSpeechRecognition(),
    )
    return stop
  }, [endpoint.transport, stop])

  return { available, pause, prepare, start, stop }
}
