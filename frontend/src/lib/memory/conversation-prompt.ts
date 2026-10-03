import { analyzeConversationInput } from "@/lib/conversation-feedback"
import type { TutorMode } from "@/lib/conversation-prefs"
import { getConversationScene } from "@/lib/conversation-scenes"
import type {
  ConversationMemoryContextItem,
  ConversationMemoryPayload,
  ConversationShortTermMemory,
} from "./learning-memory"
import { loadPromptTemplate, renderPromptTemplate } from "./prompt-template"

export type ConversationPromptTurn = {
  role: "assistant" | "user"
  content: string
}

export type ConversationPromptInput = {
  sceneId: string
  language: "auto" | "bilingual" | "english"
  tutorMode?: TutorMode
  memory?: ConversationMemoryPayload | ConversationMemoryContextItem[]
  messages: ConversationPromptTurn[]
}

const conversationPromptTemplate = loadPromptTemplate("conversation-system.md")

export function getLongTermMemory(request: ConversationPromptInput) {
  if (!request.memory) {
    return []
  }
  return Array.isArray(request.memory) ? request.memory : request.memory.longTerm
}

export function getShortTermMemory(
  request: ConversationPromptInput,
): ConversationShortTermMemory | null {
  return request.memory && !Array.isArray(request.memory) ? request.memory.shortTerm : null
}

export function getUnansweredUserInputs(messages: ConversationPromptTurn[]) {
  const inputs: string[] = []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === "assistant") {
      break
    }
    if (message?.role === "user") {
      inputs.unshift(message.content)
    }
  }
  return inputs
}

function formatLongTermMemory(memory: ConversationMemoryContextItem[]) {
  return (
    memory
      .map(
        (item) =>
          `${item.label}: "${item.expression}" (learned in ${item.source}, memory strength ${item.strength}%, ${item.guidance})`,
      )
      .join(" | ") || "No relevant long-term memory is available yet."
  )
}

function getLanguageInstruction(
  language: ConversationPromptInput["language"],
  inputLanguage: ReturnType<typeof analyzeConversationInput>["language"],
  tutorMode: TutorMode,
) {
  if (language === "english" || tutorMode === "english") {
    return "Use English in every learner-facing field and leave translation empty, even when the learner asks in Chinese."
  }
  return inputLanguage === "english"
    ? "Keep reply in English and include a concise Chinese translation."
    : "Use Chinese only for explanation and translation; keep the taught expression and role-play reply in English."
}

function getTutorModeInstruction(tutorMode: TutorMode) {
  if (tutorMode === "natural") {
    return "Prioritize uninterrupted role-play. Mark a scene reply as improve only when an error blocks meaning or would cause a real misunderstanding; otherwise keep feedback minimal."
  }
  if (tutorMode === "english") {
    return "Maintain full English immersion. Keep recall cues, correction explanations, issue explanations, and practice support concise and in English."
  }
  return "Coach gently after responding to meaning. Correct up to three high-impact issues and include practical examples when correction or guidance is useful."
}

export function createConversationPrompt(
  request: ConversationPromptInput,
  longTermMemory: ConversationMemoryContextItem[],
) {
  const tutorMode = request.tutorMode ?? "coach"
  const scene = getConversationScene(request.sceneId)
  const shortTermMemory = getShortTermMemory(request)
  const latestUserInput =
    [...request.messages].reverse().find((message) => message.role === "user")?.content ?? ""
  const unansweredUserInputs = getUnansweredUserInputs(request.messages)
  const inputAnalysis = analyzeConversationInput(latestUserInput)
  const targetExpressions = Array.from(
    new Set([
      ...scene.focusPhrases.map(([, phrase]) => phrase),
      ...(scene.expressionNotes?.map((note) => note.phrase) ?? []),
    ]),
  )

  return renderPromptTemplate(conversationPromptTemplate, {
    sceneTitle: scene.title,
    sceneEnglishTitle: scene.englishTitle,
    partnerRole: scene.partnerRole,
    objective: scene.objective,
    targetExpressions: targetExpressions.join("; "),
    shortTermMemory: shortTermMemory
      ? `goal: ${shortTermMemory.activeGoal}; ${shortTermMemory.turnCount} turns in this scene; recent learner inputs: ${shortTermMemory.recentUserInputs.join(" | ")}`
      : `${request.messages.length} recent conversation turns`,
    longTermMemory: formatLongTermMemory(longTermMemory),
    inputLanguage: inputAnalysis.language,
    inputIntent: inputAnalysis.intent,
    unansweredUserInputs: unansweredUserInputs.join(" | ") || "None",
    languageInstruction: getLanguageInstruction(
      request.language,
      inputAnalysis.language,
      tutorMode,
    ),
    tutorModeInstruction: getTutorModeInstruction(tutorMode),
  })
}
