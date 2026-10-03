import type { SupabaseClient } from "@supabase/supabase-js"
import type { ConversationMemoryContextItem } from "./learning-memory"

type LongTermMemoryRow = {
  id: string
  content: string
  scene_id: string
  memory_kind: string
  strength: number
  metadata: Record<string, unknown> | null
  similarity: number
}

export type StoredMemoryDocument = {
  sourceType: "conversation" | "review" | "shadowing"
  sourceId: string
  sceneId: string
  memoryKind: "successful_expression" | "correction" | "review" | "pronunciation"
  content: string
  metadata: Record<string, unknown>
  strength: number
  embedding: number[]
}

function parseLongTermMemoryRow(value: unknown): LongTermMemoryRow | null {
  if (!value || typeof value !== "object") {
    return null
  }
  const row = value as Partial<LongTermMemoryRow>
  if (
    typeof row.id !== "string" ||
    typeof row.content !== "string" ||
    typeof row.scene_id !== "string" ||
    typeof row.memory_kind !== "string" ||
    typeof row.strength !== "number" ||
    typeof row.similarity !== "number"
  ) {
    return null
  }
  return row as LongTermMemoryRow
}

export async function findMemoryDocuments({
  client,
  embedding,
  sceneId,
  limit,
}: {
  client: SupabaseClient
  embedding: number[]
  sceneId: string
  limit: number
}): Promise<ConversationMemoryContextItem[]> {
  const { data, error } = await client.rpc("match_long_term_memories", {
    p_match_count: Math.min(8, Math.max(1, limit)),
    p_min_similarity: 0.2,
    p_query_embedding: embedding,
    p_scene_id: sceneId,
  })
  if (error) {
    throw error
  }

  return (Array.isArray(data) ? data : [])
    .map(parseLongTermMemoryRow)
    .filter((row): row is LongTermMemoryRow => Boolean(row))
    .map((row) => {
      const metadata = row.metadata ?? {}
      return {
        id: row.id,
        label: typeof metadata.label === "string" ? metadata.label : row.memory_kind,
        expression: typeof metadata.expression === "string" ? metadata.expression : row.content,
        source: typeof metadata.sceneTitle === "string" ? metadata.sceneTitle : row.scene_id,
        guidance:
          typeof metadata.explanation === "string"
            ? metadata.explanation
            : `语义相关度 ${Math.round(row.similarity * 100)}%`,
        strength: Math.min(100, Math.max(0, Math.round(row.strength))),
      }
    })
}

export async function upsertMemoryDocument({
  client,
  userId,
  document,
}: {
  client: SupabaseClient
  userId: string
  document: StoredMemoryDocument
}) {
  const { error } = await client.from("learning_memory_documents").upsert(
    {
      user_id: userId,
      source_type: document.sourceType,
      source_id: document.sourceId,
      scene_id: document.sceneId,
      memory_kind: document.memoryKind,
      content: document.content,
      metadata: document.metadata,
      strength: document.strength,
      embedding: document.embedding,
    },
    {
      onConflict: "user_id,source_type,source_id",
    },
  )
  if (error) {
    throw error
  }
}
