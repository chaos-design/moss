"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * 分批呈现长列表：首批只渲染 `initial` 条，底部哨兵进入视口后再追加 `step` 条。
 *
 * 列表数据可能上千条（记忆、句子、词库），一次性挂载会拖慢首屏与筛选响应。这里只负责
 * 渲染窗口，不改变数据顺序；筛选条件变化时调用 `reset()` 回到首批。
 */
export function useIncrementalList({
  total,
  initial = 12,
  step = 12,
}: {
  total: number
  initial?: number
  step?: number
}) {
  const [visibleCount, setVisibleCount] = useState(initial)
  // 哨兵节点存进 state（ref callback）而不是 ref：筛选切换时若总数相同、用户未滚动，
  // [step, total, visibleCount] 都不变，只靠 ref 读一次会挂在旧节点上，新哨兵永不触发。
  // 节点身份进入依赖后，重挂载的新哨兵会重新挂 observer。
  const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null)
  const sentinelRefCallback = useCallback((node: HTMLDivElement | null) => {
    setSentinelNode(node)
  }, [])

  // 数据变少（例如切换筛选）时收敛渲染窗口，避免停在旧的更大的值上。
  useEffect(() => {
    setVisibleCount((current) => Math.min(Math.max(current, initial), Math.max(total, initial)))
  }, [initial, total])

  useEffect(() => {
    if (!sentinelNode || visibleCount >= total || typeof IntersectionObserver === "undefined") {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisibleCount((current) => Math.min(current + step, total))
        }
      },
      { rootMargin: "360px 0px" },
    )
    observer.observe(sentinelNode)
    return () => observer.disconnect()
  }, [step, total, visibleCount, sentinelNode])

  return {
    reset: () => setVisibleCount(initial),
    sentinelRef: sentinelRefCallback,
    visibleCount: Math.min(visibleCount, total),
  }
}
