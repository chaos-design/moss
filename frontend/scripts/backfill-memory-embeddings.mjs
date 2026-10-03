import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"

const checkpointVersion = 1
const embeddingDimensions = 1536
const maximumEmbeddingInputLength = 6_000
const validMemoryKinds = new Set(["expression", "grammar", "pronunciation", "vocabulary"])

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "")
}

function hashValue(value) {
  return createHash("sha256").update(value).digest("hex")
}

function isNonEmptyString(value, maximumLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength
}

function isBackfillableMemoryItem(value) {
  return (
    value &&
    typeof value === "object" &&
    isNonEmptyString(value.id, 1_000) &&
    validMemoryKinds.has(value.kind) &&
    isNonEmptyString(value.label, 120) &&
    isNonEmptyString(value.answer, 1_000) &&
    typeof value.explanation === "string" &&
    value.explanation.length <= 1_000 &&
    isNonEmptyString(value.sourceSceneId, 80) &&
    isNonEmptyString(value.sourceSceneTitle, 120) &&
    typeof value.strength === "number" &&
    Number.isFinite(value.strength)
  )
}

export function createBackfillDocument(item, snapshotUpdatedAt) {
  if (!isBackfillableMemoryItem(item)) {
    return null
  }

  const content = [
    `场景：${item.sourceSceneTitle}`,
    `学习任务：${item.label}`,
    `表达：${item.answer}`,
    `反馈：${item.explanation}`,
  ].join("\n")
  const strength = Math.min(100, Math.max(0, Math.round(item.strength)))
  const pronunciation = item.kind === "pronunciation"
  const memoryKind = pronunciation ? "pronunciation" : "review"
  const sourceType = pronunciation ? "shadowing" : "review"
  const fingerprint = hashValue(
    JSON.stringify({
      content,
      kind: item.kind,
      memoryKind,
      sceneId: item.sourceSceneId,
      strength,
    }),
  )

  return {
    sourceType,
    sourceId: item.id.length <= 160 ? item.id : `snapshot-${hashValue(item.id)}`,
    sceneId: item.sourceSceneId,
    memoryKind,
    content,
    metadata: {
      backfillFingerprint: fingerprint,
      backfilledFrom: "learning_memory_snapshots",
      expression: item.answer,
      explanation: item.explanation,
      label: item.label,
      legacyMemoryItemId: item.id,
      memoryKind: item.kind,
      sceneTitle: item.sourceSceneTitle,
      snapshotUpdatedAt,
    },
    strength,
  }
}

export async function withRetry(
  operation,
  {
    attempts = 3,
    wait = (milliseconds) =>
      new Promise((resolveWait) => setTimeout(resolveWait, milliseconds)),
  } = {},
) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await wait(250 * 2 ** (attempt - 1))
      }
    }
  }
  throw lastError
}

export async function processSnapshot({
  row,
  resumeAfterItemId = null,
  dryRun = false,
  retryAttempts = 3,
  loadExistingDocuments,
  createEmbedding,
  upsertDocument,
  saveCheckpoint,
  wait,
}) {
  const rawItems = Array.isArray(row.state?.items) ? row.state.items : []
  const items = [...rawItems].sort((left, right) =>
    String(left?.id ?? "").localeCompare(String(right?.id ?? "")),
  )
  const resumeIndex = resumeAfterItemId
    ? items.findIndex((item) => item?.id === resumeAfterItemId) + 1
    : 0
  const startIndex = resumeAfterItemId && resumeIndex === 0 ? 0 : resumeIndex
  const documents = items.map((item) => createBackfillDocument(item, row.updated_at))
  const sourceIds = documents.flatMap((document) => (document ? [document.sourceId] : []))
  const existingDocuments = await withRetry(
    () => loadExistingDocuments(row.user_id, sourceIds),
    {
      attempts: retryAttempts,
      wait,
    },
  )
  const result = { processed: 0, skipped: 0, invalid: 0 }

  for (let index = startIndex; index < items.length; index += 1) {
    const item = items[index]
    const document = documents[index]
    if (!document) {
      result.invalid += 1
    } else if (
      existingDocuments.has(`${document.sourceType}:${document.sourceId}`) &&
      (existingDocuments.get(`${document.sourceType}:${document.sourceId}`) === null ||
        existingDocuments.get(`${document.sourceType}:${document.sourceId}`) ===
          document.metadata.backfillFingerprint)
    ) {
      result.skipped += 1
    } else if (dryRun) {
      result.processed += 1
    } else {
      const embedding = await withRetry(() => createEmbedding(document.content), {
        attempts: retryAttempts,
        wait,
      })
      await withRetry(() => upsertDocument(row.user_id, { ...document, embedding }), {
        attempts: retryAttempts,
        wait,
      })
      result.processed += 1
    }

    if (!dryRun) {
      await saveCheckpoint({
        finished: false,
        itemId: typeof item?.id === "string" ? item.id : `invalid-${index}`,
        snapshotUpdatedAt: row.updated_at,
        userComplete: false,
        userId: row.user_id,
        version: checkpointVersion,
      })
    }
  }

  if (!dryRun) {
    await saveCheckpoint({
      finished: false,
      itemId: null,
      snapshotUpdatedAt: row.updated_at,
      userComplete: true,
      userId: row.user_id,
      version: checkpointVersion,
    })
  }
  return result
}

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

