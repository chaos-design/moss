import { describe, expect, it } from "vitest"
import {
  abortedMessage,
  describeHttpStatus,
  describeUserError,
  isAbortError,
  isUserFacingCopy,
  isUserFacingError,
  networkFailureMessage,
  parseFailureMessage,
  toUserFacingError,
  UserFacingError,
} from "@/lib/user-error"

describe("user-error", () => {
  it("keeps curated Chinese copy from the server envelope", () => {
    expect(describeUserError(new Error("AI 服务暂时不可用，请稍后重试。"), "fallback")).toBe(
      "AI 服务暂时不可用，请稍后重试。",
    )
  })

  it("replaces raw browser fetch failures", () => {
    expect(describeUserError(new TypeError("Failed to fetch"), "fallback")).toBe(
      networkFailureMessage,
    )
    expect(describeUserError(new TypeError("Load failed"), "fallback")).toBe(
      networkFailureMessage,
    )
  })

  it("replaces unparseable response bodies instead of surfacing SyntaxError", () => {
    const error = new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON")
    expect(describeUserError(error, "fallback")).toBe(parseFailureMessage)
  })

  it("replaces upstream English copy embedded in an otherwise Chinese message", () => {
    expect(
      describeUserError(new Error("AI 服务暂时不可用：AI provider returned 400"), "fallback"),
    ).toBe("fallback")
    expect(describeUserError(new Error("请求失败 HTTP 500"), "fallback")).toBe("fallback")
    expect(
      describeUserError(
        new Error("同步失败：JSON object requested, multiple rows returned"),
        "fallback",
      ),
    ).toBe("fallback")
  })

  it("still trusts short copy that legitimately carries a product name", () => {
    expect(describeUserError(new Error("AI 服务暂时不可用，请稍后重试。"), "fallback")).toBe(
      "AI 服务暂时不可用，请稍后重试。",
    )
    expect(
      describeUserError(new Error("Backup 验证失败：模型服务连接验证失败。"), "fallback"),
    ).toBe("Backup 验证失败：模型服务连接验证失败。")
    expect(describeUserError(new Error("TTS 服务返回了无效音频"), "fallback")).toBe(
      "TTS 服务返回了无效音频",
    )
  })

  it("derives copy from an HTTP status carried on the thrown value", () => {
    expect(describeUserError({ status: 401 }, "fallback")).toBe("登录状态已失效，请重新登录。")
    expect(describeUserError({ status: 429 }, "fallback")).toBe("操作过于频繁，请稍后重试。")
    expect(describeUserError({ status: 503 }, "fallback")).toBe("服务暂时不可用，请稍后重试。")
    expect(describeUserError({ status: 418 }, "fallback")).toBe("fallback")
  })

  it("prefers an explicit status option over message sniffing", () => {
    expect(describeUserError(new Error("boom"), "fallback", { status: 502 })).toBe(
      "服务暂时不可用，请稍后重试。",
    )
  })

  it("passes already normalized errors through unchanged", () => {
    const original = new UserFacingError("网络连接失败，请检查网络后重试。", { status: 503 })
    expect(toUserFacingError(original, "fallback")).toBe(original)
    expect(isUserFacingError(original)).toBe(true)
  })

  it("falls back for unrecognized throwables that are not Error instances", () => {
    expect(describeUserError(undefined, "fallback")).toBe("fallback")
    expect(describeUserError(null, "fallback")).toBe("fallback")
    expect(describeUserError({ code: 42 }, "fallback")).toBe("fallback")
    expect(describeUserError({}, "fallback")).toBe("fallback")
  })

  it("classifies copy so shared primitives can reject technical text", () => {
    expect(isUserFacingCopy("邮箱或密码不正确")).toBe(true)
    expect(isUserFacingCopy("AI provider returned 400")).toBe(false)
    expect(isUserFacingCopy("请求失败 [object Object]")).toBe(false)
    expect(isUserFacingCopy("失败 undefined")).toBe(false)
    expect(isUserFacingCopy("TypeError: x")).toBe(false)
    expect(isUserFacingCopy("")).toBe(false)
    expect(isUserFacingCopy(undefined)).toBe(false)
  })

  it("treats aborts as control flow rather than failures", () => {
    const abort = new DOMException("The user aborted a request.", "AbortError")
    expect(isAbortError(abort)).toBe(true)
    expect(isAbortError({ name: "AbortError" })).toBe(true)
    expect(isAbortError(new Error("boom"))).toBe(false)
    expect(abortedMessage).toBe("请求已取消。")
  })

  it("maps statuses to copy and keeps the caller fallback for unmapped ones", () => {
    expect(describeHttpStatus(400, "fallback")).toBe("请求内容有误，请检查后重试。")
    expect(describeHttpStatus(599, "fallback")).toBe("服务暂时不可用，请稍后重试。")
    expect(describeHttpStatus(418, "fallback")).toBe("fallback")
    expect(describeHttpStatus(200, "fallback")).toBe("fallback")
    expect(describeHttpStatus(null, "fallback")).toBe("fallback")
  })
})
