export type SupabasePublicConfig = {
  url: string
  publishableKey: string
  googleAuthEnabled: boolean
}

function normalizeEnvironmentValue(value: string | undefined) {
  const normalized = value?.trim()
  return normalized || null
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = normalizeEnvironmentValue(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const publishableKey =
    normalizeEnvironmentValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    normalizeEnvironmentValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  if (!url || !publishableKey) {
    return null
  }

  return {
    url,
    publishableKey,
    googleAuthEnabled: process.env.NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED === "true",
  }
}
