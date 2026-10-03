import type { SupabaseClient, User } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { isDemoMode } from "@/lib/runtime-mode"
import {
  countAccountRows,
  createUserFingerprint,
  exportAccountData,
  finishAccountDeletionAudit,
  hasResidualAccountData,
  startAccountDeletionAudit,
} from "@/lib/server/account-data"
import { consumeSharedRateLimit } from "@/lib/server/rate-limit"
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server"

type AuthenticationResult =
  | { authenticated: false; response: NextResponse }
  | { authenticated: true; client: SupabaseClient; user: User }

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status })
}

async function authenticate(action: "delete" | "export"): Promise<AuthenticationResult> {
  if (isDemoMode()) {
    return {
      authenticated: false,
      response: errorResponse("service_not_configured", "演示模式不连接云端账户。", 503),
    }
  }
  const client = await getSupabaseServerClient()
  if (!client) {
    return {
      authenticated: false,
      response: errorResponse("service_not_configured", "服务端认证尚未配置。", 503),
    }
  }
  const {
    data: { user },
    error,
  } = await client.auth.getUser()
  if (error || !user) {
    return {
      authenticated: false,
      response: errorResponse("unauthorized", "请先登录后再管理账户数据。", 401),
    }
  }
  const rateLimit = await consumeSharedRateLimit({
    client,
    bucket: action === "delete" ? "account-delete" : "account-export",
  })
  if (!rateLimit) {
    return {
      authenticated: false,
      response: errorResponse(
        "rate_limit_unavailable",
        "请求保护服务暂时不可用，请稍后再试。",
        503,
      ),
    }
  }
  if (rateLimit.limited) {
    return {
      authenticated: false,
      response: errorResponse("rate_limited", "账户数据操作过于频繁，请稍后再试。", 429),
    }
  }
  return { authenticated: true, client, user }
}

export async function GET() {
  const auth = await authenticate("export")
  if (!auth.authenticated) {
    return auth.response
  }

  try {
    const payload = await exportAccountData(auth)
    const date = new Date().toISOString().slice(0, 10)
    return new Response(JSON.stringify(payload), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="moss-account-export-${date}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    })
  } catch {
    return errorResponse("account_export_failed", "账户数据暂时无法完整导出，请稍后重试。", 502)
  }
}

export async function DELETE(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse("invalid_json", "请求体必须是有效 JSON。", 400)
  }

  const auth = await authenticate("delete")
  if (!auth.authenticated) {
    return auth.response
  }
  const confirmation =
    body && typeof body === "object" && "confirmation" in body
      ? String(body.confirmation).trim().toLocaleLowerCase()
      : ""
  const email = auth.user.email?.trim().toLocaleLowerCase() ?? ""
  if (!email || confirmation !== email) {
    return errorResponse("confirmation_mismatch", "请输入当前账户邮箱以确认删除。", 400)
  }

  const admin = getSupabaseAdminClient()
  const auditSecret = process.env.ACCOUNT_DELETION_AUDIT_SECRET?.trim()
  if (!admin || !auditSecret || auditSecret.length < 32) {
    return errorResponse(
      "account_deletion_not_configured",
      "账户删除服务尚未完成安全配置。",
      503,
    )
  }

  let auditId: string
  let beforeCounts: Awaited<ReturnType<typeof countAccountRows>>
  try {
    beforeCounts = await countAccountRows(admin, auth.user.id)
    auditId = await startAccountDeletionAudit({
      client: admin,
      userFingerprint: createUserFingerprint(auth.user.id, auditSecret),
      vectorDocumentsBefore: beforeCounts.learning_memory_documents,
    })
  } catch {
    return errorResponse(
      "account_deletion_failed",
      "账户删除无法启动，请检查数据库更新状态。",
      502,
    )
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(auth.user.id)
  if (deleteError) {
    await finishAccountDeletionAudit({
      client: admin,
      auditId,
      status: "failed",
      residualCounts: beforeCounts,
    }).catch(() => {})
    return errorResponse(
      "account_deletion_failed",
      "账户删除未完成，审计记录已保留，请稍后重试。",
      502,
    )
  }

  let residualCounts: Awaited<ReturnType<typeof countAccountRows>>
  try {
    residualCounts = await countAccountRows(admin, auth.user.id)
    const residualData = hasResidualAccountData(residualCounts)
    await finishAccountDeletionAudit({
      client: admin,
      auditId,
      status: residualData ? "residual_data" : "completed",
      residualCounts,
    })
    if (residualData) {
      return NextResponse.json(
        {
          error: {
            code: "account_deletion_incomplete",
            message: "账户已删除，但仍检测到残留数据，请联系管理员。",
          },
          data: { auditId, deleted: true, residualCounts },
        },
        { status: 500 },
      )
    }
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "account_deleted_audit_failed",
          message: "账户已删除，但删除审计未完成，请联系管理员。",
        },
        data: { auditId, deleted: true },
      },
      { status: 500 },
    )
  }

  await auth.client.auth.signOut().catch(() => {})
  return NextResponse.json({
    data: {
      auditId,
      deleted: true,
      vectorDocumentsDeleted: beforeCounts.learning_memory_documents,
    },
  })
}
