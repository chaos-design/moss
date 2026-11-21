"use client"

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  EyeIcon,
  MicIcon,
  SquareIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ExpressionText } from "@/components/expression-text"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useExpressionDictation } from "@/features/expressions/use-expression-dictation"
import {
  createExpressionIdentity,
  type ExpressionLibraryItem,
  expressionKindLabels,
  expressionSceneCategoryLabels,
} from "@/lib/expression-library"
import {
  buildCloze,
  checkClozeAnswer,
  type ExpressionStudyMode,
  type ExpressionStudyScope,
  expressionStudyModeLabels,
} from "@/lib/expression-study"
import {
  type ExpressionProgressStatus,
  type ExpressionProgressUpdate,
  type ExpressionStudyState,
  getExpressionProgress,
} from "@/lib/memory"

const modes: ExpressionStudyMode[] = ["flashcard", "cloze", "dictation"]

function scopeLabel(scope: ExpressionStudyScope, groups: { id: string; name: string }[]) {
  switch (scope.kind) {
    case "filtered":
      return "当前筛选结果"
    case "favorites":
      return "我的收藏"
    case "group":
      return groups.find((group) => group.id === scope.groupId)?.name ?? "学习分组"
    case "review":
      return scope.status === "learning" ? "学习中" : "已掌握"
    case "random":
      return `随机学习 ${scope.count} 条`
    case "ebbinghaus":
      return "艾宾浩斯记忆"
  }
}

