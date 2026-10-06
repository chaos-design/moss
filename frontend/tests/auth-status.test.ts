import { describe, expect, it } from "vitest"
import {
  canOfferSignIn,
  getLocalOnlySuffix,
  getSignInPrompt,
  getSyncBlockedReason,
  isSignedIn,
  resolveBaseAuthStatus,
} from "@/lib/auth-status"

describe("auth status", () => {
  it("resolves the base status before any Supabase round-trip", () => {
    expect(resolveBaseAuthStatus({ demoMode: true, configured: true })).toBe("demo")
    expect(resolveBaseAuthStatus({ demoMode: false, configured: true })).toBe("loading")
    expect(resolveBaseAuthStatus({ demoMode: false, configured: false })).toBe("unconfigured")
  })

  it("treats only the authenticated status as signed in", () => {
    for (const status of ["loading", "anonymous", "unconfigured", "demo"] as const) {
      expect(isSignedIn(status)).toBe(false)
    }
    expect(isSignedIn("authenticated")).toBe(true)
  })

  it("offers sign-in only to an anonymous learner", () => {
    for (const status of ["loading", "authenticated", "unconfigured", "demo"] as const) {
      expect(canOfferSignIn(status)).toBe(false)
    }
    expect(canOfferSignIn("anonymous")).toBe(true)
  })

  it("explains a blocked action without offering a dead-end sign-in", () => {
    expect(getSignInPrompt("导出账户数据", "anonymous")).toBe(
      "导出账户数据需要登录后才会同步到云端。",
    )
    expect(getSignInPrompt("删除账户", "demo")).toBe(
      "本地演示模式不会同步到云端，删除账户目前只在本机生效。",
    )
    expect(getSignInPrompt("导出账户数据", "unconfigured")).toBe(
      "云端功能尚未配置，导出账户数据目前只在本机生效。",
    )
    expect(getSignInPrompt("导出账户数据", "loading")).toBe(
      "正在确认登录状态，导出账户数据稍后重试。",
    )
    expect(getSignInPrompt("导出账户数据", "authenticated")).toBe("")
  })

  it("appends a local-only suffix only when the account explains the skipped sync", () => {
    expect(getLocalOnlySuffix("loading")).toBe("")
    expect(getLocalOnlySuffix("authenticated")).toBe("")
    expect(getLocalOnlySuffix("anonymous")).toBe("登录后会自动同步到云端。")
    expect(getLocalOnlySuffix("demo")).toBe("本地演示模式不会同步到云端。")
  })

  it("prefers the account state over the sync transport state when it adds information", () => {
    expect(getSyncBlockedReason("loading")).toBeNull()
    expect(getSyncBlockedReason("authenticated")).toBeNull()
    expect(getSyncBlockedReason("anonymous")).toBe("登录后自动跨设备同步学习记忆")
    expect(getSyncBlockedReason("unconfigured")).toBe("云端功能尚未配置，学习记忆仅保存在本机")
  })
})
