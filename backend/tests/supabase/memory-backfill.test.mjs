import assert from "node:assert/strict"
import test from "node:test"
import {
  createBackfillDocument,
  processSnapshot,
  withRetry,
} from "../../../frontend/scripts/backfill-memory-embeddings.mjs"

function createMemoryItem(id, overrides = {}) {
  return {
    id,
    kind: "expression",
    label: `Label ${id}`,
    answer: `Expression ${id}`,
    explanation: `Explanation ${id}`,
    sourceSceneId: "meeting",
    sourceSceneTitle: "工作会议",
    strength: 48,
    successfulRecalls: 1,
    lapseCount: 2,
    ...overrides,
  }
}

function createSnapshot(items) {
  return {
    user_id: "00000000-0000-0000-0000-000000000001",
    state: { items },
    updated_at: "2026-08-29T08:00:00.000Z",
  }
}

test("backfill documents use stable keys and content fingerprints", () => {
  const item = createMemoryItem("legacy-memory")
  const first = createBackfillDocument(item, "2026-08-29T08:00:00.000Z")
  const second = createBackfillDocument(item, "2026-08-29T09:00:00.000Z")
  const changed = createBackfillDocument(
    { ...item, answer: "Changed expression" },
    "2026-08-29T09:00:00.000Z",
  )

  assert.equal(first.sourceId, second.sourceId)
  assert.equal(first.metadata.backfillFingerprint, second.metadata.backfillFingerprint)
  assert.notEqual(first.metadata.backfillFingerprint, changed.metadata.backfillFingerprint)
  assert.equal(first.sourceType, "review")
  assert.equal(first.sourceId, item.id)
  assert.equal(first.memoryKind, "review")
  assert.equal(
    createBackfillDocument(
      createMemoryItem("pronunciation", { kind: "pronunciation" }),
      "2026-08-29T08:00:00.000Z",
    ).sourceType,
    "shadowing",
  )
})

test("snapshot processing resumes after the last completed item and skips unchanged rows", async () => {
  const items = [createMemoryItem("a"), createMemoryItem("b"), createMemoryItem("c")]
  const existing = createBackfillDocument(items[1], "2026-08-29T08:00:00.000Z")
  const embeddings = []
  const upserts = []
  const checkpoints = []

  const result = await processSnapshot({
    row: createSnapshot(items),
    resumeAfterItemId: "a",
    loadExistingDocuments: async () =>
      new Map([
        [`${existing.sourceType}:${existing.sourceId}`, existing.metadata.backfillFingerprint],
      ]),
    createEmbedding: async (content) => {
      embeddings.push(content)
      return [1, 0]
    },
    upsertDocument: async (userId, document) => {
      upserts.push({ userId, document })
    },
    saveCheckpoint: async (checkpoint) => {
      checkpoints.push(checkpoint)
    },
    wait: async () => {},
  })

  assert.deepEqual(result, { processed: 1, skipped: 1, invalid: 0 })
  assert.equal(embeddings.length, 1)
  assert.equal(upserts.length, 1)
  assert.equal(upserts[0].document.metadata.legacyMemoryItemId, "c")
  assert.equal(checkpoints.at(-1).userComplete, true)
  assert.equal(checkpoints.at(-1).snapshotUpdatedAt, "2026-08-29T08:00:00.000Z")
})

test("snapshot processing preserves live documents without a backfill fingerprint", async () => {
  const item = createMemoryItem("live-review")
  let embeddingCalls = 0

  const result = await processSnapshot({
    row: createSnapshot([item]),
    dryRun: true,
    loadExistingDocuments: async () => new Map([[`review:${item.id}`, null]]),
    createEmbedding: async () => {
      embeddingCalls += 1
      return [1, 0]
    },
    upsertDocument: async () => {},
    saveCheckpoint: async () => {},
    wait: async () => {},
  })

  assert.deepEqual(result, { processed: 0, skipped: 1, invalid: 0 })
  assert.equal(embeddingCalls, 0)
})

test("retry applies independently to embedding and database writes", async () => {
  let embeddingAttempts = 0
  let upsertAttempts = 0
  let waits = 0

  const result = await processSnapshot({
    row: createSnapshot([createMemoryItem("retry")]),
    retryAttempts: 3,
    loadExistingDocuments: async () => new Map(),
    createEmbedding: async () => {
      embeddingAttempts += 1
      if (embeddingAttempts < 3) {
        throw new Error("temporary embedding failure")
      }
      return [1, 0]
    },
    upsertDocument: async () => {
      upsertAttempts += 1
      if (upsertAttempts < 2) {
        throw new Error("temporary database failure")
      }
    },
    saveCheckpoint: async () => {},
    wait: async () => {
      waits += 1
    },
  })

  assert.equal(result.processed, 1)
  assert.equal(embeddingAttempts, 3)
  assert.equal(upsertAttempts, 2)
  assert.equal(waits, 3)
})

test("a permanent failure does not advance the checkpoint", async () => {
  const checkpoints = []

  await assert.rejects(
    processSnapshot({
      row: createSnapshot([createMemoryItem("failure")]),
      retryAttempts: 2,
      loadExistingDocuments: async () => new Map(),
      createEmbedding: async () => {
        throw new Error("provider unavailable")
      },
      upsertDocument: async () => {},
      saveCheckpoint: async (checkpoint) => {
        checkpoints.push(checkpoint)
      },
      wait: async () => {},
    }),
    /provider unavailable/,
  )

  assert.deepEqual(checkpoints, [])
})

test("withRetry rejects after the configured number of attempts", async () => {
  let attempts = 0
  await assert.rejects(
    withRetry(
      async () => {
        attempts += 1
        throw new Error("still failing")
      },
      { attempts: 4, wait: async () => {} },
    ),
    /still failing/,
  )
  assert.equal(attempts, 4)
})
