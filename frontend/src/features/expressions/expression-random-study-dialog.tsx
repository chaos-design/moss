"use client"

import { FolderPlusIcon, LayersIcon, ShuffleIcon } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import type { ExpressionGroup } from "@/lib/memory"

/**
 * 随机学习固化弹窗：抽取的表达会写入一个分组，之后可以像普通分组一样编辑/删除。
 * 既可以复用已有分组，也可以新建；新建时做名称重名校验（现有 state 只按 id 去重）。
 */
export function ExpressionRandomStudyDialog({
  open,
  onOpenChange,
  count,
  groups,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  groups: readonly ExpressionGroup[]
  onConfirm: (
    target: { kind: "existing"; groupId: string } | { kind: "new"; name: string },
  ) => void
}) {
  const [targetKind, setTargetKind] = useState<"existing" | "new">(
    groups.length > 0 ? "existing" : "new",
  )
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "")
  const [newName, setNewName] = useState("")
  const [error, setError] = useState("")

  const trimmed = newName.trim()
  const duplicate = groups.some(
    (group) => group.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
  )

  function choose(kind: "existing" | "new") {
    setTargetKind(kind)
    setError("")
  }

  function confirm() {
    setError("")
    if (targetKind === "existing") {
      // 跨设备同步后分组可能已被删除，进入学习前校验它仍存在。
      if (!groups.some((group) => group.id === selectedGroupId)) {
        setError("所选分组已不存在，请重新选择。")
        return
      }
      onConfirm({ kind: "existing", groupId: selectedGroupId })
      return
    }
    if (!trimmed) {
      setError("请输入分组名称。")
      return
    }
    if (duplicate) {
      setError("已存在同名分组，请换一个名称或选择使用已有分组。")
      return
    }
    onConfirm({ kind: "new", name: trimmed })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShuffleIcon className="size-4 text-primary" aria-hidden="true" />
            随机学习 {count} 条
          </DialogTitle>
          <DialogDescription>
            抽出的表达会保存为一个学习分组，方便以后继续学习和复习。请选择放进已有分组，还是新建一个。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {groups.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <Button
                type="button"
                variant={targetKind === "existing" ? "secondary" : "ghost"}
                className="justify-start"
                aria-pressed={targetKind === "existing"}
                onClick={() => choose("existing")}
              >
                <LayersIcon data-icon="inline-start" />
                使用已有分组
              </Button>
              {targetKind === "existing" ? (
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      aria-pressed={selectedGroupId === group.id}
                      onClick={() => setSelectedGroupId(group.id)}
                      className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selectedGroupId === group.id
                          ? "border-primary bg-primary/5"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">{group.name}</span>
                      <Badge variant="secondary" className="shrink-0 px-1 py-0 text-[10px]">
                        {group.itemIds.length}
                      </Badge>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <Button
              type="button"
              variant={targetKind === "new" ? "secondary" : "ghost"}
              className="justify-start"
              aria-pressed={targetKind === "new"}
              onClick={() => choose("new")}
            >
              <FolderPlusIcon data-icon="inline-start" />
              创建新分组
            </Button>
            {targetKind === "new" ? (
              <Input
                value={newName}
                onChange={(event) => {
                  setNewName(event.target.value)
                  setError("")
                }}
                placeholder="例如：随机精读 · 11 月"
                aria-label="新随机分组名称"
              />
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={confirm}>
            抽取并开始学习
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
