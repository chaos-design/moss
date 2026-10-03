import type { LucideIcon } from "lucide-react"
import { BookOpenCheckIcon, MessagesSquareIcon } from "lucide-react"
import { getAvailableConversationScenes } from "@/lib/conversation-scenes"
import { navigationSections } from "@/lib/demo-data"
import type { LearningMemoryItem } from "@/lib/memory"

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

function createSearchResults(memoryItems: LearningMemoryItem[]): GlobalSearchResult[] {
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
  const memories = memoryItems.map((item) => ({
    id: `memory:${item.id}`,
    group: "学习记忆" as const,
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
  }))

  return [...pages, ...scenes, ...memories]
}

function getSearchScore(result: GlobalSearchResult, query: string) {
  const title = normalizeSearchText(result.title)
  const description = normalizeSearchText(result.description)
  const searchable = normalizeSearchText(`${result.keywords} ${result.description}`)
  const terms = normalizeSearchText(query).split(" ").filter(Boolean)
  if (terms.length === 0 || !terms.every((term) => searchable.includes(term))) {
    return 0
  }

  return terms.reduce((score, term) => {
    if (title === term) {
      return score + 100
    }
    if (title.startsWith(term)) {
      return score + 60
    }
    if (title.includes(term)) {
      return score + 40
    }
    if (description.includes(term)) {
      return score + 20
    }
    return score + 10
  }, 0)
}

export function searchWorkspace(memoryItems: LearningMemoryItem[], query: string) {
  const results = createSearchResults(memoryItems)
  if (!query.trim()) {
    return results
  }

  return results
    .map((result) => ({ result, score: getSearchScore(result, query) }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.result.title.localeCompare(right.result.title),
    )
    .map((item) => item.result)
}
