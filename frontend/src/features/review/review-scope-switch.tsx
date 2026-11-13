"use client"

import {
  type ReviewScope,
  reviewScopeDescriptions,
  reviewScopeLabels,
  reviewScopes,
} from "@/lib/memory"
import { cn } from "@/lib/utils"

/**
 * 复习范围切换。三个选项共用一份队列，切换时由上层重置当前题号与已评条目，
 * 因此这里只上报选择，不持有任何复习状态。
 */
export function ReviewScopeSwitch({
  scope,
  onChange,
}: {
  scope: ReviewScope
  onChange: (scope: ReviewScope) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="shrink-0 font-mono text-[10px] font-semibold uppercase text-muted-foreground">
          复习范围
        </span>
        <fieldset className="flex min-w-0 gap-1 rounded-md border bg-background p-0.5">
          <legend className="sr-only">复习范围</legend>
          {reviewScopes.map((value) => {
            const active = scope === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                className={cn(
                  "rounded-sm px-2 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onChange(value)}
              >
                {reviewScopeLabels[value]}
              </button>
            )
          })}
        </fieldset>
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">
        {reviewScopeDescriptions[scope]}
      </p>
    </div>
  )
}
