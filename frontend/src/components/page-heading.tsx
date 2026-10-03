import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type PageHeadingMotif =
  | "analytics"
  | "conversation"
  | "dashboard"
  | "map"
  | "notebook"
  | "review"
  | "scenes"
  | "settings"
  | "shadowing"

export function PageHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
  motif,
  actions,
  className,
}: {
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
  motif: PageHeadingMotif
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn("flex flex-col justify-between gap-4 md:flex-row md:items-end", className)}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase text-primary">
          <Icon className="size-3.5" aria-hidden="true" />
          {eyebrow}
        </p>
        <div className="mt-2 flex min-w-0 items-center gap-3">
          <h1 className="min-w-0 font-serif text-2xl font-semibold md:text-3xl">{title}</h1>
          <PageSloganMark motif={motif} title={title} />
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}

function PageSloganMark({ motif, title }: { motif: PageHeadingMotif; title: string }) {
  return (
    <svg
      viewBox="0 0 96 28"
      className="hidden h-7 w-24 shrink-0 text-primary sm:block"
      role="img"
      aria-label={`${title}主题标识`}
    >
      <title>{`${title}主题标识`}</title>
      <path d="M2 25.5H94" stroke="currentColor" strokeOpacity="0.18" />
      <SloganPath motif={motif} />
    </svg>
  )
}

function SloganPath({ motif }: { motif: PageHeadingMotif }) {
  switch (motif) {
    case "dashboard":
      return (
        <>
          <path d="M5 21h16V11h17V5h18v12h17V8h18" fill="none" stroke="currentColor" />
          <circle cx="56" cy="17" r="2.5" fill="currentColor" />
        </>
      )
    case "conversation":
      return (
        <>
          <path
            d="M4 15h9l4-8 7 16 7-13 6 10 6-10 7 13 7-16 5 8h20"
            fill="none"
            stroke="currentColor"
          />
          <circle cx="87" cy="15" r="3" fill="currentColor" />
        </>
      )
    case "shadowing":
      return (
        <>
          <path
            d="M4 10c10-8 16 8 26 0s16 8 26 0 16 8 36 0"
            fill="none"
            stroke="currentColor"
          />
          <path
            d="M4 19c10-8 16 8 26 0s16 8 26 0 16 8 36 0"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.45"
          />
        </>
      )
    case "map":
      return (
        <>
          <path
            d="M5 22c14 0 10-16 24-16s11 16 25 16S66 8 80 8h11"
            fill="none"
            stroke="currentColor"
          />
          <circle cx="5" cy="22" r="3" fill="currentColor" />
          <circle cx="91" cy="8" r="3" fill="currentColor" />
        </>
      )
    case "scenes":
      return (
        <>
          <rect x="4" y="5" width="24" height="18" rx="2" fill="none" stroke="currentColor" />
          <rect x="36" y="5" width="24" height="18" rx="2" fill="none" stroke="currentColor" />
          <rect x="68" y="5" width="24" height="18" rx="2" fill="none" stroke="currentColor" />
          <path d="m10 18 5-5 4 4 3-3" fill="none" stroke="currentColor" />
        </>
      )
    case "review":
      return (
        <>
          <path d="M23 6A10 10 0 1 0 27 22" fill="none" stroke="currentColor" />
          <path d="m21 2 3 4-5 2" fill="none" stroke="currentColor" />
          <path d="M39 9h51M39 15h38M39 21h44" stroke="currentColor" />
        </>
      )
    case "analytics":
      return (
        <>
          <path
            d="M5 23V15h10v8m7 0V9h10v14m7 0V12h10v11m7 0V4h10v19"
            fill="none"
            stroke="currentColor"
          />
          <path d="m72 18 8-7 6 3 6-9" fill="none" stroke="currentColor" />
        </>
      )
    case "notebook":
      return (
        <>
          <path
            d="M9 4h65v20H9zM17 4v20M24 10h42M24 15h54M24 20h35"
            fill="none"
            stroke="currentColor"
          />
          <path d="m80 20 10-10 3 3-10 10-5 1z" fill="none" stroke="currentColor" />
        </>
      )
    case "settings":
      return (
        <>
          <path d="M5 7h86M5 14h86M5 21h86" stroke="currentColor" strokeOpacity="0.45" />
          <circle cx="26" cy="7" r="4" fill="var(--background)" stroke="currentColor" />
          <circle cx="66" cy="14" r="4" fill="var(--background)" stroke="currentColor" />
          <circle cx="43" cy="21" r="4" fill="var(--background)" stroke="currentColor" />
        </>
      )
  }
}
