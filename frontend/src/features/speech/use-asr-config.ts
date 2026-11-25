"use client"

import { useCallback, useSyncExternalStore } from "react"
import {
  type AsrEngine,
  asrConfigStorageKey,
  defaultAsrEngine,
  parseAsrEngine,
} from "@/lib/asr-config"

let cachedEngine = defaultAsrEngine
let initialized = false
const listeners = new Set<() => void>()

function readEngine() {
  if (typeof window === "undefined") {
    return defaultAsrEngine
  }
  return parseAsrEngine(window.localStorage.getItem(asrConfigStorageKey))
}

function getSnapshot() {
  if (!initialized && typeof window !== "undefined") {
    cachedEngine = readEngine()
    initialized = true
  }
  return cachedEngine
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === asrConfigStorageKey) {
      cachedEngine = readEngine()
      listener()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

// Module-level setter keeps the effective engine in sync for tests and for surfaces that
// restore a per-service selection without going through the hook.
export function setAsrConfig(update: (current: AsrEngine) => AsrEngine) {
  cachedEngine = update(cachedEngine)
  initialized = true
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      asrConfigStorageKey,
      JSON.stringify({ version: 1, engine: cachedEngine }),
    )
  }
  for (const listener of listeners) {
    listener()
  }
  return cachedEngine
}

export function useAsrConfig() {
  const engine = useSyncExternalStore(subscribe, getSnapshot, () => defaultAsrEngine)
  const selectEngine = useCallback((nextEngine: AsrEngine) => {
    setAsrConfig(() => nextEngine)
  }, [])
  return { engine, selectEngine }
}
