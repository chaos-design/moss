const dayMilliseconds = 86_400_000
const validDatasetKinds = new Set(["synthetic", "production-sanitized"])

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(`Invalid memory evaluation dataset: ${message}`)
  }
}

function assertString(value, path) {
  assertCondition(typeof value === "string" && value.trim().length > 0, `${path} is required`)
}

function assertStringArray(value, path) {
  assertCondition(Array.isArray(value), `${path} must be an array`)
  for (const [index, item] of value.entries()) {
    assertString(item, `${path}[${index}]`)
  }
}

function assertUnique(values, path) {
  assertCondition(new Set(values).size === values.length, `${path} must not contain duplicates`)
}

export function validateEvaluationDataset(dataset) {
  assertCondition(dataset && typeof dataset === "object", "root must be an object")
  assertCondition(dataset.version === 1, "version must be 1")
  assertString(dataset.name, "name")
  assertCondition(validDatasetKinds.has(dataset.kind), "kind is unsupported")
  assertCondition(
    Array.isArray(dataset.queries) && dataset.queries.length > 0,
    "queries is empty",
  )

  const queryIds = []
  const candidateIdsByQuery = new Map()
  for (const [queryIndex, query] of dataset.queries.entries()) {
    const path = `queries[${queryIndex}]`
    assertCondition(query && typeof query === "object", `${path} must be an object`)
    assertString(query.id, `${path}.id`)
    assertString(query.sceneId, `${path}.sceneId`)
    assertString(query.input, `${path}.input`)
    assertStringArray(query.expectedRelevantIds, `${path}.expectedRelevantIds`)
    assertCondition(
      query.expectedRelevantIds.length > 0,
      `${path}.expectedRelevantIds is empty`,
    )
    assertStringArray(query.expectedTransferIds ?? [], `${path}.expectedTransferIds`)
    assertCondition(Array.isArray(query.candidates), `${path}.candidates must be an array`)

    const candidateIds = []
    for (const [candidateIndex, candidate] of query.candidates.entries()) {
      const candidatePath = `${path}.candidates[${candidateIndex}]`
      assertCondition(
        candidate && typeof candidate === "object",
        `${candidatePath} must be an object`,
      )
      assertString(candidate.id, `${candidatePath}.id`)
      assertString(candidate.sceneId, `${candidatePath}.sceneId`)
      assertCondition(
        typeof candidate.similarity === "number" &&
          Number.isFinite(candidate.similarity) &&
          candidate.similarity >= -1 &&
          candidate.similarity <= 1,
        `${candidatePath}.similarity must be between -1 and 1`,
      )
      assertCondition(
        Number.isInteger(candidate.strength) &&
          candidate.strength >= 0 &&
          candidate.strength <= 100,
        `${candidatePath}.strength must be an integer between 0 and 100`,
      )
      assertString(candidate.updatedAt, `${candidatePath}.updatedAt`)
      assertCondition(
        Number.isFinite(Date.parse(candidate.updatedAt)),
        `${candidatePath}.updatedAt must be an ISO date`,
      )
      assertStringArray(candidate.targetSceneIds ?? [], `${candidatePath}.targetSceneIds`)
      candidateIds.push(candidate.id)
    }
    assertUnique(candidateIds, `${path}.candidate ids`)
    const candidateIdSet = new Set(candidateIds)
    candidateIdsByQuery.set(query.id, candidateIdSet)
    for (const expectedId of [
      ...query.expectedRelevantIds,
      ...(query.expectedTransferIds ?? []),
    ]) {
      assertCondition(
        candidateIdSet.has(expectedId),
        `${path} references unknown ${expectedId}`,
      )
    }
    queryIds.push(query.id)
  }
  assertUnique(queryIds, "query ids")

  const runIds = []
  for (const [runIndex, run] of (dataset.observedRuns ?? []).entries()) {
    const path = `observedRuns[${runIndex}]`
    assertCondition(run && typeof run === "object", `${path} must be an object`)
    assertString(run.id, `${path}.id`)
    assertCondition(Array.isArray(run.results), `${path}.results must be an array`)
    const resultQueryIds = []
    for (const [resultIndex, result] of run.results.entries()) {
      const resultPath = `${path}.results[${resultIndex}]`
      assertString(result.queryId, `${resultPath}.queryId`)
      assertCondition(queryIds.includes(result.queryId), `${resultPath}.queryId is unknown`)
      assertStringArray(result.retrievedIds, `${resultPath}.retrievedIds`)
      assertStringArray(result.promptedIds ?? [], `${resultPath}.promptedIds`)
      assertStringArray(
        result.successfulTransferIds ?? [],
        `${resultPath}.successfulTransferIds`,
      )
      assertUnique(result.retrievedIds, `${resultPath}.retrievedIds`)
      assertUnique(result.promptedIds ?? [], `${resultPath}.promptedIds`)
      assertUnique(result.successfulTransferIds ?? [], `${resultPath}.successfulTransferIds`)
      const candidateIds = candidateIdsByQuery.get(result.queryId)
      for (const resultId of [...result.retrievedIds, ...(result.promptedIds ?? [])]) {
        assertCondition(
          candidateIds?.has(resultId),
          `${resultPath} references unknown ${resultId}`,
        )
      }
      const promptedIds = new Set(result.promptedIds ?? [])
      for (const successfulId of result.successfulTransferIds ?? []) {
        assertCondition(
          promptedIds.has(successfulId),
          `${resultPath}.successfulTransferIds must be prompted`,
        )
      }
      assertCondition(
        typeof result.latencyMs === "number" &&
          Number.isFinite(result.latencyMs) &&
          result.latencyMs >= 0,
        `${resultPath}.latencyMs must be a non-negative number`,
      )
      resultQueryIds.push(result.queryId)
    }
    assertUnique(resultQueryIds, `${path}.result query ids`)
    runIds.push(run.id)
  }
  assertUnique(runIds, "observed run ids")
  return dataset
}

