import { createClient } from "@supabase/supabase-js"

const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_TEST_USER_A_EMAIL",
  "SUPABASE_TEST_USER_A_PASSWORD",
  "SUPABASE_TEST_USER_B_EMAIL",
  "SUPABASE_TEST_USER_B_PASSWORD",
]

const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name])
if (missingEnvironment.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvironment.join(", ")}`)
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const runId = `rls-${Date.now()}-${crypto.randomUUID()}`
const embedding = Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0))

function createTestClient() {
  return createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}

async function signIn(client, email, password, label) {
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    throw new Error(`${label} sign-in failed: ${error?.message ?? "missing user"}`)
  }
  return data.user
}

function expectNoError(result, operation) {
  if (result.error) {
    throw new Error(`${operation} failed: ${result.error.message}`)
  }
  return result.data
}

function expectRows(data, count, operation) {
  if (!Array.isArray(data) || data.length !== count) {
    throw new Error(
      `${operation} returned ${Array.isArray(data) ? data.length : "invalid"} rows`,
    )
  }
}

function expectPermissionDenied(error, operation) {
  if (error?.code !== "42501") {
    throw new Error(`${operation} did not return PostgreSQL permission error 42501`)
  }
}

const clientA = createTestClient()
const clientB = createTestClient()
let conversationId

try {
  const [userA, userB] = await Promise.all([
    signIn(
      clientA,
      process.env.SUPABASE_TEST_USER_A_EMAIL,
      process.env.SUPABASE_TEST_USER_A_PASSWORD,
      "user A",
    ),
    signIn(
      clientB,
      process.env.SUPABASE_TEST_USER_B_EMAIL,
      process.env.SUPABASE_TEST_USER_B_PASSWORD,
      "user B",
    ),
  ])
  if (userA.id === userB.id) {
    throw new Error("The two test credentials resolve to the same Supabase user.")
  }

  await new Promise((resolveWait) => setTimeout(resolveWait, 1_100))
  const [limitResultsA, firstLimitB] = await Promise.all([
    Promise.all(
      Array.from({ length: 3 }, async (_, index) =>
        expectNoError(
          await clientA.rpc("check_rate_limit", {
            p_bucket: "rls-validation",
          }),
          `user A shared rate limit concurrent request ${index + 1}`,
        ),
      ),
    ),
    clientB
      .rpc("check_rate_limit", {
        p_bucket: "rls-validation",
      })
      .then((result) => expectNoError(result, "user B shared rate limit first request")),
  ])
  const limitStatusesA = limitResultsA
    .map((result) => result?.[0]?.limited)
    .sort((left, right) => Number(left) - Number(right))
  if (
    JSON.stringify(limitStatusesA) !== JSON.stringify([false, false, true]) ||
    firstLimitB?.[0]?.limited !== false
  ) {
    throw new Error("Shared rate limit is not atomic or isolated by authenticated user.")
  }

  const conversation = expectNoError(
    await clientA
      .from("conversations")
      .insert({
        user_id: userA.id,
        client_id: runId,
        scene_key: "rls-smoke-test",
        title: "RLS smoke test",
        status: "active",
      })
      .select("id")
      .single(),
    "user A conversation insert",
  )
  conversationId = conversation.id

  expectNoError(
    await clientA.from("conversation_messages").insert({
      conversation_id: conversationId,
      user_id: userA.id,
      client_id: `${runId}-message`,
      role: "user",
      content: "RLS smoke test",
    }),
    "user A message insert",
  )

  expectRows(
    expectNoError(
      await clientA.from("conversations").select("id").eq("id", conversationId),
      "user A conversation read",
    ),
    1,
    "user A conversation read",
  )
  expectRows(
    expectNoError(
      await clientB.from("conversations").select("id").eq("id", conversationId),
      "user B cross-user conversation read",
    ),
    0,
    "user B cross-user conversation read",
  )
  expectRows(
    expectNoError(
      await clientB
        .from("conversation_messages")
        .select("id")
        .eq("conversation_id", conversationId),
      "user B cross-user message read",
    ),
    0,
    "user B cross-user message read",
  )
  expectRows(
    expectNoError(
      await clientB
        .from("conversations")
        .update({ title: "Cross-user update" })
        .eq("id", conversationId)
        .select("id"),
      "user B cross-user conversation update",
    ),
    0,
    "user B cross-user conversation update",
  )
  expectRows(
    expectNoError(
      await clientB.from("conversations").delete().eq("id", conversationId).select("id"),
      "user B cross-user conversation delete",
    ),
    0,
    "user B cross-user conversation delete",
  )

  expectPermissionDenied(
    (
      await clientB.from("conversation_messages").insert({
        conversation_id: conversationId,
        user_id: userB.id,
        client_id: `${runId}-cross-user-message`,
        role: "user",
        content: "This insert must be rejected.",
      })
    ).error,
    "user B cross-user message insert",
  )
  expectPermissionDenied(
    (
      await clientB.from("conversations").insert({
        user_id: userA.id,
        client_id: `${runId}-spoofed`,
        scene_key: "rls-smoke-test",
        title: "Spoofed conversation",
        status: "active",
      })
    ).error,
    "user B spoofed conversation insert",
  )

  expectNoError(
    await clientA.from("learning_memory_documents").insert({
      user_id: userA.id,
      source_type: "review",
      source_id: runId,
      scene_id: "rls-smoke-test",
      memory_kind: "review",
      content: "RLS smoke test memory",
      metadata: { label: "RLS smoke test" },
      strength: 50,
      embedding,
    }),
    "user A memory insert",
  )
  expectRows(
    expectNoError(
      await clientA.from("learning_memory_documents").select("id").eq("source_id", runId),
      "user A memory read",
    ),
    1,
    "user A memory read",
  )
  expectRows(
    expectNoError(
      await clientB.from("learning_memory_documents").select("id").eq("source_id", runId),
      "user B cross-user memory read",
    ),
    0,
    "user B cross-user memory read",
  )
  expectRows(
    expectNoError(
      await clientB
        .from("learning_memory_documents")
        .update({ strength: 1 })
        .eq("source_id", runId)
        .select("id"),
      "user B cross-user memory update",
    ),
    0,
    "user B cross-user memory update",
  )
  expectRows(
    expectNoError(
      await clientB
        .from("learning_memory_documents")
        .delete()
        .eq("source_id", runId)
        .select("id"),
      "user B cross-user memory delete",
    ),
    0,
    "user B cross-user memory delete",
  )

  const expressionClientId = `${runId}-expression`
  expectNoError(
    await clientA.from("expression_library_items").insert({
      user_id: userA.id,
      client_id: expressionClientId,
      phrase: "keep an eye on",
      meaning: "留意",
      reasoning: "eye 代表观察，keep 表示持续关注。",
      origin_note: "由视觉动作形成的常用表达。",
      example: "Could you keep an eye on my bag?",
      context: "通用",
      kind: "idiom",
      scene_category: "social",
    }),
    "user A expression insert",
  )
  expectRows(
    expectNoError(
      await clientA
        .from("expression_library_items")
        .select("id")
        .eq("client_id", expressionClientId),
      "user A expression read",
    ),
    1,
    "user A expression read",
  )
  expectRows(
    expectNoError(
      await clientB
        .from("expression_library_items")
        .select("id")
        .eq("client_id", expressionClientId),
      "user B cross-user expression read",
    ),
    0,
    "user B cross-user expression read",
  )
  expectPermissionDenied(
    (
      await clientB.from("expression_library_items").insert({
        user_id: userA.id,
        client_id: `${runId}-spoofed-expression`,
        phrase: "touch base",
        meaning: "同步一下",
        reasoning: "base 表示短暂接触点。",
        origin_note: "来自棒球动作隐喻。",
        example: "Can we touch base tomorrow?",
        context: "职场",
        kind: "idiom",
        scene_category: "work",
      })
    ).error,
    "user B spoofed expression insert",
  )

  const recalledByA = expectNoError(
    await clientA.rpc("match_long_term_memories", {
      p_query_embedding: embedding,
      p_scene_id: "rls-smoke-test",
      p_match_count: 8,
      p_min_similarity: 0.99,
    }),
    "user A memory recall",
  )
  if (
    !Array.isArray(recalledByA) ||
    !recalledByA.some((item) => item.content === "RLS smoke test memory")
  ) {
    throw new Error("user A memory recall did not return the inserted document")
  }

  const recalledByB = expectNoError(
    await clientB.rpc("match_long_term_memories", {
      p_query_embedding: embedding,
      p_scene_id: "rls-smoke-test",
      p_match_count: 8,
      p_min_similarity: 0.99,
    }),
    "user B cross-user memory recall",
  )
  if (
    !Array.isArray(recalledByB) ||
    recalledByB.some((item) => item.content === "RLS smoke test memory")
  ) {
    throw new Error("user B memory recall exposed user A data")
  }

  console.log("Supabase two-user RLS validation passed.")
} finally {
  await Promise.allSettled([
    clientA.from("learning_memory_documents").delete().eq("source_id", runId),
    clientA.from("expression_library_items").delete().eq("client_id", `${runId}-expression`),
    conversationId
      ? clientA.from("conversations").delete().eq("id", conversationId)
      : Promise.resolve(),
    clientA.auth.signOut(),
    clientB.auth.signOut(),
  ])
}
