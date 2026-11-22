import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getAiProviderConfig,
  getDefaultAiModelService,
  parseAiModelServices,
} from "@/lib/ai-provider"

const environmentKeys = [
  "AI_MODEL_SERVICES",
  "AI_DEFAULT_MODEL_SERVICE",
  "AI_API_KEY",
  "AI_API_TYPE",
  "AI_BASE_URL",
  "AI_EMBEDDING_MODEL",
  "AI_MODEL",
  "AI_MODEL_NAME",
] as const

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("parseAiModelServices", () => {
  it("parses the JSON array of model services", () => {
    vi.stubEnv(
      "AI_MODEL_SERVICES",
      JSON.stringify([
        {
          name: "primary",
          baseUrl: "https://api.deepseek.com/v1",
          apiKey: "sk-1",
          model: "deepseek-chat",
          apiType: "chat-completions",
        },
        {
          name: "backup",
          baseUrl: "https://open.bigmodel.cn/api/paas/v4",
          apiKey: "sk-2",
          model: "glm-4.5",
        },
      ]),
    )

    expect(parseAiModelServices()).toEqual([
      {
        name: "primary",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "sk-1",
        model: "deepseek-chat",
        apiType: "chat-completions",
      },
      {
        name: "backup",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        apiKey: "sk-2",
        model: "glm-4.5",
      },
    ])
  })

  it("drops malformed entries and tolerates bad JSON", () => {
    vi.stubEnv(
      "AI_MODEL_SERVICES",
      JSON.stringify([
        { name: "ok", baseUrl: "https://api.deepseek.com/v1", apiKey: "k", model: "m" },
        { name: "", baseUrl: "https://api.openai.com/v1", apiKey: "k", model: "m" },
        { name: "bad-url", baseUrl: "not a url", apiKey: "k", model: "m" },
        "garbage",
      ]),
    )

    expect(parseAiModelServices().map((service) => service.name)).toEqual(["ok"])

    vi.stubEnv("AI_MODEL_SERVICES", "not-json")
    expect(parseAiModelServices()).toEqual([])

    vi.stubEnv("AI_MODEL_SERVICES", JSON.stringify({ name: "x" }))
    expect(parseAiModelServices()).toEqual([])
  })
})

describe("getDefaultAiModelService", () => {
  it("selects the default by name and falls back to the first service", () => {
    vi.stubEnv(
      "AI_MODEL_SERVICES",
      JSON.stringify([
        { name: "a", baseUrl: "https://api.deepseek.com/v1", apiKey: "k1", model: "m1" },
        { name: "b", baseUrl: "https://api.openai.com/v1", apiKey: "k2", model: "m2" },
      ]),
    )
    expect(getDefaultAiModelService()?.name).toBe("a")

    vi.stubEnv("AI_DEFAULT_MODEL_SERVICE", "b")
    expect(getDefaultAiModelService()?.name).toBe("b")

    vi.stubEnv("AI_DEFAULT_MODEL_SERVICE", "missing")
    expect(getDefaultAiModelService()?.name).toBe("a")
  })

  it("returns null when no services are configured", () => {
    for (const key of environmentKeys) {
      vi.stubEnv(key, "")
    }
    expect(getDefaultAiModelService()).toBeNull()
  })
})

describe("getAiProviderConfig with AI_MODEL_SERVICES", () => {
  it("prefers the default service over the legacy env vars", () => {
    vi.stubEnv(
      "AI_MODEL_SERVICES",
      JSON.stringify([
        {
          name: "svc",
          baseUrl: "https://api.deepseek.com/v1",
          apiKey: "sk-service",
          model: "deepseek-chat",
          apiType: "chat-completions",
        },
      ]),
    )
    vi.stubEnv("AI_DEFAULT_MODEL_SERVICE", "svc")
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_API_KEY", "legacy-key")
    vi.stubEnv("AI_MODEL_NAME", "legacy-model")

    expect(getAiProviderConfig()).toEqual({
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "sk-service",
      model: "deepseek-chat",
      apiType: "chat-completions",
    })
  })

  it("keeps the legacy path when AI_MODEL_SERVICES is empty or invalid", () => {
    vi.stubEnv("AI_MODEL_SERVICES", "")
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_API_KEY", "legacy-key")
    vi.stubEnv("AI_MODEL_NAME", "legacy-model")

    expect(getAiProviderConfig()).toEqual({
      baseUrl: "https://api.example.com/v1",
      apiKey: "legacy-key",
      model: "legacy-model",
      apiType: "chat-completions",
    })
  })
})