function mean(values) {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length
}

function roundMetric(value) {
  return value === null ? null : Math.round(value * 10_000) / 10_000
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  )
  return sorted[index]
}

function hasSceneAffinity(candidate, sceneId) {
  return candidate.sceneId === sceneId || (candidate.targetSceneIds ?? []).includes(sceneId)
}

function getDecayedSimilarity(candidate, halfLifeDays, evaluatedAt) {
  if (halfLifeDays === null) {
    return candidate.similarity
  }
  const ageDays = Math.max(
    0,
    (evaluatedAt.getTime() - Date.parse(candidate.updatedAt)) / dayMilliseconds,
  )
  return candidate.similarity * 0.5 ** (ageDays / halfLifeDays)
}

export function rankCandidates(query, configuration, evaluatedAt = new Date()) {
  const minSimilarity = configuration.minSimilarity
  const matchCount = configuration.matchCount
  const halfLifeDays = configuration.decayHalfLifeDays ?? null
  assertCondition(
    typeof minSimilarity === "number" && minSimilarity >= -1 && minSimilarity <= 1,
    "minSimilarity must be between -1 and 1",
  )
  assertCondition(
    Number.isInteger(matchCount) && matchCount >= 1 && matchCount <= 100,
    "matchCount must be an integer between 1 and 100",
  )
  assertCondition(
    halfLifeDays === null ||
      (typeof halfLifeDays === "number" && Number.isFinite(halfLifeDays) && halfLifeDays > 0),
    "decayHalfLifeDays must be null or positive",
  )

  return query.candidates
    .filter((candidate) => candidate.similarity >= minSimilarity)
    .map((candidate) => ({
      ...candidate,
      adjustedSimilarity: getDecayedSimilarity(candidate, halfLifeDays, evaluatedAt),
    }))
    .sort((left, right) => {
      const sceneDifference =
        Number(hasSceneAffinity(right, query.sceneId)) -
        Number(hasSceneAffinity(left, query.sceneId))
      return (
        sceneDifference ||
        right.adjustedSimilarity - left.adjustedSimilarity ||
        left.strength - right.strength ||
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        left.id.localeCompare(right.id)
      )
    })
    .slice(0, matchCount)
}

