// Learner-facing conversation preferences stay outside learning memory. Only the tutor-mode
// enum may enter inference requests; model credentials remain in their dedicated local store.

// "stacked": every turn aligns to the left, avatar + content in one column stream.
// "split": the learner's turns align right and the partner's align left, like a chat thread.
export type TranscriptLayout = "stacked" | "split"

// "enter": Enter sends, Shift+Enter inserts a newline (default).
// "shift-enter": Shift+Enter sends, Enter inserts a newline.
export type SendShortcut = "enter" | "shift-enter"

export type TutorMode = "natural" | "coach" | "english"

export type ConversationPrefs = {
  version: 4
  transcriptLayout: TranscriptLayout
  sendShortcut: SendShortcut
  tutorMode: TutorMode
  sessionResumeMinutes: number
  consecutiveQuestionDelayMs: number
  voiceSentenceDelayMs: number
  /**
   * Learner-authored additions to the conversation system prompt.
   *
   * The base prompt in `src/lib/memory/prompts` stays immutable: it owns the JSON output contract
   * that `parseConversationReply` depends on, so a learner who deleted or rewrote that block would
   * break reply parsing for themselves. This field is appended after the base prompt instead, which
   * lets a learner steer tone, focus, and correction strictness without being able to corrupt the
   * wire format. It is a local preference and never enters learning memory.
   */
  promptSupplement: string
}

export const conversationPrefsStorageKey = "moss:conversation-prefs:v1"

/** Bounds the supplement so a pasted document cannot dominate the system prompt or the request. */
export const promptSupplementMaxLength = 2_000

export const defaultConversationPrefs: ConversationPrefs = {
  version: 4,
  transcriptLayout: "stacked",
  sendShortcut: "enter",
  tutorMode: "coach",
  sessionResumeMinutes: 30,
  consecutiveQuestionDelayMs: 500,
  voiceSentenceDelayMs: 1_800,
  promptSupplement: "",
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback
}

function isTranscriptLayout(value: unknown): value is TranscriptLayout {
  return value === "stacked" || value === "split"
}

function isSendShortcut(value: unknown): value is SendShortcut {
  return value === "enter" || value === "shift-enter"
}

function normalizePromptSupplement(value: unknown): string {
  if (typeof value !== "string") {
    return defaultConversationPrefs.promptSupplement
  }
  // Collapse the line endings a paste can carry so the appended block stays stable, then bound it.
  return value.replace(/\r\n?/g, "\n").trim().slice(0, promptSupplementMaxLength)
}

export function isTutorMode(value: unknown): value is TutorMode {
  return value === "natural" || value === "coach" || value === "english"
}

export function parseConversationPrefs(value: string | null): ConversationPrefs {
  if (!value) {
    return defaultConversationPrefs
  }

  try {
    const parsed = JSON.parse(value) as Partial<ConversationPrefs>
    return {
      version: 4,
      transcriptLayout: isTranscriptLayout(parsed.transcriptLayout)
        ? parsed.transcriptLayout
        : defaultConversationPrefs.transcriptLayout,
      sendShortcut: isSendShortcut(parsed.sendShortcut)
        ? parsed.sendShortcut
        : defaultConversationPrefs.sendShortcut,
      tutorMode: isTutorMode(parsed.tutorMode)
        ? parsed.tutorMode
        : defaultConversationPrefs.tutorMode,
      sessionResumeMinutes: clampNumber(
        parsed.sessionResumeMinutes,
        defaultConversationPrefs.sessionResumeMinutes,
        5,
        240,
      ),
      consecutiveQuestionDelayMs: clampNumber(
        parsed.consecutiveQuestionDelayMs,
        defaultConversationPrefs.consecutiveQuestionDelayMs,
        0,
        3_000,
      ),
      voiceSentenceDelayMs: clampNumber(
        parsed.voiceSentenceDelayMs,
        defaultConversationPrefs.voiceSentenceDelayMs,
        800,
        5_000,
      ),
      promptSupplement: normalizePromptSupplement(parsed.promptSupplement),
    }
  } catch {
    return defaultConversationPrefs
  }
}

// True when the keyboard event should send the message given the configured shortcut.
// Enter mode: bare Enter sends, Shift+Enter is a newline.
// Shift+Enter mode: Shift+Enter sends, bare Enter is a newline.
// IME composition (isComposing) never triggers a send.
export function shouldSendOnKey(
  shortcut: SendShortcut,
  event: { key: string; shiftKey: boolean; isComposing?: boolean },
): boolean {
  if (event.key !== "Enter" || event.isComposing) {
    return false
  }
  return shortcut === "enter" ? !event.shiftKey : event.shiftKey
}
