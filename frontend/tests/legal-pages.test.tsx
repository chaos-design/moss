// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import PrivacyPolicyPage from "@/app/privacy/page"
import TermsPage from "@/app/terms/page"

afterEach(cleanup)

describe("legal pages", () => {
  it("cross-links both documents from the header and footer of each page", () => {
    render(<PrivacyPolicyPage />)
    expect(screen.getByRole("heading", { level: 1, name: "隐私政策" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "返回登录" }).getAttribute("href")).toBe("/login")

    const footerNav = screen.getByRole("navigation", { name: "法律文档" })
    expect(within(footerNav).getByRole("link", { name: "服务条款" }).getAttribute("href")).toBe(
      "/terms",
    )
    expect(within(footerNav).getByRole("link", { name: "隐私政策" }).getAttribute("href")).toBe(
      "/privacy",
    )

    // 正文里的互链与页脚链接指向同一路由，但必须各自可达。
    const bodyLinks = screen.getAllByRole("link", { name: "服务条款" })
    expect(bodyLinks.length).toBeGreaterThan(1)
    for (const link of bodyLinks) {
      expect(link.getAttribute("href")).toBe("/terms")
    }
  })

  it("discloses the real processors and data locations in the privacy policy", () => {
    render(<PrivacyPolicyPage />)

    // 数据流向必须与代码一致：Supabase、AI 提供方、浏览器内的模型配置、不落盘的原始音频。
    expect(screen.getByText(/身份与数据库服务（Supabase）/)).toBeTruthy()
    expect(screen.getAllByText(/AI 推理提供方/).length).toBeGreaterThan(0)
    expect(screen.getByText(/moss:model-config:v1/)).toBeTruthy()
    expect(screen.getByText(/我们不保存原始麦克风音频/)).toBeTruthy()
    expect(screen.getAllByText(/向量表示/).length).toBeGreaterThan(0)
    expect(screen.getByText(/如果你在设置中配置了自己的模型端点与密钥/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "[联系邮箱]" }).getAttribute("href")).toBe(
      "mailto:[联系邮箱]",
    )
  })

  it("separates the hosted service from self-hosted deployment in the terms", () => {
    render(<TermsPage />)
    expect(screen.getByRole("heading", { level: 1, name: "服务条款" })).toBeTruthy()
    expect(screen.getAllByText(/Apache-2.0/).length).toBeGreaterThan(0)
    expect(screen.getByText(/自行部署的实例不属于本条款范围/)).toBeTruthy()
    expect(screen.getByText(/不构成专业意见/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "[联系邮箱]" }).getAttribute("href")).toBe(
      "mailto:[联系邮箱]",
    )
  })

  it("numbers every section so both documents stay auditable", () => {
    const terms = render(<TermsPage />)
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(10)
    expect(screen.getByRole("heading", { level: 2, name: "3. 账号责任" })).toBeTruthy()
    terms.unmount()

    render(<PrivacyPolicyPage />)
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(11)
    expect(screen.getByRole("heading", { level: 2, name: "7. 你的权利" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "11. 联系我们" })).toBeTruthy()
  })
})
