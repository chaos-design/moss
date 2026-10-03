import { describe, expect, it, vi } from "vitest"
import {
  deleteExpressionLibraryItem,
  listExpressionLibraryItems,
  updateExpressionLibraryItem,
  upsertExpressionLibraryItems,
} from "@/lib/server/expression-library-repository"

const item = {
  id: "imported:item-1",
  clientId: "item-1",
  phrase: "keep an eye on",
  meaning: "留意；照看",
  why: "eye 代表观察，keep 表示持续维持注意。",
  origin: "由视觉动作形成的常用表达。",
  example: "Could you keep an eye on my bag?",
  context: "通用",
  kind: "idiom",
  sceneCategory: "social",
  source: "imported",
} as const

describe("expression library repository", () => {
  it("reads one bounded page and exposes a next offset", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `row-${index}`,
      client_id: `item-${index}`,
      phrase: `phrase ${index}`,
      meaning: "含义",
      reasoning: "解释",
      origin_note: "来源",
      example: "This is a complete example.",
      context: "通用",
      kind: "collocation",
      scene_category: "social",
      created_at: "2026-08-30T12:00:00.000Z",
      updated_at: "2026-08-30T12:00:00.000Z",
    }))
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn().mockResolvedValue({ data: rows, error: null }),
    }
    const client = { from: vi.fn(() => query) }

    const result = await listExpressionLibraryItems({
      client: client as never,
      offset: 20,
      pageSize: 2,
      userId: "user-1",
    })

    expect(result.items).toHaveLength(2)
    expect(result.nextOffset).toBe(22)
    expect(query.range).toHaveBeenCalledWith(20, 22)
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1")
  })

  it("upserts normalized user-owned records", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn(() => ({ upsert })) }

    await upsertExpressionLibraryItems({
      client: client as never,
      items: [item],
      userId: "user-1",
    })

    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          client_id: "item-1",
          phrase: "keep an eye on",
          reasoning: item.why,
          origin_note: item.origin,
          scene_category: "social",
          user_id: "user-1",
        }),
      ],
      { onConflict: "user_id,scene_category,normalized_phrase" },
    )
  })

  it("updates a record by its stable client id", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn(() => ({ upsert })) }

    await updateExpressionLibraryItem({
      client: client as never,
      item: { ...item, phrase: "keep a close eye on" },
      userId: "user-1",
    })

    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          client_id: "item-1",
          phrase: "keep a close eye on",
          user_id: "user-1",
        }),
      ],
      { onConflict: "user_id,client_id" },
    )
  })

  it("deletes only the requested user-owned record", async () => {
    const eq = vi.fn()
    const query = {
      delete: vi.fn(() => query),
      eq,
    }
    eq.mockReturnValueOnce(query).mockResolvedValueOnce({ error: null })
    const client = { from: vi.fn(() => query) }

    await deleteExpressionLibraryItem({
      client: client as never,
      clientId: "item-1",
      userId: "user-1",
    })

    expect(query.eq).toHaveBeenNthCalledWith(1, "user_id", "user-1")
    expect(query.eq).toHaveBeenNthCalledWith(2, "client_id", "item-1")
  })
})
