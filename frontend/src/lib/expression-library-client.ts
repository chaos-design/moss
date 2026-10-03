import type { ExpressionLibraryItem } from "@/lib/expression-library-schema"
import { createExpressionIdentity } from "@/lib/expression-library-schema"
import { parseImportedExpressionItem } from "@/lib/expression-library-validation"

type ExpressionLibraryResponse = {
  data?: {
    cloudAvailable?: boolean
    items?: unknown[]
    nextCursor?: string | null
    stored?: boolean
    userId?: string | null
  }
  error?: {
    message?: string
  }
}

const storagePrefix = "moss:expression-library:v1"
const lastScopeKey = "moss:expression-library:last-scope:v1"
const importBatchSize = 200

function getStorageKey(scope: string) {
  return `${storagePrefix}:${scope}`
}

async function readJson(response: Response): Promise<ExpressionLibraryResponse> {
  try {
    return (await response.json()) as ExpressionLibraryResponse
  } catch {
    return {}
  }
}

export function loadLocalExpressionItems(storage: Storage, scope: string) {
  const value = storage.getItem(getStorageKey(scope))
  if (!value) {
    return []
  }
  try {
    const parsed = JSON.parse(value) as { items?: unknown }
    if (!Array.isArray(parsed.items)) {
      return []
    }
    return parsed.items
      .map(parseImportedExpressionItem)
      .filter((item): item is ExpressionLibraryItem => item !== null)
  } catch {
    return []
  }
}

export function saveLocalExpressionItems(
  storage: Storage,
  scope: string,
  items: readonly ExpressionLibraryItem[],
) {
  storage.setItem(lastScopeKey, scope)
  storage.setItem(
    getStorageKey(scope),
    JSON.stringify({
      version: 1,
      items: items.filter((item) => item.source === "imported"),
    }),
  )
}

export function getLastExpressionStorageScope(storage: Storage) {
  return storage.getItem(lastScopeKey)?.trim() || "anonymous"
}

export async function loadCloudExpressionItems(signal?: AbortSignal) {
  const items: ExpressionLibraryItem[] = []
  const visitedCursors = new Set<string>()
  let cursor: string | null = null
  let userId: string | null = null

  while (true) {
    const path = cursor
      ? `/api/expressions?cursor=${encodeURIComponent(cursor)}`
      : "/api/expressions"
    const response = await fetch(path, { method: "GET", signal })
    if (response.status === 401 || response.status === 503) {
      return null
    }
    const payload = await readJson(response)
    if (!response.ok) {
      throw new Error(payload.error?.message || "云端表达暂时无法读取。")
    }
    const pageItems = payload.data?.items
    const pageUserId = payload.data?.userId ?? null
    const nextCursor = payload.data?.nextCursor ?? null
    if (
      !Array.isArray(pageItems) ||
      (pageUserId !== null && typeof pageUserId !== "string") ||
      (nextCursor !== null && typeof nextCursor !== "string") ||
      (userId !== null && pageUserId !== userId) ||
      (nextCursor !== null && visitedCursors.has(nextCursor))
    ) {
      throw new Error("云端表达返回了无效分页数据。")
    }
    const parsedItems = pageItems.map(parseImportedExpressionItem)
    if (parsedItems.some((item) => item === null)) {
      throw new Error("云端表达返回了无效记录。")
    }
    userId = pageUserId
    items.push(...parsedItems.filter((item): item is ExpressionLibraryItem => item !== null))
    if (nextCursor === null) {
      return {
        cloudAvailable: payload.data?.cloudAvailable !== false,
        items,
        userId,
      }
    }
    visitedCursors.add(nextCursor)
    cursor = nextCursor
  }
}

export async function saveCloudExpressionItems(items: readonly ExpressionLibraryItem[]) {
  for (let index = 0; index < items.length; index += importBatchSize) {
    const batch = items.slice(index, index + importBatchSize)
    const response = await fetch("/api/expressions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: batch }),
    })
    if (response.status === 401 || response.status === 503) {
      return false
    }
    const payload = await readJson(response)
    if (!response.ok) {
      throw new Error(payload.error?.message || "表达导入未能同步到云端。")
    }
    if (payload.data?.stored === false) {
      return false
    }
  }
  return true
}

export async function updateCloudExpressionItem(item: ExpressionLibraryItem) {
  const response = await fetch("/api/expressions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item }),
  })
  if (response.status === 401 || response.status === 503) {
    return false
  }
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(payload.error?.message || "表达修改未能同步到云端。")
  }
  return payload.data?.stored !== false
}

export async function deleteCloudExpressionItem(clientId: string) {
  const response = await fetch(`/api/expressions?clientId=${encodeURIComponent(clientId)}`, {
    method: "DELETE",
  })
  if (response.status === 401 || response.status === 503) {
    return false
  }
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(payload.error?.message || "表达未能从云端删除。")
  }
  return true
}

export function mergeImportedExpressionItems(
  localItems: readonly ExpressionLibraryItem[],
  cloudItems: readonly ExpressionLibraryItem[],
) {
  const merged = new Map(
    cloudItems.map((item) => [createExpressionIdentity(item), item] as const),
  )
  for (const localItem of localItems) {
    const identity = createExpressionIdentity(localItem)
    const cloudItem = merged.get(identity)
    const localTime = Date.parse(localItem.updatedAt ?? "")
    const cloudTime = Date.parse(cloudItem?.updatedAt ?? "")
    if (
      !cloudItem ||
      !Number.isFinite(localTime) ||
      !Number.isFinite(cloudTime) ||
      localTime >= cloudTime
    ) {
      merged.set(identity, localItem)
    }
  }
  return [...merged.values()].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt ?? left.createdAt ?? "")
    const rightTime = Date.parse(right.updatedAt ?? right.createdAt ?? "")
    return (
      (Number.isFinite(rightTime) ? rightTime : 0) -
        (Number.isFinite(leftTime) ? leftTime : 0) ||
      createExpressionIdentity(left).localeCompare(createExpressionIdentity(right))
    )
  })
}
