"use client"

import { useCallback, useSyncExternalStore } from "react"
import {
  defaultLocalServiceConfig,
  type LocalServiceConfig,
  localServiceConfigStorageKey,
  parseLocalServiceConfig,
} from "@/lib/local-service-config"

const listeners = new Set<() => void>()
let cachedConfig: LocalServiceConfig = defaultLocalServiceConfig
let hydrated = false

function readFromStorage(): LocalServiceConfig {
  if (typeof window === "undefined") {
    return defaultLocalServiceConfig
  }
  return parseLocalServiceConfig(window.localStorage.getItem(localServiceConfigStorageKey))
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
    if (event.key === localServiceConfigStorageKey) {
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

function getSnapshot(): LocalServiceConfig {
  ensureHydrated()
  return cachedConfig
}

function getServerSnapshot(): LocalServiceConfig {
  return defaultLocalServiceConfig
}

/** 按服务 ID 独立保存引擎与音色，跨标签页与设置页/对话页共享同一份配置。 */
export function setLocalServiceConfig(
  update: (current: LocalServiceConfig) => LocalServiceConfig,
) {
  ensureHydrated()
  const next = update(cachedConfig)
  cachedConfig = next
  if (typeof window !== "undefined") {
    window.localStorage.setItem(localServiceConfigStorageKey, JSON.stringify(next))
  }
  emit()
  return next
}

export function useLocalServiceConfig() {
  const config = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const replace = useCallback((next: LocalServiceConfig) => {
    setLocalServiceConfig(() => next)
  }, [])

  const setAsrEngine = useCallback((serviceId: string, engine: string) => {
    setLocalServiceConfig((current) => ({
      ...current,
      asrEngines: { ...current.asrEngines, [serviceId]: engine },
    }))
  }, [])

  const setTtsVoice = useCallback((serviceId: string, voice: string) => {
    setLocalServiceConfig((current) => ({
      ...current,
      ttsVoices: { ...current.ttsVoices, [serviceId]: voice },
    }))
  }, [])

  return { config, replace, setAsrEngine, setTtsVoice }
}
