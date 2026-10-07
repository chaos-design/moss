// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LearningMemoryProvider } from "@/components/learning-memory-provider"
import { setConversationPrefs } from "@/features/conversation/use-conversation-prefs"
import { SettingsForm } from "@/features/settings/settings-form"
import {
  conversationPrefsStorageKey,
  conversationPromptMaxLength,
  parseConversationPrefs,
} from "@/lib/conversation-prefs"
import { defaultConversationPrompt } from "@/lib/memory/conversation-prompt-text"
import { modelConfigStorageKey } from "@/lib/model-config"

const mocks = vi.hoisted(() => ({
  createModelConfigEnvelope: vi.fn(),
  renderCounts: { speechService: 0 },
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

// Counts how often an unrelated card renders. The conversation-experience cards hold their drafts
// locally, so typing in one of them must not drag the rest of this page through React again — that
// re-render fan-out, not the input itself, is what pushed interaction latency over budget.
vi.mock("@/features/settings/speech-service-card", () => ({
  SpeechServiceCard: () => {
    mocks.renderCounts.speechService += 1
    return <div data-testid="speech-service-card" />
  },
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
  mocks.renderCounts.speechService = 0
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
    expect(screen.getByText("对话方式")).toBeTruthy()
    expect(screen.getByText("系统发音")).toBeTruthy()
    expect(screen.getByLabelText("AI 角色音色")).toBeTruthy()
    expect(screen.getByText(/影子跟读主角色沿用此音色/)).toBeTruthy()
    expect(screen.getByRole("heading", { name: "账户与数据" })).toBeTruthy()
  })

  it("shows the whole prompt actually in effect and persists edits only on save", () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    const field = screen.getByLabelText("系统 Prompt（当前生效）") as HTMLTextAreaElement
    // The editor opens on the full text that will be sent, output contract included, rather than an
    // empty box that hides what it does.
    expect(field.value).toBe(defaultConversationPrompt)
    expect(field.value).toContain("## Output Contract")
    expect(field.getAttribute("maxlength")).toBe(String(conversationPromptMaxLength))
    expect(screen.getByText("使用内置")).toBeTruthy()

    // Typing alone must not reach the next inference request.
    fireEvent.change(field, { target: { value: "只用一句短回复" } })
    expect(
      parseConversationPrefs(window.localStorage.getItem(conversationPrefsStorageKey))
        .conversationPrompt,
    ).toBe("")

    fireEvent.click(screen.getByRole("button", { name: "保存 Prompt" }))
    expect(
      parseConversationPrefs(window.localStorage.getItem(conversationPrefsStorageKey))
        .conversationPrompt,
    ).toBe("只用一句短回复")
    expect(screen.getByText("已自定义")).toBeTruthy()
  })

  it("lets the learner remove the output contract, and warns instead of blocking", () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    expect(screen.queryByTestId("contract-warning")).toBeNull()
    const field = screen.getByLabelText("系统 Prompt（当前生效）")

    fireEvent.change(field, { target: { value: "你是口语陪练，只回一句话。" } })

    // The prompt is entirely the learner's, so this is allowed. What must not happen is a silent
    // degradation, so the consequence is stated before it is saved.
    const warning = document.querySelector("[data-contract-warning]")
    expect(warning?.textContent).toContain("## Output Contract")

    fireEvent.click(screen.getByRole("button", { name: "保存 Prompt" }))
    expect(
      parseConversationPrefs(window.localStorage.getItem(conversationPrefsStorageKey))
        .conversationPrompt,
    ).toBe("你是口语陪练，只回一句话。")
  })

  it("restores the built-in prompt", () => {
    setConversationPrefs((current) => ({ ...current, conversationPrompt: "只说一句" }))
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    expect(
      (screen.getByLabelText("系统 Prompt（当前生效）") as HTMLTextAreaElement).value,
    ).toBe("只说一句")

    fireEvent.click(screen.getByRole("button", { name: "恢复内置" }))

    expect(
      parseConversationPrefs(window.localStorage.getItem(conversationPrefsStorageKey))
        .conversationPrompt,
    ).toBe("")
    expect(
      (screen.getByLabelText("系统 Prompt（当前生效）") as HTMLTextAreaElement).value,
    ).toBe(defaultConversationPrompt)
    expect(screen.getByText("使用内置")).toBeTruthy()
  })

  it("keeps typing out of the render path of unrelated cards", () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    const speechCardRenders = mocks.renderCounts.speechService
    expect(speechCardRenders).toBeGreaterThan(0)

    // The prompt editor is the largest interactive field on the page. Every keystroke that re-renders
    // the model-config cards and their selects with it is interaction latency the learner pays for
    // each character typed.
    const promptField = screen.getByLabelText("系统 Prompt（当前生效）")
    for (const value of ["只说一句", "只说一句短回复", "只说一句简短回复"]) {
      fireEvent.change(promptField, { target: { value } })
    }
    expect(mocks.renderCounts.speechService).toBe(speechCardRenders)

    // Same rule for the timing numbers, which used to write the shared store on each keystroke.
    const timingField = screen.getByLabelText("会话续接时限（分钟）")
    for (const value of ["1", "12", "120"]) {
      fireEvent.change(timingField, { target: { value } })
    }
    expect(mocks.renderCounts.speechService).toBe(speechCardRenders)
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

    const promptCard = screen.getByText(/可整段改写/).closest('[data-slot="card"]')
    const waysCard = screen
      .getByText("调整练习转写的问答排列方式与发送快捷键。")
      .closest('[data-slot="card"]')
    const timingCard = screen
      .getByText("控制会话续接、多次提问合并和语音停顿判断。")
      .closest('[data-slot="card"]')
    const voiceCard = screen
      .getByText("统一设置 AI 对话与影子跟读使用的主角色音色。")
      .closest('[data-slot="card"]')

    // The prompt editor spans the full first row because it carries two long text regions. The
    // three compact cards below occupy row 2 columns 1 and 2 plus a full-width row 3, so no two
    // cards ever claim the same grid cell and nothing stretches to fill a taller neighbour.
    expect(promptCard?.className).toContain("lg:col-span-2")
    expect(promptCard?.className).toContain("lg:row-start-1")
    expect(waysCard?.className).toContain("lg:col-start-1")
    expect(waysCard?.className).toContain("lg:row-start-2")
    expect(waysCard?.className).toContain("order-2")
    expect(waysCard?.className).not.toContain("lg:col-span-2")
    expect(voiceCard?.className).toContain("lg:col-start-2")
    expect(voiceCard?.className).toContain("lg:row-start-2")
    expect(voiceCard?.className).toContain("order-3")
    expect(timingCard?.className).toContain("lg:col-span-2")
    expect(timingCard?.className).toContain("lg:col-start-1")
    expect(timingCard?.className).toContain("lg:row-start-3")
    expect(timingCard?.className).toContain("order-4")

    const grid = promptCard?.parentElement
    // `items-start` is what keeps a short card from being stretched into a tall empty block.
    expect(grid?.className).toContain("items-start")
  })

  it("packs the two dialogue controls into one card and the timing fields into one row", () => {
    render(
      <LearningMemoryProvider>
        <SettingsForm />
      </LearningMemoryProvider>,
    )

    const waysCard = screen
      .getByText("调整练习转写的问答排列方式与发送快捷键。")
      .closest('[data-slot="card"]')
    const timingGroup = screen
      .getByLabelText("会话续接时限（分钟）")
      .closest('[data-slot="field-group"]')

    expect(waysCard?.querySelector("#transcript-layout")).toBeTruthy()
    expect(waysCard?.querySelector("#send-shortcut")).toBeTruthy()

    // Three numeric timing fields read as one row across the full-width card instead of a tall
    // column that left the neighbouring half of the grid empty.
    expect(timingGroup?.className).toContain("lg:grid-cols-3")
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

    // Model service, learning strategy, prompt, dialogue ways, voice, timing, and account data. The
    // speech-service card renders a bare div in this suite, so it contributes no card here.
    expect(cards).toHaveLength(7)
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
