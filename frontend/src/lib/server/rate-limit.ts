import type { SupabaseClient } from "@supabase/supabase-js"

type RateLimitEntry = {
  count: number
  expiresAt: number
}

type RateLimitStore = {
  entries: Map<string, RateLimitEntry>
}

type RateLimitGlobal = typeof globalThis & {
  __mossRateLimitStore?: RateLimitStore
}

export type RateLimitOptions = {
  key: string
  limit: number
  windowMs: number
  maxEntries?: number
  now?: number
}

export type SharedRateLimitOptions = {
  client: SupabaseClient
  bucket:
    | "account-delete"
    | "account-export"
    | "conversation-generate"
    | "conversation-sync"
    | "expression-library"
    | "memory-document"
    | "translation"
}

export type SharedRateLimitDecision = {
  limited: boolean
  remaining: number
  resetAt: string
}

const defaultMaxEntries = 10_000

function getStore() {
  const globalStore = globalThis as RateLimitGlobal
  globalStore.__mossRateLimitStore ??= { entries: new Map() }
  return globalStore.__mossRateLimitStore
}

function pruneStore(store: RateLimitStore, now: number, maxEntries: number) {
  for (const [key, entry] of store.entries) {
    if (now >= entry.expiresAt) {
      store.entries.delete(key)
    }
  }

  while (store.entries.size >= maxEntries) {
    const oldestKey = store.entries.keys().next().value
    if (typeof oldestKey !== "string") {
      break
    }
    store.entries.delete(oldestKey)
  }
}

export function isRateLimited({
  key,
  limit,
  windowMs,
  maxEntries = defaultMaxEntries,
  now = Date.now(),
}: RateLimitOptions) {
  if (limit < 1 || windowMs < 1 || maxEntries < 1) {
    throw new RangeError("Rate limit values must be positive")
  }

  const store = getStore()
  const current = store.entries.get(key)
  if (!current || now >= current.expiresAt) {
    if (!current && store.entries.size >= maxEntries) {
      pruneStore(store, now, maxEntries)
    }
    store.entries.delete(key)
    store.entries.set(key, {
      count: 1,
      expiresAt: now + windowMs,
    })
    return false
  }

  if (current.count >= limit) {
    return true
  }

  current.count += 1
  return false
}

export function resetRateLimitStore() {
  getStore().entries.clear()
}

export async function consumeSharedRateLimit({
  client,
  bucket,
}: SharedRateLimitOptions): Promise<SharedRateLimitDecision | null> {
  let result: Awaited<ReturnType<SupabaseClient["rpc"]>>
  try {
    result = await client.rpc("check_rate_limit", {
      p_bucket: bucket,
    })
  } catch {
    return null
  }
  const { data, error } = result
  if (error) {
    return null
  }

  const row = Array.isArray(data) ? data[0] : data
  if (
    !row ||
    typeof row !== "object" ||
    typeof row.limited !== "boolean" ||
    typeof row.remaining !== "number" ||
    typeof row.reset_at !== "string"
  ) {
    return null
  }

  return {
    limited: row.limited,
    remaining: Math.max(0, Math.round(row.remaining)),
    resetAt: row.reset_at,
  }
}
