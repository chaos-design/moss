import { afterEach, describe, expect, it, vi } from "vitest"
import { getAiProviderConfig } from "@/lib/ai-provider"
import { isDemoMode } from "@/lib/runtime-mode"
import { getSupabasePublicConfig } from "@/lib/supabase/config"

const environmentKeys = [
  "AI_API_KEY",
  "AI_API_TYPE",
  "AI_BASE_URL",
  "AI_EMBEDDING_MODEL",
  "AI_MODEL",
  "AI_MODEL_NAME",
  "NEXT_PUBLIC_DEMO_MODE",
  "NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const

function clearRuntimeConfig() {
  for (const key of environmentKeys) {
    vi.stubEnv(key, "")
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("getSupabasePublicConfig", () => {
  it("prefers the current publishable key", () => {
    clearRuntimeConfig()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy")

    expect(getSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "publishable",
      googleAuthEnabled: false,
    })
  })

  it("supports the legacy anon key", () => {
    clearRuntimeConfig()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy")

    expect(getSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "legacy",
      googleAuthEnabled: false,
    })
  })

  it("only enables Google login when the provider is explicitly configured", () => {
    clearRuntimeConfig()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED", "true")

    expect(getSupabasePublicConfig()?.googleAuthEnabled).toBe(true)
  })

  it("returns null for incomplete Supabase configuration", () => {
    clearRuntimeConfig()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")

    expect(getSupabasePublicConfig()).toBeNull()
  })
})

describe("getAiProviderConfig", () => {
  it("prefers AI_MODEL_NAME and supports AI_MODEL as a fallback", () => {
    clearRuntimeConfig()
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_API_KEY", "secret")
    vi.stubEnv("AI_MODEL_NAME", "current-model")
    vi.stubEnv("AI_MODEL", "legacy-model")

    expect(getAiProviderConfig()).toEqual({
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret",
      model: "current-model",
      apiType: "chat-completions",
    })

    vi.stubEnv("AI_MODEL_NAME", "")
    expect(getAiProviderConfig()?.model).toBe("legacy-model")
  })

  it("supports Anthropic Messages API configuration", () => {
    clearRuntimeConfig()
    vi.stubEnv("AI_BASE_URL", "https://api.anthropic.com/v1")
    vi.stubEnv("AI_API_KEY", "secret")
    vi.stubEnv("AI_MODEL_NAME", "claude-sonnet")

    expect(getAiProviderConfig()).toMatchObject({
      apiType: "anthropic-messages",
    })

    vi.stubEnv("AI_API_TYPE", "chat-completions")
    expect(getAiProviderConfig()).toMatchObject({
      apiType: "chat-completions",
    })
  })

  it("includes the optional embedding model for vector memory", () => {
    clearRuntimeConfig()
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_API_KEY", "secret")
    vi.stubEnv("AI_MODEL_NAME", "current-model")
    vi.stubEnv("AI_EMBEDDING_MODEL", "text-embedding-model")

    expect(getAiProviderConfig()).toMatchObject({
      embeddingModel: "text-embedding-model",
    })
  })

  it("returns null for incomplete AI provider configuration", () => {
    clearRuntimeConfig()
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1")
    vi.stubEnv("AI_MODEL_NAME", "current-model")

    expect(getAiProviderConfig()).toBeNull()
  })
})

describe("isDemoMode", () => {
  it("only enables demo mode through an explicit true value", () => {
    clearRuntimeConfig()
    expect(isDemoMode()).toBe(false)

    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")
    expect(isDemoMode()).toBe(true)

    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "TRUE")
    expect(isDemoMode()).toBe(false)
  })
})
