// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useIncrementalList } from "@/components/use-incremental-list"

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed: Node | null = null
  constructor(
    private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void,
  ) {
    FakeIntersectionObserver.instances.push(this)
  }

  observe(node: Node) {
    this.observed = node
  }

  disconnect() {
    this.observed = null
  }

  trigger() {
    this.callback([{ isIntersecting: true }])
  }
}

function Probe({ total, sentinelKey }: { total: number; sentinelKey: string }) {
  // 同一 hook 实例；仅哨兵 div 的 key 变化会替换其 DOM 节点。
  const { sentinelRef, visibleCount } = useIncrementalList({ total, initial: 12, step: 12 })
  return (
    <div>
      <span data-testid="visible">{visibleCount}</span>
      <div key={sentinelKey} ref={sentinelRef} data-testid="sentinel" />
    </div>
  )
}

beforeEach(() => {
  FakeIntersectionObserver.instances = []
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("useIncrementalList", () => {
  it("re-observes the sentinel when its node is replaced with the same total", () => {
    // 总数不变、用户未滚动（visibleCount 保持 12），仅哨兵节点换了一份 DOM：
    // 旧的 ref-only 实现不会重挂 observer，列表会停在「已显示 12 / N 条」。
    const { rerender } = render(<Probe total={48} sentinelKey="a" />)
    const nodeA = screen.getByTestId("sentinel")
    const observerA = FakeIntersectionObserver.instances.at(-1)
    expect(observerA?.observed).toBe(nodeA)

    // 同一组件树里换一份新哨兵（sentinelKey 变化 → div 重挂载），总数仍是 48。
    act(() => {
      rerender(<Probe total={48} sentinelKey="b" />)
    })
    const nodeB = screen.getByTestId("sentinel")
    const observerB = FakeIntersectionObserver.instances.at(-1)
    expect(nodeB).not.toBe(nodeA)
    // 新的 observer 挂在新节点上（而不是旧 observer 仍指向 nodeA）。
    expect(observerB?.observed).toBe(nodeB)

    act(() => {
      observerB?.trigger()
    })
    expect(screen.getByTestId("visible").textContent).toBe("24")
  })

  it("advances in pages while the sentinel stays visible", () => {
    render(<Probe total={60} sentinelKey="a" />)
    const observer = FakeIntersectionObserver.instances.at(-1)
    act(() => {
      observer?.trigger()
    })
    expect(screen.getByTestId("visible").textContent).toBe("24")
    act(() => {
      FakeIntersectionObserver.instances.at(-1)?.trigger()
    })
    expect(screen.getByTestId("visible").textContent).toBe("36")
  })
})
