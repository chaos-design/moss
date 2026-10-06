// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LearningMemoryProvider } from "@/components/learning-memory-provider"
import { setConversationPrefs } from "@/features/conversation/use-conversation-prefs"
import { SettingsForm } from "@/features/settings/settings-form"
import {
  conversationPrefsStorageKey,
  parseConversationPrefs,
  promptSupplementMaxLength,
} from "@/lib/conversation-prefs"
import { modelConfigStorageKey } from "@/lib/model-config"

const mocks = vi.hoisted(() => ({
  createModelConfigEnvelope: vi.fn(),
  resetModelConfigPublicKey: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock("@/lib/runtime-mode", () => ({
  isDemoMode: () => true,
}))

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => null,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}))

// AccountDataControls reads the shared auth status; these tests cover the settings form itself on
// the signed-in path, so the hook is stubbed instead of standing up Supabase.
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    accountLabel: "学习账户",
    requireSignIn: () => true,
  }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}))

vi.mock("@/lib/model-config-envelope", () => ({
  createModelConfigEnvelope: mocks.createModelConfigEnvelope,
  resetModelConfigPublicKey: mocks.resetModelConfigPublicKey,
}))

const storedConfigs = {
  version: 3,
  activeConfigId: "primary",
  configs: [
    {
      id: "primary",
      name: "Primary",
      provider: "openai",
      apiType: "chat-completions",
      endpoint: "https://api.openai.com/v1",
      model: "gpt-primary",
      apiKey: "primary-secret",
    },
    {
      id: "backup",
      name: "Backup",
      provider: "anthropic",
      apiType: "anthropic-messages",
      endpoint: "https://api.anthropic.com/v1",
      model: "claude-backup",
      apiKey: "backup-secret",
    },
  ],
}

