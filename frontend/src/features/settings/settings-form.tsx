"use client"

import {
  AudioLinesIcon,
  BotIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleXIcon,
  CloudIcon,
  CloudOffIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  MessagesSquareIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  RefreshCwIcon,
  SaveIcon,
  TargetIcon,
  Trash2Icon,
  Volume2Icon,
  XIcon,
} from "lucide-react"
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useLearningMemory } from "@/components/learning-memory-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useConversationPrefs } from "@/features/conversation/use-conversation-prefs"
import { AccountDataControls } from "@/features/settings/account-data-controls"
import { ConversationPromptEditor } from "@/features/settings/conversation-prompt-editor"
import { ConversationTimingFields } from "@/features/settings/conversation-timing-fields"
import { settingsCardHeightClass } from "@/features/settings/settings-layout"
import { SpeechServiceCard } from "@/features/settings/speech-service-card"
import { useLocalTts } from "@/features/speech/use-local-tts"
import { useTtsConfig } from "@/features/speech/use-tts-config"
import type { SendShortcut, TranscriptLayout } from "@/lib/conversation-prefs"
import {
  defaultModelConfig,
  defaultModelConfigCollection,
  getModelInferenceConfig,
  getModelRequestUrl,
  isModelConfigComplete,
  isValidModelEndpoint,
  type LocalModelConfig,
  type LocalModelConfigCollection,
  type ModelProvider,
  modelConfigStorageKey,
  parseModelConfigCollection,
  type SavedModelConfig,
  toLocalModelConfig,
} from "@/lib/model-config"
import {
  createModelConfigEnvelope,
  resetModelConfigPublicKey,
} from "@/lib/model-config-envelope"
import { getSelectedVoiceValue, ttsVoiceOptions } from "@/lib/tts-config"
import { describeUserError, isUserFacingCopy, toUserFacingError } from "@/lib/user-error"
import { cn } from "@/lib/utils"

const providerItems = [
  { label: "OpenAI Compatible", value: "openai-compatible" },
  { label: "OpenAI", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
  { label: "自定义代理", value: "custom" },
] as const

const apiTypeItems = [
  { label: "Chat Completions", value: "chat-completions" },
  { label: "Anthropic Messages", value: "anthropic-messages" },
  { label: "自定义请求地址", value: "custom" },
] as const

const commonModelNames = [
  "gpt-5-mini",
  "gpt-4.1-mini",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "deepseek-chat",
  "qwen-plus",
  "gemini-2.5-flash",
] as const

const transcriptLayoutItems: { label: string; value: TranscriptLayout; hint: string }[] = [
  { label: "统一靠左", value: "stacked", hint: "问答都靠左，连续排版" },
  { label: "问答分列", value: "split", hint: "你的话靠右，回答靠左" },
]

const sendShortcutItems: { label: string; value: SendShortcut; hint: string }[] = [
  { label: "Enter 发送", value: "enter", hint: "Shift+Enter 换行" },
  { label: "Shift+Enter 发送", value: "shift-enter", hint: "Enter 换行" },
]

// Card bodies size to their own content so a short preference card never stretches to match its
// row neighbour, which is what produced tall empty blocks between sections. The cap itself lives in
// `settings-layout` so every settings card shares one cap.

const providerDefaults: Record<
  Exclude<ModelProvider, "custom">,
  Pick<LocalModelConfig, "apiType" | "endpoint">
> = {
  "openai-compatible": {
    apiType: "chat-completions",
    endpoint: "",
  },
  openai: {
    apiType: "chat-completions",
    endpoint: "https://api.openai.com/v1",
  },
  anthropic: {
    apiType: "anthropic-messages",
    endpoint: "https://api.anthropic.com/v1",
  },
}

type ValidationStatus = "idle" | "validating" | "success" | "error"

async function validateModelConnection(config: LocalModelConfig) {
  const modelConfig = getModelInferenceConfig(config)
  if (!modelConfig) {
    throw new Error("模型配置不完整")
  }

  const sendRequest = async () =>
    fetch("/api/conversation", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelConfigEnvelope: await createModelConfigEnvelope(modelConfig),
      }),
    })
  let response = await sendRequest()
  if (response.status === 409) {
    const result = (await response.clone().json()) as { error?: { code?: string } }
    if (result.error?.code === "model_config_key_expired") {
      resetModelConfigPublicKey()
      response = await sendRequest()
    }
  }

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: { message?: string }
    } | null
    throw toUserFacingError(
      isUserFacingCopy(result?.error?.message)
        ? result?.error?.message
        : { status: response.status },
      "模型配置保存失败，请稍后重试。",
      { status: response.status },
    )
  }
}

