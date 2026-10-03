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
    if (target.origin !== validationOrigin) {
      return fallbackPath
    }

    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return fallbackPath
  }
}
