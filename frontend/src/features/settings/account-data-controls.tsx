"use client"

import { DownloadIcon, LoaderCircleIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { canOfferSignIn, isSignedIn } from "@/lib/auth-status"

type AccountResponse = {
  data?: {
    auditId?: string
    deleted?: boolean
  }
  error?: {
    code?: string
    message?: string
  }
}

function clearMossLocalData() {
  const keys = Array.from({ length: window.localStorage.length }, (_, index) =>
    window.localStorage.key(index),
  )
  for (const key of keys) {
    if (key?.startsWith("moss:")) {
      window.localStorage.removeItem(key)
    }
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as AccountResponse
    return payload.error?.message || fallback
  } catch {
    return fallback
  }
}

export function AccountDataControls() {
  const router = useRouter()
  const { status, requireSignIn } = useAuth()
  // Account data lives in the cloud, so only a signed-in learner has any account data to manage.
  // A demo or unconfigured deployment has no account at all, and an anonymous learner can sign in
  // — those are different affordances, so the buttons reflect the distinction instead of gating on
  // demo mode alone.
  const signedIn = isSignedIn(status)
  const hasCloudAccount = signedIn || canOfferSignIn(status)
  const [exporting, setExporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [deleting, setDeleting] = useState(false)

  async function handleExport() {
    if (exporting) {
      return
    }
    if (!requireSignIn("导出账户数据")) {
      return
    }
    setExporting(true)
    try {
      const response = await fetch("/api/account", { cache: "no-store" })
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "账户数据导出失败"))
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `moss-account-export-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success("账户数据已导出")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "账户数据导出失败")
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    if (!confirmation.trim() || deleting) {
      return
    }
    if (!requireSignIn("删除账户")) {
      return
    }
    setDeleting(true)
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: confirmation.trim() }),
      })
      const payload = (await response.json()) as AccountResponse
      if (!response.ok && !payload.data?.deleted) {
        throw new Error(payload.error?.message || "账户删除失败")
      }

      clearMossLocalData()
      router.replace("/login?deleted=true")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "账户删除失败")
      setDeleting(false)
    }
  }

  function handleOpenDelete() {
    // Deletion is irreversible, so the sign-in check happens before the confirmation dialog rather
    // than after the learner has already typed their email.
    if (!requireSignIn("删除账户")) {
      return
    }
    setDeleteOpen(true)
  }

  function handleOpenChange(open: boolean) {
    if (deleting) {
      return
    }
    setDeleteOpen(open)
    if (!open) {
      setConfirmation("")
    }
  }

  return (
    <>
      <Card className="max-h-[min(680px,calc(100svh-6rem))] w-full min-w-0 rounded-lg lg:max-w-[calc(50%_-_0.625rem)]">
        <CardHeader className="shrink-0">
          <CardTitle className="flex items-center gap-2 font-serif text-lg">
            <ShieldAlertIcon className="size-4 text-primary" aria-hidden="true" />
            账户数据
          </CardTitle>
          <CardDescription>
            {hasCloudAccount
              ? signedIn
                ? "导出云端记录，或永久删除账户及关联学习数据。"
                : "登录后可导出云端记录，或永久删除账户及关联学习数据。"
              : "本地演示模式没有可导出或删除的云端账户。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 divide-y overflow-y-auto overscroll-contain p-0">
          <div className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">导出账户数据</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                包含全部云端学习记录；仅存本机的模型配置和 API 密钥不会进入导出文件。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="self-start sm:self-auto"
              disabled={exporting || !hasCloudAccount}
              onClick={handleExport}
            >
              {exporting ? (
                <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              {exporting ? "正在导出" : "导出 JSON"}
            </Button>
          </div>

          <div className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-destructive">永久删除账户</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                删除 Auth 账户、对话、学习进度、快照和向量记忆，操作不可撤销。
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              className="self-start sm:self-auto"
              disabled={!hasCloudAccount}
              onClick={handleOpenDelete}
            >
              <Trash2Icon data-icon="inline-start" />
              删除账户
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>永久删除 Moss 账户</DialogTitle>
            <DialogDescription>
              删除后无法恢复。建议先导出数据，再输入当前账户邮箱确认。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="delete-account-confirmation">当前账户邮箱</Label>
            <Input
              id="delete-account-confirmation"
              type="email"
              autoComplete="email"
              value={confirmation}
              disabled={deleting}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="name@example.com"
            />
          </div>
          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" disabled={deleting} />}
            >
              取消
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmation.trim() || deleting}
              onClick={handleDelete}
            >
              {deleting ? (
                <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              {deleting ? "正在删除" : "确认永久删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
