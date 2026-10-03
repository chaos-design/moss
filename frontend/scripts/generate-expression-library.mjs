import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const categoryPlans = [
  {
    category: "clothing",
    label: "购物消费",
    topics: ["询价、比较与预算", "试穿、尺码与风格", "付款、退换与售后"],
  },
  {
    category: "dining",
    label: "餐饮沟通",
    topics: ["订位、入座与点单", "口味、过敏与加菜", "服务反馈、结账与外带"],
  },
  {
    category: "housing",
    label: "居住生活",
    topics: ["看房、租约与搬家", "维修、设施与费用", "家务、邻里与居住安排"],
  },
  {
    category: "transport",
    label: "旅行出行",
    topics: ["机场、航班与行李", "公交、铁路与打车", "问路、驾驶与行程变化"],
  },
  {
    category: "work",
    label: "职场沟通",
    topics: ["会议、汇报与澄清", "项目、进度与协作", "反馈、谈判与职业发展"],
  },
  {
    category: "social",
    label: "社交关系",
    topics: ["认识、寒暄与邀请", "友谊、关系与情绪", "分歧、道歉与边界"],
  },
  {
    category: "health",
    label: "健康医疗",
    topics: ["症状、预约与就诊", "用药、治疗与恢复", "运动、睡眠与身心状态"],
  },
  {
    category: "services",
    label: "公共服务",
    topics: ["银行、邮政与通信", "证件、申请与行政办理", "客服、投诉与问题解决"],
  },
  {
    category: "learning",
    label: "校园学习",
    topics: ["课堂、提问与作业", "学习方法、考试与反馈", "研究、写作与演讲"],
  },
  {
    category: "emergency",
    label: "紧急求助",
    topics: ["报警、定位与现场说明", "医疗、火灾与事故处理", "天气、撤离与安全提醒"],
  },
]
const categoryLabels = Object.fromEntries(
  categoryPlans.map((category) => [category.category, category.label]),
)

const validContexts = new Set(["日常", "职场", "通用"])
const validKinds = new Set(["idiom", "collocation", "phrasal-verb", "sentence-pattern"])
const contextualOpeners = [
  "In this case",
  "For now",
  "To be clear",
  "If possible",
  "When necessary",
  "In practice",
  "At this point",
  "As a first step",
  "Before we continue",
  "From my perspective",
  "Under the circumstances",
  "As things stand",
]
const outputPath = fileURLToPath(
  new URL("../src/lib/expression-library.generated.json", import.meta.url),
)
const reviewedPath = fileURLToPath(
  new URL("../src/lib/idiomatic-expressions.ts", import.meta.url),
)
const cacheDirectory = join(tmpdir(), "moss-expression-generation-v1")

