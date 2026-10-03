import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
  evaluateObservedRun,
  formatEvaluationReport,
  runParameterGrid,
  validateEvaluationDataset,
} from "./memory-evaluation.mjs"

const defaultGrid = {
  minSimilarities: [0.2, 0.3, 0.4, 0.5],
  matchCounts: [3, 5, 8],
  decayHalfLivesDays: [null, 30, 90],
}

function readOption(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseNumberList(value, fallback, { allowNull = false } = {}) {
  if (!value) {
    return fallback
  }
  return value.split(",").map((entry) => {
    const normalized = entry.trim().toLocaleLowerCase()
    if (allowNull && (normalized === "none" || normalized === "null")) {
      return null
    }
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid numeric list value: ${entry}`)
    }
    return parsed
  })
}

export function parseArguments(argv) {
  const datasetPath = readOption(argv, "--dataset")
  if (!datasetPath) {
    throw new Error(
      "Usage: pnpm memory:evaluate -- --dataset <path> [--output <path>] [--format markdown|json]",
    )
  }
  const format = readOption(argv, "--format") ?? "markdown"
  if (!["json", "markdown"].includes(format)) {
    throw new Error("--format must be markdown or json")
  }
  return {
    datasetPath: resolve(datasetPath),
    outputPath: readOption(argv, "--output") ? resolve(readOption(argv, "--output")) : null,
    format,
    evaluatedAt: new Date(readOption(argv, "--at") ?? Date.now()),
    grid: {
      minSimilarities: parseNumberList(
        readOption(argv, "--thresholds"),
        defaultGrid.minSimilarities,
      ),
      matchCounts: parseNumberList(readOption(argv, "--limits"), defaultGrid.matchCounts),
      decayHalfLivesDays: parseNumberList(
        readOption(argv, "--half-lives"),
        defaultGrid.decayHalfLivesDays,
        { allowNull: true },
      ),
    },
  }
}

export async function evaluateDataset(args) {
  if (Number.isNaN(args.evaluatedAt.getTime())) {
    throw new Error("--at must be a valid date")
  }
  const dataset = validateEvaluationDataset(
    JSON.parse(await readFile(args.datasetPath, "utf8")),
  )
  const simulatedResults = runParameterGrid(dataset, args.grid, args.evaluatedAt)
  const observedResults = (dataset.observedRuns ?? []).map((run) =>
    evaluateObservedRun(dataset, run),
  )
  const result = {
    dataset: {
      kind: dataset.kind,
      name: dataset.name,
      queryCount: dataset.queries.length,
    },
    generatedAt: args.evaluatedAt.toISOString(),
    simulatedResults,
    observedResults,
  }
  const output =
    args.format === "json"
      ? `${JSON.stringify(result, null, 2)}\n`
      : formatEvaluationReport({
          dataset,
          simulatedResults,
          observedResults,
          generatedAt: args.evaluatedAt,
        })

  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true })
    await writeFile(args.outputPath, output)
  } else {
    process.stdout.write(output)
  }
  return result
}

async function main() {
  await evaluateDataset(parseArguments(process.argv.slice(2)))
}

if (import.meta.url === `file://${resolve(process.argv[1] ?? "")}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
