// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LearningMemoryProvider } from "@/components/learning-memory-provider"
import {
  ConversationGuideAside,
  ConversationGuideSheet,
  getConversationFocusPhrases,
} from "@/features/conversation/conversation-guide"
import type { ConversationMessage } from "@/features/conversation/conversation-machine"
import {
  ConversationSettingsPopover,
  ConversationWorkspace,
  ExpressionValidationFeedback,
  scrollLatestTranscriptTurn,
  TranscriptTurn,
  VoiceCallPanel,
} from "@/features/conversation/conversation-workspace"
import { asrEngineOptions } from "@/lib/asr-config"
import type { StoredConversationMessage } from "@/lib/conversation-history"
import { getConversationScene } from "@/lib/conversation-scenes"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}))

// TranscriptTurn consults the shared auth status before requesting a translation; these tests cover
// the transcript itself, so the hook is stubbed onto the signed-in path.
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    accountLabel: "学习账户",
    requireSignIn: () => true,
  }),
}))

afterEach(cleanup)
beforeEach(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    setPointerCapture: { configurable: true, value: vi.fn() },
  })
})

describe("conversation feedback UI", () => {
  it("scrolls the latest question or answer into the transcript viewport", () => {
    const transcript = document.createElement("div")
    const firstTurn = document.createElement("article")
    const latestTurn = document.createElement("article")
    firstTurn.dataset.transcriptTurn = "first"
    latestTurn.dataset.transcriptTurn = "latest"
    transcript.append(firstTurn, latestTurn)
    transcript.scrollTop = 240
    transcript.getBoundingClientRect = vi.fn(() => ({ top: 100 }) as DOMRect)
    latestTurn.getBoundingClientRect = vi.fn(() => ({ top: 460 }) as DOMRect)

    scrollLatestTranscriptTurn(transcript)

    expect(transcript.scrollTop).toBe(584)
  })

  it("does not scroll backward when the latest turn is already near the top edge", () => {
    const transcript = document.createElement("div")
    const latestTurn = document.createElement("article")
    latestTurn.dataset.transcriptTurn = "latest"
    transcript.append(latestTurn)
    transcript.scrollTop = 240
    transcript.getBoundingClientRect = vi.fn(() => ({ top: 100 }) as DOMRect)
    latestTurn.getBoundingClientRect = vi.fn(() => ({ top: 108 }) as DOMRect)

    scrollLatestTranscriptTurn(transcript)

    expect(transcript.scrollTop).toBe(240)
  })

  it("keeps the settings label visible and changes the controlled tutor mode", () => {
    const onTutorModeSelect = vi.fn()
    render(
      <ConversationSettingsPopover
        apiVoice=""
        asrOptions={asrEngineOptions}
        asrTransport="local"
        ttsTransport="local"
        onApiVoiceChange={vi.fn()}
        onAsrTransportSelect={vi.fn()}
        onTtsTransportSelect={vi.fn()}
        disabled={false}
        onAsrSelect={vi.fn()}
        onTutorModeSelect={onTutorModeSelect}
        onVoicePreview={vi.fn()}
        onVoiceSelect={vi.fn()}
        previewingVoice={null}
        selectedAsrEngine="sensevoice"
        selectedTutorMode="natural"
        selectedVoice="test-voice"
        voiceOptions={[
          {
            value: "test-voice",
            label: "Test voice",
            name: "Test voice",
            language: "English",
            quality: "Local",
          },
        ]}
      />,
    )

    const button = screen.getByRole("button", { name: "打开对话设置" })

    expect(button.textContent).toContain("设置")
    expect(button.querySelector(".lucide-settings")).toBeTruthy()

    fireEvent.click(button)
    expect(screen.getByRole("combobox", { name: "选择导师模式" }).textContent).toContain(
      "自然交流",
    )
    fireEvent.click(screen.getByRole("combobox", { name: "选择导师模式" }))
    const englishOption = screen.getByRole("option", { name: "沉浸英语" })
    fireEvent.pointerDown(englishOption)
    fireEvent.pointerUp(englishOption)
    fireEvent.click(englishOption)
    expect(onTutorModeSelect).toHaveBeenCalledWith("english")
  })

  it("places retry on a separate row aligned with the message side", () => {
    const onRetry = vi.fn()
    const assistantError: ConversationMessage = {
      id: "assistant-error",
      role: "assistant",
      content: "AI 服务暂时不可用。",
      translation: "",
      note: "",
      timestamp: "00:04",
      transient: true,
      variant: "error",
    }
    const view = render(
      <TranscriptTurn
        layout="split"
        message={assistantError}
        onRetry={onRetry}
        onSpeak={vi.fn()}
        partnerName="Mia"
      />,
    )

    let retryButton = screen.getByRole("button", { name: "重试" })
    expect(retryButton.closest("[data-error-message]")).toBeNull()
    // A one-line failure must hug its copy, not stretch the whole grid track.
    const errorActionClasses = retryButton
      .closest("[data-error-actions]")
      ?.className.split(/\s+/)
    expect(errorActionClasses).toContain("items-center")
    expect(errorActionClasses).not.toContain("w-full")
    const errorRegionClasses = retryButton
      .closest("[data-error-actions]")
      ?.parentElement?.className.split(/\s+/)
    expect(errorRegionClasses).toContain("w-fit")
    expect(errorRegionClasses).toContain("max-w-full")
    expect(errorRegionClasses).not.toContain("w-full")

    view.rerender(
      <TranscriptTurn
        layout="split"
        message={{ ...assistantError, id: "user-error", role: "user", inputMode: "text" }}
        onRetry={onRetry}
        onSpeak={vi.fn()}
        partnerName="Mia"
      />,
    )

    retryButton = screen.getByRole("button", { name: "重试" })
    expect(retryButton.closest("[data-error-actions]")?.className).toContain("justify-end")
    fireEvent.click(retryButton)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("deletes a recognized learner turn without a bordered button", () => {
    const onDelete = vi.fn()
    render(
      <TranscriptTurn
        layout="split"
        message={{
          id: "user-voice",
          role: "user",
          content: "I wants to book a table",
          translation: "",
          note: "",
          timestamp: "00:12",
          inputMode: "voice",
        }}
        onDelete={onDelete}
        onRetry={vi.fn()}
        onSpeak={vi.fn()}
        partnerName="Mia"
      />,
    )

    // A bordered action is what this change removes. `ghost` contributes no border or background
    // of its own, and `outline` would contribute `border-border`, so assert on those tokens
    // rather than on the variant name — `cva` resolves the variant into utility classes.
    const classes = screen
      .getByRole("button", { name: "删除这条识别消息" })
      .className.split(/\s+/)
    expect(classes).not.toContain("border-border")
    expect(classes).not.toContain("bg-background")
    expect(classes).toContain("hover:bg-muted")

    fireEvent.click(screen.getByRole("button", { name: "删除这条识别消息" }))
    expect(onDelete).toHaveBeenCalledWith("user-voice")
  })

  it("offers no delete action on a partner reply", () => {
    render(
      <TranscriptTurn
        layout="split"
        message={{
          id: "assistant-ok",
          role: "assistant",
          content: "Certainly, for when?",
          translation: "",
          note: "",
          timestamp: "00:13",
        }}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
        onSpeak={vi.fn()}
        partnerName="Mia"
      />,
    )

    expect(screen.queryByRole("button", { name: "删除这条识别消息" })).toBeNull()
    expect(screen.queryByRole("button", { name: "删除这条错误消息" })).toBeNull()
  })

  it("renders an error-turn delete action as a borderless button", () => {
    const onDelete = vi.fn()
    render(
      <TranscriptTurn
        layout="split"
        message={{
          id: "assistant-error",
          role: "assistant",
          content: "AI 服务暂时不可用。",
          translation: "",
          note: "",
          timestamp: "00:04",
          transient: true,
          variant: "error",
        }}
        onDelete={onDelete}
        onRetry={vi.fn()}
        onSpeak={vi.fn()}
        partnerName="Mia"
      />,
    )

    for (const name of ["重试", "删除这条错误消息"]) {
      const classes = screen.getByRole("button", { name }).className.split(/\s+/)
      expect(classes).not.toContain("border-border")
      expect(classes).not.toContain("bg-background")
      expect(classes).toContain("hover:bg-muted")
    }

    fireEvent.click(screen.getByRole("button", { name: "删除这条错误消息" }))
    expect(onDelete).toHaveBeenCalledWith("assistant-error")
  })

  it("keeps the composer readable as an enabled field", () => {
    const scene = getConversationScene("cafe-order")
    render(
      <LearningMemoryProvider>
        <ConversationWorkspace restoreLastScene={false} scene={scene} />
      </LearningMemoryProvider>,
    )

    const textarea = screen.getByRole("textbox", { name: "输入对话内容" })
    expect((textarea as HTMLTextAreaElement).disabled).toBe(false)

    // The composer InputGroup is the textbox's parent element. Every primitive dimming rule is
    // opted out: the send button being disabled with an empty draft is a fact about that one
    // control, not about the field.
    const composer = textarea.closest("[data-slot='input-group']")
    expect(composer).not.toBeNull()
    const composerClasses = composer?.className.split(/\s+/) ?? []
    expect(composerClasses).toContain("bg-transparent")
    expect(composerClasses).toContain("dark:bg-transparent")
    expect(composerClasses).toContain("has-disabled:opacity-100")
    expect(composerClasses).toContain("has-disabled:bg-transparent")
    expect(composerClasses).toContain("dark:has-disabled:bg-transparent")
    expect(composerClasses).not.toContain("has-disabled:opacity-50")
    expect(composerClasses).not.toContain("has-disabled:bg-input/50")
  })

  it("gives the transcript its own breathing room below the session metrics bar", () => {
    const scene = getConversationScene("cafe-order")
    render(
      <LearningMemoryProvider>
        <ConversationWorkspace restoreLastScene={false} scene={scene} />
      </LearningMemoryProvider>,
    )

    // The log is the only scroll region without vertical padding, so without pt-* the first turn
    // touches the metrics bar above it. Both regions carry the same horizontal padding so the
    // transcript does not read as narrower than the column it belongs to.
    const transcript = screen.getByRole("log", { name: "实时对话内容" })
    const transcriptClasses = transcript.className.split(/\s+/)
    const metricsClasses = transcript.previousElementSibling?.className.split(/\s+/) ?? []
    expect(transcriptClasses).toContain("pt-5")
    expect(transcriptClasses).toContain("md:pt-6")
    for (const padding of ["px-5", "md:px-8"]) {
      expect(transcriptClasses).toContain(padding)
      expect(metricsClasses).toContain(padding)
    }
    expect(transcriptClasses).not.toContain("py-5")
  })

  it("labels an English-only recall hint as learning support", () => {
    render(
      <TranscriptTurn
        layout="stacked"
        message={{
          id: "assistant-english-support",
          role: "assistant",
          content: "Would you like it hot or iced?",
          translation: "",
          note: "Recall Could I get...? and reuse it in this turn.",
          timestamp: "00:04",
        }}
        onRetry={vi.fn()}
        onSpeak={vi.fn()}
        partnerName="Mia"
      />,
    )

    expect(screen.getByText("学习辅助")).toBeTruthy()
    expect(screen.queryByText("中文辅助")).toBeNull()
  })

  it("keeps the settings popover available while locking live voice controls", () => {
    render(
      <ConversationSettingsPopover
        apiVoice=""
        asrOptions={asrEngineOptions}
        asrTransport="local"
        ttsTransport="local"
        onApiVoiceChange={vi.fn()}
        onAsrTransportSelect={vi.fn()}
        onTtsTransportSelect={vi.fn()}
        disabled
        onAsrSelect={vi.fn()}
        onTutorModeSelect={vi.fn()}
        onVoicePreview={vi.fn()}
        onVoiceSelect={vi.fn()}
        previewingVoice={null}
        selectedAsrEngine="sensevoice"
        selectedTutorMode="coach"
        selectedVoice="test-voice"
        voiceOptions={[
          {
            value: "test-voice",
            label: "Test voice",
            name: "Test voice",
            language: "English",
            quality: "Local",
          },
        ]}
      />,
    )

    const trigger = screen.getByRole("button", { name: "打开对话设置" })
    expect((trigger as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(trigger)
    expect(
      (screen.getByRole("combobox", { name: "选择导师模式" }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole("button", { name: "选择语音引擎与音色" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it("keeps ASR option details on one aligned row", () => {
    render(
      <ConversationSettingsPopover
        apiVoice=""
        asrOptions={asrEngineOptions}
        asrTransport="local"
        ttsTransport="local"
        onApiVoiceChange={vi.fn()}
        onAsrTransportSelect={vi.fn()}
        onTtsTransportSelect={vi.fn()}
        disabled={false}
        onAsrSelect={vi.fn()}
        onTutorModeSelect={vi.fn()}
        onVoicePreview={vi.fn()}
        onVoiceSelect={vi.fn()}
        previewingVoice={null}
        selectedAsrEngine="sensevoice"
        selectedTutorMode="coach"
        selectedVoice="test-voice"
        voiceOptions={[
          {
            value: "test-voice",
            label: "Test voice",
            name: "Test voice",
            language: "English",
            quality: "Local",
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "打开对话设置" }))
    fireEvent.click(screen.getByRole("combobox", { name: "选择语音识别引擎" }))

    const optionDescription = screen.getByText("中英混合与场景词汇")
    expect(optionDescription.parentElement?.className).toContain("items-center")
    expect(optionDescription.className).toContain("truncate")
  })

  it("switches recognition and synthesis between local service and online API", () => {
    const onAsrTransportSelect = vi.fn()
    const onTtsTransportSelect = vi.fn()
    const onApiVoiceChange = vi.fn()
    render(
      <ConversationSettingsPopover
        apiVoice="alloy"
        asrOptions={asrEngineOptions}
        asrTransport="local"
        ttsTransport="local"
        onApiVoiceChange={onApiVoiceChange}
        onAsrTransportSelect={onAsrTransportSelect}
        onTtsTransportSelect={onTtsTransportSelect}
        disabled={false}
        onAsrSelect={vi.fn()}
        onTutorModeSelect={vi.fn()}
        onVoicePreview={vi.fn()}
        onVoiceSelect={vi.fn()}
        previewingVoice={null}
        selectedAsrEngine="sensevoice"
        selectedTutorMode="coach"
        selectedVoice="test-voice"
        voiceOptions={[
          {
            value: "test-voice",
            label: "Test voice",
            name: "Test voice",
            language: "English",
            quality: "Local",
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "打开对话设置" }))

    const asrTransport = screen.getByRole("combobox", { name: "选择识别来源" })
    expect(asrTransport.textContent).toContain("本机服务")
    expect(screen.getByRole("combobox", { name: "选择语音识别引擎" })).toBeTruthy()

    fireEvent.click(asrTransport)
    const asrOption = screen.getByRole("option", { name: "线上 API" })
    fireEvent.pointerDown(asrOption, { pointerType: "mouse" })
    fireEvent.click(asrOption)
    expect(onAsrTransportSelect).toHaveBeenCalledWith("api")

    const ttsTransport = screen.getByRole("combobox", { name: "选择播报来源" })
    fireEvent.click(ttsTransport)
    const ttsOption = screen.getByRole("option", { name: "线上 API" })
    fireEvent.pointerDown(ttsOption, { pointerType: "mouse" })
    fireEvent.click(ttsOption)
    expect(onTtsTransportSelect).toHaveBeenCalledWith("api")
  })

  it("shows the provider voice field only when synthesis runs on the API transport", () => {
    const props = {
      apiVoice: "alloy",
      asrOptions: asrEngineOptions,
      asrTransport: "api" as const,
      disabled: false,
      onApiVoiceChange: vi.fn(),
      onAsrSelect: vi.fn(),
      onAsrTransportSelect: vi.fn(),
      onTtsTransportSelect: vi.fn(),
      onTutorModeSelect: vi.fn(),
      onVoicePreview: vi.fn(),
      onVoiceSelect: vi.fn(),
      previewingVoice: null,
      selectedAsrEngine: "sensevoice" as const,
      selectedTutorMode: "coach" as const,
      selectedVoice: "api:alloy",
      voiceOptions: [],
    }

    const view = render(<ConversationSettingsPopover {...props} ttsTransport="local" />)
    fireEvent.click(screen.getByRole("button", { name: "打开对话设置" }))
    expect(screen.queryByLabelText("接口音色名称")).toBeNull()

    view.rerender(<ConversationSettingsPopover {...props} ttsTransport="api" />)
    expect((screen.getByLabelText("接口音色名称") as HTMLInputElement).value).toBe("alloy")
    expect(screen.getByRole("button", { name: "选择语音引擎与音色" })).toBeTruthy()
  })

  it("replaces engine and voice pickers with transport-specific notes", () => {
    render(
      <ConversationSettingsPopover
        apiVoice=""
        asrOptions={asrEngineOptions}
        asrTransport="browser"
        ttsTransport="browser"
        onApiVoiceChange={vi.fn()}
        onAsrTransportSelect={vi.fn()}
        onTtsTransportSelect={vi.fn()}
        disabled={false}
        onAsrSelect={vi.fn()}
        onTutorModeSelect={vi.fn()}
        onVoicePreview={vi.fn()}
        onVoiceSelect={vi.fn()}
        previewingVoice={null}
        selectedAsrEngine="sensevoice"
        selectedTutorMode="coach"
        selectedVoice="test-voice"
        voiceOptions={[]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "打开对话设置" }))

    expect(screen.getByText("使用浏览器语音识别，无需本机服务。")).toBeTruthy()
    expect(screen.getByText("系统语音会按语言自动选择音色。")).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "选择语音识别引擎" })).toBeNull()
    expect(screen.queryByRole("button", { name: "选择语音引擎与音色" })).toBeNull()
  })

  it("renders the full voice activity effect and recording reticle", () => {
    const view = render(
      <VoiceCallPanel
        callSeconds={4}
        callStatus="listening"
        muted={false}
        onEndCall={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSpeaker={vi.fn()}
        speakerEnabled
        speechRecognitionProgress={100}
      />,
    )

    expect(screen.getByText("可以说话")).toBeTruthy()
    expect(screen.getByText("麦克风已开启，直接开始说话。")).toBeTruthy()
    expect(screen.getByRole("img", { name: "麦克风已开启，可以说话" }).className).toContain(
      "size-16",
    )
    expect(view.container.querySelector("[data-agent-listening-halo]")).toBeTruthy()
    expect(view.container.querySelector("[data-agent-ambient-halo]")).toBeTruthy()
    expect(view.container.querySelector("[data-agent-secondary-scanner]")).toBeTruthy()
    expect(view.container.querySelector("[data-agent-reticle]")).toBeTruthy()
    expect(view.container.firstElementChild?.className).toContain("min-h-16")
  })

  it("keeps every in-call control clickable", () => {
    const onToggleMute = vi.fn()
    const onEndCall = vi.fn()
    const onToggleSpeaker = vi.fn()
    render(
      <VoiceCallPanel
        callSeconds={64}
        callStatus="listening"
        idlePrompt="你有任何问题吗？"
        muted={false}
        onEndCall={onEndCall}
        onToggleMute={onToggleMute}
        onToggleSpeaker={onToggleSpeaker}
        speakerEnabled
        speechRecognitionProgress={100}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "静音麦克风" }))
    fireEvent.click(screen.getByRole("button", { name: "结束通话并切换到文字输入" }))
    fireEvent.click(screen.getByRole("button", { name: "关闭语音播报" }))

    expect(onToggleMute).toHaveBeenCalledOnce()
    expect(onEndCall).toHaveBeenCalledOnce()
    expect(onToggleSpeaker).toHaveBeenCalledOnce()
    expect(screen.getByText("你有任何问题吗？")).toBeTruthy()
  })

  it("shows the original error, concrete reason, correction, and practice examples", () => {
    render(
      <ExpressionValidationFeedback
        inputAnalysis={{ language: "mixed", intent: "language_question" }}
        onSpeak={vi.fn()}
        original="I am agree 这样说对吗"
        validation={{
          status: "improve",
          corrected: "I agree.",
          explanation: "agree 本身是动词。",
          issues: [
            {
              kind: "grammar",
              original: "I am agree",
              corrected: "I agree",
              explanation: "agree 前不需要 be 动词。",
            },
          ],
          examples: [
            {
              english: "I agree with your point.",
              chinese: "我同意你的观点。",
            },
          ],
        }}
      />,
    )

    expect(screen.getByText("发现表达问题")).toBeTruthy()
    expect(screen.getByText("中英混合 · 语言问题")).toBeTruthy()
    expect(screen.getByText("你的原句")).toBeTruthy()
    expect(screen.getAllByText("I am agree")).toHaveLength(2)
    expect(screen.getByText("agree 前不需要 be 动词。")).toBeTruthy()
    expect(screen.getByText("I agree with your point.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "播放例句 1" })).toBeTruthy()
  })

  it("places new conversation focus phrases above the scene defaults", () => {
    const messages: StoredConversationMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "A medium latte would be a good choice.",
        translation: "",
        note: "",
        timestamp: "00:05",
        validation: {
          status: "improve",
          corrected: "I'd like a medium latte, please.",
          explanation: "Use I'd like for a polite order.",
          issues: [],
          examples: [],
        },
      },
      {
        id: "assistant-2",
        role: "assistant",
        content: "Anything else?",
        translation: "",
        note: "",
        timestamp: "00:10",
        validation: {
          status: "guidance",
          corrected: "Could I also get an oat milk latte?",
          explanation: "Use also to add another request.",
          issues: [],
          examples: [],
        },
      },
    ]

    const phrases = getConversationFocusPhrases(getConversationScene("coffee"), messages)

    expect(phrases[0]).toEqual([
      "本轮求助",
      "Could I also get an oat milk latte?",
      "Use also to add another request.",
    ])
    expect(phrases[1]?.[1]).toBe("I'd like a medium latte, please.")
    expect(phrases.some(([, phrase]) => phrase === "Could I get...?")).toBe(true)
  })

  it("links the idiomatic scene to the standalone expression library", () => {
    render(
      <LearningMemoryProvider>
        <ConversationGuideAside
          collapsed={false}
          messages={[]}
          onCollapsedChange={vi.fn()}
          scene={getConversationScene("idiomatic-english")}
        />
      </LearningMemoryProvider>,
    )

    const link = screen.getByRole("link", { name: "地道表达词库" })
    expect(link.getAttribute("href")).toBe("/workspace/expressions")
    expect(screen.queryByText(/Could you keep tabs on the delivery/)).toBeNull()
  })

  it("opens the mobile expression guide with focus at its title", async () => {
    render(
      <LearningMemoryProvider>
        <ConversationGuideSheet
          messages={[]}
          scene={getConversationScene("idiomatic-english")}
        />
      </LearningMemoryProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "打开场景与练习提示" }))
    const title = await screen.findByRole("heading", { name: "场景与练习提示" })

    await waitFor(() => expect(document.activeElement).toBe(title))
  })

  it("hides the collapsed guide rail content but keeps an expand handle", () => {
    const onCollapsedChange = vi.fn()

    render(
      <LearningMemoryProvider>
        <ConversationGuideAside
          collapsed
          messages={[]}
          onCollapsedChange={onCollapsedChange}
          scene={getConversationScene("coffee")}
        />
      </LearningMemoryProvider>,
    )

    expect(screen.queryByText("练习提示")).toBeNull()

    const handle = screen.getByRole("separator", { name: "展开练习提示" })
    fireEvent.pointerDown(handle, { clientX: 300, pointerId: 4 })
    fireEvent.pointerUp(handle, { clientX: 300, pointerId: 4 })
    fireEvent.click(handle)

    expect(onCollapsedChange).toHaveBeenCalledWith(false)
    expect(screen.getByLabelText("对话练习提示").style.width).toBe("12px")
  })

  it("closes the guide by dragging right from the minimum width instead of using a header button", () => {
    const onCollapsedChange = vi.fn()

    const view = render(
      <LearningMemoryProvider>
        <ConversationGuideAside
          collapsed={false}
          messages={[]}
          onCollapsedChange={onCollapsedChange}
          scene={getConversationScene("coffee")}
        />
      </LearningMemoryProvider>,
    )

    expect(view.queryByRole("button", { name: "收起练习提示" })).toBeNull()

    const handle = view.getByRole("separator", { name: "调整练习提示宽度" })
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 390, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 390, pointerId: 1 })

    expect(onCollapsedChange).toHaveBeenCalledWith(true)
  })

  it("reveals the guide from zero width and springs to the minimum width on release", () => {
    const onCollapsedChange = vi.fn()

    const view = render(
      <LearningMemoryProvider>
        <ConversationGuideAside
          collapsed
          messages={[]}
          onCollapsedChange={onCollapsedChange}
          scene={getConversationScene("coffee")}
        />
      </LearningMemoryProvider>,
    )

    const handle = view.container.querySelector("hr")
    const aside = view.container.querySelector("aside")
    expect(handle).toBeTruthy()
    expect(aside).toBeTruthy()
    if (!handle || !aside) {
      return
    }
    fireEvent.pointerDown(handle, { clientX: 300, pointerId: 2 })
    fireEvent.pointerMove(handle, { clientX: 200, pointerId: 2 })

    expect(aside.style.width).toBe("100px")

    fireEvent.pointerUp(handle, { clientX: 200, pointerId: 2 })

    expect(aside.style.width).toBe("280px")
    expect(onCollapsedChange).toHaveBeenCalledWith(false)
  })

  it("keeps the dragged width when opening beyond the minimum", () => {
    const onCollapsedChange = vi.fn()

    const view = render(
      <LearningMemoryProvider>
        <ConversationGuideAside
          collapsed
          messages={[]}
          onCollapsedChange={onCollapsedChange}
          scene={getConversationScene("coffee")}
        />
      </LearningMemoryProvider>,
    )

    const handle = view.container.querySelector("hr")
    const aside = view.container.querySelector("aside")
    expect(handle).toBeTruthy()
    expect(aside).toBeTruthy()
    if (!handle || !aside) {
      return
    }
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 3 })
    fireEvent.pointerMove(handle, { clientX: 140, pointerId: 3 })
    fireEvent.pointerUp(handle, { clientX: 140, pointerId: 3 })

    expect(aside.style.width).toBe("360px")
    expect(window.localStorage.getItem("moss:conversation-guide-width:v1")).toBe("360")
    expect(onCollapsedChange).toHaveBeenCalledWith(false)
  })
})
