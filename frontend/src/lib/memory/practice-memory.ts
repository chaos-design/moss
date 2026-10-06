import type { SupabaseClient } from "@supabase/supabase-js"
import type { AiProviderConfig } from "@/lib/ai-provider"
import { createEmbedding } from "./embedding-client"
import { upsertMemoryDocument } from "./memory-repository"
import type { RecallRating } from "./spaced-repetition"

type PracticeMemoryBase = {
  sourceId: string
  sceneId: string
  sceneTitle: string
  label: string
  expression: string
  explanation: string
  strength: number
}

export type PracticeMemoryWrite =
  | (PracticeMemoryBase & {
      sourceType: "review"
      rating: RecallRating
      successful: boolean
    })
  | (PracticeMemoryBase & {
      sourceType: "shadowing"
      overallScore: number
      clarityScore: number
      fluencyScore: number
      rhythmScore: number
      durationSeconds: number
      focusWord: string
    })
  | (PracticeMemoryBase & {
      sourceType: "expression"
      libraryKind: string
      example: string
    })

function createPracticeMemoryContent(memory: PracticeMemoryWrite) {
  const result =
    memory.sourceType === "review"
      ? `复习结果：${memory.rating}，${memory.successful ? "成功找回" : "需要再次练习"}`
      : memory.sourceType === "shadowing"
        ? [
            `跟读重点：${memory.focusWord}`,
            `综合 ${memory.overallScore}，清晰度 ${memory.clarityScore}，连贯度 ${memory.fluencyScore}，节奏 ${memory.rhythmScore}`,
          ].join("\n")
        : [`表达类型：${memory.libraryKind}`, `例句：${memory.example}`].join("\n")

  return [
    `场景：${memory.sceneTitle}`,
    `学习任务：${memory.label}`,
    `表达：${memory.expression}`,
    `反馈：${memory.explanation}`,
    result,
  ].join("\n")
}

export async function persistPracticeMemory({
  client,
  provider,
  userId,
  memory,
}: {
  client: SupabaseClient
  provider: AiProviderConfig
  userId: string
  memory: PracticeMemoryWrite
}) {
  const content = createPracticeMemoryContent(memory)
  const embedding = await createEmbedding(content, provider)
  if (!embedding) {
    return false
  }

  await upsertMemoryDocument({
    client,
    userId,
    document: {
      sourceType: memory.sourceType,
      sourceId: memory.sourceId,
      sceneId: memory.sceneId,
      memoryKind:
        memory.sourceType === "review"
          ? "review"
          : memory.sourceType === "shadowing"
            ? "pronunciation"
            : "expression_library",
      content,
      metadata: {
        label: memory.label,
        expression: memory.expression,
        explanation: memory.explanation,
        sceneTitle: memory.sceneTitle,
        ...(memory.sourceType === "review"
          ? {
              rating: memory.rating,
              successful: memory.successful,
            }
          : memory.sourceType === "shadowing"
            ? {
                focusWord: memory.focusWord,
                overallScore: memory.overallScore,
                clarityScore: memory.clarityScore,
                fluencyScore: memory.fluencyScore,
                rhythmScore: memory.rhythmScore,
                durationSeconds: memory.durationSeconds,
              }
            : {
                libraryKind: memory.libraryKind,
                example: memory.example,
              }),
      },
      strength: memory.strength,
      embedding,
    },
  })
  return true
}
