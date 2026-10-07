// Learner-facing conversation preferences stay outside learning memory. Only the tutor-mode
// enum may enter inference requests; model credentials remain in their dedicated local store.

import {
  conversationContractTemplate,
  defaultConversationPrompt,
} from "./memory/conversation-prompt-text"

// "stacked": every turn aligns to the left, avatar + content in one column stream.
// "split": the learner's turns align right and the partner's align left, like a chat thread.
export type TranscriptLayout = "stacked" | "split"

// "enter": Enter sends, Shift+Enter inserts a newline (default).
// "shift-enter": Shift+Enter sends, Enter inserts a newline.
export type SendShortcut = "enter" | "shift-enter"

export type TutorMode = "natural" | "coach" | "english"

export type ConversationPrefs = {
  version: 6
  transcriptLayout: TranscriptLayout
  sendShortcut: SendShortcut
  tutorMode: TutorMode
  sessionResumeMinutes: number
  consecutiveQuestionDelayMs: number
  voiceSentenceDelayMs: number
  /**
   * The learner's own system prompt, used verbatim when non-empty.
   *
   * The learner owns the entire prompt. That includes the JSON output contract
   * `parseProviderConversation` reads, so removing it really does degrade reply parsing — the choice
   * is theirs, and the transcript names the prompt as the cause instead of degrading quietly.
   *
   * Keeping one field rather than a base plus an appended extra block is what makes the editor
   * usable: the textarea holds the text that will be sent, so what it shows is what it means.
   * It is a local preference and never enters learning memory.
   */
  conversationPrompt: string
}

export const conversationPrefsStorageKey = "moss:conversation-prefs:v1"

/**
 * Bounds the prompt. It has to hold the whole built-in text plus real edits, so the cap sits well
 * above the default length; the point is that a pasted document cannot dominate the system prompt,
 * the request, or the provider token budget.
 */
export const conversationPromptMaxLength = 12_000

export const defaultConversationPrefs: ConversationPrefs = {
  version: 6,
  transcriptLayout: "stacked",
  sendShortcut: "enter",
  tutorMode: "coach",
  sessionResumeMinutes: 30,
  consecutiveQuestionDelayMs: 500,
  voiceSentenceDelayMs: 1_800,
  conversationPrompt: "",
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

function normalizeConversationPrompt(value: unknown): string {
  if (typeof value !== "string") {
    return defaultConversationPrefs.conversationPrompt
  }
  // Collapse the line endings a paste can carry so the stored prompt stays stable, then bound it.
  return value.replace(/\r\n?/g, "\n").trim().slice(0, conversationPromptMaxLength)
}

/**
 * Resolves the prompt text for a stored record, migrating the two earlier shapes.
 *
 * v4 appended a supplement after an immutable base prompt; v5 replaced only the instruction half.
 * Both produce the same effective prompt when the learner's text is spliced onto the right base, so
 * neither upgrade silently changes what gets sent. A record that already carries the full prompt is
 * left exactly as written.
 */
function migrateConversationPrompt(parsed: Record<string, unknown>) {
  if (typeof parsed.conversationPrompt === "string") {
    return parsed.conversationPrompt
  }
  const legacySupplement =
    typeof parsed.promptSupplement === "string" ? parsed.promptSupplement.trim() : ""
  if (legacySupplement) {
    return `${defaultConversationPrompt}\n\n## Learner-Added Instructions\n\n${legacySupplement}`
  }
  const legacyInstructions =
    typeof parsed.conversationInstructions === "string"
      ? parsed.conversationInstructions.trim()
      : ""
  if (legacyInstructions) {
    return `${legacyInstructions}\n\n${conversationContractTemplate}`
  }
  return ""
}

export function isTutorMode(value: unknown): value is TutorMode {
  return value === "natural" || value === "coach" || value === "english"
}

export function parseConversationPrefs(value: string | null): ConversationPrefs {
  if (!value) {
    return defaultConversationPrefs
  }

  try {
    const parsed = JSON.parse(value) as Partial<ConversationPrefs> & Record<string, unknown>
    return {
      version: 6,
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
      conversationPrompt: normalizeConversationPrompt(migrateConversationPrompt(parsed)),
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
