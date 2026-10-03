import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getActiveModelConfig,
  getModelInferenceConfig,
  getModelRequestUrl,
  isModelConfigComplete,
  isValidModelEndpoint,
  parseLocalModelConfig,
  parseModelConfigCollection,
} from "@/lib/model-config"

describe("local model config", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("migrates the previous local-only config shape", () => {
    const stored = JSON.stringify({
      version: 1,
      provider: "anthropic",
      model: "claude-sonnet",
      endpoint: "https://api.anthropic.com/v1",
      apiKey: "local-secret",
    })
    const collection = parseModelConfigCollection(stored)
    const config = parseLocalModelConfig(stored)

    expect(collection).toMatchObject({
      version: 3,
      activeConfigId: "migrated-default",
      configs: [{ id: "migrated-default", name: "claude-sonnet" }],
    })
    expect(config).toMatchObject({
      version: 2,
      enabled: true,
      apiType: "anthropic-messages",
    })
  })

  it("keeps multiple configs and projects only the selected active config", () => {
    const collection = parseModelConfigCollection(
      JSON.stringify({
        version: 3,
        activeConfigId: "second",
        configs: [
          {
            id: "first",
            name: "Primary",
            provider: "openai",
            apiType: "chat-completions",
            endpoint: "https://api.openai.com/v1",
            model: "gpt-first",
            apiKey: "first-secret",
          },
          {
            id: "second",
            name: "Backup",
            provider: "anthropic",
            apiType: "anthropic-messages",
            endpoint: "https://api.anthropic.com/v1",
            model: "claude-second",
            apiKey: "second-secret",
          },
        ],
      }),
    )

    expect(collection.configs).toHaveLength(2)
    expect(getActiveModelConfig(collection)).toMatchObject({
      enabled: true,
      provider: "anthropic",
      model: "claude-second",
      apiKey: "second-secret",
    })
  })

  it("disables inference when a stored collection has no active config", () => {
    const stored = JSON.stringify({
      version: 3,
      activeConfigId: null,
      configs: [
        {
          id: "saved",
          name: "Saved only",
          provider: "openai-compatible",
          apiType: "chat-completions",
          endpoint: "https://models.example.com/v1",
          model: "example-model",
          apiKey: "secret",
        },
      ],
    })

    expect(parseModelConfigCollection(stored).configs).toHaveLength(1)
    expect(parseLocalModelConfig(stored).enabled).toBe(false)
  })

  it("builds the request URL without duplicating its API path", () => {
    expect(getModelRequestUrl("https://api.example.com/v1/", "chat-completions")).toBe(
      "https://api.example.com/v1/chat/completions",
    )
    expect(
      getModelRequestUrl("https://api.example.com/v1/chat/completions", "chat-completions"),
    ).toBe("https://api.example.com/v1/chat/completions")
    expect(getModelRequestUrl("https://api.example.com/inference", "custom")).toBe(
      "https://api.example.com/inference",
    )
  })

  it("requires enabled, complete and secure configuration", () => {
    expect(
      isModelConfigComplete({
        version: 2,
        enabled: true,
        provider: "openai-compatible",
        apiType: "chat-completions",
        endpoint: "https://api.example.com/v1",
        model: "example-model",
        apiKey: "secret",
      }),
    ).toBe(true)

    expect(
      isModelConfigComplete({
        version: 2,
        enabled: true,
        provider: "openai-compatible",
        apiType: "chat-completions",
        endpoint: "http://example.com/v1",
        model: "example-model",
        apiKey: "secret",
      }),
    ).toBe(false)
  })

  it.each([
    "https://10.0.0.8/v1",
    "https://169.254.169.254/latest",
    "https://192.168.1.20/v1",
    "https://models.internal/v1",
    "https://user:password@api.example.com/v1",
  ])("rejects private or credential-bearing model endpoint %s", (endpoint) => {
    expect(isValidModelEndpoint(endpoint)).toBe(false)
  })

  it("allows loopback only outside production", () => {
    expect(isValidModelEndpoint("http://127.0.0.1:11434/v1")).toBe(true)

    vi.stubEnv("NODE_ENV", "production")
    expect(isValidModelEndpoint("https://127.0.0.1/v1")).toBe(false)
    expect(isValidModelEndpoint("https://[::1]/v1")).toBe(false)
  })

  it("projects only inference fields for a complete config and trims the endpoint", () => {
    expect(
      getModelInferenceConfig({
        version: 2,
        enabled: true,
        provider: "openai-compatible",
        apiType: "chat-completions",
        endpoint: "https://api.example.com/v1/",
        model: " example-model ",
        apiKey: " secret ",
      }),
    ).toEqual({
      apiKey: "secret",
      baseUrl: "https://api.example.com/v1",
      model: "example-model",
      apiType: "chat-completions",
    })
  })

  it("returns null when the config is incomplete or disabled", () => {
    expect(
      getModelInferenceConfig({
        version: 2,
        enabled: false,
        provider: "openai-compatible",
        apiType: "chat-completions",
        endpoint: "https://api.example.com/v1",
        model: "example-model",
        apiKey: "secret",
      }),
    ).toBeNull()
  })
})