export function ExpressionStudyWorkspace({
  items,
  scope,
  study,
  initialMode,
  onExit,
  onProgress,
  onStudyMemory,
}: {
  items: ExpressionLibraryItem[]
  scope: ExpressionStudyScope
  study: ExpressionStudyState
  initialMode: ExpressionStudyMode
  onExit: () => void
  onProgress: (identity: string, update: ExpressionProgressUpdate) => void
  /** 完成一条时同步写入长期记忆，使词库进度与间隔复习队列成为同一条链路。 */
  onStudyMemory?: (item: ExpressionLibraryItem) => void
}) {
  const [mode, setMode] = useState<ExpressionStudyMode>(initialMode)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [clozeAnswer, setClozeAnswer] = useState("")
  const [clozeResult, setClozeResult] = useState<boolean | null>(null)
  const [translationRevealed, setTranslationRevealed] = useState(false)
  const [stats, setStats] = useState({ mastered: 0, practice: 0 })
  const dictation = useExpressionDictation()

  const item = items[index]
  const identity = item ? createExpressionIdentity(item) : ""
  const cloze = useMemo(() => (item ? buildCloze(item) : null), [item])
  const progress = identity ? getExpressionProgress(study, identity) : undefined
  const groups = Object.values(study.groups).filter((group) => !group.deletedAt)
  const total = items.length
  const percent = total > 0 ? Math.round(((index + (item ? 1 : 0)) / total) * 100) : 0

  function complete(status: ExpressionProgressStatus) {
    onProgress(identity, { status, incrementReviews: true })
    // 主动学习也是一次真实接触：写进长期记忆并排近期复习，避免「学了却不在复习队列」。
    onStudyMemory?.(item)
    setStats((current) => ({
      mastered: current.mastered + (status === "mastered" ? 1 : 0),
      practice: current.practice + (status === "learning" ? 1 : 0),
    }))
    setIndex((current) => current + 1)
    setRevealed(false)
    setClozeAnswer("")
    setClozeResult(null)
    setTranslationRevealed(false)
    dictation.reset()
  }

  function switchMode(next: ExpressionStudyMode) {
    setMode(next)
    setRevealed(false)
    setClozeAnswer("")
    setClozeResult(null)
    setTranslationRevealed(false)
    dictation.reset()
  }

  // 键盘流：空格/回车揭示答案，揭示后 1 = 再练、2 = 掌握。焦点在输入框/按钮上时交还原生激活，
  // 避免一次按键既揭示又评分；听写录音/识别中不拦截。处理器放 ref 里，每次渲染刷新闭包。
  const keyboardActionRef = useRef<(event: KeyboardEvent) => void>(() => {})
  keyboardActionRef.current = (event) => {
    if (!item || event.isComposing) {
      return
    }
    const target = event.target
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    ) {
      return
    }
    const onControl =
      target instanceof HTMLElement && Boolean(target.closest("button, a, [role='button']"))
    const revealedNow =
      mode === "flashcard"
        ? revealed
        : mode === "cloze"
          ? clozeResult !== null
          : dictation.phase === "result"
    if (!revealedNow && (event.key === " " || event.key === "Enter")) {
      if (onControl) {
        return
      }
      event.preventDefault()
      if (mode === "flashcard") {
        setRevealed(true)
      } else if (mode === "cloze" && cloze) {
        setClozeResult(checkClozeAnswer(cloze.answer, clozeAnswer))
      }
      return
    }
    if (revealedNow && (event.key === "1" || event.key === "2")) {
      event.preventDefault()
      complete(event.key === "1" ? "learning" : "mastered")
    }
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => keyboardActionRef.current(event)
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // 当前条目的即时反馈：自评后写入长期记忆，首次复习约 10 分钟后到期。
  const afterStudyHint = "自评后写入长期记忆，约 10 分钟后到期；到「智能复习」页找回。"

  return (
    <section className="flex min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-card">
      <header className="shrink-0 border-b px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="返回词库"
              onClick={onExit}
            >
              <ArrowLeftIcon />
            </Button>
            <h1 className="truncate text-base font-semibold">
              学习 · {scopeLabel(scope, groups)}
            </h1>
          </div>
          {total > 0 ? (
            <span className="text-xs text-muted-foreground">
              {Math.min(index + 1, total)} / {total}
            </span>
          ) : null}
        </div>
        {total > 0 ? <Progress value={percent} className="mt-1" /> : null}
      </header>

      {total === 0 ? (
        <div className="px-5 py-16 text-center" aria-live="polite">
          <p className="font-serif text-lg font-semibold">这个范围里还没有表达</p>
          <p className="mt-2 text-sm text-muted-foreground">
            先收藏或加入分组，再从这里进入学习。
          </p>
          <Button type="button" className="mt-5" onClick={onExit}>
            返回词库
          </Button>
        </div>
      ) : index >= total ? (
        <div className="px-5 py-16 text-center" aria-live="polite">
          <p className="font-serif text-xl font-semibold">这一组学完了</p>
          <p className="mt-3 text-sm text-muted-foreground">
            掌握 {stats.mastered} 条 · 再练 {stats.practice} 条
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button type="button" variant="outline" onClick={onExit}>
              返回词库
            </Button>
            <Button
              type="button"
              onClick={() => {
                setIndex(0)
                setStats({ mastered: 0, practice: 0 })
                setRevealed(false)
                setClozeAnswer("")
                setClozeResult(null)
                dictation.reset()
              }}
            >
              再学一组
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="border-b px-5 py-2">
            <Tabs
              value={mode}
              onValueChange={(value) => switchMode(value as ExpressionStudyMode)}
            >
              <TabsList className="w-full">
                {modes.map((value) => (
                  <TabsTrigger key={value} value={value} className="flex-1">
                    {expressionStudyModeLabels[value]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] text-muted-foreground">
                {String(index + 1).padStart(3, "0")}
              </span>
              <Badge variant="secondary">{expressionKindLabels[item.kind]}</Badge>
              <Badge variant="outline">
                {expressionSceneCategoryLabels[item.sceneCategory]}
              </Badge>
              {progress ? (
                <Badge variant={progress.status === "mastered" ? "default" : "outline"}>
                  {progress.status === "mastered" ? "已掌握" : "学习中"}
                </Badge>
              ) : null}
            </div>

            <p className="mb-4 rounded-md bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">快捷操作</span>
              {mode === "dictation"
                ? "：听写用按钮录音；结果出来后按 1 再练、2 掌握。"
                : "：空格揭示 · 1 再练一次 · 2 掌握了。"}
              <span className="block">{afterStudyHint}</span>
            </p>

            {mode === "flashcard" ? (
              <Flashcard
                item={item}
                revealed={revealed}
                translationRevealed={translationRevealed}
                onReveal={() => setRevealed(true)}
                onToggleTranslation={() => setTranslationRevealed((current) => !current)}
                onComplete={complete}
              />
            ) : mode === "cloze" ? (
              <ClozeCard
                item={item}
                cloze={cloze}
                answer={clozeAnswer}
                result={clozeResult}
                onAnswer={setClozeAnswer}
                onCheck={() =>
                  setClozeResult(checkClozeAnswer(cloze?.answer ?? item.phrase, clozeAnswer))
                }
                onComplete={complete}
              />
            ) : (
              <DictationCard
                item={item}
                expected={cloze?.answer ?? item.phrase}
                dictation={dictation}
                onComplete={complete}
              />
            )}
          </div>
        </>
      )}
    </section>
  )
}

function Flashcard({
  item,
  revealed,
  translationRevealed,
  onReveal,
  onToggleTranslation,
  onComplete,
}: {
  item: ExpressionLibraryItem
  revealed: boolean
  translationRevealed: boolean
  onReveal: () => void
  onToggleTranslation: () => void
  onComplete: (status: ExpressionProgressStatus) => void
}) {
  return (
    <div className="grid gap-4">
      <h3 className="break-words font-serif text-2xl font-semibold leading-snug">
        {item.phrase}
      </h3>
      {!revealed ? (
        <div className="grid gap-4 py-4">
          <p className="text-sm text-muted-foreground">
            第 1 步：先在脑子里回忆它的含义和使用场景。
          </p>
          <p className="text-xs text-muted-foreground">
            第 2 步：想好了再揭示答案，诚实自评是否真的记住。
          </p>
          <Button type="button" onClick={onReveal}>
            <EyeIcon data-icon="inline-start" />
            揭示答案
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          <div>
            <p className="text-xs font-medium text-foreground">含义</p>
            <p className="mt-1 leading-7">{item.meaning}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">为什么这样表达</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.why}</p>
          </div>
          <blockquote className="border-l-2 border-primary/35 pl-3 font-serif text-sm leading-7">
            <ExpressionText text={item.example} phrase={item.phrase} />
            {item.exampleTranslation ? (
              <>
                <button
                  type="button"
                  className="ml-2 inline-flex items-center gap-1 rounded-sm text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={translationRevealed}
                  onClick={onToggleTranslation}
                >
                  {translationRevealed ? "收起译文" : "译文"}
                </button>
                {translationRevealed ? (
                  <span className="mt-1 block font-sans text-xs text-muted-foreground">
                    {item.exampleTranslation}
                  </span>
                ) : null}
              </>
            ) : null}
          </blockquote>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onComplete("learning")}>
              再练一次
            </Button>
            <Button type="button" onClick={() => onComplete("mastered")}>
              <CheckIcon data-icon="inline-start" />
              掌握了
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ClozeCard({
  item,
  cloze,
  answer,
  result,
  onAnswer,
  onCheck,
  onComplete,
}: {
  item: ExpressionLibraryItem
  cloze: ReturnType<typeof buildCloze>
  answer: string
  result: boolean | null
  onAnswer: (value: string) => void
  onCheck: () => void
  onComplete: (status: ExpressionProgressStatus) => void
}) {
  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        第 1 步：读例句，根据语境在空格里填入目标表达（大小写、时态、复数都算对）。
      </p>
      <p className="text-xs text-muted-foreground">
        第 2 步：点「检查答案」核对，再自评是否掌握。
      </p>
      <blockquote className="border-l-2 border-primary/35 pl-3 font-serif text-lg leading-9">
        {cloze ? (
          <span>
            {cloze.before}
            <Input
              value={answer}
              onChange={(event) => onAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && answer.trim()) {
                  event.preventDefault()
                  onCheck()
                }
              }}
              aria-label="填入缺失的表达"
              autoFocus
              className="mx-1 inline-block w-40 font-sans text-sm"
              placeholder="填入表达"
            />
            {cloze.after}
          </span>
        ) : (
          <span>
            {item.example}
            <span className="ml-2 font-sans text-xs text-muted-foreground">
              （这条例句未能自动挖空，请改用闪卡方式）
            </span>
          </span>
        )}
      </blockquote>

      {result !== null ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${result ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}
          aria-live="polite"
        >
          <p className="font-medium">{result ? "填对了" : "还不对"}</p>
          {!result ? (
            <p className="mt-1 text-muted-foreground">
              正确答案：<span className="font-serif">{cloze?.answer ?? item.phrase}</span>
            </p>
          ) : null}
          <p className="mt-1 text-muted-foreground">{item.meaning}</p>
        </div>
      ) : null}

      {result === null ? (
        <Button type="button" onClick={onCheck} disabled={!answer.trim() || !cloze}>
          检查答案
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onComplete("learning")}>
            再练一次
          </Button>
          <Button type="button" onClick={() => onComplete(result ? "mastered" : "learning")}>
            {result ? "掌握了" : "记住了，下一条"}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      )}
    </div>
  )
}

function DictationCard({
  item,
  expected,
  dictation,
  onComplete,
}: {
  item: ExpressionLibraryItem
  expected: string
  dictation: ReturnType<typeof useExpressionDictation>
  onComplete: (status: ExpressionProgressStatus) => void
}) {
  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        第 1 步：点「听例句」听发音。第 2 步：点「开始录音」复述，说完点「停止并识别」。
        识别结果会与目标表达做容错比对；不想开口时可切换到闪卡或填空。
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void dictation.play(item.example)}
          disabled={dictation.phase === "playing"}
        >
          <Volume2Icon data-icon="inline-start" />
          {dictation.phase === "playing" ? "播放中" : "听例句"}
        </Button>
        {dictation.phase !== "recording" ? (
          <Button
            type="button"
            onClick={() => void dictation.startRecording()}
            disabled={!dictation.supported || dictation.phase === "transcribing"}
          >
            <MicIcon data-icon="inline-start" />
            开始录音
          </Button>
        ) : (
          <Button
            type="button"
            variant="destructive"
            onClick={() => void dictation.stopAndCheck(expected)}
          >
            <SquareIcon data-icon="inline-start" />
            停止并识别
          </Button>
        )}
      </div>

      {!dictation.supported ? (
        <p className="text-sm text-muted-foreground">
          当前浏览器不支持录音，请切换到闪卡或填空方式。
        </p>
      ) : null}
      {dictation.phase === "transcribing" ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          正在识别…
        </p>
      ) : null}
      {dictation.error ? (
        <p className="text-sm text-destructive" role="alert">
          {dictation.error}
        </p>
      ) : null}

      {dictation.phase === "result" && dictation.verdict ? (
        <div className="grid gap-2 rounded-md border px-3 py-3" aria-live="polite">
          <p className="font-medium">{dictation.verdict.passed ? "听写通过" : "再试一次"}</p>
          <p className="text-sm text-muted-foreground">
            识别结果：{dictation.transcript || "（无）"}
          </p>
          <p className="text-sm text-muted-foreground">
            目标表达：<span className="font-serif">{expected}</span> · 相似度{" "}
            {Math.round(dictation.verdict.similarity * 100)}%
          </p>
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={dictation.reset}>
              重录
            </Button>
            <Button
              type="button"
              onClick={() => onComplete(dictation.verdict!.passed ? "mastered" : "learning")}
            >
              {dictation.verdict.passed ? "掌握了" : "记住了，下一条"}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>
      ) : null}

      {dictation.phase === "idle" || dictation.phase === "result" ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onComplete("learning")}
          >
            跳过 <XIcon data-icon="inline-end" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
