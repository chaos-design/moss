"use client"

import { EyeIcon, EyeOffIcon } from "lucide-react"
import type { ReactNode } from "react"
import { ExpressionText } from "@/components/expression-text"
import type { ExpressionLibraryItem } from "@/lib/expression-library-schema"
import { cn } from "@/lib/utils"

/**
 * 例句译文开关：按钮紧跟例句末尾，默认收起，点开才显示这一句的中文译文。
 * 文案、图标与可访问名称集中在这里，词库、学习、复习共用同一套交互。
 */
export function ExampleTranslationToggle({
  phrase,
  translation,
  revealed,
  onToggle,
}: {
  phrase: string
  translation: string
  revealed: boolean
  onToggle: () => void
}) {
  if (!translation) {
    return null
  }
  return (
    <>
      <button
        type="button"
        aria-expanded={revealed}
        aria-label={revealed ? `收起 ${phrase} 的例句译文` : `显示 ${phrase} 的例句译文`}
        className="ml-1 inline-flex items-center gap-0.5 rounded-sm px-1 align-middle font-sans text-[11px] font-normal text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToggle}
      >
        {revealed ? (
          <EyeOffIcon className="size-3" aria-hidden="true" />
        ) : (
          <EyeIcon className="size-3" aria-hidden="true" />
        )}
        {revealed ? "收起" : "译文"}
      </button>
      {revealed ? (
        <span className="mt-2 block font-sans text-xs leading-5 text-muted-foreground">
          {translation}
        </span>
      ) : null}
    </>
  )
}

/**
 * 学习卡里的例句：目标表达高亮，句尾可展开中文译文。
 *
 * 所有展示例句的玩法（闪卡、填空、听写结果、造句对照、快速学习）共用这一处，
 * 保证「点开译文」的位置和样式一致；`children` 用于填空这种句子中间带输入框的场景。
 */
export function ExpressionExample({
  item,
  revealed,
  onToggleTranslation,
  children,
  className,
  textClassName,
}: {
  item: Pick<ExpressionLibraryItem, "phrase" | "example" | "exampleTranslation">
  revealed: boolean
  onToggleTranslation: () => void
  children?: ReactNode
  className?: string
  textClassName?: string
}) {
  return (
    <div className={cn("grid gap-1", className)}>
      <blockquote
        className={cn(
          "border-l-2 border-primary/35 pl-3 font-serif text-xl leading-10",
          textClassName,
        )}
      >
        {children ?? <ExpressionText text={item.example} phrase={item.phrase} />}
        <ExampleTranslationToggle
          phrase={item.phrase}
          translation={item.exampleTranslation ?? ""}
          revealed={revealed}
          onToggle={onToggleTranslation}
        />
      </blockquote>
    </div>
  )
}
