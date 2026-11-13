import { getScopedReviewQueue } from "./review-scope"
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
  /**
   * `conversation` 事件的回合身份与它当时对记忆产生的增量。
   * 重试改写同一个 `turnId`，删除回合按这些增量精确回滚，
   * 因此重试不会被计成第二次练习，删除也不会留下残余进度。
   */
  conversation?: {
    turnId: string
    accurate: boolean
    strengthDelta: number
    /** 该回合为其记忆条目贡献的计数，重试与删除都以此为准。 */
    counters: Pick<LearningMemoryItem, "encounters" | "successfulRecalls" | "lapseCount">
    practicedExpression: string
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
  /**
   * 该回合的稳定身份，使用学习者消息 ID。重试会复用同一个消息，
   * 因此同一个 `turnId` 永远代表同一轮对话，而不是第二次练习。
   */
  turnId: string
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

/** 撤销一次记录后，计数不应为负，否则跨设备合并会把负值传播出去。 */
function atLeastZero(value: number) {
  return Math.max(0, Math.round(value))
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

type DefaultMemorySeed = {
  id: string
  kind: LearningMemoryKind
  label: string
  cue: string
  answer: string
  explanation: string
  sceneId: string
  sceneTitle: string
  targets?: ReadonlyArray<readonly [sceneId: string, sceneTitle: string, reason: string]>
  strength: number
  encounters: number
  successfulRecalls: number
  lapseCount: number
  intervalDays: number
  easeFactor: number
  repetitions: number
  seenDaysAgo: number
  /** 正数表示还需等待的小时数，负数表示已经到期的小时数。 */
  dueInHours: number
}

function seedMemoryItem(now: Date, seed: DefaultMemorySeed): LearningMemoryItem {
  return {
    id: seed.id,
    kind: seed.kind,
    label: seed.label,
    cue: seed.cue,
    answer: seed.answer,
    explanation: seed.explanation,
    sourceSceneId: seed.sceneId,
    sourceSceneTitle: seed.sceneTitle,
    transferTargets: (seed.targets ?? []).map(([sceneId, sceneTitle, reason]) => ({
      sceneId,
      sceneTitle,
      reason,
    })),
    strength: seed.strength,
    encounters: seed.encounters,
    successfulRecalls: seed.successfulRecalls,
    lapseCount: seed.lapseCount,
    intervalDays: seed.intervalDays,
    easeFactor: seed.easeFactor,
    repetitions: seed.repetitions,
    lastSeenAt: offsetIso(now, -seed.seenDaysAgo * dayMs),
    nextReviewAt: offsetIso(now, seed.dueInHours * 60 * 60 * 1000),
  }
}

/**
 * 句子列表与长期记忆的示例数据。
 *
 * 新账户与演示模式共用一个足够大的起始集合：四类记忆各有覆盖，强度与到期时间错开，
 * 这样筛选、排序、分批复用和复习队列都能立刻看到真实分布，而不是空列表。
 */
const defaultMemorySeeds: readonly DefaultMemorySeed[] = [
  {
    id: "reservation-name",
    kind: "expression",
    label: "确认预订",
    cue: "到餐厅后告诉店员你订了位",
    answer: "I have a reservation under Li.",
    explanation: "under + 姓氏表示预订登记在谁的名下，比 my name is 更自然。",
    sceneId: "restaurant",
    sceneTitle: "餐厅用餐",
    targets: [["hotel", "酒店入住", "把登记姓名的说法迁移到前台入住"]],
    strength: 72,
    encounters: 5,
    successfulRecalls: 4,
    lapseCount: 1,
    intervalDays: 7,
    easeFactor: 2.5,
    repetitions: 3,
    seenDaysAgo: 1,
    dueInHours: 30,
  },
  {
    id: "recommend-dish",
    kind: "expression",
    label: "询问推荐",
    cue: "请服务员推荐一道招牌菜",
    answer: "What would you recommend?",
    explanation: "would you recommend 是礼貌征询意见的固定问法。",
    sceneId: "restaurant",
    sceneTitle: "餐厅用餐",
    targets: [["shopping", "商店购物", "请店员推荐同类商品"]],
    strength: 66,
    encounters: 4,
    successfulRecalls: 3,
    lapseCount: 1,
    intervalDays: 5,
    easeFactor: 2.4,
    repetitions: 2,
    seenDaysAgo: 2,
    dueInHours: 12,
  },
  {
    id: "to-go",
    kind: "expression",
    label: "打包带走",
    cue: "吃完饭想把剩下的带走",
    answer: "Could we get this to go?",
    explanation: "to go 表示外带，比 take away 更常用于美式口语。",
    sceneId: "restaurant",
    sceneTitle: "餐厅用餐",
    targets: [["bakery", "面包店选购", "买面包时说明带走而不是堂食"]],
    strength: 58,
    encounters: 3,
    successfulRecalls: 2,
    lapseCount: 1,
    intervalDays: 3,
    easeFactor: 2.3,
    repetitions: 2,
    seenDaysAgo: 3,
    dueInHours: -6,
  },
  {
    id: "allergic-to",
    kind: "expression",
    label: "说明过敏",
    cue: "点餐时告诉对方你对花生过敏",
    answer: "I'm allergic to peanuts.",
    explanation: "be allergic to 后接具体过敏原，简短明确。",
    sceneId: "restaurant",
    sceneTitle: "餐厅用餐",
    targets: [["doctor", "就医沟通", "就诊时说明过敏史"]],
    strength: 45,
    encounters: 2,
    successfulRecalls: 1,
    lapseCount: 1,
    intervalDays: 2,
    easeFactor: 2.2,
    repetitions: 1,
    seenDaysAgo: 4,
    dueInHours: -2,
  },
  {
    id: "less-ice",
    kind: "expression",
    label: "少冰少糖",
    cue: "点饮料时要求少冰少糖",
    answer: "Could I get it with less ice and less sugar?",
    explanation: "with + 名词短语描述做法，两个 less 并列即可。",
    sceneId: "coffee",
    sceneTitle: "咖啡店点单",
    targets: [["bakery", "面包店选购", "点单时调整甜度"]],
    strength: 61,
    encounters: 4,
    successfulRecalls: 2,
    lapseCount: 2,
    intervalDays: 3,
    easeFactor: 2.25,
    repetitions: 2,
    seenDaysAgo: 2,
    dueInHours: 4,
  },
  {
    id: "which-gate",
    kind: "vocabulary",
    label: "确认登机口",
    cue: "在机场问这班飞机从哪个登机口出发",
    answer: "Which gate does this flight leave from?",
    explanation: "leave from + 地点，问登机口时 gate 是最准确的词。",
    sceneId: "airport",
    sceneTitle: "机场出行",
    targets: [["train", "火车换乘", "问站台时说 which platform"]],
    strength: 52,
    encounters: 3,
    successfulRecalls: 2,
    lapseCount: 1,
    intervalDays: 2,
    easeFactor: 2.2,
    repetitions: 1,
    seenDaysAgo: 3,
    dueInHours: -1,
  },
  {
    id: "overweight-baggage",
    kind: "vocabulary",
    label: "行李超重",
    cue: "值机时问超重行李是否收费",
    answer: "Is there a fee for overweight baggage?",
    explanation: "overweight baggage 是机场广播与柜台的标准说法。",
    sceneId: "airport",
    sceneTitle: "机场出行",
    targets: [["customs", "海关入境", "申报时说明行李内容"]],
    strength: 40,
    encounters: 2,
    successfulRecalls: 1,
    lapseCount: 1,
    intervalDays: 1,
    easeFactor: 2.1,
    repetitions: 1,
    seenDaysAgo: 5,
    dueInHours: -3,
  },
  {
    id: "make-connection",
    kind: "expression",
    label: "确认转机时间",
    cue: "担心转机时间不够，问工作人员",
    answer: "Do I have enough time to make my connection?",
    explanation: "make a connection 表示赶上转机航班。",
    sceneId: "airport",
    sceneTitle: "机场出行",
    targets: [["train", "火车换乘", "换乘时确认时间是否充足"]],
    strength: 47,
    encounters: 3,
    successfulRecalls: 1,
    lapseCount: 2,
    intervalDays: 2,
    easeFactor: 2.15,
    repetitions: 1,
    seenDaysAgo: 4,
    dueInHours: 8,
  },
  {
    id: "late-checkout",
    kind: "expression",
    label: "延迟退房",
    cue: "向前台申请晚一点退房",
    answer: "Could I have a late checkout?",
    explanation: "late checkout 是酒店固定说法，用 could I have 提出请求。",
    sceneId: "hotel",
    sceneTitle: "酒店入住",
    targets: [["renting", "租房看房", "商量入住与交房时间"]],
    strength: 63,
    encounters: 4,
    successfulRecalls: 3,
    lapseCount: 1,
    intervalDays: 5,
    easeFactor: 2.4,
    repetitions: 2,
    seenDaysAgo: 1,
    dueInHours: 20,
  },
  {
    id: "air-conditioning",
    kind: "grammar",
    label: "现在进行时陈述故障",
    cue: "向酒店说明空调坏了",
    answer: "The air conditioning isn't working.",
    explanation: "现在进行时描述正在持续的状态，比 is broken 更委婉。",
    sceneId: "hotel",
    sceneTitle: "酒店入住",
    targets: [["home-repair", "联系房东报修", "报修时描述设备状态"]],
    strength: 38,
    encounters: 2,
    successfulRecalls: 1,
    lapseCount: 1,
    intervalDays: 1,
    easeFactor: 2.05,
    repetitions: 1,
    seenDaysAgo: 3,
    dueInHours: -5,
  },
  {
    id: "try-on",
    kind: "expression",
    label: "要求试穿",
    cue: "想试穿小一号的衣服",
    answer: "Can I try this on in a smaller size?",
    explanation: "try on 的宾语可以放在中间，也可以说 try on this shirt。",
    sceneId: "shopping",
    sceneTitle: "商店购物",
    targets: [["bakery", "面包店选购", "在另一家店继续试穿与比较"]],
    strength: 55,
    encounters: 3,
    successfulRecalls: 2,
    lapseCount: 1,
    intervalDays: 3,
    easeFactor: 2.3,
    repetitions: 2,
    seenDaysAgo: 2,
    dueInHours: 6,
  },
  {
    id: "return-if",
    kind: "grammar",
    label: "条件句询问退换",
    cue: "买之前确认不合适能否退货",
    answer: "Can I return it if it doesn't fit?",
    explanation: "if 引导条件从句，主句用情态动词提出可能。",
    sceneId: "shopping",
    sceneTitle: "商店购物",
    targets: [["customer-support", "联系客服退款", "说明退货条件"]],
    strength: 68,
    encounters: 5,
    successfulRecalls: 4,
    lapseCount: 1,
    intervalDays: 7,
    easeFactor: 2.5,
    repetitions: 3,
    seenDaysAgo: 1,
    dueInHours: 36,
  },
  {
    id: "which-aisle",
    kind: "vocabulary",
    label: "询问货架位置",
    cue: "在超市找咖啡所在的货架",
    answer: "Which aisle has the coffee?",
    explanation: "aisle 指货架之间的通道，是超市问路的标准词。",
    sceneId: "grocery",
    sceneTitle: "超市采购",
    targets: [["shopping", "商店购物", "在商场问楼层与区域"]],
    strength: 74,
    encounters: 4,
    successfulRecalls: 4,
    lapseCount: 0,
    intervalDays: 9,
    easeFactor: 2.6,
    repetitions: 3,
    seenDaysAgo: 2,
    dueInHours: 48,
  },
  {
    id: "mobile-payment",
    kind: "vocabulary",
    label: "确认支付方式",
    cue: "结账时问能否用手机支付",
    answer: "Do you take mobile payment?",
    explanation: "take 在这里表示接受某种支付方式。",
    sceneId: "grocery",
    sceneTitle: "超市采购",
    targets: [["bakery", "面包店选购", "小店结账时确认支付方式"]],
    strength: 70,
    encounters: 4,
    successfulRecalls: 3,
    lapseCount: 1,
    intervalDays: 6,
    easeFactor: 2.45,
    repetitions: 2,
    seenDaysAgo: 3,
    dueInHours: 24,
  },
  {
    id: "slice-the-loaf",
    kind: "expression",
    label: "请店员切片",
    cue: "买整条面包时请店员帮忙切片",
    answer: "Could you slice the loaf for me?",
    explanation: "loaf 指整条面包，slice 作动词表示切片。",
    sceneId: "bakery",
    sceneTitle: "面包店选购",
    targets: [["grocery", "超市采购", "在超市熟食区提出加工请求"]],
    strength: 65,
    encounters: 3,
    successfulRecalls: 3,
    lapseCount: 0,
    intervalDays: 5,
    easeFactor: 2.4,
    repetitions: 2,
    seenDaysAgo: 2,
    dueInHours: 18,
  },
  {
    id: "how-often",
    kind: "grammar",
    label: "询问用药频率",
    cue: "在药房问这种药多久吃一次",
    answer: "How often should I take this?",
    explanation: "how often 问频率，should I 让语气像在确认医嘱。",
    sceneId: "pharmacy",
    sceneTitle: "药房购药",
    targets: [["doctor", "就医沟通", "复诊时确认服药安排"]],
    strength: 44,
    encounters: 2,
    successfulRecalls: 1,
    lapseCount: 1,
    intervalDays: 2,
    easeFactor: 2.15,
    repetitions: 1,
    seenDaysAgo: 4,
    dueInHours: -4,
  },
  {
    id: "hurts-when",
    kind: "expression",
    label: "描述疼痛",
    cue: "告诉医生深呼吸时会疼",
    answer: "It hurts when I breathe deeply.",
    explanation: "it hurts when + 动作，准确描述诱发疼痛的动作。",
    sceneId: "doctor",
    sceneTitle: "就医沟通",
    targets: [["emergency-help", "紧急情况求助", "现场说明伤情"]],
    strength: 36,
    encounters: 2,
    successfulRecalls: 0,
    lapseCount: 2,
    intervalDays: 1,
    easeFactor: 2.0,
    repetitions: 1,
    seenDaysAgo: 5,
    dueInHours: -8,
  },
  {
    id: "follow-up",
    kind: "vocabulary",
    label: "预约复诊",
    cue: "看完病想约下周复诊",
    answer: "Can I book a follow-up for next week?",
    explanation: "follow-up 指复诊，book 表示预约。",
    sceneId: "doctor",
    sceneTitle: "就医沟通",
    targets: [["pharmacy", "药房购药", "复诊后取药"]],
    strength: 50,
    encounters: 3,
    successfulRecalls: 2,
    lapseCount: 1,
    intervalDays: 3,
    easeFactor: 2.25,
    repetitions: 1,
    seenDaysAgo: 3,
    dueInHours: 2,
  },
  {
    id: "open-account",
    kind: "expression",
    label: "开户",
    cue: "在银行说要开一个储蓄账户",
    answer: "I'd like to open a savings account.",
    explanation: "I'd like to + 动词是柜台办事最稳妥的礼貌句式。",
    sceneId: "banking",
    sceneTitle: "银行办事",
    targets: [["customs", "海关入境", "在其他窗口重复同一请求"]],
    strength: 42,
    encounters: 2,
    successfulRecalls: 1,
    lapseCount: 1,
    intervalDays: 2,
    easeFactor: 2.1,
    repetitions: 1,
    seenDaysAgo: 6,
    dueInHours: -2,
  },
  {
    id: "report-card-lost",
    kind: "vocabulary",
    label: "银行卡挂失",
    cue: "打电话给银行挂失银行卡",
    answer: "I need to report my card lost.",
    explanation: "report + 宾语 + 补语，是挂失的固定表达。",
    sceneId: "banking",
    sceneTitle: "银行办事",
    targets: [["customer-support", "联系客服退款", "向客服说明账户问题"]],
    strength: 34,
    encounters: 2,
    successfulRecalls: 0,
    lapseCount: 2,
    intervalDays: 1,
    easeFactor: 2.0,
    repetitions: 1,
    seenDaysAgo: 7,
    dueInHours: -10,
  },
  {
    id: "rent-negotiable",
    kind: "expression",
    label: "租金可谈吗",
    cue: "看房时问租金是否可以商量",
    answer: "Is the rent negotiable?",
    explanation: "negotiable 表示可协商，问价时简短有力。",
    sceneId: "renting",
    sceneTitle: "租房看房",
    targets: [["negotiation", "商务谈判", "把议价语气迁移到商务场景"]],
    strength: 48,
    encounters: 3,
    successfulRecalls: 1,
    lapseCount: 2,
    intervalDays: 2,
    easeFactor: 2.2,
    repetitions: 1,
    seenDaysAgo: 4,
    dueInHours: 10,
  },
  {
    id: "deposit",
    kind: "vocabulary",
    label: "押金",
    cue: "问房东押金是多少",
    answer: "How much is the deposit?",
    explanation: "deposit 指押金，也可用于酒店与租车。",
    sceneId: "renting",
    sceneTitle: "租房看房",
    targets: [["hotel", "酒店入住", "入住时确认押金"]],
    strength: 57,
    encounters: 4,
    successfulRecalls: 2,
    lapseCount: 2,
    intervalDays: 3,
    easeFactor: 2.25,
    repetitions: 2,
    seenDaysAgo: 3,
    dueInHours: 5,
  },
  {
    id: "leaking-sink",
    kind: "grammar",
    label: "现在进行时报修",
    cue: "告诉房东厨房水槽在漏水",
    answer: "The kitchen sink is leaking.",
    explanation: "进行时强调正在发生，报修时最容易说明问题。",
    sceneId: "home-repair",
    sceneTitle: "联系房东报修",
    targets: [["hotel", "酒店入住", "向酒店说明房间设施问题"]],
    strength: 39,
    encounters: 2,
    successfulRecalls: 1,
    lapseCount: 1,
    intervalDays: 1,
    easeFactor: 2.05,
    repetitions: 1,
    seenDaysAgo: 5,
    dueInHours: -6,
  },
  {
    id: "when-can-someone",
    kind: "expression",
    label: "预约上门时间",
    cue: "报修后问师傅什么时候能来",
    answer: "When can someone come and take a look?",
    explanation: "come and take a look 比 come to repair 更口语、更常用。",
    sceneId: "home-repair",
    sceneTitle: "联系房东报修",
    targets: [["renting", "租房看房", "约看房时间"]],
    strength: 46,
    encounters: 3,
    successfulRecalls: 1,
    lapseCount: 2,
    intervalDays: 2,
    easeFactor: 2.15,
    repetitions: 1,
    seenDaysAgo: 4,
    dueInHours: 7,
  },
  {
    id: "request-refund",
    kind: "expression",
    label: "申请退款",
    cue: "给客服打电话要求退款",
    answer: "I'd like to request a refund for this order.",
    explanation: "request a refund 是最清晰的退款说法。",
    sceneId: "customer-support",
    sceneTitle: "联系客服退款",
    targets: [["shopping", "商店购物", "到店办理退货"]],
    strength: 33,
    encounters: 2,
    successfulRecalls: 0,
    lapseCount: 2,
    intervalDays: 1,
    easeFactor: 2.0,
    repetitions: 1,
    seenDaysAgo: 6,
    dueInHours: -12,
  },
  {
    id: "escalate",
    kind: "expression",
    label: "要求升级处理",
    cue: "客服解决不了，请对方转交主管",
    answer: "Could you escalate this to a supervisor?",
    explanation: "escalate 表示把问题升级到更高层级处理。",
    sceneId: "customer-support",
    sceneTitle: "联系客服退款",
    targets: [["negotiation", "商务谈判", "把问题升级给决策者"]],
    strength: 41,
    encounters: 3,
    successfulRecalls: 1,
    lapseCount: 2,
    intervalDays: 2,
    easeFactor: 2.1,
    repetitions: 1,
    seenDaysAgo: 5,
    dueInHours: 3,
  },
  {
    id: "take-me-to",
    kind: "expression",
    label: "告知目的地",
    cue: "上出租车后把地址给司机",
    answer: "Could you take me to this address?",
    explanation: "take me to + 地点，配合手机地址最自然。",
    sceneId: "taxi",
    sceneTitle: "打车出行",
    targets: [["directions", "街头问路", "问路时说明目的地"]],
    strength: 76,
    encounters: 5,
    successfulRecalls: 4,
    lapseCount: 1,
    intervalDays: 8,
    easeFactor: 2.55,
    repetitions: 3,
    seenDaysAgo: 1,
    dueInHours: 40,
  },
  {
    id: "faster-route",
    kind: "expression",
    label: "建议换路线",
    cue: "堵车时问司机能否走更快的路",
    answer: "Could we take the faster route?",
    explanation: "could we 用第一人称复数，语气像商量而不是命令。",
    sceneId: "taxi",
    sceneTitle: "打车出行",
    targets: [["train", "火车换乘", "在陌生城市调整路线"]],
    strength: 62,
    encounters: 3,
    successfulRecalls: 3,
    lapseCount: 0,
    intervalDays: 4,
    easeFactor: 2.35,
    repetitions: 2,
    seenDaysAgo: 2,
    dueInHours: 16,
  },
  {
    id: "change-trains",
    kind: "vocabulary",
    label: "确认换乘",
    cue: "在火车上问下一站是否需要换车",
    answer: "Do I need to change trains at the next stop?",
    explanation: "change trains 用复数，指换乘另一班列车。",
    sceneId: "train",
    sceneTitle: "火车换乘",
    targets: [["airport", "机场出行", "确认转机流程"]],
    strength: 53,
    encounters: 3,
    successfulRecalls: 2,
    lapseCount: 1,
    intervalDays: 3,
    easeFactor: 2.3,
    repetitions: 1,
    seenDaysAgo: 3,
    dueInHours: -3,
  },
  {
    id: "nearest-station",
    kind: "expression",
    label: "问最近的车站",
    cue: "在街上问最近的车站怎么走",
    answer: "How do I get to the nearest station?",
    explanation: "how do I get to 是最通用的问路句式。",
    sceneId: "directions",
    sceneTitle: "街头问路",
    targets: [["taxi", "打车出行", "问路后改为打车"]],
    strength: 71,
    encounters: 4,
    successfulRecalls: 3,
    lapseCount: 1,
    intervalDays: 6,
    easeFactor: 2.45,
    repetitions: 2,
    seenDaysAgo: 2,
    dueInHours: 28,
  },
  {
    id: "nothing-to-declare",
    kind: "vocabulary",
    label: "海关申报",
    cue: "过海关时表示没有需要申报的物品",
    answer: "I have nothing to declare.",
    explanation: "declare 是海关申报的固定动词。",
    sceneId: "customs",
    sceneTitle: "海关入境",
    targets: [["airport", "机场出行", "入境流程中复用"]],
    strength: 67,
    encounters: 4,
    successfulRecalls: 3,
    lapseCount: 1,
    intervalDays: 5,
    easeFactor: 2.4,
    repetitions: 2,
    seenDaysAgo: 3,
    dueInHours: 22,
  },
  {
    id: "first-agenda-item",
    kind: "expression",
    label: "开始议程",
    cue: "主持会议时从第一个议题开始",
    answer: "Shall we start with the first item on the agenda?",
    explanation: "shall we 让开场显得自然而不强势。",
    sceneId: "meeting",
    sceneTitle: "工作会议",
    targets: [["presentation", "英文演讲", "演讲开场先给出结构"]],
    strength: 59,
    encounters: 4,
    successfulRecalls: 2,
    lapseCount: 2,
    intervalDays: 3,
    easeFactor: 2.3,
    repetitions: 2,
    seenDaysAgo: 2,
    dueInHours: 9,
  },
  {
    id: "quick-point",
    kind: "expression",
    label: "礼貌打断",
    cue: "在会议中插一句补充意见",
    answer: "Sorry to jump in, but I have a quick point.",
    explanation: "jump in 是会议里插话的口语说法，先道歉再说明。",
    sceneId: "meeting",
    sceneTitle: "工作会议",
    targets: [["panel-debate", "圆桌辩论", "辩论中插入反驳"]],
    strength: 43,
    encounters: 2,
    successfulRecalls: 1,
    lapseCount: 1,
    intervalDays: 2,
    easeFactor: 2.15,
    repetitions: 1,
    seenDaysAgo: 4,
    dueInHours: -1,
  },
  {
    id: "sum-up",
    kind: "expression",
    label: "总结共识",
    cue: "会议结束前把已达成的结论说一遍",
    answer: "Let me sum up what we've agreed so far.",
    explanation: "sum up 表示归纳要点，so far 限定到目前为止。",
    sceneId: "meeting",
    sceneTitle: "工作会议",
    targets: [["one-on-one", "一对一工作沟通", "同步结论"]],
    strength: 56,
    encounters: 3,
    successfulRecalls: 2,
    lapseCount: 1,
    intervalDays: 3,
    easeFactor: 2.3,
    repetitions: 2,
    seenDaysAgo: 3,
    dueInHours: 11,
  },
  {
    id: "help-most",
    kind: "expression",
    label: "询问对方需求",
    cue: "一对一沟通时问对方现在最需要什么支持",
    answer: "What would help you most right now?",
    explanation: "what would help you most 把选择权交给对方。",
    sceneId: "one-on-one",
    sceneTitle: "一对一工作沟通",
    targets: [["interview", "求职面试", "面试中询问岗位支持"]],
    strength: 49,
    encounters: 3,
    successfulRecalls: 1,
    lapseCount: 2,
    intervalDays: 2,
    easeFactor: 2.2,
    repetitions: 1,
    seenDaysAgo: 4,
    dueInHours: 6,
  },
  {
    id: "self-intro-years",
    kind: "grammar",
    label: "现在完成时自我介绍",
    cue: "面试时用一句话说明过去三年的工作",
    answer: "I've spent the last three years working on mobile apps.",
    explanation: "现在完成时 + for/last 时间段，适合承接到现在。",
    sceneId: "interview",
    sceneTitle: "求职面试",
    targets: [["networking", "职场社交", "社交场合介绍自己"]],
    strength: 51,
    encounters: 3,
    successfulRecalls: 2,
    lapseCount: 1,
    intervalDays: 3,
    easeFactor: 2.25,
    repetitions: 1,
    seenDaysAgo: 3,
    dueInHours: 14,
  },
  {
    id: "success-look-like",
    kind: "expression",
    label: "面试反问",
    cue: "面试最后问这个岗位做得好的标准",
    answer: "What does success look like in this role?",
    explanation: "what does X look like 用来询问衡量标准。",
    sceneId: "interview",
    sceneTitle: "求职面试",
    targets: [["one-on-one", "一对一工作沟通", "与上级确认目标"]],
    strength: 45,
    encounters: 3,
    successfulRecalls: 1,
    lapseCount: 2,
    intervalDays: 2,
    easeFactor: 2.15,
    repetitions: 1,
    seenDaysAgo: 5,
    dueInHours: 1,
  },
  {
    id: "stay-in-touch",
    kind: "expression",
    label: "保持联系",
    cue: "活动结束时问对方是否愿意继续联系",
    answer: "Would you be open to staying in touch?",
    explanation: "be open to + 动名词，比 give me your number 更得体。",
    sceneId: "networking",
    sceneTitle: "职场社交",
    targets: [["small-talk", "日常寒暄", "寒暄后自然收尾"]],
    strength: 64,
    encounters: 4,
    successfulRecalls: 3,
    lapseCount: 1,
    intervalDays: 5,
    easeFactor: 2.4,
    repetitions: 2,
    seenDaysAgo: 2,
    dueInHours: 26,
  },
  {
    id: "three-findings",
    kind: "expression",
    label: "演讲开场给结构",
    cue: "演讲开头告诉听众接下来会讲三点发现",
    answer: "Today I'd like to walk you through three findings.",
    explanation: "walk you through 表示带你逐项过一遍。",
    sceneId: "presentation",
    sceneTitle: "英文演讲",
    targets: [["meeting", "工作会议", "汇报时先给结构"]],
    strength: 47,
    encounters: 3,
    successfulRecalls: 1,
    lapseCount: 2,
    intervalDays: 2,
    easeFactor: 2.2,
    repetitions: 1,
    seenDaysAgo: 4,
    dueInHours: 4,
  },
  {
    id: "evidence-points",
    kind: "grammar",
    label: "表达不同观点",
    cue: "课堂讨论中礼貌提出相反证据",
    answer: "From what I've read, the evidence points the other way.",
    explanation: "from what I've read 限定来源，points the other way 表示证据相反。",
    sceneId: "class-discussion",
    sceneTitle: "课堂讨论",
    targets: [["panel-debate", "圆桌辩论", "辩论中引用材料"]],
    strength: 41,
    encounters: 2,
    successfulRecalls: 1,
    lapseCount: 1,
    intervalDays: 2,
    easeFactor: 2.1,
    repetitions: 1,
    seenDaysAgo: 5,
    dueInHours: -2,
  },
  {
    id: "keeping-busy",
    kind: "expression",
    label: "回应近况",
    cue: "别人问你最近怎么样，回应说一直挺忙",
    answer: "I've been keeping busy, thanks for asking.",
    explanation: "keep busy 轻描淡写地带过忙碌，再回一句感谢。",
    sceneId: "small-talk",
    sceneTitle: "日常寒暄",
    targets: [["networking", "职场社交", "社交场合开场寒暄"]],
    strength: 69,
    encounters: 4,
    successfulRecalls: 3,
    lapseCount: 1,
    intervalDays: 6,
    easeFactor: 2.45,
    repetitions: 2,
    seenDaysAgo: 1,
    dueInHours: 32,
  },
  {
    id: "call-ambulance",
    kind: "expression",
    label: "紧急求助",
    cue: "有人受伤时请路人叫救护车",
    answer: "Could you call an ambulance, please?",
    explanation: "紧急场景下先说请求再补 please，清楚优先于客套。",
    sceneId: "emergency-help",
    sceneTitle: "紧急情况求助",
    targets: [["doctor", "就医沟通", "到医院后说明情况"]],
    strength: 35,
    encounters: 2,
    successfulRecalls: 0,
    lapseCount: 2,
    intervalDays: 1,
    easeFactor: 2.0,
    repetitions: 1,
    seenDaysAgo: 6,
    dueInHours: -14,
  },
  {
    id: "what-we-know",
    kind: "expression",
    label: "危机中同步信息",
    cue: "危机沟通时区分已知与待确认信息",
    answer: "Here's what we know and what we're still confirming.",
    explanation: "what we know 与 what we're confirming 对照，先划清事实边界。",
    sceneId: "crisis-briefing",
    sceneTitle: "危机沟通",
    targets: [["meeting", "工作会议", "在例会上同步不确定信息"]],
    strength: 44,
    encounters: 2,
    successfulRecalls: 1,
    lapseCount: 1,
    intervalDays: 2,
    easeFactor: 2.15,
    repetitions: 1,
    seenDaysAgo: 4,
    dueInHours: 5,
  },
  {
    id: "v-w-sound",
    kind: "pronunciation",
    label: "/v/ 与 /w/ 区分",
    cue: "稳定区分 very 和 west 的起始音",
    answer: "very / west",
    explanation: "/v/ 上齿轻触下唇振动，/w/ 双唇收圆不接触牙齿。",
    sceneId: "shadowing",
    sceneTitle: "影子跟读",
    targets: [["meeting", "工作会议", "在完整句子里保持区分"]],
    strength: 60,
    encounters: 4,
    successfulRecalls: 2,
    lapseCount: 2,
    intervalDays: 3,
    easeFactor: 2.3,
    repetitions: 2,
    seenDaysAgo: 2,
    dueInHours: 8,
  },
  {
    id: "sentence-fall",
    kind: "pronunciation",
    label: "陈述句降调",
    cue: "让 I'd rather not. 的句尾自然落下",
    answer: "I'd rather not.",
    explanation: "陈述句句尾降调，避免听起来像犹豫或反问。",
    sceneId: "shadowing",
    sceneTitle: "影子跟读",
    targets: [["one-on-one", "一对一工作沟通", "礼貌拒绝时保持肯定语气"]],
    strength: 54,
    encounters: 3,
    successfulRecalls: 2,
    lapseCount: 1,
    intervalDays: 3,
    easeFactor: 2.25,
    repetitions: 2,
    seenDaysAgo: 3,
    dueInHours: -1,
  },
  {
    id: "would-have-called",
    kind: "grammar",
    label: "虚拟语气过去",
    cue: "说明当时如果知道就会打电话",
    answer: "If I had known, I would have called.",
    explanation: "与过去事实相反：if + had done，主句 would have done。",
    sceneId: "meeting",
    sceneTitle: "工作会议",
    targets: [["interview", "求职面试", "复盘项目失误"]],
    strength: 32,
    encounters: 2,
    successfulRecalls: 0,
    lapseCount: 2,
    intervalDays: 1,
    easeFactor: 2.0,
    repetitions: 1,
    seenDaysAgo: 7,
    dueInHours: -9,
  },
  {
    id: "already-sent",
    kind: "grammar",
    label: "现在完成时同步进度",
    cue: "告诉同事文件已经发出去了",
    answer: "I've already sent the file.",
    explanation: "already 放在 have 与过去分词之间，强调动作已完成。",
    sceneId: "meeting",
    sceneTitle: "工作会议",
    targets: [["one-on-one", "一对一工作沟通", "同步任务状态"]],
    strength: 73,
    encounters: 5,
    successfulRecalls: 4,
    lapseCount: 1,
    intervalDays: 7,
    easeFactor: 2.5,
    repetitions: 3,
    seenDaysAgo: 1,
    dueInHours: 42,
  },
  {
    id: "was-sent",
    kind: "grammar",
    label: "被动语态说明流程",
    cue: "说明报告昨天已经被发出",
    answer: "The report was sent yesterday.",
    explanation: "被动语态把重点放在报告而不是执行者。",
    sceneId: "meeting",
    sceneTitle: "工作会议",
    targets: [["customer-support", "联系客服退款", "说明处理进度"]],
    strength: 58,
    encounters: 3,
    successfulRecalls: 2,
    lapseCount: 1,
    intervalDays: 3,
    easeFactor: 2.3,
    repetitions: 2,
    seenDaysAgo: 2,
    dueInHours: 13,
  },
  {
    id: "much-cheaper",
    kind: "grammar",
    label: "比较级",
    cue: "比较两件商品的价格",
    answer: "It's much cheaper than the other one.",
    explanation: "much 修饰比较级，表示差距明显。",
    sceneId: "shopping",
    sceneTitle: "商店购物",
    targets: [["grocery", "超市采购", "比较同类商品"]],
    strength: 66,
    encounters: 4,
    successfulRecalls: 3,
    lapseCount: 1,
    intervalDays: 5,
    easeFactor: 2.4,
    repetitions: 2,
    seenDaysAgo: 3,
    dueInHours: 19,
  },
  {
    id: "where-gate-is",
    kind: "grammar",
    label: "间接问句语序",
    cue: "礼貌地问登机口在哪里",
    answer: "Could you tell me where the gate is?",
    explanation: "间接问句用陈述语序，where the gate is 而不是 where is the gate。",
    sceneId: "airport",
    sceneTitle: "机场出行",
    targets: [["directions", "街头问路", "问路时保持礼貌语序"]],
    strength: 61,
    encounters: 4,
    successfulRecalls: 2,
    lapseCount: 2,
    intervalDays: 3,
    easeFactor: 2.3,
    repetitions: 2,
    seenDaysAgo: 2,
    dueInHours: 2,
  },
]

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
      ...defaultMemorySeeds.map((seed) => seedMemoryItem(now, seed)),
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
  return getScopedReviewQueue(state, { now, targetMemoryItemId })
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
  /**
   * 计数增量默认为一次接触。撤销一次已记录的回合时传入负值，
   * 因此"改写"与"撤销"共用同一条路径，不会各自实现一套回滚。
   */
  counters?: Partial<
    Pick<LearningMemoryItem, "encounters" | "successfulRecalls" | "lapseCount">
  >
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
  const counterDelta = {
    encounters: outcome.counters?.encounters ?? 1,
    successfulRecalls: outcome.counters?.successfulRecalls ?? (outcome.successful ? 1 : 0),
    lapseCount: outcome.counters?.lapseCount ?? (outcome.successful ? 0 : 1),
  }
  const nextItem: LearningMemoryItem = {
    ...baseItem,
    ...(outcome.reviewSchedule ?? {}),
    strength: clamp(baseItem.strength + outcome.strengthDelta),
    encounters: atLeastZero(baseItem.encounters + counterDelta.encounters),
    successfulRecalls: atLeastZero(baseItem.successfulRecalls + counterDelta.successfulRecalls),
    lapseCount: atLeastZero(baseItem.lapseCount + counterDelta.lapseCount),
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

/**
 * 写入一个对话回合。
 *
 * 回合以 `turnId` 为主键而不是以"动作"为主键：重试复用同一条学习者消息，
 * 因此这里先撤销该回合此前的贡献再写入新结果，重试不会被计成第二次练习。
 */
export function recordConversationMemory(
  state: LearningMemoryState,
  input: ConversationTurnMemoryInput,
  now = new Date(),
): LearningMemoryState {
  const nowIso = now.toISOString()
  // 重试前先清掉上一版结论，让本函数对同一个 turnId 始终是幂等的。
  const withoutPrevious = forgetConversationTurn(state, input.turnId, now)
  const targetExpression = normalizeMemoryExpression(input.targetExpression)
  const corrected = normalizeMemoryExpression(input.corrected)

  if (!targetExpression) {
    // 没有目标表达时只推进场景进度，仍然以回合身份记账以便重试不会重复累加。
    const currentProgress = withoutPrevious.sceneProgress[input.sceneId]
    return {
      ...withoutPrevious,
      sceneProgress: {
        ...withoutPrevious.sceneProgress,
        [input.sceneId]: {
          sceneId: input.sceneId,
          sceneTitle: input.sceneTitle,
          turns: (currentProgress?.turns ?? 0) + 1,
          accurateTurns: (currentProgress?.accurateTurns ?? 0) + (input.accurate ? 1 : 0),
          practicedExpressions: currentProgress?.practicedExpressions ?? [],
          lastPracticedAt: nowIso,
        },
      },
      events: [
        {
          id: createEventId("conversation", now),
          type: "conversation",
          // 没有目标表达时不产生记忆条目，itemId 留空以免被误算成一条活跃记忆。
          itemId: "",
          sceneId: input.sceneId,
          successful: false,
          occurredAt: nowIso,
          conversation: {
            turnId: input.turnId,
            accurate: input.accurate,
            strengthDelta: 0,
            counters: { encounters: 0, successfulRecalls: 0, lapseCount: 0 },
            practicedExpression: "",
          },
        },
        ...withoutPrevious.events,
      ],
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
  const currentProgress = withoutPrevious.sceneProgress[input.sceneId]
  const practicedExpressions = Array.from(
    new Set([...(currentProgress?.practicedExpressions ?? []), targetExpression]),
  )
  const strengthDelta = successful ? 9 : input.accurate ? 3 : -12
  const counters = {
    encounters: 1,
    successfulRecalls: successful ? 1 : 0,
    lapseCount: input.accurate ? 0 : 1,
  }

  return applyMemoryOutcome(
    {
      ...withoutPrevious,
      sceneProgress: {
        ...withoutPrevious.sceneProgress,
        [input.sceneId]: {
          sceneId: input.sceneId,
          sceneTitle: input.sceneTitle,
          turns: (currentProgress?.turns ?? 0) + 1,
          accurateTurns: (currentProgress?.accurateTurns ?? 0) + (input.accurate ? 1 : 0),
          practicedExpressions,
          lastPracticedAt: nowIso,
        },
      },
    },
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
      strengthDelta,
      counters,
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
      conversation: {
        turnId: input.turnId,
        accurate: input.accurate,
        strengthDelta,
        counters,
        practicedExpression: targetExpression,
      },
    },
    now,
  )
}

/**
 * 撤销一个对话回合已经写入的结论：移除它的事件，并把计数与强度按事件记录的
 * 增量精确回滚。重试和删除共用这一条路径，因此两者的结果一致。
 */
export function forgetConversationTurn(
  state: LearningMemoryState,
  turnId: string,
  now = new Date(),
): LearningMemoryState {
  const turn = state.events.find(
    (event) => event.type === "conversation" && event.conversation?.turnId === turnId,
  )
  if (!turn?.conversation) {
    return state
  }

  const nowIso = now.toISOString()
  const contribution = turn.conversation
  const progress = state.sceneProgress[turn.sceneId]

  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== turn.itemId) {
        return item
      }
      return {
        ...item,
        strength: clamp(item.strength - contribution.strengthDelta),
        encounters: atLeastZero(item.encounters - contribution.counters.encounters),
        successfulRecalls: atLeastZero(
          item.successfulRecalls - contribution.counters.successfulRecalls,
        ),
        lapseCount: atLeastZero(item.lapseCount - contribution.counters.lapseCount),
      }
    }),
    sceneProgress: progress
      ? {
          ...state.sceneProgress,
          [turn.sceneId]: {
            ...progress,
            turns: atLeastZero(progress.turns - 1),
            accurateTurns: atLeastZero(
              progress.accurateTurns - (contribution.accurate ? 1 : 0),
            ),
            practicedExpressions: contribution.practicedExpression
              ? progress.practicedExpressions.filter(
                  (expression) => expression !== contribution.practicedExpression,
                )
              : progress.practicedExpressions,
            // 该场景可能已经没有记录，保留最后练习时间而不是猜测。
            lastPracticedAt: progress.lastPracticedAt,
          },
        }
      : state.sceneProgress,
    events: state.events.filter((event) => event.id !== turn.id),
    updatedAt: nowIso,
  }
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
