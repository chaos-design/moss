"use client"

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HeadphonesIcon,
  HistoryIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  Repeat2Icon,
  RotateCcwIcon,
  SparklesIcon,
  UserRoundIcon,
  Volume2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  type ShadowingRecording,
  useShadowingRecorder,
} from "@/features/shadowing/use-shadowing-recorder"
import { useLocalTts } from "@/features/speech/use-local-tts"
import { createLearningPlan, createMemoryTargetHref } from "@/lib/memory"
import { estimateShadowingDuration, type ShadowingAssessment } from "@/lib/shadowing-assessment"
import {
  createMemoryShadowingDialogue,
  getShadowingDialogues,
  type ShadowingDialogue,
  type ShadowingDialogueLine,
  type ShadowingSpeaker,
} from "@/lib/shadowing-dialogues"
import { getShadowingVoicePair } from "@/lib/tts-config"
import { cn } from "@/lib/utils"

const referenceWaveform = [
  18, 34, 52, 28, 64, 78, 42, 58, 88, 66, 44, 72, 36, 54, 82, 62, 28, 48, 70, 34,
]
const speedItems = [
  { label: "0.75×", value: "0.75" },
  { label: "1.0×", value: "1" },
  { label: "1.25×", value: "1.25" },
]
const presetDialogues = getShadowingDialogues()

type ShadowingTake = ShadowingRecording & {
  id: string
  dialogueId: string
  lineId: string
  speaker: ShadowingSpeaker
}

function getTargetMemoryItemId(dialogue: ShadowingDialogue) {
  return dialogue.targetMemoryItemId ?? `shadowing-${dialogue.sceneId}`
}

function getShadowingResultItemId(dialogue: ShadowingDialogue, line: ShadowingDialogueLine) {
  return dialogue.targetMemoryItemId
    ? `shadowing-memory-${dialogue.targetMemoryItemId}`
    : `shadowing-${line.id}`
}

function getScriptKindLabel(dialogue: ShadowingDialogue) {
  if (dialogue.scriptKind === "memory") {
    return "记忆定制"
  }
  if (dialogue.scriptKind === "preset") {
    return "场景预设"
  }
  return "场景生成"
}

