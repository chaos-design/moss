// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AccountDataControls } from "@/features/settings/account-data-controls"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

// The account gates live behind AuthProvider; these tests cover the signed-in export and deletion
// flows, so the hook is stubbed onto the authenticated path.
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    accountLabel: "学习账户",
    requireSignIn: () => true,
  }),
}))

beforeEach(() => {
  mocks.refresh.mockReset()
  mocks.replace.mockReset()
  mocks.toastError.mockReset()
  mocks.toastSuccess.mockReset()
  window.localStorage.clear()
  vi.stubGlobal("fetch", vi.fn())
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:account-export"),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("account data controls", () => {
  it("downloads the authenticated account export", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ version: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    render(<AccountDataControls />)

    fireEvent.click(screen.getByRole("button", { name: "导出 JSON" }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/account", { cache: "no-store" })
      expect(mocks.toastSuccess).toHaveBeenCalledWith("账户数据已导出")
    })
  })

  it("requires confirmation and clears only Moss local data after deletion", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: { auditId: "audit-1", deleted: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    window.localStorage.setItem("moss:learning-memory:v1", "{}")
    window.localStorage.setItem("other-app", "keep")
    render(<AccountDataControls />)

    fireEvent.click(screen.getByRole("button", { name: "删除账户" }))
    const confirmButton = screen.getByRole("button", { name: "确认永久删除" })
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText("当前账户邮箱"), {
      target: { value: "learner@example.com" },
    })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/account",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ confirmation: "learner@example.com" }),
        }),
      )
      expect(mocks.replace).toHaveBeenCalledWith("/login?deleted=true")
    })
    expect(window.localStorage.getItem("moss:learning-memory:v1")).toBeNull()
    expect(window.localStorage.getItem("other-app")).toBe("keep")
  })

  it("keeps local data when deletion is rejected", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "confirmation_mismatch", message: "邮箱不匹配" },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    )
    window.localStorage.setItem("moss:learning-memory:v1", "{}")
    render(<AccountDataControls />)

    fireEvent.click(screen.getByRole("button", { name: "删除账户" }))
    fireEvent.change(screen.getByLabelText("当前账户邮箱"), {
      target: { value: "wrong@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "确认永久删除" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("邮箱不匹配")
    })
    expect(window.localStorage.getItem("moss:learning-memory:v1")).toBe("{}")
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
