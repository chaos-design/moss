import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * The workspace shell removes its own padding on the conversation route so the transcript can run
 * edge to edge, which means the shared `app/workspace/loading.tsx` would render flush against the
 * left and top edges while this route streams in. This boundary owns its insets instead: the header
 * matches `conversation-workspace` at `px-4 md:px-5` and the transcript at `px-5 md:px-8`, so the
 * placeholder sits exactly where the real workspace will.
 */
export default function ConversationLoading() {
  return (
    <div
      className="flex h-full min-h-[560px] w-full min-w-0 flex-col overflow-hidden bg-card"
      role="status"
      aria-label="正在加载对话页面"
      aria-busy="true"
    >
      <header className="flex shrink-0 items-center gap-3 px-4 py-2 md:px-5 md:py-3">
        <Skeleton className="size-12 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-3 border-b bg-muted/20 px-5 py-2.5 md:grid-cols-4 md:gap-5 md:px-8">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={`conversation-loading-metric-${index}`} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* A placeholder transcript must not be a live log: it announces nothing and would double the
          outer status announcement on every navigation. */}
      <div
        data-slot="conversation-loading-transcript"
        className="min-h-0 flex-1 overflow-hidden px-5 pt-5 md:px-8 md:pt-6"
      >
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex items-center gap-3 pb-5">
            <Separator className="flex-1" />
            <span className="font-mono text-[10px] text-muted-foreground">TRANSCRIPT</span>
            <Separator className="flex-1" />
          </div>

          <div className="flex flex-col divide-y">
            {Array.from({ length: 3 }, (_, index) => (
              <article
                key={`conversation-loading-turn-${index}`}
                className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 py-5"
              >
                <Skeleton className="size-10 rounded-full" />
                <div className="flex min-w-0 flex-col gap-2.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className={cn("h-3 rounded-full", index % 2 ? "w-3/5" : "w-4/5")} />
                  <Skeleton className="h-3 w-1/2 rounded-full" />
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3 md:px-5 md:pb-4">
        <div className="mx-auto w-full max-w-lg">
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>

      <span className="sr-only">正在加载对话页面，请稍候。</span>
    </div>
  )
}
