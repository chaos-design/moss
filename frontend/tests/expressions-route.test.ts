import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteExpressionLibraryItem: vi.fn(),
  getSupabaseServerClient: vi.fn(),
  listExpressionLibraryItems: vi.fn(),
  updateExpressionLibraryItem: vi.fn(),
  upsertExpressionLibraryItems: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}))

vi.mock("@/lib/server/expression-library-repository", () => ({
  deleteExpressionLibraryItem: mocks.deleteExpressionLibraryItem,
  expressionLibraryPageSize: 200,
  listExpressionLibraryItems: mocks.listExpressionLibraryItems,
  updateExpressionLibraryItem: mocks.updateExpressionLibraryItem,
  upsertExpressionLibraryItems: mocks.upsertExpressionLibraryItems,
}))

import { DELETE, GET, POST, PUT } from "@/app/api/expressions/route"
import { resetRateLimitStore } from "@/lib/server/rate-limit"

const expression = {
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

function createSupabase(userId: string | null = "user-1") {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: [
        {
          limited: false,
          remaining: 119,
          reset_at: "2026-08-30T12:01:00.000Z",
        },
      ],
      error: null,
    }),
  }
}

function createPostRequest(items: unknown) {
  return new Request("https://moss.local/api/expressions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  })
}

function createPutRequest(item: unknown) {
  return new Request("https://moss.local/api/expressions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item }),
  })
}

beforeEach(() => {
  resetRateLimitStore()
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "")
  mocks.getSupabaseServerClient.mockReset().mockResolvedValue(createSupabase())
  mocks.listExpressionLibraryItems.mockReset().mockResolvedValue({
    items: [expression],
    nextOffset: null,
  })
  mocks.updateExpressionLibraryItem.mockReset().mockResolvedValue(undefined)
  mocks.upsertExpressionLibraryItems.mockReset().mockResolvedValue(undefined)
  mocks.deleteExpressionLibraryItem.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("/api/expressions", () => {
  it("returns a paginated user expression library", async () => {
    mocks.listExpressionLibraryItems.mockResolvedValue({
      items: [expression],
      nextOffset: 400,
    })

    const response = await GET(new Request("https://moss.local/api/expressions?cursor=200"))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        cloudAvailable: true,
        items: [expression],
        nextCursor: "400",
        userId: "user-1",
      },
    })
    expect(mocks.listExpressionLibraryItems).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 200, pageSize: 200, userId: "user-1" }),
    )
  })

  it("rejects invalid cursors and malformed imports before authentication", async () => {
    expect(
      (await GET(new Request("https://moss.local/api/expressions?cursor=bad"))).status,
    ).toBe(400)
    expect((await POST(createPostRequest([{ ...expression, meaning: "" }]))).status).toBe(400)
    expect((await POST(createPostRequest([expression, expression]))).status).toBe(400)
    expect(mocks.getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it("imports a validated batch for the authenticated user", async () => {
    const response = await POST(createPostRequest([expression]))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { stored: true, count: 1 } })
    expect(mocks.upsertExpressionLibraryItems).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expression],
        userId: "user-1",
      }),
    )
  })

  it("keeps imports local in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")

    const getResponse = await GET(new Request("https://moss.local/api/expressions"))
    const postResponse = await POST(createPostRequest([expression]))

    expect(await getResponse.json()).toMatchObject({
      data: { cloudAvailable: false, items: [], userId: null },
    })
    expect(postResponse.status).toBe(202)
    expect(mocks.getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it("updates a validated item by client id", async () => {
    const updated = { ...expression, phrase: "keep a close eye on" }
    const response = await PUT(createPutRequest(updated))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { stored: true } })
    expect(mocks.updateExpressionLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        item: updated,
        userId: "user-1",
      }),
    )
  })

  it("rejects invalid edits before authentication", async () => {
    const response = await PUT(createPutRequest({ ...expression, meaning: "" }))

    expect(response.status).toBe(400)
    expect(mocks.getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it("deletes by user-owned client id", async () => {
    const response = await DELETE(
      new Request("https://moss.local/api/expressions?clientId=item-1", {
        method: "DELETE",
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.deleteExpressionLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "item-1", userId: "user-1" }),
    )
  })

  it("requires authentication for cloud operations", async () => {
    mocks.getSupabaseServerClient.mockResolvedValue(createSupabase(null))

    expect((await GET(new Request("https://moss.local/api/expressions"))).status).toBe(401)
    expect(mocks.listExpressionLibraryItems).not.toHaveBeenCalled()
  })
})
