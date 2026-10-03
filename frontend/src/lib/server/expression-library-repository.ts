import type { SupabaseClient } from "@supabase/supabase-js"
import type { ExpressionLibraryItem } from "@/lib/expression-library-schema"
import { parseImportedExpressionItem } from "@/lib/expression-library-validation"

export const expressionLibraryPageSize = 200

type ExpressionLibraryRow = {
  id?: unknown
  client_id?: unknown
  phrase?: unknown
  meaning?: unknown
  reasoning?: unknown
  origin_note?: unknown
  example?: unknown
  context?: unknown
  kind?: unknown
  scene_category?: unknown
  created_at?: unknown
  updated_at?: unknown
}

function parseExpressionRow(row: ExpressionLibraryRow) {
  return parseImportedExpressionItem({
    id: typeof row.id === "string" ? `imported:${row.id}` : undefined,
    clientId: row.client_id,
    phrase: row.phrase,
    meaning: row.meaning,
    why: row.reasoning,
    origin: row.origin_note,
    example: row.example,
    context: row.context,
    kind: row.kind,
    sceneCategory: row.scene_category,
    source: "imported",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function createExpressionRow(item: ExpressionLibraryItem, userId: string) {
  return {
    client_id: item.clientId,
    context: item.context,
    example: item.example,
    kind: item.kind,
    meaning: item.meaning,
    origin_note: item.origin,
    phrase: item.phrase,
    reasoning: item.why,
    scene_category: item.sceneCategory,
    user_id: userId,
  }
}

export async function listExpressionLibraryItems({
  client,
  offset = 0,
  pageSize = expressionLibraryPageSize,
  userId,
}: {
  client: SupabaseClient
  offset?: number
  pageSize?: number
  userId: string
}) {
  const { data, error } = await client
    .from("expression_library_items")
    .select(
      "id,client_id,phrase,meaning,reasoning,origin_note,example,context,kind,scene_category,created_at,updated_at",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("client_id", { ascending: true })
    .range(offset, offset + pageSize)

  if (error) {
    throw error
  }
  const rows = Array.isArray(data) ? (data as ExpressionLibraryRow[]) : []
  const parsedItems = rows.slice(0, pageSize).map(parseExpressionRow)
  if (parsedItems.some((item) => item === null)) {
    throw new Error("Expression library query returned an invalid row.")
  }
  return {
    nextOffset: rows.length > pageSize ? offset + pageSize : null,
    items: parsedItems.filter((item): item is ExpressionLibraryItem => item !== null),
  }
}

export async function upsertExpressionLibraryItems({
  client,
  items,
  userId,
}: {
  client: SupabaseClient
  items: readonly ExpressionLibraryItem[]
  userId: string
}) {
  const rows = items.map((item) => createExpressionRow(item, userId))
  const { error } = await client
    .from("expression_library_items")
    .upsert(rows, { onConflict: "user_id,scene_category,normalized_phrase" })
  if (error) {
    throw error
  }
}

export async function updateExpressionLibraryItem({
  client,
  item,
  userId,
}: {
  client: SupabaseClient
  item: ExpressionLibraryItem
  userId: string
}) {
  const { error } = await client
    .from("expression_library_items")
    .upsert([createExpressionRow(item, userId)], { onConflict: "user_id,client_id" })
  if (error) {
    throw error
  }
}

export async function deleteExpressionLibraryItem({
  client,
  clientId,
  userId,
}: {
  client: SupabaseClient
  clientId: string
  userId: string
}) {
  const { error } = await client
    .from("expression_library_items")
    .delete()
    .eq("user_id", userId)
    .eq("client_id", clientId)
  if (error) {
    throw error
  }
}
