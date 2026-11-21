"use client"

import {
  BrainCircuitIcon,
  ChevronDownIcon,
  FolderPlusIcon,
  LayersIcon,
  PencilIcon,
  ShuffleIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ExpressionRecommendationDialog } from "@/features/expressions/expression-recommendation-dialog"
import type { ExpressionLibraryItem } from "@/lib/expression-library-schema"
import type { ExpressionRecommendation } from "@/lib/expression-recommendations"
import type { ExpressionStudyMode, ExpressionStudyScope } from "@/lib/expression-study"
import type { ExpressionProgressStatus } from "@/lib/memory"
import {
  type ExpressionStudyState,
  findDuplicateGroupNames,
  getActiveFavorites,
  getActiveGroups,
  isExpressionGroupNameTaken,
} from "@/lib/memory"

/** 随机学习一键抽词的默认条数。 */
const randomBatchSize = 10

export function ExpressionStudyPanel({
  study,
  onStart,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  items,
  progressByIdentity,
  onJoinRecommendation,
  onStartRecommendation,
}: {
  study: ExpressionStudyState
  onStart: (scope: ExpressionStudyScope, mode: ExpressionStudyMode) => void
  onCreateGroup: (name: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onDeleteGroup: (groupId: string) => void
  items: readonly ExpressionLibraryItem[]
  progressByIdentity: Readonly<Record<string, ExpressionProgressStatus>>
  onJoinRecommendation: (recommendation: ExpressionRecommendation) => void
  onStartRecommendation: (recommendation: ExpressionRecommendation) => void
}) {
  const [managing, setManaging] = useState(false)
  const [showRecommendations, setShowRecommendations] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")

  const favorites = getActiveFavorites(study)
  const groups = getActiveGroups(study)
  const duplicateGroupNames = findDuplicateGroupNames(study)
  const progress = Object.values(study.progress)
  const mastered = progress.filter((entry) => entry.status === "mastered").length
  const learning = progress.filter((entry) => entry.status === "learning").length

  function start(scope: ExpressionStudyScope, mode: ExpressionStudyMode) {
    setManaging(false)
    onStart(scope, mode)
  }

  function createGroup() {
    const name = newGroupName.trim()
    if (!name || isExpressionGroupNameTaken(study, name)) {
      return
    }
    onCreateGroup(name)
    setNewGroupName("")
  }

  return (
    <>
      <section
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y bg-muted/30 px-4 py-3 text-sm"
        aria-label="我的学习工作台"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <StarIcon className="size-3.5" aria-hidden="true" />
            收藏 {favorites.length}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LayersIcon className="size-3.5" aria-hidden="true" />
            分组 {groups.length}
          </span>
          <span>已掌握 {mastered}</span>
          <span>学习中 {learning}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={favorites.length === 0}
            onClick={() => start({ kind: "favorites" }, "flashcard")}
          >
            复习收藏
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowRecommendations(true)}
          >
            <SparklesIcon data-icon="inline-start" />
            推荐分组
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setManaging(true)}>
            管理分组
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" size="sm" className="justify-between" />}
            >
              开始学习
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>快速开始</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => start({ kind: "filtered" }, "flashcard")}>
                  <span className="grid gap-0.5">
                    <span>闪卡自测</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      看表达，先回想再揭答案
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>换种练法</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => start({ kind: "filtered" }, "cloze")}>
                  <span className="grid gap-0.5">
                    <span>例句填空</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      看例句，把表达填回去
                    </span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => start({ kind: "filtered" }, "dictation")}>
                  <span className="grid gap-0.5">
                    <span>跟读听写</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      听发音，复述录音比对
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>按计划学</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => start({ kind: "ebbinghaus" }, "flashcard")}>
                  <BrainCircuitIcon data-icon="inline-start" />
                  <span className="grid gap-0.5">
                    <span>艾宾浩斯记忆循环</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      学习 → 复习 → 再记忆
                    </span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => start({ kind: "review", status: "learning" }, "flashcard")}
                >
                  继续学习（学习中）
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => start({ kind: "review", status: "mastered" }, "cloze")}
                >
                  巩固已掌握
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>随机抽取</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => start({ kind: "random", count: randomBatchSize }, "flashcard")}
                >
                  <ShuffleIcon data-icon="inline-start" />
                  <span className="grid gap-0.5">
                    <span>随机抽 {randomBatchSize} 条</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      从当前结果里随机练一组
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {groups.length > 0 ? (
          <div className="flex w-full flex-wrap items-center gap-2 border-t pt-2">
            <span className="text-xs text-muted-foreground">分组：</span>
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => start({ kind: "group", groupId: group.id }, "flashcard")}
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              >
                {group.name}
                <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                  {group.itemIds.length}
                </Badge>
              </button>
            ))}
          </div>
        ) : null}

        {duplicateGroupNames.length > 0 ? (
          <p className="w-full text-xs text-muted-foreground" role="status">
            有同名分组（{duplicateGroupNames.join("、")}
            ），可能来自不同设备；为避免丢失条目未自动合并， 可在「管理分组」里重命名区分。
          </p>
        ) : null}
      </section>

      <ExpressionRecommendationDialog
        open={showRecommendations}
        onOpenChange={setShowRecommendations}
        items={items}
        progressByIdentity={progressByIdentity}
        study={study}
        onJoin={onJoinRecommendation}
        onStart={onStartRecommendation}
      />

      <Dialog open={managing} onOpenChange={setManaging}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>学习分组</DialogTitle>
            <DialogDescription>
              把收藏的表达归入不同分组，按主题或阶段分批学习。分组随账号跨设备同步。
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  createGroup()
                }
              }}
              placeholder="新分组名称，如「面试表达」"
              aria-label="新分组名称"
            />
            <Button type="button" onClick={createGroup} disabled={!newGroupName.trim()}>
              <FolderPlusIcon data-icon="inline-start" />
              新建
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            {groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">还没有分组。</p>
            ) : (
              groups.map((group) => (
                <GroupRow
                  key={group.id}
                  name={group.name}
                  count={group.itemIds.length}
                  onRename={(name) => onRenameGroup(group.id, name)}
                  onDelete={() => onDeleteGroup(group.id)}
                />
              ))
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setManaging(false)}>
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function GroupRow({
  name,
  count,
  onRename,
  onDelete,
}: {
  name: string
  count: number
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  function commit() {
    if (draft.trim()) {
      onRename(draft)
    } else {
      setDraft(name)
    }
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-2 rounded-md border px-2 py-2">
      {editing ? (
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              commit()
            }
          }}
          aria-label={`重命名分组 ${name}`}
          autoFocus
          className="h-8"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="min-w-0 flex-1 truncate text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {name}
        </button>
      )}
      <span className="shrink-0 text-xs text-muted-foreground">{count} 条</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`重命名 ${name}`}
        onClick={() => setEditing(true)}
      >
        <PencilIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`删除分组 ${name}`}
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
    </div>
  )
}
