"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAsrConfig } from "@/features/speech/use-asr-config"
import { useBrowserAsr } from "@/features/speech/use-browser-asr"
import { useSpeechConfig } from "@/features/speech/use-speech-config"
import { type StreamingAsrOptions, useStreamingAsr } from "@/features/speech/use-streaming-asr"
import { supportsBrowserSpeechRecognition } from "@/lib/speech-client"

export type AsrSessionOptions = Omit<StreamingAsrOptions, "engine"> & {
  onTransportFallback?: (error: Error) => void
}

/**
 * Single entry point for speech recognition. The local streaming service stays the default, and a
 * failed connection falls back to the browser engine for the rest of the session so voice practice
 * keeps working when the sidecar is not running.
 */
export function useAsrSession(options: AsrSessionOptions) {
  const { engine } = useAsrConfig()
  const { resolved } = useSpeechConfig()
  const [fallbackActive, setFallbackActive] = useState(false)
  const fallbackActiveRef = useRef(false)
  const onTransportFallbackRef = useRef(options.onTransportFallback)
  onTransportFallbackRef.current = options.onTransportFallback
  const transport = fallbackActive ? "browser" : resolved.asr.transport

  useEffect(() => {
    fallbackActiveRef.current = false
    setFallbackActive(false)
  }, [resolved.asr.transport])

  const useFallback = useCallback((error: unknown) => {
    if (fallbackActiveRef.current || !supportsBrowserSpeechRecognition()) {
      return
    }
    fallbackActiveRef.current = true
    setFallbackActive(true)
    onTransportFallbackRef.current?.(
      error instanceof Error ? error : new Error("语音识别服务不可用"),
    )
  }, [])

  const streaming = useStreamingAsr({
    ...options,
    endpoint: resolved.asr.transport === "local" ? resolved.asr.endpoint : "",
    engine,
  })
  const browser = useBrowserAsr({
    endpoint: resolved.asr,
    onError: options.onError,
    onPartial: options.onPartial,
    onProcessingChange: options.onProcessingChange,
    onSpeechStart: options.onSpeechStart,
    onTranscript: options.onTranscript,
  })

  const prepare = useCallback(async () => {
    try {
      await (transport === "local" ? streaming.prepare() : browser.prepare())
    } catch (error) {
      if (transport !== "local" || !supportsBrowserSpeechRecognition()) {
        throw error
      }
      useFallback(error)
      await browser.prepare()
    }
  }, [browser, streaming, transport, useFallback])

  const start = useCallback(
    async (stream: MediaStream) => {
      try {
        await (transport === "local" ? streaming.start(stream) : browser.start(stream))
      } catch (error) {
        if (transport !== "local" || !supportsBrowserSpeechRecognition()) {
          throw error
        }
        useFallback(error)
        await browser.start(stream)
      }
    },
    [browser, streaming, transport, useFallback],
  )

  return {
    available: (transport === "local" ? streaming : browser).available,
    loadingProgress: transport === "local" ? streaming.loadingProgress : null,
    pause: transport === "local" ? streaming.pause : browser.pause,
    prepare,
    start,
    stop: transport === "local" ? streaming.stop : browser.stop,
    transport,
  }
}
