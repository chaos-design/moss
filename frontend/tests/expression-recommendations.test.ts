import { describe, expect, it } from "vitest"
import type { ExpressionLibraryItem } from "@/lib/expression-library-schema"
import { createExpressionIdentity } from "@/lib/expression-library-schema"
import {
  buildExpressionRecommendations,
  expressionRecommendationDimensions,
  getRecommendedGroupId,
} from "@/lib/expression-recommendations"
import {
  addExpressionsToGroup,
  createEmptyExpressionStudyState,
  deleteExpressionGroup,
  getActiveGroups,
  renameExpressionGroup,
} from "@/lib/memory"

function item(
  phrase: string,
  sceneCategory: ExpressionLibraryItem["sceneCategory"],
  context: ExpressionLibraryItem["context"],
  kind: ExpressionLibraryItem["kind"],
): ExpressionLibraryItem {
  return {
    id: `builtin:${phrase}`,
    clientId: `builtin-${phrase}`,
    phrase,
    meaning: "含义",
    why: "原因",
    origin: "来源",
    example: `Use ${phrase} in a sentence.`,
    context,
    kind,
    sceneCategory,
    source: "builtin",
  }
}

const items = [
  item("shop around", "clothing", "日常", "phrasal-verb"),
  item("meet the deadline", "work", "职场", "collocation"),
  item("break the ice", "social", "通用", "idiom"),
  item("as soon as possible", "work", "通用", "sentence-pattern"),
]

describe("expression recommendations", () => {
  it("derives level, scene, kind and progress groups from existing item fields", () => {
    const progressByIdentity = {
      [createExpressionIdentity(items[1])]: "learning" as const,
    }
    const result = buildExpressionRecommendations({ items, progressByIdentity })
    const byId = new Map(result.map((entry) => [entry.id, entry]))

    expect(expressionRecommendationDimensions.map((dimension) => dimension.value)).toEqual([
      "level",
      "scene",
      "kind",
      "context",
      "progress",
    ])
    expect(byId.get("level-A2")?.identities).toContain("clothing:shop around")
    expect(byId.get("level-A2")?.identities).not.toContain("work:meet the deadline")
    expect(byId.get("level-B1")?.identities).toContain("work:meet the deadline")
    expect(byId.get("level-B2")?.identities).toContain("social:break the ice")
    expect(byId.get("level-C1")?.identities).toEqual(["work:as soon as possible"])
    expect(byId.get("scene-social")?.identities).toEqual(["social:break the ice"])
    expect(byId.get("kind-idiom")?.identities).toEqual(["social:break the ice"])
    expect(byId.get("context-职场")?.identities).toEqual(["work:meet the deadline"])
    expect(byId.get("progress-learning")?.identities).toEqual(["work:meet the deadline"])
    expect(byId.get("progress-new")?.identities).toEqual([
      "clothing:shop around",
      "social:break the ice",
      "work:as soon as possible",
    ])
    expect(result.every((entry) => entry.count === entry.identities.length)).toBe(true)
    expect(getRecommendedGroupId("level-A2")).toBe("recommended:level-A2")
  })

  it("can build only the progress-dependent groups", () => {
    const progressByIdentity = {
      [createExpressionIdentity(items[1])]: "mastered" as const,
    }
    const result = buildExpressionRecommendations({
      items,
      progressByIdentity,
      dimensions: ["progress"],
    })

    expect(result.map((entry) => entry.id)).toEqual([
      "progress-learning",
      "progress-mastered",
      "progress-new",
    ])
    expect(result.find((entry) => entry.id === "progress-learning")?.count).toBe(0)
    expect(result.find((entry) => entry.id === "progress-mastered")?.identities).toEqual([
      "work:meet the deadline",
    ])
  })

  it("creates or tops up a personal group with one write and keeps a learner rename", () => {
    const now = new Date("2026-11-20T03:00:00.000Z")
    const groupId = getRecommendedGroupId("scene-social")
    const created = addExpressionsToGroup(
      createEmptyExpressionStudyState(now),
      groupId,
      "社交关系",
      ["social:break the ice", "social:break the ice"],
      now,
    )
    expect(getActiveGroups(created)[0]?.itemIds).toEqual(["social:break the ice"])

    const renamed = renameExpressionGroup(created, groupId, "口语破冰", now)
    const toppedUp = addExpressionsToGroup(
      renamed,
      groupId,
      "社交关系",
      ["social:small talk"],
      now,
    )
    expect(getActiveGroups(toppedUp)[0]).toMatchObject({
      id: groupId,
      name: "口语破冰",
      itemIds: ["social:break the ice", "social:small talk"],
    })

    const deleted = deleteExpressionGroup(toppedUp, groupId, now)
    const recreated = addExpressionsToGroup(
      deleted,
      groupId,
      "社交关系",
      ["social:new phrase"],
      now,
    )
    expect(getActiveGroups(recreated)[0]).toMatchObject({
      id: groupId,
      name: "社交关系",
      itemIds: ["social:new phrase"],
    })
  })
})
