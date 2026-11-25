"use client"

import type { User } from "@supabase/supabase-js"
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useLearningMemory } from "@/components/learning-memory-provider"
import {
  builtInExpressionItems,
  type ExpressionLibraryItem,
  expressionKindLabels,
  expressionSceneCategoryLabels,
  mergeExpressionLibraryItems,
} from "@/lib/expression-library"
import {
  getLastExpressionStorageScope,
  loadCloudExpressionItems,
  loadLocalExpressionItems,
  mergeImportedExpressionItems,
  saveLocalExpressionItems,
} from "@/lib/expression-library-client"
import type { ExpressionFilters, ExpressionProgressStatus } from "@/lib/memory"
import { getActiveFavorites, getActiveGroups } from "@/lib/memory"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

function buildExpressionSearchText(item: ExpressionLibraryItem) {
  return [
    item.phrase,
    item.meaning,
    item.why,
    item.origin,
    item.example,
    item.exampleTranslation ?? "",
    item.context,
    expressionKindLabels[item.kind],
    expressionSceneCategoryLabels[item.sceneCategory],
  ]
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase()
}

function matchesQuery(query: string, searchText: string) {
  return !query || searchText.includes(query)
}

/**
 * 词库与学习页共用的只读数据源：本机/云端导入条目、筛选后的集合，以及按身份记账的
 * 收藏/分组/进度。词库页把即时筛选 state 传进来，独立学习页传已经持久化的 filters，
 * 两边因此共用同一套加载与派生逻辑，而不是各自维护第二条真相。
 */
/** 认证查询也要有上限，否则它会拖住整个 Promise.allSettled 让列表一直空白。 */
function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])
}

export function useExpressionLibrarySource(filters: ExpressionFilters) {
  const { state } = useLearningMemory()
  const expressionStudy = state.expressionStudy
  const [importedItems, setImportedItems] = useState<ExpressionLibraryItem[]>([])
  const [storageScope, setStorageScope] = useState("anonymous")
  const [cloudAvailable, setCloudAvailable] = useState(false)
  const [loadingCloud, setLoadingCloud] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const deferredQuery = useDeferredValue(filters.query.trim().toLocaleLowerCase())

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const scopePromise = getSupabaseBrowserClient()
      ?.auth.getUser()
      .then(({ data }: { data: { user: User | null } }) => data.user?.id ?? null)
    const scopeWithDeadline: Promise<string | null> = scopePromise
      ? withDeadline<string | null>(scopePromise, 5000)
      : Promise.resolve(null)
    void Promise.allSettled([loadCloudExpressionItems(controller.signal), scopeWithDeadline])
      .then(([cloudResult, scopeResult]) => {
        if (!active) {
          return
        }
        const cloud = cloudResult.status === "fulfilled" ? cloudResult.value : null
        const authenticatedScope = scopeResult.status === "fulfilled" ? scopeResult.value : null
        // 云端失败时不把空结果回写本机缓存，保留上次成功快照；scope 回退到最后一次成功的范围。
        const scope =
          cloud?.userId ??
          authenticatedScope ??
          getLastExpressionStorageScope(window.localStorage)
        const localItems = loadLocalExpressionItems(window.localStorage, scope)
        const merged = mergeImportedExpressionItems(localItems, cloud?.items ?? [])
        setStorageScope(scope)
        setImportedItems(merged)
        setCloudAvailable(cloud?.cloudAvailable === true)
        setLoadFailed(cloudResult.status === "rejected")
        if (cloudResult.status === "fulfilled" && cloud) {
          try {
            saveLocalExpressionItems(window.localStorage, scope, merged)
          } catch {
            toast.error("云端表达已载入，但本机缓存空间不足。")
          }
        }
      })
      .finally(() => {
        if (active) {
          setLoadingCloud(false)
        }
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [reloadToken])

  const reload = useCallback(() => {
    setLoadingCloud(true)
    setLoadFailed(false)
    setReloadToken((current) => current + 1)
  }, [])

  const allItems = useMemo(() => {
    const items = mergeExpressionLibraryItems(builtInExpressionItems, importedItems)
    return items.sort(
      (left, right) => Number(right.source === "imported") - Number(left.source === "imported"),
    )
  }, [importedItems])

  const searchIndex = useMemo(
    () => new Map(allItems.map((item) => [item.id, buildExpressionSearchText(item)] as const)),
    [allItems],
  )

  const filteredItems = useMemo(
    () =>
      allItems.filter(
        (item) =>
          (filters.categories.length === 0 ||
            filters.categories.includes(item.sceneCategory)) &&
          (filters.source === "all" || item.source === filters.source) &&
          matchesQuery(deferredQuery, searchIndex.get(item.id) ?? ""),
      ),
    [allItems, filters.categories, filters.source, deferredQuery, searchIndex],
  )

  const favoriteIdentities = useMemo(
    () => new Set(getActiveFavorites(expressionStudy)),
    [expressionStudy],
  )
  const studyGroups = useMemo(() => getActiveGroups(expressionStudy), [expressionStudy])
  const progressByIdentity = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(expressionStudy.progress).map(([identity, entry]) => [
          identity,
          entry.status,
        ]),
      ) as Record<string, ExpressionProgressStatus>,
    [expressionStudy],
  )
  const studiedIds = useMemo(() => new Set(state.items.map((item) => item.id)), [state.items])

  return {
    expressionStudy,
    importedItems,
    setImportedItems,
    storageScope,
    cloudAvailable,
    setCloudAvailable,
    loadingCloud,
    loadFailed,
    reload,
    allItems,
    filteredItems,
    favoriteIdentities,
    studyGroups,
    progressByIdentity,
    studiedIds,
  }
}
