const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "")
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !publishableKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.",
  )
}

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

const rpcRequests = [
  {
    name: "sync_learning_memory",
    body: {
      p_state: {},
      p_expected_revision: 0,
      p_device_id: "remote-contract-smoke-test",
    },
  },
  {
    name: "match_long_term_memories",
    body: {
      p_query_embedding: "[0]",
      p_scene_id: "remote-contract-smoke-test",
      p_match_count: 1,
      p_min_similarity: 0.2,
    },
  },
  {
    name: "check_rate_limit",
    body: {
      p_bucket: "translation",
    },
  },
]

async function expectAnonymousPermissionDenied(path, init) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  const body = await response.json()

  if (response.status !== 401) {
    throw new Error(`${path} returned HTTP ${response.status}, expected 401`)
  }
  if (body.code !== "42501") {
    throw new Error(`${path} did not return PostgreSQL error 42501`)
  }
}

const failures = []

for (const table of tables) {
  try {
    await expectAnonymousPermissionDenied(`${table}?select=*&limit=1`)
    console.log(`ok table ${table}`)
  } catch (error) {
    failures.push(error)
    console.error(`not ok table ${table}: ${error.message}`)
  }
}

for (const rpc of rpcRequests) {
  try {
    await expectAnonymousPermissionDenied(`rpc/${rpc.name}`, {
      method: "POST",
      body: JSON.stringify(rpc.body),
    })
    console.log(`ok rpc ${rpc.name}`)
  } catch (error) {
    failures.push(error)
    console.error(`not ok rpc ${rpc.name}: ${error.message}`)
  }
}

if (failures.length > 0) {
  console.error(`${failures.length} remote Supabase checks failed.`)
  process.exitCode = 1
}
