import { describe, expect, it, vi } from "vitest"
import {
  accountDeletionTables,
  createUserFingerprint,
  exportAccountData,
  hasResidualAccountData,
  userDataTables,
} from "@/lib/server/account-data"

function createExportClient(rowsByTable: Record<string, unknown[]>) {
  const ranges: Array<{ from: number; table: string; to: number }> = []
  return {
    client: {
      from(table: string) {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(() => query),
          range: vi.fn(async (from: number, to: number) => {
            ranges.push({ from, table, to })
            return {
              data: (rowsByTable[table] ?? []).slice(from, to + 1),
              error: null,
            }
          }),
        }
        return query
      },
    },
    ranges,
  }
}

describe("account data", () => {
  it("exports every row by paging until the source is exhausted", async () => {
    const profileRows = Array.from({ length: 501 }, (_, index) => ({ id: `row-${index}` }))
    const { client, ranges } = createExportClient({ profiles: profileRows })

    const exported = await exportAccountData({
      client: client as never,
      user: {
        id: "user-1",
        email: "learner@example.com",
        created_at: "2026-08-01T08:00:00.000Z",
        last_sign_in_at: "2026-08-29T08:00:00.000Z",
        app_metadata: {},
        user_metadata: {},
      } as never,
      now: new Date("2026-08-29T09:00:00.000Z"),
    })

    expect(exported.data.profiles).toHaveLength(501)
    expect(exported.exportedAt).toBe("2026-08-29T09:00:00.000Z")
    expect(ranges.filter((range) => range.table === "profiles")).toEqual([
      { from: 0, table: "profiles", to: 499 },
      { from: 500, table: "profiles", to: 999 },
    ])
    expect(ranges.some((range) => range.table === "expression_library_items")).toBe(true)
    expect(Object.keys(exported.data)).toHaveLength(userDataTables.length)
  })

  it("creates a stable HMAC fingerprint without exposing the user id", () => {
    const fingerprint = createUserFingerprint("user-1", "audit-secret")

    expect(fingerprint).toHaveLength(64)
    expect(fingerprint).toBe(createUserFingerprint("user-1", "audit-secret"))
    expect(fingerprint).not.toContain("user-1")
  })

  it("detects residual rows in any user-owned table", () => {
    const counts = Object.fromEntries(
      accountDeletionTables.map((table) => [
        table.name,
        table.name === "rate_limit_buckets" ? 1 : 0,
      ]),
    )

    expect(hasResidualAccountData(counts as never)).toBe(true)
    expect(
      hasResidualAccountData(
        Object.fromEntries(accountDeletionTables.map((table) => [table.name, 0])) as never,
      ),
    ).toBe(false)
  })
})
