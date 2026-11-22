import { splitExpressionHighlights } from "@/lib/expression-highlight"
import { cn } from "@/lib/utils"

/**
 * 例句正文：把目标表达标出来，其余文字保持原样。
 *
 * 参考样式：目标表达用主题蓝色加粗，并衬一层很淡的蓝色圆角底（`chart-4` 的 15% 透明度），
 * 让它在句子里一眼可辨；不用浏览器默认的黄底，浅色/深色主题都不刺眼。
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
            className="rounded-sm bg-chart-4/15 px-0.5 font-bold text-chart-4"
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
