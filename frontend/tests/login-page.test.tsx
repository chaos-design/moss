// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import LoginPage from "@/app/login/page"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}))

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
