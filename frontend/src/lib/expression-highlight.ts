/**
 * 例句里的目标表达高亮。
 *
 * 词库与复习卡片都要让学习者看见“这个表达在句子里长什么样”，但例句常用词形变化
 * （spill → spilled）或具体人称替换占位符（someone → my），所以不能只做一次
 * `indexOf`。这里按「原形 → 首词词尾 → 不规则动词 → 占位符」的顺序生成候选模式，
 * 只取第一个命中的模式，避免一句话里出现重叠高亮。
 */

export type ExpressionHighlightSegment = {
  text: string
  highlighted: boolean
}

// 常见不规则动词的原形与过去式/过去分词。只覆盖精讲词库里会出现在句首的表达，
// 不追求完整词表；命中不了就退回原形匹配，不会误伤其他单词。
const irregularHeadForms: Record<string, readonly string[]> = {
  be: ["was", "were", "been"],
  begin: ["began", "begun"],
  bite: ["bit", "bitten"],
  blow: ["blew", "blown"],
  break: ["broke", "broken"],
  bring: ["brought"],
  build: ["built"],
  catch: ["caught"],
  choose: ["chose", "chosen"],
  come: ["came"],
  cost: ["cost"],
  cut: ["cut"],
  do: ["did", "done"],
  drink: ["drank", "drunk"],
  drive: ["drove", "driven"],
  fall: ["fell", "fallen"],
  feel: ["felt"],
  fight: ["fought"],
  find: ["found"],
  fly: ["flew", "flown"],
  get: ["got", "gotten"],
  give: ["gave", "given"],
  go: ["went", "gone"],
  hang: ["hung"],
  have: ["had", "has"],
  hit: ["hit"],
  hold: ["held"],
  keep: ["kept"],
  leave: ["left"],
  let: ["let"],
  lose: ["lost"],
  make: ["made"],
  meet: ["met"],
  pay: ["paid"],
  put: ["put"],
  read: ["read"],
  run: ["ran"],
  say: ["said"],
  see: ["saw", "seen"],
  sell: ["sold"],
  send: ["sent"],
  set: ["set"],
  sit: ["sat"],
  sleep: ["slept"],
  speak: ["spoke", "spoken"],
  spend: ["spent"],
  stand: ["stood"],
  take: ["took", "taken"],
  teach: ["taught"],
  tell: ["told"],
  think: ["thought"],
  throw: ["threw", "thrown"],
  understand: ["understood"],
  wear: ["wore", "worn"],
  win: ["won"],
  write: ["wrote", "written"],
}

const placeholderPattern = "[A-Za-z][A-Za-z'’-]*"
// 所有格占位符（your/my/its/someone's）在例句里可能落到多词所有格名词短语
// （pull my leg、on the leadership team's radar）。
const multiWordPossessivePattern =
  "(?:my|your|his|her|its|our|their|(?:the\\s+)?[A-Za-z][A-Za-z'’\\-]*(?:\\s+[A-Za-z][A-Za-z'’\\-]*)*'s)"
const reflexivePattern = "(?:myself|yourself|himself|herself|ourselves|themselves)"
// 主语占位符常被具体代词替换（cross that bridge when you come to it → when we come to it）。
const subjectPronounPattern = "(?:you|we|I|they|he|she)"
// play it by ear 里的 it 在例句里可能落到具体名词短语（play the afternoon by ear）。
const itObjectPattern = "(?:it|the\\s+[A-Za-z][A-Za-z'’\\-]*(?:\\s+[A-Za-z][A-Za-z'’\\-]*)?)"
const inflectionSuffix = "(?:s|es|ed|d|ing)?"

// 目标表达作谓语时，例句常把助动词和否定/完成副词一起算进这个表达：
// is giving up、have never given up。只收窄到这些词，避免吞掉 always、also 等实义修饰语。
const auxiliaryPattern =
  "(?:am|is|are|was|were|be|been|being|have|has|had|having|do|does|did|can|could|may|might|must|shall|should|will|would)"
