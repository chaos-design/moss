import { createHmac } from "node:crypto"
import type { SupabaseClient, User } from "@supabase/supabase-js"

const exportBatchSize = 500

export const userDataTables = [
  { name: "profiles", userColumn: "id", orderColumn: "id" },
  { name: "conversations", userColumn: "user_id", orderColumn: "id" },
  { name: "conversation_messages", userColumn: "user_id", orderColumn: "id" },
  { name: "learning_progress", userColumn: "user_id", orderColumn: "id" },
  { name: "issue_records", userColumn: "user_id", orderColumn: "id" },
  { name: "review_items", userColumn: "user_id", orderColumn: "id" },
  { name: "shadowing_attempts", userColumn: "user_id", orderColumn: "id" },
  { name: "learning_events", userColumn: "user_id", orderColumn: "id" },
  {
    name: "learning_memory_snapshots",
    userColumn: "user_id",
    orderColumn: "user_id",
  },
  {
    name: "learning_memory_documents",
    userColumn: "user_id",
    orderColumn: "id",
  },
  {
    name: "expression_library_items",
    userColumn: "user_id",
    orderColumn: "id",
  },
] as const

export const accountDeletionTables = [
  ...userDataTables,
  {
    name: "rate_limit_buckets",
    userColumn: "user_id",
    orderColumn: "user_id",
  },
] as const

export type AccountDataTableName = (typeof userDataTables)[number]["name"]
export type AccountDeletionTableName = (typeof accountDeletionTables)[number]["name"]
export type AccountResidualCounts = Record<AccountDeletionTableName, number>

async function readAllUserRows(
  client: SupabaseClient,
  table: (typeof userDataTables)[number],
  userId: string,
) {
  const rows: unknown[] = []
  for (let offset = 0; ; offset += exportBatchSize) {
    const { data, error } = await client
      .from(table.name)
      .select("*")
      .eq(table.userColumn, userId)
      .order(table.orderColumn, { ascending: true })
      .range(offset, offset + exportBatchSize - 1)
    if (error) {
      throw error
    }
    const batch = Array.isArray(data) ? data : []
    rows.push(...batch)
    if (batch.length < exportBatchSize) {
      return rows
    }
  }
}

export async function exportAccountData({
  client,
  user,
  now = new Date(),
}: {
  client: SupabaseClient
  user: User
  now?: Date
}) {
  const data = {} as Record<AccountDataTableName, unknown[]>
  for (const table of userDataTables) {
    data[table.name] = await readAllUserRows(client, table, user.id)
  }

  return {
    version: 1,
    exportedAt: now.toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      appMetadata: user.app_metadata,
      userMetadata: user.user_metadata,
    },
    data,
  }
}

export function createUserFingerprint(userId: string, secret: string) {
  return createHmac("sha256", secret).update(userId).digest("hex")
}

export async function countAccountRows(client: SupabaseClient, userId: string) {
  const entries = await Promise.all(
    accountDeletionTables.map(async (table) => {
      const { count, error } = await client
        .from(table.name)
        .select("*", { count: "exact", head: true })
        .eq(table.userColumn, userId)
      if (error) {
        throw error
      }
      return [table.name, count ?? 0] as const
    }),
  )
  return Object.fromEntries(entries) as AccountResidualCounts
}

export function hasResidualAccountData(counts: AccountResidualCounts) {
  return Object.values(counts).some((count) => count > 0)
}

export async function startAccountDeletionAudit({
  client,
  userFingerprint,
  vectorDocumentsBefore,
}: {
  client: SupabaseClient
  userFingerprint: string
  vectorDocumentsBefore: number
}) {
  const { data, error } = await client
    .from("account_deletion_audits")
    .insert({
      user_fingerprint: userFingerprint,
      status: "started",
      vector_documents_before: vectorDocumentsBefore,
    })
    .select("id")
    .single()
  if (error || !data?.id) {
    throw error ?? new Error("Missing deletion audit ID")
  }
  return data.id as string
}

export async function finishAccountDeletionAudit({
  client,
  auditId,
  status,
  residualCounts,
  now = new Date(),
}: {
  client: SupabaseClient
  auditId: string
  status: "completed" | "failed" | "residual_data"
  residualCounts: AccountResidualCounts
  now?: Date
}) {
  const { error } = await client
    .from("account_deletion_audits")
    .update({
      completed_at: now.toISOString(),
      residual_counts: residualCounts,
      status,
    })
    .eq("id", auditId)
  if (error) {
    throw error
  }
}