function getProviderConfig() {
  const apiKey = process.env.AI_API_KEY?.trim()
  const baseUrl = process.env.AI_BASE_URL?.trim()?.replace(/\/+$/, "")
  const model = (process.env.AI_MODEL_NAME ?? process.env.AI_MODEL)?.trim()
  if (!apiKey || !baseUrl || !model) {
    throw new Error("AI_BASE_URL, AI_API_KEY, and AI_MODEL_NAME are required.")
  }
  const url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`
  return {
    apiKey,
    model,
    fallbackModel: process.env.AI_EXPRESSION_FALLBACK_MODEL?.trim() || model,
    url,
  }
}

function parseJsonEntries(value) {
  const start = value.indexOf("{")
  const end = value.lastIndexOf("}")
  if (start < 0 || end <= start) {
    throw new Error("Provider response did not contain a JSON object.")
  }
  const parsed = JSON.parse(value.slice(start, end + 1))
  return parsed?.entries
}

function normalizePhrase(value) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim()
}

function addContextualOpener(example, attempt) {
  const opener = contextualOpeners[attempt % contextualOpeners.length]
  const sentence =
    /^I(?:['\s]|$)/.test(example) || !/^[A-Z]/.test(example)
      ? example
      : `${example[0].toLocaleLowerCase()}${example.slice(1)}`
  return `${opener}, ${sentence}`
}

function assertBoundedString(value, name, maximumLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maximumLength) {
    throw new Error(
      `${name} must be a non-empty string of at most ${maximumLength} characters.`,
    )
  }
  return value.trim()
}

function createOrigin(kind, category) {
  const categoryLabel = categoryLabels[category]
  if (kind === "phrasal-verb") {
    return `由核心动词与小品词的惯用组合形成，常见于“${categoryLabel}”语境；确切首创不明。`
  }
  if (kind === "sentence-pattern") {
    return `现代“${categoryLabel}”沟通中的常用句式，由字面语法功能形成，不依赖单一历史典故。`
  }
  if (kind === "collocation") {
    return `由词语长期共现形成的固定搭配，常见于“${categoryLabel}”语境，不依赖单一历史典故。`
  }
  return `现代英语中常见于“${categoryLabel}”语境；确切首创和传播路径未作定论。`
}

function validateEntry(value, category) {
  if (!value || typeof value !== "object") {
    throw new Error("Expression entry must be an object.")
  }
  const phrase = assertBoundedString(value.phrase, "phrase", 120).replace(/\s+/g, " ")
  const meaning = assertBoundedString(value.meaning, "meaning", 200)
  const why = assertBoundedString(value.why, "why", 400)
  const example = assertBoundedString(value.example, "example", 500)
  if (!/[a-z]/i.test(phrase) || !/[a-z]/i.test(example) || !/[.!?]$/.test(example)) {
    throw new Error(`Phrase and example must contain complete English: ${phrase}`)
  }
  if (!/[\u3400-\u9fff]/u.test(meaning) || !/[\u3400-\u9fff]/u.test(why)) {
    throw new Error(`Meaning and reasoning must contain Chinese: ${phrase}`)
  }
  const context = assertBoundedString(value.context, "context", 8)
  const kind = assertBoundedString(value.kind, "kind", 24)
  if (!validContexts.has(context) || !validKinds.has(kind)) {
    throw new Error(`Unsupported context or kind for ${phrase}.`)
  }
  return {
    phrase,
    meaning,
    why,
    origin: createOrigin(kind, category),
    example,
    context,
    kind,
    sceneCategory: category,
  }
}

async function requestEntries({ category, categoryLabel, topic, count, exclusions, provider }) {
  const prompt = [
    "你是严谨的英语学习词典编辑。",
    `请为“${categoryLabel} / ${topic}”生成恰好 ${count} 条现代英语高频地道表达。`,
    "表达可包含习语、固定搭配、短语动词和可直接套用的句型，但必须自然、实用、互不重复。",
    "不要使用生僻、过时、冒犯性或只在非常狭窄地区使用的说法。",
    "meaning 用不超过 24 个汉字解释真实语用含义。",
    "why 用不超过 60 个汉字解释词语组合、字面图像或句式为什么能表达该含义。",
    "example 是不超过 24 个英文单词、包含该表达自然变形的完整句子，并以标点结尾。",
    "context 只能是“日常”“职场”“通用”；kind 只能是 idiom、collocation、phrasal-verb、sentence-pattern。",
    ...(exclusions.length > 0 ? [`不要生成这些已有表达：${exclusions.join(" | ")}`] : []),
    '只返回形如 {"entries":[...]} 的 JSON 对象，不要 Markdown，不要额外解释。每项只包含 phrase、meaning、why、example、context、kind。',
  ].join("\n")
  const response = await fetch(provider.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.3,
      max_tokens: 6_000,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return valid JSON only. Accuracy and common modern usage matter more than novelty.",
        },
        { role: "user", content: prompt },
      ],
    }),
    redirect: "error",
  })
  if (!response.ok) {
    throw new Error(`Provider returned ${response.status}.`)
  }
  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== "string") {
    throw new Error("Provider returned an empty response.")
  }
  const entries = parseJsonEntries(content)
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > count) {
    throw new Error(`Expected up to ${count} entries, received ${entries?.length ?? 0}.`)
  }
  return entries.map((entry) => validateEntry(entry, category))
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function requestEntriesWithRetry(options, attempts = 5) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestEntries({
        ...options,
        provider: {
          ...options.provider,
          model:
            attempt === attempts - 1 ? options.provider.fallbackModel : options.provider.model,
        },
      })
    } catch (error) {
      lastError = error
      process.stderr.write(
        `Retrying ${options.category}/${options.topic}: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      )
      await wait(2_000 * (attempt + 1))
    }
  }
  throw lastError
}

