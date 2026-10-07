"use client"

import {
  ArrowRightIcon,
  CircleAlertIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isDemoMode } from "@/lib/runtime-mode"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { getSupabasePublicConfig } from "@/lib/supabase/config"

type AuthMode = "login" | "register"

export function getAuthErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "登录请求失败，请检查网络后重试"
  }
  const candidate = error as { code?: unknown; message?: unknown }
  switch (candidate.code) {
    case "invalid_credentials":
      return "邮箱或密码不正确"
    case "email_not_confirmed":
      return "请先完成邮箱验证后再登录"
    case "user_already_exists":
    case "user_already_registered":
      return "该邮箱已注册，请直接登录"
    case "over_email_send_rate_limit":
      return "验证邮件发送过于频繁，请稍后重试"
    default:
      return typeof candidate.message === "string" && candidate.message
        ? candidate.message
        : "登录请求失败，请检查网络后重试"
  }
}

export function LoginForm({
  initialError,
  nextPath,
}: {
  initialError?: "callback" | "configuration"
  nextPath: string
}) {
  const router = useRouter()
  const googleAuthEnabled = getSupabasePublicConfig()?.googleAuthEnabled ?? false
  const [mode, setMode] = useState<AuthMode>("login")
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "")
    const password = String(formData.get("password") ?? "")
    const supabase = getSupabaseBrowserClient()

    setPending(true)

    if (!supabase) {
      if (!isDemoMode()) {
        setPending(false)
        toast.error("Supabase 尚未配置，无法登录")
        return
      }

      window.setTimeout(() => {
        toast.success("已进入本地演示工作区")
        router.replace(nextPath)
      }, 450)
      return
    }

    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin)
      callbackUrl.searchParams.set("next", nextPath)
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: callbackUrl.toString() },
            })

      if (result.error) {
        toast.error(getAuthErrorMessage(result.error))
        return
      }
      if (!result.data.session) {
        toast.success(
          mode === "register"
            ? "验证邮件已发送，请完成邮箱验证"
            : "登录尚未建立会话，请确认邮箱后重试",
        )
        return
      }

      toast.success(mode === "login" ? "登录成功，正在进入学习空间" : "账户已创建")
      router.replace(nextPath)
      router.refresh()
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function handleGoogleLogin() {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      toast.warning(isDemoMode() ? "演示环境未连接第三方登录" : "Supabase 尚未配置")
      return
    }

    setPending(true)
    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin)
      callbackUrl.searchParams.set("next", nextPath)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl.toString() },
      })
      if (error) {
        toast.error(getAuthErrorMessage(error))
      }
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="w-full">
      <Tabs value={mode} onValueChange={(value) => setMode(value as AuthMode)}>
        <TabsList variant="line" className="mb-7 w-full justify-start gap-5">
          <TabsTrigger value="login" className="flex-none px-0">
            登录
          </TabsTrigger>
          <TabsTrigger value="register" className="flex-none px-0">
            创建账户
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-7">
        <h1 className="font-serif text-3xl font-semibold">
          {mode === "login" ? "继续你的学习。" : "建立你的学习档案。"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {mode === "login"
            ? "对话上下文、复习计划和学习地图会从上次的位置继续。"
            : "注册后可在多设备间同步学习进度与问题记录。"}
        </p>
      </div>

      {initialError ? (
        <Alert variant="destructive" className="mb-5">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>
            {initialError === "configuration" ? "认证未配置" : "登录回调失败"}
          </AlertTitle>
          <AlertDescription>
            {initialError === "configuration"
              ? "请检查 Supabase URL 与 publishable key 后重试。"
              : "登录链接无效或已过期，请重新登录。"}
          </AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">邮箱</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">密码</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="至少 8 位字符"
                minLength={8}
                required
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  size="icon-xs"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {mode === "register" ? (
              <FieldDescription>密码仅用于 Supabase 身份认证。</FieldDescription>
            ) : null}
          </Field>
          <div className="flex items-start gap-2.5 text-xs leading-5 text-muted-foreground">
            <Checkbox
              id="agree-terms"
              className="mt-0.5"
              checked={agreedToTerms}
              onCheckedChange={(checked) => setAgreedToTerms(checked)}
            />
            <span>
              {/* Base UI derives the checkbox name from this label; the full sentence keeps the
              accessible name complete while the legal links stay outside the clickable label. */}
              <label
                htmlFor="agree-terms"
                aria-label="同意服务条款与隐私政策"
                className="cursor-pointer select-none"
              >
                我已阅读并同意
              </label>
              <Link
                href="/terms"
                className="mx-1 rounded-sm font-medium text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                服务条款
              </Link>
              与
              <Link
                href="/privacy"
                className="mx-1 rounded-sm font-medium text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                隐私政策
              </Link>
              。
            </span>
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={pending || !agreedToTerms}
            className="mt-1 w-full"
          >
            {pending ? (
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
            ) : null}
            {mode === "login" ? "进入学习空间" : "创建账户"}
            {!pending ? <ArrowRightIcon data-icon="inline-end" /> : null}
          </Button>
          {googleAuthEnabled ? (
            <>
              <FieldSeparator>或者</FieldSeparator>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={pending || !agreedToTerms}
                onClick={handleGoogleLogin}
              >
                <span data-icon="inline-start" className="font-mono font-semibold">
                  G
                </span>
                使用 Google 继续
              </Button>
            </>
          ) : null}
        </FieldGroup>
      </form>

      <p className="mt-6 text-xs leading-5 text-muted-foreground">
        登录与注册都需要先勾选同意条款。本地演示模式需要由项目配置显式启用。
      </p>
    </div>
  )
}
