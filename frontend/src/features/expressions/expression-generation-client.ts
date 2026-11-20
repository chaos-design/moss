import type { ExpressionGeneratedItem } from "@/lib/expression-library-schema"
import {
  getModelInferenceConfig,
  modelConfigStorageKey,
  parseLocalModelConfig,
} from "@/lib/model-config"
import {
  createModelConfigEnvelope,
  resetModelConfigPublicKey,
} from "@/lib/model-config-envelope"
import { describeHttpStatus, isUserFacingCopy, UserFacingError } from "@/lib/user-error"

type GenerationResponse = {
  data?: { items?: ExpressionGeneratedItem[] }
  error?: { code?: string; message?: string }
}

function readModelInferenceConfig() {
  if (typeof window === "undefined") {
    return null
  }
  const stored = window.localStorage.getItem(modelConfigStorageKey)
  return getModelInferenceConfig(parseLocalModelConfig(stored))
}

function envelopeError(result: GenerationResponse, fallback: string, status: number) {
  const message = result.error?.message
  if (isUserFacingCopy(message)) {
    return new UserFacingError(message, { status, code: result.error?.code ?? null })
  }
  return new UserFacingError(describeHttpStatus(status, fallback), { status })
}

/** 浏览器只发送加密后的模型配置，明文密钥不会进入网络请求预览。 */
export async function requestGeneratedExpressions(phrases: readonly string[]) {
  const modelConfig = readModelInferenceConfig()
  const fallback = "表达生成暂时不可用，请稍后重试。"
  const createRequestBody = async () => ({
    phrases: [...phrases],
    ...(modelConfig
      ? { modelConfigEnvelope: await createModelConfigEnvelope(modelConfig) }
      : {}),
  })
  const sendRequest = async () => {
    const response = await fetch("/api/expressions/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await createRequestBody()),
    })
    const result = (await response.json()) as GenerationResponse
    return { response, result }
  }

  let { response, result } = await sendRequest()
  if (
    response.status === 409 &&
    result.error?.code === "model_config_key_expired" &&
    modelConfig
  ) {
    resetModelConfigPublicKey()
    ;({ response, result } = await sendRequest())
  }

  if (!Array.isArray(result.data?.items)) {
    throw envelopeError(result, fallback, response.status)
  }
  return result.data.items
}
