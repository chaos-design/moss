import {
  createEmptyLearningMemory,
  type LearningMemoryEvent,
  type LearningMemoryItem,
  type LearningMemoryState,
  parseLearningMemory,
  type SceneMemoryProgress,
  type TransferTarget,
} from "./learning-memory"

export type LearningMemorySyncStatus =
  | "connecting"
  | "local"
  | "syncing"
  | "synced"
  | "offline"
  | "error"

export type LearningMemorySnapshotRow = {
  state: unknown
  revision: number
  updated_at: string
  device_id: string
}

function timestamp(value: string | undefined) {
  const parsed = value ? new Date(value).getTime() : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function mergeTransferTargets(left: TransferTarget[], right: TransferTarget[]) {
  const targets = new Map<string, TransferTarget>()
  for (const target of [...left, ...right]) {
    targets.set(target.sceneId, target)
  }
  return [...targets.values()]
}

function mergeMemoryItem(
  local: LearningMemoryItem,
  remote: LearningMemoryItem,
): LearningMemoryItem {
  const localIsNewer = timestamp(local.lastSeenAt) > timestamp(remote.lastSeenAt)
  const recent = localIsNewer ? local : remote

  return {
    ...recent,
    encounters: Math.max(local.encounters, remote.encounters),
    successfulRecalls: Math.max(local.successfulRecalls, remote.successfulRecalls),
    lapseCount: Math.max(local.lapseCount, remote.lapseCount),
    transferTargets: mergeTransferTargets(local.transferTargets, remote.transferTargets),
  }
}

function mergeMemoryItems(local: LearningMemoryItem[], remote: LearningMemoryItem[]) {
  const items = new Map<string, LearningMemoryItem>()
  for (const item of local) {
    items.set(item.id, item)
  }
  for (const item of remote) {
    const localItem = items.get(item.id)
    items.set(item.id, localItem ? mergeMemoryItem(localItem, item) : item)
  }
  return [...items.values()].sort(
    (left, right) => timestamp(right.lastSeenAt) - timestamp(left.lastSeenAt),
  )
}

function mergeSceneProgress(
  local: Record<string, SceneMemoryProgress>,
  remote: Record<string, SceneMemoryProgress>,
) {
  const progress = new Map<string, SceneMemoryProgress>(Object.entries(local))

  for (const [sceneId, remoteProgress] of Object.entries(remote)) {
    const localProgress = progress.get(sceneId)
    if (!localProgress) {
      progress.set(sceneId, remoteProgress)
      continue
    }

    const recent =
      timestamp(localProgress.lastPracticedAt) > timestamp(remoteProgress.lastPracticedAt)
        ? localProgress
        : remoteProgress
    progress.set(sceneId, {
      ...recent,
      turns: Math.max(localProgress.turns, remoteProgress.turns),
      accurateTurns: Math.max(localProgress.accurateTurns, remoteProgress.accurateTurns),
      practicedExpressions: Array.from(
        new Set([
          ...localProgress.practicedExpressions,
          ...remoteProgress.practicedExpressions,
        ]),
      ),
    })
  }

  return Object.fromEntries(progress)
}

function mergeEvents(local: LearningMemoryEvent[], remote: LearningMemoryEvent[]) {
  const events = new Map<string, LearningMemoryEvent>()
  for (const event of [...local, ...remote]) {
    events.set(event.id, event)
  }
  return [...events.values()].sort(
    (left, right) => timestamp(right.occurredAt) - timestamp(left.occurredAt),
  )
}

export function mergeLearningMemory(
  localValue: LearningMemoryState,
  remoteValue: LearningMemoryState,
): LearningMemoryState {
  const local = parseLearningMemory(localValue)
  const remote = parseLearningMemory(remoteValue)
  const localIsNewer = timestamp(local.updatedAt) > timestamp(remote.updatedAt)

  return {
    version: local.version,
    profile: localIsNewer ? local.profile : remote.profile,
    items: mergeMemoryItems(local.items, remote.items),
    sceneProgress: mergeSceneProgress(local.sceneProgress, remote.sceneProgress),
    events: mergeEvents(local.events, remote.events),
    updatedAt:
      timestamp(local.updatedAt) > timestamp(remote.updatedAt)
        ? local.updatedAt
        : remote.updatedAt,
  }
}

export function parseLearningMemorySnapshot(
  row: LearningMemorySnapshotRow,
): LearningMemoryState {
  return parseLearningMemory(row.state)
}

export function getLearningMemoryFingerprint(state: LearningMemoryState) {
  function sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(sortValue)
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nestedValue]) => [key, sortValue(nestedValue)]),
      )
    }
    return value
  }

  return JSON.stringify(sortValue(state))
}

export function createEmptyLearningMemorySnapshot(now = new Date()) {
  return {
    state: createEmptyLearningMemory(now),
    revision: 0,
    updated_at: now.toISOString(),
    device_id: "",
  } satisfies LearningMemorySnapshotRow
}
