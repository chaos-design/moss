import { splitExpressionHighlights } from "@/lib/expression-highlight"
import { cn } from "@/lib/utils"

/**
 * 例句正文：把目标表达标出来，其余文字保持原样。
 *
 * 高亮使用 `mark` 的语义，但以主题蓝色加粗呈现，不用浏览器默认的黄底，避免深色主题刺眼。
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
            className="bg-transparent px-0 font-bold text-chart-4"
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
