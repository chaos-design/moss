import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { parseImportedExpressionItem } from "@/lib/expression-library-validation"
import { isDemoMode } from "@/lib/runtime-mode"
import {
  deleteExpressionLibraryItem,
  expressionLibraryPageSize,
  listExpressionLibraryItems,
  updateExpressionLibraryItem,
  upsertExpressionLibraryItems,
} from "@/lib/server/expression-library-repository"
import { consumeSharedRateLimit } from "@/lib/server/rate-limit"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { resolveSessionUser } from "@/lib/supabase/session"

const maximumImportBatchSize = 200
const maximumRequestBytes = 2_000_000

type AuthenticationResult =
  | { authenticated: false; response: NextResponse }
  | { authenticated: true; client: SupabaseClient; userId: string }

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status })
}

async function authenticate(): Promise<AuthenticationResult> {
  const client = await getSupabaseServerClient()
  if (!client) {
    return {
      authenticated: false,
      response: errorResponse("service_not_configured", "服务端认证尚未配置。", 503),
    }
  }
  const user = await resolveSessionUser(client)
  if (!user) {
    return {
      authenticated: false,
      response: errorResponse("unauthorized", "请先登录后再同步表达词库。", 401),
    }
  }
  const rateLimit = await consumeSharedRateLimit({
    client,
    bucket: "expression-library",
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
      response: errorResponse("rate_limited", "表达词库操作过于频繁，请稍后再试。", 429),
    }
  }
  return { authenticated: true, client, userId: user.id }
}

function parseOffset(request: Request) {
  const cursor = new URL(request.url).searchParams.get("cursor")
  if (cursor === null) {
    return 0
  }
  if (!/^(0|[1-9]\d*)$/.test(cursor)) {
    return null
  }
  const offset = Number(cursor)
  return Number.isSafeInteger(offset) ? offset : null
}

function postgresCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : null
  }
  return null
}

function isUniqueConstraintError(error: unknown) {
  return postgresCode(error) === "23505"
}

/**
 * 把数据库错误如实记录并归类，杜绝「一切都是 502」的盲区：
 * - 23514 检查约束 / 23502 非空 / 22P02 类型：数据问题，修数据可恢复，400；
 * - 42P10 on_conflict 约束不存在 / 42703 列不存在 / 42P01 表不存在 / 42501 权限：配置或迁移问题，
 *   重试无意义，503 并给出明确提示；
 * - 其余未知错误保留 502（客户端可重试）。
 * 无论哪类都 console.error 打印真实 code/message，让日志能直接定位。
 */
function databaseFailure(error: unknown, action: string): NextResponse {
  const code = postgresCode(error)
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error)
  console.error(`[api/expressions] ${action} failed`, { code, message })

  if (code === "23514" || code === "23502" || code === "22P02") {
    return errorResponse(
      "expression_library_invalid_data",
      "表达字段未通过数据库校验，请检查字段格式后重试。",
      400,
    )
  }
  if (code === "42P10" || code === "42703" || code === "42P01" || code === "42501") {
    return errorResponse(
      "expression_library_schema_mismatch",
      "云端表达表结构尚未就绪，请联系管理员完成数据库迁移。",
      503,
    )
  }
  return errorResponse(
    `expression_library_${action}_failed`,
    "云端暂时不可用，请稍后重试。",
    502,
  )
}

