// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SpeechServiceCard } from "@/features/settings/speech-service-card"
import { setAsrConfig } from "@/features/speech/use-asr-config"
import { setLocalServiceConfig } from "@/features/speech/use-local-service-config"
import { setSpeechConfig } from "@/features/speech/use-speech-config"
import { setTtsConfig } from "@/features/speech/use-tts-config"
import { defaultAsrEngine } from "@/lib/asr-config"
import {
  defaultLocalServiceConfig,
  localServiceConfigStorageKey,
} from "@/lib/local-service-config"
import {
  defaultSpeechConfig,
  getDefaultFishAudioEndpoint,
  getDefaultFishAudioModel,
  getDefaultLocalApiModel,
  isLoopbackSpeechEndpoint,
  speechConfigStorageKey,
} from "@/lib/speech-config"
import { defaultTtsConfig } from "@/lib/tts-config"

function storedConfig() {
  return JSON.parse(window.localStorage.getItem(speechConfigStorageKey) ?? "{}")
}

function selectOption(label: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }))
  // 本机服务选项同时展示地址，按标签前缀匹配，避免把地址写进每个调用点。
  const name = new RegExp(`^${optionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
  const option = screen.getByRole("option", { name })
  fireEvent.pointerDown(option, { pointerType: "mouse" })
  fireEvent.click(option)
}

function selectTransport(label: string, optionName: string) {
  selectOption(label, optionName)
}

function selectApiTransportForBothServices() {
  selectTransport("语音识别接入方式", "HTTP API")
  selectTransport("语音合成接入方式", "HTTP API")
}

function localServiceConfig() {
  return JSON.parse(
    window.localStorage.getItem(localServiceConfigStorageKey) ?? "{}",
  ) as Record<string, Record<string, string>>
}

beforeEach(() => {
  window.localStorage.clear()
  setSpeechConfig(() => defaultSpeechConfig)
  setAsrConfig(() => defaultAsrEngine)
  setTtsConfig(() => defaultTtsConfig)
  setLocalServiceConfig(() => defaultLocalServiceConfig)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("SpeechServiceCard", () => {
  it("starts on the local transports and names the address in use", () => {
    render(<SpeechServiceCard />)

    // 本机接入会把当前引擎/音色附在生效配置后，与对话页共享同一份配置。
    expect(
      screen.getByText("本机 ASR 服务 · ws://127.0.0.1:5580/v1/asr/stream · 引擎 SenseVoice"),
    ).toBeTruthy()
    expect(screen.getByText("本机 TTS 服务 · http://127.0.0.1:5578 · 音色 Heart")).toBeTruthy()
    // 本机服务地址是下拉选择，默认值来自 MOSS 本机服务可用项，不再接受手填地址。
    expect(
      screen.getByRole("combobox", { name: "语音识别本机服务地址" }).textContent,
    ).toContain("本机 ASR 服务")
    expect(
      screen.getByRole("combobox", { name: "语音合成本机服务地址" }).textContent,
    ).toContain("本机 TTS 网关")
    expect(screen.queryByLabelText("语音识别API 密钥")).toBeNull()
  })

  it("stores an HTTP API configuration per service in the browser only", () => {
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()

    fireEvent.change(screen.getByLabelText("语音识别接口地址"), {
      target: { value: "https://speech.example.com/v1" },
    })
    fireEvent.change(screen.getByLabelText("语音识别模型"), {
      target: { value: "whisper-large-v3" },
    })
    fireEvent.change(screen.getByLabelText("语音识别API 密钥"), {
      target: { value: "sk-test" },
    })

    const stored = storedConfig()
    expect(stored.asr.transport).toBe("api")
    expect(stored.asr.endpoint).toBe("https://speech.example.com/v1")
    expect(stored.asr.model).toBe("whisper-large-v3")
    expect(stored.asr.apiKey).toBe("sk-test")
    expect(stored.tts.transport).toBe("api")
    // The credential lives in the speech config only, never in learning memory.
    expect(window.localStorage.getItem("moss:learning-memory:v1")).toBeNull()
  })

  it("applies the loopback interface preset to ASR and TTS without dropping the API key", () => {
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()

    fireEvent.change(screen.getByLabelText("语音识别API 密钥"), {
      target: { value: "local-token" },
    })
    fireEvent.click(screen.getByRole("button", { name: "使用语音识别ElevenLabs 适配器" }))
    fireEvent.click(screen.getByRole("button", { name: "使用语音合成ElevenLabs 适配器" }))

    const stored = storedConfig()
    expect(stored.asr.transport).toBe("api")
    expect(stored.tts.transport).toBe("api")
    expect(isLoopbackSpeechEndpoint(stored.asr.endpoint)).toBe(true)
    expect(isLoopbackSpeechEndpoint(stored.tts.endpoint)).toBe(true)
    expect(stored.asr.model).toBe(getDefaultLocalApiModel("asr"))
    expect(stored.tts.model).toBe(getDefaultLocalApiModel("tts"))
    expect(stored.asr.apiKey).toBe("local-token")
    expect(screen.getAllByText(/（本机接口）/)).toHaveLength(2)
  })

  it("applies the Fish Audio preset with its own loopback address and models", () => {
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()

    fireEvent.click(screen.getByRole("button", { name: "使用语音识别Fish Audio 适配器" }))
    fireEvent.click(screen.getByRole("button", { name: "使用语音合成Fish Audio 适配器" }))

    const stored = storedConfig()
    expect(stored.asr.endpoint).toBe(getDefaultFishAudioEndpoint("asr"))
    expect(stored.tts.endpoint).toBe(getDefaultFishAudioEndpoint("tts"))
    expect(stored.asr.endpoint).toBe("http://127.0.0.1:5584/v1")
    expect(stored.asr.model).toBe(getDefaultFishAudioModel("asr"))
    expect(stored.tts.model).toBe(getDefaultFishAudioModel("tts"))
    expect(stored.asr.model).toBe("transcribe-1-pro")
    expect(stored.tts.model).toBe("s2.1-pro-free")
    expect(screen.getAllByText(/（本机接口）/)).toHaveLength(2)
  })

  it("persists the API synthesis voice declared by the unified field policy", () => {
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()

    fireEvent.change(screen.getByLabelText("语音合成音色"), {
      target: { value: " 9a9cf47702da476aa4629e2506d4a857 " },
    })

    expect(storedConfig().tts.voice).toBe("9a9cf47702da476aa4629e2506d4a857")
    expect(screen.getByText(/音色 9a9cf47702da476aa4629e2506d4a857/)).toBeTruthy()
  })

  it("configures the local ASR engine from the same field policy as the conversation page", () => {
    render(<SpeechServiceCard />)

    const combo = screen.getByRole("combobox", { name: "选择语音识别引擎" })
    fireEvent.click(combo)
    const option = screen.getByRole("option", { name: "Qwen3-ASR" })
    fireEvent.pointerDown(option, { pointerType: "mouse" })
    fireEvent.click(option)

    const stored = JSON.parse(window.localStorage.getItem("moss:asr-config:v1") ?? "{}") as {
      engine?: string
    }
    expect(stored.engine).toBe("qwen3-asr")
    expect(screen.getByText(/引擎 Qwen3-ASR/)).toBeTruthy()
  })

  it("tests the recognition endpoint with the built-in tone before the learner speaks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { text: "Could I get a latte?" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()

    fireEvent.click(screen.getByRole("button", { name: "测试识别接口" }))

    await waitFor(() =>
      expect(
        screen.getByText(/语音识别接口可用，返回文本：「Could I get a latte\?」。/),
      ).toBeTruthy(),
    )
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe("/api/speech/asr")
    const body = JSON.parse(String(init.body)) as { audioBase64: string; mimeType: string }
    expect(body.mimeType).toBe("audio/wav")
    // 内置测试音频必须是合法 WAV 容器（RIFF 魔数），避免把坏请求当成服务故障。
    expect(atob(body.audioBase64).slice(0, 4)).toBe("RIFF")
  })

  it("reports an unreachable recognition endpoint without breaking the form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 502 })))
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()

    fireEvent.click(screen.getByRole("button", { name: "测试识别接口" }))

    await waitFor(() =>
      expect(screen.getByText("语音识别接口不可用：接口返回 502")).toBeTruthy(),
    )
    expect(screen.getByLabelText("语音识别接入方式")).toBeTruthy()
  })

  it("warns when an API endpoint is not reachable over a public HTTPS address", () => {
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()

    fireEvent.change(screen.getByLabelText("语音识别接口地址"), {
      target: { value: "http://speech.example.com/v1" },
    })

    expect(screen.getAllByText("接口地址需要是 HTTPS 公网地址，或本机回环地址。")).toHaveLength(
      1,
    )
  })

  it("switches a service to the browser engine without asking for credentials", () => {
    render(<SpeechServiceCard />)

    selectTransport("语音识别接入方式", "浏览器引擎")
    selectTransport("语音合成接入方式", "浏览器引擎")

    expect(screen.queryByLabelText("语音识别API 密钥")).toBeNull()
    expect(storedConfig().asr.transport).toBe("browser")
    expect(storedConfig().tts.transport).toBe("browser")
    expect(screen.getByRole("button", { name: "测试合成接口" }).hasAttribute("disabled")).toBe(
      true,
    )
  })

  it("verifies the synthesis endpoint through the diagnostic route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          contentType: "audio/mpeg",
          bytes: 2048,
          durationMs: 321,
          model: "tts-1",
          voice: "alloy",
          format: "mp3",
          checks: { audioContentType: true, plausiblePayload: true },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()
    fireEvent.change(screen.getByLabelText("语音合成接口地址"), {
      target: { value: "https://speech.example.com/v1" },
    })

    fireEvent.click(screen.getByRole("button", { name: "测试合成接口" }))

    await waitFor(() =>
      expect(
        screen.getByText(/语音合成接口可用，音频已正常返回。audio\/mpeg · 2.0 KB · 321 ms/),
      ).toBeTruthy(),
    )
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe("/api/speech/tts/test")
    expect(JSON.parse(String(init.body)).text).toContain("Moss")
  })

  it("sends the configured synthesis voice to the diagnostic route, not a forced default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          contentType: "audio/mpeg",
          bytes: 100,
          durationMs: 10,
          checks: { audioContentType: true, plausiblePayload: true },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()
    fireEvent.change(screen.getByLabelText("语音合成音色"), {
      target: { value: "9a9cf47702da" },
    })

    fireEvent.click(screen.getByRole("button", { name: "测试合成接口" }))

    await waitFor(() => {
      expect(screen.getByText(/语音合成接口可用/)).toBeTruthy()
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body)).voice).toBe("9a9cf47702da")
  })

  it("reports an unreachable synthesis endpoint without breaking the form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 502 })))
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()

    fireEvent.click(screen.getByRole("button", { name: "测试合成接口" }))

    await waitFor(() =>
      expect(screen.getByText("语音合成接口不可用：接口返回 502")).toBeTruthy(),
    )
    expect(screen.getByLabelText("语音合成接入方式")).toBeTruthy()
  })

  it("surfaces the diagnostic error code when the synthesis fails upstream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "speech_upstream_error", message: "合成接口返回 401" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()

    fireEvent.click(screen.getByRole("button", { name: "测试合成接口" }))

    await waitFor(() =>
      expect(
        screen.getByText("语音合成接口不可用：合成接口返回 401（speech_upstream_error）"),
      ).toBeTruthy(),
    )
  })

  it("turns a 502 with an auth failure into an actionable hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "speech_upstream_error",
              message:
                "语音合成接口返回 502，请检查接口地址与密钥。（elevenlabs_unauthorized，ElevenLabs 凭据无效）",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()

    fireEvent.click(screen.getByRole("button", { name: "测试合成接口" }))

    await waitFor(() =>
      expect(screen.getByText(/上游凭据无效，请检查对应服务端的 API Key/)).toBeTruthy(),
    )
  })

  it("offers only the MOSS local services and shows each address", () => {
    render(<SpeechServiceCard />)

    fireEvent.click(screen.getByRole("combobox", { name: "语音识别本机服务地址" }))
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "本机 ASR 服务ws://127.0.0.1:5580/v1/asr/stream",
      "FunASR（外部）ws://127.0.0.1:10095",
      "本机 local 接口（ElevenLabs 适配器）http://127.0.0.1:5583/v1",
      "Fish Audio 适配器http://127.0.0.1:5584/v1",
    ])
    fireEvent.keyDown(screen.getByRole("combobox", { name: "语音识别本机服务地址" }), {
      key: "Escape",
    })

    fireEvent.click(screen.getByRole("combobox", { name: "语音合成本机服务地址" }))
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "本机 TTS 网关http://127.0.0.1:5578",
      "本机 local 接口（ElevenLabs 适配器）http://127.0.0.1:5583/v1",
      "Fish Audio 适配器http://127.0.0.1:5584/v1",
    ])
  })

  it("shows the selected service address in the dropdown trigger", () => {
    render(<SpeechServiceCard />)

    const asrTrigger = screen.getByRole("combobox", { name: "语音识别本机服务地址" })
    expect(asrTrigger.textContent).toContain("本机 ASR 服务")
    expect(asrTrigger.textContent).toContain("ws://127.0.0.1:5580/v1/asr/stream")
    const ttsTrigger = screen.getByRole("combobox", { name: "语音合成本机服务地址" })
    expect(ttsTrigger.textContent).toContain("本机 TTS 网关")
    expect(ttsTrigger.textContent).toContain("http://127.0.0.1:5578")
  })

  it("keeps each test button in the pinned footer of its own service", () => {
    render(<SpeechServiceCard />)

    const footer = document.querySelector('[data-slot="card-footer"]')
    expect(footer).toBeTruthy()
    expect(footer?.contains(screen.getByRole("button", { name: "测试识别接口" }))).toBe(true)
    expect(footer?.contains(screen.getByRole("button", { name: "测试合成接口" }))).toBe(true)
    expect(screen.getAllByText("选择 HTTP API 接入后可验证。")).toHaveLength(2)
  })

  it("aligns transport, address and model when a loopback adapter is selected", () => {
    render(<SpeechServiceCard />)

    selectOption("语音识别本机服务地址", "本机 local 接口（ElevenLabs 适配器）")

    const stored = storedConfig()
    expect(stored.asr.transport).toBe("api")
    expect(stored.asr.endpoint).toBe("http://127.0.0.1:5583/v1")
    expect(stored.asr.model).toBe("scribe_v2")
    expect(screen.queryByRole("combobox", { name: "选择语音识别引擎" })).toBeNull()
  })

  it("keeps the recognition engine independent for each local service", () => {
    render(<SpeechServiceCard />)

    selectOption("选择语音识别引擎", "Qwen3-ASR")
    expect(JSON.parse(window.localStorage.getItem("moss:asr-config:v1") ?? "{}").engine).toBe(
      "qwen3-asr",
    )

    selectOption("语音识别本机服务地址", "FunASR（外部）")
    expect(JSON.parse(window.localStorage.getItem("moss:asr-config:v1") ?? "{}").engine).toBe(
      "funasr",
    )
    fireEvent.click(screen.getByRole("combobox", { name: "选择语音识别引擎" }))
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "FunASR（外部）",
    ])
    fireEvent.keyDown(screen.getByRole("combobox", { name: "选择语音识别引擎" }), {
      key: "Escape",
    })

    selectOption("语音识别本机服务地址", "本机 ASR 服务")
    // 切回本机 ASR 服务时恢复它自己的保存值，不沿用 FunASR 的引擎。
    expect(JSON.parse(window.localStorage.getItem("moss:asr-config:v1") ?? "{}").engine).toBe(
      "qwen3-asr",
    )
    expect(localServiceConfig().asrEngines).toEqual({
      "moss-asr": "qwen3-asr",
      funasr: "funasr",
    })
  })

  it("does not carry an adapter voice from one loopback adapter to the other", () => {
    render(<SpeechServiceCard />)

    selectOption("语音合成本机服务地址", "Fish Audio 适配器")
    fireEvent.change(screen.getByLabelText("语音合成音色"), {
      target: { value: "9a9cf47702da" },
    })
    expect(storedConfig().tts.voice).toBe("9a9cf47702da")

    selectTransport("语音合成接入方式", "本机服务")
    selectOption("语音合成本机服务地址", "本机 local 接口（ElevenLabs 适配器）")
    expect(storedConfig().tts.voice).toBe("")
    fireEvent.change(screen.getByLabelText("语音合成音色"), {
      target: { value: "JBFqnCBsd6RMkjVDRZzb" },
    })

    selectTransport("语音合成接入方式", "本机服务")
    selectOption("语音合成本机服务地址", "Fish Audio 适配器")
    expect(storedConfig().tts.voice).toBe("9a9cf47702da")
  })

  it("clears a stale adapter address when switching back to the local transport", () => {
    render(<SpeechServiceCard />)

    selectOption("语音识别本机服务地址", "Fish Audio 适配器")
    expect(storedConfig().asr.endpoint).toBe("http://127.0.0.1:5584/v1")

    selectTransport("语音识别接入方式", "本机服务")
    expect(storedConfig().asr.transport).toBe("local")
    expect(storedConfig().asr.endpoint).toBe("")
    expect(
      screen.getByRole("combobox", { name: "语音识别本机服务地址" }).textContent,
    ).toContain("本机 ASR 服务")
  })

  it("keeps both test buttons resident and their results independent", async () => {
    const fetchMock = vi.fn((path: string) => {
      if (path === "/api/speech/asr") {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { text: "Could I get a latte?" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            contentType: "audio/mpeg",
            bytes: 2048,
            durationMs: 321,
            checks: { audioContentType: true, plausiblePayload: true },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<SpeechServiceCard />)

    // 常驻按钮：非 HTTP API 接入时禁用，但不会从页面消失。
    expect(screen.getByRole("button", { name: "测试识别接口" }).hasAttribute("disabled")).toBe(
      true,
    )
    selectApiTransportForBothServices()

    fireEvent.click(screen.getByRole("button", { name: "测试识别接口" }))
    await waitFor(() => expect(screen.getByText(/语音识别接口可用/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "测试合成接口" }))
    await waitFor(() => expect(screen.getByText(/语音合成接口可用/)).toBeTruthy())

    // 两个结果同时存在，互不覆盖。
    expect(screen.getByText(/语音识别接口可用/)).toBeTruthy()
    expect(screen.getByText(/语音合成接口可用/)).toBeTruthy()

    // 只改 TTS 配置时只失效 TTS 的结果。
    fireEvent.change(screen.getByLabelText("语音合成音色"), { target: { value: "nova" } })
    expect(screen.getByText(/语音识别接口可用/)).toBeTruthy()
    expect(screen.queryByText(/语音合成接口可用/)).toBeNull()
  })
})
