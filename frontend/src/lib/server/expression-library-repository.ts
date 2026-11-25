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
  example_translation?: unknown
  usage_note?: unknown
  memory_tip?: unknown
  extra_examples?: unknown
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
    exampleTranslation: row.example_translation,
    usage: row.usage_note,
    memoryTip: row.memory_tip,
    examples: row.extra_examples,
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
    example_translation: item.exampleTranslation ?? null,
    // extra_examples 是 jsonb 列且表约束 CHECK (jsonb_typeof(x) = 'array')。
    // 必须始终是数组：既不能 JSON.stringify 成字符串标量（jsonb_typeof='string'），
    // 也不能传 null（PostgREST 把 JSON null 映射成 'null'::jsonb，jsonb_typeof='null'），
    // 两者都会触发 23514 让整批导入 502。无拓展例句时写空数组。
    extra_examples: item.examples ?? [],
    kind: item.kind,
    meaning: item.meaning,
    memory_tip: item.memoryTip ?? null,
    origin_note: item.origin,
    phrase: item.phrase,
    reasoning: item.why,
    scene_category: item.sceneCategory,
    usage_note: item.usage ?? null,
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
      "id,client_id,phrase,meaning,reasoning,origin_note,example,example_translation,usage_note,memory_tip,extra_examples,context,kind,scene_category,created_at,updated_at",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("client_id", { ascending: true })
    .range(offset, offset + pageSize)

  if (error) {
    throw error
  }
  const rows = Array.isArray(data) ? (data as ExpressionLibraryRow[]) : []
  // 单条脏数据只跳过，不让一条历史坏记录让整个 GET 永远 502；分页判断仍基于原始行数。
  const parsedItems = rows
    .slice(0, pageSize)
    .map(parseExpressionRow)
    .filter((item): item is ExpressionLibraryItem => item !== null)
  return {
    nextOffset: rows.length > pageSize ? offset + pageSize : null,
    items: parsedItems,
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
  // 冲突目标用稳定的 client_id 唯一约束，而不是 generated column normalized_phrase：
  // clientId 由身份（sceneCategory:规范化短语）哈希而来，本来就等价且稳定；
  // generated column 上的唯一约束在部分 Supabase 实例缺失，会导致 on_conflict 42P10 整批 502。
  const { error } = await client
    .from("expression_library_items")
    .upsert(rows, { onConflict: "user_id,client_id" })
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
