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

export function useAsrConfig() {
  const engine = useSyncExternalStore(subscribe, getSnapshot, () => defaultAsrEngine)
  const selectEngine = useCallback((nextEngine: AsrEngine) => {
    cachedEngine = nextEngine
    initialized = true
    window.localStorage.setItem(
      asrConfigStorageKey,
      JSON.stringify({ version: 1, engine: nextEngine }),
    )
    for (const listener of listeners) {
      listener()
    }
  }, [])
  return { engine, selectEngine }
}
