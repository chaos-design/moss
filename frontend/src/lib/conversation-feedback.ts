import type { TutorMode } from "@/lib/conversation-prefs"
import { detectInputLanguageImmediately } from "@/lib/language-detection"
import { stripEmoji } from "@/lib/text-sanitizer"

export type InputLanguage = "chinese" | "english" | "mixed" | "unknown"

export type ConversationIntent = "scene_reply" | "translation_request" | "language_question"

export type ConversationInputAnalysis = {
  language: InputLanguage
  intent: ConversationIntent
}

export type ExpressionValidationStatus = "accurate" | "improve" | "guidance" | "unavailable"

export type ExpressionIssueKind =
  | "grammar"
  | "word_choice"
  | "word_order"
  | "missing_word"
  | "register"
  | "clarity"

export type ExpressionIssue = {
  kind: ExpressionIssueKind
  original: string
  corrected: string
  explanation: string
}

export type PracticeExample = {
  english: string
  chinese: string
}

export type ExpressionValidation = {
  status: ExpressionValidationStatus
  corrected: string
  explanation: string
  issues: ExpressionIssue[]
  examples: PracticeExample[]
}

export type ConversationResponseData = {
  content: string
  translation: string
  recall: string
  inputAnalysis: ConversationInputAnalysis
  validation: ExpressionValidation
  source?: "demo" | "provider"
}

type ProviderPayload = {
  reply?: unknown
  content?: unknown
  translation?: unknown
  recall?: unknown
  inputAnalysis?: {
    language?: unknown
    intent?: unknown
  }
  validation?: {
    status?: unknown
    corrected?: unknown
    explanation?: unknown
    issues?: unknown
    examples?: unknown
  }
}

const improvementRules = [
  {
    pattern: /\bI am agree\b/gi,
    replacement: "I agree",
    kind: "grammar",
    explanation: "agree 本身是动词，不需要在前面加 am。",
  },
  {
    pattern: /\bI want\b/gi,
    replacement: "I'd like",
    kind: "register",
    explanation: "服务场景中使用 I'd like... 会比 I want... 更自然、礼貌。",
  },
  {
    pattern: /\bGive me\b/gi,
    replacement: "Could I have",
    kind: "register",
    explanation: "用 Could I have... 提出请求，语气更符合真实交流习惯。",
  },
  {
    pattern: /\bCan you give me\b/gi,
    replacement: "Could I have",
    kind: "register",
    explanation: "用 Could I have... 能让请求更简洁自然。",
  },
] as const

const translationRequestPattern =
  /(?:怎么说|如何说|英文(?:怎么|如何)|用英语|翻译|teach\s+me\s+how\s+to\s+say|how\s+(?:do|can|would)\s+(?:i|you)\s+say|translate)/i
const languageQuestionPattern =
  /(?:这样说对吗|语法|区别|什么意思|为什么|是否自然|is\s+(?:this|it)\s+(?:right|correct|natural)|what\s+does|difference\s+between|grammar)/i
const validIssueKinds = new Set<ExpressionIssueKind>([
  "grammar",
  "word_choice",
  "word_order",
  "missing_word",
  "register",
  "clarity",
])
const chineseTextPattern = /[\u3400-\u9fff]/
const latinLetterPattern = /[A-Za-z]/
const chinesePunctuationPattern = /[，。！？；：“”‘’、（）《》【】]/g

const commonTranslations = [
  {
    pattern: /我想打(?:篮球|球)/,
    expression: "I want to play basketball.",
  },
  {
    pattern: /我想(?:要|喝)(?:一杯)?拿铁/,
    expression: "I'd like a latte.",
  },
  {
    pattern: /我想(?:要|喝)(?:一杯)?咖啡/,
    expression: "I'd like a coffee.",
  },
  {
    pattern: /我同意/,
    expression: "I agree.",
  },
] as const

