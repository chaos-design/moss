import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import { isDemoMode } from "@/lib/runtime-mode"
import { getSupabasePublicConfig } from "@/lib/supabase/config"

function createLoginRedirect(request: NextRequest, error?: string) {
  const loginUrl = new URL("/login", request.url)
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`)
  if (error) {
    loginUrl.searchParams.set("error", error)
  }
  return NextResponse.redirect(loginUrl)
}

export async function proxy(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.next({ request })
  }

  const config = getSupabasePublicConfig()
  if (!config) {
    return createLoginRedirect(request, "configuration")
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value)
        }

        response = NextResponse.next({ request })
        for (const cookie of cookiesToSet) {
          response.cookies.set(cookie.name, cookie.value, cookie.options)
        }
      },
    },
  })
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return createLoginRedirect(request)
  }

  return response
}

export const config = {
  matcher: ["/workspace/:path*"],
}
