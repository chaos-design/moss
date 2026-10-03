import { formatCallDuration, type VoiceCallStatus } from "@/lib/call-runtime"
import type {
  ConversationInputMode,
  ConversationSession,
  StoredConversationMessage,
} from "@/lib/conversation-history"
import type { ConversationScene } from "@/lib/conversation-scenes"

export type ConversationMessage = StoredConversationMessage & {
  transient?: boolean
  variant?: "error"
}

export type ConversationRuntimeState = {
  messages: ConversationMessage[]
  history: ConversationSession[]
  currentSessionId: string
  draft: string
  pending: boolean
  callActive: boolean
  callStatus: VoiceCallStatus
  callSeconds: number
  liveTranscript: string
  muted: boolean
  speakerEnabled: boolean
  idlePrompt: string | null
  previewingVoice: string | null
}

export type ConversationRuntimeEvent =
  | { type: "history-updated"; history: ConversationSession[] }
  | { type: "draft-changed"; draft: string }
  | { type: "request-started" }
  | { type: "request-finished" }
  | { type: "message-committed"; messages: ConversationMessage[]; clearInput?: boolean }
  | { type: "call-started"; seconds?: number }
  | { type: "call-failed" }
  | { type: "call-ended" }
  | { type: "call-status-changed"; status: VoiceCallStatus }
  | { type: "call-ticked"; seconds: number }
  | { type: "transcript-changed"; transcript: string }
  | { type: "muted-changed"; muted: boolean }
  | { type: "speaker-changed"; enabled: boolean }
  | { type: "idle-prompt-changed"; prompt: string | null }
  | { type: "preview-changed"; voice: string | null }
  | { type: "session-restored"; session: ConversationSession }
  | {
      type: "session-reset"
      currentSessionId: string
      opening: ConversationMessage
    }

export function createMessageId(role: ConversationMessage["role"]) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createSessionId(sceneId: string) {
  return `${sceneId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createOpeningMessage(scene: ConversationScene): ConversationMessage {
  return {
    id: `${scene.id}-opening`,
    role: "assistant",
    content: scene.opening.content,
    translation: scene.opening.translation,
    note: "",
    timestamp: "00:00",
  }
}

export function createVisibleMessages(messages: ConversationMessage[]) {
  return messages.filter((message) => !message.transient)
}

export function createConversationRuntimeState(
  scene: ConversationScene,
): ConversationRuntimeState {
  return {
    messages: [createOpeningMessage(scene)],
    history: [],
    currentSessionId: createSessionId(scene.id),
    draft: "",
    pending: false,
    callActive: false,
    callStatus: "idle",
    callSeconds: 0,
    liveTranscript: "",
    muted: false,
    speakerEnabled: true,
    idlePrompt: null,
    previewingVoice: null,
  }
}

export function conversationRuntimeReducer(
  state: ConversationRuntimeState,
  event: ConversationRuntimeEvent,
): ConversationRuntimeState {
  switch (event.type) {
    case "history-updated":
      return { ...state, history: event.history }
    case "draft-changed":
      return { ...state, draft: event.draft }
    case "request-started":
      return {
        ...state,
        pending: true,
        callStatus: state.callActive ? "thinking" : state.callStatus,
      }
    case "request-finished":
      return { ...state, pending: false }
    case "message-committed":
      return {
        ...state,
        messages: event.messages,
        ...(event.clearInput ? { draft: "", liveTranscript: "" } : {}),
      }
    case "call-started":
      return {
        ...state,
        callActive: true,
        callStatus: "connecting",
        callSeconds: event.seconds ?? 0,
        muted: false,
        idlePrompt: null,
      }
    case "call-failed":
      return { ...state, callActive: false, callStatus: "idle" }
    case "call-ended":
      return {
        ...state,
        callActive: false,
        callStatus: "ended",
        liveTranscript: "",
        idlePrompt: null,
      }
    case "call-status-changed":
      return { ...state, callStatus: event.status }
    case "call-ticked":
      return { ...state, callSeconds: event.seconds }
    case "transcript-changed":
      return { ...state, liveTranscript: event.transcript }
    case "muted-changed":
      return { ...state, muted: event.muted }
    case "speaker-changed":
      return { ...state, speakerEnabled: event.enabled }
    case "idle-prompt-changed":
      return { ...state, idlePrompt: event.prompt }
    case "preview-changed":
      return { ...state, previewingVoice: event.voice }
    case "session-restored":
      return {
        ...state,
        currentSessionId: event.session.id,
        messages: event.session.messages,
        draft: "",
        pending: false,
        callStatus: "idle",
        callSeconds: event.session.durationSeconds,
        liveTranscript: "",
      }
    case "session-reset":
      return {
        ...state,
        currentSessionId: event.currentSessionId,
        messages: [event.opening],
        draft: "",
        pending: false,
        callActive: false,
        callStatus: "idle",
        callSeconds: 0,
        liveTranscript: "",
        muted: false,
        idlePrompt: null,
      }
  }
}

export function createUserMessage(
  content: string,
  inputMode: ConversationInputMode,
  elapsedSeconds: number,
): ConversationMessage {
  return {
    id: createMessageId("user"),
    role: "user",
    content,
    inputMode,
    translation: "",
    note: "",
    timestamp: formatCallDuration(elapsedSeconds),
  }
}
