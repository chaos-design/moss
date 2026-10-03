import { createBrowserClient } from "@supabase/ssr"
import { getSupabasePublicConfig } from "@/lib/supabase/config"

let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowserClient() {
  const config = getSupabasePublicConfig()
  if (!config) {
    return null
  }

  if (!browserClient) {
    browserClient = createBrowserClient(config.url, config.publishableKey)
  }

  return browserClient
}
