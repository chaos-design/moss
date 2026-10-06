/**
 * Auth status is the single vocabulary the browser uses to describe whether an account exists.
 *
 * `LearningMemoryProvider` collapses every non-authenticated case into `syncStatus: "local"`,
 * which is why the header cannot tell a demo environment from a missing Supabase configuration
 * from a signed-out learner. Anything that gates a cloud request needs that distinction, so the
 * decision lives here as React-free logic and every surface reads the same words.
 */

export const authStatuses = [
  "loading",
  "authenticated",
  "anonymous",
  "unconfigured",
  "demo",
] as const

export type AuthStatus = (typeof authStatuses)[number]

export type AuthStatusInputs = {
  demoMode: boolean
  configured: boolean
}

export function resolveBaseAuthStatus({ demoMode, configured }: AuthStatusInputs): AuthStatus {
  if (demoMode) {
    return "demo"
  }
  return configured ? "loading" : "unconfigured"
}

export function isSignedIn(status: AuthStatus) {
  return status === "authenticated"
}

/**
 * Only an anonymous learner can act on the sign-in prompt. A demo or unconfigured deployment has
 * no sign-in page worth offering, so sending the learner to `/login` there would be a dead end.
 */
export function canOfferSignIn(status: AuthStatus) {
  return status === "anonymous"
}

export function getAuthStatusLabel(status: AuthStatus) {
  const labels: Record<AuthStatus, string> = {
    loading: "正在确认登录状态",
    authenticated: "已登录",
    anonymous: "未登录",
    unconfigured: "云端未配置",
    demo: "本地演示模式",
  }
  return labels[status]
}

export function getAccountFallbackLabel(status: AuthStatus) {
  const labels: Record<AuthStatus, string> = {
    loading: "学习账户",
    authenticated: "学习账户",
    anonymous: "未登录",
    unconfigured: "本机账户",
    demo: "本地演示账户",
  }
  return labels[status]
}

/**
 * Why a cloud-backed action did not reach the cloud. `action` is the learner-facing operation
 * name, so the copy stays specific instead of a generic "please log in".
 */
export function getSignInPrompt(action: string, status: AuthStatus) {
  const prompts: Record<AuthStatus, string> = {
    loading: `正在确认登录状态，${action}稍后重试。`,
    authenticated: "",
    anonymous: `${action}需要登录后才会同步到云端。`,
    unconfigured: `云端功能尚未配置，${action}目前只在本机生效。`,
    demo: `本地演示模式不会同步到云端，${action}目前只在本机生效。`,
  }
  return prompts[status]
}

/**
 * Trailing reason for a write that succeeded locally but did not reach the cloud. Local writes must
 * never be blocked by account state, so this explains the skipped sync instead of refusing the work.
 * Returns an empty string when the account state has nothing to add over the caller's own copy.
 */
export function getLocalOnlySuffix(status: AuthStatus) {
  const suffixes: Record<AuthStatus, string> = {
    loading: "",
    authenticated: "",
    anonymous: "登录后会自动同步到云端。",
    unconfigured: "云端功能尚未配置，本机保存不受影响。",
    demo: "本地演示模式不会同步到云端。",
  }
  return suffixes[status]
}

/**
 * Why memory is not reaching the cloud, expressed through the account state instead of the
 * transport state. Returns null when the account itself explains nothing new and the caller's
 * own sync label should win.
 *
 * A signed-out learner on a real deployment needs to learn that signing in is what turns local
 * memory into synced memory. A demo or unconfigured deployment cannot sign in at all, so it must
 * not imply the state is temporary.
 */
export function getSyncBlockedReason(status: AuthStatus) {
  const reasons: Record<AuthStatus, string | null> = {
    loading: null,
    authenticated: null,
    anonymous: "登录后自动跨设备同步学习记忆",
    unconfigured: "云端功能尚未配置，学习记忆仅保存在本机",
    demo: "本地演示模式，学习记忆不会同步到云端",
  }
  return reasons[status]
}

export function getAvatarLabelFromAccount(label: string) {
  const normalized = label.trim()
  if (!normalized) {
    return "M"
  }
  if (normalized.includes("@")) {
    return normalized.slice(0, 2).toUpperCase()
  }
  return normalized.slice(0, 2)
}

export function getAccountLabel(user: {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}) {
  const metadata = user.user_metadata
  const displayName = metadata?.display_name ?? metadata?.full_name ?? metadata?.name
  return typeof displayName === "string" && displayName.trim()
    ? displayName.trim()
    : user.email || "学习账户"
}
