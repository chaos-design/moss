import type { SupabaseClient } from "@supabase/supabase-js"
import type { AiProviderConfig } from "@/lib/ai-provider"
import { createEmbedding } from "./embedding-client"
import type { ConversationMemoryContextItem } from "./learning-memory"
import { findMemoryDocuments, upsertMemoryDocument } from "./memory-repository"

export type LongTermMemoryWrite = {
  sourceId: string
  sceneId: string
  sceneTitle: string
  label: string
  expression: string
  explanation: string
  accurate: boolean
}

export function mergeConversationMemories(
  local: ConversationMemoryContextItem[],
  retrieved: ConversationMemoryContextItem[],
  limit = 5,
) {
  const memories = new Map<string, ConversationMemoryContextItem>()
  for (const item of [...local, ...retrieved]) {
    const identity = `${item.label}:${item.expression}`.toLocaleLowerCase()
    const existing = memories.get(identity)
    if (!existing || item.strength < existing.strength) {
      memories.set(identity, item)
    }
  }
  return [...memories.values()].slice(0, limit)
}

export async function retrieveLongTermMemories({
  client,
  provider,
  query,
  sceneId,
  limit = 5,
}: {
  client: SupabaseClient
  provider: AiProviderConfig
  query: string
  sceneId: string
  limit?: number
}): Promise<ConversationMemoryContextItem[]> {
  const embedding = await createEmbedding(query, provider)
  if (!embedding) {
    return []
  }
  return findMemoryDocuments({ client, embedding, sceneId, limit })
}

export async function persistLongTermMemory({
  client,
  provider,
  userId,
  memory,
}: {
  client: SupabaseClient
  provider: AiProviderConfig
  userId: string
  memory: LongTermMemoryWrite
}) {
  const content = [
    `场景：${memory.sceneTitle}`,
    `学习任务：${memory.label}`,
    `表达：${memory.expression}`,
    `反馈：${memory.explanation}`,
  ].join("\n")
  const embedding = await createEmbedding(content, provider)
  if (!embedding) {
    return
  }

  await upsertMemoryDocument({
    client,
    userId,
    document: {
      sourceType: "conversation",
      sourceId: memory.sourceId,
      sceneId: memory.sceneId,
      memoryKind: memory.accurate ? "successful_expression" : "correction",
      content,
      metadata: {
        label: memory.label,
        expression: memory.expression,
        explanation: memory.explanation,
        sceneTitle: memory.sceneTitle,
      },
      strength: memory.accurate ? 72 : 42,
      embedding,
    },
  })
}

export async function resolveConversationMemory({
  client,
  provider,
  localMemory,
  query,
  sceneId,
}: {
  client: SupabaseClient | null
  provider: AiProviderConfig
  localMemory: ConversationMemoryContextItem[]
  query: string
  sceneId: string
}) {
  if (!client || !provider.embeddingModel) {
    return localMemory
  }

  try {
    const retrieved = await retrieveLongTermMemories({
      client,
      provider,
      query,
      sceneId,
    })
    return mergeConversationMemories(localMemory, retrieved)
  } catch {
    return localMemory
  }
}

export async function saveConversationMemory({
  client,
  provider,
  userId,
  memory,
}: {
  client: SupabaseClient | null
  provider: AiProviderConfig
  userId: string
  memory: LongTermMemoryWrite
}) {
  if (!client || !userId || !provider.embeddingModel) {
    return
  }

  try {
    await persistLongTermMemory({ client, provider, userId, memory })
  } catch {
    // Memory persistence is best effort and never invalidates a successful conversation turn.
  }
}
