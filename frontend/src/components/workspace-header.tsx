"use client"

import {
  BrainCircuitIcon,
  CloudIcon,
  CloudOffIcon,
  LoaderCircleIcon,
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  Settings2Icon,
  UserRoundIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AppNavigation } from "@/components/app-navigation"
import { useAuth } from "@/components/auth-provider"
import { Brand } from "@/components/brand"
import { GlobalSearchDialog } from "@/components/global-search-dialog"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { LearningNotifications } from "@/components/learning-notifications"
import { ThemeToggle } from "@/components/theme-toggle"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getAvatarLabelFromAccount, getSyncBlockedReason, isSignedIn } from "@/lib/auth-status"
import { getDueMemoryItems } from "@/lib/memory"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { describeUserError } from "@/lib/user-error"

export function WorkspaceHeader() {
  const router = useRouter()
  const { accountLabel, status, requireSignIn } = useAuth()
  const { state, syncError, syncNow, syncStatus } = useLearningMemory()
  const [signingOut, setSigningOut] = useState(false)
  const signedIn = isSignedIn(status)
  const dueCount = useMemo(() => getDueMemoryItems(state).length, [state])
  // The account state explains a blocked sync better than the transport state can: a signed-out
  // learner needs to know signing in is the fix, while a demo deployment has no fix to offer.
  const syncLabel =
    getSyncBlockedReason(status) ??
    {
      connecting: "正在连接云端记忆",
      local: "当前使用本机记忆",
      syncing: "正在同步学习记忆",
      synced: "学习记忆已跨设备同步",
      offline: "当前离线，联网后自动同步",
      error: syncError || "学习记忆同步失败",
    }[syncStatus]

  function handleSignIn() {
    const target = new URL("/login", window.location.origin)
    target.searchParams.set("next", window.location.pathname)
    router.push(target.pathname + target.search)
  }

  function handleAccountStatusRequest() {
    if (signedIn) {
      toast.info(`已登录：${accountLabel}`)
      return
    }
    requireSignIn("学习记忆跨设备同步")
  }

  function handleSyncRequest() {
    if (!signedIn) {
      requireSignIn("学习记忆跨设备同步")
      return
    }
    syncNow()
  }

  async function handleSignOut() {
    if (signingOut) {
      return
    }

    setSigningOut(true)
    const supabase = getSupabaseBrowserClient()
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) {
        setSigningOut(false)
        toast.error(describeUserError(error, "退出登录失败，请稍后重试。"))
        return
      }
    }

    toast.success("已退出登录，学习记忆保留在本机")
    router.replace("/login")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 bg-background px-4 md:px-5">
      <div className="w-auto shrink-0 sm:w-56">
        <Brand href="/" />
      </div>

      <GlobalSearchDialog />

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <div className="mr-1 hidden items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium sm:flex">
          <BrainCircuitIcon className="size-3.5 text-primary" aria-hidden="true" />
          <span>{dueCount} 条待找回</span>
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={syncLabel}
                disabled={syncStatus === "connecting" || syncStatus === "syncing"}
                onClick={handleSyncRequest}
              />
            }
          >
            {syncStatus === "connecting" || syncStatus === "syncing" ? (
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            ) : syncStatus === "synced" ? (
              <CloudIcon className="text-[var(--success)]" aria-hidden="true" />
            ) : (
              <CloudOffIcon
                className={syncStatus === "error" ? "text-destructive" : undefined}
                aria-hidden="true"
              />
            )}
          </TooltipTrigger>
          <TooltipContent>{syncLabel}</TooltipContent>
        </Tooltip>

        <LearningNotifications />

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={signedIn ? "打开账户菜单" : "未登录，打开账户菜单"}
              />
            }
          >
            <Avatar>
              <AvatarFallback>{getAvatarLabelFromAccount(accountLabel)}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{signedIn ? "学习账户" : "本机账户"}</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleAccountStatusRequest}>
                {signedIn ? (
                  <UserRoundIcon aria-hidden="true" />
                ) : (
                  <CloudOffIcon aria-hidden="true" />
                )}
                <span className="max-w-44 truncate">{accountLabel}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => router.push("/workspace/settings")}>
                <Settings2Icon aria-hidden="true" />
                偏好设置
              </DropdownMenuItem>
              {signedIn ? (
                <DropdownMenuItem disabled={signingOut} onClick={handleSignOut}>
                  <LogOutIcon aria-hidden="true" />
                  {signingOut ? "正在退出" : "退出登录"}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={handleSignIn}>
                  <LogInIcon aria-hidden="true" />
                  登录
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="打开学习导航"
                className="lg:hidden"
              />
            }
          >
            <MenuIcon aria-hidden="true" />
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(320px,86vw)] p-0">
            <SheetHeader className="border-b px-5 py-3">
              <SheetTitle className="sr-only">学习空间导航</SheetTitle>
              <SheetDescription className="sr-only">
                前往对话、跟读、学习地图和复习页面。
              </SheetDescription>
              <Brand href="/" />
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <AppNavigation />
            </div>
            <div className="border-t p-4 text-xs text-muted-foreground">
              今日目标还差 12 分钟
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