beforeEach(() => {
  mocks.createModelConfigEnvelope.mockReset().mockResolvedValue({
    version: 1,
    keyId: "test-key",
    wrappedKey: "wrapped",
    iv: "iv",
    ciphertext: "ciphertext",
  })
  mocks.resetModelConfigPublicKey.mockReset()
  mocks.toastError.mockReset()
  mocks.toastInfo.mockReset()
  mocks.toastSuccess.mockReset()
  window.localStorage.clear()
  window.localStorage.setItem(modelConfigStorageKey, JSON.stringify(storedConfigs))
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
    "00000000-0000-4000-8000-000000000003",
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("settings model configs", () => {
  it("uses a multiline learning goal and exposes configurable conversation timing", () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    expect(screen.getByLabelText("你的目标").tagName).toBe("TEXTAREA")
    expect(screen.getByLabelText("会话续接时限（分钟）")).toBeTruthy()
    expect(screen.getByLabelText("连续提问合并等待（毫秒）")).toBeTruthy()
    expect(screen.getByLabelText("语音识别判句等待（毫秒）")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "模型与学习策略" })).toBeTruthy()
    expect(screen.getByText("模型服务")).toBeTruthy()
    expect(screen.getByText("学习策略")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "对话体验" })).toBeTruthy()
    expect(screen.getByText("系统发音")).toBeTruthy()
    expect(screen.getByLabelText("AI 角色音色")).toBeTruthy()
    expect(screen.getByText(/影子跟读主角色沿用此音色/)).toBeTruthy()
    expect(screen.getByRole("heading", { name: "账户与数据" })).toBeTruthy()
  })

  it("exposes an editable prompt supplement that persists only on save", () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    const field = screen.getByLabelText("补充指令") as HTMLTextAreaElement
    expect(field.value).toBe("")
    expect(field.getAttribute("maxlength")).toBe(String(promptSupplementMaxLength))

    // Typing alone must not reach the next inference request.
    fireEvent.change(field, { target: { value: "每轮都纠正我的语法错误" } })
    expect(
      parseConversationPrefs(window.localStorage.getItem(conversationPrefsStorageKey))
        .promptSupplement,
    ).toBe("")

    fireEvent.click(screen.getByRole("button", { name: "保存补充指令" }))
    expect(
      parseConversationPrefs(window.localStorage.getItem(conversationPrefsStorageKey))
        .promptSupplement,
    ).toBe("每轮都纠正我的语法错误")
  })

  it("clears a saved prompt supplement", () => {
    setConversationPrefs((current) => ({ ...current, promptSupplement: "只说一句" }))
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    expect((screen.getByLabelText("补充指令") as HTMLTextAreaElement).value).toBe("只说一句")
    fireEvent.click(screen.getByRole("button", { name: "清空" }))

    expect(
      parseConversationPrefs(window.localStorage.getItem(conversationPrefsStorageKey))
        .promptSupplement,
    ).toBe("")
  })

  it("shows multiple configs, switches the active one, and adds without replacing", async () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    expect(await screen.findAllByText("Primary")).toHaveLength(1)
    expect(screen.queryByText("AI 解析已开启")).toBeNull()
    expect(screen.queryByText("本地隐私边界")).toBeNull()
    expect(screen.getByText("Backup")).toBeTruthy()
    expect(screen.queryByLabelText("配置名称")).toBeNull()
    expect(screen.getByText("已启用")).toBeTruthy()
    expect(screen.queryByText("先停用")).toBeNull()
    expect(
      (screen.getByRole("button", { name: "删除 Primary" }) as HTMLButtonElement).disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "启用 Backup" }))
    expect(
      JSON.parse(window.localStorage.getItem(modelConfigStorageKey) ?? "{}"),
    ).toMatchObject({
      activeConfigId: "backup",
    })

    fireEvent.click(screen.getByRole("button", { name: "新增配置" }))
    fireEvent.change(screen.getByLabelText("配置名称"), {
      target: { value: "Fast model" },
    })
    fireEvent.change(screen.getByLabelText("接口地址"), {
      target: { value: "https://models.example.com/v1" },
    })
    fireEvent.change(screen.getByLabelText("模型"), {
      target: { value: "fast-model" },
    })
    fireEvent.change(screen.getByLabelText("API 密钥"), {
      target: { value: "fast-secret" },
    })
    fireEvent.click(screen.getByRole("button", { name: "添加配置" }))

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(modelConfigStorageKey) ?? "{}")
      expect(stored.configs).toHaveLength(3)
      expect(stored.configs[2]).toMatchObject({
        id: "00000000-0000-4000-8000-000000000003",
        name: "Fast model",
        model: "fast-model",
      })
      expect(stored.activeConfigId).toBe("backup")
    })
  })

  it("uses a styled model suggestion menu while keeping free text input", async () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "新增配置" }))
    const modelInput = screen.getByLabelText("模型") as HTMLInputElement

    fireEvent.change(modelInput, { target: { value: "custom-model" } })
    expect(modelInput.value).toBe("custom-model")

    fireEvent.click(screen.getByRole("button", { name: "选择常用模型" }))
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "qwen-plus" }))

    expect(modelInput.value).toBe("qwen-plus")
  })

  it("validates an already saved config without opening the editor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { valid: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    fireEvent.click(await screen.findByRole("button", { name: "验证 Primary" }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Primary 验证通过，重新验证" })).toBeTruthy()
    })
    expect(screen.queryByLabelText("配置名称")).toBeNull()
    expect(mocks.createModelConfigEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "primary-secret",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-primary",
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversation",
      expect.objectContaining({ method: "PUT" }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Primary 验证成功")
  })

  it("shows the provider error for a saved config and allows retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "模型服务连接验证失败。" } }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    fireEvent.click(await screen.findByRole("button", { name: "验证 Backup" }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Backup 验证失败，重新验证" })).toBeTruthy()
    })
    expect(mocks.toastError).toHaveBeenCalledWith("Backup 验证失败：模型服务连接验证失败。")
  })

  it("places conversation controls in non-overlapping grid cells on desktop", () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    const layoutCard = screen
      .getByText("调整练习转写的问答排列方式。")
      .closest('[data-slot="card"]')
    const inputCard = screen
      .getByText("设置文字练习时的发送快捷键。")
      .closest('[data-slot="card"]')
    const timingCard = screen
      .getByText("控制会话续接、多次提问合并和语音停顿判断。")
      .closest('[data-slot="card"]')
    const voiceCard = screen
      .getByText("统一设置 AI 对话与影子跟读使用的主角色音色。")
      .closest('[data-slot="card"]')
    const promptCard = screen
      .getByText("在系统 Prompt 之后追加你自己的要求，用于调整语气、纠错严格程度或练习重点。")
      .closest('[data-slot="card"]')

    // The prompt editor spans the full first row; the four compact cards pair up in the two rows
    // below it, so no two cards ever claim the same grid cell.
    expect(promptCard?.className).toContain("lg:col-span-2")
    expect(promptCard?.className).toContain("lg:row-start-1")
    expect(layoutCard?.className).toContain("lg:col-start-1")
    expect(layoutCard?.className).toContain("lg:row-start-2")
    expect(layoutCard?.className).toContain("order-2")
    expect(timingCard?.className).toContain("lg:col-start-2")
    expect(timingCard?.className).toContain("lg:row-start-2")
    expect(timingCard?.className).not.toContain("lg:row-span-2")
    expect(timingCard?.className).toContain("order-2")
    expect(inputCard?.className).toContain("lg:col-start-1")
    expect(inputCard?.className).toContain("lg:row-start-3")
    expect(inputCard?.className).toContain("order-3")
    expect(voiceCard?.className).toContain("lg:col-start-2")
    expect(voiceCard?.className).toContain("lg:row-start-3")
    expect(voiceCard?.className).toContain("order-4")
  })

  it("keeps model and agent cards at half width on desktop", () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    const modelCard = screen.getByText("模型服务").closest("form")
    const agentCard = screen.getByText("学习策略").closest('[data-slot="card"]')
    const sharedGrid = modelCard?.parentElement
    const accountCard = screen.getByText("账户数据").closest('[data-slot="card"]')

    expect(sharedGrid?.className).toContain("lg:grid-cols-2")
    expect(sharedGrid?.contains(agentCard ?? null)).toBe(true)
    expect(modelCard?.className).toContain("order-2")
    expect(agentCard?.className).toContain("order-1")
    expect(accountCard?.className).toContain("lg:max-w-[calc(50%_-_0.625rem)]")
  })

  it("lays out learning strategy fields vertically", () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    const fieldGroup = screen.getByLabelText("你的目标").closest('[data-slot="field-group"]')

    expect(fieldGroup?.className).toContain("gap-4")
    expect(fieldGroup?.className).not.toContain("grid-cols")
  })

  it("caps every settings card and scrolls overflowing content inside the card", () => {
    const { container } = render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    const cards = Array.from(container.querySelectorAll('[data-slot="card"]'))
    const cardContents = Array.from(container.querySelectorAll('[data-slot="card-content"]'))

    expect(cards).toHaveLength(9)
    expect(
      cards.every((card) => card.className.includes("max-h-[min(680px,calc(100svh-6rem))]")),
    ).toBe(true)
    expect(cardContents.every((content) => content.className.includes("overflow-y-auto"))).toBe(
      true,
    )
  })

  it("expands an existing inactive config and updates it in place", async () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    fireEvent.click(await screen.findByRole("button", { name: "编辑 Backup" }))
    expect((screen.getByLabelText("配置名称") as HTMLInputElement).value).toBe("Backup")

    fireEvent.change(screen.getByLabelText("配置名称"), {
      target: { value: "Backup updated" },
    })
    fireEvent.change(screen.getByLabelText("模型"), {
      target: { value: "claude-updated" },
    })
    fireEvent.click(screen.getByRole("button", { name: "更新配置" }))

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(modelConfigStorageKey) ?? "{}")
      expect(stored.configs).toHaveLength(2)
      expect(stored.configs[1]).toMatchObject({
        id: "backup",
        name: "Backup updated",
        model: "claude-updated",
      })
    })
    expect(screen.queryByLabelText("配置名称")).toBeNull()
  })

  it("requires an active config to be stopped before editing or deleting", async () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Primary 使用中，需先停用再编辑",
      }),
    )

    expect(screen.queryByLabelText("配置名称")).toBeNull()
    expect(
      (screen.getByRole("button", { name: "删除 Primary" }) as HTMLButtonElement).disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "停用 Primary" }))
    fireEvent.click(screen.getByRole("button", { name: "编辑 Primary" }))
    expect((screen.getByLabelText("配置名称") as HTMLInputElement).value).toBe("Primary")
  })
})
