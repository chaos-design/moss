import { NextResponse } from "next/server"
import { getSafeRedirectPath } from "@/lib/safe-redirect"
import { getSupabaseServerClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const safeNext = getSafeRedirectPath(requestUrl.searchParams.get("next"))
  const supabase = await getSupabaseServerClient()

  if (!code || !supabase) {
    return NextResponse.redirect(new URL("/login?error=callback", requestUrl.origin))
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL("/login?error=callback", requestUrl.origin))
  }

  return NextResponse.redirect(new URL(safeNext, requestUrl.origin))
}