async function runWithConcurrency(tasks, concurrency, operation) {
  const results = new Array(tasks.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await operation(tasks[index])
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}

async function main() {
  const provider = getProviderConfig()
  await mkdir(cacheDirectory, { recursive: true })
  const reviewedSource = await readFile(reviewedPath, "utf8")
  const reviewedPhrases = [...reviewedSource.matchAll(/^\s+phrase:\s+"([^"]+)",$/gm)].map(
    (match) => match[1],
  )
  if (reviewedPhrases.length !== 100) {
    throw new Error(`Expected 100 reviewed phrases, found ${reviewedPhrases.length}.`)
  }

  const tasks = categoryPlans.flatMap((plan) =>
    plan.topics.flatMap((topic) =>
      [1, 2, 3].map((batch) => ({
        ...plan,
        cacheKey: `${plan.category}-${plan.topics.indexOf(topic) + 1}-${batch}`,
        topic: `${topic}，常见表达组 ${batch}`,
      })),
    ),
  )
  const batches = await runWithConcurrency(tasks, 1, async (task) => {
    const cachePath = join(cacheDirectory, `${task.cacheKey}.json`)
    try {
      const cached = JSON.parse(await readFile(cachePath, "utf8"))
      if (Array.isArray(cached) && cached.length > 0 && cached.length <= 10) {
        return cached.map((entry) => validateEntry(entry, task.category))
      }
    } catch {}

    process.stdout.write(`Generating ${task.label}/${task.topic}...\n`)
    try {
      const entries = await requestEntriesWithRetry(
        {
          category: task.category,
          categoryLabel: task.label,
          topic: task.topic,
          count: 10,
          exclusions: [],
          provider,
        },
        3,
      )
      await writeFile(cachePath, JSON.stringify(entries), "utf8")
      await wait(1_000)
      return entries
    } catch {
      process.stderr.write(`Splitting ${task.cacheKey} into smaller requests.\n`)
    }
    const fallbackEntries = []
    for (const part of [1, 2]) {
      const entries = await requestEntriesWithRetry({
        category: task.category,
        categoryLabel: task.label,
        topic: `${task.topic}，补充分组 ${part}`,
        count: 5,
        exclusions: [],
        provider,
      })
      fallbackEntries.push(...entries)
    }
    await writeFile(cachePath, JSON.stringify(fallbackEntries), "utf8")
    await wait(1_000)
    return fallbackEntries
  })

  const seen = new Set(reviewedPhrases.map(normalizePhrase))
  const entries = []
  for (const entry of batches.flat()) {
    let nextEntry = entry
    let normalized = normalizePhrase(nextEntry.phrase)
    if (seen.has(normalized)) {
      let phrase = nextEntry.example
      let attempt = 0
      while (seen.has(normalizePhrase(phrase))) {
        phrase = addContextualOpener(nextEntry.example, attempt)
        attempt += 1
      }
      nextEntry = {
        ...nextEntry,
        phrase,
        why: `这句把“${entry.phrase}”放入完整场景中，${entry.why.slice(0, 300)}`,
        origin: createOrigin("sentence-pattern", entry.sceneCategory),
        kind: "sentence-pattern",
      }
      normalized = normalizePhrase(phrase)
    }
    seen.add(normalized)
    entries.push(nextEntry)
  }

  const identities = entries.map(
    (entry) => `${entry.sceneCategory}:${normalizePhrase(entry.phrase)}`,
  )
  if (entries.length !== 900 || new Set(identities).size !== entries.length) {
    throw new Error("Generated expression library must contain 900 unique entries.")
  }

  await writeFile(outputPath, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, "utf8")
  process.stdout.write(`Wrote ${entries.length} expressions to ${outputPath}.\n`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
