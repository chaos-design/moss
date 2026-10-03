"use client"

import {
  AudioLinesIcon,
  BookMarkedIcon,
  ChevronRightIcon,
  ListChecksIcon,
  ListFilterIcon,
  SparklesIcon,
  TagsIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { LevelBadge } from "@/components/level-badge"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { StoredConversationMessage } from "@/lib/conversation-history"
import {
  type ConversationScene,
  getAvailableConversationScenes,
} from "@/lib/conversation-scenes"
import { sceneCategories, sceneLevels } from "@/lib/demo-data"
import { getRelevantMemories } from "@/lib/memory"
import { cn } from "@/lib/utils"

const guidePreferenceKey = "moss:conversation-guide:v1"
const guideWidthPreferenceKey = "moss:conversation-guide-width:v1"
const minGuideWidth = 280
const maxGuideWidth = 520
// Fresh sessions open the panel at the minimum width; learners can drag wider from there.
const defaultGuideWidth = minGuideWidth
// Pointer travel that separates a click (toggle) from an intentional drag-to-resize.
const dragActivationThreshold = 4
const collapsedGuideRailWidth = 12
const categoryOptions = sceneCategories.filter((item) => item.value !== "all")
const levelOptions = sceneLevels.filter((item) => item.value !== "all")

type FocusPhrase = readonly [label: string, phrase: string, meaning: string]

function clampGuideWidth(width: number) {
  return Math.min(maxGuideWidth, Math.max(minGuideWidth, width))
}

export function getConversationFocusPhrases(
  scene: ConversationScene,
  messages: StoredConversationMessage[],
): FocusPhrase[] {
  const seen = new Set<string>()
  const dynamicPhrases: FocusPhrase[] = []

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const validation = message?.role === "assistant" ? message.validation : undefined
    const phrase = validation?.corrected.trim() ?? ""
    const normalized = phrase.toLocaleLowerCase().replace(/[.!?]+$/g, "")

    if (
      !validation ||
      !phrase ||
      phrase.length > 180 ||
      !/[a-z]/i.test(phrase) ||
      validation.status === "unavailable" ||
      seen.has(normalized)
    ) {
      continue
    }

    seen.add(normalized)
    const label =
      validation.status === "guidance"
        ? "本轮求助"
        : validation.status === "improve"
          ? "本轮修正"
          : "本轮表达"
    dynamicPhrases.push([
      label,
      phrase,
      validation.explanation || "来自当前对话，可在后续回合继续复用。",
    ])
  }

  const scenePhrases = scene.focusPhrases.filter(([, phrase]) => {
    const normalized = phrase.toLocaleLowerCase().replace(/[.!?]+$/g, "")
    if (seen.has(normalized)) {
      return false
    }
    seen.add(normalized)
    return true
  })

  return [...dynamicPhrases, ...scenePhrases]
}

