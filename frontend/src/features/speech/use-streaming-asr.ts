"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { type AsrEngine, defaultAsrEngine } from "@/lib/asr-config"

type AsrServerEvent =
  | { type: "ready"; sampleRate: number; format: string }
  | { type: "started"; sampleRate: number; format: string }
  | { type: "partial"; text: string; segment: number; language?: string }
  | { type: "final"; text: string; segment: number; language?: string }
  | { type: "error"; code: string; message: string }
  | { type: "pong" }

type FunAsrServerEvent = {
  mode?: string
  text?: string
  is_final_sentence?: boolean
}

type StreamingAsrOptions = {
  context?: string
  engine?: AsrEngine
  onEngineFallback?: (engine: AsrEngine) => void
  onError: (error: Error) => void
  onPartial: (text: string) => void
  onProcessingChange: (processing: boolean) => void
  onSpeechStart?: () => void
  onTranscript: (text: string, language?: string) => void
}

const asrSampleRate = 16_000
const speechThresholdFloor = 0.02
const noiseCalibrationDurationMs = 500
const noiseThresholdMultiplier = 3
const speechStartDurationMs = 320
const speechResetDurationMs = 420
const asrConnectionTimeoutMs = 3_000
// The first engine load can be slow on CPU (a cold Qwen3-ASR load takes well
// over a minute), so once the socket is reachable we wait much longer for the
// "started" acknowledgement before giving up.
const asrEngineReadyTimeoutMs = 180_000

export type AsrConnectPhase = "connecting" | "loading-engine"

// "connecting" guards raw reachability; once the service answers with "ready"
// we switch to "loading-engine", which tolerates a slow first model load.
export function getAsrConnectTimeoutMs(phase: AsrConnectPhase) {
  return phase === "connecting" ? asrConnectionTimeoutMs : asrEngineReadyTimeoutMs
}

export function getAsrTimeoutError(phase: AsrConnectPhase, engine: AsrEngine) {
  return phase === "connecting"
    ? getAsrConnectionError(engine)
    : new Error("ASR 引擎加载超时，请稍后重试")
}

function validateLocalWebSocketUrl(configuredUrl: string, label: string) {
  const url = new URL(configuredUrl)
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"])
  if (!new Set(["ws:", "wss:"]).has(url.protocol) || !loopbackHosts.has(url.hostname)) {
    throw new Error(`${label}服务地址必须使用本机 WebSocket 地址`)
  }
  return url.toString()
}

export function getAsrServiceUrl(configuredUrl = process.env.NEXT_PUBLIC_ASR_SERVICE_URL) {
  return validateLocalWebSocketUrl(configuredUrl || "ws://127.0.0.1:5580/v1/asr/stream", "ASR ")
}

export function getFunAsrServiceUrl(
  configuredUrl = process.env.NEXT_PUBLIC_FUNASR_SERVICE_URL,
) {
  return validateLocalWebSocketUrl(configuredUrl || "ws://127.0.0.1:10095", "FunASR ")
}

export function getAsrConnectionError(engine: AsrEngine) {
  return engine === "funasr"
    ? new Error(
        "无法连接外部 FunASR 服务（默认端口 10095），请启动该服务或切换到 SenseVoice / Qwen3-ASR",
      )
    : new Error("无法连接 ASR 服务，请运行 pnpm asr:start")
}

export async function connectWithAsrFallback<T>(
  engine: AsrEngine,
  connect: (targetEngine: AsrEngine) => Promise<T>,
) {
  try {
    return { connection: await connect(engine), engine }
  } catch (error) {
    if (engine !== "funasr") {
      throw error
    }
    return {
      connection: await connect(defaultAsrEngine),
      engine: defaultAsrEngine,
    }
  }
}

export function float32ToPcm16Bytes(samples: Float32Array) {
  const pcm = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    pcm[index] = sample < 0 ? Math.round(sample * 32_768) : Math.round(sample * 32_767)
  }
  return pcm.buffer
}

export function resamplePcm(
  samples: Float32Array,
  inputSampleRate: number,
  outputSampleRate = asrSampleRate,
) {
  if (inputSampleRate === outputSampleRate) {
    return samples.slice()
  }

  const outputLength = Math.max(
    1,
    Math.round((samples.length * outputSampleRate) / inputSampleRate),
  )
  const output = new Float32Array(outputLength)
  const ratio = inputSampleRate / outputSampleRate
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio
    const leftIndex = Math.min(Math.floor(position), samples.length - 1)
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1)
    const weight = position - leftIndex
    output[index] =
      (samples[leftIndex] ?? 0) * (1 - weight) + (samples[rightIndex] ?? 0) * weight
  }
  return output
}

export function calculateAudioRms(samples: Float32Array) {
  if (samples.length === 0) {
    return 0
  }
  let sum = 0
  for (const sample of samples) {
    sum += sample * sample
  }
  return Math.sqrt(sum / samples.length)
}

