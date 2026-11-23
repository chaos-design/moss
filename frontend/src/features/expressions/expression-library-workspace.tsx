"use client"

import {
  BrainCircuitIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  FolderInputIcon,
  LoaderCircleIcon,
  PencilIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth-provider"
import { ExpressionText } from "@/components/expression-text"
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
import { ExpressionStudyPanel } from "@/features/expressions/expression-study-panel"
import { useExpressionLibrarySource } from "@/features/expressions/use-expression-library-source"
import { getLocalOnlySuffix } from "@/lib/auth-status"
import type { SceneCategory } from "@/lib/demo-data"
import type { ExpressionImportResult } from "@/lib/expression-import"
import {
  createExpressionIdentity,
  type ExpressionLibraryItem,
  type ExpressionSource,
  expressionKindLabels,
  expressionSceneCategories,
  expressionSceneCategoryLabels,
} from "@/lib/expression-library"
import {
  deleteCloudExpressionItem,
  mergeImportedExpressionItems,
  saveCloudExpressionItems,
  saveLocalExpressionItems,
  updateCloudExpressionItem,
} from "@/lib/expression-library-client"
import {
  type ExpressionRecommendation,
  getRecommendedGroupId,
} from "@/lib/expression-recommendations"
import type { ExpressionStudyMode, ExpressionStudyScope } from "@/lib/expression-study"
import {
  createExpressionMemoryItemId,
  type ExpressionFilters,
  type ExpressionGroup,
  type ExpressionProgressStatus,
  type ExpressionStudyState,
} from "@/lib/memory"
import { cn } from "@/lib/utils"

type SourceFilter = "all" | ExpressionSource

const initialVisibleCount = 60
const visibleCountStep = 60
const sourceOptions: Array<{ label: string; value: SourceFilter }> = [
  { label: "全部来源", value: "all" },
  { label: "内置词库", value: "builtin" },
  { label: "外部导入", value: "imported" },
]

export function ExpressionLibraryWorkspace() {
  const {
    recordExpressionStudy,
    state,
    hydrated,
    toggleFavorite,
    createGroup,
    addGroupItems,
    renameGroup,
    deleteGroup,
    toggleGroupItem,
    saveExpressionFilters,
  } = useLearningMemory()
  const { status } = useAuth()
  const expressionStudy: ExpressionStudyState = state.expressionStudy
  // 数据库未写入时会明确报错并保留弹窗，这里只描述编辑/删除的降级后缀。
  const localOnlySuffix = getLocalOnlySuffix(status)
  const router = useRouter()
  const [query, setQuery] = useState(() => expressionStudy.filters.value.query)
  const [categories, setCategories] = useState<SceneCategory[]>(
    () => expressionStudy.filters.value.categories,
  )
  const [source, setSource] = useState<SourceFilter>(
    () => expressionStudy.filters.value.source as SourceFilter,
  )
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount)
  const [editingItem, setEditingItem] = useState<ExpressionLibraryItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<ExpressionLibraryItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const restoredFilters = useRef(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const {
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
  } = useExpressionLibrarySource({ query, categories, source })

  // Provider 从 localStorage/云端 hydrate 后才有真正保存过的筛选条件；只恢复一次，
  // 避免后续每次筛选写回都把当前输入重新灌回输入框。
  useEffect(() => {
    if (!hydrated || restoredFilters.current) {
      return
    }
    restoredFilters.current = true
    const saved = state.expressionStudy.filters.value
    setQuery(saved.query)
    setCategories(saved.categories)
    setSource(saved.source as SourceFilter)
    setVisibleCount(initialVisibleCount)
  }, [hydrated, state.expressionStudy.filters.value])

  const existingIdentities = useMemo(
    () => new Set(allItems.map((item) => createExpressionIdentity(item))),
    [allItems],
  )
  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  )
  const hasMore = visibleCount < filteredItems.length
  const selectedCategoryLabel =
    categories.length === 0 ? "全部场景" : `场景 ${categories.length}`

  // 学习改为独立路由：scope/mode 进 URL，筛选条件留在记忆快照里由学习页读取。
  const startStudy = useCallback(
    (scope: ExpressionStudyScope, mode: ExpressionStudyMode) => {
      const params = new URLSearchParams()
      params.set("scope", scope.kind)
      if (scope.kind === "group") {
        params.set("groupId", scope.groupId)
      }
      if (scope.kind === "review") {
        params.set("status", scope.status)
      }
      if (scope.kind === "random") {
        params.set("count", String(scope.count))
      }
      params.set("mode", mode)
      router.push(`/workspace/expressions/study?${params.toString()}`)
    },
    [router],
  )

  const joinRecommendation = useCallback(
    (recommendation: ExpressionRecommendation) => {
      addGroupItems(
        getRecommendedGroupId(recommendation.id),
        recommendation.name,
        recommendation.identities,
      )
      toast.success(`已把「${recommendation.name}」加入分组`)
    },
    [addGroupItems],
  )

  const startRecommendation = useCallback(
    (recommendation: ExpressionRecommendation) => {
      startStudy(
        { kind: "group", groupId: getRecommendedGroupId(recommendation.id) },
        "flashcard",
      )
    },
    [startStudy],
  )

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

  function persistFilters(next: Partial<ExpressionFilters>) {
    saveExpressionFilters({
      query: next.query ?? query,
      categories: next.categories ?? categories,
      source: next.source ?? source,
    })
  }

  function updateQuery(value: string) {
    setQuery(value)
    setVisibleCount(initialVisibleCount)
    persistFilters({ query: value })
  }

  function toggleCategory(category: SceneCategory, checked: boolean) {
    const next = checked
      ? Array.from(new Set([...categories, category]))
      : categories.filter((value) => value !== category)
    setCategories(next)
    setVisibleCount(initialVisibleCount)
    persistFilters({ categories: next })
  }

  function updateSource(value: SourceFilter | null) {
    if (!value) {
      return
    }
    setSource(value)
    setVisibleCount(initialVisibleCount)
    persistFilters({ source: value })
  }

  function clearCategories() {
    setCategories([])
    setVisibleCount(initialVisibleCount)
    persistFilters({ categories: [] })
  }

  const recordLibraryMemory = useCallback(
    (item: ExpressionLibraryItem) => {
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
    },
    [recordExpressionStudy],
  )

  const handleStudy = useCallback(
    (item: ExpressionLibraryItem) => {
      recordLibraryMemory(item)
      toast.success(`已把“${item.phrase}”加入长期记忆`)
    },
    [recordLibraryMemory],
  )

  async function handleImport(result: ExpressionImportResult) {
    const importedAt = new Date().toISOString()
    const importedBatch = result.items.map((item) => ({
      ...item,
      createdAt: item.createdAt ?? importedAt,
      updatedAt: importedAt,
    }))
    // 必须先入库：只有数据库确认写入后才动本机状态。失败/未登录时本机保持原样，
    // 弹窗保留内容供用户重试，不再出现"提示成功但数据库没数据"。
    let stored = false
    try {
      stored = await saveCloudExpressionItems(importedBatch)
    } catch (error) {
      setCloudAvailable(false)
      toast.error(error instanceof Error ? error.message : "表达未能写入数据库，请稍后重试。")
      return false
    }
    if (!stored) {
      setCloudAvailable(false)
      const reason =
        status === "demo"
          ? "演示模式不写入数据库，本机未做更改。"
          : status === "authenticated"
            ? "数据库未写入，请稍后重试，本机未做更改。"
            : "请先登录后再导入，本机未做更改。"
      toast.error(reason)
      return false
    }

    setCloudAvailable(true)
    const nextImportedItems = mergeImportedExpressionItems(importedBatch, importedItems)
    try {
      saveLocalExpressionItems(window.localStorage, storageScope, nextImportedItems)
    } catch {
      // 数据库已是真相；本机缓存失败只影响离线访问，不影响导入结果。
      toast.error("已写入数据库，但本机缓存空间不足，离线时可能看不到这些表达。")
    }
    setImportedItems(nextImportedItems)
    setCategories([])
    setQuery("")
    setSource("imported")
    setVisibleCount(initialVisibleCount)
    saveExpressionFilters({ query: "", categories: [], source: "imported" })
    toast.success(`已导入并写入数据库 ${importedBatch.length} 条表达`)
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

      {loadFailed ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          role="status"
        >
          <span className="text-muted-foreground">
            云端表达暂时无法读取，当前只显示本机缓存。你可以重试加载。
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={reload}
            disabled={loadingCloud}
          >
            {loadingCloud ? "正在重试…" : "重试加载"}
          </Button>
        </div>
      ) : null}

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
                    <DropdownMenuItem onClick={clearCategories}>清除场景筛选</DropdownMenuItem>
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
            existingIdentities={existingIdentities}
            onImport={handleImport}
          />
        </div>
      </section>

      <ExpressionStudyPanel
        study={expressionStudy}
        onStart={startStudy}
        onCreateGroup={createGroup}
        onAddGroupItems={addGroupItems}
        onRenameGroup={renameGroup}
        onDeleteGroup={deleteGroup}
        items={allItems}
        progressByIdentity={progressByIdentity}
        onJoinRecommendation={joinRecommendation}
        onStartRecommendation={startRecommendation}
      />

      <ExpressionRows
        items={visibleItems}
        studiedIds={studiedIds}
        favoriteIdentities={favoriteIdentities}
        studyGroups={studyGroups}
        progressByIdentity={progressByIdentity}
        onToggleFavorite={toggleFavorite}
        onToggleGroupItem={toggleGroupItem}
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

const ExpressionRows = memo(function ExpressionRows({
  items,
  studiedIds,
  favoriteIdentities,
  studyGroups,
  progressByIdentity,
  onToggleFavorite,
  onToggleGroupItem,
  onDelete,
  onEdit,
  onStudy,
}: {
  items: readonly ExpressionLibraryItem[]
  studiedIds: ReadonlySet<string>
  favoriteIdentities: ReadonlySet<string>
  studyGroups: readonly ExpressionGroup[]
  progressByIdentity: Readonly<Record<string, ExpressionProgressStatus>>
  onToggleFavorite: (identity: string) => void
  onToggleGroupItem: (groupId: string, identity: string) => void
  onDelete: (item: ExpressionLibraryItem) => void
  onEdit: (item: ExpressionLibraryItem) => void
  onStudy: (item: ExpressionLibraryItem) => void
}) {
  // 译文默认收起：先让学习者自己读懂例句，再按需展开对应中文。
  const [revealedIds, setRevealedIds] = useState<string[]>([])
  const revealedIdSet = new Set(revealedIds)

  function toggleTranslation(id: string) {
    setRevealedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

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
        const identity = createExpressionIdentity(item)
        const favorite = favoriteIdentities.has(identity)
        const progressStatus = progressByIdentity[identity]
        const translationRevealed = revealedIdSet.has(item.id)
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
                  {progressStatus === "mastered" ? (
                    <Badge variant="default">已掌握</Badge>
                  ) : null}
                  {progressStatus === "learning" ? (
                    <Badge variant="outline">学习中</Badge>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={
                            favorite ? `取消收藏 ${item.phrase}` : `收藏 ${item.phrase}`
                          }
                          aria-pressed={favorite}
                          onClick={() => onToggleFavorite(identity)}
                        />
                      }
                    >
                      <StarIcon className={favorite ? "fill-primary text-primary" : ""} />
                    </TooltipTrigger>
                    <TooltipContent>{favorite ? "取消收藏" : "收藏"}</TooltipContent>
                  </Tooltip>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`管理 ${item.phrase} 的学习分组`}
                        />
                      }
                    >
                      <FolderInputIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>加入分组</DropdownMenuLabel>
                        {studyGroups.length === 0 ? (
                          <DropdownMenuItem disabled>还没有分组，先在上方创建</DropdownMenuItem>
                        ) : (
                          studyGroups.map((group) => (
                            <DropdownMenuCheckboxItem
                              key={group.id}
                              checked={group.itemIds.includes(identity)}
                              onCheckedChange={() => onToggleGroupItem(group.id, identity)}
                            >
                              {group.name}
                            </DropdownMenuCheckboxItem>
                          ))
                        )}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={
                            studied
                              ? `${item.phrase} 已在长期记忆中`
                              : `把 ${item.phrase} 加入长期记忆`
                          }
                          disabled={studied}
                          onClick={() => onStudy(item)}
                        />
                      }
                    >
                      <BrainCircuitIcon />
                    </TooltipTrigger>
                    <TooltipContent>
                      {studied ? "已在记忆中，到期后到复习页巩固" : "加入长期记忆"}
                    </TooltipContent>
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

            {/* 导入条目多出编辑/删除按钮，左列更高会把右列拉伸；让右列内容垂直居中，
                例句 blockquote 不再贴着顶部留一大片空白。 */}
            <div
              className={cn(
                "grid min-w-0 gap-3 text-sm leading-6 md:grid-cols-2",
                item.source === "imported" && "lg:content-center",
              )}
            >
              <div>
                <p className="text-xs font-medium text-foreground">为什么这样表达</p>
                <p className="mt-1 text-muted-foreground">{item.why}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">来源</p>
                <p className="mt-1 text-muted-foreground">{item.origin}</p>
              </div>
              <blockquote className="rounded-r-md border-l-2 border-primary/45 bg-muted/40 px-3 py-2 font-serif text-sm md:col-span-2">
                {/* 译文开关紧跟例句末尾：它只解释这一句，不再被推到整行最右侧。 */}
                <p className="min-w-0">
                  <ExpressionText text={item.example} phrase={item.phrase} />
                  {item.exampleTranslation ? (
                    <button
                      type="button"
                      aria-expanded={translationRevealed}
                      aria-label={
                        translationRevealed
                          ? `收起 ${item.phrase} 的例句译文`
                          : `显示 ${item.phrase} 的例句译文`
                      }
                      className="ml-1 inline-flex items-center gap-0.5 rounded-sm px-1 align-middle font-sans text-[11px] font-normal text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => toggleTranslation(item.id)}
                    >
                      {translationRevealed ? (
                        <EyeOffIcon className="size-3" aria-hidden="true" />
                      ) : (
                        <EyeIcon className="size-3" aria-hidden="true" />
                      )}
                      {translationRevealed ? "收起" : "译文"}
                    </button>
                  ) : null}
                </p>
                {translationRevealed && item.exampleTranslation ? (
                  <span className="mt-2 block font-sans text-xs leading-5 text-muted-foreground">
                    {item.exampleTranslation}
                  </span>
                ) : null}
              </blockquote>
            </div>
          </article>
        )
      })}
    </section>
  )
})

function LibraryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r px-3 py-4 last:border-r-0 sm:px-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold">{value}</p>
    </div>
  )
}
