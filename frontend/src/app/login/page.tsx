import { AudioLinesIcon, CheckIcon, MessageCircleMoreIcon, RotateCcwIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Brand } from "@/components/brand"
import { LoginForm } from "@/features/auth/login-form"
import { isDemoMode } from "@/lib/runtime-mode"
import { getSafeRedirectPath } from "@/lib/safe-redirect"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { hasUsableSession } from "@/lib/supabase/session"

export const metadata: Metadata = {
  title: "登录",
  description: "登录 Moss AI 语言学习空间。",
}

const methodSteps = [
  { icon: MessageCircleMoreIcon, label: "在情景中表达", detail: "AI CONVERSATION" },
  { icon: AudioLinesIcon, label: "听见并模仿", detail: "SHADOWING" },
  { icon: RotateCcwIcon, label: "在未来找回", detail: "SMART RECALL" },
]

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[]
    next?: string | string[]
  }>
}) {
  const resolvedSearchParams = await searchParams
  const requestedPath = Array.isArray(resolvedSearchParams.next)
    ? resolvedSearchParams.next[0]
    : resolvedSearchParams.next
  const nextPath = getSafeRedirectPath(requestedPath ?? null)
  const requestedError = Array.isArray(resolvedSearchParams.error)
    ? resolvedSearchParams.error[0]
    : resolvedSearchParams.error
  const initialError =
    requestedError === "callback" || requestedError === "configuration"
      ? requestedError
      : undefined
  const demoMode = isDemoMode()

  // 恢复「已经登录成功、却还停在登录页」的状态：signInWithPassword 会先建立会话，
  // 跳转失败后，内置浏览器里的账号密码仍然是预填的，会话也仍然有效。这里在服务端
  // 直接把该会话送回目标页，既不需要清空凭证，也不需要用户重新输入或再次提交。
  // 放在服务端还意味着即使内置浏览器仍持有旧的客户端 bundle，重定向依然生效。
  // 带明确错误信息（如 OAuth 回调失败）时保留登录页，避免吞掉错误提示。
  if (!demoMode && !initialError) {
    // getSupabaseServerClient() 里的 cookies() 会把本路由标记为动态渲染，不能包进 try/catch。
    // 与 proxy 共用同一套会话判定，避免两处结论不一致造成 /login <-> /workspace 来回重定向。
    const supabase = await getSupabaseServerClient()
    if (supabase && (await hasUsableSession(supabase))) {
      redirect(nextPath)
    }
  }

  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.15fr)_minmax(440px,0.85fr)]">
      <section className="relative hidden overflow-hidden border-r bg-[#202a27] p-10 text-[#f6f1e7] lg:flex lg:flex-col">
        <Brand
          href="/"
          className="relative z-10 [&_span:first-child]:bg-[#f6f1e7] [&_span:first-child]:text-[#202a27] [&_span:last-child_span]:text-[#b6c1ba]"
        />

        <div className="my-auto max-w-2xl">
          <p className="font-mono text-[11px] font-semibold uppercase text-[#e16b4f]">
            Context becomes memory
          </p>
          <h1 className="mt-5 max-w-xl font-serif text-5xl font-semibold leading-[1.16]">
            不是背下句子，
            <br />
            是在需要时说出来。
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-[#b6c1ba]">
            Moss 把 AI
            对话、影子跟读和间隔复习串成一条连续路径，让每次练习都成为下一次表达的线索。
          </p>

          <div className="mt-12 grid max-w-xl grid-cols-[40px_1fr] gap-x-4">
            {methodSteps.map(({ icon: Icon, label, detail }, index) => (
              <div key={label} className="contents">
                <div className="relative flex justify-center">
                  <span className="relative z-10 grid size-10 place-items-center rounded-full border border-[#60736a] bg-[#202a27]">
                    {index === methodSteps.length - 1 ? (
                      <CheckIcon className="size-4 text-[#e16b4f]" aria-hidden="true" />
                    ) : (
                      <Icon className="size-4 text-[#f6f1e7]" aria-hidden="true" />
                    )}
                  </span>
                  {index < methodSteps.length - 1 ? (
                    <span className="absolute top-10 bottom-[-20px] w-px bg-[#60736a]" />
                  ) : null}
                </div>
                <div className="pb-8">
                  <p className="pt-0.5 text-sm font-medium">{label}</p>
                  <p className="mt-1 font-mono text-[10px] text-[#82928a]">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#3a4842] pt-5 font-mono text-[10px] text-[#82928a]">
          <span>BILINGUAL · PERSONAL · CONTINUOUS</span>
          <span>CEFR A1—C1</span>
        </div>
      </section>

      <section className="flex min-h-svh flex-col px-5 py-5 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between lg:justify-end">
          <Brand href="/" className="lg:hidden" />
          {demoMode ? (
            <Link
              href="/workspace"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              进入演示
            </Link>
          ) : null}
        </div>
        <div className="my-auto w-full max-w-md self-center py-10">
          <LoginForm initialError={initialError} nextPath={nextPath} />
        </div>
        <div className="flex flex-col items-center gap-3">
          <nav
            aria-label="法律文档"
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground"
          >
            <Link
              href="/terms"
              className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              服务条款
            </Link>
            <Link
              href="/privacy"
              className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              隐私政策
            </Link>
          </nav>
          <p className="text-center font-mono text-[10px] text-muted-foreground">
            PRIVATE LEARNING DATA · SUPABASE AUTH
          </p>
        </div>
      </section>
    </main>
  )
}
