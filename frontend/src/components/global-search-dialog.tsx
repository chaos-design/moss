"use client"

import { ArrowRightIcon, CommandIcon, LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { GlobalSearchGroup, GlobalSearchResult } from "@/lib/global-search"
import { cn } from "@/lib/utils"

type GlobalSearchIndex = typeof import("@/lib/global-search")

// The search index pulls the whole scene and expression catalog. It stays out of the persistent
// workspace bundle and loads on idle, then eagerly whenever the dialog opens.
let searchIndexPromise: Promise<GlobalSearchIndex> | null = null

function loadSearchIndex() {
  searchIndexPromise ??= import("@/lib/global-search")
  return searchIndexPromise
}

function scheduleIdleTask(callback: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 2_000 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = window.setTimeout(callback, 400)
  return () => window.clearTimeout(handle)
}

const groupOrder = ["页面", "学习场景", "学习记忆"] as const
const searchCategories = [
  { label: "全部", value: "all" },
  { label: "页面", value: "页面" },
  { label: "场景", value: "学习场景" },
  { label: "记忆", value: "学习记忆" },
] as const
type SearchCategory = (typeof searchCategories)[number]["value"]

export function GlobalSearchDialog() {
  const router = useRouter()
  const { state } = useLearningMemory()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeGroup, setActiveGroup] = useState<SearchCategory>("all")
  const [activeIndex, setActiveIndex] = useState(0)
  const [searchIndex, setSearchIndex] = useState<GlobalSearchIndex | null>(null)
  const deferredQuery = useDeferredValue(query)
  // Indexing the scene catalog on every memory write or keystroke blocks the main thread for no
  // visible gain, so results only exist while the dialog is open and the index is resident.
  const results = useMemo(
    () => (open && searchIndex ? searchIndex.searchWorkspace(state.items, deferredQuery) : []),
    [deferredQuery, open, searchIndex, state.items],
  )
  const orderedResults = useMemo(
    () => groupOrder.flatMap((group) => results.filter((result) => result.group === group)),
    [results],
  )
  const visibleResults = useMemo(
    () =>
      activeGroup === "all"
        ? orderedResults
        : orderedResults.filter((result) => result.group === activeGroup),
    [activeGroup, orderedResults],
  )
  const indexPending = open && !searchIndex

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void loadSearchIndex().then((index) => {
        if (!cancelled) {
          setSearchIndex(index)
        }
      })
    }
    if (open) {
      load()
      return () => {
        cancelled = true
      }
    }
    const cancelIdleTask = scheduleIdleTask(load)
    return () => {
      cancelled = true
      cancelIdleTask()
    }
  }, [open])

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if (event.key.toLocaleLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) {
        return
      }
      event.preventDefault()
      setOpen((current) => !current)
    }

    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [activeGroup, deferredQuery])

  useEffect(() => {
    if (!open) {
      return
    }
    document
      .getElementById(visibleResults[activeIndex]?.id ?? "")
      ?.scrollIntoView?.({ block: "nearest" })
  }, [activeIndex, open, visibleResults])

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setQuery("")
      setActiveGroup("all")
      setActiveIndex(0)
    }
  }

  function openResult(result: GlobalSearchResult) {
    handleOpenChange(false)
    router.push(result.href)
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, Math.max(visibleResults.length - 1, 0)))
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === "Enter" && visibleResults[activeIndex]) {
      event.preventDefault()
      openResult(visibleResults[activeIndex])
    }
  }

  return (
    <>
      <button
        type="button"
        className="hidden h-9 max-w-md flex-1 items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:flex"
        aria-label="打开全局搜索"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">搜索场景、句型或问题记录</span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-xs leading-none text-muted-foreground">
          <kbd className="grid size-6 place-items-center rounded border bg-muted font-semibold">
            <CommandIcon size={14} aria-hidden="true" />
          </kbd>
          <span aria-hidden="true">+</span>
          <kbd className="grid size-6 place-items-center rounded border bg-muted font-semibold">
            K
          </kbd>
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="ml-auto md:hidden"
        aria-label="打开全局搜索"
        onClick={() => setOpen(true)}
      >
        <SearchIcon aria-hidden="true" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="top-[10svh] flex h-[min(680px,82svh)] min-h-0 translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>全局搜索</DialogTitle>
            <DialogDescription>搜索页面、学习场景和长期记忆。</DialogDescription>
          </DialogHeader>

          <div className="border-b p-3">
            <InputGroup className="h-11 border-0 shadow-none">
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                autoFocus
                role="combobox"
                aria-controls="global-search-results"
                aria-expanded="true"
                aria-autocomplete="list"
                aria-label="搜索页面、场景或学习记忆"
                aria-activedescendant={visibleResults[activeIndex]?.id}
                placeholder="搜索页面、场景、句型或问题记录"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
              />
              <InputGroupAddon align="inline-end">
                <DialogClose
                  render={
                    <InputGroupButton type="button" size="icon-xs" aria-label="关闭全局搜索" />
                  }
                >
                  <XIcon />
                </DialogClose>
              </InputGroupAddon>
            </InputGroup>
          </div>

          <Tabs
            value={activeGroup}
            onValueChange={(value) => setActiveGroup(value as SearchCategory)}
            className="min-h-0 flex-1 gap-0"
          >
            <div className="shrink-0 overflow-x-auto border-b px-3">
              <TabsList
                variant="line"
                className="h-10 min-w-max justify-start gap-5"
                aria-label="筛选搜索结果"
              >
                {searchCategories.map((category) => (
                  <TabsTrigger key={category.value} value={category.value} className="px-0">
                    {category.label}
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {category.value === "all"
                        ? orderedResults.length
                        : orderedResults.filter((result) => result.group === category.value)
                            .length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value={activeGroup} className="m-0 min-h-0 overflow-hidden">
              <SearchResults
                pending={indexPending}
                results={visibleResults}
                activeIndex={activeIndex}
                onActiveIndexChange={setActiveIndex}
                onOpenResult={openResult}
                showGroups={activeGroup === "all"}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SearchResults({
  activeIndex,
  onActiveIndexChange,
  onOpenResult,
  pending,
  results,
  showGroups,
}: {
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onOpenResult: (result: GlobalSearchResult) => void
  pending: boolean
  results: GlobalSearchResult[]
  showGroups: boolean
}) {
  if (pending) {
    return (
      <div
        className="grid h-full min-h-36 place-items-center gap-2 px-6 text-center"
        role="status"
        aria-label="正在准备搜索索引"
      >
        <LoaderCircleIcon
          className="size-4 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-xs text-muted-foreground">正在准备搜索索引…</p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="grid h-full min-h-36 place-items-center px-6 text-center">
        <div>
          <p className="text-sm font-medium">没有找到相关内容</p>
          <p className="mt-1 text-xs text-muted-foreground">
            尝试搜索场景名称、英文表达或学习主题。
          </p>
        </div>
      </div>
    )
  }

  const groups: readonly GlobalSearchGroup[] = showGroups
    ? groupOrder
    : ([results[0]?.group].filter(Boolean) as GlobalSearchGroup[])

  return (
    <div
      id="global-search-results"
      role="listbox"
      aria-label="搜索结果"
      className="h-full min-h-0 overflow-y-auto overscroll-contain p-2"
    >
      {groups.map((group) => {
        const groupResults = results.filter((result) => result.group === group)
        return groupResults.length > 0 ? (
          <section key={group} aria-label={group} className="flex flex-col gap-1 py-1">
            {showGroups ? (
              <h2 className="sticky top-0 bg-popover px-2 py-1 font-mono text-[10px] font-medium text-muted-foreground">
                {group}
              </h2>
            ) : null}
            {groupResults.map((result) => {
              const index = results.indexOf(result)
              const Icon = result.icon
              return (
                <button
                  key={result.id}
                  id={result.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cn(
                    "flex min-h-12 w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                    index === activeIndex && "bg-muted",
                  )}
                  onMouseEnter={() => onActiveIndexChange(index)}
                  onClick={() => onOpenResult(result)}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{result.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {result.description}
                    </span>
                  </span>
                  <ArrowRightIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              )
            })}
          </section>
        ) : null
      })}
    </div>
  )
}
