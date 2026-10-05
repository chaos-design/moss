"use client"

import { useCallback, useSyncExternalStore } from "react"
import {
  defaultSpeechConfig,
  parseSpeechConfig,
  resolveSpeechConfig,
  type SpeechConfig,
  type SpeechEndpoint,
  type SpeechService,
  speechConfigStorageKey,
} from "@/lib/speech-config"

const listeners = new Set<() => void>()
let cachedConfig: SpeechConfig = defaultSpeechConfig
let hydrated = false

function readFromStorage(): SpeechConfig {
  if (typeof window === "undefined") {
    return defaultSpeechConfig
  }
  return parseSpeechConfig(window.localStorage.getItem(speechConfigStorageKey))
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") {
    return
  }
  cachedConfig = readFromStorage()
  hydrated = true
}

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void) {
  ensureHydrated()
  listeners.add(listener)

  const onStorage = (event: StorageEvent) => {
    if (event.key === speechConfigStorageKey) {
      cachedConfig = readFromStorage()
      emit()
    }
  }
  window.addEventListener("storage", onStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function getSnapshot(): SpeechConfig {
  ensureHydrated()
  return cachedConfig
}

function getServerSnapshot(): SpeechConfig {
  return defaultSpeechConfig
}

// Module-level setter so settings, conversation, and shadowing share one speech configuration.
export function setSpeechConfig(update: (current: SpeechConfig) => SpeechConfig): SpeechConfig {
  ensureHydrated()
  const next = update(cachedConfig)
  cachedConfig = next
  if (typeof window !== "undefined") {
    window.localStorage.setItem(speechConfigStorageKey, JSON.stringify(next))
  }
  emit()
  return next
}

export function getResolvedSpeechEndpoint(service: SpeechService): SpeechEndpoint {
  ensureHydrated()
  return resolveSpeechConfig(cachedConfig)[service]
}

export function useSpeechConfig() {
  const config = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const resolved = resolveSpeechConfig(config)

  const setEndpoint = useCallback(
    (service: SpeechService, update: (current: SpeechEndpoint) => SpeechEndpoint) => {
      setSpeechConfig((current) => ({
        ...current,
        [service]: update(current[service]),
      }))
    },
    [],
  )

  return { config, resolved, setEndpoint }
}
