import type {
  ConversationInputAnalysis,
  ConversationResponseData,
  ExpressionValidation,
} from "@/lib/conversation-feedback"
import type { TutorMode } from "@/lib/conversation-prefs"
import type { ConversationScene } from "@/lib/conversation-scenes"
import type { ConversationMemoryContextItem } from "@/lib/memory"
import {
  getModelInferenceConfig,
  modelConfigStorageKey,
  parseLocalModelConfig,
} from "@/lib/model-config"
import {
  createModelConfigEnvelope,
  resetModelConfigPublicKey,
} from "@/lib/model-config-envelope"
import {
  describeHttpStatus,
  isAbortError,
  isUserFacingCopy,
  toUserFacingError,
  UserFacingError,
} from "@/lib/user-error"
import type { ConversationMessage } from "./conversation-machine"

type ConversationResponse = {
  data?: Omit<ConversationResponseData, "inputAnalysis" | "validation"> & {
    inputAnalysis?: ConversationInputAnalysis
    validation?: ExpressionValidation
  }
  error?: {
    code?: string
    message?: string
  }
}

type ConversationTransportInput = {
  scene: ConversationScene
  memoryContext: ConversationMemoryContextItem[]
  messages: ConversationMessage[]
  conversationPrompt?: string
  signal: AbortSignal
  tutorMode: TutorMode
}

type TranslationResponse = {
  data?: { translation?: string }
  error?: { code?: string; message?: string }
}

function readModelInferenceConfig() {
  if (typeof window === "undefined") {
    return null
  }
  const stored = window.localStorage.getItem(modelConfigStorageKey)
  return getModelInferenceConfig(parseLocalModelConfig(stored))
}

/**
 * Mirrors the translation route's own admission rule: a request is served when it either carries a
 * signed-in session or a complete client-side model config. The route rejects with 401 only when
 * both are missing, so the client must not demand sign-in in the case the route would have served.
 */
export function canRequestTranslation() {
  return readModelInferenceConfig() !== null
}

/**
 * Runs one request plus parse attempt. Transport failures and non-JSON bodies become
 * `UserFacingError` here, because both would otherwise reach the transcript as a raw
 * `TypeError: Failed to fetch` or `SyntaxError`. Aborts stay aborts so callers keep their
 * interrupt semantics. HTTP status interpretation is left to the caller so the
 * `model_config_key_expired` retry can still inspect the envelope.
 */
async function requestEnvelope<T>(
  send: () => Promise<Response>,
  fallback: string,
  signal?: AbortSignal,
): Promise<{ response: Response; result: T }> {
  let response: Response
  try {
    response = await send()
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw error
    }
    throw toUserFacingError(error, fallback)
  }

  let result: T | null = null
  try {
    result = (await response.json()) as T
  } catch {
    result = null
  }
  if (result === null) {
    throw new UserFacingError(describeHttpStatus(response.status, fallback), {
      status: response.status,
    })
  }

  return { response, result }
}

const modelConfigExpiredCode = "model_config_key_expired"

/** Curated server copy wins; upstream or malformed copy falls back to the caller's own message. */
function envelopeError(
  result: { error?: { code?: string; message?: string } },
  fallback: string,
  status: number,
) {
  const message = result.error?.message
  if (isUserFacingCopy(message)) {
    return new UserFacingError(message, { status, code: result.error?.code ?? null })
  }
  return new UserFacingError(describeHttpStatus(status, fallback), { status })
}

export async function requestConversationTranslation(text: string) {
  const modelConfig = readModelInferenceConfig()
  const fallback = "翻译服务暂时不可用，请稍后重试。"
  const createRequestBody = async () => ({
    text,
    ...(modelConfig
      ? { modelConfigEnvelope: await createModelConfigEnvelope(modelConfig) }
      : {}),
  })
  const sendRequest = async () =>
    fetch("/api/translation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await createRequestBody()),
    })

  const { response, result } = await requestEnvelope<TranslationResponse>(sendRequest, fallback)
  const expired = response.status === 409 && result.error?.code === modelConfigExpiredCode
  let envelope = result
  if (expired && modelConfig) {
    resetModelConfigPublicKey()
    envelope = (await requestEnvelope<TranslationResponse>(sendRequest, fallback)).result
  }

  if (!envelope.data?.translation) {
    throw envelopeError(envelope, fallback, expired ? 200 : response.status)
  }
  return envelope.data.translation
}

export function createConversationRequestMessages(messages: ConversationMessage[]) {
  return messages
    .filter((message) => !message.transient)
    .map(({ role, content }) => ({ role, content }))
}

export async function requestConversationReply({
  scene,
  memoryContext,
  messages,
  conversationPrompt,
  signal,
  tutorMode,
}: ConversationTransportInput) {
  const modelConfig = readModelInferenceConfig()
  const fallback = "对话服务暂时不可用，请稍后重试。"
  const requestMessages = createConversationRequestMessages(messages)
  const createRequestBody = async () => ({
    sceneId: scene.id,
    language: "auto" as const,
    tutorMode,
    // Only sent when non-empty, so the default request shape is unchanged.
    ...(conversationPrompt ? { conversationPrompt } : {}),
    memory: {
      shortTerm: {
        sceneId: scene.id,
        activeGoal: scene.objective,
        turnCount: messages.length,
        recentUserInputs: messages
          .filter((message) => message.role === "user")
          .slice(-3)
          .map((message) => message.content),
      },
      longTerm: memoryContext,
    },
    messages: requestMessages,
    ...(modelConfig
      ? { modelConfigEnvelope: await createModelConfigEnvelope(modelConfig) }
      : {}),
  })
  const sendRequest = async () =>
    fetch("/api/conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await createRequestBody()),
      signal,
    })

  const { response, result } = await requestEnvelope<ConversationResponse>(
    sendRequest,
    fallback,
    signal,
  )
  const expired = response.status === 409 && result.error?.code === modelConfigExpiredCode
  if (expired && modelConfig) {
    resetModelConfigPublicKey()
    const retried = await requestEnvelope<ConversationResponse>(sendRequest, fallback, signal)
    if (!retried.result.data) {
      throw envelopeError(retried.result, fallback, retried.response.status)
    }
    return retried.result.data
  }
  if (!result.data) {
    throw envelopeError(result, fallback, response.status)
  }

  return result.data
}

export function isConversationAbort(error: unknown, signal: AbortSignal) {
  return signal.aborted || isAbortError(error)
}
