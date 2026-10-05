import { type RecallRating, type ReviewState, scheduleReview } from "./spaced-repetition"

const memoryVersion = 1
const dayMs = 86_400_000

export type LearningMemoryKind = "expression" | "grammar" | "pronunciation" | "vocabulary"

/**
 * 单一词表：一次学习活动既决定学习记忆事件类型，也决定云端长期记忆的 `source_type`。
 * 新增学习面时只在这里增加一个值，分析、图表与云端契约都从它派生，避免并行枚举漂移。
 */
export const learningActivityTypes = [
  "recall",
  "conversation",
  "review",
  "shadowing",
  "expression",
] as const

export type LearningActivityType = (typeof learningActivityTypes)[number]

export const learningActivityLabels: Record<LearningActivityType, string> = {
  recall: "记忆回想",
  conversation: "AI 对话",
  review: "智能复习",
  shadowing: "影子跟读",
  expression: "表达学习",
}

export type TransferTarget = {
  sceneId: string
  sceneTitle: string
  reason: string
}

export type LearningMemoryItem = {
  id: string
  kind: LearningMemoryKind
  label: string
  cue: string
  answer: string
  explanation: string
  sourceSceneId: string
  sourceSceneTitle: string
  transferTargets: TransferTarget[]
  strength: number
  encounters: number
  successfulRecalls: number
  lapseCount: number
  intervalDays: number
  easeFactor: number
  repetitions: number
  lastSeenAt: string
  nextReviewAt: string
}

export type SceneMemoryProgress = {
  sceneId: string
  sceneTitle: string
  turns: number
  accurateTurns: number
  practicedExpressions: string[]
  lastPracticedAt: string
}

export type LearningMemoryEvent = {
  id: string
  type: LearningActivityType
  itemId: string
  sceneId: string
  successful: boolean
  occurredAt: string
  /** `recall` 事件记录的是观察到的尝试，而不是学习者的自评结果。 */
  recall?: {
    /** 从看到线索到揭示答案之间的实际思考时长。 */
    elapsedMs: number
    /** 揭示答案后学习者是否自行评分。未评分说明这次尝试没有被结论覆盖。 */
    rated: boolean
  }
  shadowing?: {
    overallScore: number
    clarityScore: number
    fluencyScore: number
    rhythmScore: number
    durationSeconds: number
  }
}

export type LearnerProfile = {
  goal: string
  dailyMinutes: number
  preferredContext: string
  autoRecall: boolean
}

export type LearningMemoryState = {
  version: typeof memoryVersion
  profile: LearnerProfile
  items: LearningMemoryItem[]
  sceneProgress: Record<string, SceneMemoryProgress>
  events: LearningMemoryEvent[]
  updatedAt: string
}

export type ConversationMemoryContextItem = {
  id: string
  label: string
  expression: string
  source: string
  guidance: string
  strength: number
}

export type ConversationShortTermMemory = {
  sceneId: string
  activeGoal: string
  turnCount: number
  recentUserInputs: string[]
}

export type ConversationMemoryPayload = {
  shortTerm: ConversationShortTermMemory
  longTerm: ConversationMemoryContextItem[]
}

export type ConversationTurnMemoryInput = {
  sceneId: string
  sceneTitle: string
  userInput: string
  targetExpression: string
  targetLabel: string
  corrected: string
  explanation: string
  accurate: boolean
}

export type ShadowingAttemptMemoryInput = {
  itemId: string
  sceneId: string
  sceneTitle: string
  label: string
  sentence: string
  focusWord: string
  overallScore: number
  clarityScore: number
  fluencyScore: number
  rhythmScore: number
  durationSeconds: number
}

/**
 * 一次真实的回想尝试：看到线索、思考、揭示答案。
 * 这与自评结果分开记录，因为自评无法证明学习者真的想起了目标表达。
 */
export type RecallAttemptMemoryInput = {
  itemId: string
  /** 从线索呈现到揭示答案之间的实际思考时长。 */
  elapsedMs: number
}

