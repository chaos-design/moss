"use client"

import { BookOpenIcon, ChevronDownIcon, LightbulbIcon, SparklesIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { type ExpressionStudyMode, expressionStudyModeLabels } from "@/lib/expression-study"

type GuideTarget = { kind: "mode"; mode: ExpressionStudyMode } | { kind: "ebbinghaus" }

const modeIntro: Record<
  ExpressionStudyMode,
  { headline: string; steps: string[]; tip: string }
> = {
  flashcard: {
    headline: "看表达，先在脑子里回忆，再核对",
    steps: [
      "先看英文表达，自己回想它的含义和使用场景。",
      "想好了再点「揭示答案」，查看含义、语义推导和例句。",
      "诚实自评：「掌握了」以后会更久才复习；「再练一次」会安排得更近。",
    ],
    tip: "不要一看到表达就立刻揭答案——先努力回想，这一步才是真正记住它的关键。",
  },
  cloze: {
    headline: "看例句语境，把挖空的表达填回去",
    steps: [
      "读例句，根据语境在空格里填入目标表达。",
      "点「检查答案」，系统按词干比对，大小写、复数、时态都算对。",
      "填错会显示正确答案，再决定「掌握了」还是「再练一次」。",
    ],
    tip: "填空考的是「能不能在用的时候想起来」，比单纯看懂含义更接近真实使用。",
  },
  dictation: {
    headline: "听例句发音，再复述录音比对",
    steps: [
      "点「听例句」听英文发音，注意目标表达的读音和节奏。",
      "点「开始录音」复述，说完点「停止并识别」。",
      "系统把识别结果和目标表达做容错比对，显示相似度。",
    ],
    tip: "浏览器不支持录音或你不想开口时，随时切到闪卡或填空，效果一样算数。",
  },
}

const ratings = [
  { label: "忘记了", meaning: "完全没想起来", effect: "10 分钟后再来" },
  { label: "有点难", meaning: "想了很久才想起", effect: "缩短间隔" },
  { label: "记得", meaning: "顺利想起来了", effect: "正常间隔" },
  { label: "很轻松", meaning: "不假思索", effect: "延长间隔" },
]

/**
 * 学习页内的「怎么学」引导：把当前玩法的步骤、四档评分的含义、以及学完之后的数据去向
 * 一次讲清楚，默认展开（用户不必去找隐藏的说明书），但可一键折叠给熟练用户让出空间。
 */
export function ExpressionStudyGuide({ target }: { target: GuideTarget }) {
  // 服务端与首屏统一默认展开（避免 hydration 不一致），窄屏在挂载后再自动收起让出空间。
  const [expanded, setExpanded] = useState(true)
  const userToggled = useRef(false)
  useEffect(() => {
    if (userToggled.current) {
      return
    }
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 640px)").matches
    ) {
      setExpanded(false)
    }
  }, [])
  const isEbbinghaus = target.kind === "ebbinghaus"
  const intro = target.kind === "mode" ? modeIntro[target.mode] : null
  const title = isEbbinghaus
    ? "艾宾浩斯记忆循环怎么走"
    : `${expressionStudyModeLabels[target.mode]}怎么玩`

  return (
    <section className="rounded-lg border bg-card" aria-label="学习规则说明">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={expanded}
        onClick={() => {
          userToggled.current = true
          setExpanded((current) => !current)
        }}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <BookOpenIcon className="size-4 text-primary" aria-hidden="true" />
          {title}
          <span className="text-xs font-normal text-muted-foreground">
            {expanded ? "· 看完点这里收起" : "· 第一次学？点开看玩法"}
          </span>
        </span>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {expanded ? (
        <div className="grid gap-4 border-t px-4 py-4 text-sm md:grid-cols-2">
          <div className="grid gap-3">
            {isEbbinghaus ? (
              <>
                <p className="font-medium">按三轮走完一条完整记忆链：</p>
                <ol className="list-inside list-decimal space-y-1.5 text-muted-foreground">
                  <li>学习：先学还没记住的表达，揭示并确认含义后进入下一步。</li>
                  <li>复习：用中文含义回想表达，按找回难度打四档分。</li>
                  <li>再记忆：打分「忘记了 / 有点难」的表达会当场再看一遍，并重新安排复习。</li>
                </ol>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <LightbulbIcon
                    className="mt-0.5 size-3.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  刚学的条目是「即时召回」，真正的间隔复习由复习页在到期后承接。
                </p>
              </>
            ) : intro ? (
              <>
                <p className="font-medium">{intro.headline}</p>
                <ol className="list-inside list-decimal space-y-1.5 text-muted-foreground">
                  {intro.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <LightbulbIcon
                    className="mt-0.5 size-3.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {intro.tip}
                </p>
              </>
            ) : null}
          </div>

          <div className="grid content-start gap-3">
            <p className="flex items-center gap-1.5 font-medium">
              <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
              四档评分决定下次什么时候复习
            </p>
            <div className="overflow-hidden rounded-md border text-xs">
              {ratings.map((rating) => (
                <div
                  key={rating.label}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b px-2.5 py-1.5 last:border-b-0"
                >
                  <span className="font-medium">{rating.label}</span>
                  <span className="text-muted-foreground">{rating.meaning}</span>
                  <span className="text-right text-primary">{rating.effect}</span>
                </div>
              ))}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              学完的表达会写入长期记忆；到点后到「智能复习」页按真实间隔找回。
              强度只由你的自评改变，反复点开不会重复计入。
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
