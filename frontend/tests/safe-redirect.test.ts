import { describe, expect, it } from "vitest"
import { getSafeRedirectPath } from "@/lib/safe-redirect"

describe("getSafeRedirectPath", () => {
  it("keeps valid application paths", () => {
    expect(getSafeRedirectPath("/workspace/review?from=login#today")).toBe(
      "/workspace/review?from=login#today",
    )
  })

  it.each([
    null,
    "",
    "workspace",
    "//evil.example/path",
    "/\\evil.example/path",
    "/workspace\nLocation: https://evil.example",
  ])("falls back for unsafe redirect value %s", (value) => {
    expect(getSafeRedirectPath(value)).toBe("/workspace")
  })
})
