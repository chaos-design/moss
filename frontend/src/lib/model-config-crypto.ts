import {
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  privateDecrypt,
} from "node:crypto"
import type { ModelConfigEnvelope, ModelConfigPublicKey } from "@/lib/model-config-envelope"

type ModelConfigKeyMaterial = {
  keyId: string
  privateKey: KeyObject
  publicKey: JsonWebKey
}

type ModelConfigCryptoGlobal = typeof globalThis & {
  __mossModelConfigKeyMaterial?: ModelConfigKeyMaterial
}

export class ModelConfigKeyExpiredError extends Error {
  constructor() {
    super("模型配置加密密钥已更新")
    this.name = "ModelConfigKeyExpiredError"
  }
}

function getKeyMaterial() {
  const globalStore = globalThis as ModelConfigCryptoGlobal
  if (globalStore.__mossModelConfigKeyMaterial) {
    return globalStore.__mossModelConfigKeyMaterial
  }

  const configuredPrivateKey = process.env.MODEL_CONFIG_PRIVATE_KEY_BASE64?.trim()
  const privateKey = configuredPrivateKey
    ? createPrivateKey({
        key: Buffer.from(configuredPrivateKey, "base64"),
        format: "der",
        type: "pkcs8",
      })
    : generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicExponent: 0x10001,
      }).privateKey
  const publicKey = createPublicKey(privateKey)
  const publicJwk = publicKey.export({ format: "jwk" })
  const keyId = createHash("sha256")
    .update(publicKey.export({ format: "der", type: "spki" }))
    .digest("base64url")
    .slice(0, 24)
  const material = {
    keyId,
    privateKey,
    publicKey: publicJwk,
  }
  globalStore.__mossModelConfigKeyMaterial = material
  return material
}

export function getModelConfigPublicKey(): ModelConfigPublicKey {
  const material = getKeyMaterial()
  return {
    keyId: material.keyId,
    publicKey: material.publicKey,
  }
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url")
}

export function decryptModelConfigEnvelope(envelope: ModelConfigEnvelope): unknown {
  const material = getKeyMaterial()
  if (envelope.keyId !== material.keyId) {
    throw new ModelConfigKeyExpiredError()
  }

  const contentKey = privateDecrypt(
    {
      key: material.privateKey,
      oaepHash: "sha256",
    },
    decodeBase64Url(envelope.wrappedKey),
  )
  const encrypted = decodeBase64Url(envelope.ciphertext)
  if (encrypted.length <= 16) {
    throw new Error("模型配置密文无效")
  }

  const authTag = encrypted.subarray(encrypted.length - 16)
  const ciphertext = encrypted.subarray(0, encrypted.length - 16)
  const decipher = createDecipheriv("aes-256-gcm", contentKey, decodeBase64Url(envelope.iv))
  decipher.setAAD(Buffer.from(envelope.keyId))
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(plaintext.toString("utf8"))
}
