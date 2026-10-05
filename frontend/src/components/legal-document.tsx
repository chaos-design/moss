import Link from "next/link"
import { Brand } from "@/components/brand"
import { cn } from "@/lib/utils"

/**
 * 服务条款与隐私政策共用的排版框架。
 *
 * 两个文档共享同一视觉骨架：站点标识、返回入口、单一阅读列与交叉链接。
 * 新增章节时只在页面内组合 LegalSection，不在组件里复制文档内容。
 */
export function LegalDocument({
  eyebrow,
  title,
  updated,
  summary,
  children,
}: {
  eyebrow: string
  title: string
  updated: string
  summary: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Brand href="/" />
          <Link
            href="/login"
            className="shrink-0 rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            返回登录
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8">
        <p className="font-mono text-[10px] font-semibold uppercase text-primary">{eyebrow}</p>
        <h1 className="mt-3 font-serif text-3xl font-semibold">{title}</h1>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">{updated}</p>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">{summary}</p>

        <div className="mt-10 flex flex-col gap-10">{children}</div>
      </main>

      <footer className="border-t bg-background">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <nav
            aria-label="法律文档"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground"
          >
            <LegalFooterLink href="/terms">服务条款</LegalFooterLink>
            <LegalFooterLink href="/privacy">隐私政策</LegalFooterLink>
          </nav>
          <p className="font-mono text-[10px] text-muted-foreground">
            APACHE-2.0 · SELF-HOSTABLE
          </p>
        </div>
      </footer>
    </div>
  )
}

export function LegalSection({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h2 className="font-serif text-lg font-semibold">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-7 text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  )
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

/** 统一的法律页互链，避免在页面里重复裸文本路径。 */
export function LegalCrossLink({
  href,
  children,
}: {
  href: "/terms" | "/privacy"
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="font-medium text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  )
}

function LegalFooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  )
}
