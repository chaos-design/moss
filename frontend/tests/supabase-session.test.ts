import { beforeEach, describe, expect, it, vi } from "vitest"
import { hasUsableSession, resolveSessionUser } from "@/lib/supabase/session"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
}))

function authClient() {
  return {
    auth: { getUser: mocks.getUser, getSession: mocks.getSession },
  } as unknown as Parameters<typeof hasUsableSession>[0]
}

const networkFailure = {
  name: "AuthRetryableFetchError",
  status: 0,
  message: "fetch failed",
}

beforeEach(() => {
  mocks.getUser.mockReset()
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: null } })
})

describe("resolveSessionUser", () => {
  it("returns the online user id when Supabase Auth is reachable", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })

    expect(await resolveSessionUser(authClient())).toEqual({ id: "u1" })
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it("falls back to the cookie session only on network failures", async () => {
    mocks.getUser.mockRejectedValue(networkFailure)
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "u2" } } } })

    expect(await resolveSessionUser(authClient())).toEqual({ id: "u2" })
  })

  it("returns null when the credential is rejected without falling back", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 401, message: "invalid credentials" },
    })
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "u2" } } } })

    expect(await resolveSessionUser(authClient())).toBeNull()
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it("returns null when the cookie fallback also fails", async () => {
    mocks.getUser.mockRejectedValue(networkFailure)
    mocks.getSession.mockRejectedValue(new Error("still unreachable"))

    expect(await resolveSessionUser(authClient())).toBeNull()
  })
})

describe("hasUsableSession", () => {
  it("keeps the strict online check when Supabase Auth is reachable", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })

    expect(await hasUsableSession(authClient())).toBe(true)
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it("treats a missing session as anonymous without any fallback", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", status: 400, message: "Auth session missing!" },
    })

    expect(await hasUsableSession(authClient())).toBe(false)
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it("does not downgrade rejected credentials", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", status: 401, message: "invalid claim" },
    })
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } })

    expect(await hasUsableSession(authClient())).toBe(false)
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it("falls back to the local cookie when the auth server is unreachable", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: networkFailure })
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } })

    expect(await hasUsableSession(authClient())).toBe(true)
    expect(mocks.getSession).toHaveBeenCalledTimes(1)
  })

  it("still blocks an anonymous visitor when the auth server is unreachable", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: networkFailure })

    expect(await hasUsableSession(authClient())).toBe(false)
  })

  it("handles a thrown network error the same way", async () => {
    mocks.getUser.mockRejectedValue(Object.assign(new Error("fetch failed"), networkFailure))
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } })

    expect(await hasUsableSession(authClient())).toBe(true)
  })

  it("does not downgrade unrelated errors", async () => {
    mocks.getUser.mockRejectedValue(new Error("unexpected auth bug"))
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } })

    expect(await hasUsableSession(authClient())).toBe(false)
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it("fails closed when the local session lookup also fails", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: networkFailure })
    mocks.getSession.mockRejectedValue(new Error("storage unavailable"))

    expect(await hasUsableSession(authClient())).toBe(false)
  })
})
