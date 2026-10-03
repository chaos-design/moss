import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  countAccountRows: vi.fn(),
  createUserFingerprint: vi.fn(),
  exportAccountData: vi.fn(),
  finishAccountDeletionAudit: vi.fn(),
  getSupabaseAdminClient: vi.fn(),
  getSupabaseServerClient: vi.fn(),
  hasResidualAccountData: vi.fn(),
  startAccountDeletionAudit: vi.fn(),
}))

vi.mock("@/lib/server/account-data", () => ({
  countAccountRows: mocks.countAccountRows,
  createUserFingerprint: mocks.createUserFingerprint,
  exportAccountData: mocks.exportAccountData,
  finishAccountDeletionAudit: mocks.finishAccountDeletionAudit,
  hasResidualAccountData: mocks.hasResidualAccountData,
  startAccountDeletionAudit: mocks.startAccountDeletionAudit,
}))

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: mocks.getSupabaseAdminClient,
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}))

import { DELETE, GET } from "@/app/api/account/route"
import { resetRateLimitStore } from "@/lib/server/rate-limit"

const user = {
  id: "user-1",
  email: "learner@example.com",
  created_at: "2026-08-01T08:00:00.000Z",
  last_sign_in_at: "2026-08-29T08:00:00.000Z",
  app_metadata: {},
  user_metadata: {},
}

const zeroCounts = {
  profiles: 0,
  conversations: 0,
  conversation_messages: 0,
  learning_progress: 0,
  issue_records: 0,
  review_items: 0,
  shadowing_attempts: 0,
  learning_events: 0,
  learning_memory_snapshots: 0,
  learning_memory_documents: 0,
  expression_library_items: 0,
  rate_limit_buckets: 0,
}

function createSessionClient(
  rpc = vi.fn().mockResolvedValue({
    data: [
      {
        limited: false,
        remaining: 9,
        reset_at: "2026-08-29T09:00:00.000Z",
      },
    ],
    error: null,
  }),
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc,
  }
}

function createAdminClient() {
  return {
    auth: {
      admin: {
        deleteUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
  }
}

function createDeleteRequest(confirmation = user.email) {
  return new Request("https://moss.local/api/account", {
    method: "DELETE",
    body: JSON.stringify({ confirmation }),
  })
}

beforeEach(() => {
  resetRateLimitStore()
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "")
  vi.stubEnv("ACCOUNT_DELETION_AUDIT_SECRET", "test-audit-secret-at-least-32-bytes")
  mocks.getSupabaseServerClient.mockReset().mockResolvedValue(createSessionClient())
  mocks.getSupabaseAdminClient.mockReset().mockReturnValue(createAdminClient())
  mocks.exportAccountData.mockReset().mockResolvedValue({
    version: 1,
    account: { id: user.id },
    data: {},
  })
  mocks.countAccountRows.mockReset().mockResolvedValue(zeroCounts)
  mocks.createUserFingerprint.mockReset().mockReturnValue("a".repeat(64))
  mocks.startAccountDeletionAudit.mockReset().mockResolvedValue("audit-1")
  mocks.finishAccountDeletionAudit.mockReset().mockResolvedValue(undefined)
  mocks.hasResidualAccountData.mockReset().mockReturnValue(false)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("/api/account", () => {
  it("exports all account data with download and cache headers", async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="moss-account-export-\d{4}-\d{2}-\d{2}\.json"$/,
    )
    expect(await response.json()).toMatchObject({
      version: 1,
      account: { id: user.id },
    })
    expect(mocks.exportAccountData).toHaveBeenCalledWith(expect.objectContaining({ user }))
  })

  it("requires the current email before creating a deletion audit", async () => {
    const response = await DELETE(createDeleteRequest("wrong@example.com"))

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe("confirmation_mismatch")
    expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it("fails closed when the shared rate limiter is unavailable", async () => {
    mocks.getSupabaseServerClient.mockResolvedValue(
      createSessionClient(
        vi.fn().mockResolvedValue({
          data: null,
          error: new Error("rate limiter unavailable"),
        }),
      ),
    )

    const response = await GET()

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: { code: "rate_limit_unavailable" },
    })
    expect(mocks.exportAccountData).not.toHaveBeenCalled()
  })

  it("deletes the auth user and verifies every user table is empty", async () => {
    const sessionClient = createSessionClient()
    const adminClient = createAdminClient()
    mocks.getSupabaseServerClient.mockResolvedValue(sessionClient)
    mocks.getSupabaseAdminClient.mockReturnValue(adminClient)
    mocks.countAccountRows
      .mockResolvedValueOnce({ ...zeroCounts, learning_memory_documents: 4 })
      .mockResolvedValueOnce(zeroCounts)

    const response = await DELETE(createDeleteRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        auditId: "audit-1",
        deleted: true,
        vectorDocumentsDeleted: 4,
      },
    })
    expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledWith(user.id)
    expect(mocks.finishAccountDeletionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditId: "audit-1",
        residualCounts: zeroCounts,
        status: "completed",
      }),
    )
    expect(sessionClient.auth.signOut).toHaveBeenCalled()
  })

  it("reports residual rows after the auth user is deleted", async () => {
    const residualCounts = { ...zeroCounts, learning_memory_documents: 1 }
    mocks.countAccountRows
      .mockResolvedValueOnce({ ...zeroCounts, learning_memory_documents: 3 })
      .mockResolvedValueOnce(residualCounts)
    mocks.hasResidualAccountData.mockReturnValue(true)

    const response = await DELETE(createDeleteRequest())
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error.code).toBe("account_deletion_incomplete")
    expect(payload.data).toEqual({
      auditId: "audit-1",
      deleted: true,
      residualCounts,
    })
    expect(mocks.finishAccountDeletionAudit).toHaveBeenCalledWith(
      expect.objectContaining({ status: "residual_data" }),
    )
  })

  it("records a failed audit when Supabase rejects deletion", async () => {
    const adminClient = createAdminClient()
    adminClient.auth.admin.deleteUser.mockResolvedValue({
      data: null,
      error: new Error("delete failed"),
    })
    mocks.getSupabaseAdminClient.mockReturnValue(adminClient)

    const response = await DELETE(createDeleteRequest())

    expect(response.status).toBe(502)
    expect((await response.json()).error.code).toBe("account_deletion_failed")
    expect(mocks.finishAccountDeletionAudit).toHaveBeenCalledWith(
      expect.objectContaining({ auditId: "audit-1", status: "failed" }),
    )
  })

  it("reports that deletion succeeded when the final audit update fails", async () => {
    mocks.finishAccountDeletionAudit.mockRejectedValue(new Error("audit unavailable"))

    const response = await DELETE(createDeleteRequest())
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error.code).toBe("account_deleted_audit_failed")
    expect(payload.data).toEqual({ auditId: "audit-1", deleted: true })
  })

  it("fails closed when the admin deletion service is not configured", async () => {
    mocks.getSupabaseAdminClient.mockReturnValue(null)

    const response = await DELETE(createDeleteRequest())

    expect(response.status).toBe(503)
    expect((await response.json()).error.code).toBe("account_deletion_not_configured")
  })
})
