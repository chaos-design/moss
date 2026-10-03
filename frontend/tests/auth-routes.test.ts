import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getSupabaseServerClient: vi.fn(),
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}))

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}))

import { GET as handleAuthCallback } from "@/app/auth/callback/route"
import { proxy } from "@/proxy"

function createWorkspaceRequest(path = "/workspace/conversation?scene=coffee") {
  return new NextRequest(`https://moss.example${path}`)
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
  mocks.createServerClient.mockReset()
  mocks.getSupabaseServerClient.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("workspace authentication proxy", () => {
  it("allows the explicitly enabled local demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")

    const response = await proxy(createWorkspaceRequest())

    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(mocks.createServerClient).not.toHaveBeenCalled()
  })

  it("redirects to a configuration error while preserving the requested path", async () => {
    const response = await proxy(createWorkspaceRequest())
    const location = new URL(response.headers.get("location") ?? "")

    expect(response.status).toBe(307)
    expect(location.pathname).toBe("/login")
    expect(location.searchParams.get("error")).toBe("configuration")
    expect(location.searchParams.get("next")).toBe("/workspace/conversation?scene=coffee")
  })

  it("redirects unauthenticated users and allows authenticated users", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable")
    const getUser = vi
      .fn()
      .mockResolvedValueOnce({ data: { user: null }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null })
    mocks.createServerClient.mockReturnValue({ auth: { getUser } })

    const redirected = await proxy(createWorkspaceRequest("/workspace/review"))
    const allowed = await proxy(createWorkspaceRequest("/workspace/review"))

    expect(new URL(redirected.headers.get("location") ?? "").searchParams.get("next")).toBe(
      "/workspace/review",
    )
    expect(allowed.headers.get("x-middleware-next")).toBe("1")
  })
})

describe("Supabase auth callback", () => {
  it("exchanges a valid code and redirects only to the requested application path", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null })
    mocks.getSupabaseServerClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    })

    const response = await handleAuthCallback(
      new Request(
        "https://moss.example/auth/callback?code=valid-code&next=%2Fworkspace%2Freview%3Ffrom%3Demail",
      ),
    )

    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid-code")
    expect(response.headers.get("location")).toBe(
      "https://moss.example/workspace/review?from=email",
    )
  })

  it("rejects unsafe destinations and falls back to the workspace", async () => {
    mocks.getSupabaseServerClient.mockResolvedValue({
      auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
    })

    const response = await handleAuthCallback(
      new Request(
        "https://moss.example/auth/callback?code=valid-code&next=https%3A%2F%2Fevil.example",
      ),
    )

    expect(response.headers.get("location")).toBe("https://moss.example/workspace")
  })

  it.each([
    ["missing code", "https://moss.example/auth/callback"],
    ["missing Supabase client", "https://moss.example/auth/callback?code=valid-code"],
  ])("returns an actionable login error for %s", async (label, url) => {
    mocks.getSupabaseServerClient.mockResolvedValue(
      label === "missing Supabase client"
        ? null
        : { auth: { exchangeCodeForSession: vi.fn() } },
    )

    const response = await handleAuthCallback(new Request(url))

    expect(response.headers.get("location")).toBe("https://moss.example/login?error=callback")
  })

  it("returns to login when the authorization code exchange fails", async () => {
    mocks.getSupabaseServerClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          error: new Error("expired code"),
        }),
      },
    })

    const response = await handleAuthCallback(
      new Request("https://moss.example/auth/callback?code=expired"),
    )

    expect(response.headers.get("location")).toBe("https://moss.example/login?error=callback")
  })
})
