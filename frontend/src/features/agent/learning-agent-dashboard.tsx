"use client"

import {
  ArrowRightIcon,
  AudioLinesIcon,
  BrainCircuitIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleGaugeIcon,
  Clock3Icon,
  CompassIcon,
  MessageCircleMoreIcon,
  RotateCcwIcon,
  RouteIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { PageHeading } from "@/components/page-heading"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { sceneItems } from "@/lib/demo-data"
import {
  createLearningPlan,
  createMemoryTargetHref,
  getLearningMemoryStats,
  type LearningPlanStep,
} from "@/lib/memory"
import { cn } from "@/lib/utils"

const stepIcons = {
  recall: RotateCcwIcon,
  conversation: MessageCircleMoreIcon,
  shadowing: AudioLinesIcon,
} satisfies Record<LearningPlanStep["id"], typeof RotateCcwIcon>

const eventLabels = {
  conversation: "AI 对话",
  review: "智能复习",
  shadowing: "影子跟读",
} as const

function getMemoryStatus(strength: number) {
  if (strength >= 75) {
    return "稳定"
  }
  if (strength >= 55) {
    return "巩固中"
  }
  return "需要找回"
}

export function LearningAgentDashboard() {
  const { state } = useLearningMemory()
  const plan = useMemo(() => createLearningPlan(state), [state])
  const stats = useMemo(() => getLearningMemoryStats(state), [state])
  const priorityMemories = useMemo(
    () => [...state.items].sort((left, right) => left.strength - right.strength).slice(0, 5),
    [state.items],
  )
  const recentScenes = useMemo(() => {
    const sceneById = new Map(sceneItems.map((scene) => [scene.id, scene]))
    return Object.values(state.sceneProgress)
      .sort(
        (left, right) =>
          new Date(right.lastPracticedAt).getTime() - new Date(left.lastPracticedAt).getTime(),
      )
      .map((progress) => ({ progress, scene: sceneById.get(progress.sceneId) }))
      .filter((entry) => entry.scene !== undefined)
      .slice(0, 4)
  }, [state.sceneProgress])
  const eventCounts = useMemo(
    () =>
      (["conversation", "review", "shadowing"] as const).map((type) => ({
        type,
        count: state.events.filter((event) => event.type === type).length,
      })),
    [state.events],
  )

  if (!plan) {
    return (
      <div className="flex flex-col gap-7">
        <PageHeading
          eyebrow="Memory-guided learning"
          title="从一次真实对话开始。"
          description="完成对话后，Moss 会根据你的表达、纠错和复习结果生成学习记忆与下一步计划。"
          icon={BrainCircuitIcon}
          motif="dashboard"
          actions={
            <Link href="/workspace/scenes" className={buttonVariants({ size: "lg" })}>
              <MessageCircleMoreIcon data-icon="inline-start" />
              选择对话场景
            </Link>
          }
        />
        <section className="grid min-h-80 place-items-center border-y px-5 py-12 text-center">
          <div className="max-w-lg">
            <BrainCircuitIcon className="mx-auto size-9 text-primary" aria-hidden="true" />
            <h2 className="mt-4 font-serif text-xl font-semibold">还没有学习记录</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              这里不会展示预置成绩。完成首轮真实对话后，记忆强度、待复习内容和迁移建议会自动出现。
            </p>
          </div>
        </section>
      </div>
    )
  }

  const totalMinutes = plan.steps.reduce((sum, step) => sum + step.durationMinutes, 0)

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        eyebrow="Memory-guided learning"
        title="今天，把学过的表达用出来。"
        description={`Moss 根据你的 ${stats.memoryCount} 条学习记忆，集中处理正在变弱且适合迁移的内容。`}
        icon={BrainCircuitIcon}
        motif="dashboard"
        actions={
          <Link href={plan.steps[0].href} className={buttonVariants({ size: "lg" })}>
            <SparklesIcon data-icon="inline-start" />
            开始今日计划
          </Link>
        }
      />

      <section aria-label="学习记忆概览" className="grid grid-cols-2 border-y sm:grid-cols-4">
        <AgentStat
          label="已建立记忆"
          value={String(stats.memoryCount)}
          detail="表达与发音线索"
        />
        <AgentStat label="现在待找回" value={String(stats.dueCount)} detail="按记忆强度排序" />
        <AgentStat
          label="对话准确度"
          value={`${stats.conversationAccuracy}%`}
          detail="来自实际对话回合"
        />
        <AgentStat label="累计找回率" value={`${stats.recallRate}%`} detail="随每次练习更新" />
      </section>

      <div className="columns-1 gap-4 lg:columns-2 2xl:columns-3">
        <section className="relative mb-4 break-inside-avoid overflow-hidden rounded-lg border border-primary/30 bg-accent/25 shadow-sm">
          <div className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
          <div className="p-5 pl-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 text-primary">
                <span className="grid size-8 place-items-center rounded-md border border-primary/25 bg-background">
                  <SparklesIcon className="size-4" aria-hidden="true" />
                </span>
                <p className="font-mono text-[10px] font-semibold uppercase">Moss 的今日建议</p>
              </div>
              <Badge variant="outline">{totalMinutes} 分钟</Badge>
            </div>
            <h2 className="mt-4 font-serif text-xl font-semibold leading-8">{plan.headline}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{plan.reason}</p>
            <div className="mt-5 border-t border-primary/20 pt-4">
              <p className="text-xs text-muted-foreground">本轮成功标准</p>
              <p className="mt-1 text-sm leading-6">{plan.target}</p>
            </div>
            <Link
              href={plan.steps[0].href}
              className={cn(buttonVariants({ size: "sm" }), "mt-5")}
            >
              开始第一步
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </div>
        </section>

        <DashboardPanel
          eyebrow="Adaptive session"
          title="今天怎么学"
          icon={CircleGaugeIcon}
          action={<Badge variant="outline">{totalMinutes} 分钟</Badge>}
        >
          {plan.steps.map((step, index) => {
            const Icon = stepIcons[step.id]
            return (
              <Link
                key={step.id}
                href={step.href}
                className="group grid min-h-24 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-t px-4 py-3 transition-colors first:border-t-0 hover:bg-secondary/55"
              >
                <span className="grid size-9 place-items-center rounded-md bg-secondary text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      0{index + 1}
                    </span>
                    <span className="text-sm font-semibold">{step.title}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {step.description}
                  </span>
                </span>
                <span className="text-right text-[11px] text-muted-foreground">
                  {step.durationMinutes} 分钟
                </span>
              </Link>
            )
          })}
        </DashboardPanel>

        <DashboardPanel
          eyebrow="Active memory"
          title="优先处理的记忆"
          icon={BrainCircuitIcon}
          action={
            <Link
              href="/workspace/notebook"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              查看全部
            </Link>
          }
        >
          {priorityMemories.map((item) => (
            <Link
              key={item.id}
              href={
                item.kind === "pronunciation"
                  ? createMemoryTargetHref("/workspace/shadowing", item.id)
                  : createMemoryTargetHref("/workspace/review", item.id)
              }
              className="group block border-t px-4 py-3 transition-colors first:border-t-0 hover:bg-secondary/55"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {item.answer}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-medium",
                    item.strength < 55 ? "text-primary" : "text-[var(--success)]",
                  )}
                >
                  {getMemoryStatus(item.strength)}
                </span>
              </span>
              <Progress value={item.strength} className="mt-3" />
              <span className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>来自 {item.sourceSceneTitle}</span>
                <span>{item.strength}%</span>
              </span>
            </Link>
          ))}
        </DashboardPanel>

        <DashboardPanel
          eyebrow="Continue"
          title="最近练过的场景"
          icon={CompassIcon}
          action={
            <Link
              href="/workspace/scenes"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {sceneItems.length} 个场景
            </Link>
          }
        >
          {recentScenes.length > 0 ? (
            recentScenes.map(({ progress, scene }) => (
              <Link
                key={progress.sceneId}
                href={`/workspace/conversation?scene=${encodeURIComponent(progress.sceneId)}`}
                className="group flex items-center gap-3 border-t px-4 py-3 transition-colors first:border-t-0 hover:bg-secondary/55"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary font-mono text-[10px] text-primary">
                  {scene?.level}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {progress.sceneTitle}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {progress.turns} 轮 · 准确 {progress.accurateTurns} 轮
                  </span>
                </span>
                <ArrowRightIcon
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            ))
          ) : (
            <p className="px-4 pb-4 text-xs leading-5 text-muted-foreground">
              完成场景练习后，最近进度会集中显示在这里。
            </p>
          )}
        </DashboardPanel>

        <DashboardPanel
          eyebrow="Practice signals"
          title="练习构成"
          icon={CalendarClockIcon}
          action={<Badge variant="secondary">{state.events.length} 次</Badge>}
        >
          <div className="grid grid-cols-3 border-t">
            {eventCounts.map((event) => (
              <div key={event.type} className="border-r px-3 py-4 text-center last:border-r-0">
                <p className="font-serif text-xl font-semibold">{event.count}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {eventLabels[event.type]}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 border-t px-4 py-3 text-xs leading-5 text-muted-foreground">
            <Clock3Icon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>每次对话、找回与跟读都会重新计算下一步优先级。</span>
          </div>
        </DashboardPanel>

        <DashboardPanel eyebrow="Transfer route" title="下一批迁移目标" icon={RouteIcon}>
          <div className="flex flex-col">
            {plan.focus.transferTargets.map((target, index) => (
              <Link
                key={target.sceneId}
                href={createMemoryTargetHref(
                  `/workspace/conversation?scene=${encodeURIComponent(target.sceneId)}`,
                  plan.focus.id,
                )}
                className="group flex items-start gap-3 border-t px-4 py-3 transition-colors first:border-t-0 hover:bg-secondary/55"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary font-mono text-[10px]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold">{target.sceneTitle}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {target.reason}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel eyebrow="Learning intent" title="当前学习策略" icon={TargetIcon}>
          <div className="flex flex-col gap-4 border-t px-4 py-4">
            <div>
              <p className="text-[10px] text-muted-foreground">学习目标</p>
              <p className="mt-1 text-sm leading-6">{state.profile.goal}</p>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border">
              <div className="bg-background p-3">
                <p className="text-[10px] text-muted-foreground">每日节奏</p>
                <p className="mt-1 text-sm font-semibold">{state.profile.dailyMinutes} 分钟</p>
              </div>
              <div className="bg-background p-3">
                <p className="text-[10px] text-muted-foreground">优先语境</p>
                <p className="mt-1 truncate text-sm font-semibold">
                  {state.profile.preferredContext}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <CheckCircle2Icon
                className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]"
                aria-hidden="true"
              />
              <span>
                {state.profile.autoRecall
                  ? "已开启自动情景找回，旧表达会在合适节点重新出现。"
                  : "当前由你手动选择需要找回的表达。"}
              </span>
            </div>
          </div>
        </DashboardPanel>
      </div>
    </div>
  )
}

function DashboardPanel({
  action,
  children,
  eyebrow,
  icon: Icon,
  title,
}: {
  action?: React.ReactNode
  children: React.ReactNode
  eyebrow: string
  icon: typeof BrainCircuitIcon
  title: string
}) {
  return (
    <section className="mb-4 break-inside-avoid overflow-hidden rounded-lg border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase text-primary">
            <Icon className="size-3.5" aria-hidden="true" />
            {eyebrow}
          </p>
          <h2 className="mt-1 font-serif text-lg font-semibold">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  )
}

function AgentStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 border-r px-3 py-3 last:border-r-0 sm:px-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
    </div>
  )
}
