import { describe, expect, it, vi } from "vitest"
import { GET } from "@/app/api/conversation/route"
import { decryptModelConfigEnvelope, getModelConfigPublicKey } from "@/lib/model-config-crypto"
import { encryptModelConfigWithKey } from "@/lib/model-config-envelope"

const modelConfig = {
  apiKey: "browser-secret",
  baseUrl: "https://api.example.com/v1",
  model: "example-model",
  apiType: "chat-completions" as const,
}

describe("model config envelope", () => {
  it("publishes a no-store public encryption key", async () => {
    const response = GET()
    const body = await response.json()

    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(body).toMatchObject({
      keyId: expect.any(String),
      publicKey: expect.objectContaining({ kty: "RSA" }),
    })
  })

  it("round-trips the config without exposing plaintext in the envelope", async () => {
    const envelope = await encryptModelConfigWithKey(modelConfig, getModelConfigPublicKey())

    expect(JSON.stringify(envelope)).not.toContain(modelConfig.apiKey)
    expect(JSON.stringify(envelope)).not.toContain(modelConfig.baseUrl)
    expect(decryptModelConfigEnvelope(envelope)).toEqual(modelConfig)
  })

  it("rejects modified ciphertext", async () => {
    const envelope = await encryptModelConfigWithKey(modelConfig, getModelConfigPublicKey())
    const firstCharacter = envelope.ciphertext[0]
    const modified = {
      ...envelope,
      ciphertext: `${firstCharacter === "A" ? "B" : "A"}${envelope.ciphertext.slice(1)}`,
    }

    expect(() => decryptModelConfigEnvelope(modified)).toThrow()
  })

  it("warns in production when the model-config key is not configured", () => {
    const globalStore = globalThis as { __mossModelConfigKeyMaterial?: unknown }
    const cached = globalStore.__mossModelConfigKeyMaterial
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      vi.stubEnv("NODE_ENV", "production")
      delete globalStore.__mossModelConfigKeyMaterial
      getModelConfigPublicKey()
      expect(warn).toHaveBeenCalledOnce()
      expect(String(warn.mock.calls[0]?.[0])).toContain("MODEL_CONFIG_PRIVATE_KEY_BASE64")

      warn.mockClear()
      vi.stubEnv("NODE_ENV", "development")
      delete globalStore.__mossModelConfigKeyMaterial
      getModelConfigPublicKey()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
      vi.unstubAllEnvs()
      delete globalStore.__mossModelConfigKeyMaterial
      if (cached) {
        globalStore.__mossModelConfigKeyMaterial = cached
      }
    }
  })
})
