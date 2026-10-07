"use client"

import { useEffect, useRef } from "react"

/**
 * Hold Space to record, release to stop.
 *
 * Shadowing is a rhythm exercise, and the click-to-start / click-to-stop pair interrupts it with a
 * pointer round trip in the middle of a spoken line. Press-and-hold matches the physical gesture
 * people already use for push-to-talk, and keeps the stop on the same key, so a learner never has to
 * look at the screen to end a take.
 *
 * Three things this deliberately does not do:
 *
 * - It does not fire while a text field or another control has focus. Space types a space, activates
 *   a focused button, and pages down in some readers; overriding those would break the surrounding
 *   page to serve one shortcut.
 * - It does not fire while an IME composition is open, matching `shouldSendOnKey`.
 * - It never leaves the microphone open. `window.blur` and `visibilitychange` both stop the take,
 *   because the keyup for a key released outside the window never reaches this document and an
 *   always-on capture is the kind of thing that only gets noticed later, by a user.
 */
export function useHoldToRecordShortcut({
  disabled,
  onStart,
  onStop,
}: {
  disabled: boolean
  onStart: () => void
  onStop: () => void
}) {
  // Refs, not dependencies: this effect must attach exactly once. Re-subscribing on every callback
  // identity change would drop a held key and leave the recorder running with no way to stop it.
  const onStartRef = useRef(onStart)
  const onStopRef = useRef(onStop)
  onStartRef.current = onStart
  onStopRef.current = onStop
  const holdingRef = useRef(false)

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false
      }
      return (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.tagName === "BUTTON" ||
        target.tagName === "A"
      )
    }

    function releaseHold() {
      if (!holdingRef.current) {
        return
      }
      holdingRef.current = false
      onStopRef.current()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || event.isComposing) {
        return
      }
      if (holdingRef.current) {
        // The browser repeats keydown while held; without this, holding Space would restart the
        // recorder every few hundred milliseconds.
        event.preventDefault()
        return
      }
      if (disabled || isEditableTarget(event.target)) {
        return
      }
      event.preventDefault()
      holdingRef.current = true
      onStartRef.current()
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== "Space") {
        return
      }
      if (!holdingRef.current) {
        return
      }
      event.preventDefault()
      releaseHold()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", releaseHold)
    document.addEventListener("visibilitychange", releaseHold)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", releaseHold)
      document.removeEventListener("visibilitychange", releaseHold)
      holdingRef.current = false
    }
  }, [disabled])
}
