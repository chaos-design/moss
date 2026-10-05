// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getAuthErrorMessage, LoginForm } from "@/features/auth/login-form"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}))

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
    },
  }),
}))

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED", "false")
  mocks.refresh.mockReset()
  mocks.replace.mockReset()
  mocks.signInWithOAuth.mockReset()
  mocks.signInWithPassword.mockReset()
  mocks.signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe("login form", () => {
  it("uses the local callback URL for email confirmation", async () => {
    render(<LoginForm nextPath="/workspace/conversation?scene=meeting" />)
    fireEvent.click(screen.getByRole("tab", { name: "创建账户" }))
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "learner@example.com" },
    })
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "long-password" },
    })
    fireEvent.click(screen.getByRole("button", { name: "创建账户" }))

    await waitFor(() => {
      expect(mocks.signUp).toHaveBeenCalledWith({
        email: "learner@example.com",
        password: "long-password",
        options: {
          emailRedirectTo:
            "http://localhost:3000/auth/callback?next=%2Fworkspace%2Fconversation%3Fscene%3Dmeeting",
        },
      })
    })
  })

  it("hides Google login unless the provider is enabled", () => {
    render(<LoginForm nextPath="/workspace" />)
    expect(screen.queryByRole("button", { name: "使用 Google 继续" })).toBeNull()
  })

  it("shows Google login when the provider is explicitly enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED", "true")
    render(<LoginForm nextPath="/workspace" />)
    expect(screen.getByRole("button", { name: /使用 Google 继续/ })).toBeTruthy()
  })

  it("shows a useful Supabase callback error", () => {
    render(<LoginForm initialError="callback" nextPath="/workspace" />)
    expect(screen.getByRole("alert").textContent).toContain("登录链接无效或已过期")
  })

  it("turns common Supabase auth errors into actionable messages", () => {
    expect(getAuthErrorMessage({ code: "invalid_credentials" })).toBe("邮箱或密码不正确")
    expect(getAuthErrorMessage({ code: "email_not_confirmed" })).toBe(
      "请先完成邮箱验证后再登录",
    )
  })

  it("links the consent sentence to the published legal documents", () => {
    render(<LoginForm nextPath="/workspace" />)
    expect(screen.getByText(/继续即表示你同意/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "服务条款" }).getAttribute("href")).toBe("/terms")
    expect(screen.getByRole("link", { name: "隐私政策" }).getAttribute("href")).toBe("/privacy")
  })
})