function parseArguments(argv) {
  const checkpointIndex = argv.indexOf("--checkpoint")
  return {
    checkpointPath:
      checkpointIndex >= 0 && argv[checkpointIndex + 1]
        ? resolve(argv[checkpointIndex + 1])
        : resolve(process.env.MEMORY_BACKFILL_CHECKPOINT ?? ".tmp/memory-backfill.json"),
    dryRun: argv.includes("--dry-run"),
    restart: argv.includes("--restart"),
  }
}

async function readCheckpoint(path, restart) {
  if (restart) {
    return null
  }
  try {
    const value = JSON.parse(await readFile(path, "utf8"))
    return value?.version === checkpointVersion ? value : null
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null
    }
    throw error
  }
}

async function writeCheckpoint(path, checkpoint) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`, {
    mode: 0o600,
  })
  await rename(temporaryPath, path)
}

async function createProviderEmbedding(content, config) {
  const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dimensions: embeddingDimensions,
      input: content.trim().slice(0, maximumEmbeddingInputLength),
      model: config.model,
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(`Embedding provider returned HTTP ${response.status}`)
  }

  const body = await response.json()
  const embedding = body?.data?.[0]?.embedding
  if (
    !Array.isArray(embedding) ||
    embedding.length !== embeddingDimensions ||
    !embedding.every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    throw new Error("Embedding provider returned an invalid vector")
  }
  return embedding
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || requireEnvironment("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY")
  const provider = args.dryRun
    ? null
    : {
        apiKey: requireEnvironment("AI_API_KEY"),
        baseUrl: requireEnvironment("AI_BASE_URL"),
        model: requireEnvironment("AI_EMBEDDING_MODEL"),
      }
  const batchSize = parsePositiveInteger(process.env.MEMORY_BACKFILL_BATCH_SIZE, 25, 100)
  const retryAttempts = parsePositiveInteger(process.env.MEMORY_BACKFILL_RETRY_ATTEMPTS, 3, 8)
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  let checkpoint = await readCheckpoint(args.checkpointPath, args.restart)
  if (checkpoint?.finished && !args.restart) {
    console.log(`Backfill already completed. Use --restart to scan again.`)
    return
  }

  const totals = { users: 0, processed: 0, skipped: 0, invalid: 0 }
  const saveCheckpoint = async (value) => {
    checkpoint = value
    await writeCheckpoint(args.checkpointPath, value)
  }

  async function loadSnapshots() {
    let query = client
      .from("learning_memory_snapshots")
      .select("user_id,state,updated_at")
      .order("user_id", { ascending: true })
      .limit(batchSize)
    if (checkpoint?.userId) {
      query = checkpoint.userComplete
        ? query.gt("user_id", checkpoint.userId)
        : query.gte("user_id", checkpoint.userId)
    }
    const { data, error } = await query
    if (error) {
      throw error
    }
    return data ?? []
  }

  async function loadExistingDocuments(userId, sourceIds) {
    const fingerprints = new Map()
    for (let index = 0; index < sourceIds.length; index += 100) {
      const chunk = sourceIds.slice(index, index + 100)
      if (chunk.length === 0) {
        continue
      }
      const { data, error } = await client
        .from("learning_memory_documents")
        .select("source_type,source_id,metadata")
        .eq("user_id", userId)
        .in("source_id", chunk)
      if (error) {
        throw error
      }
      for (const row of data ?? []) {
        const fingerprint = row.metadata?.backfillFingerprint
        fingerprints.set(
          `${row.source_type}:${row.source_id}`,
          typeof fingerprint === "string" ? fingerprint : null,
        )
      }
    }
    return fingerprints
  }

  async function upsertDocument(userId, document) {
    const { error } = await client.from("learning_memory_documents").upsert(
      {
        content: document.content,
        embedding: document.embedding,
        memory_kind: document.memoryKind,
        metadata: document.metadata,
        scene_id: document.sceneId,
        source_id: document.sourceId,
        source_type: document.sourceType,
        strength: document.strength,
        user_id: userId,
      },
      { onConflict: "user_id,source_type,source_id" },
    )
    if (error) {
      throw error
    }
  }

  while (true) {
    const rows = await withRetry(loadSnapshots, { attempts: retryAttempts })
    if (rows.length === 0) {
      if (!args.dryRun) {
        await saveCheckpoint({
          ...(checkpoint ?? {}),
          finished: true,
          version: checkpointVersion,
        })
      }
      break
    }

    for (const row of rows) {
      const result = await processSnapshot({
        row,
        resumeAfterItemId:
          checkpoint?.userId === row.user_id &&
          checkpoint.snapshotUpdatedAt === row.updated_at &&
          !checkpoint.userComplete
            ? checkpoint.itemId
            : null,
        dryRun: args.dryRun,
        retryAttempts,
        loadExistingDocuments,
        createEmbedding: (content) => createProviderEmbedding(content, provider),
        upsertDocument,
        saveCheckpoint,
      })
      totals.users += 1
      totals.processed += result.processed
      totals.skipped += result.skipped
      totals.invalid += result.invalid
      console.log(
        `Scanned user ${totals.users}: ${result.processed} write(s), ${result.skipped} unchanged, ${result.invalid} invalid.`,
      )
    }

    if (args.dryRun) {
      const lastRow = rows.at(-1)
      checkpoint = {
        finished: false,
        itemId: null,
        snapshotUpdatedAt: lastRow.updated_at,
        userComplete: true,
        userId: lastRow.user_id,
        version: checkpointVersion,
      }
    }
  }

  console.log(
    `${args.dryRun ? "Dry run" : "Backfill"} complete: ${totals.users} user(s), ${totals.processed} candidate/write(s), ${totals.skipped} unchanged, ${totals.invalid} invalid.`,
  )
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ""
if (import.meta.url === executedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
