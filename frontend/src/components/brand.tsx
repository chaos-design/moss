import Link from "next/link"
import { cn } from "@/lib/utils"

// The logo exits to the public landing page from anywhere in the workspace, while the public
// and auth routes keep learners pointed at the workspace. Defaults to "/" so an omitted href
// never silently traps someone inside the workspace.
export function Brand({
  href = "/",
  compact = false,
  className,
}: {
  href?: string
  compact?: boolean
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label="Moss 学习首页"
      className={cn("inline-flex min-h-11 items-center gap-2.5", className)}
    >
      <span className="grid size-8 place-items-center rounded-md bg-foreground text-background">
        <span className="font-serif text-xl leading-none">M</span>
      </span>
      <span className={cn("flex flex-col leading-none", compact && "sr-only")}>
        <strong className="font-serif text-lg font-semibold">Moss</strong>
        <span className="mt-1 font-mono text-[9px] uppercase text-muted-foreground">
          Language Lab
        </span>
      </span>
    </Link>
  )
}