/**
 * 主动学习一条地道表达：把词库里的表达带入长期记忆。
 * 词库条目使用 `sceneCategory` 而不是场景 ID，因此 `sceneId` 是词库分类值，
 * 这些记忆只参与复习与记忆档案，不伪装成某个对话场景的练习成果。
 */
export type ExpressionStudyMemoryInput = {
  itemId: string
  sceneCategory: string
  sceneTitle: string
  label: string
  phrase: string
  explanation: string
  example: string
  libraryKind: string
}

export type LearningPlanStep = {
  id: "recall" | "conversation" | "shadowing"
  title: string
  description: string
  durationMinutes: number
  href: string
  memoryItemId: string
}

export type LearningPlan = {
  focus: LearningMemoryItem
  sceneId: string
  sceneTitle: string
  headline: string
  reason: string
  target: string
  dueCount: number
  steps: LearningPlanStep[]
}

export function createEmptyLearningMemory(now = new Date()): LearningMemoryState {
  return {
    version: memoryVersion,
    profile: {
      goal: "在真实生活与工作场景中自然交流",
      dailyMinutes: 20,
      preferredContext: "生活与职场",
      autoRecall: true,
    },
    items: [],
    sceneProgress: {},
    events: [],
    updatedAt: now.toISOString(),
  }
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, Math.round(value)))
}

function offsetIso(now: Date, milliseconds: number) {
  return new Date(now.getTime() + milliseconds).toISOString()
}

function createEventId(type: LearningMemoryEvent["type"], now: Date) {
  return `${type}-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`
}

