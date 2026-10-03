import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function LevelBadge({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const level = String(children).slice(0, 1).toUpperCase()

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-4 rounded-sm px-1.5 py-0 font-mono text-[10px]",
        level === "A" &&
          "border-[var(--success)]/35 bg-[var(--success)]/10 text-[var(--success)]",
        level === "B" && "border-primary/35 bg-primary/10 text-primary",
        level === "C" && "border-destructive/35 bg-destructive/10 text-destructive",
        className,
      )}
    >
      {children}
    </Badge>
  )
}
