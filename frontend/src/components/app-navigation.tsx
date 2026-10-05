"use client"

import { LoaderCircleIcon } from "lucide-react"
import Link, { useLinkStatus } from "next/link"
import { usePathname } from "next/navigation"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { navigationSections } from "@/lib/navigation-sections"
import { cn } from "@/lib/utils"

// `useLinkStatus` only reports inside a <Link>, so the indicator is a child of the anchor.
function NavigationPendingIndicator({ collapsed }: { collapsed: boolean }) {
  const { pending } = useLinkStatus()
  if (!pending || collapsed) {
    return null
  }

  return (
    <>
      <LoaderCircleIcon
        className="ml-auto size-3.5 shrink-0 animate-spin text-primary"
        aria-hidden="true"
      />
      <span className="sr-only">正在打开页面</span>
    </>
  )
}

export function AppNavigation({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname()

  return (
    <nav aria-label="学习空间导航" className="flex flex-col gap-5">
      {navigationSections.map((section) => (
        <section key={section.label} className="flex flex-col gap-1">
          <h2
            className={cn(
              "px-3 font-mono text-[10px] font-medium uppercase text-muted-foreground",
              collapsed && "sr-only",
            )}
          >
            {section.label}
          </h2>
          <div className="flex flex-col gap-0.5">
            {section.items.map(({ href, label, icon: Icon }) => {
              const active =
                href === "/workspace"
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`)
              const link = (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
                    active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-[18px] shrink-0 text-muted-foreground transition-colors group-hover:text-foreground",
                      active && "text-primary",
                    )}
                  />
                  <span className={cn("truncate", collapsed && "sr-only")}>{label}</span>
                  {active && !collapsed ? (
                    <span className="ml-auto size-1.5 rounded-full bg-primary" />
                  ) : null}
                  <NavigationPendingIndicator collapsed={collapsed} />
                </Link>
              )

              return collapsed ? (
                <Tooltip key={href}>
                  <TooltipTrigger render={link} />
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              )
            })}
          </div>
        </section>
      ))}
    </nav>
  )
}
