// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SpeechServiceCard } from "@/features/settings/speech-service-card"
import { setSpeechConfig } from "@/features/speech/use-speech-config"
import { defaultSpeechConfig, speechConfigStorageKey } from "@/lib/speech-config"

function storedConfig() {
  return JSON.parse(window.localStorage.getItem(speechConfigStorageKey) ?? "{}")
}

function selectTransport(label: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }))
  const option = screen.getByRole("option", { name: optionName })
  fireEvent.pointerDown(option, { pointerType: "mouse" })
  fireEvent.click(option)
}

function selectApiTransportForBothServices() {
  selectTransport("语音识别接入方式", "HTTP API")
  selectTransport("语音合成接入方式", "HTTP API")
}

beforeEach(() => {
  window.localStorage.clear()
  setSpeechConfig(() => defaultSpeechConfig)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("SpeechServiceCard", () => {
  it("starts on the local transports and names the address in use", () => {
    render(<SpeechServiceCard />)

    expect(screen.getByText("本机 ASR 服务 · ws://127.0.0.1:5580/v1/asr/stream")).toBeTruthy()
    expect(screen.getByText("本机 TTS 服务 · http://127.0.0.1:5578")).toBeTruthy()
    expect((screen.getByLabelText("语音识别本机服务地址") as HTMLInputElement).value).toBe("")
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

  it("verifies the synthesis endpoint through the app speech route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    render(<SpeechServiceCard />)
    selectApiTransportForBothServices()
    fireEvent.change(screen.getByLabelText("语音合成接口地址"), {
      target: { value: "https://speech.example.com/v1" },
    })

    fireEvent.click(screen.getByRole("button", { name: "测试合成接口" }))

    await waitFor(() =>
      expect(screen.getByText("语音合成接口可用，音频已正常返回。")).toBeTruthy(),
    )
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe("/api/speech/tts")
    expect(JSON.parse(String(init.body)).text).toContain("Moss")
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
})
