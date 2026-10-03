import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import test from "node:test"

const supabaseDirectory = new URL("../../supabase/", import.meta.url)
const schemaPath = new URL("../../supabase/platform.sql", import.meta.url)
const updatePath = new URL("../../supabase/update.sql", import.meta.url)

const tables = [
  "profiles",
  "learning_nodes",
  "scenes",
  "conversations",
  "conversation_messages",
  "learning_progress",
  "issue_records",
  "review_items",
  "shadowing_attempts",
  "learning_events",
  "learning_memory_snapshots",
  "learning_memory_documents",
  "expression_library_items",
  "account_deletion_audits",
  "rate_limit_buckets",
]

test("the Supabase directory only contains full and incremental SQL", async () => {
  const entries = await readdir(supabaseDirectory)
  assert.deepEqual(entries.sort(), ["platform.sql", "update.sql"])
})

test("the full schema creates every application table with RLS enabled", async () => {
  const schema = await readFile(schemaPath, "utf8")

  for (const table of tables) {
    assert.match(schema, new RegExp(`create table public\\.${table} \\(`))
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security;`))
  }
})

test("full and incremental SQL grant only authenticated application access", async () => {
  const [schema, update] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(updatePath, "utf8"),
  ])

  for (const sql of [schema, update]) {
    assert.match(sql, /revoke all on all tables in schema public from anon;/)
    assert.match(
      sql,
      /grant select on table public\.learning_nodes, public\.scenes to authenticated;/,
    )
    assert.match(sql, /grant select, insert, update, delete on table[\s\S]+to authenticated;/)
    assert.match(sql, /revoke all on all sequences in schema public from anon;/)
    assert.match(sql, /grant usage, select on all sequences in schema public to authenticated;/)
  }
})

test("memory RPCs derive ownership from auth.uid and exclude anonymous execution", async () => {
  const schema = await readFile(schemaPath, "utf8")

  assert.match(schema, /current_user_id uuid := auth\.uid\(\);/)
  assert.match(schema, /where memory\.user_id = \(select auth\.uid\(\)\)/)
  assert.match(
    schema,
    /revoke execute on function public\.sync_learning_memory\(jsonb, bigint, text\) from public, anon;/,
  )
  assert.match(
    schema,
    /revoke execute on function public\.match_long_term_memories\([\s\S]+from public, anon;/,
  )
})

test("cloud conversation ids are present in the full and incremental SQL", async () => {
  const [schema, update] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(updatePath, "utf8"),
  ])

  assert.match(schema, /client_id text/)
  assert.match(schema, /scene_key text/)
  assert.match(schema, /unique \(user_id, client_id\)/)
  assert.match(schema, /unique \(conversation_id, client_id\)/)
  assert.match(update, /client_id text/)
  assert.match(update, /scene_key text/)
  assert.match(update, /conversations_user_client_id_idx/)
  assert.match(update, /conversation_messages_conversation_client_id_idx/)
  assert.doesNotMatch(update, /create table public\.learning_memory_snapshots/)
  assert.doesNotMatch(update, /create table public\.learning_memory_documents/)
  for (const sql of [schema, update]) {
    assert.match(sql, /where conversations\.id = conversation_messages\.conversation_id/)
    assert.match(sql, /conversations\.user_id = \(select auth\.uid\(\)\)/)
  }
})

test("account deletion audits are isolated from application users", async () => {
  const [schema, update] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(updatePath, "utf8"),
  ])

  assert.match(schema, /create table public\.account_deletion_audits \(/)
  assert.match(update, /create table if not exists public\.account_deletion_audits \(/)
  for (const sql of [schema, update]) {
    assert.match(sql, /alter table public\.account_deletion_audits enable row level security;/)
    assert.match(
      sql,
      /revoke all on table public\.account_deletion_audits from anon, authenticated;/,
    )
    assert.match(
      sql,
      /grant select, insert, update on table public\.account_deletion_audits to service_role;/,
    )
  }
})

test("expression imports are owner-scoped, categorized, and exportable", async () => {
  const [schema, update] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(updatePath, "utf8"),
  ])

  for (const sql of [schema, update]) {
    assert.match(sql, /create table(?: if not exists)? public\.expression_library_items \(/)
    assert.match(sql, /unique \(user_id, scene_category, normalized_phrase\)/)
    assert.match(sql, /alter table public\.expression_library_items enable row level security;/)
    assert.match(sql, /create policy "users manage own expression library"/)
    assert.match(sql, /expression_library_items_user_category_idx/)
    assert.match(sql, /public\.expression_library_items\s+to authenticated;/)
    assert.match(sql, /'clothing',[\s\S]+'emergency'/)
    assert.match(sql, /'expression-library'/)
  }
})

test("shared rate limiting is atomic, authenticated, and private", async () => {
  const [schema, update] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(updatePath, "utf8"),
  ])

  for (const sql of [schema, update]) {
    assert.match(sql, /create table(?: if not exists)? public\.rate_limit_buckets \(/)
    assert.match(sql, /primary key \(user_id, bucket\)/)
    assert.match(sql, /alter table public\.rate_limit_buckets enable row level security;/)
    assert.match(
      sql,
      /revoke all on table public\.rate_limit_buckets from anon, authenticated;/,
    )
    assert.match(sql, /create or replace function public\.check_rate_limit\(/)
    assert.match(sql, /current_user_id uuid := auth\.uid\(\);/)
    assert.match(sql, /request_time timestamptz := clock_timestamp\(\);/)
    assert.doesNotMatch(sql, /current_time timestamptz := clock_timestamp\(\);/)
    assert.match(sql, /when 'conversation-generate' then 20/)
    assert.match(sql, /when 'expression-library' then 120/)
    assert.match(sql, /when 'account-delete' then 5/)
    assert.match(sql, /on conflict \(user_id, bucket\) do update/)
    assert.match(sql, /least\(rate_limit\.request_count \+ 1, bucket_limit \+ 1\)/)
    assert.doesNotMatch(sql, /p_limit integer/)
    assert.doesNotMatch(sql, /p_window_seconds integer/)
    assert.match(
      sql,
      /revoke execute on function public\.check_rate_limit\(text\)[\s\S]+from public, anon;/,
    )
    assert.match(
      sql,
      /grant execute on function public\.check_rate_limit\(text\)[\s\S]+to authenticated;/,
    )
  }
})