function evaluateRetrievedIds(query, retrievedIds) {
  const expectedRelevant = new Set(query.expectedRelevantIds)
  const expectedTransfers = new Set(query.expectedTransferIds ?? [])
  const relevantRetrieved = retrievedIds.filter((id) => expectedRelevant.has(id))
  const transferRetrieved = retrievedIds.filter((id) => expectedTransfers.has(id))
  const firstRelevantIndex = retrievedIds.findIndex((id) => expectedRelevant.has(id))

  return {
    precision: retrievedIds.length === 0 ? 0 : relevantRetrieved.length / retrievedIds.length,
    recall: relevantRetrieved.length / expectedRelevant.size,
    reciprocalRank: firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1),
    transferOpportunityRecall:
      expectedTransfers.size === 0 ? null : transferRetrieved.length / expectedTransfers.size,
  }
}

function aggregateQueryMetrics(queryMetrics) {
  return {
    precision: roundMetric(mean(queryMetrics.map((item) => item.precision))),
    recall: roundMetric(mean(queryMetrics.map((item) => item.recall))),
    meanReciprocalRank: roundMetric(mean(queryMetrics.map((item) => item.reciprocalRank))),
    transferOpportunityRecall: roundMetric(
      mean(
        queryMetrics.flatMap((item) =>
          item.transferOpportunityRecall === null ? [] : [item.transferOpportunityRecall],
        ),
      ),
    ),
  }
}

export function evaluateConfiguration(dataset, configuration, evaluatedAt = new Date()) {
  validateEvaluationDataset(dataset)
  const queryMetrics = dataset.queries.map((query) => {
    const retrievedIds = rankCandidates(query, configuration, evaluatedAt).map(
      (candidate) => candidate.id,
    )
    return {
      queryId: query.id,
      retrievedIds,
      ...evaluateRetrievedIds(query, retrievedIds),
    }
  })
  return {
    configuration: {
      minSimilarity: configuration.minSimilarity,
      matchCount: configuration.matchCount,
      decayHalfLifeDays: configuration.decayHalfLifeDays ?? null,
    },
    queryCount: queryMetrics.length,
    metrics: aggregateQueryMetrics(queryMetrics),
    queries: queryMetrics,
  }
}

export function evaluateObservedRun(dataset, run) {
  validateEvaluationDataset(dataset)
  const resultByQueryId = new Map(run.results.map((result) => [result.queryId, result]))
  const queryMetrics = dataset.queries.map((query) => {
    const result = resultByQueryId.get(query.id)
    const retrievedIds = result?.retrievedIds ?? []
    const promptedIds = result?.promptedIds ?? []
    const expectedRelevant = new Set(query.expectedRelevantIds)
    const expectedTransfers = new Set(query.expectedTransferIds ?? [])
    const validTransferPrompts = promptedIds.filter((id) => expectedTransfers.has(id))
    const successfulTransfers = (result?.successfulTransferIds ?? []).filter((id) =>
      validTransferPrompts.includes(id),
    )
    const erroneousPrompts = promptedIds.filter((id) => !expectedRelevant.has(id))

    return {
      queryId: query.id,
      retrievedIds,
      ...evaluateRetrievedIds(query, retrievedIds),
      erroneousPromptRate:
        promptedIds.length === 0 ? null : erroneousPrompts.length / promptedIds.length,
      transferSuccessRate:
        validTransferPrompts.length === 0
          ? null
          : successfulTransfers.length / validTransferPrompts.length,
      latencyMs: result?.latencyMs ?? null,
    }
  })
  const latencies = queryMetrics.flatMap((item) =>
    item.latencyMs === null ? [] : [item.latencyMs],
  )
  return {
    id: run.id,
    configuration: run.configuration ?? {},
    queryCount: queryMetrics.length,
    metrics: {
      ...aggregateQueryMetrics(queryMetrics),
      erroneousPromptRate: roundMetric(
        mean(
          queryMetrics.flatMap((item) =>
            item.erroneousPromptRate === null ? [] : [item.erroneousPromptRate],
          ),
        ),
      ),
      transferSuccessRate: roundMetric(
        mean(
          queryMetrics.flatMap((item) =>
            item.transferSuccessRate === null ? [] : [item.transferSuccessRate],
          ),
        ),
      ),
      latencyP50Ms: percentile(latencies, 50),
      latencyP95Ms: percentile(latencies, 95),
    },
    queries: queryMetrics,
  }
}

