// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest"
import {
  scrollShadowingLineIntoView,
  scrollShadowingLineToCenter,
} from "@/features/shadowing/scroll-shadowing-line"

const scrollPadding = 16

function makeContainer() {
  const container = document.createElement("div")
  for (const id of ["line-1", "line-2", "line-3"]) {
    const line = document.createElement("div")
    line.dataset.shadowingLine = id
    container.append(line)
  }
  document.body.append(container)
  return container
}

/** Places the viewport at `top` and each line at `lineTop`, with a 40px line height. */
function layout(container: HTMLElement, viewportTop: number, lineTops: number[]) {
  container.getBoundingClientRect = () =>
    ({ top: viewportTop, bottom: viewportTop + 200, height: 200 }) as DOMRect
  const lines = container.querySelectorAll<HTMLElement>("[data-shadowing-line]")
  lines.forEach((line, index) => {
    line.getBoundingClientRect = () =>
      ({
        top: lineTops[index] ?? 0,
        bottom: (lineTops[index] ?? 0) + 40,
        height: 40,
      }) as DOMRect
  })
}

describe("scrollShadowingLineIntoView", () => {
  it("does nothing when the line is already visible", () => {
    // Auto-follow should never fight the learner's own reading position on a line they can see.
    const container = makeContainer()
    layout(container, 0, [20, 100, 180])
    container.scrollTop = 40

    scrollShadowingLineIntoView(container, "line-2")

    expect(container.scrollTop).toBe(40)
  })

  it("scrolls down just enough to reveal a line below the viewport", () => {
    const container = makeContainer()
    // line-2 ends at 260 while the padded viewport ends at 184, so 76px is the shortfall.
    layout(container, 0, [20, 220, 400])

    scrollShadowingLineIntoView(container, "line-2")

    expect(container.scrollTop).toBe(76)
  })

  it("scrolls up just enough to reveal a line above the viewport", () => {
    const container = makeContainer()
    // line-1 starts 24px above the viewport, which is 40px short of the padded top edge.
    layout(container, 0, [-24, 100, 180])
    container.scrollTop = 100

    scrollShadowingLineIntoView(container, "line-1")

    expect(container.scrollTop).toBe(60)
  })

  it("aligns the top of a line taller than the viewport", () => {
    const container = makeContainer()
    container.getBoundingClientRect = () => ({ top: 0, bottom: 200, height: 200 }) as DOMRect
    const tall = container.querySelector<HTMLElement>('[data-shadowing-line="line-2"]')
    expect(tall).toBeTruthy()
    if (!tall) {
      return
    }
    tall.getBoundingClientRect = () => ({ top: -60, bottom: 340, height: 400 }) as DOMRect

    // Center would bury the opening words of a long line; the only readable order is from its top.
    scrollShadowingLineIntoView(container, "line-2")

    expect(container.scrollTop).toBe(scrollPadding - -60)
  })

  it("ignores a line that is not in the transcript", () => {
    const container = makeContainer()
    layout(container, 0, [20, 100, 180])
    container.scrollTop = 12

    scrollShadowingLineIntoView(container, "line-404")

    expect(container.scrollTop).toBe(12)
  })

  it("reveals a line using the container's own scroll offset as the reference frame", () => {
    const container = makeContainer()
    // The viewport is itself scrolled down 300px inside the page, so measuring against window
    // coordinates instead of the container's box would scroll by the wrong distance.
    layout(container, 300, [320, 500, 600])
    container.scrollTop = 0

    scrollShadowingLineIntoView(container, "line-3")

    expect(container.scrollTop).toBe(600 + 40 - (300 + 200 - scrollPadding))
  })
})

describe("scrollShadowingLineToCenter", () => {
  it("centers a line in the viewport", () => {
    const container = makeContainer()
    // line-2 sits at 220 with a 40px height; the 200px viewport wants its center (240) at 100.
    layout(container, 0, [20, 220, 400])
    container.scrollTop = 0

    scrollShadowingLineToCenter(container, "line-2")

    expect(container.scrollTop).toBe(140)
  })

  it("scrolls smoothly when requested and leaves the instant path untouched", () => {
    const container = makeContainer()
    layout(container, 0, [20, 220, 400])
    container.scrollTop = 0
    const scrollTo = vi.fn()
    container.scrollTo = scrollTo

    scrollShadowingLineToCenter(container, "line-2", { smooth: true })

    expect(scrollTo).toHaveBeenCalledWith({ top: 140, behavior: "smooth" })
    expect(container.scrollTop).toBe(0)
  })

  it("top-aligns a line taller than the viewport instead of centering it", () => {
    const container = makeContainer()
    container.getBoundingClientRect = () => ({ top: 0, bottom: 200, height: 200 }) as DOMRect
    const tall = container.querySelector<HTMLElement>('[data-shadowing-line="line-2"]')
    expect(tall).toBeTruthy()
    if (!tall) {
      return
    }
    tall.getBoundingClientRect = () => ({ top: -60, bottom: 340, height: 400 }) as DOMRect
    container.scrollTop = 100

    // Centering would bury the opening words; the only readable order is from its top.
    scrollShadowingLineToCenter(container, "line-2")

    expect(container.scrollTop).toBe(40)
  })

  it("clamps the target at zero when the line is already above the top", () => {
    const container = makeContainer()
    layout(container, 0, [20, 220, 400])
    container.scrollTop = 20

    // Centering line-1 (top 20) would scroll to -60, which the viewport cannot do.
    scrollShadowingLineToCenter(container, "line-1")

    expect(container.scrollTop).toBe(0)
  })

  it("ignores a line that is not in the transcript", () => {
    const container = makeContainer()
    layout(container, 0, [20, 100, 180])
    container.scrollTop = 12

    scrollShadowingLineToCenter(container, "line-404")

    expect(container.scrollTop).toBe(12)
  })
})
