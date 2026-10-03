"use client"

import { ArrowRightIcon, CheckIcon, LockKeyholeIcon, RouteIcon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { PageHeading } from "@/components/page-heading"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { type SceneLevel, sceneItems } from "@/lib/demo-data"
import {
  getCurrentLearningLevel,
  getLearningLevelProgress,
  getSceneLibraryStats,
  learningLevelOrder,
  targetTurnsPerScene,
} from "@/lib/learning-progress"
import { getLearningMemoryStats } from "@/lib/memory"
import { cn } from "@/lib/utils"

const levelNames: Record<SceneLevel, string> = {
  A2: "应对日常",
  B1: "独立沟通",
  B2: "复杂协作",
  C1: "精准表达",
}
export function LearningMapWorkspace() {
  const { state } = useLearningMemory()
  const stats = useMemo(() => getLearningMemoryStats(state), [state])
  const sceneStats = useMemo(
    () => getSceneLibraryStats(sceneItems, state.sceneProgress),
    [state.sceneProgress],
  )
  const nodes = learningLevelOrder.map((level) => {
    const levelProgress = getLearningLevelProgress(sceneItems, state.sceneProgress, level)
    return {
      level,
      title: levelNames[level],
      ...levelProgress,
    }
  })
  const currentLevel = getCurrentLearningLevel(sceneItems, state.sceneProgress)
  const currentIndex = nodes.findIndex((node) => node.level === currentLevel)
  const currentNode = nodes[currentIndex]
  const completedProgress = Math.round(
    nodes.reduce((sum, node) => sum + node.progress, 0) / nodes.length,
  )
  const recentEvents = state.events.slice(0, 4)

  return (
    <div className="flex flex-col gap-7">
      <PageHeading
        eyebrow="Adaptive learning path"
        title="让下一步由真实表现决定。"
        description="路径只根据已完成的对话、跟读和复习记录更新，不使用预置成绩。"
        icon={RouteIcon}
        motif="map"
        actions={
          <Link href="/workspace/scenes" className={buttonVariants()}>
            选择练习场景
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        }
      />

      <section className="grid gap-4 border-y py-5 sm:grid-cols-3">
        <Metric label="当前阶段" value={`${currentNode.level} · ${currentNode.title}`} />
        <Metric label="已练习场景" value={String(sceneStats.practicedCount)} />
        <div>
          <p className="text-xs text-muted-foreground">路径完成度</p>
          <div className="mt-2 flex items-center gap-3">
            <Progress value={completedProgress} className="max-w-48" />
            <strong className="font-mono text-sm">{completedProgress}%</strong>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-lg border bg-card">
          <header className="px-5 py-4">
            <h2 className="text-sm font-semibold">能力路径</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              每个场景完成 {targetTurnsPerScene} 轮真实对话后计入节点进度。
            </p>
          </header>
          <div className="p-4 md:p-6">
            {nodes.map((node, index) => {
              const completed = node.progress === 100
              const current = index === currentIndex
              return (
                <div key={node.level} className="grid grid-cols-[44px_minmax(0,1fr)] gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "grid size-10 place-items-center rounded-full border-2 bg-card font-mono text-xs",
                        completed && "border-primary bg-primary text-primary-foreground",
                        current && !completed && "border-foreground",
                        !completed && !current && "border-border text-muted-foreground",
                      )}
                    >
                      {completed ? (
                        <CheckIcon aria-hidden="true" />
                      ) : current ? (
                        node.level
                      ) : (
                        <LockKeyholeIcon aria-hidden="true" />
                      )}
                    </span>
                    {index < nodes.length - 1 ? (
                      <span className="min-h-20 w-px flex-1 bg-border" />
                    ) : null}
                  </div>
                  <div className="mb-5 border-b pb-5">
                    <div className="flex items-center gap-2">
                      <h3 className="font-serif text-lg font-semibold">{node.title}</h3>
                      {current ? <Badge variant="outline">当前</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      已练习 {node.practicedScenes}/{node.sceneCount} 个场景
                    </p>
                    <Progress value={node.progress} className="mt-3" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-lg border bg-card p-5">
            <p className="font-mono text-[10px] font-semibold text-primary">CURRENT NODE</p>
            <h2 className="mt-2 font-serif text-xl font-semibold">{currentNode.title}</h2>
            <div className="mt-5 flex flex-col gap-4">
              <ProgressMetric label="节点进度" value={currentNode.progress} />
              <ProgressMetric label="表达准确度" value={stats.conversationAccuracy} />
              <ProgressMetric label="情景找回率" value={stats.recallRate} />
            </div>
          </section>
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold">最近学习记录</h2>
            {recentEvents.length > 0 ? (
              <div className="mt-4 flex flex-col gap-3">
                {recentEvents.map((event) => (
                  <div key={event.id} className="border-l-2 border-primary pl-3 text-xs">
                    <p className="font-medium">
                      {event.type === "conversation"
                        ? "完成对话"
                        : event.type === "review"
                          ? "完成复习"
                          : "完成跟读"}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {new Date(event.occurredAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                暂无记录，完成一次练习后会显示真实调整过程。
              </p>
            )}
          </section>
        </aside>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-xl font-semibold">{value}</p>
    </div>
  )
}

function ProgressMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <strong>{value}%</strong>
      </div>
      <Progress value={value} />
    </div>
  )
}