const verbalAdverbPattern = "(?:not|never|already|just|still|ever)"
const verbalPrefixPattern = `(?:(?:${auxiliaryPattern}|${verbalAdverbPattern})\\s+){0,3}`

// 只有动词开头的短语才允许把前面的助动词纳入高亮；名词/介词/形容词开头保持原匹配。
const verbalHeads = new Set([
  ...Object.keys(irregularHeadForms),
  "call",
  "carry",
  "check",
  "clean",
  "cross",
  "dress",
  "drop",
  "dust",
  "face",
  "fill",
  "finish",
  "fix",
  "follow",
  "grow",
  "hand",
  "kill",
  "knock",
  "look",
  "mix",
  "move",
  "need",
  "open",
  "pass",
  "play",
  "point",
  "pull",
  "push",
  "raise",
  "read",
  "run",
  "save",
  "say",
  "sell",
  "send",
  "set",
  "show",
  "slow",
  "speak",
  "start",
  "stay",
  "stop",
  "study",
  "talk",
  "tidy",
  "turn",
  "use",
  "wait",
  "walk",
  "want",
  "warm",
  "wash",
  "watch",
  "work",
])

// 短语词与词之间有时会被插入一个虚词：need lecture 在例句里写成 need a lecture。
// 只允许两类常见虚词且最多一个，避免把无关表达误命中；不覆盖代词/副词等高误伤词。
const insertableFunctionWords = "(?:a|an|the|to|of|for|in|on|at|by|with|and|or)"
const wordGap = `(?:\\s+(?:${insertableFunctionWords})\\s+|\\s+)`

// 短语末尾是虚词时不做词形扩展（keep tabs on 不能匹配 keeps tabs ons）；
// 名词或形容词结尾则允许复数/比较级等常见词尾（quick win → quick wins）。
const functionWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "it",
  "of",
  "off",
  "on",
  "or",
  "out",
  "over",
  "than",
  "that",
  "the",
  "this",
  "to",
  "up",
  "with",
])

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function escapeApostrophes(value: string) {
  return escapeRegExp(value).replace(/'/g, "['’]")
}

function buildTailPattern(token: string) {
  const normalized = token.toLocaleLowerCase()
  // 冠词与名词之间常插入形容词：make a big difference。
  if (normalized === "a" || normalized === "an") {
    return `(?:a|an)(?:\\s+${placeholderPattern})?`
  }
  if (
    normalized === "yourself" ||
    normalized === "myself" ||
    normalized === "himself" ||
    normalized === "herself" ||
    normalized === "ourselves" ||
    normalized === "themselves"
  ) {
    return reflexivePattern
  }
  if (
    normalized === "your" ||
    normalized === "my" ||
    normalized === "someone's" ||
    normalized === "somebody's"
  ) {
    return multiWordPossessivePattern
  }
  if (normalized === "you") {
    return subjectPronounPattern
  }
  if (normalized === "someone" || normalized === "somebody") {
    return placeholderPattern
  }
  if (normalized === "something") {
    // something 在例句里可能展开成两三个词（如 “the delivery window”），
    // 允许最多两个词，但必须以单词边界收住。
    return `${placeholderPattern}(?:\\s+${placeholderPattern})?`
  }
  if (normalized === "it") {
    return itObjectPattern
  }
  return escapeApostrophes(token)
}

