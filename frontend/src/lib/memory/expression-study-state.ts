import type { SceneCategory } from "@/lib/demo-data"

/**
 * 地道表达库的学习组织状态：收藏、分组、逐条进度与筛选位置。
 *
 * 它是学习记忆快照（learning_memory_snapshots.state）的一个顶层字段，因此天然复用
 * localStorage 优先 + Supabase jsonb + Realtime 的跨设备同步链路，不需要改 SQL。
 *
 * 合并语义刻意不同于事件流：收藏/分组/进度都是学习者主动管理的集合，删除必须能
 * 跨设备传播。这里用「按 key 的 Last-Write-Wins + 墓碑」而不是简单并集——并集会让
 * 一台设备取消的收藏被另一台设备的旧快照复活（与 mergeEvents 的已知限制同源）。
 */
export const expressionSourceFilters = ["all", "builtin", "imported"] as const
export type ExpressionSourceFilter = (typeof expressionSourceFilters)[number]

export type ExpressionFilters = {
  query: string
  categories: SceneCategory[]
  source: ExpressionSourceFilter
}

export type ExpressionProgressStatus = "new" | "learning" | "mastered"

export type ExpressionProgressEntry = {
  status: ExpressionProgressStatus
  reviews: number
  lastReviewedAt: string
  updatedAt: string
}

export type ExpressionFavoriteEntry = {
  identity: string
  addedAt: string
  updatedAt: string
  deletedAt?: string
}