export async function GET(request: Request) {
  const offset = parseOffset(request)
  if (offset === null) {
    return errorResponse("invalid_request", "表达分页游标格式不正确。", 400)
  }
  if (isDemoMode()) {
    return NextResponse.json({
      data: {
        cloudAvailable: false,
        items: [],
        nextCursor: null,
        userId: null,
      },
    })
  }
  const auth = await authenticate()
  if (!auth.authenticated) {
    return auth.response
  }

  try {
    const page = await listExpressionLibraryItems({
      ...auth,
      offset,
      pageSize: expressionLibraryPageSize,
    })
    return NextResponse.json({
      data: {
        cloudAvailable: true,
        items: page.items,
        nextCursor: page.nextOffset === null ? null : String(page.nextOffset),
        userId: auth.userId,
      },
    })
  } catch (error) {
    return databaseFailure(error, "read")
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > maximumRequestBytes) {
    return errorResponse("request_too_large", "单个导入批次不能超过 2 MB。", 413)
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse("invalid_json", "请求体必须是有效 JSON。", 400)
  }
  const rawItems =
    body && typeof body === "object" && "items" in body
      ? (body as { items?: unknown }).items
      : null
  if (
    !Array.isArray(rawItems) ||
    rawItems.length === 0 ||
    rawItems.length > maximumImportBatchSize
  ) {
    return errorResponse(
      "invalid_request",
      `每个导入批次必须包含 1 到 ${maximumImportBatchSize} 条表达。`,
      400,
    )
  }
  const items = rawItems.map(parseImportedExpressionItem)
  if (items.some((item) => item === null)) {
    return errorResponse("invalid_request", "导入表达的字段或长度不正确。", 400)
  }
  const validItems = items.filter((item) => item !== null)
  const identities = new Set(
    validItems.map(
      (item) =>
        `${item.sceneCategory}:${item.phrase
          .normalize("NFKC")
          .toLocaleLowerCase()
          .replace(/\s+/g, " ")
          .trim()}`,
    ),
  )
  if (identities.size !== validItems.length) {
    return errorResponse("invalid_request", "同一批次包含重复的场景表达。", 400)
  }
  // client_id 也有唯一约束；同批重复标识重试也救不回来，提前挡成 400。
  const clientIds = new Set(validItems.map((item) => item.clientId))
  if (clientIds.size !== validItems.length) {
    return errorResponse("invalid_request", "同一批次包含重复的表达标识。", 400)
  }
  if (isDemoMode()) {
    return NextResponse.json({ data: { stored: false } }, { status: 202 })
  }
  const auth = await authenticate()
  if (!auth.authenticated) {
    return auth.response
  }

  try {
    await upsertExpressionLibraryItems({
      ...auth,
      items: validItems,
    })
    return NextResponse.json({ data: { stored: true, count: items.length } })
  } catch (error) {
    // 唯一约束冲突重试也救不回来，映射成 409 让客户端跳过重试；
    // 其余按真实数据库错误分类（数据问题 400 / 迁移问题 503 / 未知 502）。
    if (isUniqueConstraintError(error)) {
      return errorResponse(
        "expression_library_conflict",
        "部分表达标识与云端冲突，请刷新词库后重试。",
        409,
      )
    }
    return databaseFailure(error, "write")
  }
}

export async function PUT(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > maximumRequestBytes) {
    return errorResponse("request_too_large", "表达数据不能超过 2 MB。", 413)
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse("invalid_json", "请求体必须是有效 JSON。", 400)
  }
  const rawItem =
    body && typeof body === "object" && "item" in body
      ? (body as { item?: unknown }).item
      : null
  const item = parseImportedExpressionItem(rawItem)
  if (!item) {
    return errorResponse("invalid_request", "表达字段或长度不正确。", 400)
  }
  if (isDemoMode()) {
    return NextResponse.json({ data: { stored: false } }, { status: 202 })
  }
  const auth = await authenticate()
  if (!auth.authenticated) {
    return auth.response
  }

  try {
    await updateExpressionLibraryItem({ ...auth, item })
    return NextResponse.json({ data: { stored: true } })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return errorResponse("expression_library_conflict", "同一场景中已存在同名表达。", 409)
    }
    return databaseFailure(error, "write")
  }
}

export async function DELETE(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId")?.trim()
  if (!clientId || clientId.length > 160) {
    return errorResponse("invalid_request", "表达标识格式不正确。", 400)
  }
  if (isDemoMode()) {
    return NextResponse.json({ data: { deleted: false } }, { status: 202 })
  }
  const auth = await authenticate()
  if (!auth.authenticated) {
    return auth.response
  }
  try {
    await deleteExpressionLibraryItem({ ...auth, clientId })
    return NextResponse.json({ data: { deleted: true } })
  } catch (error) {
    return databaseFailure(error, "delete")
  }
}