function normalizeExpression(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/\.{2,}/g, " ")
    .replace(/[^\w'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeMemoryExpression(value: string) {
  return value
    .replace(/([A-Za-z])(?=that\b)/g, "$1 ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function expressionWasUsed(input: string, expression: string) {
  const normalizedInput = normalizeExpression(input)
  const normalizedExpression = normalizeExpression(expression)
  if (!normalizedExpression) {
    return false
  }

  const meaningfulPrefix = normalizedExpression.split(" ").slice(0, 3).join(" ")
  return (
    normalizedInput.includes(normalizedExpression) || normalizedInput.includes(meaningfulPrefix)
  )
}

function appendEvent(
  state: LearningMemoryState,
  event: Omit<LearningMemoryEvent, "id">,
  now: Date,
) {
  return [
    {
      ...event,
      id: createEventId(event.type, now),
    },
    ...state.events,
  ]
}

export function createDefaultLearningMemory(now = new Date()): LearningMemoryState {
  const nowIso = now.toISOString()

  return {
    version: memoryVersion,
    profile: {
      goal: "在真实生活与工作场景中自然交流",
      dailyMinutes: 20,
      preferredContext: "生活与职场",
      autoRecall: true,
    },
    items: [
      {
        id: "polite-request",
        kind: "expression",
        label: "礼貌提出请求",
        cue: "在服务场景中礼貌地提出想要的东西",
        answer: "Could I get ..., please?",
        explanation: "用 could I get 替代 I want，让请求更自然。",
        sourceSceneId: "coffee",
        sourceSceneTitle: "咖啡店点单",
        transferTargets: [
          {
            sceneId: "restaurant",
            sceneTitle: "餐厅用餐",
            reason: "把点单句型迁移到新的餐饮情景",
          },
          {
            sceneId: "shopping",
            sceneTitle: "商店购物",
            reason: "用同一礼貌结构提出试穿和商品请求",
          },
        ],
        strength: 64,
        encounters: 6,
        successfulRecalls: 3,
        lapseCount: 2,
        intervalDays: 4,
        easeFactor: 2.35,
        repetitions: 2,
        lastSeenAt: offsetIso(now, -2 * dayMs),
        nextReviewAt: offsetIso(now, -60 * 60 * 1000),
      },
      {
        id: "clarify-trade-off",
        kind: "expression",
        label: "礼貌澄清",
        cue: "在会议中请对方进一步解释一个取舍",
        answer: "Could you clarify the trade-off?",
        explanation: "先提出澄清请求，再复述你需要确认的具体信息。",
        sourceSceneId: "meeting",
        sourceSceneTitle: "工作会议",
        transferTargets: [
          {
            sceneId: "one-on-one",
            sceneTitle: "一对一工作沟通",
            reason: "在同步阻碍时主动确认优先级",
          },
          {
            sceneId: "hotel",
            sceneTitle: "酒店入住",
            reason: "将澄清结构迁移到服务沟通",
          },
        ],
        strength: 42,
        encounters: 4,
        successfulRecalls: 1,
        lapseCount: 2,
        intervalDays: 2,
        easeFactor: 2.15,
        repetitions: 1,
        lastSeenAt: offsetIso(now, -dayMs),
        nextReviewAt: offsetIso(now, -20 * 60 * 1000),
      },
      {
        id: "in-stock",
        kind: "vocabulary",
        label: "确认库存",
        cue: "询问某个商品是否还有货",
        answer: "Do you still have this in stock?",
        explanation: "in stock 表示有现货，也可以替换 this 来指明具体商品。",
        sourceSceneId: "shopping",
        sourceSceneTitle: "商店购物",
        transferTargets: [
          {
            sceneId: "grocery",
            sceneTitle: "超市采购",
            reason: "在超市场景中复用库存询问",
          },
        ],
        strength: 78,
        encounters: 5,
        successfulRecalls: 4,
        lapseCount: 1,
        intervalDays: 7,
        easeFactor: 2.55,
        repetitions: 3,
        lastSeenAt: offsetIso(now, -dayMs),
        nextReviewAt: offsetIso(now, dayMs),
      },
      {
        id: "past-experience",
        kind: "grammar",
        label: "过去经历的时态",
        cue: "讲述昨天或已经结束的经历",
        answer: "Yesterday I went to the airport.",
        explanation: "明确的过去时间需要搭配一般过去时。",
        sourceSceneId: "airport",
        sourceSceneTitle: "机场出行",
        transferTargets: [
          {
            sceneId: "small-talk",
            sceneTitle: "日常寒暄",
            reason: "在聊近况时复述一次过去经历",
          },
          {
            sceneId: "interview",
            sceneTitle: "求职面试",
            reason: "用过去时完整描述一个工作案例",
          },
        ],
        strength: 48,
        encounters: 4,
        successfulRecalls: 2,
        lapseCount: 2,
        intervalDays: 3,
        easeFactor: 2.2,
        repetitions: 2,
        lastSeenAt: offsetIso(now, -3 * dayMs),
        nextReviewAt: offsetIso(now, 3 * 60 * 60 * 1000),
      },
      {
        id: "theta-sound",
        kind: "pronunciation",
        label: "/θ/ 舌尖位置",
        cue: "清楚读出 think 和 three",
        answer: "think / three",
        explanation: "舌尖轻触上下齿之间，让气流持续通过。",
        sourceSceneId: "shadowing",
        sourceSceneTitle: "影子跟读",
        transferTargets: [
          {
            sceneId: "meeting",
            sceneTitle: "工作会议",
            reason: "在完整表达中稳定读出 think",
          },
        ],
        strength: 55,
        encounters: 3,
        successfulRecalls: 2,
        lapseCount: 1,
        intervalDays: 3,
        easeFactor: 2.3,
        repetitions: 2,
        lastSeenAt: offsetIso(now, -2 * dayMs),
        nextReviewAt: offsetIso(now, 8 * 60 * 60 * 1000),
      },
    ],
    sceneProgress: {
      coffee: {
        sceneId: "coffee",
        sceneTitle: "咖啡店点单",
        turns: 6,
        accurateTurns: 4,
        practicedExpressions: ["Could I get ..., please?"],
        lastPracticedAt: offsetIso(now, -2 * dayMs),
      },
      meeting: {
        sceneId: "meeting",
        sceneTitle: "工作会议",
        turns: 4,
        accurateTurns: 2,
        practicedExpressions: ["Could you clarify the trade-off?"],
        lastPracticedAt: offsetIso(now, -dayMs),
      },
    },
    events: [],
    updatedAt: nowIso,
  }
}

export function parseLearningMemory(value: unknown, now = new Date()): LearningMemoryState {
  if (!value || typeof value !== "object") {
    return createEmptyLearningMemory(now)
  }

  const candidate = value as Partial<LearningMemoryState>
  if (
    candidate.version !== memoryVersion ||
    !candidate.profile ||
    !Array.isArray(candidate.items) ||
    !candidate.sceneProgress ||
    !Array.isArray(candidate.events)
  ) {
    return createEmptyLearningMemory(now)
  }

  const defaults = createEmptyLearningMemory(now)
  return {
    ...(candidate as LearningMemoryState),
    profile: {
      ...defaults.profile,
      ...candidate.profile,
    },
    items: candidate.items.flatMap((item) => {
      const answer = normalizeMemoryExpression(
        typeof item.answer === "string" ? item.answer : "",
      )
      return answer ? [{ ...item, answer }] : []
    }),
    sceneProgress: Object.fromEntries(
      Object.entries(candidate.sceneProgress).map(([sceneId, progress]) => [
        sceneId,
        {
          ...progress,
          practicedExpressions: progress.practicedExpressions
            .map(normalizeMemoryExpression)
            .filter(Boolean),
        },
      ]),
    ),
  }
}

export function getDueMemoryItems(state: LearningMemoryState, now = new Date()) {
  const nowTime = now.getTime()
  return [...state.items]
    .filter((item) => new Date(item.nextReviewAt).getTime() <= nowTime)
    .sort((left, right) => {
      const dueDifference =
        new Date(left.nextReviewAt).getTime() - new Date(right.nextReviewAt).getTime()
      return dueDifference || left.strength - right.strength
    })
}

export function getReviewQueue(
  state: LearningMemoryState,
  now = new Date(),
  targetMemoryItemId?: string,
) {
  const dueItems = getDueMemoryItems(state, now)
  const dueIds = new Set(dueItems.map((item) => item.id))
  const defaultQueue =
    dueItems.length >= 3
      ? dueItems
      : [
          ...dueItems,
          ...state.items
            .filter((item) => !dueIds.has(item.id))
            .sort((left, right) => left.strength - right.strength),
        ].slice(0, 3)
  const target = state.items.find((item) => item.id === targetMemoryItemId)
  return target
    ? [target, ...defaultQueue.filter((item) => item.id !== target.id)]
    : defaultQueue
}

export function getRelevantMemories(
  state: LearningMemoryState,
  sceneId: string,
  limit = 3,
  priorityMemoryItemId?: string,
) {
  return [...state.items]
    .filter(
      (item) =>
        item.sourceSceneId === sceneId ||
        item.transferTargets.some((target) => target.sceneId === sceneId),
    )
    .sort((left, right) => {
      if (left.id === priorityMemoryItemId) {
        return -1
      }
      if (right.id === priorityMemoryItemId) {
        return 1
      }
      return left.strength - right.strength
    })
    .slice(0, limit)
}

export function buildConversationMemoryContext(
  state: LearningMemoryState,
  sceneId: string,
  priorityMemoryItemId?: string,
): ConversationMemoryContextItem[] {
  if (!state.profile.autoRecall) {
    return []
  }
  return getRelevantMemories(state, sceneId, 3, priorityMemoryItemId).map((item) => {
    const target = item.transferTargets.find((candidate) => candidate.sceneId === sceneId)
    return {
      id: item.id,
      label: item.label,
      expression: item.answer,
      source: item.sourceSceneTitle,
      guidance: target?.reason ?? item.explanation,
      strength: item.strength,
    }
  })
}

export function createMemoryTargetHref(pathname: string, memoryItemId: string) {
  const separator = pathname.includes("?") ? "&" : "?"
  return `${pathname}${separator}memory=${encodeURIComponent(memoryItemId)}`
}

export function createLearningPlan(
  state: LearningMemoryState,
  now = new Date(),
): LearningPlan | null {
  const dueItems = getDueMemoryItems(state, now)
  const focus =
    dueItems[0] ?? [...state.items].sort((left, right) => left.strength - right.strength)[0]
  if (!focus) {
    return null
  }
  const target = focus.transferTargets[0] ?? {
    sceneId: focus.sourceSceneId,
    sceneTitle: focus.sourceSceneTitle,
    reason: "回到原场景巩固表达",
  }

  return {
    focus,
    sceneId: target.sceneId,
    sceneTitle: target.sceneTitle,
    headline: `把“${focus.label}”带进${target.sceneTitle}`,
    reason: `你在${focus.sourceSceneTitle}学过这个表达，当前记忆强度为 ${focus.strength}%。${target.reason}，比继续学习新内容更有效。`,
    target: `不看提示，在${target.sceneTitle}中主动使用 2 次`,
    dueCount: dueItems.length,
    steps: [
      {
        id: "recall",
        title: "先从记忆中找回",
        description: `看到中文情景后说出“${focus.answer}”`,
        durationMinutes: 3,
        href: createMemoryTargetHref("/workspace/review", focus.id),
        memoryItemId: focus.id,
      },
      {
        id: "conversation",
        title: `进入${target.sceneTitle}`,
        description: "AI 会创造合适时机，但不会先把答案告诉你",
        durationMinutes: 8,
        href: createMemoryTargetHref(
          `/workspace/conversation?scene=${encodeURIComponent(target.sceneId)}`,
          focus.id,
        ),
        memoryItemId: focus.id,
      },
      {
        id: "shadowing",
        title: "用声音固定表达",
        description: "完成一轮节奏跟读，再回到对话自由替换内容",
        durationMinutes: 5,
        href: createMemoryTargetHref("/workspace/shadowing", focus.id),
        memoryItemId: focus.id,
      },
    ],
  }
}

/**
 * 一次学习活动的判别联合。事件类型、记忆类型与强度策略都由活动类型本身决定，
 * 调用方不再各自硬编码 `kind`，因此新增学习面只会增加一个分支。
 */
export type LearningActivity =
  | { type: "recall"; input: RecallAttemptMemoryInput }
  | { type: "conversation"; input: ConversationTurnMemoryInput }
  | { type: "review"; input: { itemId: string; rating: RecallRating } }
  | { type: "shadowing"; input: ShadowingAttemptMemoryInput }
  | { type: "expression"; input: ExpressionStudyMemoryInput }

type MemoryOutcome = {
  itemId: string
  /** 找不到既有记忆时用该类型创建新条目。 */
  create?: Omit<
    LearningMemoryItem,
    | "strength"
    | "encounters"
    | "successfulRecalls"
    | "lapseCount"
    | "intervalDays"
    | "easeFactor"
    | "repetitions"
    | "lastSeenAt"
    | "nextReviewAt"
  >
  /** 未命中既有记忆时不做任何条目变更（复习对未知条目保持原有行为）。 */
  ignoreWhenMissing?: boolean
  successful: boolean
  strengthDelta: number
  nextReviewAt: string
  reviewSchedule?: Pick<ReviewState, "intervalDays" | "easeFactor" | "repetitions">
}

/**
 * 所有学习面共用的条目更新与事件写入路径。强度、计数与时间戳只在此处变化一次，
 * 保证跨设备合并使用的累积计数语义对所有活动类型一致。
 */
function applyMemoryOutcome(
  state: LearningMemoryState,
  outcome: MemoryOutcome,
  event: Omit<LearningMemoryEvent, "id">,
  now: Date,
): LearningMemoryState {
  const nowIso = now.toISOString()
  const existingItem = state.items.find((item) => item.id === outcome.itemId)
  if (!existingItem && (!outcome.create || outcome.ignoreWhenMissing)) {
    return state
  }

  const baseItem: LearningMemoryItem = existingItem ?? {
    ...(outcome.create as LearningMemoryItem),
    strength: 45,
    encounters: 0,
    successfulRecalls: 0,
    lapseCount: 0,
    intervalDays: 1,
    easeFactor: 2.3,
    repetitions: 0,
    lastSeenAt: nowIso,
    nextReviewAt: nowIso,
  }
  const nextItem: LearningMemoryItem = {
    ...baseItem,
    ...(outcome.reviewSchedule ?? {}),
    strength: clamp(baseItem.strength + outcome.strengthDelta),
    encounters: baseItem.encounters + 1,
    successfulRecalls: baseItem.successfulRecalls + (outcome.successful ? 1 : 0),
    lapseCount: baseItem.lapseCount + (outcome.successful ? 0 : 1),
    lastSeenAt: nowIso,
    nextReviewAt: outcome.nextReviewAt,
  }

  return {
    ...state,
    items: existingItem
      ? state.items.map((item) => (item.id === outcome.itemId ? nextItem : item))
      : [nextItem, ...state.items],
    events: appendEvent(state, event, now),
    updatedAt: nowIso,
  }
}

/** 复习事件会清理历史快照中遗留的 `dueAt` 字段，其余活动类型沿用同一路径。 */
function stripLegacyDueAt(item: LearningMemoryItem) {
  const legacy = { ...item } as LearningMemoryItem & { dueAt?: string }
  delete legacy.dueAt
  return legacy
}

/**
 * 记录一次回想尝试。尝试本身不代表成功，因此不改写强度与间隔：
 * 强度只由揭示答案后的自评决定，而这里保留了"被想起过"这一事实。
 * 未评分的尝试同样进入事件流，因此分析页能区分"练过"与"得出结论"。
 */
export function recordRecallAttempt(
  state: LearningMemoryState,
  input: RecallAttemptMemoryInput,
  now = new Date(),
): LearningMemoryState {
  const item = state.items.find((candidate) => candidate.id === input.itemId)
  if (!item) {
    return state
  }

  const nowIso = now.toISOString()
  return {
    ...state,
    events: appendEvent(
      state,
      {
        type: "recall",
        itemId: input.itemId,
        sceneId: item.sourceSceneId,
        // 观察到的尝试没有成败结论，成功与否留给随后（或缺席）的自评。
        successful: false,
        occurredAt: nowIso,
        recall: {
          elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
          rated: false,
        },
      },
      now,
    ),
    updatedAt: nowIso,
  }
}

/**
 * 词库表达在长期记忆中的稳定身份。词库条目以 `clientId` 为主键，
 * 因此重复学习同一条表达始终命中同一条记忆，跨设备合并后仍然幂等。
 */
export function createExpressionMemoryItemId(clientId: string) {
  return `expression-library-${clientId}`
}

/**
 * 主动学习一条词库表达。本机先写条目与事件，云端向量记忆由 provider 另行同步，
 * 因此这里不依赖任何 Provider 或网络状态。
 */
export function recordExpressionStudy(
  state: LearningMemoryState,
  input: ExpressionStudyMemoryInput,
  now = new Date(),
): LearningMemoryState {
  const phrase = normalizeMemoryExpression(input.phrase)
  if (!phrase) {
    return state
  }

  const nowIso = now.toISOString()
  const kind: LearningMemoryKind =
    input.libraryKind === "sentence-pattern" ? "grammar" : "expression"
  return applyMemoryOutcome(
    state,
    {
      itemId: input.itemId,
      create: {
        id: input.itemId,
        kind,
        label: input.label,
        cue: `主动学习并记住“${input.phrase}”`,
        answer: phrase,
        explanation: input.explanation,
        sourceSceneId: input.sceneCategory,
        sourceSceneTitle: input.sceneTitle,
        transferTargets: [],
      },
      successful: true,
      strengthDelta: 4,
      // 主动学习不等于成功找回，因此立刻排入近期复习，用真实评分决定后续间隔。
      nextReviewAt: offsetIso(now, 10 * 60 * 1000),
    },
    {
      type: "expression",
      itemId: input.itemId,
      sceneId: input.sceneCategory,
      successful: true,
      occurredAt: nowIso,
    },
    now,
  )
}

/**
 * 活动分发的唯一位置。每个活动各自决定"如何找到目标条目、记为成功还是失败、
 * 强度如何变化、下次何时到期"，共享的条目合并、计数更新与事件追加只发生在
 * `applyMemoryOutcome` 一处。
 *
 * `switch` 的 `default` 分支在类型层面穷尽联合：新增一种活动而未在此登记时，
 * `never` 断言会失败，编译直接拦住，而不是静默落到某个分支。
 */
export function recordLearningActivity(
  state: LearningMemoryState,
  activity: LearningActivity,
  now = new Date(),
): LearningMemoryState {
  switch (activity.type) {
    case "recall":
      return recordRecallAttempt(state, activity.input, now)
    case "conversation":
      return recordConversationMemory(state, activity.input, now)
    case "review":
      return recordReviewMemory(state, activity.input.itemId, activity.input.rating, now)
    case "shadowing":
      return recordShadowingMemory(state, activity.input, now)
    case "expression":
      return recordExpressionStudy(state, activity.input, now)
    default: {
      const unhandled: never = activity
      throw new Error(`未处理的学习活动：${JSON.stringify(unhandled)}`)
    }
  }
}

export function recordConversationMemory(
  state: LearningMemoryState,
  input: ConversationTurnMemoryInput,
  now = new Date(),
): LearningMemoryState {
  const nowIso = now.toISOString()
  const targetExpression = normalizeMemoryExpression(input.targetExpression)
  const corrected = normalizeMemoryExpression(input.corrected)
  if (!targetExpression) {
    const currentProgress = state.sceneProgress[input.sceneId]
    return {
      ...state,
      sceneProgress: {
        ...state.sceneProgress,
        [input.sceneId]: {
          sceneId: input.sceneId,
          sceneTitle: input.sceneTitle,
          turns: (currentProgress?.turns ?? 0) + 1,
          accurateTurns: (currentProgress?.accurateTurns ?? 0) + (input.accurate ? 1 : 0),
          practicedExpressions: currentProgress?.practicedExpressions ?? [],
          lastPracticedAt: nowIso,
        },
      },
      updatedAt: nowIso,
    }
  }
  const matchingItem = state.items.find(
    (item) =>
      item.answer === targetExpression ||
      expressionWasUsed(input.userInput, item.answer) ||
      expressionWasUsed(corrected, item.answer),
  )
  const usedTarget = expressionWasUsed(input.userInput, targetExpression)
  const usedRememberedExpression = matchingItem
    ? expressionWasUsed(input.userInput, matchingItem.answer)
    : usedTarget
  const successful = input.accurate && usedRememberedExpression
  const itemId = matchingItem?.id ?? `expression-${input.sceneId}-${state.items.length + 1}`
  const currentProgress = state.sceneProgress[input.sceneId]
  const practicedExpressions = Array.from(
    new Set([...(currentProgress?.practicedExpressions ?? []), targetExpression]),
  )
  const nextProgress: SceneMemoryProgress = {
    sceneId: input.sceneId,
    sceneTitle: input.sceneTitle,
    turns: (currentProgress?.turns ?? 0) + 1,
    accurateTurns: (currentProgress?.accurateTurns ?? 0) + (input.accurate ? 1 : 0),
    practicedExpressions,
    lastPracticedAt: nowIso,
  }

  const withProgress: LearningMemoryState = {
    ...state,
    sceneProgress: {
      ...state.sceneProgress,
      [input.sceneId]: nextProgress,
    },
  }

  return applyMemoryOutcome(
    withProgress,
    {
      itemId,
      create: {
        id: itemId,
        kind: "expression",
        label: input.targetLabel,
        cue: `在${input.sceneTitle}中完成“${input.targetLabel}”`,
        answer: targetExpression,
        explanation: input.explanation,
        sourceSceneId: input.sceneId,
        sourceSceneTitle: input.sceneTitle,
        transferTargets: [],
      },
      successful,
      strengthDelta: successful ? 9 : input.accurate ? 3 : -12,
      nextReviewAt: successful
        ? offsetIso(now, Math.max(2, matchingItem?.intervalDays ?? 1) * dayMs)
        : offsetIso(now, input.accurate ? dayMs : 10 * 60 * 1000),
    },
    {
      type: "conversation",
      itemId,
      sceneId: input.sceneId,
      successful,
      occurredAt: nowIso,
    },
    now,
  )
}

export function recordReviewMemory(
  state: LearningMemoryState,
  itemId: string,
  rating: RecallRating,
  now = new Date(),
): LearningMemoryState {
  const item = state.items.find((candidate) => candidate.id === itemId)
  if (!item) {
    return state
  }

  const reviewState = scheduleReview(
    {
      intervalDays: item.intervalDays,
      easeFactor: item.easeFactor,
      repetitions: item.repetitions,
    },
    rating,
    now,
  )
  const successful = rating !== "again"
  const strengthDelta = {
    again: -18,
    hard: 4,
    good: 12,
    easy: 20,
  }[rating]

  return applyMemoryOutcome(
    { ...state, items: state.items.map(stripLegacyDueAt) },
    {
      itemId,
      // 复习只重新校准既有记忆，不为未知条目编造学习记录。
      ignoreWhenMissing: true,
      successful,
      strengthDelta,
      nextReviewAt: reviewState.dueAt,
      reviewSchedule: {
        intervalDays: reviewState.intervalDays,
        easeFactor: reviewState.easeFactor,
        repetitions: reviewState.repetitions,
      },
    },
    {
      type: "review",
      itemId,
      sceneId: item.sourceSceneId,
      successful,
      occurredAt: now.toISOString(),
    },
    now,
  )
}

export function recordShadowingMemory(
  state: LearningMemoryState,
  input: ShadowingAttemptMemoryInput,
  now = new Date(),
): LearningMemoryState {
  const successful = input.overallScore >= 75

  return applyMemoryOutcome(
    state,
    {
      itemId: input.itemId,
      create: {
        id: input.itemId,
        kind: "pronunciation",
        label: input.label,
        cue: `跟读并稳定读出“${input.focusWord}”`,
        answer: input.sentence,
        explanation: "根据实际录音的清晰度、连贯度与节奏持续巩固。",
        sourceSceneId: input.sceneId,
        sourceSceneTitle: input.sceneTitle,
        transferTargets: [],
      },
      successful,
      strengthDelta: successful ? 7 : -5,
      nextReviewAt: offsetIso(now, successful ? 3 * dayMs : dayMs),
    },
    {
      type: "shadowing",
      itemId: input.itemId,
      sceneId: input.sceneId,
      successful,
      occurredAt: now.toISOString(),
      shadowing: {
        overallScore: input.overallScore,
        clarityScore: input.clarityScore,
        fluencyScore: input.fluencyScore,
        rhythmScore: input.rhythmScore,
        durationSeconds: input.durationSeconds,
      },
    },
    now,
  )
}

export function updateLearnerProfile(
  state: LearningMemoryState,
  profile: Partial<LearnerProfile>,
  now = new Date(),
): LearningMemoryState {
  return {
    ...state,
    profile: {
      ...state.profile,
      ...profile,
      dailyMinutes: clamp(profile.dailyMinutes ?? state.profile.dailyMinutes, 5, 120),
    },
    updatedAt: now.toISOString(),
  }
}

export function getLearningMemoryStats(state: LearningMemoryState, now = new Date()) {
  const totalTurns = Object.values(state.sceneProgress).reduce(
    (sum, progress) => sum + progress.turns,
    0,
  )
  const accurateTurns = Object.values(state.sceneProgress).reduce(
    (sum, progress) => sum + progress.accurateTurns,
    0,
  )
  const successfulRecalls = state.items.reduce((sum, item) => sum + item.successfulRecalls, 0)
  const totalEncounters = state.items.reduce((sum, item) => sum + item.encounters, 0)

  return {
    memoryCount: state.items.length,
    dueCount: getDueMemoryItems(state, now).length,
    conversationAccuracy: totalTurns > 0 ? Math.round((accurateTurns / totalTurns) * 100) : 0,
    recallRate:
      totalEncounters > 0 ? Math.round((successfulRecalls / totalEncounters) * 100) : 0,
  }
}
