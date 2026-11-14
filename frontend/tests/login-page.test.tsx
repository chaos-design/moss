// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import LoginPage from "@/app/login/page"

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  redirect: mocks.redirect,
}))

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser, getSession: mocks.getSession },
  })),
}))

beforeEach(() => {
  mocks.redirect.mockReset()
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: null } })
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: null } })
})

afterEach(cleanup)

describe("login page legal entry points", () => {
  it("exposes both legal documents as a labelled navigation region", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }))

    const nav = screen.getByRole("navigation", { name: "法律文档" })
    expect(within(nav).getByRole("link", { name: "服务条款" }).getAttribute("href")).toBe(
      "/terms",
    )
    expect(within(nav).getByRole("link", { name: "隐私政策" }).getAttribute("href")).toBe(
      "/privacy",
    )
  })
})

describe("login page recovery of an existing session", () => {
  it("forwards an already signed-in learner to the requested target", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } })

    await LoginPage({
      searchParams: Promise.resolve({ next: "/workspace/conversation?scene=meeting" }),
    })

    // 复现内置浏览器「账号密码已预填、登录已成功但没跳转」的状态：
    // 凭证与会话都不需要重新提交，服务端直接把已登录态送回目标页。
    expect(mocks.redirect).toHaveBeenCalledWith("/workspace/conversation?scene=meeting")
  })

  it("defaults to the workspace when no target was requested", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } })

    await LoginPage({ searchParams: Promise.resolve({}) })

    expect(mocks.redirect).toHaveBeenCalledWith("/workspace")
  })

  it("never redirects a signed-in learner back to the login page", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } })

    await LoginPage({ searchParams: Promise.resolve({ next: "/login" }) })

    expect(mocks.redirect).toHaveBeenCalledWith("/workspace")
    expect(mocks.redirect).not.toHaveBeenCalledWith("/login")
  })

  it("keeps the login form for anonymous visitors", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ next: "/workspace" }) }))

    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "进入学习空间" })).toBeTruthy()
  })

  it("keeps the callback error visible instead of redirecting away", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } })

    render(
      await LoginPage({
        searchParams: Promise.resolve({ error: "callback", next: "/workspace" }),
      }),
    )

    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toContain("登录链接无效或已过期")
  })

  it("still renders the login form when the auth lookup fails", async () => {
    mocks.getUser.mockRejectedValue(new Error("auth service unavailable"))

    render(await LoginPage({ searchParams: Promise.resolve({ next: "/workspace" }) }))

    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "进入学习空间" })).toBeTruthy()
  })

  it("recovers a local session when the server cannot reach Supabase Auth", async () => {
    // 与 proxy 使用同一套判定，避免 /login 与 /workspace 结论不一致造成来回重定向（刷新）。
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", status: 0, message: "fetch failed" },
    })
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } })

    await LoginPage({ searchParams: Promise.resolve({ next: "/workspace/review" }) })

    expect(mocks.redirect).toHaveBeenCalledWith("/workspace/review")
  })

  it("does not redirect signed-in visitors in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } })

    try {
      render(await LoginPage({ searchParams: Promise.resolve({ next: "/workspace" }) }))
      expect(mocks.redirect).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
