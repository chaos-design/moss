"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTtsConfig } from "@/features/speech/use-tts-config"
import { TtsClientPlayer, type TtsSpeakOptions } from "@/lib/tts-client"
import type { TtsConfig, TtsEngine, TtsVoiceOption } from "@/lib/tts-config"

export type LocalTtsPlaybackState = "idle" | "loading" | "playing"

function splitLongSpeechPart(part: string, maxLength: number) {
  const chunks: string[] = []
  let current = ""
  for (const token of part.match(/\S+\s*/g) ?? [part]) {
    const trimmedToken = token.trim()
    if (trimmedToken.length > maxLength) {
      if (current.trim()) {
        chunks.push(current.trim())
        current = ""
      }
      for (let index = 0; index < trimmedToken.length; index += maxLength) {
        chunks.push(trimmedToken.slice(index, index + maxLength))
      }
      continue
    }
    if (current && `${current}${token}`.trim().length > maxLength) {
      chunks.push(current.trim())
      current = token
    } else {
      current += token
    }
  }
  if (current.trim()) {
    chunks.push(current.trim())
  }
  return chunks
}

export function splitSpeechText(text: string, maxLength = 90) {
  const normalized = text.trim()
  if (normalized.length <= maxLength) {
    return normalized ? [normalized] : []
  }

  const sentences = normalized.match(/[^.!?。！？;；]+[.!?。！？;；]?/g) ?? [normalized]
  const chunks: string[] = []
  let current = ""
  for (const sentence of sentences) {
    if (sentence.trim().length > maxLength) {
      if (current.trim()) {
        chunks.push(current.trim())
        current = ""
      }
      chunks.push(...splitLongSpeechPart(sentence, maxLength))
      continue
    }
    const next = `${current}${sentence}`.trim()
    if (current && next.length > maxLength) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current = next
    }
  }
  if (current.trim()) {
    chunks.push(current.trim())
  }
  return chunks
}

export function useLocalTts() {
  const { config } = useTtsConfig()
  const configRef = useRef<TtsConfig>(config)
  configRef.current = config

  const playerRef = useRef<TtsClientPlayer | null>(null)
  const playerKeyRef = useRef("")
  const previewPlayerRef = useRef<TtsClientPlayer | null>(null)
  const previewPlayerKeyRef = useRef("")
  const previewRequestIdRef = useRef(0)
  const requestIdRef = useRef(0)
  const [playbackState, setPlaybackState] = useState<LocalTtsPlaybackState>("idle")

  const getPlayer = useCallback((engine: TtsEngine, voice: string) => {
    const key = `${engine}:${voice}`
    if (!playerRef.current || playerKeyRef.current !== key) {
      playerRef.current?.stop()
      playerRef.current = new TtsClientPlayer(engine, voice)
      playerKeyRef.current = key
    }
    return playerRef.current
  }, [])

  const getPreviewPlayer = useCallback((engine: TtsEngine, voice: string) => {
    const key = `${engine}:${voice}`
    if (!previewPlayerRef.current || previewPlayerKeyRef.current !== key) {
      previewPlayerRef.current?.stop()
      previewPlayerRef.current = new TtsClientPlayer(engine, voice)
      previewPlayerKeyRef.current = key
    }
    return previewPlayerRef.current
  }, [])

  const stop = useCallback(() => {
    requestIdRef.current += 1
    playerRef.current?.stop()
    setPlaybackState("idle")
  }, [])

  const prepare = useCallback(async () => {
    const current = configRef.current
    await getPlayer(current.engine, current.voice).prepare()
  }, [getPlayer])

  // Shared playback runner. Resolving the engine/voice per call lets the standard `speak`
  // follow the saved config while `previewVoice` auditions a specific option without
  // touching persisted state.
  const run = useCallback(
    async (
      text: string,
      target: { engine: TtsEngine; voice: string },
      options: TtsSpeakOptions,
    ) => {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      playerRef.current?.stop()
      setPlaybackState("loading")

      let started = false
      const onStart = () => {
        if (requestId === requestIdRef.current) {
          setPlaybackState("playing")
          if (!started) {
            started = true
            options.onStart?.()
          }
        }
      }

      try {
        const chunks = splitSpeechText(text)
        const player = getPlayer(target.engine, target.voice)
        const speakOptions = {
          ...options,
          voice: target.voice || undefined,
          onStart,
        }
        const preloadChunk = (chunk: string) =>
          player.preload(chunk, speakOptions).then(
            () => null,
            (error: unknown) => error,
          )
        let nextAudio = chunks[0] ? preloadChunk(chunks[0]) : null

        for (let index = 0; index < chunks.length; index += 1) {
          if (requestId !== requestIdRef.current) {
            break
          }
          const preloadError = await nextAudio
          if (preloadError) {
            throw preloadError
          }
          if (requestId !== requestIdRef.current) {
            break
          }
          const followingChunk = chunks[index + 1]
          nextAudio = followingChunk ? preloadChunk(followingChunk) : null
          await player.speak(chunks[index], speakOptions)
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setPlaybackState("idle")
        }
      }
    },
    [getPlayer],
  )

  const speak = useCallback(
    (text: string, options: TtsSpeakOptions = {}) => {
      const current = configRef.current
      return run(text, { engine: current.engine, voice: current.voice }, options)
    },
    [run],
  )

  const speakWithVoice = useCallback(
    (text: string, voiceOption: TtsVoiceOption, options: TtsSpeakOptions = {}) =>
      run(
        text,
        {
          engine: voiceOption.engine,
          voice: voiceOption.voice ?? configRef.current.voice,
        },
        options,
      ),
    [run],
  )

  // Preview playback has its own players and state. Auditioning a voice must not stop a
  // conversation reply or make unrelated playback controls enter a loading state.
  const previewVoice = useCallback(
    async (option: TtsVoiceOption, text: string, options: TtsSpeakOptions = {}) => {
      const requestId = previewRequestIdRef.current + 1
      previewRequestIdRef.current = requestId
      previewPlayerRef.current?.stop()
      const voice = option.voice ?? configRef.current.voice
      await getPreviewPlayer(option.engine, voice).speak(text, {
        ...options,
        voice: voice || undefined,
      })

      if (requestId !== previewRequestIdRef.current) {
        return
      }
    },
    [getPreviewPlayer],
  )

  useEffect(
    () => () => {
      requestIdRef.current += 1
      playerRef.current?.stop()
      previewPlayerRef.current?.stop()
    },
    [],
  )

  return {
    config,
    playbackState,
    prepare,
    previewVoice,
    speak,
    speakWithVoice,
    stop,
  }
}