export function runParameterGrid(dataset, grid, evaluatedAt = new Date()) {
  const results = []
  for (const minSimilarity of grid.minSimilarities) {
    for (const matchCount of grid.matchCounts) {
      for (const decayHalfLifeDays of grid.decayHalfLivesDays) {
        results.push(
          evaluateConfiguration(
            dataset,
            { decayHalfLifeDays, matchCount, minSimilarity },
            evaluatedAt,
          ),
        )
      }
    }
  }
  return results.sort(
    (left, right) =>
      right.metrics.recall - left.metrics.recall ||
      right.metrics.meanReciprocalRank - left.metrics.meanReciprocalRank ||
      right.metrics.precision - left.metrics.precision ||
      left.configuration.matchCount - right.configuration.matchCount,
  )
}

function formatPercent(value) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`
}

export function formatEvaluationReport({
  dataset,
  simulatedResults,
  observedResults,
  generatedAt,
}) {
  const lines = [
    `# Memory retrieval evaluation: ${dataset.name}`,
    "",
    `- Dataset kind: \`${dataset.kind}\``,
    `- Queries: ${dataset.queries.length}`,
    `- Generated at: ${generatedAt.toISOString()}`,
    "",
    "## Simulated ranking grid",
    "",
    "| Threshold | Limit | Decay half-life | Precision | Recall | MRR | Transfer recall |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ]
  for (const result of simulatedResults) {
    lines.push(
      `| ${result.configuration.minSimilarity} | ${result.configuration.matchCount} | ${
        result.configuration.decayHalfLifeDays ?? "none"
      } | ${formatPercent(result.metrics.precision)} | ${formatPercent(
        result.metrics.recall,
      )} | ${result.metrics.meanReciprocalRank.toFixed(3)} | ${formatPercent(
        result.metrics.transferOpportunityRecall,
      )} |`,
    )
  }

  lines.push("", "## Observed runs", "")
  if (observedResults.length === 0) {
    lines.push("No observed HNSW runs are present in this dataset.")
  } else {
    lines.push(
      "| Run | Precision | Recall | MRR | Transfer success | Error prompt rate | p50 | p95 |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    )
    for (const result of observedResults) {
      lines.push(
        `| ${result.id} | ${formatPercent(result.metrics.precision)} | ${formatPercent(
          result.metrics.recall,
        )} | ${result.metrics.meanReciprocalRank.toFixed(3)} | ${formatPercent(
          result.metrics.transferSuccessRate,
        )} | ${formatPercent(result.metrics.erroneousPromptRate)} | ${
          result.metrics.latencyP50Ms ?? "n/a"
        } ms | ${result.metrics.latencyP95Ms ?? "n/a"} ms |`,
      )
    }
  }
  lines.push(
    "",
    "## Interpretation boundary",
    "",
    "The simulated grid compares application-level threshold, result count, and deterministic temporal decay over the supplied candidate pool. It does not measure HNSW recall or justify changing `m`, `ef_construction`, or `ef_search`. HNSW decisions require observed runs captured from the same production-sanitized query set after rebuilding each candidate index.",
    "",
  )
  return `${lines.join("\n")}\n`
}