export type ExpressionGroup = {
  id: string
  name: string
  /** 分组用表达身份（sceneCategory:normalized phrase）记账，避免导入覆盖内置后错位。 */
  itemIds: string[]
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export type ExpressionStudyState = {
  favorites: Record<string, ExpressionFavoriteEntry>
  groups: Record<string, ExpressionGroup>
  progress: Record<string, ExpressionProgressEntry>
  filters: { value: ExpressionFilters; updatedAt: string }
  updatedAt: string
}

const progressStatuses: readonly ExpressionProgressStatus[] = ["new", "learning", "mastered"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function timestamp(value: string | undefined): number {
  const parsed = value ? new Date(value).getTime() : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function fieldString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

export function createEmptyExpressionFilters(): ExpressionFilters {
  return { query: "", categories: [], source: "all" }
}

export function createEmptyExpressionStudyState(now = new Date()): ExpressionStudyState {
  const iso = now.toISOString()
  return {
    favorites: {},
    groups: {},
    progress: {},
    filters: { value: createEmptyExpressionFilters(), updatedAt: iso },
    updatedAt: iso,
  }
}

/** 解析旧快照时补齐缺失字段；非法条目直接丢弃，不让脏数据进入合并。 */
export function parseExpressionStudyState(
  value: unknown,
  now = new Date(),
): ExpressionStudyState {
  const empty = createEmptyExpressionStudyState(now)
  if (!isRecord(value)) {
    return empty
  }

  const favorites: ExpressionStudyState["favorites"] = {}
  if (isRecord(value.favorites)) {
    for (const [identity, raw] of Object.entries(value.favorites)) {
      if (!identity || !isRecord(raw) || typeof raw.updatedAt !== "string") {
        continue
      }
      favorites[identity] = {
        identity,
        addedAt: fieldString(raw.addedAt, fieldString(raw.updatedAt, empty.updatedAt)),
        updatedAt: raw.updatedAt,
        ...(typeof raw.deletedAt === "string" ? { deletedAt: raw.deletedAt } : {}),
      }
    }
  }

  const groups: ExpressionStudyState["groups"] = {}
  if (isRecord(value.groups)) {
    for (const [id, raw] of Object.entries(value.groups)) {
      if (
        !id ||
        !isRecord(raw) ||
        typeof raw.name !== "string" ||
        typeof raw.updatedAt !== "string"
      ) {
        continue
      }
      groups[id] = {
        id,
        name: raw.name,
        itemIds: Array.isArray(raw.itemIds)
          ? raw.itemIds.filter((entry): entry is string => typeof entry === "string")
          : [],
        createdAt: fieldString(raw.createdAt, fieldString(raw.updatedAt, empty.updatedAt)),
        updatedAt: raw.updatedAt,
        ...(typeof raw.deletedAt === "string" ? { deletedAt: raw.deletedAt } : {}),
      }
    }
  }

  const progress: ExpressionStudyState["progress"] = {}
  if (isRecord(value.progress)) {
    for (const [identity, raw] of Object.entries(value.progress)) {
      if (!identity || !isRecord(raw) || typeof raw.updatedAt !== "string") {
        continue
      }
      const status = progressStatuses.includes(raw.status as ExpressionProgressStatus)
        ? (raw.status as ExpressionProgressStatus)
        : "new"
      progress[identity] = {
        status,
        reviews:
          typeof raw.reviews === "number" && Number.isFinite(raw.reviews)
            ? Math.max(0, Math.floor(raw.reviews))
            : 0,
        lastReviewedAt: fieldString(
          raw.lastReviewedAt,
          fieldString(raw.updatedAt, empty.updatedAt),
        ),
        updatedAt: raw.updatedAt,
      }
    }
  }

  let filters = empty.filters
  if (isRecord(value.filters) && isRecord(value.filters.value)) {
    const rawFilters = value.filters.value
    filters = {
      value: {
        query: fieldString(rawFilters.query, ""),
        categories: Array.isArray(rawFilters.categories)
          ? rawFilters.categories.filter(
              (entry): entry is SceneCategory => typeof entry === "string",
            )
          : [],
        source: expressionSourceFilters.includes(rawFilters.source as ExpressionSourceFilter)
          ? (rawFilters.source as ExpressionSourceFilter)
          : "all",
      },
      updatedAt: fieldString(value.filters.updatedAt, empty.filters.updatedAt),
    }
  }

  return {
    favorites,
    groups,
    progress,
    filters,
    updatedAt: fieldString(value.updatedAt, empty.updatedAt),
  }
}

/**
 * 两个值谁更新：先比时间戳；相等时用序列化值做稳定决胜，保证两台设备以相反参数
 * 调用合并仍得到同一结果（收敛），避免同步来回抖动。
 */
function pickRecent<T>(left: T, right: T, timeOf: (value: T) => string): T {
  const delta = timestamp(timeOf(left)) - timestamp(timeOf(right))
  if (delta > 0) {
    return left
  }
  if (delta < 0) {
    return right
  }
  return JSON.stringify(left) >= JSON.stringify(right) ? left : right
}

function mergeTombstonedMap<T extends { updatedAt: string }>(
  local: Record<string, T>,
  remote: Record<string, T>,
): Record<string, T> {
  const result: Record<string, T> = { ...local }
  for (const [key, remoteValue] of Object.entries(remote)) {
    const localValue = result[key]
    result[key] = localValue
      ? pickRecent(localValue, remoteValue, (value) => value.updatedAt)
      : remoteValue
  }
  return result
}

function mergeProgressMap(
  local: Record<string, ExpressionProgressEntry>,
  remote: Record<string, ExpressionProgressEntry>,
): Record<string, ExpressionProgressEntry> {
  const result: Record<string, ExpressionProgressEntry> = { ...local }
  for (const [identity, remoteEntry] of Object.entries(remote)) {
    const localEntry = result[identity]
    if (!localEntry) {
      result[identity] = remoteEntry
      continue
    }
    const recent = pickRecent(localEntry, remoteEntry, (value) => value.updatedAt)
    result[identity] = {
      status: recent.status,
      reviews: Math.max(localEntry.reviews, remoteEntry.reviews),
      lastReviewedAt:
        timestamp(localEntry.lastReviewedAt) >= timestamp(remoteEntry.lastReviewedAt)
          ? localEntry.lastReviewedAt
          : remoteEntry.lastReviewedAt,
      updatedAt:
        timestamp(localEntry.updatedAt) >= timestamp(remoteEntry.updatedAt)
          ? localEntry.updatedAt
          : remoteEntry.updatedAt,
    }
  }
  return result
}

export function mergeExpressionStudyState(
  localValue: ExpressionStudyState,
  remoteValue: ExpressionStudyState,
): ExpressionStudyState {
  const local = parseExpressionStudyState(localValue)
  const remote = parseExpressionStudyState(remoteValue)
  const recentFilters = pickRecent(local.filters, remote.filters, (value) => value.updatedAt)

  return {
    favorites: mergeTombstonedMap(local.favorites, remote.favorites),
    groups: mergeTombstonedMap(local.groups, remote.groups),
    progress: mergeProgressMap(local.progress, remote.progress),
    filters: recentFilters,
    updatedAt:
      timestamp(local.updatedAt) >= timestamp(remote.updatedAt)
        ? local.updatedAt
        : remote.updatedAt,
  }
}

function withTimestamp(state: ExpressionStudyState, now: Date): ExpressionStudyState {
  return { ...state, updatedAt: now.toISOString() }
}

/** 切换收藏；再次点击写入墓碑，因此取消收藏也能跨设备传播。 */
export function toggleExpressionFavorite(
  state: ExpressionStudyState,
  identity: string,
  now = new Date(),
): ExpressionStudyState {
  if (!identity) {
    return state
  }
  const iso = now.toISOString()
  const existing = state.favorites[identity]
  const isActive = Boolean(existing && !existing.deletedAt)
  const entry: ExpressionFavoriteEntry = isActive
    ? { identity, addedAt: existing!.addedAt, updatedAt: iso, deletedAt: iso }
    : { identity, addedAt: existing?.addedAt ?? iso, updatedAt: iso }
  return withTimestamp({ ...state, favorites: { ...state.favorites, [identity]: entry } }, now)
}

export function createExpressionGroup(
  state: ExpressionStudyState,
  id: string,
  name: string,
  now = new Date(),
): ExpressionStudyState {
  const trimmed = name.trim()
  if (!id || !trimmed || (state.groups[id] && !state.groups[id].deletedAt)) {
    return state
  }
  const iso = now.toISOString()
  const group: ExpressionGroup = {
    id,
    name: trimmed,
    itemIds: [],
    createdAt: state.groups[id]?.createdAt ?? iso,
    updatedAt: iso,
  }
  return withTimestamp({ ...state, groups: { ...state.groups, [id]: group } }, now)
}

/** 一次性创建或补齐分组：推荐分组整组加入时只需要一次快照写入。 */
export function addExpressionsToGroup(
  state: ExpressionStudyState,
  id: string,
  name: string,
  identities: readonly string[],
  now = new Date(),
): ExpressionStudyState {
  const nextIdentities = Array.from(new Set(identities.filter(Boolean)))
  if (!id || nextIdentities.length === 0) {
    return state
  }
  const iso = now.toISOString()
  const existing = state.groups[id]
  const group: ExpressionGroup =
    existing && !existing.deletedAt
      ? {
          ...existing,
          itemIds: Array.from(new Set([...existing.itemIds, ...nextIdentities])),
          updatedAt: iso,
        }
      : {
          id,
          name: name.trim() || existing?.name || "推荐分组",
          itemIds: nextIdentities,
          createdAt: existing?.createdAt ?? iso,
          updatedAt: iso,
        }
  return withTimestamp({ ...state, groups: { ...state.groups, [id]: group } }, now)
}

export function renameExpressionGroup(
  state: ExpressionStudyState,
  id: string,
  name: string,
  now = new Date(),
): ExpressionStudyState {
  const existing = state.groups[id]
  const trimmed = name.trim()
  if (!existing || existing.deletedAt || !trimmed) {
    return state
  }
  const group: ExpressionGroup = { ...existing, name: trimmed, updatedAt: now.toISOString() }
  return withTimestamp({ ...state, groups: { ...state.groups, [id]: group } }, now)
}

export function deleteExpressionGroup(
  state: ExpressionStudyState,
  id: string,
  now = new Date(),
): ExpressionStudyState {
  const existing = state.groups[id]
  if (!existing || existing.deletedAt) {
    return state
  }
  const iso = now.toISOString()
  const group: ExpressionGroup = { ...existing, deletedAt: iso, updatedAt: iso }
  return withTimestamp({ ...state, groups: { ...state.groups, [id]: group } }, now)
}

export function toggleExpressionGroupItem(
  state: ExpressionStudyState,
  groupId: string,
  identity: string,
  now = new Date(),
): ExpressionStudyState {
  const group = state.groups[groupId]
  if (!group || group.deletedAt || !identity) {
    return state
  }
  const itemIds = group.itemIds.includes(identity)
    ? group.itemIds.filter((entry) => entry !== identity)
    : [...group.itemIds, identity]
  const next: ExpressionGroup = { ...group, itemIds, updatedAt: now.toISOString() }
  return withTimestamp({ ...state, groups: { ...state.groups, [groupId]: next } }, now)
}

export type ExpressionProgressUpdate = {
  status?: ExpressionProgressStatus
  /** 完成一次练习时传 true，reviews 累加（合并时取最大值，不会因重试重复计数）。 */
  incrementReviews?: boolean
  lastReviewedAt?: string
}

export function recordExpressionProgress(
  state: ExpressionStudyState,
  identity: string,
  update: ExpressionProgressUpdate,
  now = new Date(),
): ExpressionStudyState {
  if (!identity) {
    return state
  }
  const iso = now.toISOString()
  const existing = state.progress[identity]
  const entry: ExpressionProgressEntry = {
    status: update.status ?? existing?.status ?? (update.incrementReviews ? "learning" : "new"),
    reviews: Math.max(0, (existing?.reviews ?? 0) + (update.incrementReviews ? 1 : 0)),
    lastReviewedAt: update.lastReviewedAt ?? existing?.lastReviewedAt ?? iso,
    updatedAt: iso,
  }
  return withTimestamp({ ...state, progress: { ...state.progress, [identity]: entry } }, now)
}

export function saveExpressionFilters(
  state: ExpressionStudyState,
  filters: ExpressionFilters,
  now = new Date(),
): ExpressionStudyState {
  return withTimestamp(
    { ...state, filters: { value: filters, updatedAt: now.toISOString() } },
    now,
  )
}

export function getActiveFavorites(state: ExpressionStudyState): string[] {
  return Object.values(state.favorites)
    .filter((entry) => !entry.deletedAt)
    .map((entry) => entry.identity)
}

export function getActiveGroups(state: ExpressionStudyState): ExpressionGroup[] {
  return Object.values(state.groups).filter((group) => !group.deletedAt)
}

export function getExpressionProgress(
  state: ExpressionStudyState,
  identity: string,
): ExpressionProgressEntry | undefined {
  return state.progress[identity]
}
