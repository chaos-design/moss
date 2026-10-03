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
import type { ConversationMessage } from "./conversation-machine"

type ConversationResponse = {
  data?: Omit<ConversationResponseData, "inputAnalysis" | "validation"> & {
    inputAnalysis?: ConversationInputAnalysis
    validation?: ExpressionValidation
  }
  error?: {
    code?: string
    message: string
  }
}

type ConversationTransportInput = {
  scene: ConversationScene
  memoryContext: ConversationMemoryContextItem[]
  messages: ConversationMessage[]
  signal: AbortSignal
  tutorMode: TutorMode
}

function readModelInferenceConfig() {
  if (typeof window === "undefined") {
    return null
  }
  const stored = window.localStorage.getItem(modelConfigStorageKey)
  return getModelInferenceConfig(parseLocalModelConfig(stored))
}

type TranslationResponse = {
  data?: { translation?: string }
  error?: { code?: string; message?: string }
}

export async function requestConversationTranslation(text: string) {
  const modelConfig = readModelInferenceConfig()
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

  let response = await sendRequest()
  let result = (await response.json()) as TranslationResponse
  if (
    response.status === 409 &&
    result.error?.code === "model_config_key_expired" &&
    modelConfig
  ) {
    resetModelConfigPublicKey()
    response = await sendRequest()
    result = (await response.json()) as TranslationResponse
  }
  if (!response.ok || !result.data?.translation) {
    throw new Error(result.error?.message || "翻译服务暂时不可用")
  }
  return result.data.translation
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
  signal,
  tutorMode,
}: ConversationTransportInput) {
  const modelConfig = readModelInferenceConfig()
  const requestMessages = createConversationRequestMessages(messages)
  const createRequestBody = async () => ({
    sceneId: scene.id,
    language: "auto" as const,
    tutorMode,
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

  let response = await sendRequest()
  let result = (await response.json()) as ConversationResponse
  if (
    response.status === 409 &&
    result.error?.code === "model_config_key_expired" &&
    modelConfig
  ) {
    resetModelConfigPublicKey()
    response = await sendRequest()
    result = (await response.json()) as ConversationResponse
  }
  if (!response.ok || !result.data) {
    throw new Error(result.error?.message || "对话服务暂时不可用")
  }

  return result.data
}

export function isConversationAbort(error: unknown, signal: AbortSignal) {
  return signal.aborted || (error instanceof DOMException && error.name === "AbortError")
}
