import {
  ArrowRightIcon,
  AudioLinesIcon,
  BookOpenCheckIcon,
  CalendarSyncIcon,
  DatabaseIcon,
  LightbulbIcon,
  MessageCircleMoreIcon,
  PhoneCallIcon,
  TargetIcon,
  WaypointsIcon,
} from "lucide-react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Brand } from "@/components/brand"
import { buttonVariants } from "@/components/ui/button"
import { HomeSceneCarousel } from "@/features/home/home-scene-carousel"
import { sceneItems } from "@/lib/demo-data"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Moss 英语学习空间",
  description: "在真实场景中对话、跟读与复习，让学过的英语在需要时自然出现。",
}

const featuredSceneIds = ["coffee", "meeting", "airport"] as const
const featuredScenes = featuredSceneIds.flatMap((sceneId) => {
  const scene = sceneItems.find((item) => item.id === sceneId)
  return scene ? [scene] : []
})
const featuredSceneIdSet = new Set<string>(featuredSceneIds)
const scenePreviews = [
  ...featuredScenes,
  ...sceneItems.filter((scene) => !featuredSceneIdSet.has(scene.id)),
]

const featureHighlights = [
  {
    icon: MessageCircleMoreIcon,
    label: "Context",
    title: "场景对话",
    detail: `${sceneItems.length} 个生活与职场情境，让表达从具体任务开始。`,
  },
  {
    icon: AudioLinesIcon,
    label: "Voice",
    title: "实时语音",
    detail: "连续识别、自然播报和随时打断，保持真实交流节奏。",
  },
  {
    icon: BookOpenCheckIcon,
    label: "Memory",
    title: "长期记忆",
    detail: "保留学过的表达、出错原因和使用场景，让后续练习真正承接过去。",
  },
  {
    icon: CalendarSyncIcon,
    label: "Repetition",
    title: "间隔重复",
    detail: "根据记忆强度和每次作答表现安排复习，在快要忘记时再次找回。",
  },
  {
    icon: LightbulbIcon,
    label: "Guidance",
    title: "个性建议",
    detail: "从真实对话和跟读记录中识别薄弱点，推荐下一项最值得练习的任务。",
  },
  {
    icon: WaypointsIcon,
    label: "Transfer",
    title: "跨场景迁移",
    detail: "把学过的表达带到新情境，形成可复用的长期记忆。",
  },
] as const

