import { afterEach, describe, expect, it, vi } from "vitest"
import {
  type BrowserModelConfig,
  resolveProviderConfig,
} from "@/lib/server/browser-model-config"

const browserConfig: BrowserModelConfig = {
  apiKey: "browser-secret",
  baseUrl: "https://byo.example.com/v1",
  model: "byo-model",
  apiType: "chat-completions",
}

function clearServerConfig() {
  vi.stubEnv("AI_MODEL_SERVICES", "")
  vi.stubEnv("AI_API_KEY", "")
  vi.stubEnv("AI_BASE_URL", "")
  vi.stubEnv("AI_MODEL_NAME", "")
  vi.stubEnv("AI_MODEL", "")
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("resolveProviderConfig", () => {
  it("prefers server environment config over a browser config", () => {
    vi.stubEnv("AI_API_KEY", "server-secret")
    vi.stubEnv("AI_BASE_URL", "https://server.example.com/v1")
    vi.stubEnv("AI_MODEL_NAME", "server-model")

    const result = resolveProviderConfig(browserConfig)

    expect(result.providerConfig).toMatchObject({
      apiKey: "server-secret",
      baseUrl: "https://server.example.com/v1",
      model: "server-model",
    })
    expect(result.usingClientConfig).toBe(false)
  })

  it("falls back to the browser config when no server config is present", () => {
    clearServerConfig()

    const result = resolveProviderConfig(browserConfig)

    expect(result.providerConfig).toMatchObject({
      apiKey: "browser-secret",
      baseUrl: "https://byo.example.com/v1",
      model: "byo-model",
    })
    expect(result.usingClientConfig).toBe(true)
  })

  it("returns null with no config from either source", () => {
    clearServerConfig()

    const result = resolveProviderConfig()

    expect(result.providerConfig).toBeNull()
    expect(result.usingClientConfig).toBe(false)
  })
})
