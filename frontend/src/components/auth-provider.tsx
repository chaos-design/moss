"use client"

import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js"
import { usePathname, useRouter } from "next/navigation"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { toast } from "sonner"
import {
  type AuthStatus,
  canOfferSignIn,
  getAccountFallbackLabel,
  getAccountLabel,
  getSignInPrompt,
  isSignedIn,
  resolveBaseAuthStatus,
} from "@/lib/auth-status"
import { isDemoMode } from "@/lib/runtime-mode"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { getSupabasePublicConfig } from "@/lib/supabase/config"

type AuthContextValue = {
  status: AuthStatus
  user: User | null
  accountLabel: string
  /**
   * Gate for any request that needs a cloud account. Returns true when the request may proceed;
   * otherwise it has already told the learner why through a toast and offered sign-in.
   */
  requireSignIn: (action: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const baseStatus = useMemo(
    () =>
      resolveBaseAuthStatus({
        demoMode: isDemoMode(),
        configured: Boolean(getSupabasePublicConfig()),
      }),
    [],
  )
  const [sessionUser, setSessionUser] = useState<User | null>(null)
  const [resolved, setResolved] = useState(baseStatus !== "loading")

  useEffect(() => {
    if (baseStatus !== "loading") {
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setResolved(true)
      return
    }

    let active = true
    void supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      if (!active) {
        return
      }
      setSessionUser(data.user)
      setResolved(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (active) {
        setSessionUser(session?.user ?? null)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [baseStatus])

  const status: AuthStatus =
    baseStatus !== "loading"
      ? baseStatus
      : resolved
        ? sessionUser
          ? "authenticated"
          : "anonymous"
        : "loading"

  const accountLabel = useMemo(
    () =>
      sessionUser
        ? getAccountLabel({
            email: sessionUser.email,
            user_metadata: sessionUser.user_metadata as Record<string, unknown> | null,
          })
        : getAccountFallbackLabel(status),
    [sessionUser, status],
  )

  const requireSignIn = useCallback(
    (action: string) => {
      if (isSignedIn(status)) {
        return true
      }

      // An unresolved session is not a sign-in problem, so it must not offer a sign-in prompt.
      if (!canOfferSignIn(status)) {
        toast.info(getSignInPrompt(action, status))
        return false
      }

      const target = new URL("/login", window.location.origin)
      target.searchParams.set("next", pathname || "/workspace")
      toast.warning(getSignInPrompt(action, status), {
        action: {
          label: "去登录",
          onClick: () => router.push(target.pathname + target.search),
        },
      })
      return false
    },
    [pathname, router, status],
  )

  const value = useMemo(
    () => ({ status, user: sessionUser, accountLabel, requireSignIn }),
    [status, sessionUser, accountLabel, requireSignIn],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