export function ShadowingWorkspace({ initialMemoryItemId }: { initialMemoryItemId?: string }) {
  const { recordShadowingAttempt, state } = useLearningMemory()
  const { config: ttsConfig, playbackState, speakWithVoice, stop: stopSpeech } = useLocalTts()
  const [stage, setStage] = useState("listen")
  const [speed, setSpeed] = useState("1")
  const [showTranslation, setShowTranslation] = useState(false)
  const [selectedDialogueId, setSelectedDialogueId] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<ShadowingSpeaker>("learner")
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [playingLineId, setPlayingLineId] = useState<string | null>(null)
  const [playingTakeId, setPlayingTakeId] = useState<string | null>(null)
  const [takeHistory, setTakeHistory] = useState<ShadowingTake[]>([])
  const playbackRunRef = useRef(0)
  const takeIdRef = useRef(0)
  const plan = createLearningPlan(state)
  const requestedMemory = state.items.find((item) => item.id === initialMemoryItemId)
  const requestedDialogue = requestedMemory
    ? createMemoryShadowingDialogue(requestedMemory)
    : undefined
  const availableDialogues = requestedDialogue
    ? [requestedDialogue, ...presetDialogues]
    : presetDialogues
  const activeDialogueId =
    selectedDialogueId ?? requestedDialogue?.id ?? availableDialogues[0]?.id
  const selectedDialogueIndex = Math.max(
    0,
    availableDialogues.findIndex((item) => item.id === activeDialogueId),
  )
  const dialogue = availableDialogues[selectedDialogueIndex]
  const roleLines = dialogue.lines.filter((line) => line.speaker === selectedRole)
  const activeLine =
    roleLines.find((line) => line.id === selectedLineId) ?? roleLines[0] ?? dialogue.lines[0]
  const activeLineTakes = takeHistory.filter(
    (take) => take.dialogueId === dialogue.id && take.lineId === activeLine.id,
  )
  const activeLineNumber = dialogue.lines.findIndex((line) => line.id === activeLine.id) + 1
  const targetMemory = state.items.find((item) => item.id === getTargetMemoryItemId(dialogue))
  const expectedDurationSeconds = estimateShadowingDuration(activeLine.text, Number(speed))
  const recorder = useShadowingRecorder({
    expectedDurationSeconds,
    onComplete: (recording) => {
      takeIdRef.current += 1
      setTakeHistory((current) => [
        {
          ...recording,
          id: `take-${takeIdRef.current}`,
          dialogueId: dialogue.id,
          lineId: activeLine.id,
          speaker: activeLine.speaker,
        },
        ...current,
      ])
      recordShadowingAttempt({
        itemId: getShadowingResultItemId(dialogue, activeLine),
        sceneId: dialogue.sceneId,
        sceneTitle: dialogue.sceneTitle,
        label: `${dialogue.focusWord} 发音与对话节奏`,
        sentence: activeLine.text,
        focusWord: dialogue.focusWord,
        ...recording.assessment,
      })
      toast.success("跟读评分已保存")
    },
  })
  const voicePair = getShadowingVoicePair(ttsConfig)
  const playing = playbackState === "playing"
  const speechLoading = playbackState === "loading"
  const roleLabel = selectedRole === "learner" ? "学习者" : dialogue.partnerRole

  function stopPlayback() {
    playbackRunRef.current += 1
    setPlayingLineId(null)
    stopSpeech()
  }

  function resetPractice() {
    recorder.reset()
    stopPlayback()
    setStage("listen")
  }

  function selectDialogue(id: string) {
    resetPractice()
    setSelectedDialogueId(id)
    setSelectedRole("learner")
    setSelectedLineId(null)
  }

  function moveDialogue(offset: number) {
    const nextIndex = Math.min(
      availableDialogues.length - 1,
      Math.max(0, selectedDialogueIndex + offset),
    )
    selectDialogue(availableDialogues[nextIndex].id)
  }

  function selectLine(line: ShadowingDialogueLine) {
    recorder.reset()
    stopPlayback()
    setSelectedRole(line.speaker)
    setSelectedLineId(line.id)
  }

  function swapRole() {
    recorder.reset()
    stopPlayback()
    setSelectedRole((current) => (current === "learner" ? "partner" : "learner"))
    setSelectedLineId(null)
  }

  async function playLine(line: ShadowingDialogueLine) {
    if (playbackState !== "idle") {
      stopPlayback()
      return
    }

    const runId = playbackRunRef.current + 1
    playbackRunRef.current = runId
    setPlayingLineId(line.id)
    try {
      await speakWithVoice(line.text, voicePair[line.speaker], {
        speed: Number(speed),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "TTS 播放失败")
    } finally {
      if (playbackRunRef.current === runId) {
        setPlayingLineId(null)
      }
    }
  }

  async function playDialogue() {
    if (playbackState !== "idle") {
      stopPlayback()
      return
    }

    const runId = playbackRunRef.current + 1
    playbackRunRef.current = runId
    try {
      for (const line of dialogue.lines) {
        if (playbackRunRef.current !== runId) {
          break
        }
        setPlayingLineId(line.id)
        await speakWithVoice(line.text, voicePair[line.speaker], {
          speed: Number(speed),
        })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "TTS 播放失败")
    } finally {
      if (playbackRunRef.current === runId) {
        setPlayingLineId(null)
      }
    }
  }

  function playFocusWord() {
    void playLine({
      id: `${dialogue.id}-focus`,
      speaker: selectedRole,
      text: dialogue.focusWord,
      translation: "",
    })
  }

  async function playTake(take: ShadowingTake) {
    setPlayingTakeId(take.id)
    try {
      await recorder.play(take)
    } catch {
      toast.error("录音回放失败")
    } finally {
      setPlayingTakeId(null)
    }
  }

  async function playCurrentRecording() {
    setPlayingTakeId("current")
    try {
      await recorder.play()
    } catch {
      toast.error("录音回放失败")
    } finally {
      setPlayingTakeId(null)
    }
  }

  async function handleRecord() {
    if (recorder.recording) {
      recorder.stop()
      return
    }

    try {
      await recorder.start()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法访问麦克风，请检查浏览器权限")
    }
  }

  return (
    <div className="grid min-h-0 min-w-0 items-stretch gap-4 lg:h-full lg:overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)_260px] xl:grid-cols-[248px_minmax(0,1fr)_300px]">
      <aside className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card lg:h-full lg:min-h-0">
        <div className="shrink-0 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HeadphonesIcon className="size-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold">场景跟读</h2>
            </div>
            <Badge variant="secondary">
              {selectedDialogueIndex + 1}/{availableDialogues.length}
            </Badge>
          </div>
          <Progress
            value={((selectedDialogueIndex + 1) / availableDialogues.length) * 100}
            className="mt-3"
            aria-label={`跟读场景进度 ${selectedDialogueIndex + 1} / ${availableDialogues.length}`}
          />
        </div>
        <div className="flex gap-1 overflow-x-auto overscroll-contain p-2 pt-0 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
          {availableDialogues.map((item, index) => (
            <Button
              key={item.id}
              type="button"
              variant={item.id === dialogue.id ? "secondary" : "ghost"}
              className="h-auto min-w-[218px] justify-start px-2 py-2.5 text-left lg:min-w-0"
              aria-pressed={item.id === dialogue.id}
              onClick={() => selectDialogue(item.id)}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-background font-mono text-[10px]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{item.sceneTitle}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Badge variant="outline">{item.level}</Badge>
                  <span className="truncate">{item.lines.length} 句对话</span>
                </span>
              </span>
            </Button>
          ))}
        </div>
      </aside>

      <section className="flex h-[calc(100svh-5rem)] min-h-[560px] max-h-[760px] min-w-0 flex-col overflow-hidden rounded-lg border bg-card lg:h-full lg:min-h-0 lg:max-h-none">
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-accent/35 px-4 py-2.5 text-xs md:px-5">
          <span className="flex items-center gap-1.5 font-medium text-primary">
            <SparklesIcon className="size-3.5" aria-hidden="true" />
            场景记忆
          </span>
          <span className="text-muted-foreground">
            {targetMemory
              ? `当前记忆强度 ${targetMemory.strength}%`
              : plan?.focus
                ? `今日重点：${plan.focus.label}`
                : "整段理解后再进入角色"}
            {` · 完成后进入“${dialogue.sceneTitle}”复用`}
          </span>
        </div>

        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              场景 {selectedDialogueIndex + 1} · 台词 {activeLineNumber}/{dialogue.lines.length}
            </p>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-semibold">{dialogue.sceneTitle}</h2>
              <Badge variant="outline" className="shrink-0">
                {getScriptKindLabel(dialogue)}
              </Badge>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 items-center gap-2 rounded-lg border bg-background px-2.5">
              <span className="text-xs text-muted-foreground">翻译</span>
              <Switch
                size="sm"
                checked={showTranslation}
                onCheckedChange={setShowTranslation}
                aria-label="显示中文翻译"
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={swapRole}>
              <Repeat2Icon data-icon="inline-start" />
              <span className="whitespace-nowrap">扮演：{roleLabel}</span>
            </Button>
            <Select
              items={speedItems}
              value={speed}
              onValueChange={(value) => setSpeed(value ?? "1")}
            >
              <SelectTrigger size="sm" aria-label="播放速度">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {speedItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </header>

        <Tabs
          value={stage}
          onValueChange={(value) => setStage(value)}
          className="min-h-0 flex-1 gap-0 overflow-hidden"
        >
          <div className="shrink-0 overflow-x-auto border-y px-4 md:px-5">
            <TabsList variant="line" className="h-10 min-w-max gap-6">
              <TabsTrigger value="listen" className="gap-2 px-0">
                <span className="font-mono text-[10px]">01</span>
                听对话
              </TabsTrigger>
              <TabsTrigger value="shadow" className="gap-2 px-0">
                <span className="font-mono text-[10px]">02</span>
                跟角色
              </TabsTrigger>
              <TabsTrigger value="apply" className="gap-2 px-0">
                <span className="font-mono text-[10px]">03</span>
                去应用
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="listen" className="m-0 flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [scrollbar-gutter:stable] md:p-6">
              <StageIntroduction
                eyebrow="Listen in context"
                title="先听完整对话，再选择你要模拟的角色。"
                description={dialogue.objective}
              />
              <DialogueTranscript
                className="mt-5"
                dialogue={dialogue}
                playingLineId={playingLineId}
                selectedLineId={activeLine.id}
                selectedRole={selectedRole}
                showTranslation={showTranslation}
                onSelectLine={selectLine}
              />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-card px-4 py-3 md:px-6">
              <Button onClick={() => void playDialogue()}>
                {speechLoading || playing ? (
                  <PauseIcon data-icon="inline-start" />
                ) : (
                  <PlayIcon data-icon="inline-start" />
                )}
                {speechLoading || playing ? "停止播放" : "播放整段"}
              </Button>
              <Button variant="outline" onClick={() => void playLine(activeLine)}>
                <Volume2Icon data-icon="inline-start" />
                播放当前台词
              </Button>
              <Button className="ml-auto" onClick={() => setStage("shadow")}>
                开始角色跟读
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="shadow" className="m-0 flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [scrollbar-gutter:stable] md:p-6">
              <StageIntroduction
                eyebrow="Shadow the dialogue"
                title={`现在扮演${roleLabel}。`}
                description={`从高亮台词开始，完成后选择下一句。你可以随时互换角色，练习同一段对话的另一侧。`}
              />

              <DialogueTranscript
                className="mt-5"
                compact
                dialogue={dialogue}
                playingLineId={playingLineId}
                selectedLineId={activeLine.id}
                selectedRole={selectedRole}
                showTranslation={showTranslation}
                onSelectLine={selectLine}
              />

              {recorder.result ? (
                <AssessmentSummary assessment={recorder.result.assessment} />
              ) : null}
            </div>

            <div className="shrink-0 border-t border-primary/20 bg-accent/25 px-4 py-3 md:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] text-primary">CURRENT LINE</p>
                  <p className="mt-1 truncate text-sm font-medium">{activeLine.text}</p>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {recorder.recording
                    ? `${recorder.elapsedSeconds.toFixed(1)}s REC`
                    : recorder.processing
                      ? "ANALYZING"
                      : recorder.result
                        ? `${recorder.result.assessment.durationSeconds.toFixed(1)}s`
                        : "READY"}
                </span>
              </div>
              <Waveform
                values={recorder.result?.waveform ?? referenceWaveform}
                active={recorder.recording}
                className="mt-2 h-9"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button disabled={recorder.processing} onClick={handleRecord}>
                  {recorder.recording ? (
                    <PauseIcon data-icon="inline-start" />
                  ) : recorder.result ? (
                    <RotateCcwIcon data-icon="inline-start" />
                  ) : (
                    <MicIcon data-icon="inline-start" />
                  )}
                  {recorder.recording ? "停止录音" : recorder.result ? "重新录音" : "开始录音"}
                </Button>
                <Button
                  variant="outline"
                  disabled={speechLoading}
                  onClick={() => void playLine(activeLine)}
                >
                  <Volume2Icon data-icon="inline-start" />
                  听示范
                </Button>
                {recorder.result ? (
                  <Button
                    variant="outline"
                    disabled={recorder.playing}
                    onClick={() => void playCurrentRecording()}
                  >
                    <PlayIcon data-icon="inline-start" />
                    {recorder.playing ? "正在回放" : "回放本次"}
                  </Button>
                ) : null}
                <Button
                  className="ml-auto"
                  onClick={() => setStage("apply")}
                  disabled={!recorder.result}
                >
                  进入应用
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="apply" className="m-0 flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [scrollbar-gutter:stable] md:p-6">
              <StageIntroduction
                eyebrow="Use it in context"
                title="带着角色进入真实对话。"
                description={`进入“${dialogue.sceneTitle}”，保留这段对话的沟通目标，再根据 AI 回应自由调整表达。`}
              />
              <DialogueTranscript
                className="mt-5"
                compact
                dialogue={dialogue}
                playingLineId={playingLineId}
                selectedLineId={activeLine.id}
                selectedRole={selectedRole}
                showTranslation={showTranslation}
                onSelectLine={selectLine}
              />
            </div>
            <div className="shrink-0 border-t bg-card px-4 py-3 md:px-6">
              <Link
                href={createMemoryTargetHref(
                  `/workspace/conversation?scene=${encodeURIComponent(dialogue.sceneId)}`,
                  getTargetMemoryItemId(dialogue),
                )}
                className={cn(buttonVariants(), "w-full sm:w-fit")}
              >
                <MicIcon data-icon="inline-start" />去{dialogue.sceneTitle}复用
              </Link>
            </div>
          </TabsContent>
        </Tabs>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3 md:px-5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={selectedDialogueIndex === 0}
            onClick={() => moveDialogue(-1)}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            上一场景
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={selectedDialogueIndex === availableDialogues.length - 1}
            onClick={() => moveDialogue(1)}
          >
            下一场景
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </footer>
      </section>

      <aside className="flex min-w-0 flex-col gap-4 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]">
        <section className="rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserRoundIcon className="size-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold">角色设置</h2>
            </div>
            <Badge variant="outline">{roleLines.length} 句</Badge>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            当前模拟{roleLabel}。点击对话中的任意一句即可切换角色并把它设为跟读目标。
          </p>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            {getScriptKindLabel(dialogue)} · {dialogue.lines.length} 句完整脚本
          </p>
          <div className="mt-4 grid gap-2">
            <div className="rounded-md bg-secondary/65 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">{dialogue.partnerName}</p>
              <p className="mt-0.5 truncate text-xs font-medium">{voicePair.partner.name}</p>
            </div>
            <div className="rounded-md bg-accent/35 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">学习者</p>
              <p className="mt-0.5 truncate text-xs font-medium">{voicePair.learner.name}</p>
            </div>
          </div>
          <Button className="mt-4 w-full" variant="outline" onClick={swapRole}>
            <Repeat2Icon data-icon="inline-start" />
            互换角色
          </Button>
        </section>

        <section className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">本轮反馈</h2>
          </div>
          {recorder.result ? (
            <div className="mt-4 flex flex-col gap-4">
              <FeedbackItem
                label="本轮结果"
                value={getAssessmentFeedback(recorder.result.assessment.overallScore)}
                positive={recorder.result.assessment.overallScore >= 75}
              />
              <FeedbackItem
                label="声学依据"
                value={`有效发声占比 ${Math.round(
                  recorder.result.assessment.voicedRatio * 100,
                )}%，录音 ${recorder.result.assessment.durationSeconds.toFixed(1)} 秒。`}
              />
              <FeedbackItem
                label="下一次"
                value={`先用 0.75× 突出 ${dialogue.focusWord}，再恢复到 1.0×。`}
              />
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              完成录音后，这里会显示基于实际音频计算的清晰度、连贯度和节奏反馈。
            </p>
          )}
        </section>

        <section className="rounded-lg border bg-card p-5" aria-label="录音对比">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HistoryIcon className="size-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold">录音对比</h2>
            </div>
            <Badge variant="outline">{activeLineTakes.length} 次</Badge>
          </div>
          {activeLineTakes.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2">
              {activeLineTakes.map((take, index) => {
                const previousScore = activeLineTakes[index + 1]?.assessment.overallScore
                const scoreChange =
                  previousScore === undefined
                    ? null
                    : take.assessment.overallScore - previousScore
                return (
                  <div
                    key={take.id}
                    className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">
                          {index === 0
                            ? "本次录音"
                            : `之前录音 ${activeLineTakes.length - index}`}
                        </span>
                        {scoreChange !== null ? (
                          <Badge variant={scoreChange >= 0 ? "secondary" : "outline"}>
                            {scoreChange >= 0 ? "+" : ""}
                            {scoreChange}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        综合 {take.assessment.overallScore} ·{" "}
                        {take.assessment.durationSeconds.toFixed(1)} 秒
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`回放${index === 0 ? "本次录音" : `之前录音 ${activeLineTakes.length - index}`}`}
                      disabled={recorder.playing}
                      onClick={() => void playTake(take)}
                    >
                      {playingTakeId === take.id ? <PauseIcon /> : <PlayIcon />}
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              同一句完成两次以上录音后，可在这里回放并比较分数变化。
            </p>
          )}
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-semibold">发音焦点</h2>
          <p className="mt-4 font-serif text-2xl font-semibold">{dialogue.focusWord}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">{dialogue.phonetic}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`播放 ${dialogue.focusWord} 发音`}
              onClick={playFocusWord}
            >
              <Volume2Icon />
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{dialogue.focusTip}</p>
        </section>
      </aside>
    </div>
  )
}

function StageIntroduction({
  description,
  eyebrow,
  title,
}: {
  description: string
  eyebrow: string
  title: string
}) {
  return (
    <div>
      <p className="font-mono text-[10px] font-semibold uppercase text-primary">{eyebrow}</p>
      <h2 className="mt-2 font-serif text-xl font-semibold md:text-2xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

function DialogueTranscript({
  className,
  compact = false,
  dialogue,
  onSelectLine,
  playingLineId,
  selectedLineId,
  selectedRole,
  showTranslation,
}: {
  className?: string
  compact?: boolean
  dialogue: ShadowingDialogue
  onSelectLine: (line: ShadowingDialogueLine) => void
  playingLineId: string | null
  selectedLineId: string
  selectedRole: ShadowingSpeaker
  showTranslation: boolean
}) {
  return (
    <ol
      className={cn("flex flex-col gap-2", className)}
      aria-label={`${dialogue.sceneTitle}预设对话`}
    >
      {dialogue.lines.map((line) => {
        const learner = line.speaker === "learner"
        const selected = line.id === selectedLineId
        const activeRole = line.speaker === selectedRole
        const playing = line.id === playingLineId

        return (
          <li key={line.id} className={cn("flex", learner ? "justify-end" : "justify-start")}>
            <button
              type="button"
              className={cn(
                "max-w-[92%] rounded-lg border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[78%]",
                learner ? "bg-accent/45" : "bg-secondary/65",
                activeRole && "border-primary/35",
                selected && "border-primary bg-primary/8 ring-1 ring-primary/20",
              )}
              aria-pressed={selected}
              aria-label={`选择${learner ? "学习者" : dialogue.partnerName}台词：${line.text}`}
              onClick={() => onSelectLine(line)}
            >
              <span className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
                <span>{learner ? "你" : dialogue.partnerName}</span>
                {playing ? <span className="text-primary">正在播放</span> : null}
                {activeRole ? <span className="text-primary">跟读角色</span> : null}
              </span>
              <span className={cn("mt-1 block text-sm leading-6", !compact && "sm:text-base")}>
                {line.text}
              </span>
              {showTranslation ? (
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {line.translation}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function Waveform({
  values,
  active = false,
  className,
}: {
  values: number[]
  active?: boolean
  className?: string
}) {
  return (
    <div
      className={cn("flex h-16 items-center gap-1", className)}
      role="img"
      aria-label="音频波形"
    >
      {values.map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={cn(
            "min-w-1 flex-1 rounded-full bg-background/45 transition-all",
            active && "animate-pulse bg-background",
          )}
          style={{ height: `${height}%`, animationDelay: `${index * 35}ms` }}
        />
      ))}
    </div>
  )
}

function AssessmentSummary({ assessment }: { assessment: ShadowingAssessment }) {
  const metrics = [
    { label: "综合", value: assessment.overallScore },
    { label: "清晰度", value: assessment.clarityScore },
    { label: "连贯度", value: assessment.fluencyScore },
    { label: "节奏", value: assessment.rhythmScore },
  ]

  return (
    <section className="border-y py-4" aria-label="跟读评分">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-background px-3 py-3 text-center">
            <p className="text-[11px] text-muted-foreground">{metric.label}</p>
            <p className="mt-1 font-mono text-lg font-semibold">{metric.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        分数由本次录音的有效发声、音量稳定性、停顿和目标时长计算，不代表音素级识别结果。
      </p>
    </section>
  )
}

function getAssessmentFeedback(score: number) {
  if (score >= 85) {
    return "清晰度、连贯度和整句节奏稳定，可以进入场景应用。"
  }
  if (score >= 70) {
    return "整句已经可辨识，继续减少长停顿并贴近示范速度。"
  }
  return "当前有效发声或节奏偏弱，建议降低播放速度后重新录制。"
}

function FeedbackItem({
  label,
  value,
  positive = false,
}: {
  label: string
  value: string
  positive?: boolean
}) {
  return (
    <div className="border-t pt-3">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        {positive ? (
          <CheckCircle2Icon className="size-3.5 text-[var(--success)]" aria-hidden="true" />
        ) : null}
        {label}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{value}</p>
    </div>
  )
}
