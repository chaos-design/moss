"use client"

import {
  Clock3Icon,
  HistoryIcon,
  MessageCircleMoreIcon,
  MicIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { type ConversationSession, getConversationTurnCount } from "@/lib/conversation-history"
import { cn } from "@/lib/utils"

function formatSessionDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "最近"
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder.toString().padStart(2, "0")}`
}

export function ConversationHistorySheet({
  currentSessionId,
  onDelete,
  onSelect,
  sessions,
}: {
  currentSessionId: string
  onDelete: (sessionId: string) => void
  onSelect: (sessionId: string) => void
  sessions: ConversationSession[]
}) {
  const [open, setOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ConversationSession | null>(null)

  function handleSelect(sessionId: string) {
    onSelect(sessionId)
    setOpen(false)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button type="button" variant="outline" size="xs" aria-label="打开历史对话">
              <HistoryIcon data-icon="inline-start" />
              <span>历史</span>
              {sessions.length > 0 ? (
                <Badge variant="secondary" className="min-w-5 justify-center px-1">
                  {sessions.length}
                </Badge>
              ) : null}
            </Button>
          }
        />
        <SheetContent
          side="right"
          className="h-dvh max-h-dvh w-[min(420px,94vw)] gap-0 overflow-hidden p-0"
        >
          <SheetHeader className="border-b px-5 py-4">
            <div className="pr-8">
              <SheetTitle>历史对话</SheetTitle>
              <SheetDescription className="mt-1">
                选择一段记录，沿用原有上下文继续练习。
              </SheetDescription>
            </div>
          </SheetHeader>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
            data-conversation-history-list
          >
            {sessions.length === 0 ? (
              <div className="grid min-h-64 place-items-center px-8 text-center">
                <div>
                  <HistoryIcon
                    className="mx-auto size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="mt-3 text-sm font-medium">还没有历史对话</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    完成第一个问答后，会自动保存在当前浏览器。
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y">
                {sessions.map((session) => {
                  const active = session.id === currentSessionId
                  const userMessages = session.messages.filter(
                    (message) => message.role === "user",
                  )
                  const usedVoice = userMessages.some(
                    (message) => message.inputMode === "voice",
                  )
                  const preview =
                    userMessages.at(-1)?.content ??
                    session.messages.at(-1)?.content ??
                    "场景开场"

                  return (
                    <div
                      key={session.id}
                      className={cn(
                        "group relative px-5 py-4 transition-colors hover:bg-muted/45",
                        active && "bg-accent/45",
                      )}
                    >
                      <button
                        type="button"
                        className="block w-full pr-9 text-left"
                        onClick={() => handleSelect(session.id)}
                        aria-label={`继续 ${session.sceneTitle} 对话`}
                      >
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                            {session.sceneTitle}
                          </p>
                          {active ? <Badge variant="outline">当前</Badge> : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {preview}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock3Icon className="size-3" aria-hidden="true" />
                            {formatSessionDate(session.updatedAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircleMoreIcon className="size-3" aria-hidden="true" />
                            {getConversationTurnCount(session.messages)} 轮
                          </span>
                          <span className="flex items-center gap-1">
                            {usedVoice ? (
                              <MicIcon className="size-3" aria-hidden="true" />
                            ) : (
                              <RotateCcwIcon className="size-3" aria-hidden="true" />
                            )}
                            {usedVoice ? "含语音" : "文字"}
                          </span>
                          <span>{formatDuration(session.durationSeconds)}</span>
                        </div>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute right-3 top-3 opacity-0 focus:opacity-100 group-hover:opacity-100"
                        aria-label={`删除 ${session.sceneTitle} 对话`}
                        title="删除历史对话"
                        onClick={() => setPendingDelete(session)}
                      >
                        <Trash2Icon aria-hidden="true" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingDelete(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除这段历史对话？</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.sceneTitle}”的转写和练习记录将从历史列表移除，此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>取消</DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) {
                  return
                }
                onDelete(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              <Trash2Icon data-icon="inline-start" />
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