export function SettingsForm() {
  const { hydrated, lastSyncedAt, state, syncError, syncNow, syncStatus, updateProfile } =
    useLearningMemory()
  const { prefs, setPrefs } = useConversationPrefs()
  const { config: ttsConfig, selectVoice } = useTtsConfig()
  const { previewVoice } = useLocalTts()
  const [modelConfigs, setModelConfigs] = useState<LocalModelConfigCollection>(
    defaultModelConfigCollection,
  )
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null)
  const [configEditorOpen, setConfigEditorOpen] = useState(false)
  const [configName, setConfigName] = useState("")
  const [config, setConfig] = useState<LocalModelConfig>(defaultModelConfig)
  const [showApiKey, setShowApiKey] = useState(false)
  const [learningGoal, setLearningGoal] = useState(state.profile.goal)
  const [dailyMinutes, setDailyMinutes] = useState(state.profile.dailyMinutes)
  const [preferredContext, setPreferredContext] = useState(state.profile.preferredContext)
  const [autoRecall, setAutoRecall] = useState(state.profile.autoRecall)
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>("idle")
  const [previewingVoice, setPreviewingVoice] = useState(false)
  const [savedValidationStatus, setSavedValidationStatus] = useState<
    Record<string, ValidationStatus>
  >({})

  const requestUrl = useMemo(
    () => getModelRequestUrl(config.endpoint, config.apiType),
    [config.apiType, config.endpoint],
  )
  const selectedVoiceValue = getSelectedVoiceValue(ttsConfig)
  const selectedVoice =
    ttsVoiceOptions.find((option) => option.value === selectedVoiceValue) ?? ttsVoiceOptions[0]
  const endpointInvalid = Boolean(config.endpoint) && !isValidModelEndpoint(config.endpoint)
  const draftConfig = { ...config, enabled: true }
  const draftComplete = isModelConfigComplete(draftConfig)
  const syncDescription = {
    connecting: "正在连接 Supabase 并读取云端记忆。",
    local: "当前为本机模式。登录且配置 Supabase 后会自动启用跨设备同步。",
    syncing: "正在合并并上传最新学习记录。",
    synced: lastSyncedAt
      ? `已同步 · ${new Date(lastSyncedAt).toLocaleString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          month: "numeric",
          day: "numeric",
        })}`
      : "学习记忆已同步。",
    offline: "当前离线，学习记录已保存在本机，联网后会自动补传。",
    error: syncError || "同步失败，本机记录仍然可用。",
  }[syncStatus]

  useEffect(() => {
    const stored = window.localStorage.getItem(modelConfigStorageKey)
    const parsed = parseModelConfigCollection(stored)
    setModelConfigs(parsed)
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    setLearningGoal(state.profile.goal)
    setDailyMinutes(state.profile.dailyMinutes)
    setPreferredContext(state.profile.preferredContext)
    setAutoRecall(state.profile.autoRecall)
  }, [hydrated, state.profile])

  function handleProviderChange(provider: ModelProvider) {
    const defaults = provider === "custom" ? null : providerDefaults[provider]
    setConfig((current) => ({
      ...current,
      provider,
      apiType: defaults?.apiType ?? "custom",
      endpoint: defaults?.endpoint ?? current.endpoint,
    }))
    setValidationStatus("idle")
  }

  function persistModelConfigs(next: LocalModelConfigCollection) {
    setModelConfigs(next)
    window.localStorage.setItem(modelConfigStorageKey, JSON.stringify(next))
  }

  function handleSelectConfig(savedConfig: SavedModelConfig) {
    if (savedConfig.id === modelConfigs.activeConfigId) {
      toast.info("使用中的配置需先停用再编辑")
      return
    }
    setSelectedConfigId(savedConfig.id)
    setConfigName(savedConfig.name)
    setConfig(toLocalModelConfig(savedConfig, false))
    setConfigEditorOpen(true)
    setValidationStatus("idle")
  }

  function handleNewConfig() {
    if (configEditorOpen && selectedConfigId === null) {
      setConfigEditorOpen(false)
      return
    }
    setSelectedConfigId(null)
    setConfigName("")
    setConfig(defaultModelConfig)
    setShowApiKey(false)
    setConfigEditorOpen(true)
    setValidationStatus("idle")
  }

  function handleCloseConfigEditor() {
    setConfigEditorOpen(false)
    setSelectedConfigId(null)
    setShowApiKey(false)
    setValidationStatus("idle")
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draftComplete) {
      toast.error("请填写完整且安全的模型配置")
      return
    }

    const id = selectedConfigId ?? globalThis.crypto.randomUUID()
    const savedConfig: SavedModelConfig = {
      id,
      name: configName.trim() || config.model.trim(),
      provider: config.provider,
      apiType: config.apiType,
      endpoint: config.endpoint.trim(),
      model: config.model.trim(),
      apiKey: config.apiKey.trim(),
    }
    const exists = modelConfigs.configs.some((item) => item.id === id)
    const next = {
      ...modelConfigs,
      configs: exists
        ? modelConfigs.configs.map((item) => (item.id === id ? savedConfig : item))
        : [...modelConfigs.configs, savedConfig],
    }
    persistModelConfigs(next)
    setSavedValidationStatus((current) => ({ ...current, [id]: "idle" }))
    setSelectedConfigId(id)
    setConfigName(savedConfig.name)
    setConfigEditorOpen(false)
    toast.success(exists ? "模型配置已更新" : "模型配置已添加")
  }

  function handleToggleActive(savedConfig: SavedModelConfig) {
    if (modelConfigs.activeConfigId === savedConfig.id) {
      persistModelConfigs({ ...modelConfigs, activeConfigId: null })
      toast.success("AI 解析已关闭")
      return
    }
    if (!isModelConfigComplete(toLocalModelConfig(savedConfig))) {
      toast.error("该配置不完整，无法启用")
      return
    }
    persistModelConfigs({ ...modelConfigs, activeConfigId: savedConfig.id })
    setConfigEditorOpen(false)
    setSelectedConfigId(null)
    toast.success(`已启用 ${savedConfig.name}`)
  }

  function handleDelete(savedConfig: SavedModelConfig) {
    if (modelConfigs.activeConfigId === savedConfig.id) {
      toast.info("请先停用当前配置再删除")
      return
    }
    const nextConfigs = modelConfigs.configs.filter((item) => item.id !== savedConfig.id)
    persistModelConfigs({
      ...modelConfigs,
      activeConfigId:
        modelConfigs.activeConfigId === savedConfig.id ? null : modelConfigs.activeConfigId,
      configs: nextConfigs,
    })
    if (selectedConfigId === savedConfig.id) {
      handleCloseConfigEditor()
    }
    toast.success("模型配置已删除")
  }

  async function handleValidate() {
    if (!draftComplete) {
      setValidationStatus("error")
      toast.error("请先填写完整的模型配置")
      return
    }

    setValidationStatus("validating")
    try {
      await validateModelConnection(draftConfig)
      setValidationStatus("success")
      toast.success("连接验证成功")
    } catch (error) {
      setValidationStatus("error")
      toast.error(`连接验证失败：${describeUserError(error, "请检查地址和密钥后重试。")}`)
    }
  }

  async function handleValidateSaved(savedConfig: SavedModelConfig) {
    if (savedValidationStatus[savedConfig.id] === "validating") {
      return
    }

    setSavedValidationStatus((current) => ({
      ...current,
      [savedConfig.id]: "validating",
    }))
    try {
      await validateModelConnection(toLocalModelConfig(savedConfig))
      setSavedValidationStatus((current) => ({
        ...current,
        [savedConfig.id]: "success",
      }))
      toast.success(`${savedConfig.name} 验证成功`)
    } catch (error) {
      setSavedValidationStatus((current) => ({
        ...current,
        [savedConfig.id]: "error",
      }))
      toast.error(
        `${savedConfig.name} 验证失败：${describeUserError(error, "请检查地址和密钥后重试。")}`,
      )
    }
  }

  function handleLearningPreferenceSave() {
    updateProfile({
      goal: learningGoal.trim() || state.profile.goal,
      dailyMinutes,
      preferredContext: preferredContext.trim() || state.profile.preferredContext,
      autoRecall,
    })
    toast.success("学习目标已更新，Agent 将重新安排后续练习")
  }

  async function handleVoicePreview() {
    if (previewingVoice || !selectedVoice) {
      return
    }
    setPreviewingVoice(true)
    try {
      await previewVoice(
        selectedVoice,
        "Welcome back. Let's continue this conversation together.",
      )
    } catch (error) {
      toast.error(describeUserError(error, "音色试听失败，请检查当前音色引擎。"))
    } finally {
      setPreviewingVoice(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <SettingsSection
        title="模型与学习策略"
        description="配置推理服务、学习目标、练习节奏和记忆找回方式。"
      >
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2">
          <form className="order-2 w-full min-w-0" onSubmit={handleSubmit}>
            <Card
              size="sm"
              className={cn("w-full min-w-0 rounded-lg", settingsCardHeightClass)}
            >
              <CardHeader className="shrink-0">
                <CardTitle className="font-serif text-lg">模型服务</CardTitle>
                <CardDescription>
                  保存多个本机配置，并选择一个用于对话、翻译和表达验证。
                </CardDescription>
                <CardAction>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-expanded={configEditorOpen}
                    onClick={configEditorOpen ? handleCloseConfigEditor : handleNewConfig}
                  >
                    {configEditorOpen ? (
                      <XIcon data-icon="inline-start" />
                    ) : (
                      <PlusIcon data-icon="inline-start" />
                    )}
                    {configEditorOpen ? "关闭编辑" : "新增配置"}
                  </Button>
                </CardAction>
                <div className="col-span-full mt-2 w-full border-b" aria-hidden="true" />
              </CardHeader>

              <CardContent className="min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-5">
                {!configEditorOpen ? (
                  <section className="flex flex-col gap-2" aria-label="已保存的 AI 配置">
                    {modelConfigs.configs.length > 0 ? (
                      modelConfigs.configs.map((savedConfig) => {
                        const active = savedConfig.id === modelConfigs.activeConfigId
                        const selected = savedConfig.id === selectedConfigId
                        const savedStatus = savedValidationStatus[savedConfig.id] ?? "idle"
                        return (
                          <div
                            key={savedConfig.id}
                            className={cn(
                              "flex min-w-0 items-center gap-2 rounded-md border bg-background p-2 transition-colors",
                              active && "border-primary/60 bg-primary/5 ring-1 ring-primary/15",
                              selected && !active && "border-foreground/30 bg-muted/40",
                            )}
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-sm px-1 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => handleSelectConfig(savedConfig)}
                              aria-pressed={selected}
                              aria-label={
                                active
                                  ? `${savedConfig.name} 使用中，需先停用再编辑`
                                  : `编辑 ${savedConfig.name}`
                              }
                            >
                              <span className="min-w-0">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="truncate text-sm font-medium">
                                    {savedConfig.name}
                                  </span>
                                  {active ? (
                                    <Badge
                                      variant="default"
                                      className="bg-[var(--success)] text-white"
                                    >
                                      <span
                                        className="size-1.5 rounded-full bg-white"
                                        aria-hidden="true"
                                      />
                                      已启用
                                    </Badge>
                                  ) : null}
                                </span>
                                <span className="mt-1 block truncate text-xs text-muted-foreground">
                                  {savedConfig.model} ·{" "}
                                  {providerItems.find(
                                    (item) => item.value === savedConfig.provider,
                                  )?.label ?? savedConfig.provider}
                                </span>
                              </span>
                              <span
                                className="flex shrink-0 items-center text-muted-foreground"
                                aria-hidden="true"
                              >
                                <PencilIcon className="size-3.5" aria-hidden="true" />
                              </span>
                            </button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              className={cn(
                                savedStatus === "success" && "text-[var(--success)]",
                                savedStatus === "error" && "text-destructive",
                              )}
                              onClick={() => handleValidateSaved(savedConfig)}
                              aria-label={
                                savedStatus === "validating"
                                  ? `正在验证 ${savedConfig.name}`
                                  : savedStatus === "success"
                                    ? `${savedConfig.name} 验证通过，重新验证`
                                    : savedStatus === "error"
                                      ? `${savedConfig.name} 验证失败，重新验证`
                                      : `验证 ${savedConfig.name}`
                              }
                              disabled={savedStatus === "validating"}
                              title={savedStatus === "validating" ? "正在验证" : "验证此配置"}
                            >
                              {savedStatus === "validating" ? (
                                <LoaderCircleIcon className="animate-spin" />
                              ) : savedStatus === "success" ? (
                                <CheckCircle2Icon />
                              ) : savedStatus === "error" ? (
                                <CircleXIcon />
                              ) : (
                                <BotIcon />
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant={active ? "default" : "ghost"}
                              className={cn(
                                active &&
                                  "bg-[var(--success)] text-white hover:bg-[var(--success)]/90",
                              )}
                              onClick={() => handleToggleActive(savedConfig)}
                              aria-label={
                                active ? `停用 ${savedConfig.name}` : `启用 ${savedConfig.name}`
                              }
                              title={active ? "停用此配置" : "启用此配置"}
                            >
                              {active ? <CheckCircle2Icon /> : <PowerIcon />}
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => handleDelete(savedConfig)}
                              aria-label={`删除 ${savedConfig.name}`}
                              disabled={active}
                              title={active ? "请先停用此配置" : "删除配置"}
                            >
                              <Trash2Icon />
                            </Button>
                          </div>
                        )
                      })
                    ) : (
                      <div className="rounded-md border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
                        暂无配置，点击“新增配置”开始设置。
                      </div>
                    )}
                  </section>
                ) : null}

                {configEditorOpen ? (
                  <FieldGroup className="duration-200 animate-in fade-in slide-in-from-top-2">
                    <Field>
                      <FieldLabel htmlFor="config-name">配置名称</FieldLabel>
                      <Input
                        id="config-name"
                        value={configName}
                        onChange={(event) => setConfigName(event.target.value)}
                        placeholder={config.model || "例如：日常对话模型"}
                      />
                    </Field>

                    <div className="grid gap-5 lg:grid-cols-2">
                      <Field>
                        <FieldLabel>提供商</FieldLabel>
                        <Select
                          items={providerItems}
                          value={config.provider}
                          onValueChange={(value) => {
                            if (value) {
                              handleProviderChange(value as ModelProvider)
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            <SelectGroup>
                              {providerItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field>
                        <FieldLabel>接口类型</FieldLabel>
                        <Select
                          items={apiTypeItems}
                          value={config.apiType}
                          onValueChange={(value) =>
                            setConfig((current) => ({
                              ...current,
                              apiType: value ?? current.apiType,
                            }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            <SelectGroup>
                              {apiTypeItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <Field data-invalid={endpointInvalid || undefined}>
                      <FieldLabel htmlFor="endpoint">接口地址</FieldLabel>
                      <Input
                        id="endpoint"
                        type="url"
                        value={config.endpoint}
                        onChange={(event) => {
                          setConfig((current) => ({ ...current, endpoint: event.target.value }))
                          setValidationStatus("idle")
                        }}
                        placeholder="https://api.example.com/v1"
                        aria-invalid={endpointInvalid || undefined}
                      />
                      <FieldDescription>
                        {config.apiType === "custom"
                          ? "自定义类型会把这里作为最终请求地址，不再拼接路径。"
                          : "填写服务根地址，系统会按接口类型拼接请求路径。"}
                      </FieldDescription>
                    </Field>

                    <div className="grid gap-5 lg:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="model">模型</FieldLabel>
                        <InputGroup>
                          <InputGroupInput
                            id="model"
                            value={config.model}
                            onChange={(event) => {
                              setConfig((current) => ({
                                ...current,
                                model: event.target.value,
                              }))
                              setValidationStatus("idle")
                            }}
                            placeholder="输入或选择模型"
                          />
                          <InputGroupAddon align="inline-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <InputGroupButton
                                    type="button"
                                    size="icon-xs"
                                    aria-label="选择常用模型"
                                    title="选择常用模型"
                                  />
                                }
                              >
                                <ChevronDownIcon />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-64">
                                <DropdownMenuGroup>
                                  <DropdownMenuLabel>常用模型</DropdownMenuLabel>
                                  <DropdownMenuRadioGroup
                                    value={
                                      commonModelNames.includes(
                                        config.model as (typeof commonModelNames)[number],
                                      )
                                        ? config.model
                                        : ""
                                    }
                                    onValueChange={(model) => {
                                      setConfig((current) => ({ ...current, model }))
                                      setValidationStatus("idle")
                                    }}
                                  >
                                    {commonModelNames.map((model) => (
                                      <DropdownMenuRadioItem key={model} value={model}>
                                        {model}
                                      </DropdownMenuRadioItem>
                                    ))}
                                  </DropdownMenuRadioGroup>
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </InputGroupAddon>
                        </InputGroup>
                        <FieldDescription>
                          可从常用模型中选择，也可直接输入服务支持的模型名称。
                        </FieldDescription>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="api-key">
                          <KeyRoundIcon className="size-4" aria-hidden="true" />
                          API 密钥
                        </FieldLabel>
                        <InputGroup>
                          <InputGroupInput
                            id="api-key"
                            type={showApiKey ? "text" : "password"}
                            value={config.apiKey}
                            onChange={(event) => {
                              setConfig((current) => ({
                                ...current,
                                apiKey: event.target.value,
                              }))
                              setValidationStatus("idle")
                            }}
                            autoComplete="off"
                            placeholder="sk-..."
                          />
                          <InputGroupAddon align="inline-end">
                            <InputGroupButton
                              type="button"
                              size="icon-xs"
                              aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                              onClick={() => setShowApiKey((current) => !current)}
                            >
                              {showApiKey ? <EyeOffIcon /> : <EyeIcon />}
                            </InputGroupButton>
                          </InputGroupAddon>
                        </InputGroup>
                      </Field>
                    </div>

                    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4 sm:flex-row sm:items-end sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">实际请求地址</p>
                        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                          {requestUrl || "等待填写接口地址"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        disabled={!draftComplete || validationStatus === "validating"}
                        onClick={handleValidate}
                      >
                        {validationStatus === "validating" ? (
                          <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
                        ) : validationStatus === "success" ? (
                          <CheckCircle2Icon data-icon="inline-start" />
                        ) : (
                          <BotIcon data-icon="inline-start" />
                        )}
                        {validationStatus === "validating" ? "验证中" : "验证"}
                      </Button>
                    </div>
                  </FieldGroup>
                ) : null}
              </CardContent>

              {configEditorOpen ? (
                <CardFooter className="shrink-0 justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {selectedConfigId
                      ? "修改后保存会更新该配置。"
                      : "填写后添加为新的配置记录。"}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button type="button" variant="ghost" onClick={handleCloseConfigEditor}>
                      <XIcon data-icon="inline-start" />
                      取消
                    </Button>
                    <Button type="submit" disabled={!draftComplete}>
                      {selectedConfigId ? (
                        <SaveIcon data-icon="inline-start" />
                      ) : (
                        <PlusIcon data-icon="inline-start" />
                      )}
                      {selectedConfigId ? "更新配置" : "添加配置"}
                    </Button>
                  </div>
                </CardFooter>
              ) : null}
            </Card>
          </form>

          <Card
            size="sm"
            className={cn("order-1 w-full min-w-0 rounded-lg", settingsCardHeightClass)}
          >
            <CardHeader className="shrink-0">
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                <TargetIcon className="size-4 text-primary" aria-hidden="true" />
                学习策略
              </CardTitle>
              <CardDescription>
                用于决定学什么、练多久，以及优先迁移到哪些场景。
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 max-w-3xl overflow-y-auto overscroll-contain">
              <div className="mb-4 flex w-full items-start justify-between gap-3 border-b pb-4">
                <div className="flex min-w-0 items-start gap-2">
                  {syncStatus === "synced" ? (
                    <CloudIcon
                      className="mt-0.5 size-4 shrink-0 text-[var(--success)]"
                      aria-hidden="true"
                    />
                  ) : (
                    <CloudOffIcon
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <div>
                    <p className="text-xs font-medium">记忆同步</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {syncDescription}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="立即同步学习记忆"
                  title="立即同步学习记忆"
                  disabled={
                    syncStatus === "connecting" ||
                    syncStatus === "syncing" ||
                    syncStatus === "local"
                  }
                  onClick={syncNow}
                >
                  {syncStatus === "connecting" || syncStatus === "syncing" ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <RefreshCwIcon />
                  )}
                </Button>
              </div>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="learning-goal">你的目标</FieldLabel>
                  <Textarea
                    id="learning-goal"
                    value={learningGoal}
                    onChange={(event) => setLearningGoal(event.target.value)}
                    placeholder="例如：能自然参加英文工作会议"
                    rows={3}
                    className="min-h-20 resize-y"
                  />
                </Field>
                <div className="grid content-start gap-4">
                  <Field>
                    <FieldLabel htmlFor="preferred-context">优先场景</FieldLabel>
                    <Input
                      id="preferred-context"
                      value={preferredContext}
                      onChange={(event) => setPreferredContext(event.target.value)}
                      placeholder="例如：生活与职场"
                    />
                  </Field>
                  <Field>
                    <div className="flex items-center justify-between gap-3">
                      <FieldLabel>每日学习时长</FieldLabel>
                      <span className="font-mono text-xs text-muted-foreground">
                        {dailyMinutes} 分钟
                      </span>
                    </div>
                    <Slider
                      value={[dailyMinutes]}
                      min={5}
                      max={60}
                      step={5}
                      onValueChange={(value) =>
                        setDailyMinutes(Array.isArray(value) ? (value[0] ?? 20) : value)
                      }
                    />
                  </Field>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>自动情景找回</FieldTitle>
                      <FieldDescription>在合适节点主动复用旧表达。</FieldDescription>
                    </FieldContent>
                    <Switch checked={autoRecall} onCheckedChange={setAutoRecall} />
                  </Field>
                </div>
              </FieldGroup>
            </CardContent>
            <CardFooter className="shrink-0 justify-end">
              <Button type="button" variant="outline" onClick={handleLearningPreferenceSave}>
                <SaveIcon data-icon="inline-start" />
                保存学习目标
              </Button>
            </CardFooter>
          </Card>
        </div>
      </SettingsSection>

      <SettingsSection
        title="对话体验"
        description="整段改写实际发送的对话 Prompt，以及转写布局、输入方式、会话判句与发音。"
      >
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
          <ConversationPromptEditor />

          <Card
            className={cn(
              "order-2 rounded-lg lg:col-start-1 lg:row-start-2",
              settingsCardHeightClass,
            )}
          >
            <CardHeader className="shrink-0">
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                <MessagesSquareIcon className="size-4 text-primary" aria-hidden="true" />
                对话方式
              </CardTitle>
              <CardDescription>调整练习转写的问答排列方式与发送快捷键。</CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 overflow-y-auto overscroll-contain">
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="transcript-layout">对话布局</FieldLabel>
                  <Select
                    items={transcriptLayoutItems}
                    value={prefs.transcriptLayout}
                    onValueChange={(value) => {
                      if (value) {
                        setPrefs((current) => ({
                          ...current,
                          transcriptLayout: value as TranscriptLayout,
                        }))
                      }
                    }}
                  >
                    <SelectTrigger id="transcript-layout" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {transcriptLayoutItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            <span className="flex min-w-0 flex-col items-start">
                              <span>{item.label}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {item.hint}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    选择问答统一靠左，或问句靠右、回答靠左的分列排版。
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="send-shortcut">发送快捷键</FieldLabel>
                  <Select
                    items={sendShortcutItems}
                    value={prefs.sendShortcut}
                    onValueChange={(value) => {
                      if (value) {
                        setPrefs((current) => ({
                          ...current,
                          sendShortcut: value as SendShortcut,
                        }))
                      }
                    }}
                  >
                    <SelectTrigger id="send-shortcut" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {sendShortcutItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            <span className="flex min-w-0 flex-col items-start">
                              <span>{item.label}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {item.hint}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    文字模式下决定 Enter 与 Shift+Enter 谁负责发送、谁负责换行。
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "order-3 rounded-lg lg:col-start-2 lg:row-start-2",
              settingsCardHeightClass,
            )}
          >
            <CardHeader className="shrink-0">
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                <AudioLinesIcon className="size-4 text-primary" aria-hidden="true" />
                系统发音
              </CardTitle>
              <CardDescription>统一设置 AI 对话与影子跟读使用的主角色音色。</CardDescription>
              <CardAction>
                <Badge variant="outline">{selectedVoice?.quality}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="min-h-0 overflow-y-auto overscroll-contain">
              <Field>
                <FieldLabel htmlFor="system-voice">AI 角色音色</FieldLabel>
                <div className="flex min-w-0 items-center gap-2">
                  <Select
                    items={ttsVoiceOptions}
                    value={selectedVoiceValue}
                    onValueChange={(value) => {
                      if (value) {
                        selectVoice(value)
                      }
                    }}
                  >
                    <SelectTrigger id="system-voice" className="min-w-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      alignItemWithTrigger={false}
                      className="max-h-[min(420px,70svh)]"
                    >
                      <SelectGroup>
                        {ttsVoiceOptions.map((voice) => (
                          <SelectItem key={voice.value} value={voice.value}>
                            <span className="flex min-w-0 flex-col items-start">
                              <span>{voice.name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {voice.quality} · {voice.language}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="试听当前 AI 角色音色"
                    title="试听当前 AI 角色音色"
                    disabled={previewingVoice}
                    onClick={handleVoicePreview}
                  >
                    {previewingVoice ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <Volume2Icon />
                    )}
                  </Button>
                </div>
                <FieldDescription>
                  更改后立即应用。影子跟读主角色沿用此音色，另一角色自动匹配不同音色。
                </FieldDescription>
              </Field>
            </CardContent>
          </Card>

          <ConversationTimingFields />
        </div>
      </SettingsSection>

      <SettingsSection
        title="语音服务"
        description="配置语音识别与语音合成的接入方式；本机服务未启动时仍可继续练习。"
      >
        <SpeechServiceCard />
      </SettingsSection>

      <SettingsSection title="账户与数据" description="管理云端账户数据和永久删除操作。">
        <AccountDataControls />
      </SettingsSection>
    </div>
  )
}

function SettingsSection({
  children,
  description,
  title,
}: {
  children: ReactNode
  description: string
  title: string
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-sm font-semibold">{title}</h1>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  )
}
