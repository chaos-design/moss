// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const cryptoMocks = vi.hoisted(() => ({
  createEnvelope: vi.fn(),
  resetPublicKey: vi.fn(),
}))

vi.mock("@/lib/model-config-envelope", () => ({
  createModelConfigEnvelope: cryptoMocks.createEnvelope,
  resetModelConfigPublicKey: cryptoMocks.resetPublicKey,
}))

import type { ConversationMessage } from "@/features/conversation/conversation-machine"
import {
  createConversationRequestMessages,
  isConversationAbort,
  requestConversationReply,
  requestConversationTranslation,
} from "@/features/conversation/conversation-transport"
import { getConversationScene } from "@/lib/conversation-scenes"

const fetchMock = vi.fn()
const messages: ConversationMessage[] = [
  {
    id: "opening",
    role: "assistant",
    content: "What can I get for you?",
    translation: "",
    note: "",
    timestamp: "00:00",
  },
  {
    id: "question-1",
    role: "user",
    content: "What sizes do you have?",
    inputMode: "text",
    translation: "",
    note: "",
    timestamp: "00:03",
  },
  {
    id: "temporary-error",
    role: "assistant",
    content: "Temporary failure",
    translation: "",
    note: "",
    timestamp: "00:04",
    transient: true,
    variant: "error",
  },
]

beforeEach(() => {
  window.localStorage.clear()
  fetchMock.mockReset()
  cryptoMocks.createEnvelope.mockReset().mockResolvedValue({
    version: 1,
    keyId: "key-id",
    wrappedKey: "wrapped",
    iv: "iv",
    ciphertext: "ciphertext",
  })
  cryptoMocks.resetPublicKey.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("conversation transport", () => {
  it("sends only persistent turns and the bounded conversation context", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            content: "Small, medium, and large.",
            translation: "小杯、中杯和大杯。",
            recall: "",
          },
        }),
        { status: 200 },
      ),
    )

    const result = await requestConversationReply({
      scene: getConversationScene("coffee"),
      memoryContext: [],
      messages,
      signal: new AbortController().signal,
      tutorMode: "english",
    })
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))

    expect(result.content).toBe("Small, medium, and large.")
    expect(request.messages).toEqual([
      { role: "assistant", content: "What can I get for you?" },
      { role: "user", content: "What sizes do you have?" },
    ])
    expect(request.memory.shortTerm).toMatchObject({
      sceneId: "coffee",
      recentUserInputs: ["What sizes do you have?"],
      turnCount: 3,
    })
    expect(request.modelConfigEnvelope).toBeUndefined()
    expect(request.tutorMode).toBe("english")
  })

  it("refreshes an expired model-config key and retries exactly once", async () => {
    window.localStorage.setItem(
      "moss:model-config:v1",
      JSON.stringify({
        version: 2,
        enabled: true,
        provider: "openai-compatible",
        apiType: "chat-completions",
        endpoint: "https://models.example.com/v1",
        model: "example-model",
        apiKey: "browser-secret",
      }),
    )
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "model_config_key_expired", message: "expired" },
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { content: "Retry succeeded.", translation: "", recall: "" },
          }),
          { status: 200 },
        ),
      )

    const result = await requestConversationReply({
      scene: getConversationScene("coffee"),
      memoryContext: [],
      messages,
      signal: new AbortController().signal,
      tutorMode: "coach",
    })

    expect(result.content).toBe("Retry succeeded.")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(cryptoMocks.resetPublicKey).toHaveBeenCalledOnce()
    expect(cryptoMocks.createEnvelope).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).not.toContain("browser-secret")
  })

  it("distinguishes cancellation from transport failures", () => {
    const activeController = new AbortController()
    const abortedController = new AbortController()
    abortedController.abort()

    expect(isConversationAbort(new Error("network"), activeController.signal)).toBe(false)
    expect(
      isConversationAbort(new DOMException("cancelled", "AbortError"), activeController.signal),
    ).toBe(true)
    expect(isConversationAbort(new Error("network"), abortedController.signal)).toBe(true)
    expect(createConversationRequestMessages(messages)).toHaveLength(2)
  })

  it("sends the active browser model to translation only as an encrypted envelope", async () => {
    window.localStorage.setItem(
      "moss:model-config:v1",
      JSON.stringify({
        version: 2,
        enabled: true,
        provider: "openai-compatible",
        apiType: "chat-completions",
        endpoint: "https://models.example.com/v1",
        model: "example-model",
        apiKey: "browser-secret",
      }),
    )
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { translation: "翻译结果" } }), {
        status: 200,
      }),
    )

    const translation = await requestConversationTranslation("Translate me.")
    const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body)

    expect(translation).toBe("翻译结果")
    expect(requestBody).toContain("modelConfigEnvelope")
    expect(requestBody).not.toContain("browser-secret")
  })
})
