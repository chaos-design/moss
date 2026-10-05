import { Skeleton } from "@/components/ui/skeleton"

// The workspace shell is a persistent client layout, so a route change has no built-in pending
// state. This boundary keeps the previous page from looking frozen while the next route streams in.
export default function WorkspaceLoading() {
  return (
    <div
      className="flex flex-col gap-7"
      role="status"
      aria-label="正在加载页面"
      aria-busy="true"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={`skeleton-row-${index}`}
            className="flex flex-col gap-3 rounded-lg border p-4"
          >
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>

      <span className="sr-only">正在加载页面内容，请稍候。</span>
    </div>
  )
}