export function calculateSpeechThreshold(noiseFloor: number) {
  return Math.max(speechThresholdFloor, noiseFloor * noiseThresholdMultiplier)
}

export function suppressNoiseFrame(
  samples: Float32Array,
  threshold: number,
  speechActive: boolean,
) {
  if (speechActive || calculateAudioRms(samples) >= threshold) {
    return samples
  }
  return new Float32Array(samples.length)
}

export function createAsrStartCommand(
  sampleRate = asrSampleRate,
  context = "",
  engine: AsrEngine = defaultAsrEngine,
) {
  return JSON.stringify({
    type: "start",
    sampleRate,
    format: "int16",
    engine,
    languages: ["zh", "en"],
    ...(context.trim() ? { context: context.trim().slice(0, 1_000) } : {}),
  })
}

export function createFunAsrStartCommand(sampleRate = asrSampleRate) {
  return JSON.stringify({
    mode: "2pass",
    chunk_size: [5, 10, 5],
    chunk_interval: 10,
    audio_fs: sampleRate,
    wav_name: "moss",
    wav_format: "pcm",
    is_speaking: true,
    hotwords: "",
    itn: true,
  })
}

export function parseFunAsrServerEvent(message: FunAsrServerEvent) {
  const text = typeof message.text === "string" ? message.text.trim() : ""
  if (!text) {
    return null
  }
  const final = message.is_final_sentence === true || message.mode?.endsWith("offline")
  return { final, text }
}

function supportsStreamingAsr() {
  return (
    typeof window !== "undefined" &&
    typeof WebSocket !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  )
}

