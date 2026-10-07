"use client"

import type { User } from "@supabase/supabase-js"
import {
  BrainCircuitIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth-provider"
import { useLearningMemory } from "@/components/learning-memory-provider"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ExpressionEditDialog } from "@/features/expressions/expression-edit-dialog"
import { ExpressionImportDialog } from "@/features/expressions/expression-import-dialog"
import { getLocalOnlySuffix } from "@/lib/auth-status"
import type { SceneCategory } from "@/lib/demo-data"
import type { ExpressionImportResult } from "@/lib/expression-import"
import {
  builtInExpressionItems,
  createExpressionIdentity,
  type ExpressionLibraryItem,
  type ExpressionSource,
  expressionKindLabels,
  expressionSceneCategories,
  expressionSceneCategoryLabels,
  mergeExpressionLibraryItems,
} from "@/lib/expression-library"
import {
  deleteCloudExpressionItem,
  getLastExpressionStorageScope,
  loadCloudExpressionItems,
  loadLocalExpressionItems,
  mergeImportedExpressionItems,
  saveCloudExpressionItems,
  saveLocalExpressionItems,
  updateCloudExpressionItem,
} from "@/lib/expression-library-client"
import { createExpressionMemoryItemId } from "@/lib/memory"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type SourceFilter = "all" | ExpressionSource

const initialVisibleCount = 60
const visibleCountStep = 60
const sourceOptions: Array<{ label: string; value: SourceFilter }> = [
  { label: "全部来源", value: "all" },
  { label: "内置词库", value: "builtin" },
  { label: "外部导入", value: "imported" },
]

function matchesQuery(item: ExpressionLibraryItem, query: string) {
  if (!query) {
    return true
  }
  return [
    item.phrase,
    item.meaning,
    item.why,
    item.origin,
    item.example,
    item.context,
    expressionKindLabels[item.kind],
    expressionSceneCategoryLabels[item.sceneCategory],
  ]
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .includes(query)
}

