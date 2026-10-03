import type { ModelInferenceConfig } from "@/lib/model-config"

export type ModelConfigEnvelope = {
  version: 1
  keyId: string
  wrappedKey: string
  iv: string
  ciphertext: string
}

export type ModelConfigPublicKey = {
  keyId: string
  publicKey: JsonWebKey
}

let publicKeyPromise: Promise<ModelConfigPublicKey> | null = null

function encodeBase64Url(value: ArrayBuffer) {
  const bytes = new Uint8Array(value)
  let binary = ""
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0)
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "")
}

async function loadPublicKey() {
  const response = await fetch("/api/conversation", {
    cache: "no-store",
    credentials: "same-origin",
  })
  if (!response.ok) {
    throw new Error("无法准备模型配置加密通道")
  }
  return (await response.json()) as ModelConfigPublicKey
}

export function resetModelConfigPublicKey() {
  publicKeyPromise = null
}

export async function encryptModelConfigWithKey(
  config: ModelInferenceConfig,
  key: ModelConfigPublicKey,
): Promise<ModelConfigEnvelope> {
  const rsaKey = await crypto.subtle.importKey(
    "jwk",
    key.publicKey,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  )
  const contentKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
  ])
  const rawContentKey = await crypto.subtle.exportKey("raw", contentKey)
  const wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsaKey, rawContentKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const additionalData = new TextEncoder().encode(key.keyId)
  const plaintext = new TextEncoder().encode(JSON.stringify(config))
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData, tagLength: 128 },
    contentKey,
    plaintext,
  )

  return {
    version: 1,
    keyId: key.keyId,
    wrappedKey: encodeBase64Url(wrappedKey),
    iv: encodeBase64Url(iv.buffer),
    ciphertext: encodeBase64Url(ciphertext),
  }
}

export async function createModelConfigEnvelope(config: ModelInferenceConfig) {
  publicKeyPromise ??= loadPublicKey().catch((error) => {
    publicKeyPromise = null
    throw error
  })
  return encryptModelConfigWithKey(config, await publicKeyPromise)
}
