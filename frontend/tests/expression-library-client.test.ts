// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import type { ExpressionLibraryItem } from "@/lib/expression-library"
import {
  deleteCloudExpressionItem,
  loadCloudExpressionItems,
  loadLocalExpressionItems,
  saveCloudExpressionItems,
  saveLocalExpressionItems,
  updateCloudExpressionItem,
} from "@/lib/expression-library-client"

const expression: ExpressionLibraryItem = {
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
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("expression library client", () => {
  it("isolates local imports by account scope", () => {
    saveLocalExpressionItems(window.localStorage, "user-1", [expression])

    expect(loadLocalExpressionItems(window.localStorage, "user-1")).toEqual([expression])
    expect(loadLocalExpressionItems(window.localStorage, "user-2")).toEqual([])
  })

  it("loads every cloud page without truncation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              cloudAvailable: true,
              items: [expression],
              nextCursor: "200",
              userId: "user-1",
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              cloudAvailable: true,
              items: [{ ...expression, clientId: "item-2", phrase: "touch base" }],
              nextCursor: null,
              userId: "user-1",
            },
          }),
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(loadCloudExpressionItems()).resolves.toMatchObject({
      userId: "user-1",
      items: [{ phrase: "keep an eye on" }, { phrase: "touch base" }],
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/expressions?cursor=200",
      expect.objectContaining({ method: "GET" }),
    )
  })

  it("rejects a repeated cloud pagination cursor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              cloudAvailable: true,
              items: [],
              nextCursor: "200",
              userId: "user-1",
            },
          }),
        ),
      ),
    )

    await expect(loadCloudExpressionItems()).rejects.toThrow("无效分页数据")
  })

  it("uploads every item in bounded batches without truncation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { stored: true } }), {
        status: 200,
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const items = Array.from({ length: 450 }, (_, index) => ({
      ...expression,
      clientId: `item-${index}`,
      id: `imported:item-${index}`,
      phrase: `expression ${index}`,
    }))

    await expect(saveCloudExpressionItems(items)).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(
      fetchMock.mock.calls.map((call) => {
        const body = JSON.parse(String(call[1]?.body)) as { items: unknown[] }
        return body.items.length
      }),
    ).toEqual([200, 200, 50])
  })

  it("reports local-only persistence when the server is in demo mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { stored: false } }), {
          status: 202,
        }),
      ),
    )

    await expect(saveCloudExpressionItems([expression])).resolves.toBe(false)
  })

  it("updates and deletes one cloud item by client id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { stored: true, deleted: true } }), {
        status: 200,
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      updateCloudExpressionItem({ ...expression, phrase: "keep a close eye on" }),
    ).resolves.toBe(true)
    await expect(deleteCloudExpressionItem("item-1")).resolves.toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/expressions",
      expect.objectContaining({ method: "PUT" }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/expressions?clientId=item-1",
      expect.objectContaining({ method: "DELETE" }),
    )
  })
})