export default function HomePage() {
  return (
    <main className="min-h-svh overflow-x-hidden bg-background">
      <section className="relative isolate min-h-[730px] overflow-hidden bg-[#14241f] text-white lg:min-h-[700px]">
        <Image
          src="/scenes/dining.jpg"
          alt="在咖啡店进行英语情景对话"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-30"
        />
        <div className="absolute inset-0 bg-[#14241f]/70" aria-hidden="true" />

        <header className="relative">
          <div className="mx-auto flex min-h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
            <Brand
              href="/"
              className="[&_span:first-child]:bg-white [&_span:first-child]:text-[#14241f] [&_span:last-child_span]:text-white/55"
            />
          </div>
        </header>

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pt-10 pb-7 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,0.78fr)_minmax(560px,1.22fr)] lg:items-end lg:gap-12 lg:px-8 lg:pt-20">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 font-mono text-[10px] font-semibold uppercase text-white/65">
              <span className="size-2 bg-[#e16b4f]" aria-hidden="true" />
              Memory-guided English
            </div>
            <h1 className="mt-7 font-serif text-6xl font-semibold leading-none sm:text-7xl">
              Moss
            </h1>
            <p className="mt-5 font-serif text-3xl font-semibold leading-tight sm:text-4xl">
              英语不该只停在
              <br />
              你见过的那一刻。
            </p>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/70 sm:text-base">
              说一次，记下来。换一个场景，再把它自然地说出来。
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link
                href="/workspace/conversation?scene=coffee"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "bg-[#e16b4f] text-white hover:bg-[#c95c43]",
                )}
              >
                <MessageCircleMoreIcon data-icon="inline-start" />
                开始这段对话
              </Link>
              <Link
                href="/workspace/scenes"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "border-white/35 bg-black/15 text-white hover:bg-white/10 hover:text-white",
                )}
              >
                浏览全部场景
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </div>
          </div>

          <div className="border-y border-white/25 bg-black/15">
            <div className="flex items-center justify-between gap-4 border-b border-white/15 px-4 py-3 sm:px-5">
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase text-[#f09a81]">
                <span className="size-1.5 rounded-full bg-[#f09a81]" aria-hidden="true" />
                Live scene · Coffee
              </span>
              <span className="font-mono text-[10px] text-white/45">A2 · TURN 03</span>
            </div>
            <div className="grid sm:grid-cols-[minmax(0,1.2fr)_minmax(190px,0.8fr)]">
              <div className="flex flex-col gap-4 px-4 py-5 sm:px-5">
                <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-3">
                  <span className="pt-0.5 font-mono text-[9px] uppercase text-[#9edbc5]">
                    场景
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">忙碌早晨的咖啡店</p>
                    <p className="mt-1 text-xs leading-5 text-white/55">
                      点一杯燕麦拿铁，说明带走，并确认饮品要求。
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-3 border-t border-white/10 pt-4">
                  <span className="pt-1 font-mono text-[9px] uppercase text-white/40">Mia</span>
                  <p className="font-serif text-base leading-6 text-white/75">
                    Good morning! What can I get started for you today?
                  </p>
                </div>
                <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-3">
                  <span className="pt-1 font-mono text-[9px] uppercase text-[#f09a81]">
                    You
                  </span>
                  <p className="font-serif text-lg leading-7">
                    <span className="text-[#ff9b7f]">Could I get</span> a latte{" "}
                    <span className="text-[#9edbc5]">with oat milk</span>, please?
                  </p>
                </div>
                <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-3">
                  <span className="pt-1 font-mono text-[9px] uppercase text-white/40">Mia</span>
                  <p className="font-serif text-base leading-6 text-white/75">
                    Of course. Is that for here or to go?
                  </p>
                </div>
              </div>

              <aside
                aria-label="表达焦点与 RAG 记忆"
                className="border-t border-white/15 px-4 py-5 sm:border-t-0 sm:border-l sm:px-5"
              >
                <div>
                  <p className="flex items-center gap-2 font-mono text-[9px] uppercase text-[#9edbc5]">
                    <TargetIcon className="size-3.5" aria-hidden="true" />
                    表达焦点
                  </p>
                  <p className="mt-3 font-serif text-lg text-white">Could I get ...?</p>
                  <p className="mt-2 text-xs leading-5 text-white/55">
                    用礼貌、自然的方式提出请求；补充 “to go” 可以减少下一轮确认。
                  </p>
                </div>
                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="flex items-center gap-2 font-mono text-[9px] uppercase text-[#f09a81]">
                    <DatabaseIcon className="size-3.5" aria-hidden="true" />
                    RAG 记忆
                  </p>
                  <p className="mt-3 text-xs leading-5 text-white/75">
                    “Could I get the soup to go?”
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-white/45">
                    来自「餐厅用餐」· 12 天前
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] uppercase text-white/45">
                    <span>Strength 68</span>
                    <span>Review 2d</span>
                  </div>
                </div>
              </aside>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/15 px-4 py-3 sm:px-5">
              <span className="text-[11px] leading-5 text-white/45">
                语音模式会持续监听，并支持随时打断。
              </span>
              <Link
                href="/workspace/conversation?scene=coffee"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "bg-[#e16b4f] text-white hover:bg-[#c95c43]",
                )}
              >
                <PhoneCallIcon data-icon="inline-start" />
                开始通话
              </Link>
            </div>
          </div>
        </div>

        <div className="relative mx-auto mt-7 flex max-w-7xl items-center gap-4 border-t border-white/20 px-4 py-5 sm:px-6 lg:px-8">
          <span className="font-mono text-[10px] uppercase text-white/40">Practice loop</span>
          <span className="h-px flex-1 bg-white/15" aria-hidden="true" />
          <span className="font-mono text-[10px] text-white/55">对话 → 跟读 → 复习 → 迁移</span>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid gap-5 border-b pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)] lg:items-end">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase text-primary">
              Situation carousel
            </p>
            <h2 className="mt-2 max-w-2xl font-serif text-3xl font-semibold leading-tight sm:text-4xl">
              今天，你想在哪个场景里开口？
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-muted-foreground lg:justify-self-end">
            不从课程目录开始。先选一个此刻真的可能发生的情境。
          </p>
        </div>

        <HomeSceneCarousel scenes={featuredScenes} scenePreviews={scenePreviews} />
      </section>

      <section className="border-y bg-[#20332e] text-white" aria-labelledby="features-title">
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
          <p className="font-mono text-[10px] font-semibold uppercase text-[#f09a81]">
            Built for retrieval
          </p>
          <h2 id="features-title" className="mt-2 font-serif text-3xl font-semibold">
            每次练习，都为下一次表达服务
          </h2>
        </div>
        <div className="mx-auto mt-8 grid max-w-7xl sm:grid-cols-2 lg:grid-cols-3">
          {featureHighlights.map(({ icon: Icon, label, title, detail }, index) => (
            <div
              key={label}
              className="border-t border-white/15 px-4 py-7 sm:border-r sm:px-6 sm:nth-[2n]:border-r-0 lg:px-8 lg:nth-[2n]:border-r lg:nth-[3n]:border-r-0"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-md bg-white/10">
                  <Icon className="size-4 text-[#f09a81]" aria-hidden="true" />
                </span>
                <span className="font-mono text-[9px] text-white/35">0{index + 1}</span>
              </div>
              <p className="mt-6 font-mono text-[9px] uppercase text-[#9edbc5]">{label}</p>
              <h3 className="mt-2 font-serif text-xl font-semibold">{title}</h3>
              <p className="mt-3 text-xs leading-5 text-white/60">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-7 text-xs text-muted-foreground sm:px-6 lg:px-8">
        <span>Moss Language Lab</span>
        <span className="flex items-center gap-2">
          <AudioLinesIcon className="size-3.5 text-primary" aria-hidden="true" />
          对话 · 跟读 · 复习
        </span>
      </footer>
    </main>
  )
}