export function useStreamingAsr({
  context = "",
  engine = defaultAsrEngine,
  onEngineFallback,
  onError,
  onPartial,
  onProcessingChange,
  onSpeechStart,
  onTranscript,
}: StreamingAsrOptions) {
  const [available, setAvailable] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const socketSampleRateRef = useRef<number | null>(null)
  const socketContextRef = useRef("")
  const socketEngineRef = useRef<AsrEngine | null>(null)
  const connectPromiseRef = useRef<Promise<WebSocket> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const highPassRef = useRef<BiquadFilterNode | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const silentGainRef = useRef<GainNode | null>(null)
  const noiseFloorRef = useRef(0.006)
  const calibrationDurationRef = useRef(0)
  const speechDurationRef = useRef(0)
  const silenceDurationRef = useRef(0)
  const speechActiveRef = useRef(false)
  const onErrorRef = useRef(onError)
  const onEngineFallbackRef = useRef(onEngineFallback)
  const onPartialRef = useRef(onPartial)
  const onProcessingChangeRef = useRef(onProcessingChange)
  const onSpeechStartRef = useRef(onSpeechStart)
  const onTranscriptRef = useRef(onTranscript)
  const contextRef = useRef(context)

  onErrorRef.current = onError
  onEngineFallbackRef.current = onEngineFallback
  onPartialRef.current = onPartial
  onProcessingChangeRef.current = onProcessingChange
  onSpeechStartRef.current = onSpeechStart
  onTranscriptRef.current = onTranscript
  contextRef.current = context

  const disconnectAudio = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null
      processorRef.current.disconnect()
      processorRef.current = null
    }
    sourceRef.current?.disconnect()
    sourceRef.current = null
    highPassRef.current?.disconnect()
    highPassRef.current = null
    compressorRef.current?.disconnect()
    compressorRef.current = null
    silentGainRef.current?.disconnect()
    silentGainRef.current = null
    speechDurationRef.current = 0
    silenceDurationRef.current = 0
    speechActiveRef.current = false
    noiseFloorRef.current = 0.006
    calibrationDurationRef.current = 0
    void audioContextRef.current?.close()
    audioContextRef.current = null
  }, [])

  const closeSocket = useCallback(() => {
    const socket = socketRef.current
    const connectedEngine = socketEngineRef.current
    socketRef.current = null
    socketSampleRateRef.current = null
    socketContextRef.current = ""
    socketEngineRef.current = null
    connectPromiseRef.current = null
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(
        connectedEngine === "funasr"
          ? JSON.stringify({ is_speaking: false })
          : JSON.stringify({ type: "stop" }),
      )
    }
    socket?.close()
  }, [])

  const prepareEngine = useCallback(async (targetEngine: AsrEngine) => {
    if (!supportsStreamingAsr()) {
      throw new Error("当前浏览器不支持实时语音识别")
    }
    setLoadingProgress(0)
    if (targetEngine === "funasr") {
      return
    }
    const serviceUrl = new URL(getAsrServiceUrl())
    serviceUrl.protocol = serviceUrl.protocol === "wss:" ? "https:" : "http:"
    serviceUrl.pathname = "/health"
    serviceUrl.search = ""
    try {
      const response = await fetch(serviceUrl, { cache: "no-store" })
      const result = (await response.json()) as { ready?: boolean }
      if (!response.ok || result.ready !== true) {
        throw new Error("ASR 服务尚未就绪")
      }
      setLoadingProgress(100)
    } catch (error) {
      setLoadingProgress(null)
      throw new Error(
        error instanceof Error && error.message === "ASR 服务尚未就绪"
          ? error.message
          : getAsrConnectionError(targetEngine).message,
      )
    }
  }, [])

  const prepare = useCallback(() => prepareEngine(engine), [engine, prepareEngine])

  const connect = useCallback(
    (sampleRate: number, targetEngine: AsrEngine) => {
      const existing = socketRef.current
      if (
        existing?.readyState === WebSocket.OPEN &&
        socketSampleRateRef.current === sampleRate &&
        socketContextRef.current === contextRef.current &&
        socketEngineRef.current === targetEngine
      ) {
        return Promise.resolve(existing)
      }
      if (connectPromiseRef.current) {
        return connectPromiseRef.current
      }

      closeSocket()
      connectPromiseRef.current = new Promise<WebSocket>((resolve, reject) => {
        const funAsr = targetEngine === "funasr"
        const socket = new WebSocket(funAsr ? getFunAsrServiceUrl() : getAsrServiceUrl())
        socket.binaryType = "arraybuffer"
        socketRef.current = socket
        let started = false
        let phase: AsrConnectPhase = "connecting"
        let pendingTimeout = 0
        const clearPendingTimeout = () => window.clearTimeout(pendingTimeout)
        const armTimeout = (nextPhase: AsrConnectPhase) => {
          phase = nextPhase
          window.clearTimeout(pendingTimeout)
          pendingTimeout = window.setTimeout(() => {
            if (!started) {
              socket.close()
              reject(getAsrTimeoutError(phase, targetEngine))
            }
          }, getAsrConnectTimeoutMs(nextPhase))
        }
        // Once the service proves reachable, keep waiting through a slow first
        // engine load instead of falsely reporting the service as unreachable.
        const awaitEngineReady = () => {
          if (phase !== "connecting") {
            return
          }
          setLoadingProgress((current) => current ?? 0)
          armTimeout("loading-engine")
        }
        armTimeout("connecting")

        socket.addEventListener("open", () => {
          if (!funAsr) {
            return
          }
          clearPendingTimeout()
          socket.send(createFunAsrStartCommand(sampleRate))
          started = true
          socketSampleRateRef.current = sampleRate
          socketContextRef.current = contextRef.current
          socketEngineRef.current = targetEngine
          setLoadingProgress(100)
          resolve(socket)
        })
        socket.addEventListener("message", (event) => {
          let message: AsrServerEvent | FunAsrServerEvent
          try {
            message = JSON.parse(String(event.data)) as AsrServerEvent | FunAsrServerEvent
          } catch {
            onErrorRef.current(new Error("ASR 服务返回了无效消息"))
            return
          }
          if (funAsr) {
            const result = parseFunAsrServerEvent(message as FunAsrServerEvent)
            if (!result) {
              return
            }
            if (result.final) {
              onProcessingChangeRef.current(false)
              onPartialRef.current("")
              onTranscriptRef.current(result.text)
            } else {
              onProcessingChangeRef.current(true)
              onPartialRef.current(result.text)
            }
            return
          }
          const mossMessage = message as AsrServerEvent
          if (mossMessage.type === "ready") {
            // The socket is reachable; the engine may still be loading, so
            // extend the deadline before requesting a session.
            awaitEngineReady()
            socket.send(createAsrStartCommand(sampleRate, contextRef.current, targetEngine))
            return
          }
          if (mossMessage.type === "started") {
            clearPendingTimeout()
            started = true
            socketSampleRateRef.current = sampleRate
            socketContextRef.current = contextRef.current
            socketEngineRef.current = targetEngine
            setLoadingProgress(100)
            resolve(socket)
            return
          }
          if (mossMessage.type === "partial") {
            onProcessingChangeRef.current(true)
            onPartialRef.current(mossMessage.text)
            return
          }
          if (mossMessage.type === "final") {
            onProcessingChangeRef.current(false)
            onPartialRef.current("")
            onTranscriptRef.current(mossMessage.text, mossMessage.language)
            return
          }
          if (mossMessage.type === "error") {
            const error = new Error(mossMessage.message || `ASR 服务错误：${mossMessage.code}`)
            if (!started) {
              reject(error)
            } else {
              onErrorRef.current(error)
            }
          }
        })
        socket.addEventListener("error", () => {
          clearPendingTimeout()
          const error = getAsrConnectionError(targetEngine)
          if (!started) {
            reject(error)
          } else {
            onErrorRef.current(error)
          }
        })
        socket.addEventListener("close", () => {
          clearPendingTimeout()
          if (!started) {
            reject(new Error("ASR 服务连接已关闭"))
          }
          if (socketRef.current === socket) {
            socketRef.current = null
            socketSampleRateRef.current = null
            socketContextRef.current = ""
            socketEngineRef.current = null
            connectPromiseRef.current = null
          }
        })
      }).finally(() => {
        connectPromiseRef.current = null
      })
      return connectPromiseRef.current
    },
    [closeSocket],
  )

  const pause = useCallback(() => {
    disconnectAudio()
    closeSocket()
    onPartialRef.current("")
    onProcessingChangeRef.current(false)
  }, [closeSocket, disconnectAudio])

  const stop = useCallback(() => {
    disconnectAudio()
    closeSocket()
    onPartialRef.current("")
    onProcessingChangeRef.current(false)
  }, [closeSocket, disconnectAudio])

  const start = useCallback(
    async (stream: MediaStream) => {
      disconnectAudio()
      await prepare()
      const audioContext = new AudioContext({
        latencyHint: "interactive",
        sampleRate: asrSampleRate,
      })
      audioContextRef.current = audioContext
      let socket: WebSocket
      try {
        const result = await connectWithAsrFallback(engine, async (targetEngine) => {
          if (targetEngine !== engine) {
            closeSocket()
            await prepareEngine(targetEngine)
          }
          return connect(asrSampleRate, targetEngine)
        })
        socket = result.connection
        if (result.engine !== engine) {
          onEngineFallbackRef.current?.(result.engine)
        }
        await audioContext.resume()
      } catch (error) {
        if (audioContextRef.current === audioContext) {
          audioContextRef.current = null
        }
        await audioContext.close()
        throw error
      }
      const source = audioContext.createMediaStreamSource(stream)
      const highPass = audioContext.createBiquadFilter()
      highPass.type = "highpass"
      highPass.frequency.value = 80
      highPass.Q.value = 0.7
      const compressor = audioContext.createDynamicsCompressor()
      compressor.threshold.value = -34
      compressor.knee.value = 18
      compressor.ratio.value = 3
      compressor.attack.value = 0.003
      compressor.release.value = 0.2
      const processor = audioContext.createScriptProcessor(1_024, 1, 1)
      const silentGain = audioContext.createGain()
      silentGain.gain.value = 0
      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 1024 * 1024) {
          return
        }
        const samples = event.inputBuffer.getChannelData(0)
        const frameDurationMs = (samples.length / audioContext.sampleRate) * 1_000
        const rms = calculateAudioRms(samples)
        const speechThreshold = calculateSpeechThreshold(noiseFloorRef.current)
        const calibrating = calibrationDurationRef.current < noiseCalibrationDurationMs

        if (calibrating) {
          const boundedRms = Math.min(rms, noiseFloorRef.current * 1.5)
          noiseFloorRef.current = noiseFloorRef.current * 0.65 + boundedRms * 0.35
          calibrationDurationRef.current += frameDurationMs
        }

        if (!calibrating && rms >= speechThreshold) {
          speechDurationRef.current += frameDurationMs
          silenceDurationRef.current = 0
          if (!speechActiveRef.current && speechDurationRef.current >= speechStartDurationMs) {
            speechActiveRef.current = true
            onSpeechStartRef.current?.()
            onProcessingChangeRef.current(true)
          }
        } else {
          const boundedRms = Math.min(rms, noiseFloorRef.current * 1.25)
          noiseFloorRef.current = noiseFloorRef.current * 0.92 + boundedRms * 0.08
          speechDurationRef.current = 0
          silenceDurationRef.current += frameDurationMs
          if (silenceDurationRef.current >= speechResetDurationMs) {
            speechActiveRef.current = false
          }
        }

        const gatedSamples = suppressNoiseFrame(
          samples,
          calibrating ? Number.POSITIVE_INFINITY : speechThreshold,
          speechActiveRef.current,
        )
        const resampled = resamplePcm(gatedSamples, audioContext.sampleRate)
        socket.send(float32ToPcm16Bytes(resampled))
      }
      source.connect(highPass)
      highPass.connect(compressor)
      compressor.connect(processor)
      processor.connect(silentGain)
      silentGain.connect(audioContext.destination)
      sourceRef.current = source
      highPassRef.current = highPass
      compressorRef.current = compressor
      processorRef.current = processor
      silentGainRef.current = silentGain
      onProcessingChangeRef.current(false)
    },
    [closeSocket, connect, disconnectAudio, engine, prepare, prepareEngine],
  )

  useEffect(() => {
    setAvailable(supportsStreamingAsr())
    return stop
  }, [stop])

  return {
    available,
    loadingProgress,
    pause,
    prepare,
    start,
    stop,
  }
}
