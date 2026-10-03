"use client"

import { useCallback, useSyncExternalStore } from "react"
import {
  type ConversationPrefs,
  conversationPrefsStorageKey,
  defaultConversationPrefs,
  parseConversationPrefs,
} from "@/lib/conversation-prefs"

const listeners = new Set<() => void>()
let cachedPrefs: ConversationPrefs = defaultConversationPrefs
let hydrated = false

function readFromStorage(): ConversationPrefs {
  if (typeof window === "undefined") {
    return defaultConversationPrefs
  }
  return parseConversationPrefs(window.localStorage.getItem(conversationPrefsStorageKey))
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") {
    return
  }
  cachedPrefs = readFromStorage()
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
    if (event.key === conversationPrefsStorageKey) {
      cachedPrefs = readFromStorage()
      emit()
    }
  }
  window.addEventListener("storage", onStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function getSnapshot(): ConversationPrefs {
  ensureHydrated()
  return cachedPrefs
}

function getServerSnapshot(): ConversationPrefs {
  return defaultConversationPrefs
}

// Module-level setter so the shared prefs stay in sync across every surface.
export function setConversationPrefs(
  update: (current: ConversationPrefs) => ConversationPrefs,
): ConversationPrefs {
  ensureHydrated()
  const next = update(cachedPrefs)
  cachedPrefs = next
  if (typeof window !== "undefined") {
    window.localStorage.setItem(conversationPrefsStorageKey, JSON.stringify(next))
  }
  emit()
  return next
}

export function getConversationPrefs(): ConversationPrefs {
  ensureHydrated()
  return cachedPrefs
}

export function useConversationPrefs() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setPrefs = useCallback((update: (current: ConversationPrefs) => ConversationPrefs) => {
    setConversationPrefs(update)
  }, [])

  return { prefs, setPrefs }
}
