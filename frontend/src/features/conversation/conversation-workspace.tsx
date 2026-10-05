"use client"

import {
  ArrowRightIcon,
  AudioLinesIcon,
  AudioWaveformIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  Clock3Icon,
  KeyboardIcon,
  LanguagesIcon,
  LightbulbIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  MessageSquarePlusIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  RotateCcwIcon,
  SendIcon,
  SettingsIcon,
  Trash2Icon,
  Volume2Icon,
  VolumeXIcon,
  WavesIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import {
  type FormEvent,
  type KeyboardEvent,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { LevelBadge } from "@/components/level-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  ConversationGuideAside,
  ConversationGuideSheet,
} from "@/features/conversation/conversation-guide"
import { ConversationHistorySheet } from "@/features/conversation/conversation-history-sheet"
import { requestConversationTranslation } from "@/features/conversation/conversation-transport"
import { useConversationPrefs } from "@/features/conversation/use-conversation-prefs"
import { speechTransportItems } from "@/features/conversation/use-voice-call-runtime"
import {
  type ConversationMessage,
  type ConversationVoiceOption,
  useVoiceConversation,
} from "@/features/conversation/use-voice-conversation"
import { VoiceActivity } from "@/features/conversation/voice-activity"
import type { AsrEngine, AsrEngineOption } from "@/lib/asr-config"
import {
  formatCallDuration,
  getVoiceCallStatusDescription,
  getVoiceCallStatusLabel,
  type VoiceCallStatus,
} from "@/lib/call-runtime"
import {
  type ConversationInputAnalysis,
  type ExpressionIssueKind,
  type ExpressionValidation,
  getCorrectionSegments,
  getOriginalErrorSegments,
} from "@/lib/conversation-feedback"
import {
  readConversationHistory,
  readLastConversationScene,
  saveLastConversationScene,
} from "@/lib/conversation-history"
import {
  shouldSendOnKey,
  type TranscriptLayout,
  type TutorMode,
} from "@/lib/conversation-prefs"
import type { ConversationScene } from "@/lib/conversation-scenes"
import { buildConversationMemoryContext, type ConversationTurnMemoryInput } from "@/lib/memory"
import { describeSpeechTransport, type SpeechTransport } from "@/lib/speech-config"
import { describeUserError } from "@/lib/user-error"
import { cn } from "@/lib/utils"

const tutorModes = [
  { label: "自然交流", value: "natural" },
  { label: "温和纠错", value: "coach" },
  { label: "沉浸英语", value: "english" },
]

const inputLanguageLabels: Record<ConversationInputAnalysis["language"], string> = {
  chinese: "中文",
  english: "English",
  mixed: "中英混合",
  unknown: "其他",
}

const conversationIntentLabels: Record<ConversationInputAnalysis["intent"], string> = {
  scene_reply: "场景表达",
  translation_request: "翻译求助",
  language_question: "语言问题",
}

const issueKindLabels: Record<ExpressionIssueKind, string> = {
  grammar: "语法",
  word_choice: "用词",
  word_order: "语序",
  missing_word: "缺词",
  register: "语气",
  clarity: "完整性",
}

const englishListLinePattern = /^(?:•|\d+[.)])\s+(.+)$/
const quotedExpressionPattern = /("[^"]+"|“[^”]+”)/g
const chineseSupportPattern = /[\u3400-\u9fff]/

function renderEnglishInline(text: string) {
  return text.split(quotedExpressionPattern).map((part, index) => {
    const quoted = /^["“](.+)["”]$/.exec(part)
    if (!quoted?.[1]) {
      return <span key={`${part}-${index}`}>{part}</span>
    }

    return (
      <span
        key={`${part}-${index}`}
        className="mx-0.5 rounded-sm bg-primary/10 px-1 py-0.5 font-sans text-[0.95em] font-medium text-primary"
      >
        {quoted[1]}
      </span>
    )
  })
}

function EnglishReplyContent({ content }: { content: string }) {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <div className="mt-2 min-w-0 space-y-2 font-serif text-base leading-7">
      {lines.map((line, index) => {
        const listMatch = englishListLinePattern.exec(line)
        if (listMatch?.[1]) {
          return (
            <div
              key={`${line}-${index}`}
              className="flex min-w-0 items-start gap-2 rounded-md bg-accent/45 px-3 py-2"
            >
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <p className="min-w-0 flex-1 break-words">{renderEnglishInline(listMatch[1])}</p>
            </div>
          )
        }

        return (
          <p key={`${line}-${index}`} className="break-words">
            {renderEnglishInline(line)}
          </p>
        )
      })}
    </div>
  )
}

