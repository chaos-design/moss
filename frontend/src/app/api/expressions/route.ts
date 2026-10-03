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
  const {
    data: { user },
    error,
  } = await client.auth.getUser()
  if (error || !user) {
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

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
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
  } catch {
    return errorResponse(
      "expression_library_read_failed",
      "云端表达暂时无法读取，本机导入不受影响。",
      502,
    )
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
  } catch {
    return errorResponse(
      "expression_library_write_failed",
      "表达已保存在本机，但暂时无法同步到云端。",
      502,
    )
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
    return errorResponse(
      "expression_library_write_failed",
      "修改已保存在本机，但暂时无法同步到云端。",
      502,
    )
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
  } catch {
    return errorResponse(
      "expression_library_delete_failed",
      "表达已从本机移除，但云端删除暂时失败。",
      502,
    )
  }
}
