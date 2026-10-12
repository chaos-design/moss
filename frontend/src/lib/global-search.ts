import type { LucideIcon } from "lucide-react"
import { BookOpenCheckIcon, MessagesSquareIcon } from "lucide-react"
import { getAvailableConversationScenes } from "@/lib/conversation-scenes"
import type { LearningMemoryItem } from "@/lib/memory"
import { navigationSections } from "@/lib/navigation-sections"

export type GlobalSearchGroup = "学习记忆" | "学习场景" | "页面"

export type GlobalSearchResult = {
  id: string
  group: GlobalSearchGroup
  title: string
  description: string
  href: string
  icon: LucideIcon
  keywords: string
}

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim()
}

// 匹配字段的归一化只在建索引时做一次；按键路径只做 includes，不再对全目录重跑 NFKC 与小写化。
type PreparedSearchResult = {
  result: GlobalSearchResult
  normalizedTitle: string
  normalizedDescription: string
  normalizedSearchable: string
}

function prepareResult(result: GlobalSearchResult): PreparedSearchResult {
  return {
    result,
    normalizedTitle: normalizeSearchText(result.title),
    normalizedDescription: normalizeSearchText(result.description),
    normalizedSearchable: normalizeSearchText(`${result.keywords} ${result.description}`),
  }
}

function createPageAndSceneResults(): GlobalSearchResult[] {
  const pages = navigationSections.flatMap((section) =>
    section.items.map((item) => ({
      id: `page:${item.href}`,
      group: "页面" as const,
      title: item.label,
      description: section.label,
      href: item.href,
      icon: item.icon,
      keywords: `${section.label} ${item.label}`,
    })),
  )
  const scenes = getAvailableConversationScenes("all").map((scene) => ({
    id: `scene:${scene.id}`,
    group: "学习场景" as const,
    title: scene.title,
    description: `${scene.englishTitle} · ${scene.level}`,
    href: `/workspace/conversation?scene=${encodeURIComponent(scene.id)}`,
    icon: MessagesSquareIcon,
    keywords: [
      scene.id,
      scene.title,
      scene.englishTitle,
      scene.description,
      scene.level,
      ...scene.tags,
      ...scene.vocabulary,
      ...(scene.expressionNotes?.flatMap((note) => [
        note.phrase,
        note.meaning,
        note.why,
        note.origin,
        note.example,
        note.context,
      ]) ?? []),
    ].join(" "),
  }))

  return [...pages, ...scenes]
}

function createMemoryResult(item: LearningMemoryItem): GlobalSearchResult {
  return {
    id: `memory:${item.id}`,
    group: "学习记忆",
    title: item.answer,
    description: `${item.label} · ${item.sourceSceneTitle}`,
    href: "/workspace/notebook",
    icon: BookOpenCheckIcon,
    keywords: [
      item.answer,
      item.label,
      item.cue,
      item.explanation,
      item.sourceSceneTitle,
      ...item.transferTargets.flatMap((target) => [target.sceneTitle, target.reason]),
    ].join(" "),
  }
}

// 页面与场景目录不随学习记忆变化，静态部分只构建并归一化一次。
let preparedCatalog: PreparedSearchResult[] | null = null

function getPreparedCatalog() {
  preparedCatalog ??= createPageAndSceneResults().map(prepareResult)
  return preparedCatalog
}

function scorePreparedResult(entry: PreparedSearchResult, terms: string[]) {
  return terms.reduce((score, term) => {
    if (entry.normalizedTitle === term) {
      return score + 100
    }
    if (entry.normalizedTitle.startsWith(term)) {
      return score + 60
    }
    if (entry.normalizedTitle.includes(term)) {
      return score + 40
    }
    if (entry.normalizedDescription.includes(term)) {
      return score + 20
    }
    return score + 10
  }, 0)
}

export function searchWorkspace(memoryItems: LearningMemoryItem[], query: string) {
  const prepared = [
    ...getPreparedCatalog(),
    ...memoryItems.map((item) => prepareResult(createMemoryResult(item))),
  ]
  if (!query.trim()) {
    return prepared.map((entry) => entry.result)
  }

  const terms = normalizeSearchText(query).split(" ").filter(Boolean)
  return prepared
    .filter((entry) => terms.every((term) => entry.normalizedSearchable.includes(term)))
    .map((entry) => ({ entry, score: scorePreparedResult(entry, terms) }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.result.title.localeCompare(right.entry.result.title),
    )
    .map((item) => item.entry.result)
}