function AssistantSupportPanel({
  note,
  onToggleTranslation,
  translating,
  translation,
  translationVisible,
}: {
  note: string
  onToggleTranslation: () => void
  translating: boolean
  translation: string
  translationVisible: boolean
}) {
  const hasSupportContent = Boolean((translationVisible && translation) || note)
  const hasVisibleChineseSupport =
    Boolean(translationVisible && translation) || chineseSupportPattern.test(note)

  return (
    <div
      className={cn("mt-3 min-w-0", hasSupportContent && "border-l-2 border-border py-1 pl-3")}
    >
      <div className="flex flex-wrap items-center gap-2">
        {hasSupportContent ? (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <LanguagesIcon className="size-3.5 text-primary" aria-hidden="true" />
            {hasVisibleChineseSupport ? "中文辅助" : "学习辅助"}
          </div>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleTranslation}
          aria-expanded={translationVisible}
          disabled={translating}
        >
          {translating ? (
            <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
          ) : (
            <LanguagesIcon data-icon="inline-start" />
          )}
          {translating ? "翻译中" : translationVisible ? "收起中文" : "翻译"}
        </Button>
      </div>

      {translationVisible && translation ? (
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
          {translation}
        </p>
      ) : null}

      {note ? (
        <div className="mt-2 flex items-start gap-2 text-left text-xs leading-5 text-muted-foreground">
          <LightbulbIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>{note}</span>
        </div>
      ) : null}
    </div>
  )
}

export function scrollLatestTranscriptTurn(transcript: HTMLElement) {
  const turns = transcript.querySelectorAll<HTMLElement>("[data-transcript-turn]")
  const latestTurn = turns[turns.length - 1]
  if (!latestTurn) {
    return
  }

  const transcriptTop = transcript.getBoundingClientRect().top
  const turnTop = latestTurn.getBoundingClientRect().top
  const distanceToTop = turnTop - transcriptTop - 16
  if (distanceToTop > 0) {
    transcript.scrollTop += distanceToTop
  }
}

export function ConversationWorkspace({
  focusMemoryItemId,
  restoreLastScene = false,
  scene,
}: {
  focusMemoryItemId?: string
  restoreLastScene?: boolean
  scene: ConversationScene
}) {
  const router = useRouter()
  const transcriptRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const { state, recordConversationTurn } = useLearningMemory()
  const { prefs, setPrefs } = useConversationPrefs()
  const memoryContext = useMemo(
    () => buildConversationMemoryContext(state, scene.id, focusMemoryItemId),
    [focusMemoryItemId, scene.id, state],
  )
  const handleTurnComplete = useCallback(
    (input: ConversationTurnMemoryInput) => {
      recordConversationTurn(input)
    },
    [recordConversationTurn],
  )
  const selectTutorMode = useCallback(
    (tutorMode: TutorMode) => {
      setPrefs((current) => ({ ...current, tutorMode }))
    },
    [setPrefs],
  )
  useEffect(() => {
    const history = readConversationHistory()
    const lastSceneId = readLastConversationScene(history)
    if (restoreLastScene && lastSceneId && lastSceneId !== scene.id) {
      router.replace(`/workspace/conversation?scene=${encodeURIComponent(lastSceneId)}`)
      return
    }
    saveLastConversationScene(scene.id)
  }, [restoreLastScene, router, scene.id])

  const {
    callActive,
    callSeconds,
    callStatus,
    currentSessionId,
    deleteConversation,
    deleteMessage,
    draft,
    endCall,
    history,
    idlePrompt,
    liveTranscript,
    loadConversation,
    messages,
    muted,
    pending,
    previewingVoice,
    previewVoice,
    retryLastReply,
    apiVoice,
    asrEngineOptions,
    asrTransport,
    selectedAsrEngine,
    selectApiVoice,
    selectAsrTransport,
    selectTtsTransport,
    ttsTransport,
    selectedVoice,
    selectAsrEngine,
    selectVoice,
    sendDraft,
    setDraft,
    speakerEnabled,
    speechPlaybackState,
    speechRecognitionAvailable,
    speechRecognitionProgress,
    speak,
    startCall,
    startNewConversation,
    toggleMute,
    toggleSpeaker,
    voiceOptions,
  } = useVoiceConversation({
    scene,
    memoryContext,
    onTurnComplete: handleTurnComplete,
  })
  const { latestInputMode, turnCount } = useMemo(() => {
    let count = 0
    let inputMode: ConversationMessage["inputMode"]
    for (const message of messages) {
      if (message.role === "user") {
        count += 1
        inputMode = message.inputMode
      }
    }
    return { latestInputMode: inputMode, turnCount: count }
  }, [messages])
  // Collapsed keeps the floating composer as a slim pill; expanded reveals the full textarea.
  const [composerExpanded, setComposerExpanded] = useState(false)
  // Track the floating panel height so the transcript can reserve matching bottom padding
  // and the last turn never hides behind the overlay.
  const [composerHeight, setComposerHeight] = useState(0)
  const [guideCollapsed, setGuideCollapsed] = useState(true)
  const latestMessageId = messages[messages.length - 1]?.id

  useEffect(() => {
    setGuideCollapsed(window.localStorage.getItem("moss:conversation-guide:v1") !== "expanded")
  }, [])

  useEffect(() => {
    const node = composerRef.current
    if (!node || typeof ResizeObserver === "undefined") {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height
      if (typeof height === "number") {
        setComposerHeight(height)
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Collapse the expanded text panel automatically whenever a voice call takes over.
  useEffect(() => {
    if (callActive) {
      setComposerExpanded(false)
    }
  }, [callActive])

  useEffect(() => {
    const transcript = transcriptRef.current
    if (!transcript) {
      return
    }

    scrollLatestTranscriptTurn(transcript)
  }, [latestMessageId, messages.length])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    sendDraft()
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (shouldSendOnKey(prefs.sendShortcut, event)) {
      event.preventDefault()
      if (draft.trim()) {
        sendDraft()
      }
    }
  }

  return (
    <div className="flex h-full min-h-[560px] w-full min-w-0 overflow-hidden bg-card">
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-col items-stretch gap-2 px-4 py-2 md:flex-row md:items-center md:gap-4 md:px-5 min-[1200px]:h-[68px]">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar size="lg" className="shrink-0">
              <AvatarFallback className="bg-foreground font-serif text-lg text-background">
                {scene.partnerName.slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="truncate font-serif text-lg font-semibold">{scene.title}</h1>
                <LevelBadge className="shrink-0">{scene.level}</LevelBadge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-xs text-muted-foreground">
                  {scene.partnerName} · {scene.partnerRole}
                </span>
                <Badge variant={callActive ? "secondary" : "outline"}>
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      callStatus === "listening" && "bg-[var(--success)]",
                      (callStatus === "connecting" ||
                        callStatus === "transcribing" ||
                        callStatus === "thinking") &&
                        "bg-[var(--chart-3)]",
                      callStatus === "speaking" && "bg-primary",
                      (!callActive || callStatus === "muted") && "bg-muted-foreground",
                    )}
                  />
                  {getVoiceCallStatusLabel(callStatus)}
                </Badge>
                {callActive || callSeconds > 0 ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatCallDuration(callSeconds)}
                  </span>
                ) : null}
              </div>
            </div>
            <VoiceActivity
              status={callActive ? callStatus : "idle"}
              compact
              className="ml-auto shrink-0 md:hidden xl:grid"
            />
          </div>

          <div className="flex flex-nowrap items-center gap-1.5 md:shrink-0">
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="shrink-0"
              aria-label="开始新对话"
              onClick={startNewConversation}
            >
              <MessageSquarePlusIcon data-icon="inline-start" />
              新话题
            </Button>
            <ConversationHistorySheet
              currentSessionId={currentSessionId}
              onDelete={deleteConversation}
              onSelect={loadConversation}
              sessions={history}
            />
            <ConversationSettingsPopover
              apiVoice={apiVoice}
              disabled={callActive || pending || speechPlaybackState !== "idle"}
              asrOptions={asrEngineOptions}
              asrTransport={asrTransport}
              ttsTransport={ttsTransport}
              onApiVoiceChange={selectApiVoice}
              onAsrTransportSelect={selectAsrTransport}
              onTtsTransportSelect={selectTtsTransport}
              onAsrSelect={selectAsrEngine}
              onVoicePreview={previewVoice}
              onVoiceSelect={selectVoice}
              previewingVoice={previewingVoice}
              selectedAsrEngine={selectedAsrEngine}
              selectedTutorMode={prefs.tutorMode}
              selectedVoice={selectedVoice}
              onTutorModeSelect={selectTutorMode}
              voiceOptions={voiceOptions}
            />
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="hidden min-[1200px]:inline-flex"
              aria-label={guideCollapsed ? "展开场景与练习提示" : "收起场景与练习提示"}
              aria-expanded={!guideCollapsed}
              onClick={() => {
                const next = !guideCollapsed
                window.localStorage.setItem(
                  "moss:conversation-guide:v1",
                  next ? "collapsed" : "expanded",
                )
                setGuideCollapsed(next)
              }}
            >
              <ListChecksIcon data-icon="inline-start" />
              提示
            </Button>
            <ConversationGuideSheet messages={messages} scene={scene} />
          </div>
        </header>

        <div className="grid shrink-0 grid-cols-3 border-b bg-muted/20 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center md:gap-5 md:px-7">
          <div className="col-span-3 min-w-0 pb-2 md:col-span-1 md:pb-0">
            <p className="text-[10px] font-semibold text-muted-foreground">本轮目标</p>
            <p className="mt-0.5 text-xs leading-5">{scene.objective}</p>
          </div>
          <SessionMetric icon={<Clock3Icon />} label="已完成" value={`${turnCount} 轮`} />
          <SessionMetric
            icon={latestInputMode === "voice" ? <MicIcon /> : <KeyboardIcon />}
            label="最近输入"
            value={
              latestInputMode === "voice"
                ? "语音"
                : latestInputMode === "text"
                  ? "文字"
                  : "未开始"
            }
          />
          <SessionMetric
            icon={
              speechPlaybackState === "loading" ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <Volume2Icon />
              )
            }
            label="AI 回复"
            value={
              speechPlaybackState === "loading"
                ? "合成中"
                : speechPlaybackState === "playing"
                  ? "播放中"
                  : "自动播报"
            }
          />
        </div>

        <div
          ref={transcriptRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 md:px-7 pb-30"
          role="log"
          aria-label="实时对话内容"
        >
          <div
            className="mx-auto w-full max-w-5xl"
            style={{ paddingBottom: composerHeight + 24 }}
          >
            <div className="flex items-center gap-3 py-5">
              <Separator className="flex-1" />
              <span className="font-mono text-[10px] text-muted-foreground">TRANSCRIPT</span>
              <Separator className="flex-1" />
            </div>

            <div className={cn(prefs.transcriptLayout === "stacked" && "divide-y")}>
              {messages.map((message) => (
                <TranscriptTurn
                  key={message.id}
                  message={message}
                  partnerName={scene.partnerName}
                  onDelete={deleteMessage}
                  onSpeak={speak}
                  onRetry={retryLastReply}
                  layout={prefs.transcriptLayout}
                />
              ))}
            </div>

            {liveTranscript || callStatus === "listening" || callStatus === "transcribing" ? (
              <LiveTranscriptTurn
                layout={prefs.transcriptLayout}
                status={callStatus}
                text={liveTranscript}
              />
            ) : null}

            {pending ? (
              <PendingReplyTurn
                layout={prefs.transcriptLayout}
                partnerName={scene.partnerName}
              />
            ) : null}
          </div>
        </div>

        <div
          ref={composerRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 md:px-5 md:pb-4"
        >
          <div className="pointer-events-auto mx-auto w-full max-w-lg">
            {callActive ? (
              <VoiceCallPanel
                callSeconds={callSeconds}
                callStatus={callStatus}
                idlePrompt={idlePrompt}
                muted={muted}
                onEndCall={endCall}
                onToggleMute={toggleMute}
                onToggleSpeaker={toggleSpeaker}
                speakerEnabled={speakerEnabled}
                speechRecognitionProgress={speechRecognitionProgress}
              />
            ) : (
              <form
                onSubmit={handleSubmit}
                className="rounded-lg border bg-background/85 shadow-lg ring-1 ring-black/5 backdrop-blur transition-all duration-300 dark:ring-white/5"
              >
                <InputGroup
                  className={cn(
                    // The send button is disabled while the draft is empty. That is a fact about
                    // one control, not about the field, so the group opts out of every primitive
                    // dimming rule: the tinted `has-disabled` fill in light mode, the unconditional
                    // `dark:bg-input/30` wash, and the group opacity drop. The border and focus ring
                    // stay, so the field still reads as editable and clickable.
                    "rounded-lg border-0 bg-transparent dark:bg-transparent",
                    "has-disabled:bg-transparent has-disabled:opacity-100",
                    "dark:has-disabled:bg-transparent",
                    "transition-[min-height] duration-300 ease-out",
                    composerExpanded ? "min-h-24" : "min-h-10",
                  )}
                >
                  <InputGroupTextarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleDraftKeyDown}
                    onFocus={() => setComposerExpanded(true)}
                    rows={composerExpanded ? 2 : 1}
                    placeholder="输入中文或英文消息…"
                    aria-label="输入对话内容"
                    className={cn(
                      "py-1 transition-[min-height] duration-300 ease-out",
                      composerExpanded ? "min-h-14" : "min-h-8",
                    )}
                  />
                  <InputGroupAddon align="block-end" className="gap-1.5 px-2 py-0 pb-1">
                    <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                      <KeyboardIcon className="size-3.5" aria-hidden="true" />
                      文字输入
                      <span className="hidden text-[10px] text-muted-foreground/80 sm:inline">
                        · {prefs.sendShortcut === "enter" ? "Enter 发送" : "Shift+Enter 发送"}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={composerExpanded ? "收起输入框" : "展开输入框"}
                      title={composerExpanded ? "收起输入框" : "展开输入框"}
                      onClick={() => setComposerExpanded((current) => !current)}
                    >
                      {composerExpanded ? (
                        <ChevronDownIcon aria-hidden="true" />
                      ) : (
                        <ChevronUpIcon aria-hidden="true" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={
                        speechRecognitionAvailable
                          ? "切换到语音模式"
                          : "当前浏览器不支持实时语音"
                      }
                      title={
                        speechRecognitionAvailable
                          ? "切换到语音模式"
                          : "当前浏览器不支持实时语音"
                      }
                      onClick={startCall}
                    >
                      <MicIcon data-icon="inline-start" />
                      语音
                    </Button>
                    <InputGroupButton
                      type="submit"
                      size="icon-sm"
                      variant="default"
                      aria-label={pending ? "打断上一条回复并发送" : "发送消息"}
                      title={pending ? "打断上一条回复并发送" : "发送消息"}
                      disabled={!draft.trim()}
                    >
                      <SendIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </form>
            )}
          </div>
        </div>
      </section>
      <ConversationGuideAside
        collapsed={guideCollapsed}
        messages={messages}
        onCollapsedChange={setGuideCollapsed}
        scene={scene}
      />
    </div>
  )
}

export function ConversationSettingsPopover({
  apiVoice,
  asrOptions,
  asrTransport,
  disabled,
  onApiVoiceChange,
  onAsrSelect,
  onAsrTransportSelect,
  onTtsTransportSelect,
  onTutorModeSelect,
  onVoicePreview,
  onVoiceSelect,
  previewingVoice,
  selectedAsrEngine,
  selectedTutorMode,
  selectedVoice,
  ttsTransport,
  voiceOptions,
}: {
  apiVoice: string
  asrOptions: AsrEngineOption[]
  asrTransport: SpeechTransport
  disabled: boolean
  onApiVoiceChange: (voice: string) => void
  onAsrSelect: (engine: AsrEngine) => void
  onAsrTransportSelect: (transport: SpeechTransport) => void
  onTtsTransportSelect: (transport: SpeechTransport) => void
  onTutorModeSelect: (mode: TutorMode) => void
  onVoicePreview: (value: string) => void
  onVoiceSelect: (value: string) => void
  previewingVoice: string | null
  selectedAsrEngine: AsrEngine
  selectedTutorMode: TutorMode
  selectedVoice: string
  ttsTransport: SpeechTransport
  voiceOptions: ConversationVoiceOption[]
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-label="打开对话设置"
            title="打开对话设置"
          />
        }
      >
        <SettingsIcon data-icon="inline-start" />
        设置
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-80 gap-0 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">对话设置</p>
        </div>
        <div className="grid gap-4 p-4">
          <div className="grid gap-1.5 text-xs font-medium">
            <span>导师模式</span>
            <Select
              disabled={disabled}
              items={tutorModes}
              value={selectedTutorMode}
              onValueChange={(value) => {
                if (value) {
                  onTutorModeSelect(value as TutorMode)
                }
              }}
            >
              <SelectTrigger size="sm" className="w-full" aria-label="选择导师模式">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {tutorModes.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <TransportSelect
            disabled={disabled}
            hint={
              asrTransport === "api"
                ? "整段上传识别，不提供实时字幕与说话打断。"
                : asrTransport === "browser"
                  ? "使用浏览器语音识别，无需本机服务。"
                  : "使用本机 ASR 服务，未启动时自动回退浏览器语音。"
            }
            label="识别来源"
            onSelect={onAsrTransportSelect}
            value={asrTransport}
          />
          <div className="grid gap-1.5 text-xs font-medium">
            <span>识别引擎</span>
            {asrTransport === "local" ? (
              <AsrPicker
                className="w-full max-w-none"
                disabled={disabled}
                onSelect={onAsrSelect}
                options={asrOptions}
                selectedEngine={selectedAsrEngine}
              />
            ) : (
              <p className="rounded-md bg-muted px-3 py-2 text-xs font-normal text-muted-foreground">
                {describeSpeechTransport("asr", asrTransport)}不区分引擎。
              </p>
            )}
          </div>
          <TransportSelect
            disabled={disabled}
            hint={
              ttsTransport === "browser"
                ? "使用浏览器系统语音，音色由系统决定。"
                : "未启动或不可达时自动回退系统语音。"
            }
            label="播报来源"
            onSelect={onTtsTransportSelect}
            value={ttsTransport}
          />
          <div className="grid gap-1.5 text-xs font-medium">
            <span>{ttsTransport === "api" ? "接口音色" : "语音音色"}</span>
            {ttsTransport === "browser" ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs font-normal text-muted-foreground">
                系统语音会按语言自动选择音色。
              </p>
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <VoicePicker
                  className="w-full max-w-none justify-between"
                  disabled={disabled}
                  onPreview={onVoicePreview}
                  onSelect={onVoiceSelect}
                  options={voiceOptions}
                  previewingVoice={previewingVoice}
                  selectedVoice={selectedVoice}
                />
                {ttsTransport === "api" ? (
                  <Input
                    aria-label="接口音色名称"
                    className="h-8 w-28 shrink-0"
                    disabled={disabled}
                    onChange={(event) => onApiVoiceChange(event.target.value)}
                    placeholder="alloy"
                    title="自建网关可使用任意音色名称"
                    value={apiVoice}
                  />
                ) : null}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TransportSelect({
  disabled,
  hint,
  label,
  onSelect,
  value,
}: {
  disabled: boolean
  hint: string
  label: string
  onSelect: (transport: SpeechTransport) => void
  value: SpeechTransport
}) {
  return (
    <div className="grid gap-1.5 text-xs font-medium">
      <span>{label}</span>
      <Select
        disabled={disabled}
        items={speechTransportItems}
        value={value}
        onValueChange={(next) => {
          if (next) {
            onSelect(next as SpeechTransport)
          }
        }}
      >
        <SelectTrigger size="sm" className="w-full" aria-label={`选择${label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {speechTransportItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <span className="text-[11px] font-normal text-muted-foreground">{hint}</span>
    </div>
  )
}

function AsrPicker({
  className,
  disabled,
  onSelect,
  options,
  selectedEngine,
}: {
  className?: string
  disabled: boolean
  onSelect: (engine: AsrEngine) => void
  options: AsrEngineOption[]
  selectedEngine: AsrEngine
}) {
  return (
    <Select
      disabled={disabled}
      items={options}
      value={selectedEngine}
      onValueChange={(value) => onSelect(value as AsrEngine)}
    >
      <SelectTrigger
        size="sm"
        aria-label="选择语音识别引擎"
        className={cn("max-w-40", className)}
      >
        <WavesIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false} className="min-w-64">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0">{option.label}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function VoicePicker({
  className,
  disabled,
  onPreview,
  onSelect,
  options,
  previewingVoice,
  selectedVoice,
}: {
  className?: string
  disabled: boolean
  onPreview: (value: string) => void
  onSelect: (value: string) => void
  options: ConversationVoiceOption[]
  previewingVoice: string | null
  selectedVoice: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === selectedVoice) ?? options[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("max-w-44", className)}
            aria-label="选择语音引擎与音色"
            disabled={disabled}
          />
        }
      >
        <AudioLinesIcon data-icon="inline-start" />
        <span className="truncate">{selected?.label ?? "选择音色"}</span>
        <ChevronDownIcon
          data-icon="inline-end"
          className={cn("transition-transform", open && "rotate-180")}
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-72 w-72 gap-0 overflow-y-auto p-1">
        {options.map((voice) => {
          const previewing = previewingVoice === voice.value
          const active = selectedVoice === voice.value
          return (
            <div
              key={voice.value}
              className={cn(
                "flex min-w-0 items-center gap-1 rounded-md p-1 transition-colors hover:bg-muted",
                active && "bg-accent text-accent-foreground",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 px-1.5 py-1 text-left outline-none"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => {
                  onSelect(voice.value)
                  setOpen(false)
                }}
              >
                <span className="block truncate text-sm font-medium">{voice.name}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {voice.quality} · {voice.language}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`试听 ${voice.name}`}
                aria-pressed={previewing}
                disabled={disabled}
                title={`试听 ${voice.name}`}
                onClick={() => onPreview(voice.value)}
              >
                {previewing ? (
                  <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
                ) : (
                  <AudioWaveformIcon aria-hidden="true" />
                )}
              </Button>
            </div>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

function SessionMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-t py-2 first:border-r md:border-l md:border-t-0 md:py-0 md:pl-5 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-primary">
      {icon}
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-medium">{value}</p>
      </div>
    </div>
  )
}

export const TranscriptTurn = memo(function TranscriptTurn({
  message,
  partnerName,
  onDelete,
  onRetry,
  onSpeak,
  layout,
}: {
  message: ConversationMessage
  partnerName: string
  onDelete?: (messageId: string) => void
  onRetry: () => void
  onSpeak: (text: string, force?: boolean) => void
  layout: TranscriptLayout
}) {
  const assistant = message.role === "assistant"
  const errorTurn = message.variant === "error"
  const [translationVisible, setTranslationVisible] = useState(false)
  const [translation, setTranslation] = useState(message.translation)
  const [translating, setTranslating] = useState(false)
  // In split mode the learner's own turns hug the right edge like a chat thread. The
  // partner (assistant) always stays left so validation and examples have room to breathe.
  const alignRight = layout === "split" && !assistant

  async function handleTranslation() {
    if (translationVisible) {
      setTranslationVisible(false)
      return
    }
    if (translation) {
      setTranslationVisible(true)
      return
    }

    setTranslating(true)
    try {
      const translated = await requestConversationTranslation(message.content)
      setTranslation(translated)
      setTranslationVisible(true)
    } catch (error) {
      toast.error(describeUserError(error, "翻译服务暂时不可用，请稍后重试。"))
    } finally {
      setTranslating(false)
    }
  }

  return (
    <article
      className={cn(
        "grid scroll-mt-4 gap-3 py-5 [contain-intrinsic-size:auto_180px] [content-visibility:auto]",
        alignRight ? "grid-cols-[minmax(0,1fr)_40px]" : "grid-cols-[40px_minmax(0,1fr)]",
      )}
      data-transcript-turn={message.id}
    >
      {alignRight ? null : (
        <Avatar>
          <AvatarFallback
            className={cn(
              assistant
                ? "bg-foreground text-background"
                : "bg-primary text-primary-foreground",
            )}
          >
            {assistant ? partnerName.slice(0, 1) : "你"}
          </AvatarFallback>
        </Avatar>
      )}
      <div className={cn("min-w-0", alignRight && "flex flex-col items-end text-right")}>
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold">{assistant ? partnerName : "你"}</p>
          <span className="font-mono text-[10px] text-muted-foreground">
            {message.timestamp}
          </span>
          {!assistant ? (
            <span
              className="flex items-center gap-1 text-[10px] text-muted-foreground"
              title={message.inputMode === "voice" ? "语音输入" : "文字输入"}
            >
              {message.inputMode === "voice" ? (
                <MicIcon className="size-3" aria-hidden="true" />
              ) : (
                <KeyboardIcon className="size-3" aria-hidden="true" />
              )}
              <span className="sr-only">
                {message.inputMode === "voice" ? "语音输入" : "文字输入"}
              </span>
            </span>
          ) : null}
          {errorTurn ? (
            <span className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-[10px] font-medium text-destructive">
              <CircleAlertIcon className="size-3" aria-hidden="true" />
              临时错误
            </span>
          ) : null}
          {assistant && !errorTurn ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="播放本轮英语"
              title="播放本轮英语"
              onClick={() => onSpeak(message.content, true)}
            >
              <Volume2Icon />
            </Button>
          ) : null}
        </div>
        {errorTurn ? (
          // A transient failure is usually one short line, so the bubble hugs its copy instead of
          // stretching the whole grid track. max-w-full keeps long copy wrapping at 320px.
          <div className="mt-2 w-fit max-w-full">
            <div
              className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-destructive"
              data-error-message
            >
              <p className="text-sm leading-6">{message.content}</p>
            </div>
            <div
              className={cn("mt-1 flex items-center gap-1", alignRight && "justify-end")}
              data-error-actions
            >
              <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
                <RotateCcwIcon data-icon="inline-start" />
                重试
              </Button>
              {onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="删除这条错误消息"
                  onClick={() => onDelete(message.id)}
                >
                  <Trash2Icon data-icon="inline-start" />
                  删除
                </Button>
              ) : null}
            </div>
          </div>
        ) : assistant ? (
          <EnglishReplyContent content={message.content} />
        ) : (
          <p
            className={cn(
              "mt-2 font-serif text-base leading-7 whitespace-pre-line",
              alignRight
                ? "inline-block max-w-[85%] rounded-2xl rounded-tr-sm border border-primary/25 bg-accent/55 px-3.5 py-2 text-left text-foreground"
                : "rounded-md border-l-4 border-primary bg-accent/55 px-3 py-2 text-foreground",
            )}
          >
            {message.content}
          </p>
        )}
        {!errorTurn && !assistant && onDelete ? (
          <div
            className={cn("mt-1 flex items-center gap-1", alignRight && "justify-end")}
            data-turn-actions
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              aria-label="删除这条识别消息"
              onClick={() => onDelete(message.id)}
            >
              <Trash2Icon data-icon="inline-start" />
              删除
            </Button>
          </div>
        ) : null}
        {assistant && !errorTurn ? (
          <AssistantSupportPanel
            note={message.note}
            onToggleTranslation={handleTranslation}
            translating={translating}
            translation={translation}
            translationVisible={translationVisible}
          />
        ) : null}
        {assistant && !errorTurn && message.validation && message.feedbackFor ? (
          <ExpressionValidationFeedback
            inputAnalysis={message.inputAnalysis}
            onSpeak={onSpeak}
            original={message.feedbackFor}
            validation={message.validation}
          />
        ) : null}
      </div>
      {alignRight ? (
        <Avatar>
          <AvatarFallback className="bg-primary text-primary-foreground">你</AvatarFallback>
        </Avatar>
      ) : null}
    </article>
  )
})

// Interim speech recognition results, shown while the learner is still speaking.
function LiveTranscriptTurn({
  layout,
  status,
  text,
}: {
  layout: TranscriptLayout
  status: VoiceCallStatus
  text: string
}) {
  const alignRight = layout === "split"
  return (
    <article
      className={cn(
        "grid gap-3 py-5",
        alignRight ? "grid-cols-[minmax(0,1fr)_40px]" : "grid-cols-[40px_minmax(0,1fr)]",
      )}
      aria-live="polite"
    >
      {alignRight ? null : (
        <Avatar>
          <AvatarFallback className="bg-primary text-primary-foreground">你</AvatarFallback>
        </Avatar>
      )}
      <div className={cn("min-w-0", alignRight && "flex flex-col items-end text-right")}>
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold">你</p>
          <span className="flex items-center gap-1 text-[11px] text-[var(--success)]">
            <span className="size-1.5 animate-pulse rounded-full bg-[var(--success)]" />
            {status === "transcribing" ? "本地识别中" : "离线语音识别"}
          </span>
        </div>
        <p
          className={cn(
            !text ? "text-xs" : "text-base",
            "mt-2 leading-7 text-muted-foreground",
          )}
        >
          {text ||
            (status === "transcribing"
              ? "正在将这句话转换为文字…"
              : "可以说中文、英文或中英混合内容…")}
        </p>
      </div>
      {alignRight ? (
        <Avatar>
          <AvatarFallback className="bg-primary text-primary-foreground">你</AvatarFallback>
        </Avatar>
      ) : null}
    </article>
  )
}

// Animated placeholder shown while the assistant reply is being generated.
function PendingReplyTurn({
  layout,
  partnerName,
}: {
  layout: TranscriptLayout
  partnerName: string
}) {
  return (
    <article
      className={cn(
        "grid grid-cols-[40px_minmax(0,1fr)] gap-3 py-5",
        layout === "stacked" && "border-t",
      )}
      aria-live="polite"
    >
      <Avatar>
        <AvatarFallback className="bg-foreground text-background">
          {partnerName.slice(0, 1)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-xs font-semibold">{partnerName}</p>
        <div className="mt-3 flex items-center gap-2.5 text-sm text-muted-foreground">
          <VoiceActivity status="thinking" compact />
          <span>正在回应</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current" />
          </span>
        </div>
        <div className="mt-3 max-w-md space-y-2">
          <span className="block h-3 w-4/5 animate-pulse rounded-full bg-muted" />
          <span className="block h-3 w-3/5 animate-pulse rounded-full bg-muted [animation-delay:-0.2s]" />
        </div>
      </div>
    </article>
  )
}

// The floating in-call panel: live status plus mic / hang-up / speaker controls.
export function VoiceCallPanel({
  callSeconds,
  callStatus,
  idlePrompt,
  muted,
  onEndCall,
  onToggleMute,
  onToggleSpeaker,
  speakerEnabled,
  speechRecognitionProgress,
}: {
  callSeconds: number
  callStatus: VoiceCallStatus
  idlePrompt?: string | null
  muted: boolean
  onEndCall: () => void
  onToggleMute: () => void
  onToggleSpeaker: () => void
  speakerEnabled: boolean
  speechRecognitionProgress: number | null
}) {
  return (
    <div className="grid min-h-16 gap-3 rounded-lg border bg-background/85 px-3 py-3 shadow-lg ring-1 ring-black/5 backdrop-blur duration-300 animate-in fade-in slide-in-from-bottom-2 min-[480px]:grid-cols-[minmax(0,1fr)_auto] min-[480px]:items-center dark:ring-white/5">
      <div className="flex min-w-0 items-center gap-3" aria-live="polite">
        <VoiceActivity status={callStatus} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{getVoiceCallStatusLabel(callStatus)}</p>
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatCallDuration(callSeconds)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {idlePrompt ??
              (callStatus === "connecting" &&
              speechRecognitionProgress !== null &&
              speechRecognitionProgress < 100
                ? `首次加载离线识别模型 ${speechRecognitionProgress}%`
                : getVoiceCallStatusDescription(callStatus))}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-2">
        <Button
          type="button"
          variant={muted ? "default" : "outline"}
          size="icon-lg"
          className="rounded-full"
          aria-label={muted ? "打开麦克风" : "静音麦克风"}
          title={muted ? "打开麦克风" : "静音麦克风"}
          onClick={onToggleMute}
        >
          {muted ? <MicOffIcon /> : <MicIcon />}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="icon-lg"
          className="rounded-full"
          aria-label="结束通话并切换到文字输入"
          title="结束通话"
          onClick={onEndCall}
        >
          <PhoneOffIcon />
        </Button>
        <Button
          type="button"
          variant={speakerEnabled ? "outline" : "default"}
          size="icon-lg"
          className="rounded-full"
          aria-label={speakerEnabled ? "关闭语音播报" : "打开语音播报"}
          title={speakerEnabled ? "关闭语音播报" : "打开语音播报"}
          onClick={onToggleSpeaker}
        >
          {speakerEnabled ? <Volume2Icon /> : <VolumeXIcon />}
        </Button>
      </div>
    </div>
  )
}

export function ExpressionValidationFeedback({
  inputAnalysis,
  onSpeak,
  original,
  speechBusy = false,
  validation,
}: {
  inputAnalysis?: ConversationInputAnalysis
  onSpeak: (text: string, force?: boolean) => void
  original: string
  speechBusy?: boolean
  validation: ExpressionValidation
}) {
  if (validation.status === "unavailable") {
    return null
  }

  const accurate = validation.status === "accurate"
  const guidance = validation.status === "guidance"
  const correctionSegments = getCorrectionSegments(original, validation.corrected)
  const originalSegments = getOriginalErrorSegments(
    original,
    validation.corrected,
    validation.issues,
  )

  return (
    <div
      className={cn(
        "mt-4 min-w-0 border-l-2 py-1 pl-3",
        accurate
          ? "border-[var(--success)]"
          : guidance
            ? "border-primary"
            : "border-destructive",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold",
            accurate ? "text-[var(--success)]" : guidance ? "text-primary" : "text-destructive",
          )}
        >
          {accurate ? (
            <CheckCircle2Icon className="size-3.5" aria-hidden="true" />
          ) : guidance ? (
            <LanguagesIcon className="size-3.5" aria-hidden="true" />
          ) : (
            <CircleAlertIcon className="size-3.5" aria-hidden="true" />
          )}
          {accurate ? "表达自然" : guidance ? "表达参考" : "发现表达问题"}
        </div>
        {inputAnalysis ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {inputLanguageLabels[inputAnalysis.language]} ·{" "}
            {conversationIntentLabels[inputAnalysis.intent]}
          </span>
        ) : null}
      </div>

      {!accurate && !guidance ? (
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">你的原句</p>
            <p className="mt-1 break-words font-serif text-sm leading-6 text-foreground">
              {originalSegments.map((segment, index) =>
                segment.changed ? (
                  <mark
                    key={`${segment.text}-${index}`}
                    className="rounded-sm bg-destructive/15 px-0.5 text-destructive"
                  >
                    {segment.text}
                  </mark>
                ) : (
                  <span key={`${segment.text}-${index}`}>{segment.text}</span>
                ),
              )}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">建议表达</p>
            <p className="mt-1 break-words font-serif text-sm leading-6 text-foreground">
              {correctionSegments.map((segment, index) =>
                segment.changed ? (
                  <mark
                    key={`${segment.text}-${index}`}
                    className="rounded-sm bg-amber-300 px-0.5 text-amber-950 dark:bg-amber-300 dark:text-amber-950"
                  >
                    {segment.text}
                  </mark>
                ) : (
                  <span key={`${segment.text}-${index}`}>{segment.text}</span>
                ),
              )}
            </p>
          </div>
        </div>
      ) : null}

      {guidance ? (
        <div className="mt-3 flex min-w-0 items-start gap-2">
          <p className="min-w-0 flex-1 break-words font-serif text-base leading-7 text-foreground">
            {validation.corrected}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            aria-label="播放参考表达"
            title="播放参考表达"
            disabled={speechBusy}
            onClick={() => onSpeak(validation.corrected, true)}
          >
            {speechBusy ? (
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <Volume2Icon />
            )}
          </Button>
        </div>
      ) : null}

      <p className="mt-2 text-xs leading-5 text-muted-foreground">{validation.explanation}</p>

      {validation.issues.length > 0 ? (
        <div className="mt-3 divide-y border-y">
          {validation.issues.map((issue, index) => (
            <div
              key={`${issue.original}-${issue.corrected}-${index}`}
              className="grid min-w-0 gap-1 py-2.5 sm:grid-cols-[4.5rem_minmax(0,1fr)]"
            >
              <span className="text-[11px] font-medium text-destructive">
                {issueKindLabels[issue.kind]}
              </span>
              <div className="min-w-0">
                <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                  <span className="break-words text-destructive line-through">
                    {issue.original}
                  </span>
                  <ArrowRightIcon
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="break-words font-medium text-foreground">
                    {issue.corrected}
                  </span>
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {issue.explanation}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {validation.examples.length > 0 ? (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <BookOpenIcon className="size-3.5 text-primary" aria-hidden="true" />
            常用例句
          </div>
          <div className="mt-1 divide-y">
            {validation.examples.map((example, index) => (
              <div
                key={`${example.english}-${index}`}
                className="flex min-w-0 items-start gap-2 py-2"
              >
                <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-serif text-sm leading-6 text-foreground">
                    {example.english}
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">{example.chinese}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  aria-label={`播放例句 ${index + 1}`}
                  title="播放例句"
                  disabled={speechBusy}
                  onClick={() => onSpeak(example.english, true)}
                >
                  {speechBusy ? (
                    <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Volume2Icon />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
