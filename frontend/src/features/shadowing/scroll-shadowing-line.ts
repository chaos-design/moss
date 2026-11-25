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

/**
 * Centers one scripted line in the shadowing transcript viewport.
 *
 * The listen stage plays the whole dialogue back, so the learner follows the TTS with their
 * eyes: each new line lands in the middle of the visible area instead of merely being
 * revealed. Unlike the minimum-reveal helper, this one re-centers on every call — that is
 * the point of playback following.
 *
 * A line taller than the viewport is top-aligned instead: centering would bury the opening
 * words, and the only readable order for a long line is from its top.
 */
export function scrollShadowingLineToCenter(
  container: HTMLElement,
  lineId: string,
  options: { smooth?: boolean } = {},
) {
  const line = Array.from(
    container.querySelectorAll<HTMLElement>("[data-shadowing-line]"),
  ).find((item) => item.dataset.shadowingLine === lineId)
  if (!line) {
    return
  }

  const containerBox = container.getBoundingClientRect()
  const lineBox = line.getBoundingClientRect()
  const delta =
    lineBox.height > containerBox.height
      ? lineBox.top - containerBox.top
      : lineBox.top - containerBox.top - (containerBox.height - lineBox.height) / 2
  const target = Math.max(0, container.scrollTop + delta)

  // Smooth scrolling chains naturally across consecutive lines of a whole-dialogue playback;
  // the instant assignment is the test/fallback path (jsdom does not implement scrollTo).
  if (options.smooth && typeof container.scrollTo === "function") {
    container.scrollTo({ top: target, behavior: "smooth" })
  } else {
    container.scrollTop = target
  }
}