function buildPatterns(phrase: string) {
  const tokens = phrase.trim().split(/\s+/).filter(Boolean)
  const head = tokens[0]
  if (!head) {
    return []
  }
  const tail = tokens.slice(1)
  const tailPattern = tail
    .map((token, index) => {
      const base = buildTailPattern(token)
      const isLast = index === tail.length - 1
      const normalized = token.toLocaleLowerCase()
      const isPlaceholder =
        normalized === "someone" ||
        normalized === "someone's" ||
        normalized === "somebody" ||
        normalized === "something"
      return isLast && !isPlaceholder && !functionWords.has(normalized)
        ? `${base}${inflectionSuffix}`
        : base
    })
    .join(wordGap)
  const suffix = tailPattern ? `${wordGap}${tailPattern}` : ""
  const normalizedHead = head.toLocaleLowerCase()
  const headIsPlaceholder =
    normalizedHead === "someone" ||
    normalizedHead === "someone's" ||
    normalizedHead === "somebody" ||
    normalizedHead === "something"
  const headVariants = headIsPlaceholder
    ? [placeholderPattern]
    : normalizedHead === "be"
      ? // 句型类词条以 be 开头，例句里会落到 am/is/are/was/were。
        ["(?:be|am|is|are|was|were|been)"]
      : normalizedHead === "a" || normalizedHead === "an"
        ? // 冠词开头的短语常被形容词插入：a steep learning curve。
          [`(?:a|an)(?:\\s+${placeholderPattern})?`]
        : [
            `${escapeApostrophes(head)}${inflectionSuffix}`,
            // 不发音 e 结尾的动词加 -ing 时去 e（give → giving）。
            ...(/e$/i.test(head) ? [`${escapeApostrophes(head).slice(0, -1)}ing`] : []),
            // 辅音 + 元音 + 单辅音结尾的动词加 -ing/-ed 时双写末辅音（run → running、stop → stopped）。
            // 排除 w/x/y 结尾（show → showing、fix → fixing 不双写）；只给动词头生成，避免误伤名词。
            ...(verbalHeads.has(normalizedHead)
              ? (() => {
                  const match = /[^aeiou][aeiou]([bcdfghjklmnpqrstvz])$/i.exec(head)
                  return match
                    ? [`${escapeApostrophes(head)}${escapeApostrophes(match[1])}(?:ing|ed)`]
                    : []
                })()
              : []),
            // 辅音字母 + y 结尾的动词变过去式时改 y 为 ied（carry → carried）。
            ...(/[^aeiou]y$/i.test(head) ? [`${escapeApostrophes(head).slice(0, -1)}ied`] : []),
            ...(irregularHeadForms[normalizedHead] ?? []).map(escapeApostrophes),
          ]
  // had better / would rather 在例句里常缩约为 'd（You'd better / I'd rather），
  // 头词补上「代词 + 'd」的变体。
  if (normalizedHead === "had" || normalizedHead === "would") {
    headVariants.push(`(?:\\w+['’]d|${escapeApostrophes(head)})`)
  }
  const patterns: RegExp[] = []
  if (tail.length <= 2 && !headIsPlaceholder && verbalHeads.has(normalizedHead)) {
    // 优先尝试带助动词的模式，命中 is giving up / have never given up 这类完整谓语。
    patterns.push(
      ...headVariants.map(
        (headPattern) =>
          new RegExp(`\\b${verbalPrefixPattern}${headPattern}${suffix}\\b`, "gi"),
      ),
    )
  }
  patterns.push(
    ...headVariants.map((headPattern) => new RegExp(`\\b${headPattern}${suffix}\\b`, "gi")),
  )
  // 少数例句会换掉动词（pay an arm and a leg），但固定部分仍然可辨认。
  // 只对至少三个词的尾部做兜底，避免 “it a day” 这类片段误伤普通句子。
  if (tail.length >= 3) {
    patterns.push(new RegExp(`\\b${tailPattern}\\b`, "gi"))
  }
  return patterns
}

export function splitExpressionHighlights(
  text: string,
  phrase: string,
): ExpressionHighlightSegment[] {
  const trimmedPhrase = phrase.trim()
  if (!text || !trimmedPhrase) {
    return [{ text, highlighted: false }]
  }
  for (const pattern of buildPatterns(trimmedPhrase)) {
    pattern.lastIndex = 0
    const match = pattern.exec(text)
    if (!match || match.index === undefined || !match[0]) {
      continue
    }
    const start = match.index
    const end = start + match[0].length
    return [
      ...(start > 0 ? [{ text: text.slice(0, start), highlighted: false }] : []),
      { text: text.slice(start, end), highlighted: true },
      ...(end < text.length ? [{ text: text.slice(end), highlighted: false }] : []),
    ]
  }
  return [{ text, highlighted: false }]
}
