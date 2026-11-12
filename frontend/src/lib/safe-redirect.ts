const fallbackPath = "/workspace"
const validationOrigin = "https://moss.local"

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

export function getSafeRedirectPath(value: string | null) {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    hasControlCharacter(value)
  ) {
    return fallbackPath
  }

  try {
    const target = new URL(value, validationOrigin)
    // 登录页不能作为「登录后目标页」：跳回 /login 视觉上等同于没有跳转，正是
    // 「提示登录成功却停在登录页」的一种成因。统一兜底到工作区首页。
    if (
      target.origin !== validationOrigin ||
      target.pathname === "/login" ||
      target.pathname.startsWith("/login/")
    ) {
      return fallbackPath
    }

    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return fallbackPath
  }
}
