import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { getSupabasePublicConfig } from "@/lib/supabase/config"

export async function getSupabaseServerClient() {
  const config = getSupabasePublicConfig()
  if (!config) {
    return null
  }

  const cookieStore = await cookies()

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options)
          }
        } catch {
          // Server Components cannot write cookies. Route handlers refresh sessions.
        }
      },
    },
  })
}

export function getSupabaseAdminClient() {
  const config = getSupabasePublicConfig()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!config || !serviceRoleKey) {
    return null
  }

  return createClient(config.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}
