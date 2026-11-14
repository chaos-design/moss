import { splitExpressionHighlights } from "@/lib/expression-highlight"
import { cn } from "@/lib/utils"

/**
 * 例句正文：把目标表达标出来，其余文字保持原样。
 *
 * 高亮使用 `mark` 的语义，但颜色跟随主题的 primary，避免浏览器默认的黄底在深色主题里刺眼。
 */
export function ExpressionText({
  text,
  phrase,
  className,
}: {
  text: string
  phrase: string
  className?: string
}) {
  const segments = splitExpressionHighlights(text, phrase)
  return (
    <span className={cn("min-w-0", className)}>
      {segments.map((segment, index) =>
        segment.highlighted ? (
          <mark
            key={`${index}-${segment.text}`}
            className="rounded-[3px] bg-primary/15 px-0.5 font-semibold text-inherit"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={`${index}-${segment.text}`}>{segment.text}</span>
        ),
      )}
    </span>
  )
}
