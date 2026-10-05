"use client"

import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"

/**
 * Route-level boundary. A render failure must degrade to a recoverable workspace state instead of
 * a blank page carrying raw framework diagnostics. `reset` re-renders the segment on demand.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Route segment failed to render", error)
  }, [error])

  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-start gap-4">
        <span className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <AlertTriangleIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold">页面遇到问题</h1>
          <p className="text-sm text-muted-foreground">
            当前工作区没能正常加载。你的学习记录已保存在本机，重新加载后可以继续。
          </p>
        </div>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">错误编号：{error.digest}</p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button type="button" onClick={reset}>
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            重新加载
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            刷新页面
          </Button>
        </div>
      </div>
    </main>
  )
}
