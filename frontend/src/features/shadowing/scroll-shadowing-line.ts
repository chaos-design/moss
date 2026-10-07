/**
 * Brings one scripted line into view inside the shadowing transcript.
 *
 * The container is scrolled only when the line is actually out of view, and only by the distance
 * needed to reveal it. Jumping to center every turn would yank the transcript away from its
 * neighbours and make the dialogue feel like it is sliding under the learner instead of being
 * followed, which is the opposite of what an auto-follow is for.
 */
export function scrollShadowingLineIntoView(container: HTMLElement, lineId: string) {
  const line = Array.from(
    container.querySelectorAll<HTMLElement>("[data-shadowing-line]"),
  ).find((item) => item.dataset.shadowingLine === lineId)
  if (!line) {
    return
  }

  const scrollPadding = 16
  const containerBox = container.getBoundingClientRect()
  const lineBox = line.getBoundingClientRect()
  const hiddenAbove = containerBox.top + scrollPadding - lineBox.top
  const hiddenBelow = lineBox.bottom - (containerBox.bottom - scrollPadding)

  // A line taller than the viewport is out of view by definition and gets its top aligned, which
  // is the only reading order a learner can follow.
  if (hiddenAbove > 0 && lineBox.height > containerBox.height) {
    container.scrollTop += hiddenAbove
    return
  }
  if (hiddenAbove > 0) {
    container.scrollTop -= hiddenAbove
    return
  }
  if (hiddenBelow > 0) {
    container.scrollTop += hiddenBelow
  }
}
