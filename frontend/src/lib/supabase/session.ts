import type { createServerClient } from "@supabase/ssr"

/** middleware 与 Server Component 共用；结构类型也便于测试用最小 mock 覆盖。 */
type SupabaseAuthClient = ReturnType<typeof createServerClient>

/**
 * 只有「连不上 Supabase Auth」才允许降级。4xx（无会话、凭证失效）必须继续按未登录处理，
 * 否则会放宽登录校验。
 */
function isAuthNetworkFailure(error: unknown) {
  if (!error || typeof error !== "object") {
    return false
  }
  const { name, status, message } = error as {
    name?: string
    status?: number
    message?: string
  }
  if (typeof status === "number" && status >= 400) {
    return false
  }
  return (
    name === "AuthRetryableFetchError" ||
    name === "AuthUnknownError" ||
    status === 0 ||
    /fetch failed|network|timeout|ECONN|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(message ?? "")
  )
}

/**
 * 判断当前服务端请求是否带有可用会话。
 *
 * 正常情况保持 getUser() 的联网严格校验，行为与原来一致。但本机 / 受限网络里 Node 的
 * fetch 可能无法连通 Supabase Auth（浏览器能登录，服务端 getUser() 却报
 * AuthRetryableFetchError: fetch failed）。此时若直接判定未登录，/workspace 会被 307
 * 弹回 /login，登录成功后的跳转就表现为「只刷新当前页面，进不去系统页面」。
 *
 * 因此仅在网络不可达时降级为读取本地 cookie 的 getSession()：它不发网络请求，能读到
 * 浏览器 signInWithPassword 刚写入的会话。会话 cookie 的存储方式、有效期与刷新逻辑
 * 都不变；凭证无效（401）或无会话（400）仍按未登录处理。
 */
export async function hasUsableSession(supabase: SupabaseAuthClient): Promise<boolean> {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (user) {
      return true
    }
    if (!isAuthNetworkFailure(error)) {
      return false
    }
  } catch (error) {
    if (!isAuthNetworkFailure(error)) {
      return false
    }
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return Boolean(session?.user)
  } catch {
    return false
  }
}
