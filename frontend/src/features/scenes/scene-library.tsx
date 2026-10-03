"use client"

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ListFilterIcon,
  LockKeyholeIcon,
  TagsIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Progress } from "@/components/ui/progress"
import { SceneImage } from "@/features/scenes/scene-image"
import { type SceneItem, sceneCategories, sceneItems, sceneLevels } from "@/lib/demo-data"
import { getSceneLearningProgress, getSceneLibraryStats } from "@/lib/learning-progress"
import type { SceneMemoryProgress } from "@/lib/memory"

const filterCategories = sceneCategories.filter((category) => category.value !== "all")
const filterLevels = sceneLevels.filter((level) => level.value !== "all")

export function SceneLibrarySummary({
  scenes = sceneItems,
}: {
  scenes?: readonly SceneItem[]
}) {
  const { state } = useLearningMemory()
  const stats = useMemo(
    () => getSceneLibraryStats(scenes, state.sceneProgress),
    [scenes, state.sceneProgress],
  )

  return (
    <Badge variant="outline">
      {stats.totalCount} 个场景 · 已掌握 {stats.masteredCount} 个
    </Badge>
  )
}

export function SceneLibrary({ scenes = sceneItems }: { scenes?: readonly SceneItem[] }) {
  const { state } = useLearningMemory()
  const [levels, setLevels] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const filteredScenes = useMemo(
    () =>
      scenes.filter(
        (scene) =>
          (levels.length === 0 || levels.includes(scene.level)) &&
          (categories.length === 0 || categories.includes(scene.category)),
      ),
    [categories, levels, scenes],
  )

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
    <div>
      <div className="sticky top-16 z-30 -mx-4 mb-4 flex flex-wrap items-center gap-2 bg-background px-4 py-3 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="outline" aria-label="筛选场景分类" />}
          >
            <ListFilterIcon data-icon="inline-start" />
            场景分类
            {categories.length > 0 ? (
              <Badge variant="secondary">{categories.length}</Badge>
            ) : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-52" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>分类可多选</DropdownMenuLabel>
              {filterCategories.map((category) => (
                <DropdownMenuCheckboxItem
                  key={category.value}
                  checked={categories.includes(category.value)}
                  onCheckedChange={(checked) =>
                    toggleFilter(category.value, checked === true, setCategories)
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
            render={<Button type="button" variant="outline" aria-label="筛选语言等级" />}
          >
            <TagsIcon data-icon="inline-start" />
            语言等级
            {levels.length > 0 ? <Badge variant="secondary">{levels.length}</Badge> : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-44" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>等级可多选</DropdownMenuLabel>
              {filterLevels.map((level) => (
                <DropdownMenuCheckboxItem
                  key={level.value}
                  checked={levels.includes(level.value)}
                  onCheckedChange={(checked) =>
                    toggleFilter(level.value, checked === true, setLevels)
                  }
                >
                  <Badge variant="outline">{level.label}</Badge>
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

        <span className="ml-auto text-xs text-muted-foreground">
          {filteredScenes.length} / {scenes.length} 个场景
        </span>
      </div>

      <SceneCards scenes={filteredScenes} progress={state.sceneProgress} />
    </div>
  )
}

function SceneCards({
  scenes,
  progress,
}: {
  scenes: readonly SceneItem[]
  progress: ReturnType<typeof useLearningMemory>["state"]["sceneProgress"]
}) {
  if (scenes.length === 0) {
    return (
      <section className="px-5 py-16 text-center" aria-label="场景筛选结果" aria-live="polite">
        <p className="font-serif text-lg font-semibold">当前组合暂无场景</p>
        <p className="mt-2 text-sm text-muted-foreground">调整分类或语言等级后再试。</p>
      </section>
    )
  }

  return (
    <section
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      aria-label="场景卡片"
    >
      {scenes.map((scene, index) => (
        <SceneCard
          key={scene.id}
          scene={scene}
          eagerImage={index < 4}
          memoryProgress={progress[scene.id]}
        />
      ))}
    </section>
  )
}

function SceneCard({
  scene,
  eagerImage,
  memoryProgress,
}: {
  scene: SceneItem
  eagerImage: boolean
  memoryProgress?: SceneMemoryProgress
}) {
  const learningProgress = getSceneLearningProgress(scene, memoryProgress)
  const { accurateTurns, turns } = learningProgress
  const locked = learningProgress.status === "locked"
  const card = (
    <Card
      size="sm"
      className="h-full rounded-lg ring-0 shadow-sm transition-[box-shadow,transform,background-color] duration-200 [content-visibility:auto] [contain-intrinsic-size:360px] group-hover:-translate-y-0.5 group-hover:shadow-md"
    >
      <SceneImage
        category={scene.category}
        title={scene.title}
        eager={eagerImage}
        className="aspect-[5/2]"
      />
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-1.5">
            <span className="truncate">{scene.title}</span>
            {learningProgress.mastered ? (
              <CheckCircle2Icon
                className="size-4 shrink-0 text-[var(--success)]"
                aria-label="已掌握"
              />
            ) : null}
          </h2>
        </CardTitle>
        <CardDescription className="truncate text-xs">{scene.englishTitle}</CardDescription>
        <CardAction>
          <Badge variant="outline">{scene.level}</Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-2.5">
        <p className="line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
          {scene.description}
        </p>
        <div className="flex flex-wrap gap-1">
          {scene.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
        <p className="mt-auto line-clamp-1 text-[11px] text-muted-foreground">
          {scene.vocabulary.join(" · ")}
        </p>
      </CardContent>

      <CardFooter className="min-h-11 justify-between gap-3 border-t-0 bg-transparent pt-0">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span>{locked ? "尚未解锁" : turns === 0 ? "尚未开始" : `完成 ${turns} 轮`}</span>
            <span>
              {turns > 0 ? `准确 ${Math.round((accurateTurns / turns) * 100)}%` : "暂无记录"}
            </span>
          </div>
          <Progress
            value={learningProgress.progress}
            aria-label={`${scene.title}进度 ${learningProgress.progress}%`}
          />
        </div>
        {locked ? (
          <LockKeyholeIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <ArrowRightIcon
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        )}
      </CardFooter>
    </Card>
  )

  return locked ? (
    <div aria-disabled="true" className="cursor-not-allowed opacity-60">
      {card}
    </div>
  ) : (
    <Link
      href={`/workspace/conversation?scene=${scene.id}`}
      className="group rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {card}
    </Link>
  )
}