export function ConversationGuideAside({
  collapsed,
  messages,
  onCollapsedChange,
  scene,
}: {
  collapsed: boolean
  messages: StoredConversationMessage[]
  onCollapsedChange: (collapsed: boolean) => void
  scene: ConversationScene
}) {
  const [guideWidth, setGuideWidth] = useState(defaultGuideWidth)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const [resizing, setResizing] = useState(false)
  const resizeStartRef = useRef<{
    pointerX: number
    width: number
    currentWidth: number
    fromCollapsed: boolean
    dragging: boolean
  } | null>(null)
  const suppressNextClickRef = useRef(false)

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem(guideWidthPreferenceKey))
    if (Number.isFinite(savedWidth) && savedWidth > 0) {
      setGuideWidth(clampGuideWidth(savedWidth))
    }
  }, [])

  function setCollapsed(next: boolean) {
    window.localStorage.setItem(guidePreferenceKey, next ? "collapsed" : "expanded")
    onCollapsedChange(next)
  }

  function updateGuideWidth(width: number) {
    const nextWidth = clampGuideWidth(width)
    setGuideWidth(nextWidth)
    window.localStorage.setItem(guideWidthPreferenceKey, String(nextWidth))
  }

  function handleResizeStart(event: PointerEvent<HTMLHRElement>) {
    resizeStartRef.current = {
      pointerX: event.clientX,
      width: collapsed ? 0 : guideWidth,
      currentWidth: collapsed ? 0 : guideWidth,
      fromCollapsed: collapsed,
      dragging: false,
    }
    setDragWidth(collapsed ? 0 : guideWidth)
    event.currentTarget.setPointerCapture(event.pointerId)
    setResizing(true)
  }

  function handleResizeMove(event: PointerEvent<HTMLHRElement>) {
    const start = resizeStartRef.current
    if (!start) {
      return
    }
    // The panel is docked right, so dragging left (a smaller clientX) widens it.
    const delta = start.pointerX - event.clientX
    if (!start.dragging && Math.abs(delta) < dragActivationThreshold) {
      return
    }
    start.dragging = true
    const nextWidth = Math.min(maxGuideWidth, Math.max(0, start.width + delta))
    start.currentWidth = nextWidth
    setDragWidth(nextWidth)
  }

  function handleResizeEnd(event: PointerEvent<HTMLHRElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const start = resizeStartRef.current
    if (start?.dragging) {
      suppressNextClickRef.current = true
      const releasedWidth = start.currentWidth
      if (releasedWidth < minGuideWidth) {
        if (start.fromCollapsed) {
          updateGuideWidth(minGuideWidth)
          setCollapsed(false)
          setDragWidth(minGuideWidth)
        } else {
          setCollapsed(true)
          setDragWidth(collapsedGuideRailWidth)
        }
      } else {
        updateGuideWidth(releasedWidth)
        setCollapsed(false)
        setDragWidth(clampGuideWidth(releasedWidth))
      }
    } else {
      setDragWidth(null)
    }
    resizeStartRef.current = null
    setResizing(false)
  }

  function handleResizeClick() {
    // A drag already handled opening/resizing; only treat a clean tap as a toggle.
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    if (collapsed) {
      setCollapsed(false)
    }
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLHRElement>) {
    if (collapsed) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        setCollapsed(false)
      }
      return
    }
    const step = event.shiftKey ? 40 : 16
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      updateGuideWidth(guideWidth + step)
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      if (guideWidth <= minGuideWidth) {
        setCollapsed(true)
      } else {
        updateGuideWidth(guideWidth - step)
      }
    } else if (event.key === "Home") {
      event.preventDefault()
      updateGuideWidth(minGuideWidth)
    } else if (event.key === "End") {
      event.preventDefault()
      updateGuideWidth(maxGuideWidth)
    }
  }

  const renderedWidth = dragWidth ?? (collapsed ? collapsedGuideRailWidth : guideWidth)
  const panelVisible = !collapsed || dragWidth !== null

  return (
    <aside
      className={cn(
        "relative hidden min-h-0 shrink-0 flex-col overflow-hidden min-[1200px]:flex",
        panelVisible && renderedWidth > 0 ? "border-l bg-muted/15" : "bg-transparent",
        !resizing && "transition-[width] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)]",
      )}
      style={{ width: renderedWidth }}
      aria-label="对话练习提示"
      onTransitionEnd={(event) => {
        if (event.propertyName === "width" && !resizing) {
          setDragWidth(null)
        }
      }}
    >
      {/* One persistent handle hugs the right edge and spans the full height, so a drag can
          open the collapsed rail and keep resizing without the pointer capture breaking. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <hr
              aria-orientation="vertical"
              aria-label={collapsed ? "展开练习提示" : "调整练习提示宽度"}
              aria-valuemin={minGuideWidth}
              aria-valuemax={maxGuideWidth}
              aria-valuenow={collapsed ? minGuideWidth : guideWidth}
              tabIndex={0}
              className={cn(
                "group absolute inset-y-0 z-20 h-auto cursor-col-resize touch-none select-none border-0 bg-transparent outline-none",
                "after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors",
                "hover:after:bg-primary/60 focus-visible:after:bg-primary",
                collapsed && dragWidth === null ? "right-0 w-2" : "-left-1.5 w-2",
                resizing && "after:bg-primary",
              )}
              onClick={handleResizeClick}
              onDoubleClick={() => {
                if (!collapsed) {
                  updateGuideWidth(defaultGuideWidth)
                }
              }}
              onKeyDown={handleResizeKeyDown}
              onPointerCancel={handleResizeEnd}
              onPointerDown={handleResizeStart}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
            />
          }
        />
        <TooltipContent side="left">
          {collapsed ? "展开练习提示" : "拖拽调整宽度"}
        </TooltipContent>
      </Tooltip>
      {panelVisible ? (
        <>
          <div className="flex h-[77px] shrink-0 items-center border-b px-4">
            <div className="flex items-center gap-2">
              <SparklesIcon className="text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold">场景与练习提示</h2>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ConversationGuideContent messages={messages} scene={scene} />
          </div>
        </>
      ) : null}
    </aside>
  )
}

export function ConversationGuideSheet({
  messages,
  scene,
}: {
  messages: StoredConversationMessage[]
  scene: ConversationScene
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="min-[1200px]:hidden"
            aria-label="打开场景与练习提示"
          >
            <ListChecksIcon data-icon="inline-start" />
            提示
          </Button>
        }
      />
      <SheetContent
        side="right"
        initialFocus={titleRef}
        className="w-[min(380px,92vw)] gap-0 p-0"
      >
        <SheetHeader className="h-14 shrink-0 justify-center border-b px-5 py-0">
          <SheetTitle ref={titleRef} tabIndex={-1}>
            场景与练习提示
          </SheetTitle>
          <SheetDescription className="sr-only">
            筛选对话场景，并查看当前练习目标和表达提示。
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationGuideContent messages={messages} scene={scene} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ConversationGuideContent({
  messages,
  scene,
}: {
  messages: StoredConversationMessage[]
  scene: ConversationScene
}) {
  const [categories, setCategories] = useState<string[]>([])
  const [levels, setLevels] = useState<string[]>([])
  const { state } = useLearningMemory()
  const filteredScenes = useMemo(
    () => getAvailableConversationScenes(categories, levels),
    [categories, levels],
  )
  const relevantMemories = useMemo(
    () => getRelevantMemories(state, scene.id),
    [scene.id, state],
  )
  const focusPhrases = useMemo(
    () => getConversationFocusPhrases(scene, messages),
    [messages, scene],
  )
  const categoryLabel =
    sceneCategories.find((item) => item.value === scene.category)?.label ?? "其他"

  function toggleFilter(
    value: string,
    checked: boolean,
    setValues: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    setValues((current) =>
      checked
        ? Array.from(new Set([...current, value]))
        : current.filter((item) => item !== value),
    )
  }

  return (
    <div className="flex flex-col">
      <section className="p-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">本轮目标</h3>
        </div>
        <p className="mt-3 font-serif text-base leading-7">{scene.objective}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {scene.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      </section>

      <Separator />

      {scene.expressionNotes ? (
        <>
          <section className="p-4" aria-label="地道表达词库入口">
            <Link
              href="/workspace/expressions"
              className={cn(buttonVariants({ variant: "outline" }), "w-full justify-between")}
            >
              <span className="flex items-center gap-2">
                <BookMarkedIcon data-icon="inline-start" aria-hidden="true" />
                地道表达词库
              </span>
              <ChevronRightIcon data-icon="inline-end" aria-hidden="true" />
            </Link>
          </section>

          <Separator />
        </>
      ) : null}

      <section className="p-4">
        <h3 className="text-sm font-semibold">表达焦点</h3>
        <div className="mt-3 flex flex-col gap-3">
          {focusPhrases.map(([label, phrase, meaning], index) => (
            <div
              key={phrase}
              className="grid grid-cols-[24px_minmax(0,1fr)] gap-2.5 border-b pb-3 last:border-b-0 last:pb-0"
            >
              <span className="grid size-6 place-items-center rounded-md bg-secondary font-mono text-[10px] text-primary">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="mt-0.5 font-serif text-sm leading-6">{phrase}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{meaning}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      <section className="p-4">
        <div className="flex items-center gap-2">
          <AudioLinesIcon className="text-[var(--success)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold">长期记忆</h3>
          <Badge variant="outline">RAG</Badge>
        </div>
        <div className="mt-3 flex flex-col gap-4">
          {relevantMemories.length > 0
            ? relevantMemories.map((item) => (
                <div key={item.id}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-6">{item.answer}</p>
                    <Badge variant="outline" className="shrink-0">
                      {item.strength}%
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    来自“{item.sourceSceneTitle}”，本轮需要主动复用。
                  </p>
                </div>
              ))
            : scene.recallItems.map((item) => (
                <div key={item.phrase}>
                  <p className="text-sm font-medium">{item.phrase}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.source}</p>
                </div>
              ))}
        </div>
      </section>

      <Separator />

      <section className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold">切换场景</h3>
          <span className="text-[11px] text-muted-foreground">{categoryLabel}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="outline" size="sm" aria-label="筛选场景分类" />
              }
            >
              <ListFilterIcon data-icon="inline-start" />
              分类
              {categories.length > 0 ? (
                <Badge variant="secondary">{categories.length}</Badge>
              ) : null}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>分类可多选</DropdownMenuLabel>
                {categoryOptions.map((item) => (
                  <DropdownMenuCheckboxItem
                    key={item.value}
                    checked={categories.includes(item.value)}
                    onCheckedChange={(checked) =>
                      toggleFilter(item.value, checked === true, setCategories)
                    }
                  >
                    {item.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              {categories.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setCategories([])}>
                      <XIcon aria-hidden="true" />
                      清除分类
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="outline" size="sm" aria-label="筛选语言等级" />
              }
            >
              <TagsIcon data-icon="inline-start" />
              等级
              {levels.length > 0 ? <Badge variant="secondary">{levels.length}</Badge> : null}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-40">
              <DropdownMenuGroup>
                <DropdownMenuLabel>等级可多选</DropdownMenuLabel>
                {levelOptions.map((item) => (
                  <DropdownMenuCheckboxItem
                    key={item.value}
                    checked={levels.includes(item.value)}
                    onCheckedChange={(checked) =>
                      toggleFilter(item.value, checked === true, setLevels)
                    }
                  >
                    <LevelBadge>{item.label}</LevelBadge>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              {levels.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setLevels([])}>
                      <XIcon aria-hidden="true" />
                      清除等级
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav
          className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto"
          aria-label="可用对话场景"
        >
          {filteredScenes.length > 0 ? (
            filteredScenes.map((item) => (
              <Link
                key={item.id}
                href={`/workspace/conversation?scene=${item.id}`}
                aria-current={item.id === scene.id ? "page" : undefined}
                className={cn(
                  "group flex min-h-12 items-center justify-between flex-shrink-0 gap-3 rounded-md my-0.3 px-2 py-1.5 text-sm transition-colors hover:bg-secondary",
                  item.id === scene.id && "bg-accent text-accent-foreground",
                )}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{item.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <LevelBadge>{item.level}</LevelBadge>
                    <span className="truncate">{item.englishTitle}</span>
                  </span>
                </span>
                <ChevronRightIcon
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            ))
          ) : (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              当前筛选下暂无场景
            </p>
          )}
        </nav>
      </section>
    </div>
  )
}
