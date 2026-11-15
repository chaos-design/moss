// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import {
  readShadowingLevelFilter,
  shadowingLevelFilterStorageKey,
} from "@/lib/shadowing-local-state"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("readShadowingLevelFilter", () => {
  it("returns a stored valid filter (JSON-encoded, symmetric with writeJson)", () => {
    window.localStorage.setItem(shadowingLevelFilterStorageKey, JSON.stringify("B1"))
    expect(readShadowingLevelFilter()).toBe("B1")
  })

  it("falls back to 'all' when the stored value is not a known filter", () => {
    window.localStorage.setItem(shadowingLevelFilterStorageKey, JSON.stringify("zzz"))
    expect(readShadowingLevelFilter()).toBe("all")
  })

  it("falls back to 'all' when there is no stored value", () => {
    window.localStorage.removeItem(shadowingLevelFilterStorageKey)
    expect(readShadowingLevelFilter()).toBe("all")
  })

  it("falls back to 'all' when localStorage access throws (private mode / policy)", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError", "access denied")
    })
    expect(readShadowingLevelFilter()).toBe("all")
  })
})
