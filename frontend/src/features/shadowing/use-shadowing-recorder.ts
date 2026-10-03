"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { assessShadowingAttempt, type ShadowingAssessment } from "@/lib/shadowing-assessment"

export type ShadowingRecording = {
  audioUrl: string
  assessment: ShadowingAssessment
  waveform: number[]
}

type UseShadowingRecorderOptions = {
  expectedDurationSeconds: number
  onComplete: (recording: ShadowingRecording) => void
}

const waveformBarCount = 20

function selectMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return ""
  }
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  )
}

function createWaveform(samples: number[]) {
  if (samples.length === 0) {
    return Array.from({ length: waveformBarCount }, () => 8)
  }

  const bucketSize = Math.max(1, Math.ceil(samples.length / waveformBarCount))
  return Array.from({ length: waveformBarCount }, (_, index) => {
    const bucket = samples.slice(index * bucketSize, (index + 1) * bucketSize)
    const peak = bucket.length > 0 ? Math.max(...bucket) : 0
    return Math.max(8, Math.min(100, Math.round(peak * 650)))
  })
}

export function useShadowingRecorder({
  expectedDurationSeconds,
  onComplete,
}: UseShadowingRecorderOptions) {
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [result, setResult] = useState<ShadowingRecording | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const chunksRef = useRef<Blob[]>([])
  const rmsSamplesRef = useRef<number[]>([])
  const captureIdRef = useRef(0)
  const resultRef = useRef<ShadowingRecording | null>(null)
  const audioUrlsRef = useRef(new Set<string>())
  const playbackRef = useRef<HTMLAudioElement | null>(null)
  const finishPlaybackRef = useRef<(() => void) | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const stopCaptureResources = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => {
      track.stop()
    })
    streamRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
  }, [])

  const stopPlayback = useCallback(() => {
    playbackRef.current?.pause()
    playbackRef.current = null
    finishPlaybackRef.current?.()
    finishPlaybackRef.current = null
    setPlaying(false)
  }, [])

  const reset = useCallback(() => {
    captureIdRef.current += 1
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop()
    }
    recorderRef.current = null
    stopCaptureResources()
    stopPlayback()
    resultRef.current = null
    setResult(null)
    setRecording(false)
    setProcessing(false)
    setElapsedSeconds(0)
  }, [stopCaptureResources, stopPlayback])

  const stop = useCallback(() => {
    if (recorderRef.current?.state !== "recording") {
      return
    }
    setRecording(false)
    setProcessing(true)
    recorderRef.current.stop()
    stopCaptureResources()
  }, [stopCaptureResources])

  const start = useCallback(async () => {
    if (
      typeof MediaRecorder === "undefined" ||
      typeof window.AudioContext === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error("当前浏览器不支持本地录音与声学评估")
    }

    reset()
    const captureId = captureIdRef.current + 1
    captureIdRef.current = captureId
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    if (captureId !== captureIdRef.current) {
      stream.getTracks().forEach((track) => {
        track.stop()
      })
      return
    }
    streamRef.current = stream

    let analyser: AnalyserNode
    let recorder: MediaRecorder
    try {
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      audioContextRef.current = audioContext

      const mimeType = selectMimeType()
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    } catch (error) {
      stopCaptureResources()
      throw error
    }

    const samples = new Float32Array(analyser.fftSize)
    const captureLevel = () => {
      analyser.getFloatTimeDomainData(samples)
      let energy = 0
      for (const sample of samples) {
        energy += sample * sample
      }
      rmsSamplesRef.current.push(Math.sqrt(energy / samples.length))
      animationFrameRef.current = window.requestAnimationFrame(captureLevel)
    }

    chunksRef.current = []
    rmsSamplesRef.current = []
    recorderRef.current = recorder
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }
    recorder.onstop = () => {
      recorderRef.current = null
      if (captureId !== captureIdRef.current) {
        chunksRef.current = []
        rmsSamplesRef.current = []
        return
      }

      const durationSeconds = Math.max(0, (performance.now() - startedAtRef.current) / 1000)
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      })
      if (blob.size === 0) {
        setProcessing(false)
        return
      }

      const audioUrl = URL.createObjectURL(blob)
      audioUrlsRef.current.add(audioUrl)
      const recordingResult = {
        audioUrl,
        assessment: assessShadowingAttempt({
          durationSeconds,
          expectedDurationSeconds,
          rmsSamples: rmsSamplesRef.current,
        }),
        waveform: createWaveform(rmsSamplesRef.current),
      }
      resultRef.current = recordingResult
      setResult(recordingResult)
      setElapsedSeconds(recordingResult.assessment.durationSeconds)
      setProcessing(false)
      onCompleteRef.current(recordingResult)
    }

    startedAtRef.current = performance.now()
    recorder.start(250)
    captureLevel()
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((performance.now() - startedAtRef.current) / 1000)
    }, 100)
    setRecording(true)
  }, [expectedDurationSeconds, reset])

  const play = useCallback(
    async (recording = resultRef.current) => {
      if (!recording) {
        return
      }
      stopPlayback()
      const audio = new Audio(recording.audioUrl)
      playbackRef.current = audio
      setPlaying(true)

      await new Promise<void>((resolve, reject) => {
        let settled = false
        function finish(error?: Error) {
          if (settled) {
            return
          }
          settled = true
          if (playbackRef.current === audio) {
            playbackRef.current = null
            setPlaying(false)
          }
          finishPlaybackRef.current = null
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        }

        finishPlaybackRef.current = () => finish()
        audio.onended = () => finish()
        audio.onerror = () => finish(new Error("浏览器无法播放本次录音"))
        void audio.play().catch((error) => {
          finish(error instanceof Error ? error : new Error("浏览器无法播放本次录音"))
        })
      })
    },
    [stopPlayback],
  )

  useEffect(
    () => () => {
      captureIdRef.current += 1
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop()
      }
      recorderRef.current = null
      stopCaptureResources()
      stopPlayback()
      for (const audioUrl of audioUrlsRef.current) {
        URL.revokeObjectURL(audioUrl)
      }
      audioUrlsRef.current.clear()
    },
    [stopCaptureResources, stopPlayback],
  )

  return {
    elapsedSeconds,
    play,
    playing,
    processing,
    recording,
    reset,
    result,
    start,
    stop,
    stopPlayback,
  }
}