export function removeMarkdownEmphasis(value: string) {
  return stripEmoji(value.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1"))
}

export function fillExpressionPlaceholder(value: string, replacement = "that") {
  return value
    .replace(/\s*\.{3}\s*/g, (placeholder, offset: number) => {
      const previous = value[offset - 1] ?? ""
      const next = value[offset + placeholder.length] ?? ""
      const leadingSpace = previous && !/\s/.test(previous) ? " " : ""
      const trailingSpace = next && !/[\s.,!?;:]/.test(next) ? " " : ""
      return `${leadingSpace}${replacement}${trailingSpace}`
    })
    .replace(/([A-Za-z])(?=that\b)/gi, "$1 ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
}

// Providers occasionally answer with full Markdown (headings, lists, code fences, links)
// even when asked for plain text. This flattens that formatting into readable prose while
// keeping meaningful line breaks, so the reply never shows raw "**", "#", "-", or backticks
// and any list the model wrote renders as real lines instead of syntax.
export function stripMarkdown(value: string) {
  const withoutInline = value
    .replace(/\r\n/g, "\n")
    // Fenced code blocks: drop the fences, keep the inner lines.
    .replace(/```[^\n]*\n?/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // Images and links: keep only the visible label.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Emphasis and strikethrough.
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?;:]|$)/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1")

  return stripEmoji(
    withoutInline
      .split("\n")
      .map((line) =>
        line
          // Line-leading block syntax: headings, quotes, list bullets, horizontal rules.
          .replace(/^\s{0,3}#{1,6}\s+/, "")
          .replace(/^\s{0,3}>\s?/, "")
          .replace(/^\s*[-*+]\s+/, "• ")
          .replace(/^(\s*\d+)\.\s+/, "$1. ")
          .replace(/^\s*(?:[-*_]\s*){3,}$/, "")
          .trimEnd(),
      )
      .join("\n")
      .replace(/\n{3,}/g, "\n\n"),
  )
}

function removeChineseText(value: string) {
  return value
    .replace(/[\u3400-\u9fff]+/g, "")
    .replace(chinesePunctuationPattern, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function extractChineseSupportText(value: string) {
  return stripMarkdown(value)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => chineseTextPattern.test(line))
    .join("\n")
    .trim()
}

function createEnglishReply(
  value: string,
  fallback = "I understand. Let's keep going in English.",
) {
  const lines = stripMarkdown(value)
    .split("\n")
    .filter((line) => !chineseTextPattern.test(line))
    .map(removeChineseText)
    .filter((line) => latinLetterPattern.test(line))

  return lines.join("\n").trim() || fallback
}

export function analyzeConversationInput(value: string): ConversationInputAnalysis {
  const input = removeMarkdownEmphasis(value)
  const language = detectInputLanguageImmediately(input)
  const intent: ConversationIntent = translationRequestPattern.test(input)
    ? "translation_request"
    : languageQuestionPattern.test(input)
      ? "language_question"
      : "scene_reply"

  return { language, intent }
}

function getKnownTranslation(input: string) {
  return commonTranslations.find((item) => item.pattern.test(input))?.expression ?? ""
}

function createPracticeExamples(expression: string): PracticeExample[] {
  if (/play basketball/i.test(expression)) {
    return [
      {
        english: "I want to play basketball after work.",
        chinese: "我想下班后去打篮球。",
      },
      {
        english: "Do you want to play basketball this weekend?",
        chinese: "你这周末想打篮球吗？",
      },
      {
        english: "I usually play basketball with my friends.",
        chinese: "我通常和朋友一起打篮球。",
      },
    ]
  }

  if (/\bI'd like\b/i.test(expression)) {
    return [
      {
        english: "I'd like a cup of coffee, please.",
        chinese: "我想要一杯咖啡，谢谢。",
      },
      {
        english: "I'd like to make a reservation.",
        chinese: "我想预订。",
      },
      {
        english: "I'd like the bill, please.",
        chinese: "请给我账单。",
      },
    ]
  }

  if (/\bI agree\b/i.test(expression)) {
    return [
      {
        english: "I agree with your point.",
        chinese: "我同意你的观点。",
      },
      {
        english: "I agree that we need more time.",
        chinese: "我同意我们需要更多时间。",
      },
    ]
  }

  if (/\bCould I (?:have|get)\b/i.test(expression)) {
    return [
      {
        english: "Could I have some water, please?",
        chinese: "可以给我一些水吗？",
      },
      {
        english: "Could I get a receipt, please?",
        chinese: "可以给我一张收据吗？",
      },
    ]
  }

  return expression
    ? [
        {
          english: expression,
          chinese: "本轮核心表达，可替换关键词后迁移到相似场景。",
        },
      ]
    : []
}

export function createExpressionValidation(
  rawInput: string,
  suggestedPhrase: string,
  sceneTag: string,
): ExpressionValidation {
  const input = removeMarkdownEmphasis(rawInput).replace(/\s+/g, " ")
  const inputAnalysis = analyzeConversationInput(input)
  const englishWords = input.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []

  if (inputAnalysis.language === "chinese" || inputAnalysis.intent === "translation_request") {
    const corrected =
      getKnownTranslation(input) ||
      fillExpressionPlaceholder(suggestedPhrase).replace(/\?\.$/, "?")
    return {
      status: "guidance",
      corrected,
      explanation:
        inputAnalysis.intent === "translation_request"
          ? "已识别为英文表达求助；中文片段是待翻译内容，不作为英语错误。"
          : "已识别到中文意图；可以用下面的英文继续当前场景。",
      issues: [],
      examples: createPracticeExamples(corrected),
    }
  }

  if (englishWords.length < 2) {
    return {
      status: "improve",
      corrected: fillExpressionPlaceholder(suggestedPhrase),
      explanation: `当前表达信息不足。可以先用完整句回应，并尝试覆盖“${sceneTag}”任务。`,
      issues: [
        {
          kind: "clarity",
          original: input,
          corrected: fillExpressionPlaceholder(suggestedPhrase),
          explanation: "当前表达缺少完成沟通任务所需的信息。",
        },
      ],
      examples: createPracticeExamples(fillExpressionPlaceholder(suggestedPhrase)),
    }
  }

  for (const rule of improvementRules) {
    const match = rule.pattern.exec(input)
    if (match) {
      rule.pattern.lastIndex = 0
      const corrected = input.replace(rule.pattern, rule.replacement)
      return {
        status: "improve",
        corrected,
        explanation: rule.explanation,
        issues: [
          {
            kind: rule.kind,
            original: match[0],
            corrected: rule.replacement,
            explanation: rule.explanation,
          },
        ],
        examples: createPracticeExamples(corrected),
      }
    }
    rule.pattern.lastIndex = 0
  }

  const corrected = /[.!?]$/.test(input) ? input : `${input}.`
  return {
    status: "accurate",
    corrected,
    explanation: `表达清楚自然，并符合“${sceneTag}”场景的交流目标。`,
    issues: [],
    examples: [],
  }
}

function parseProviderIssues(value: unknown): ExpressionIssue[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.slice(0, 3).flatMap((item) => {
    if (!item || typeof item !== "object") {
      return []
    }
    const candidate = item as Partial<ExpressionIssue>
    if (
      typeof candidate.original !== "string" ||
      typeof candidate.corrected !== "string" ||
      typeof candidate.explanation !== "string"
    ) {
      return []
    }

    return [
      {
        kind:
          typeof candidate.kind === "string" &&
          validIssueKinds.has(candidate.kind as ExpressionIssueKind)
            ? (candidate.kind as ExpressionIssueKind)
            : "clarity",
        original: removeMarkdownEmphasis(candidate.original),
        corrected: fillExpressionPlaceholder(removeMarkdownEmphasis(candidate.corrected)),
        explanation: removeMarkdownEmphasis(candidate.explanation),
      },
    ]
  })
}

function parseProviderExamples(value: unknown): PracticeExample[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.slice(0, 3).flatMap((item) => {
    if (!item || typeof item !== "object") {
      return []
    }
    const candidate = item as Partial<PracticeExample>
    if (typeof candidate.english !== "string" || typeof candidate.chinese !== "string") {
      return []
    }
    return [
      {
        english: fillExpressionPlaceholder(removeMarkdownEmphasis(candidate.english)),
        chinese: removeMarkdownEmphasis(candidate.chinese),
      },
    ]
  })
}

function parseProviderIntent(value: unknown, fallback: ConversationIntent): ConversationIntent {
  return value === "scene_reply" ||
    value === "translation_request" ||
    value === "language_question"
    ? value
    : fallback
}

function parseProviderPayload(value: string): ProviderPayload | null {
  try {
    return JSON.parse(value) as ProviderPayload
  } catch {
    // Some compatible providers wrap the JSON object in a short prose preface or suffix.
  }

  for (let start = value.indexOf("{"); start >= 0; start = value.indexOf("{", start + 1)) {
    let depth = 0
    let inString = false
    let escaped = false

    for (let index = start; index < value.length; index += 1) {
      const character = value[index]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (character === "\\") {
          escaped = true
        } else if (character === '"') {
          inString = false
        }
        continue
      }

      if (character === '"') {
        inString = true
      } else if (character === "{") {
        depth += 1
      } else if (character === "}") {
        depth -= 1
        if (depth === 0) {
          try {
            return JSON.parse(value.slice(start, index + 1)) as ProviderPayload
          } catch {
            break
          }
        }
      }
    }
  }

  return null
}

export function parseProviderConversation(
  rawContent: string,
  originalInput: string,
  suggestedPhrase = "Could you tell me more?",
  sceneTag = "自然交流",
): ConversationResponseData {
  const unfenced = rawContent
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
  const localAnalysis = analyzeConversationInput(originalInput)
  const knownTranslation = getKnownTranslation(originalInput)

  try {
    const payload = parseProviderPayload(unfenced)
    if (!payload) {
      throw new Error("invalid_provider_payload")
    }
    const content =
      typeof payload.reply === "string"
        ? payload.reply
        : typeof payload.content === "string"
          ? payload.content
          : ""
    if (!content) {
      throw new Error("missing_reply")
    }

    const validation = payload.validation
    const fallbackValidation = createExpressionValidation(
      originalInput,
      suggestedPhrase,
      sceneTag,
    )
    const parsedIntent =
      localAnalysis.intent === "scene_reply"
        ? parseProviderIntent(payload.inputAnalysis?.intent, localAnalysis.intent)
        : localAnalysis.intent
    const providerStatus =
      validation?.status === "improve" ||
      validation?.status === "accurate" ||
      validation?.status === "guidance"
        ? validation.status
        : fallbackValidation.status
    const status =
      parsedIntent === "translation_request" && providerStatus !== "unavailable"
        ? "guidance"
        : providerStatus
    const providerCorrected =
      typeof validation?.corrected === "string"
        ? fillExpressionPlaceholder(removeMarkdownEmphasis(validation.corrected))
        : fallbackValidation.corrected
    const corrected =
      parsedIntent === "translation_request" && knownTranslation
        ? knownTranslation
        : providerCorrected
    const explanation =
      typeof validation?.explanation === "string"
        ? removeMarkdownEmphasis(validation.explanation)
        : fallbackValidation.explanation
    const parsedIssues = parseProviderIssues(validation?.issues)
    const issues =
      status === "improve" && parsedIssues.length === 0
        ? fallbackValidation.issues.length > 0
          ? fallbackValidation.issues
          : [
              {
                kind: "clarity" as const,
                original: removeMarkdownEmphasis(originalInput),
                corrected,
                explanation,
              },
            ]
        : parsedIssues
    const parsedExamples = parseProviderExamples(validation?.examples)

    const replyContent =
      parsedIntent === "translation_request" && knownTranslation
        ? knownTranslation
        : createEnglishReply(content)
    const translation =
      typeof payload.translation === "string"
        ? removeMarkdownEmphasis(payload.translation)
        : extractChineseSupportText(content)

    return {
      content: replyContent,
      translation,
      recall: typeof payload.recall === "string" ? removeMarkdownEmphasis(payload.recall) : "",
      inputAnalysis: {
        language: localAnalysis.language,
        intent: parsedIntent,
      },
      validation: {
        status,
        corrected,
        explanation,
        issues: status === "improve" ? issues : [],
        examples:
          status === "accurate"
            ? []
            : parsedExamples.length > 0
              ? parsedExamples
              : createPracticeExamples(corrected),
      },
      source: "provider",
    }
  } catch {
    const validation = createExpressionValidation(originalInput, suggestedPhrase, sceneTag)
    const resemblesStructuredOutput =
      /["']?(?:reply|content|validation|examples)["']?\s*:/.test(unfenced)
    return {
      content:
        localAnalysis.intent === "translation_request" && knownTranslation
          ? knownTranslation
          : resemblesStructuredOutput
            ? "I understand what you mean. Continue with the suggested expression below."
            : createEnglishReply(rawContent),
      translation:
        localAnalysis.intent === "translation_request" && knownTranslation
          ? `可以说：“${knownTranslation}”`
          : extractChineseSupportText(rawContent),
      recall: "",
      inputAnalysis: localAnalysis,
      validation,
      source: "provider",
    }
  }
}

function keepEnglishSupportText(value: string) {
  const english = removeChineseText(stripMarkdown(value))
  return latinLetterPattern.test(english) ? english : ""
}

function keepEnglishExplanation(value: string) {
  return chineseTextPattern.test(value) ? "" : keepEnglishSupportText(value)
}

export function applyTutorModeToConversation(
  response: ConversationResponseData,
  tutorMode: TutorMode,
): ConversationResponseData {
  if (tutorMode !== "english") {
    return response
  }

  return {
    ...response,
    translation: "",
    recall: keepEnglishSupportText(response.recall),
    validation: {
      ...response.validation,
      explanation: keepEnglishExplanation(response.validation.explanation),
      issues: response.validation.issues.map((issue) => ({
        ...issue,
        explanation: keepEnglishExplanation(issue.explanation),
      })),
      examples: response.validation.examples.map((example) => ({
        ...example,
        chinese: "",
      })),
    },
  }
}

export function getCorrectionSegments(original: string, corrected: string) {
  const originalWords = new Set(
    original
      .toLocaleLowerCase()
      .match(/[a-z]+(?:'[a-z]+)?/g)
      ?.map((word) => word.replace(/[^\w']/g, "")) ?? [],
  )

  return corrected.split(/(\s+|[.,!?;:]+)/).map((text) => {
    const normalized = text.toLocaleLowerCase().replace(/[^\w']/g, "")
    return {
      text,
      changed: Boolean(normalized) && !originalWords.has(normalized),
    }
  })
}

export function getOriginalErrorSegments(
  original: string,
  corrected: string,
  issues: ExpressionIssue[],
) {
  const ranges = issues.flatMap((issue) => {
    const issueText = issue.original.trim()
    if (!issueText) {
      return []
    }
    const start = original.toLocaleLowerCase().indexOf(issueText.toLocaleLowerCase())
    return start >= 0 ? [{ start, end: start + issueText.length }] : []
  })

  if (ranges.length > 0) {
    const boundaries = Array.from(
      new Set([0, original.length, ...ranges.flatMap((range) => [range.start, range.end])]),
    ).sort((left, right) => left - right)

    return boundaries.slice(0, -1).map((start, index) => {
      const end = boundaries[index + 1] ?? original.length
      return {
        text: original.slice(start, end),
        changed: ranges.some((range) => start >= range.start && end <= range.end),
      }
    })
  }

  const correctedWords = new Set(
    corrected
      .toLocaleLowerCase()
      .match(/[a-z]+(?:'[a-z]+)?/g)
      ?.map((word) => word.replace(/[^\w']/g, "")) ?? [],
  )

  return original.split(/(\s+|[.,!?;:]+)/).map((text) => {
    const normalized = text.toLocaleLowerCase().replace(/[^\w']/g, "")
    return {
      text,
      changed: Boolean(normalized) && !correctedWords.has(normalized),
    }
  })
}
