"use client"

import { useCallback, useSyncExternalStore } from "react"
import {
  applyVoiceSelection,
  defaultTtsConfig,
  legacyTtsConfigStorageKey,
  parseTtsConfig,
  type TtsConfig,
  ttsConfigStorageKey,
} from "@/lib/tts-config"

const listeners = new Set<() => void>()
let cachedConfig: TtsConfig = defaultTtsConfig
let hydrated = false

function readFromStorage(): TtsConfig {
  if (typeof window === "undefined") {
    return defaultTtsConfig
  }
  return parseTtsConfig(
    window.localStorage.getItem(ttsConfigStorageKey) ??
      window.localStorage.getItem(legacyTtsConfigStorageKey),
  )
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
    if (event.key === ttsConfigStorageKey || event.key === legacyTtsConfigStorageKey) {
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

function getSnapshot(): TtsConfig {
  ensureHydrated()
  return cachedConfig
}

function getServerSnapshot(): TtsConfig {
  return defaultTtsConfig
}

// Module-level setter so the shared config stays in sync across every surface.
export function setTtsConfig(update: (current: TtsConfig) => TtsConfig): TtsConfig {
  ensureHydrated()
  const next = update(cachedConfig)
  cachedConfig = next
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ttsConfigStorageKey, JSON.stringify(next))
  }
  emit()
  return next
}

export function getTtsConfig(): TtsConfig {
  ensureHydrated()
  return cachedConfig
}

export function useTtsConfig() {
  const config = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setConfig = useCallback((update: (current: TtsConfig) => TtsConfig) => {
    setTtsConfig(update)
  }, [])

  const selectVoice = useCallback((optionValue: string) => {
    setTtsConfig((current) => applyVoiceSelection(current, optionValue))
  }, [])

  return { config, setConfig, selectVoice }
}
