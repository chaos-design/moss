// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getAuthErrorMessage, LoginForm } from "@/features/auth/login-form"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  locationReplace: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}))

// jsdom 在 vitest 里允许重新定义 window.location；把它换成可观测的替身，
// 用于断言登录跳转不会触发整页重载（同时提供 origin 给 callbackUrl 使用）。
const originalLocation = Object.getOwnPropertyDescriptor(window, "location")

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
  mocks.locationReplace.mockReset()
  mocks.signInWithOAuth.mockReset()
  mocks.signInWithPassword.mockReset()
  mocks.signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null })
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      origin: "http://localhost:3000",
      href: "http://localhost:3000/login",
      pathname: "/login",
      replace: mocks.locationReplace,
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  if (originalLocation) {
    Object.defineProperty(window, "location", originalLocation)
  }
})

describe("login form", () => {
  function agreeToTerms() {
    fireEvent.click(screen.getByRole("checkbox", { name: "同意服务条款与隐私政策" }))
  }

  function fillCredentials() {
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "learner@example.com" },
    })
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "long-password" },
    })
  }

  it("uses the local callback URL for email confirmation", async () => {
    render(<LoginForm nextPath="/workspace/conversation?scene=meeting" />)
    fireEvent.click(screen.getByRole("tab", { name: "创建账户" }))
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "learner@example.com" },
    })
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "long-password" },
    })
    agreeToTerms()
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

  it("enters the workspace after a successful sign-in without reloading the current page", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: { user: { id: "u1", email: "learner@example.com" } } },
      error: null,
    })
    render(<LoginForm nextPath="/workspace" />)
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "learner@example.com" },
    })
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "long-password" },
    })
    agreeToTerms()
    fireEvent.click(screen.getByRole("button", { name: "进入学习空间" }))

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/workspace")
    })
    // 回归断言：用客户端软导航进入目标页，不整页重载，也不追加 refresh()。
    expect(mocks.locationReplace).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("keeps the pre-filled credentials from the built-in browser and still enters the workspace", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: { user: { id: "u1", email: "learner@example.com" } } },
      error: null,
    })
    render(<LoginForm nextPath="/workspace/conversation?scene=meeting" />)

    // 复现内置浏览器场景：账号密码由浏览器预填（autofill）直接写入 DOM value，
    // 不派发 change 事件。凭证必须原样提交，且不能被清空或要求重新输入。
    const email = screen.getByLabelText("邮箱") as HTMLInputElement
    const password = screen.getByLabelText("密码") as HTMLInputElement
    email.value = "learner@example.com"
    password.value = "long-password"
    agreeToTerms()
    fireEvent.click(screen.getByRole("button", { name: "进入学习空间" }))

    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: "learner@example.com",
        password: "long-password",
      })
      expect(mocks.replace).toHaveBeenCalledWith("/workspace/conversation?scene=meeting")
    })
    expect(email.value).toBe("learner@example.com")
    expect(password.value).toBe("long-password")
    expect(mocks.locationReplace).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("does not navigate when sign-in fails", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "invalid_credentials" },
    })
    render(<LoginForm nextPath="/workspace" />)
    fillCredentials()
    agreeToTerms()
    fireEvent.click(screen.getByRole("button", { name: "进入学习空间" }))

    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1)
    })
    expect(mocks.locationReplace).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("does not navigate when no session was established", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { session: null }, error: null })
    render(<LoginForm nextPath="/workspace" />)
    fillCredentials()
    agreeToTerms()
    fireEvent.click(screen.getByRole("button", { name: "进入学习空间" }))

    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1)
    })
    expect(mocks.locationReplace).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("falls back to the workspace when the post-login target is the login page itself", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
      error: null,
    })
    render(<LoginForm nextPath="/login" />)
    fillCredentials()
    agreeToTerms()
    fireEvent.click(screen.getByRole("button", { name: "进入学习空间" }))

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/workspace")
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

  it("links the consent checkbox to the published legal documents", () => {
    render(<LoginForm nextPath="/workspace" />)
    expect(screen.getByRole("checkbox", { name: "同意服务条款与隐私政策" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "服务条款" }).getAttribute("href")).toBe("/terms")
    expect(screen.getByRole("link", { name: "隐私政策" }).getAttribute("href")).toBe("/privacy")
  })

  it("keeps login and register disabled until the terms are accepted", () => {
    render(<LoginForm nextPath="/workspace" />)

    const loginButton = screen.getByRole("button", { name: "进入学习空间" })
    expect((loginButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole("tab", { name: "创建账户" }))
    const registerButton = screen.getByRole("button", { name: "创建账户" })
    expect((registerButton as HTMLButtonElement).disabled).toBe(true)

    agreeToTerms()
    expect(
      (screen.getByRole("button", { name: "创建账户" }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it("keeps Google login disabled until the terms are accepted", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED", "true")
    render(<LoginForm nextPath="/workspace" />)

    const googleButton = screen.getByRole("button", { name: /使用 Google 继续/ })
    expect((googleButton as HTMLButtonElement).disabled).toBe(true)

    agreeToTerms()
    expect(
      (screen.getByRole("button", { name: /使用 Google 继续/ }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
})
