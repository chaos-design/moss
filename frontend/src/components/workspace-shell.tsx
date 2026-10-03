"use client"

import {
  ChartNoAxesColumnIncreasingIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { AppNavigation } from "@/components/app-navigation"
import {
  LearningMemoryProvider,
  useLearningMemory,
} from "@/components/learning-memory-provider"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { WorkspaceHeader } from "@/components/workspace-header"
import type { LearningMemoryState } from "@/lib/memory"
import { cn } from "@/lib/utils"

const sidebarPreferenceKey = "moss:sidebar:v1"

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <LearningMemoryProvider>
      <WorkspaceShellContent>{children}</WorkspaceShellContent>
    </LearningMemoryProvider>
  )
}

function WorkspaceShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { state } = useLearningMemory()
  const [collapsed, setCollapsed] = useState(false)
  const conversationWorkspace = pathname === "/workspace/conversation"

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(sidebarPreferenceKey) === "collapsed")
  }, [])

  function handleCollapsedChange() {
    setCollapsed((current) => {
      const next = !current
      window.localStorage.setItem(sidebarPreferenceKey, next ? "collapsed" : "expanded")
      return next
    })
  }

  return (
    <div className="min-h-svh bg-background">
      <WorkspaceHeader />
      <div className="flex min-h-[calc(100svh-4rem)]">
        <aside
          className={cn(
            "sticky top-16 hidden h-[calc(100svh-4rem)] shrink-0 flex-col overflow-y-auto border-r bg-sidebar px-3 py-4 transition-[width] duration-200 lg:flex",
            collapsed ? "w-[76px]" : "w-64",
          )}
        >
          <div
            className={cn(
              "mb-4 flex h-8 items-center justify-between px-2",
              collapsed && "justify-center px-0",
            )}
          >
            <span
              className={cn(
                "font-mono text-[10px] uppercase text-muted-foreground",
                collapsed && "sr-only",
              )}
            >
              学习空间
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={collapsed ? "展开菜单" : "收起菜单"}
                    onClick={handleCollapsedChange}
                  />
                }
              >
                {collapsed ? (
                  <PanelLeftOpenIcon aria-hidden="true" />
                ) : (
                  <PanelLeftCloseIcon aria-hidden="true" />
                )}
              </TooltipTrigger>
              <TooltipContent side="right">
                {collapsed ? "展开菜单" : "收起菜单"}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex-1">
            <AppNavigation collapsed={collapsed} />
          </div>

          <div className={cn("border-t pt-4", collapsed && "px-1")}>
            <SidebarLearningProgress collapsed={collapsed} state={state} />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div
            className={cn(
              "mx-auto w-full px-4 py-5 md:px-6 md:py-7 lg:px-8",
              conversationWorkspace
                ? "h-[calc(100svh-4rem)] max-w-none p-0 md:p-0 lg:p-0"
                : "max-w-[1480px]",
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export function SidebarLearningProgress({
  collapsed,
  state,
}: {
  collapsed: boolean
  state: Pick<LearningMemoryState, "events" | "items">
}) {
  const memoryStrength =
    state.items.length > 0
      ? Math.round(
          state.items.reduce((total, item) => total + item.strength, 0) / state.items.length,
        )
      : 0

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className="h-12 w-10 flex-col gap-0.5 px-0"
              aria-label={`平均记忆强度 ${memoryStrength}%`}
            />
          }
        >
          <ChartNoAxesColumnIncreasingIcon aria-hidden="true" />
          <span className="font-mono text-[9px]">{memoryStrength}%</span>
        </TooltipTrigger>
        <TooltipContent side="right">
          平均记忆强度 {memoryStrength}% · {state.items.length} 条记忆 · {state.events.length}{" "}
          次练习
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 px-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <ChartNoAxesColumnIncreasingIcon
            className="size-3.5 text-[var(--success)]"
            aria-hidden="true"
          />
          记忆强度
        </span>
        <strong className="font-mono">{memoryStrength}%</strong>
      </div>
      <Progress
        value={memoryStrength}
        className="[&_[data-slot=progress-indicator]]:bg-[var(--success)]"
        aria-label={`平均记忆强度 ${memoryStrength}%`}
      />
      <p className="text-[11px] text-muted-foreground">
        {state.items.length} 条记忆 · {state.events.length} 次练习
      </p>
    </div>
  )
}