export function ExpressionLibraryWorkspace() {
  const { recordExpressionStudy, state } = useLearningMemory()
  const { status } = useAuth()
  // Cloud sync is best-effort here: the local write already succeeded, so the account state only
  // explains the skipped sync instead of gating the learner's work.
  const localOnlySuffix = getLocalOnlySuffix(status)
  const [importedItems, setImportedItems] = useState<ExpressionLibraryItem[]>([])
  const [storageScope, setStorageScope] = useState("anonymous")
  const [cloudAvailable, setCloudAvailable] = useState(false)
  const [loadingCloud, setLoadingCloud] = useState(true)
  const [query, setQuery] = useState("")
  const [categories, setCategories] = useState<SceneCategory[]>([])
  const [source, setSource] = useState<SourceFilter>("all")
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount)
  const [editingItem, setEditingItem] = useState<ExpressionLibraryItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<ExpressionLibraryItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase())
  // 已进入长期记忆的表达在这里显示状态，避免与下方学习记忆列表建立第二条真相同步链路。
  const studiedIds = useMemo(() => new Set(state.items.map((item) => item.id)), [state.items])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const scopePromise = getSupabaseBrowserClient()
      ?.auth.getUser()
      .then(({ data }: { data: { user: User | null } }) => data.user?.id ?? null)
    void Promise.allSettled([
      loadCloudExpressionItems(controller.signal),
      scopePromise ?? Promise.resolve(null),
    ])
      .then(([cloudResult, scopeResult]) => {
        if (!active) {
          return
        }
        const cloud = cloudResult.status === "fulfilled" ? cloudResult.value : null
        const authenticatedScope = scopeResult.status === "fulfilled" ? scopeResult.value : null
        const scope =
          cloud?.userId ??
          authenticatedScope ??
          getLastExpressionStorageScope(window.localStorage)
        const localItems = loadLocalExpressionItems(window.localStorage, scope)
        const merged = mergeImportedExpressionItems(localItems, cloud?.items ?? [])
        setStorageScope(scope)
        setImportedItems(merged)
        setCloudAvailable(cloud?.cloudAvailable === true)
        try {
          saveLocalExpressionItems(window.localStorage, scope, merged)
        } catch {
          toast.error("云端表达已载入，但本机缓存空间不足。")
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
  }, [])

  const allItems = useMemo(() => {
    const items = mergeExpressionLibraryItems(builtInExpressionItems, importedItems)
    return items.sort(
      (left, right) => Number(right.source === "imported") - Number(left.source === "imported"),
    )
  }, [importedItems])
  const filteredItems = useMemo(
    () =>
      allItems.filter(
        (item) =>
          (categories.length === 0 || categories.includes(item.sceneCategory)) &&
          (source === "all" || item.source === source) &&
          matchesQuery(item, deferredQuery),
      ),
    [allItems, categories, deferredQuery, source],
  )
  const visibleItems = filteredItems.slice(0, visibleCount)
  const hasMore = visibleCount < filteredItems.length
  const selectedCategoryLabel =
    categories.length === 0 ? "全部场景" : `场景 ${categories.length}`

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasMore || typeof IntersectionObserver === "undefined") {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisibleCount((current) =>
            Math.min(current + visibleCountStep, filteredItems.length),
          )
        }
      },
      { rootMargin: "480px 0px" },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [filteredItems.length, hasMore])

  function updateQuery(value: string) {
    setQuery(value)
    setVisibleCount(initialVisibleCount)
  }

  function toggleCategory(category: SceneCategory, checked: boolean) {
    setCategories((current) =>
      checked
        ? Array.from(new Set([...current, category]))
        : current.filter((value) => value !== category),
    )
    setVisibleCount(initialVisibleCount)
  }

  function updateSource(value: SourceFilter | null) {
    if (!value) {
      return
    }
    setSource(value)
    setVisibleCount(initialVisibleCount)
  }

  function handleStudy(item: ExpressionLibraryItem) {
    recordExpressionStudy({
      itemId: createExpressionMemoryItemId(item.clientId),
      sceneCategory: item.sceneCategory,
      sceneTitle: expressionSceneCategoryLabels[item.sceneCategory],
      label: item.phrase,
      phrase: item.phrase,
      explanation: item.why,
      example: item.example,
      libraryKind: item.kind,
    })
    toast.success(`已把“${item.phrase}”加入长期记忆`)
  }

  async function handleImport(result: ExpressionImportResult) {
    const importedAt = new Date().toISOString()
    const importedBatch = result.items.map((item) => ({
      ...item,
      createdAt: item.createdAt ?? importedAt,
      updatedAt: importedAt,
    }))
    const nextImportedItems = mergeImportedExpressionItems(importedBatch, importedItems)
    try {
      saveLocalExpressionItems(window.localStorage, storageScope, nextImportedItems)
    } catch {
      toast.error("本机存储空间不足，表达尚未导入。")
      return false
    }
    setImportedItems(nextImportedItems)
    setCategories([])
    setQuery("")
    setSource("imported")
    setVisibleCount(initialVisibleCount)

    try {
      const stored = await saveCloudExpressionItems(importedBatch)
      setCloudAvailable(stored)
      toast.success(
        stored
          ? `已导入并同步 ${importedBatch.length} 条表达`
          : `已保存到本机 ${importedBatch.length} 条表达${localOnlySuffix}`,
      )
    } catch (error) {
      setCloudAvailable(false)
      toast.error(error instanceof Error ? error.message : "表达已保存到本机，云端同步失败。")
    }
    return true
  }

  async function handleEdit(item: ExpressionLibraryItem) {
    const identity = createExpressionIdentity(item)
    const duplicate = importedItems.some(
      (candidate) =>
        candidate.clientId !== item.clientId &&
        createExpressionIdentity(candidate) === identity,
    )
    if (duplicate) {
      toast.error("同一场景中已存在同名表达。")
      return false
    }
    const nextImportedItems = mergeImportedExpressionItems(
      [item],
      importedItems.filter((candidate) => candidate.clientId !== item.clientId),
    )
    try {
      saveLocalExpressionItems(window.localStorage, storageScope, nextImportedItems)
    } catch {
      toast.error("本机存储空间不足，修改尚未保存。")
      return false
    }
    setImportedItems(nextImportedItems)

    try {
      const stored = await updateCloudExpressionItem(item)
      setCloudAvailable(stored)
      toast.success(stored ? "表达已修改并同步" : `表达修改已保存到本机${localOnlySuffix}`)
    } catch (error) {
      setCloudAvailable(false)
      toast.error(error instanceof Error ? error.message : "修改已保存到本机，云端同步失败。")
    }
    return true
  }

  async function handleDelete() {
    if (!deletingItem || deleting) {
      return
    }
    const clientId = deletingItem.clientId
    const nextImportedItems = importedItems.filter((item) => item.clientId !== clientId)
    try {
      saveLocalExpressionItems(window.localStorage, storageScope, nextImportedItems)
    } catch {
      toast.error("本机存储空间不足，表达尚未删除。")
      return
    }
    setImportedItems(nextImportedItems)
    setDeleting(true)

    try {
      const deleted = await deleteCloudExpressionItem(clientId)
      setCloudAvailable(deleted)
      toast.success(deleted ? "表达已删除" : `表达已从本机删除${localOnlySuffix}`)
    } catch (error) {
      setCloudAvailable(false)
      toast.error(error instanceof Error ? error.message : "表达已从本机删除，云端同步失败。")
    } finally {
      setDeleting(false)
      setDeletingItem(null)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="grid grid-cols-3 border-y" aria-label="表达词库概览">
        <LibraryStat label="全部表达" value={String(allItems.length)} />
        <LibraryStat label="当前结果" value={String(filteredItems.length)} />
        <LibraryStat label="外部导入" value={String(importedItems.length)} />
      </section>

      <section
        className="sticky top-16 z-30 -mx-4 flex flex-col gap-2 border-b bg-background px-4 py-2 shadow-sm md:-mx-6 md:flex-row md:px-6 lg:-mx-8 lg:px-8"
        aria-label="筛选表达"
      >
        <InputGroup className="md:max-w-md">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="搜索表达、含义、来源或例句"
            aria-label="搜索地道表达"
          />
          {query ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="清除搜索"
                onClick={() => updateQuery("")}
              >
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>

        <div className="flex min-w-0 flex-wrap gap-2 md:ml-auto md:flex-nowrap">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="outline" className="min-w-32 justify-between" />
              }
            >
              {selectedCategoryLabel}
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>场景可多选</DropdownMenuLabel>
                {expressionSceneCategories.map((category) => (
                  <DropdownMenuCheckboxItem
                    key={category.value}
                    checked={categories.includes(category.value)}
                    onCheckedChange={(checked) =>
                      toggleCategory(category.value, checked === true)
                    }
                  >
                    {category.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              {categories.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() => {
                        setCategories([])
                        setVisibleCount(initialVisibleCount)
                      }}
                    >
                      清除场景筛选
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <Select items={sourceOptions} value={source} onValueChange={updateSource}>
            <SelectTrigger className="min-w-28" aria-label="筛选表达来源">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false}>
              <SelectGroup>
                {sourceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <ExpressionImportDialog
            cloudAvailable={cloudAvailable}
            loadingCloud={loadingCloud}
            onImport={handleImport}
          />
        </div>
      </section>

      <ExpressionRows
        items={visibleItems}
        studiedIds={studiedIds}
        onDelete={setDeletingItem}
        onEdit={setEditingItem}
        onStudy={handleStudy}
      />

      <div ref={loadMoreRef} className="grid min-h-8 place-items-center" aria-hidden="true">
        {hasMore ? <LoaderCircleIcon className="size-4 animate-spin text-primary" /> : null}
      </div>
      <p className="text-center text-xs text-muted-foreground" aria-live="polite">
        已显示 {visibleItems.length} / {filteredItems.length} 条
      </p>

      {editingItem ? (
        <ExpressionEditDialog
          key={editingItem.clientId}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={handleEdit}
        />
      ) : null}

      <AlertDialog
        open={deletingItem !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleting) {
            setDeletingItem(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条表达？</AlertDialogTitle>
            <AlertDialogDescription>
              “{deletingItem?.phrase}”会从本机移除；已登录时也会同步删除云端记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? (
                <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              {deleting ? "正在删除" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ExpressionRows({
  items,
  studiedIds,
  onDelete,
  onEdit,
  onStudy,
}: {
  items: readonly ExpressionLibraryItem[]
  studiedIds: ReadonlySet<string>
  onDelete: (item: ExpressionLibraryItem) => void
  onEdit: (item: ExpressionLibraryItem) => void
  onStudy: (item: ExpressionLibraryItem) => void
}) {
  if (items.length === 0) {
    return (
      <section className="border-y px-5 py-14 text-center" aria-live="polite">
        <p className="font-serif text-lg font-semibold">没有找到匹配表达</p>
        <p className="mt-2 text-sm text-muted-foreground">调整关键词、场景或来源筛选。</p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card" aria-label="地道表达列表">
      {items.map((item, index) => {
        const studied = studiedIds.has(createExpressionMemoryItemId(item.clientId))
        return (
          <article
            key={item.id}
            className="group grid min-w-0 gap-4 border-b px-4 py-5 last:border-b-0 [content-visibility:auto] [contain-intrinsic-size:auto_220px] md:px-5 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.8fr)]"
          >
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {String(index + 1).padStart(3, "0")}
                  </span>
                  <Badge variant="secondary">{expressionKindLabels[item.kind]}</Badge>
                  <Badge variant="outline">
                    {expressionSceneCategoryLabels[item.sceneCategory]}
                  </Badge>
                  {item.source === "imported" ? <Badge>外部导入</Badge> : null}
                  {studied ? <Badge>已在记忆中</Badge> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`把 ${item.phrase} 加入长期记忆`}
                          onClick={() => onStudy(item)}
                        />
                      }
                    >
                      <BrainCircuitIcon />
                    </TooltipTrigger>
                    <TooltipContent>加入长期记忆</TooltipContent>
                  </Tooltip>
                  {item.source === "imported" ? (
                    <>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`编辑 ${item.phrase}`}
                              onClick={() => onEdit(item)}
                            />
                          }
                        >
                          <PencilIcon />
                        </TooltipTrigger>
                        <TooltipContent>编辑</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`删除 ${item.phrase}`}
                              onClick={() => onDelete(item)}
                            />
                          }
                        >
                          <Trash2Icon />
                        </TooltipTrigger>
                        <TooltipContent>删除</TooltipContent>
                      </Tooltip>
                    </>
                  ) : null}
                </div>
              </div>
              <h2 className="mt-2 break-words font-serif text-lg font-semibold leading-7">
                {item.phrase}
              </h2>
              <p className="mt-1 text-sm font-medium leading-6">{item.meaning}</p>
            </div>

            <div className="grid min-w-0 gap-3 text-sm leading-6 md:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-foreground">为什么这样表达</p>
                <p className="mt-1 text-muted-foreground">{item.why}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">来源</p>
                <p className="mt-1 text-muted-foreground">{item.origin}</p>
              </div>
              <blockquote className="border-l-2 border-primary/35 pl-3 font-serif text-sm md:col-span-2">
                {item.example}
              </blockquote>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function LibraryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r px-3 py-4 last:border-r-0 sm:px-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold">{value}</p>
    </div>
  )
}
