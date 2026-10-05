/**
 * Normalizes unknown throwables and transport failures into short messages that are safe to show
 * to a learner.
 *
 * Route handlers already answer with curated Chinese copy, so their `error.message` is trusted.
 * Everything else — browser fetch failures, JSON parse errors, Supabase SDK errors, media element
 * errors, upstream HTTP status text — is technical output and must never reach the transcript,
 * local storage, or a toast.
 */

const cjkPattern = /[\u3400-\u9fff\uf900-\ufaff]/

/**
 * Technical output that must not be shown even when it is embedded in an otherwise fine message.
 * `longAsciiRunPattern` catches upstream English clauses such as "AI provider returned 400" that
 * survive a Chinese prefix.
 */
const technicalMarkerPattern =
  /\[\s*object\s+Object\s*\]|\bHTTP\s*\d|\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|ERR_[A-Z_]+)\b|\breturned\s+\d{3}\b|\bat\s+[\w$.<>]+\s*\(|:\s*[\w.]+\s*(?:Error|Exception)\b|\bundefined\b|\bnull\b|<[a-z]+[\s>]/i

/** 20 or more consecutive ASCII word characters reads as dumped technical output, not copy. */
const longAsciiRunPattern = /[A-Za-z][A-Za-z0-9\s,.'\-_()/]{19,}/

const networkFailurePattern =
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|connection (?:refused|reset|closed)|socket hang up|\b5\d\d\b.*(?:gateway|bad gateway|service unavailable)|bad gateway|service unavailable/i

const parseFailurePattern =
  /unexpected token|unexpected end of (?:json|input)|json parse|is not valid json|failed to parse|body stream|invalid json/i

const mediaBlockedPattern =
  /notallowederror|play\(\) request|user didn't interact|autoplay|gesture|abort(?:error)?/i

const permissionPattern =
  /permission denied|notallowed|denied|requires a (?:secure|user) context|getusermedia/i

/** HTTP statuses that deserve copy distinct from the generic 5xx branch. */
const statusMessages: Record<number, string> = {
  400: "请求内容有误，请检查后重试。",
  401: "登录状态已失效，请重新登录。",
  403: "当前账号没有执行该操作的权限。",
  404: "请求的服务不存在。",
  405: "请求方式不被支持。",
  408: "服务响应超时，请稍后重试。",
  409: "请求与服务器状态冲突，请刷新后重试。",
  413: "提交的内容过大，请精简后重试。",
  422: "请求内容有误，请检查后重试。",
  429: "操作过于频繁，请稍后重试。",
  500: "服务暂时不可用，请稍后重试。",
  502: "服务暂时不可用，请稍后重试。",
  503: "服务暂时不可用，请稍后重试。",
  504: "服务响应超时，请稍后重试。",
}

export const networkFailureMessage = "网络连接失败，请检查网络后重试。"
export const parseFailureMessage = "服务返回的数据无法解析，请稍后重试。"
export const abortedMessage = "请求已取消。"

export class UserFacingError extends Error {
  readonly status: number | null
  readonly code: string | null

  constructor(message: string, options: { status?: number | null; code?: string | null } = {}) {
    super(message)
    this.name = "UserFacingError"
    this.status = options.status ?? null
    this.code = options.code ?? null
  }
}

export function isUserFacingError(value: unknown): value is UserFacingError {
  return value instanceof UserFacingError
}

/** Aborts are control flow, never failures to report to the learner. */
export function isAbortError(value: unknown): boolean {
  if (value instanceof DOMException && value.name === "AbortError") {
    return true
  }
  if (value instanceof UserFacingError) {
    return false
  }
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    (value as { name?: unknown }).name === "AbortError"
  )
}

/** Copies that are safe to render: Chinese, free of technical markers, and short enough to read. */
export function isUserFacingCopy(message: unknown): message is string {
  if (typeof message !== "string") {
    return false
  }
  const trimmed = message.trim()
  if (trimmed.length === 0 || trimmed.length > 120) {
    return false
  }
  if (!cjkPattern.test(trimmed)) {
    return false
  }
  if (technicalMarkerPattern.test(trimmed) || longAsciiRunPattern.test(trimmed)) {
    return false
  }
  return true
}

export function describeHttpStatus(
  status: number | undefined | null,
  fallback: string,
): string {
  if (typeof status !== "number" || !Number.isFinite(status)) {
    return fallback
  }
  if (statusMessages[status]) {
    return statusMessages[status]
  }
  if (status >= 500) {
    return "服务暂时不可用，请稍后重试。"
  }
  if (status >= 400) {
    return fallback
  }
  return fallback
}

/**
 * Resolves any thrown value into copy that can be shown to a learner. Curated copy survives;
 * technical output is replaced by a diagnosis derived from the failure shape, and anything still
 * unrecognized falls back to the caller's own copy.
 */
export function toUserFacingError(
  error: unknown,
  fallback: string,
  options: { status?: number | null } = {},
): UserFacingError {
  if (isUserFacingError(error)) {
    return error
  }

  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : ""

  if (isUserFacingCopy(message)) {
    return new UserFacingError(message, { status: options.status ?? null })
  }

  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status
    if (typeof status === "number") {
      return new UserFacingError(describeHttpStatus(status, fallback), { status })
    }
  }

  if (options.status != null) {
    return new UserFacingError(describeHttpStatus(options.status, fallback), {
      status: options.status,
    })
  }

  if (parseFailurePattern.test(message)) {
    return new UserFacingError(parseFailureMessage)
  }
  if (networkFailurePattern.test(message)) {
    return new UserFacingError(networkFailureMessage)
  }
  if (mediaBlockedPattern.test(message)) {
    return new UserFacingError("浏览器阻止了音频播放，请先与页面交互后重试。")
  }
  if (permissionPattern.test(message)) {
    return new UserFacingError("浏览器拒绝了该权限请求，请在站点设置中允许后重试。")
  }

  return new UserFacingError(fallback)
}

export function describeUserError(
  error: unknown,
  fallback: string,
  options: { status?: number | null } = {},
): string {
  return toUserFacingError(error, fallback, options).message
}

/**
 * Reads a JSON envelope without letting a non-JSON body surface as a `SyntaxError`. Returns `null`
 * when the response is not parseable JSON so the caller can decide between an HTTP-derived message
 * and a parse-derived one.
 */
export async function readJsonEnvelope<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}
