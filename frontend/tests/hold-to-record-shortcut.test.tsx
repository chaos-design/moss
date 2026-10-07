// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useHoldToRecordShortcut } from "@/features/shadowing/use-hold-to-record-shortcut"

const onStart = vi.fn()
const onStop = vi.fn()

function Harness({ disabled = false }: { disabled?: boolean }) {
  useHoldToRecordShortcut({ disabled, onStart, onStop })
  return (
    <div>
      <button type="button">开始录音</button>
      <input aria-label="自由文本" />
    </div>
  )
}

function press(code = "Space") {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code, key: " ", bubbles: true, cancelable: true }),
    )
  })
}

function release(code = "Space") {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keyup", { code, key: " ", bubbles: true, cancelable: true }),
    )
  })
}

beforeEach(() => {
  onStart.mockReset()
  onStop.mockReset()
})

afterEach(cleanup)

describe("hold Space to record", () => {
  it("starts on keydown and stops on keyup of the same key", () => {
    render(<Harness />)

    press()
    expect(onStart).toHaveBeenCalledOnce()
    expect(onStop).not.toHaveBeenCalled()

    release()
    expect(onStop).toHaveBeenCalledOnce()
  })

  it("starts only once while the key is held down", () => {
    // Browsers repeat keydown for as long as a key is held. Restarting the recorder on each repeat
    // would truncate every take to a fraction of a second.
    render(<Harness />)

    press()
    press()
    press()

    expect(onStart).toHaveBeenCalledOnce()
    expect(onStop).not.toHaveBeenCalled()
  })

  it("does not stop on a keyup for a key this shortcut never took", () => {
    render(<Harness />)

    release()

    expect(onStop).not.toHaveBeenCalled()
  })

  it("stops the take when the window loses focus mid-press", () => {
    // The keyup for a key released outside the window never reaches this document, so without this
    // the capture could only be ended by the on-screen button.
    render(<Harness />)

    press()
    act(() => {
      window.dispatchEvent(new Event("blur"))
    })

    expect(onStop).toHaveBeenCalledOnce()

    release()
    expect(onStop).toHaveBeenCalledOnce()
  })

  it("stops the take when the tab is hidden mid-press", () => {
    render(<Harness />)

    press()
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })

    expect(onStop).toHaveBeenCalledOnce()
  })

  it("does not fire while a text field has focus, so space still types", () => {
    render(<Harness />)
    const field = screen.getByLabelText("自由文本")
    field.focus()

    act(() => {
      field.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          key: " ",
          bubbles: true,
          cancelable: true,
        }),
      )
    })

    expect(onStart).not.toHaveBeenCalled()
  })

  it("does not fire from a focused button, so space still activates it", () => {
    render(<Harness />)
    const button = screen.getByRole("button", { name: "开始录音" })
    button.focus()

    act(() => {
      button.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          key: " ",
          bubbles: true,
          cancelable: true,
        }),
      )
    })

    expect(onStart).not.toHaveBeenCalled()
  })

  it("stays silent while disabled", () => {
    render(<Harness disabled />)

    press()

    expect(onStart).not.toHaveBeenCalled()
  })

  it("ignores keys other than Space", () => {
    render(<Harness />)

    press("KeyM")
    release("KeyM")

    expect(onStart).not.toHaveBeenCalled()
    expect(onStop).not.toHaveBeenCalled()
  })

  it("ignores Space during an IME composition", () => {
    render(<Harness />)

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          key: " ",
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      )
    })

    expect(onStart).not.toHaveBeenCalled()
  })
})
