import { describe, expect, it } from "vitest"
import {
  createEmptyExpressionStudyState,
  createExpressionGroup,
  deleteExpressionGroup,
  getActiveFavorites,
  getActiveGroups,
  mergeExpressionStudyState,
  parseExpressionStudyState,
  recordExpressionProgress,
  saveExpressionFilters,
  toggleExpressionFavorite,
  toggleExpressionGroupItem,
} from "@/lib/memory/expression-study-state"

const t = (iso: string) => new Date(iso)

describe("expression study state", () => {
  it("parses a legacy snapshot without the new field by filling empty defaults", () => {
    const parsed = parseExpressionStudyState({ updatedAt: "2026-01-01T00:00:00.000Z" })
    expect(parsed.favorites).toEqual({})
    expect(parsed.groups).toEqual({})
    expect(parsed.progress).toEqual({})
    expect(parsed.filters.value).toEqual({ query: "", categories: [], source: "all" })
  })

  it("drops malformed entries instead of letting them reach the merge", () => {
    const parsed = parseExpressionStudyState({
      favorites: {
        good: {
          identity: "good",
          addedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        bad: { identity: "bad" },
      },
      groups: { broken: { name: 1 } },
      progress: {
        weird: { status: "unknown", reviews: "many", updatedAt: "2026-01-01T00:00:00.000Z" },
      },
    })
    expect(Object.keys(parsed.favorites)).toEqual(["good"])
    expect(parsed.groups).toEqual({})
    expect(parsed.progress.weird.status).toBe("new")
    expect(parsed.progress.weird.reviews).toBe(0)
  })

  it("writes a tombstone on the second favorite toggle so deletion propagates", () => {
    const empty = createEmptyExpressionStudyState(t("2026-01-01T00:00:00.000Z"))
    const added = toggleExpressionFavorite(
      empty,
      "work:rule of thumb",
      t("2026-01-02T00:00:00.000Z"),
    )
    expect(getActiveFavorites(added)).toEqual(["work:rule of thumb"])

    const removed = toggleExpressionFavorite(
      added,
      "work:rule of thumb",
      t("2026-01-03T00:00:00.000Z"),
    )
    expect(getActiveFavorites(removed)).toEqual([])
    expect(removed.favorites["work:rule of thumb"].deletedAt).toBeTruthy()
  })

  it("keeps a remote deletion when it is newer than a local favorite", () => {
    const local = toggleExpressionFavorite(
      createEmptyExpressionStudyState(t("2026-01-01T00:00:00.000Z")),
      "work:rule of thumb",
      t("2026-01-02T00:00:00.000Z"),
    )
    const remote = toggleExpressionFavorite(
      toggleExpressionFavorite(
        createEmptyExpressionStudyState(t("2026-01-01T00:00:00.000Z")),
        "work:rule of thumb",
        t("2026-01-02T00:00:00.000Z"),
      ),
      "work:rule of thumb",
      t("2026-01-04T00:00:00.000Z"),
    )
    const merged = mergeExpressionStudyState(local, remote)
    expect(getActiveFavorites(merged)).toEqual([])
  })

  it("takes the maximum review count and the newest status when merging progress", () => {
    const base = createEmptyExpressionStudyState(t("2026-01-01T00:00:00.000Z"))
    const local = recordExpressionProgress(
      base,
      "work:a",
      { status: "learning", incrementReviews: true },
      t("2026-01-03T00:00:00.000Z"),
    )
    const remote = recordExpressionProgress(
      base,
      "work:a",
      { status: "mastered", incrementReviews: true },
      t("2026-01-02T00:00:00.000Z"),
    )
    // remote has one review too; bump it to five to pin the max rule.
    remote.progress["work:a"] = { ...remote.progress["work:a"], reviews: 5 }

    const merged = mergeExpressionStudyState(local, remote)
    expect(merged.progress["work:a"].reviews).toBe(5)
    expect(merged.progress["work:a"].status).toBe("learning")
  })

  it("merges symmetrically so two devices converge on the same snapshot", () => {
    const base = createEmptyExpressionStudyState(t("2026-01-01T00:00:00.000Z"))
    const a = saveExpressionFilters(
      base,
      { query: "alpha", categories: [], source: "all" },
      t("2026-01-02T00:00:00.000Z"),
    )
    const b = toggleExpressionFavorite(
      recordExpressionProgress(
        base,
        "work:b",
        { status: "mastered", incrementReviews: true },
        t("2026-01-02T00:00:00.000Z"),
      ),
      "work:b",
      t("2026-01-02T00:00:00.000Z"),
    )
    expect(mergeExpressionStudyState(a, b)).toEqual(mergeExpressionStudyState(b, a))
  })

  it("creates, fills and deletes a group with a tombstone", () => {
    const base = createEmptyExpressionStudyState(t("2026-01-01T00:00:00.000Z"))
    const created = createExpressionGroup(base, "g1", "面试表达", t("2026-01-01T00:00:00.000Z"))
    const filled = toggleExpressionGroupItem(
      created,
      "g1",
      "work:a",
      t("2026-01-02T00:00:00.000Z"),
    )
    expect(filled.groups.g1.itemIds).toEqual(["work:a"])

    const deleted = deleteExpressionGroup(filled, "g1", t("2026-01-03T00:00:00.000Z"))
    expect(getActiveGroups(deleted)).toEqual([])
  })
})
