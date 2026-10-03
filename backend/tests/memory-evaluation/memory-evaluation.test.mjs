import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import {
  evaluateConfiguration,
  evaluateObservedRun,
  rankCandidates,
  runParameterGrid,
  validateEvaluationDataset,
} from "../../../frontend/scripts/memory-evaluation.mjs"

const fixturePath = resolve("docs/examples/memory-evaluation.sample.json")

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, "utf8"))
}

test("validates the versioned evaluation dataset", async () => {
  const dataset = await loadFixture()

  assert.equal(validateEvaluationDataset(dataset), dataset)
  assert.throws(
    () =>
      validateEvaluationDataset({
        ...dataset,
        queries: [{ ...dataset.queries[0], expectedRelevantIds: ["missing"] }],
      }),
    /references unknown missing/,
  )
})

test("ranking matches production ordering when temporal decay is disabled", async () => {
  const dataset = await loadFixture()
  const query = dataset.queries[0]

  const ranked = rankCandidates(
    query,
    { minSimilarity: 0.2, matchCount: 3, decayHalfLifeDays: null },
    new Date("2026-08-29T08:00:00.000Z"),
  )

  assert.deepEqual(
    ranked.map((candidate) => candidate.id),
    ["polite-request", "restaurant-request", "meeting-clarification"],
  )
})

test("temporal decay can demote stale candidates without mutating source scores", async () => {
  const dataset = await loadFixture()
  const query = dataset.queries[0]

  const ranked = rankCandidates(
    query,
    { minSimilarity: 0.2, matchCount: 3, decayHalfLifeDays: 30 },
    new Date("2026-08-29T08:00:00.000Z"),
  )

  assert.deepEqual(
    ranked.map((candidate) => candidate.id),
    ["restaurant-request", "polite-request", "meeting-clarification"],
  )
  assert.equal(query.candidates[0].similarity, 0.78)
})

test("configuration evaluation reports retrieval and transfer metrics", async () => {
  const dataset = await loadFixture()

  const result = evaluateConfiguration(
    dataset,
    { minSimilarity: 0.4, matchCount: 2, decayHalfLifeDays: null },
    new Date("2026-08-29T08:00:00.000Z"),
  )

  assert.deepEqual(result.metrics, {
    precision: 1,
    recall: 1,
    meanReciprocalRank: 1,
    transferOpportunityRecall: 1,
  })
})

test("observed runs measure prompt errors, transfer outcomes, and latency", async () => {
  const dataset = await loadFixture()

  const result = evaluateObservedRun(dataset, dataset.observedRuns[0])

  assert.deepEqual(result.metrics, {
    precision: 0.6111,
    recall: 1,
    meanReciprocalRank: 1,
    transferOpportunityRecall: 1,
    erroneousPromptRate: 0.1667,
    transferSuccessRate: 1,
    latencyP50Ms: 18,
    latencyP95Ms: 20,
  })
})

test("the parameter grid is deterministic and favors recall before precision", async () => {
  const dataset = await loadFixture()
  const results = runParameterGrid(
    dataset,
    {
      minSimilarities: [0.2, 0.4],
      matchCounts: [1, 2],
      decayHalfLivesDays: [null],
    },
    new Date("2026-08-29T08:00:00.000Z"),
  )

  assert.equal(results.length, 4)
  assert.deepEqual(results[0].configuration, {
    minSimilarity: 0.4,
    matchCount: 2,
    decayHalfLifeDays: null,
  })
  assert.equal(results[0].metrics.recall, 1)
  assert.equal(results.at(-1).configuration.matchCount, 1)
})
