"use client"

import { BookOpenIcon, LightbulbIcon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
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
  translate: {
    headline: "读英文例句，回忆中文意思",
    steps: [
      "阅读英文例句，在脑子里回忆它的中文意思。",
      "想好了再点「揭示翻译」，查看译文。",
      "诚实自评：掌握了以后会更久才复习。",
    ],
    tip: "例句的译文是它在上下文中的意象——先想意象再揭示更有效。",
  },
  sentence: {
    headline: "用表达造一句话，对照标准例句核对",
    steps: [
      "先看目标表达与中文含义，例句留到提交后对照。",
      "在输入框里用它造一句自己的句子，回车提交。",
      "对照标准例句核对，句尾可展开译文，再自评是否掌握。",
    ],
    tip: "把表达变成句子是它最快的落地方式——试着只用这个表达说一件事。",
  },
  quick: {
    headline: "快速浏览表达与例句，每条记为学习",
    steps: [
      "快速模式下看表达、例句与含义，句尾可展开中文译文。",
      "点「下一条」或按空格/回车推进，每条会写入长期记忆，统计为「再练」。",
    ],
    tip: "快速模式的重点是观看与推进的流畅度，刷完后到复习页继续。",
  },
}

const ratings = [
  { label: "忘记了", meaning: "完全没想起来", effect: "10 分钟后再来" },
  { label: "有点难", meaning: "想了很久才想起", effect: "缩短间隔" },
  { label: "记得", meaning: "顺利想起来了", effect: "正常间隔" },
  { label: "很轻松", meaning: "不假思索", effect: "延长间隔" },
]

/**
 * 学习卡内的「怎么学」按需提示：一个紧凑按钮，点击后弹出当前玩法的步骤、四档评分含义
 * 和学完之后的数据去向。默认收起，不占常驻空间；用 Popover 浮层，展开也不挤压学习卡片。
 */
export function ExpressionStudyGuide({ target }: { target: GuideTarget }) {
  const isEbbinghaus = target.kind === "ebbinghaus"
  const intro = target.kind === "mode" ? modeIntro[target.mode] : null
  const title = isEbbinghaus
    ? "艾宾浩斯记忆循环怎么走"
    : `${expressionStudyModeLabels[target.mode]}怎么玩`

  return (
    <Popover>
      <PopoverTrigger
        render={<Button type="button" variant="ghost" size="sm" aria-label="玩法说明" />}
      >
        <BookOpenIcon data-icon="inline-start" />
        玩法说明
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>按需查看，不影响当前学习进度。</PopoverDescription>
        </PopoverHeader>
        <div className="grid gap-3 text-xs">
          {isEbbinghaus ? (
            <>
              <p className="font-medium">按三轮走完一条完整记忆链：</p>
              <ol className="list-inside list-decimal space-y-1.5 text-muted-foreground">
                <li>学习：先学还没记住的表达，揭示并确认含义后进入下一步。</li>
                <li>复习：用中文含义回想表达，按找回难度打四档分。</li>
                <li>再记忆：打分「忘记了 / 有点难」的表达会当场再看一遍，并重新安排复习。</li>
              </ol>
              <p className="flex items-start gap-1.5 text-muted-foreground">
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
              <p className="flex items-start gap-1.5 text-muted-foreground">
                <LightbulbIcon
                  className="mt-0.5 size-3.5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                {intro.tip}
              </p>
            </>
          ) : null}

          <div className="grid gap-2 border-t pt-3">
            <p className="flex items-center gap-1.5 font-medium">
              <SparklesIcon className="size-3.5 text-primary" aria-hidden="true" />
              四档评分决定下次什么时候复习
            </p>
            <div className="overflow-hidden rounded-md border">
              {ratings.map((rating) => (
                <div
                  key={rating.label}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b px-2 py-1.5 last:border-b-0"
                >
                  <span className="font-medium">{rating.label}</span>
                  <span className="text-muted-foreground">{rating.meaning}</span>
                  <span className="text-right text-primary">{rating.effect}</span>
                </div>
              ))}
            </div>
            <p className="leading-5 text-muted-foreground">
              学完的表达会写入长期记忆；到点后到「智能复习」页按真实间隔找回。
              强度只由你的自评改变，反复点开不会重复计入。
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
